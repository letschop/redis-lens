// SPDX-License-Identifier: MIT

use tauri::State;
use uuid::Uuid;

use crate::config::profile_store;
use crate::redis::connection::manager::{self, ConnectionManager};
use crate::redis::connection::model::{ConnectionProfile, ConnectionState, ServerInfoSummary};
use crate::redis::connection::uri::parse_redis_uri;
use crate::utils::errors::AppError;

/// Test a Redis connection without persisting it.
///
/// Connects, sends PING, retrieves server INFO, then disconnects.
#[tauri::command]
pub async fn connection_test(profile: ConnectionProfile) -> Result<ServerInfoSummary, AppError> {
    // Validate inputs
    if profile.host.is_empty() {
        return Err(AppError::InvalidInput("Host must not be empty".into()));
    }
    if profile.port == 0 {
        return Err(AppError::InvalidInput("Port must be greater than 0".into()));
    }
    if profile.database > 15 {
        return Err(AppError::InvalidInput(
            "Database must be between 0 and 15".into(),
        ));
    }

    tracing::info!(
        host = %profile.host,
        port = %profile.port,
        tls = %profile.tls.enabled,
        "Testing connection"
    );

    manager::test_connection(&profile).await
}

/// Parse a Redis URI and return extracted connection parameters.
#[tauri::command]
pub async fn connection_parse_uri(uri: String) -> Result<ConnectionProfile, AppError> {
    let partial = parse_redis_uri(&uri)?;

    let mut profile = ConnectionProfile::new_standalone(String::new(), partial.host, partial.port);
    profile.username = partial.username;
    profile.password = partial.password;
    profile.database = partial.database;
    profile.tls.enabled = partial.tls_enabled;

    Ok(profile)
}

/// Save or update a connection profile to disk.
#[tauri::command]
pub async fn connection_save(
    profile: ConnectionProfile,
    app_handle: tauri::AppHandle,
) -> Result<ConnectionProfile, AppError> {
    if profile.name.is_empty() {
        return Err(AppError::InvalidInput(
            "Connection name must not be empty".into(),
        ));
    }
    if profile.host.is_empty() {
        return Err(AppError::InvalidInput("Host must not be empty".into()));
    }

    let mut profile = profile;
    profile.updated_at = chrono::Utc::now();

    profile_store::save_profile(&app_handle, &profile).await?;

    tracing::info!(id = %profile.id, name = %profile.name, "Connection profile saved");
    Ok(profile)
}

/// List all saved connection profiles.
#[tauri::command]
pub async fn connection_list(
    app_handle: tauri::AppHandle,
) -> Result<Vec<ConnectionProfile>, AppError> {
    profile_store::load_all_profiles(&app_handle).await
}

/// Delete a connection profile.
#[tauri::command]
pub async fn connection_delete(
    id: String,
    manager: State<'_, ConnectionManager>,
    app_handle: tauri::AppHandle,
) -> Result<(), AppError> {
    let uuid = Uuid::parse_str(&id)?;

    // Disconnect if active
    manager.disconnect(&uuid).await;

    // Delete from disk
    profile_store::delete_profile(&app_handle, &uuid).await?;

    tracing::info!(id = %uuid, "Connection profile deleted");
    Ok(())
}

/// Connect to a Redis server using a saved profile.
#[tauri::command]
pub async fn connection_connect(
    id: String,
    manager: State<'_, ConnectionManager>,
    app_handle: tauri::AppHandle,
) -> Result<ServerInfoSummary, AppError> {
    let uuid = Uuid::parse_str(&id)?;

    let profile = profile_store::load_profile(&app_handle, &uuid)
        .await?
        .ok_or_else(|| AppError::NotFound("Connection profile not found".into()))?;

    tracing::info!(id = %uuid, name = %profile.name, "Connecting");

    manager.connect(profile).await
}

/// Disconnect from a Redis server.
#[tauri::command]
pub async fn connection_disconnect(
    id: String,
    manager: State<'_, ConnectionManager>,
) -> Result<(), AppError> {
    let uuid = Uuid::parse_str(&id)?;
    manager.disconnect(&uuid).await;
    Ok(())
}

/// Get the connection state for a profile.
#[tauri::command]
pub async fn connection_state(
    id: String,
    manager: State<'_, ConnectionManager>,
) -> Result<ConnectionState, AppError> {
    let uuid = Uuid::parse_str(&id)?;
    Ok(manager.get_state(&uuid).await)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::redis::connection::model::ConnectionProfile;

    #[tokio::test]
    async fn test_connection_test_validates_empty_host() {
        let profile = ConnectionProfile::new_standalone(String::new(), String::new(), 6379);
        let result = connection_test(profile).await;
        assert!(result.is_err());
        if let Err(AppError::InvalidInput(msg)) = result {
            assert!(msg.contains("Host"));
        } else {
            panic!("Expected InvalidInput error");
        }
    }

    #[tokio::test]
    async fn test_connection_test_validates_zero_port() {
        let profile = ConnectionProfile::new_standalone("test".into(), "localhost".into(), 0);
        let result = connection_test(profile).await;
        assert!(result.is_err());
        if let Err(AppError::InvalidInput(msg)) = result {
            assert!(msg.contains("Port"));
        } else {
            panic!("Expected InvalidInput error");
        }
    }

    #[tokio::test]
    async fn test_connection_test_validates_database_range() {
        let mut profile =
            ConnectionProfile::new_standalone("test".into(), "localhost".into(), 6379);
        profile.database = 16;
        let result = connection_test(profile).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_connection_parse_uri_basic() {
        let result = connection_parse_uri("redis://myhost:6380/2".into()).await;
        assert!(result.is_ok());
        let profile = result.unwrap();
        assert_eq!(profile.host, "myhost");
        assert_eq!(profile.port, 6380);
        assert_eq!(profile.database, 2);
        assert!(!profile.tls.enabled);
    }

    #[tokio::test]
    async fn test_connection_parse_uri_tls() {
        let result = connection_parse_uri("rediss://secure.host:6380".into()).await;
        assert!(result.is_ok());
        let profile = result.unwrap();
        assert!(profile.tls.enabled);
    }

    #[tokio::test]
    async fn test_connection_parse_uri_invalid() {
        let result = connection_parse_uri("not-a-uri".into()).await;
        assert!(result.is_err());
    }
}
