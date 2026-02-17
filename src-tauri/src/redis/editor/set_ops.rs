// SPDX-License-Identifier: MIT

use deadpool_redis::Pool;

use super::model::SetScanResult;
use crate::utils::errors::AppError;

/// Get all members of a set (for small sets).
pub async fn get_set_members(pool: &Pool, key: &str) -> Result<Vec<String>, AppError> {
    let mut conn = pool.get().await?;

    let members: Vec<String> = redis::cmd("SMEMBERS")
        .arg(key)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("SMEMBERS failed: {e}")))?;

    Ok(members)
}

/// Scan set members using SSCAN (for large sets).
pub async fn scan_set_members(
    pool: &Pool,
    key: &str,
    cursor: u64,
    pattern: &str,
    count: u32,
) -> Result<SetScanResult, AppError> {
    let mut conn = pool.get().await?;

    let (new_cursor, members): (u64, Vec<String>) = redis::cmd("SSCAN")
        .arg(key)
        .arg(cursor)
        .arg("MATCH")
        .arg(pattern)
        .arg("COUNT")
        .arg(count)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("SSCAN failed: {e}")))?;

    Ok(SetScanResult {
        cursor: new_cursor,
        members,
        finished: new_cursor == 0,
    })
}

/// Add one or more members to a set.
pub async fn add_set_members(
    pool: &Pool,
    key: &str,
    members: &[String],
) -> Result<u64, AppError> {
    if members.is_empty() {
        return Ok(0);
    }

    let mut conn = pool.get().await?;

    let added: u64 = redis::cmd("SADD")
        .arg(key)
        .arg(members)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("SADD failed: {e}")))?;

    Ok(added)
}

/// Remove one or more members from a set.
pub async fn remove_set_members(
    pool: &Pool,
    key: &str,
    members: &[String],
) -> Result<u64, AppError> {
    if members.is_empty() {
        return Ok(0);
    }

    let mut conn = pool.get().await?;

    let removed: u64 = redis::cmd("SREM")
        .arg(key)
        .arg(members)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("SREM failed: {e}")))?;

    Ok(removed)
}
