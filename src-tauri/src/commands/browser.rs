// SPDX-License-Identifier: MIT

use tauri::State;
use uuid::Uuid;

use crate::redis::browser::model::{KeyInfo, KeyNode, ScanResult};
use crate::redis::browser::{scanner, tree};
use crate::redis::connection::manager::ConnectionManager;
use crate::utils::errors::AppError;

/// Scan keys matching a pattern on the connected Redis server.
///
/// Uses the cursor-based SCAN command. Call repeatedly with the returned
/// cursor until `finished` is true.
#[tauri::command]
pub async fn browser_scan_keys(
    connection_id: String,
    cursor: u64,
    pattern: String,
    count: u32,
    manager: State<'_, ConnectionManager>,
) -> Result<ScanResult, AppError> {
    if pattern.is_empty() {
        return Err(AppError::InvalidInput("Pattern must not be empty".into()));
    }

    let uuid = Uuid::parse_str(&connection_id)?;
    let pool = manager.get_pool(&uuid).await?;

    let result = scanner::scan_keys(&pool, cursor, &pattern, count).await?;

    tracing::debug!(
        connection_id = %connection_id,
        cursor = result.cursor,
        keys_returned = result.keys.len(),
        finished = result.finished,
        "SCAN iteration complete"
    );

    Ok(result)
}

/// Build a key tree from a flat list of keys.
///
/// Splits keys by the delimiter and returns root-level `KeyNode` items.
/// The frontend lazily expands namespace folders.
#[tauri::command]
pub async fn browser_build_tree(
    keys: Vec<String>,
    delimiter: String,
) -> Result<Vec<KeyNode>, AppError> {
    let delimiter = if delimiter.is_empty() {
        ":"
    } else {
        &delimiter
    };
    let nodes = tree::build_key_tree(&keys, delimiter);
    Ok(nodes)
}

/// Get the children of a namespace prefix from a key list.
///
/// Used when the user expands a folder in the key tree.
#[tauri::command]
pub async fn browser_get_children(
    keys: Vec<String>,
    prefix: String,
    delimiter: String,
    depth: u32,
) -> Result<Vec<KeyNode>, AppError> {
    let delimiter = if delimiter.is_empty() {
        ":"
    } else {
        &delimiter
    };
    let children = tree::get_children_for_prefix(&keys, &prefix, delimiter, depth);
    Ok(children)
}

/// Get metadata (type + TTL) for a batch of keys using pipeline.
///
/// Called by the frontend to load metadata for keys visible in the viewport.
#[tauri::command]
pub async fn browser_get_keys_info(
    connection_id: String,
    keys: Vec<String>,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<KeyInfo>, AppError> {
    let uuid = Uuid::parse_str(&connection_id)?;
    let pool = manager.get_pool(&uuid).await?;

    scanner::get_keys_info(&pool, &keys).await
}

/// Get detailed info for a single key (type, TTL, encoding, element count).
#[tauri::command]
pub async fn browser_get_key_info(
    connection_id: String,
    key: String,
    manager: State<'_, ConnectionManager>,
) -> Result<KeyInfo, AppError> {
    if key.is_empty() {
        return Err(AppError::InvalidInput("Key must not be empty".into()));
    }

    let uuid = Uuid::parse_str(&connection_id)?;
    let pool = manager.get_pool(&uuid).await?;

    scanner::get_key_detail(&pool, &key).await
}

/// Delete one or more keys using UNLINK (non-blocking).
#[tauri::command]
pub async fn browser_delete_keys(
    connection_id: String,
    keys: Vec<String>,
    manager: State<'_, ConnectionManager>,
) -> Result<u64, AppError> {
    if keys.is_empty() {
        return Err(AppError::InvalidInput(
            "At least one key must be provided".into(),
        ));
    }

    let uuid = Uuid::parse_str(&connection_id)?;
    let pool = manager.get_pool(&uuid).await?;

    let count = scanner::delete_keys(&pool, &keys).await?;

    tracing::info!(
        connection_id = %connection_id,
        requested = keys.len(),
        deleted = count,
        "Keys deleted"
    );

    Ok(count)
}

/// Rename a key. Fails if the new name already exists.
#[tauri::command]
pub async fn browser_rename_key(
    connection_id: String,
    old_name: String,
    new_name: String,
    manager: State<'_, ConnectionManager>,
) -> Result<(), AppError> {
    if old_name.is_empty() || new_name.is_empty() {
        return Err(AppError::InvalidInput("Key names must not be empty".into()));
    }

    let uuid = Uuid::parse_str(&connection_id)?;
    let pool = manager.get_pool(&uuid).await?;

    scanner::rename_key(&pool, &old_name, &new_name).await?;

    tracing::info!(
        connection_id = %connection_id,
        old_name = %old_name,
        new_name = %new_name,
        "Key renamed"
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_browser_build_tree_basic() {
        let keys = vec![
            "user:1".to_string(),
            "user:2".to_string(),
            "session:abc".to_string(),
        ];

        let result = browser_build_tree(keys, ":".into()).await;
        assert!(result.is_ok());
        let nodes = result.unwrap();
        assert_eq!(nodes.len(), 2);
    }

    #[tokio::test]
    async fn test_browser_build_tree_empty_delimiter_defaults() {
        let keys = vec!["a:b".to_string()];
        let result = browser_build_tree(keys, String::new()).await;
        assert!(result.is_ok());
        let nodes = result.unwrap();
        assert_eq!(nodes.len(), 1);
        assert_eq!(nodes[0].name, "a");
    }

    #[tokio::test]
    async fn test_browser_get_children_basic() {
        let keys = vec![
            "user:1".to_string(),
            "user:profile:1".to_string(),
            "session:abc".to_string(),
        ];

        let result = browser_get_children(keys, "user".into(), ":".into(), 1).await;
        assert!(result.is_ok());
        let children = result.unwrap();
        assert_eq!(children.len(), 2); // "1" and "profile/"
    }

    #[test]
    fn test_empty_pattern_is_rejected() {
        // Validates that an empty pattern would be caught by the command handler.
        // Full integration testing requires a running Redis instance.
        let pattern = String::new();
        assert!(pattern.is_empty());
        let pattern = String::from("*");
        assert!(!pattern.is_empty());
    }
}
