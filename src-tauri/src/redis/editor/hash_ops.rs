// SPDX-License-Identifier: MIT

use deadpool_redis::Pool;

use super::model::{HashField, HashScanResult};
use crate::utils::errors::AppError;

/// Get all fields of a hash (for small hashes).
pub async fn get_hash_all(pool: &Pool, key: &str) -> Result<Vec<HashField>, AppError> {
    let mut conn = pool.get().await?;

    let pairs: Vec<(String, String)> = redis::cmd("HGETALL")
        .arg(key)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("HGETALL failed: {e}")))?;

    Ok(pairs
        .into_iter()
        .map(|(field, value)| HashField { field, value })
        .collect())
}

/// Paginate hash fields using HSCAN (for large hashes).
pub async fn scan_hash_fields(
    pool: &Pool,
    key: &str,
    cursor: u64,
    pattern: &str,
    count: u32,
) -> Result<HashScanResult, AppError> {
    let mut conn = pool.get().await?;

    let (new_cursor, pairs): (u64, Vec<(String, String)>) = redis::cmd("HSCAN")
        .arg(key)
        .arg(cursor)
        .arg("MATCH")
        .arg(pattern)
        .arg("COUNT")
        .arg(count)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("HSCAN failed: {e}")))?;

    Ok(HashScanResult {
        cursor: new_cursor,
        fields: pairs
            .into_iter()
            .map(|(field, value)| HashField { field, value })
            .collect(),
        finished: new_cursor == 0,
    })
}

/// Set a single hash field.
pub async fn set_hash_field(
    pool: &Pool,
    key: &str,
    field: &str,
    value: &str,
) -> Result<bool, AppError> {
    let mut conn = pool.get().await?;

    let created: bool = redis::cmd("HSET")
        .arg(key)
        .arg(field)
        .arg(value)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("HSET failed: {e}")))?;

    Ok(created)
}

/// Delete one or more hash fields.
pub async fn delete_hash_fields(
    pool: &Pool,
    key: &str,
    fields: &[String],
) -> Result<u64, AppError> {
    if fields.is_empty() {
        return Ok(0);
    }

    let mut conn = pool.get().await?;

    let count: u64 = redis::cmd("HDEL")
        .arg(key)
        .arg(fields)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("HDEL failed: {e}")))?;

    Ok(count)
}
