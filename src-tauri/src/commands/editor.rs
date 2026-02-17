// SPDX-License-Identifier: MIT

use tauri::State;
use uuid::Uuid;

use crate::redis::connection::manager::ConnectionManager;
use crate::redis::editor::model::{
    HashField, HashScanResult, ListElement, SetScanResult, StringValue, TtlInfo,
};
use crate::redis::editor::{hash_ops, list_ops, set_ops, string_ops, ttl_ops};
use crate::utils::errors::AppError;

// ---------------------------------------------------------------------------
// String commands
// ---------------------------------------------------------------------------

/// Get a string value (auto-detects binary content and returns base64 if needed).
#[tauri::command]
pub async fn editor_get_string_value(
    connection_id: String,
    key: String,
    manager: State<'_, ConnectionManager>,
) -> Result<StringValue, AppError> {
    validate_key(&key)?;
    let pool = resolve_pool(&connection_id, &manager).await?;
    let value = string_ops::get_string_value(&pool, &key).await?;
    tracing::debug!(connection_id = %connection_id, key = %key, binary = value.is_binary, "String value loaded");
    Ok(value)
}

/// Set a string value, optionally with a TTL.
#[tauri::command]
pub async fn editor_set_string_value(
    connection_id: String,
    key: String,
    value: String,
    ttl: Option<i64>,
    manager: State<'_, ConnectionManager>,
) -> Result<(), AppError> {
    validate_key(&key)?;
    let pool = resolve_pool(&connection_id, &manager).await?;
    string_ops::set_string_value(&pool, &key, &value, ttl).await?;
    tracing::info!(connection_id = %connection_id, key = %key, "String value saved");
    Ok(())
}

/// Get a substring of a string value (for large strings).
#[tauri::command]
pub async fn editor_get_string_range(
    connection_id: String,
    key: String,
    start: i64,
    end: i64,
    manager: State<'_, ConnectionManager>,
) -> Result<String, AppError> {
    validate_key(&key)?;
    let pool = resolve_pool(&connection_id, &manager).await?;
    string_ops::get_string_range(&pool, &key, start, end).await
}

// ---------------------------------------------------------------------------
// Hash commands
// ---------------------------------------------------------------------------

