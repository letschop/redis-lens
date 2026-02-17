// SPDX-License-Identifier: MIT

use std::path::PathBuf;

use uuid::Uuid;

use crate::redis::connection::model::ConnectionProfile;
use crate::utils::errors::AppError;

/// Resolve the path to the connections JSON file.
fn profiles_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    use tauri::Manager;
    let dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Internal(format!("Failed to resolve app data dir: {e}")))?;
    Ok(dir.join("connections.json"))
}

/// Load all saved connection profiles from disk.
pub async fn load_all_profiles(
    app_handle: &tauri::AppHandle,
) -> Result<Vec<ConnectionProfile>, AppError> {
    let path = profiles_path(app_handle)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let data = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to read profiles: {e}")))?;
    let profiles: Vec<ConnectionProfile> = serde_json::from_str(&data)
        .map_err(|e| AppError::Internal(format!("Failed to parse profiles: {e}")))?;
    Ok(profiles)
}

/// Load a single profile by its ID.
pub async fn load_profile(
    app_handle: &tauri::AppHandle,
    id: &Uuid,
) -> Result<Option<ConnectionProfile>, AppError> {
    let profiles = load_all_profiles(app_handle).await?;
    Ok(profiles.into_iter().find(|p| &p.id == id))
}

/// Save (insert or update) a connection profile.
pub async fn save_profile(
    app_handle: &tauri::AppHandle,
    profile: &ConnectionProfile,
) -> Result<(), AppError> {
    let mut profiles = load_all_profiles(app_handle).await?;

    // Upsert: replace existing or append new
    if let Some(existing) = profiles.iter_mut().find(|p| p.id == profile.id) {
        *existing = profile.clone();
    } else {
        profiles.push(profile.clone());
    }

    write_profiles(app_handle, &profiles).await
}

/// Delete a connection profile by ID.
pub async fn delete_profile(app_handle: &tauri::AppHandle, id: &Uuid) -> Result<(), AppError> {
    let mut profiles = load_all_profiles(app_handle).await?;
    let original_len = profiles.len();
    profiles.retain(|p| &p.id != id);

    if profiles.len() == original_len {
        return Err(AppError::NotFound(format!(
            "Connection profile {id} not found"
        )));
    }

    write_profiles(app_handle, &profiles).await
}

/// Write profiles to disk, creating the directory if needed.
async fn write_profiles(
    app_handle: &tauri::AppHandle,
    profiles: &[ConnectionProfile],
) -> Result<(), AppError> {
    let path = profiles_path(app_handle)?;

    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to create config dir: {e}")))?;
    }

    let data = serde_json::to_string_pretty(profiles)
        .map_err(|e| AppError::Internal(format!("Failed to serialize profiles: {e}")))?;

    tokio::fs::write(&path, data)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to write profiles: {e}")))?;

    Ok(())
}
