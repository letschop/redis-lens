// SPDX-License-Identifier: MIT

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use deadpool_redis::{Config, Pool, Runtime};
use tokio::sync::RwLock;
use uuid::Uuid;

use super::model::{ConnectionProfile, ConnectionState, ServerInfoSummary};
use super::uri::build_connection_url;
use crate::utils::errors::AppError;

/// Holds all active connections, keyed by profile ID.
pub struct ConnectionManager {
    connections: Arc<RwLock<HashMap<Uuid, ActiveConnection>>>,
}

/// A single active connection with its pool and metadata.
struct ActiveConnection {
    #[allow(dead_code)]
    pub profile: ConnectionProfile,
    pub pool: Pool,
    pub state: ConnectionState,
    #[allow(dead_code)]
    pub connected_at: chrono::DateTime<chrono::Utc>,
}

impl Default for ConnectionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl ConnectionManager {
    /// Create a new, empty connection manager.
    pub fn new() -> Self {
        Self {
            connections: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Get the connection state for a given profile.
    pub async fn get_state(&self, id: &Uuid) -> ConnectionState {
        let conns = self.connections.read().await;
        conns
            .get(id)
            .map_or(ConnectionState::Disconnected, |c| c.state.clone())
    }

    /// Get a pool handle for executing commands.
    pub async fn get_pool(&self, id: &Uuid) -> Result<Pool, AppError> {
        let conns = self.connections.read().await;
        conns
            .get(id)
            .map(|c| c.pool.clone())
            .ok_or_else(|| AppError::Connection("Not connected".into()))
    }

    /// Establish a connection for the given profile.
    ///
    /// Creates a deadpool-redis pool, verifies connectivity with PING,
    /// retrieves server INFO, and stores the active connection.
    pub async fn connect(&self, profile: ConnectionProfile) -> Result<ServerInfoSummary, AppError> {
        let id = profile.id;

        // Disconnect existing connection for this profile if any
        self.disconnect(&id).await;

        let pool = create_pool(&profile)?;

        // Verify the connection works by sending PING
        let mut conn = pool.get().await.map_err(|e| {
            AppError::Connection(format!("Failed to get connection from pool: {e}"))
        })?;

        let pong: String = redis::cmd("PING")
            .query_async(&mut conn)
            .await
            .map_err(|e| AppError::Connection(format!("PING failed: {e}")))?;

        if pong != "PONG" {
            return Err(AppError::Connection(format!(
                "Unexpected PING response: {pong}"
            )));
        }

        // Fetch server info
        let info_raw: String = redis::cmd("INFO")
            .arg("server")
            .query_async(&mut conn)
            .await
            .map_err(|e| AppError::Redis(format!("INFO command failed: {e}")))?;

        let server_info = parse_server_info(&info_raw);

        // Get DB size
        let dbsize: u64 = redis::cmd("DBSIZE")
            .query_async(&mut conn)
            .await
            .unwrap_or(0);

        let summary = ServerInfoSummary {
            redis_version: server_info
                .get("redis_version")
                .cloned()
                .unwrap_or_else(|| "unknown".into()),
            mode: server_info
                .get("redis_mode")
                .cloned()
                .unwrap_or_else(|| "standalone".into()),
            os: server_info
                .get("os")
                .cloned()
                .unwrap_or_else(|| "unknown".into()),
            uptime_in_seconds: server_info
                .get("uptime_in_seconds")
                .and_then(|v| v.parse().ok())
                .unwrap_or(0),
            connected_clients: 0, // Will be enriched from INFO clients
            used_memory_human: "unknown".into(),
            db_size: dbsize,
        };

        // Fetch memory + client info
        let info_all: String = redis::cmd("INFO")
            .arg("all")
            .query_async(&mut conn)
            .await
            .unwrap_or_default();
        let all_info = parse_server_info(&info_all);

        let summary = ServerInfoSummary {
            connected_clients: all_info
                .get("connected_clients")
                .and_then(|v| v.parse().ok())
                .unwrap_or(0),
            used_memory_human: all_info
                .get("used_memory_human")
                .cloned()
                .unwrap_or_else(|| "unknown".into()),
            ..summary
        };

        let state = ConnectionState::Connected {
            server_info: summary.clone(),
        };

        let active = ActiveConnection {
            profile,
            pool,
            state,
            connected_at: chrono::Utc::now(),
        };

        {
            let mut conns = self.connections.write().await;
            conns.insert(id, active);
        }

        tracing::info!(id = %id, "Connection established");
        Ok(summary)
    }

    /// Get the connection URL for a connected profile (used by `PubSub` for dedicated connections).
    pub async fn get_connection_url(&self, id: &Uuid) -> Result<String, AppError> {
        let conns = self.connections.read().await;
        conns
            .get(id)
            .map(|c| build_connection_url(&c.profile))
            .ok_or_else(|| AppError::Connection("Not connected".into()))
    }

    /// Disconnect a connection, removing it from the manager.
    pub async fn disconnect(&self, id: &Uuid) {
        let mut conns = self.connections.write().await;
        if conns.remove(id).is_some() {
            tracing::info!(id = %id, "Connection disconnected");
        }
    }

    /// Disconnect all active connections.
    pub async fn disconnect_all(&self) {
        let mut conns = self.connections.write().await;
        let count = conns.len();
        conns.clear();
        if count > 0 {
            tracing::info!(count = count, "All connections disconnected");
        }
    }

    /// List all active connection IDs and their states.
    pub async fn list_active(&self) -> Vec<(Uuid, ConnectionState)> {
        let conns = self.connections.read().await;
        conns.iter().map(|(id, c)| (*id, c.state.clone())).collect()
    }
}

/// Create a deadpool-redis pool from a connection profile.
fn create_pool(profile: &ConnectionProfile) -> Result<Pool, AppError> {
    let url = build_connection_url(profile);

    let cfg = Config::from_url(url);

    let pool = cfg
        .builder()
        .map_err(|e| AppError::Pool(format!("Failed to create pool builder: {e}")))?
        .max_size(profile.pool.max_size as usize)
        .wait_timeout(Some(Duration::from_secs(
            profile.pool.connection_timeout_secs,
        )))
        .create_timeout(Some(Duration::from_secs(profile.timeout.connect_secs)))
        .recycle_timeout(Some(Duration::from_secs(5)))
        .runtime(Runtime::Tokio1)
        .build()
        .map_err(|e| AppError::Pool(format!("Failed to build pool: {e}")))?;

    Ok(pool)
}

/// Parse Redis INFO output into a key-value map.
///
/// INFO output format is:
/// ```text
/// # Section
/// key:value
/// key:value
/// ```
fn parse_server_info(raw: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((key, value)) = line.split_once(':') {
            map.insert(key.to_string(), value.to_string());
        }
    }
    map
}

/// Test a connection by doing a quick PING, without storing it in the manager.
pub async fn test_connection(profile: &ConnectionProfile) -> Result<ServerInfoSummary, AppError> {
    let url = build_connection_url(profile);

    let client = redis::Client::open(url)
        .map_err(|e| AppError::Connection(format!("Failed to create client: {e}")))?;

    let timeout = Duration::from_secs(profile.timeout.connect_secs);

    let mut conn = tokio::time::timeout(timeout, client.get_multiplexed_async_connection())
        .await
        .map_err(|_| AppError::Timeout("Connection timed out".into()))?
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("NOAUTH") || msg.contains("WRONGPASS") || msg.contains("ERR AUTH") {
                AppError::Connection(format!("Authentication failed: {msg}"))
            } else if msg.contains("Connection refused") {
                AppError::Connection(format!("Connection refused: {msg}"))
            } else {
                AppError::Connection(format!("Connection failed: {msg}"))
            }
        })?;

    // PING
    let _pong: String = redis::cmd("PING")
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Connection(format!("PING failed: {e}")))?;

    // Fetch server info
    let info_raw: String = redis::cmd("INFO")
        .arg("all")
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("INFO command failed: {e}")))?;

    let info = parse_server_info(&info_raw);

    let dbsize: u64 = redis::cmd("DBSIZE")
        .query_async(&mut conn)
        .await
        .unwrap_or(0);

    Ok(ServerInfoSummary {
        redis_version: info
            .get("redis_version")
            .cloned()
            .unwrap_or_else(|| "unknown".into()),
        mode: info
            .get("redis_mode")
            .cloned()
            .unwrap_or_else(|| "standalone".into()),
        os: info.get("os").cloned().unwrap_or_else(|| "unknown".into()),
        uptime_in_seconds: info
            .get("uptime_in_seconds")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0),
        connected_clients: info
            .get("connected_clients")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0),
        used_memory_human: info
            .get("used_memory_human")
            .cloned()
            .unwrap_or_else(|| "unknown".into()),
        db_size: dbsize,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_server_info_basic() {
        let raw = "# Server\r\nredis_version:7.2.0\r\nredis_mode:standalone\r\nos:Linux\r\n";
        let info = parse_server_info(raw);
        assert_eq!(info.get("redis_version").unwrap(), "7.2.0");
        assert_eq!(info.get("redis_mode").unwrap(), "standalone");
        assert_eq!(info.get("os").unwrap(), "Linux");
    }

    #[test]
    fn test_parse_server_info_skips_comments_and_empty() {
        let raw = "# Memory\n\nused_memory:1024\n# Stats\ntotal_commands:42\n";
        let info = parse_server_info(raw);
        assert_eq!(info.len(), 2);
        assert_eq!(info.get("used_memory").unwrap(), "1024");
        assert_eq!(info.get("total_commands").unwrap(), "42");
    }

    #[test]
    fn test_parse_server_info_handles_colons_in_values() {
        let raw = "os:Linux 5.15.0-1:custom\n";
        let info = parse_server_info(raw);
        assert_eq!(info.get("os").unwrap(), "Linux 5.15.0-1:custom");
    }

    #[test]
    fn test_create_pool_from_profile() {
        let profile = ConnectionProfile::new_standalone("test".into(), "localhost".into(), 6379);
        let pool = create_pool(&profile);
        assert!(pool.is_ok());
    }

    #[tokio::test]
    async fn test_connection_manager_state_default_disconnected() {
        let mgr = ConnectionManager::new();
        let state = mgr.get_state(&Uuid::new_v4()).await;
        matches!(state, ConnectionState::Disconnected);
    }

    #[tokio::test]
    async fn test_connection_manager_list_active_empty() {
        let mgr = ConnectionManager::new();
        let active = mgr.list_active().await;
        assert!(active.is_empty());
    }
}