/// Get all fields of a hash (suitable for small hashes).
#[tauri::command]
pub async fn editor_get_hash_all(
    connection_id: String,
    key: String,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<HashField>, AppError> {
    validate_key(&key)?;
    let pool = resolve_pool(&connection_id, &manager).await?;
    hash_ops::get_hash_all(&pool, &key).await
}

/// Paginate hash fields with HSCAN (for large hashes).
#[tauri::command]
pub async fn editor_scan_hash_fields(
    connection_id: String,
    key: String,
    cursor: u64,
    pattern: String,
    count: u32,
    manager: State<'_, ConnectionManager>,
) -> Result<HashScanResult, AppError> {
    validate_key(&key)?;
    let pool = resolve_pool(&connection_id, &manager).await?;
    hash_ops::scan_hash_fields(&pool, &key, cursor, &pattern, count).await
}

/// Set a single hash field.
#[tauri::command]
pub async fn editor_set_hash_field(
    connection_id: String,
    key: String,
    field: String,
    value: String,
    manager: State<'_, ConnectionManager>,
) -> Result<bool, AppError> {
    validate_key(&key)?;
    let pool = resolve_pool(&connection_id, &manager).await?;
    let created = hash_ops::set_hash_field(&pool, &key, &field, &value).await?;
    tracing::info!(connection_id = %connection_id, key = %key, field = %field, "Hash field set");
    Ok(created)
}

/// Delete one or more hash fields.
#[tauri::command]
pub async fn editor_delete_hash_fields(
    connection_id: String,
    key: String,
    fields: Vec<String>,
    manager: State<'_, ConnectionManager>,
) -> Result<u64, AppError> {
    validate_key(&key)?;
    let pool = resolve_pool(&connection_id, &manager).await?;
    let count = hash_ops::delete_hash_fields(&pool, &key, &fields).await?;
    tracing::info!(connection_id = %connection_id, key = %key, deleted = count, "Hash fields deleted");
    Ok(count)
}

// ---------------------------------------------------------------------------
// List commands
// ---------------------------------------------------------------------------

/// Get a range of list elements.
#[tauri::command]
pub async fn editor_get_list_range(
    connection_id: String,
    key: String,
    start: i64,
    stop: i64,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<ListElement>, AppError> {
    validate_key(&key)?;
    let pool = resolve_pool(&connection_id, &manager).await?;
    list_ops::get_list_range(&pool, &key, start, stop).await
}

/// Push an element to the head or tail of a list.
#[tauri::command]
pub async fn editor_push_list_element(
    connection_id: String,
    key: String,
    value: String,
    head: bool,
    manager: State<'_, ConnectionManager>,
) -> Result<u64, AppError> {
    validate_key(&key)?;
    let pool = resolve_pool(&connection_id, &manager).await?;
    let new_len = list_ops::push_list_element(&pool, &key, &value, head).await?;
    tracing::info!(connection_id = %connection_id, key = %key, head = head, "List element pushed");
    Ok(new_len)
}

/// Set the value of a list element at a specific index.
#[tauri::command]
pub async fn editor_set_list_element(
    connection_id: String,
    key: String,
    index: i64,
    value: String,
    manager: State<'_, ConnectionManager>,
) -> Result<(), AppError> {
    validate_key(&key)?;
    let pool = resolve_pool(&connection_id, &manager).await?;
    list_ops::set_list_element(&pool, &key, index, &value).await?;
    tracing::info!(connection_id = %connection_id, key = %key, index = index, "List element set");
    Ok(())
}

/// Remove elements from a list by value.
#[tauri::command]
pub async fn editor_remove_list_element(
    connection_id: String,
    key: String,
    count: i64,
    value: String,
    manager: State<'_, ConnectionManager>,
) -> Result<u64, AppError> {
    validate_key(&key)?;
    let pool = resolve_pool(&connection_id, &manager).await?;
    let removed = list_ops::remove_list_element(&pool, &key, count, &value).await?;
    tracing::info!(connection_id = %connection_id, key = %key, removed = removed, "List elements removed");
    Ok(removed)
}

// ---------------------------------------------------------------------------
// Set commands
// ---------------------------------------------------------------------------

/// Get all members of a set (for small sets).
#[tauri::command]
pub async fn editor_get_set_members(
    connection_id: String,
    key: String,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<String>, AppError> {
    validate_key(&key)?;
    let pool = resolve_pool(&connection_id, &manager).await?;
    set_ops::get_set_members(&pool, &key).await
}

/// Scan set members using SSCAN (for large sets).
#[tauri::command]
pub async fn editor_scan_set_members(
    connection_id: String,
    key: String,
    cursor: u64,
    pattern: String,
    count: u32,
    manager: State<'_, ConnectionManager>,
) -> Result<SetScanResult, AppError> {
    validate_key(&key)?;
    let pool = resolve_pool(&connection_id, &manager).await?;
    set_ops::scan_set_members(&pool, &key, cursor, &pattern, count).await
}

/// Add one or more members to a set.
#[tauri::command]
pub async fn editor_add_set_members(
    connection_id: String,
    key: String,
    members: Vec<String>,
    manager: State<'_, ConnectionManager>,
) -> Result<u64, AppError> {
    validate_key(&key)?;
    let pool = resolve_pool(&connection_id, &manager).await?;
    let added = set_ops::add_set_members(&pool, &key, &members).await?;
    tracing::info!(connection_id = %connection_id, key = %key, added = added, "Set members added");
    Ok(added)
}

/// Remove one or more members from a set.
#[tauri::command]
pub async fn editor_remove_set_members(
    connection_id: String,
    key: String,
    members: Vec<String>,
    manager: State<'_, ConnectionManager>,
) -> Result<u64, AppError> {
    validate_key(&key)?;
    let pool = resolve_pool(&connection_id, &manager).await?;
    let removed = set_ops::remove_set_members(&pool, &key, &members).await?;
    tracing::info!(connection_id = %connection_id, key = %key, removed = removed, "Set members removed");
    Ok(removed)
}

// ---------------------------------------------------------------------------
// TTL commands
// ---------------------------------------------------------------------------

/// Get TTL information for a key.
#[tauri::command]
pub async fn editor_get_ttl(
    connection_id: String,
    key: String,
    manager: State<'_, ConnectionManager>,
) -> Result<TtlInfo, AppError> {
    validate_key(&key)?;
    let pool = resolve_pool(&connection_id, &manager).await?;
    ttl_ops::get_ttl(&pool, &key).await
}

/// Set TTL on a key (in seconds).
#[tauri::command]
pub async fn editor_set_ttl(
    connection_id: String,
    key: String,
    seconds: i64,
    manager: State<'_, ConnectionManager>,
) -> Result<bool, AppError> {
    validate_key(&key)?;
    if seconds <= 0 {
        return Err(AppError::InvalidInput(
            "TTL must be a positive number of seconds".into(),
        ));
    }
    let pool = resolve_pool(&connection_id, &manager).await?;
    let result = ttl_ops::set_key_ttl(&pool, &key, seconds).await?;
    tracing::info!(connection_id = %connection_id, key = %key, seconds = seconds, "TTL set");
    Ok(result)
}

/// Remove TTL from a key, making it persistent.
#[tauri::command]
pub async fn editor_persist_key(
    connection_id: String,
    key: String,
    manager: State<'_, ConnectionManager>,
) -> Result<bool, AppError> {
    validate_key(&key)?;
    let pool = resolve_pool(&connection_id, &manager).await?;
    let result = ttl_ops::persist_key(&pool, &key).await?;
    tracing::info!(connection_id = %connection_id, key = %key, "Key persisted (TTL removed)");
    Ok(result)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn validate_key(key: &str) -> Result<(), AppError> {
    if key.is_empty() {
        return Err(AppError::InvalidInput("Key must not be empty".into()));
    }
    Ok(())
}

async fn resolve_pool(
    connection_id: &str,
    manager: &State<'_, ConnectionManager>,
) -> Result<deadpool_redis::Pool, AppError> {
    let uuid = Uuid::parse_str(connection_id)?;
    manager.get_pool(&uuid).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_key_empty_is_rejected() {
        assert!(validate_key("").is_err());
    }

    #[test]
    fn test_validate_key_normal_is_ok() {
        assert!(validate_key("user:1").is_ok());
    }
}
