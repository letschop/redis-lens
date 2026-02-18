// SPDX-License-Identifier: MIT

use deadpool_redis::Pool;

use super::model::{ZSetMember, ZSetScanResult};
use crate::utils::errors::AppError;

/// Get sorted set members in a range (by rank), with scores.
pub async fn get_zset_range(
    pool: &Pool,
    key: &str,
    start: i64,
    stop: i64,
) -> Result<Vec<ZSetMember>, AppError> {
    let mut conn = pool.get().await?;

    // ZRANGE key start stop WITHSCORES
    let raw: Vec<(String, f64)> = redis::cmd("ZRANGE")
        .arg(key)
        .arg(start)
        .arg(stop)
        .arg("WITHSCORES")
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("ZRANGE failed: {e}")))?;

    Ok(raw
        .into_iter()
        .map(|(member, score)| ZSetMember { member, score })
        .collect())
}

/// Scan sorted set members using ZSCAN (for large sorted sets).
pub async fn scan_zset_members(
    pool: &Pool,
    key: &str,
    cursor: u64,
    pattern: &str,
    count: u32,
) -> Result<ZSetScanResult, AppError> {
    let mut conn = pool.get().await?;

    let (new_cursor, raw): (u64, Vec<(String, f64)>) = redis::cmd("ZSCAN")
        .arg(key)
        .arg(cursor)
        .arg("MATCH")
        .arg(pattern)
        .arg("COUNT")
        .arg(count)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("ZSCAN failed: {e}")))?;

    let members = raw
        .into_iter()
        .map(|(member, score)| ZSetMember { member, score })
        .collect();

    Ok(ZSetScanResult {
        cursor: new_cursor,
        members,
        finished: new_cursor == 0,
    })
}

/// Add or update a member in a sorted set with a score.
pub async fn add_zset_member(
    pool: &Pool,
    key: &str,
    member: &str,
    score: f64,
) -> Result<u64, AppError> {
    let mut conn = pool.get().await?;

    let added: u64 = redis::cmd("ZADD")
        .arg(key)
        .arg(score)
        .arg(member)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("ZADD failed: {e}")))?;

    Ok(added)
}

/// Remove one or more members from a sorted set.
pub async fn remove_zset_members(
    pool: &Pool,
    key: &str,
    members: &[String],
) -> Result<u64, AppError> {
    if members.is_empty() {
        return Ok(0);
    }

    let mut conn = pool.get().await?;

    let removed: u64 = redis::cmd("ZREM")
        .arg(key)
        .arg(members)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("ZREM failed: {e}")))?;

    Ok(removed)
}

/// Increment the score of a member by a delta.
pub async fn incr_zset_score(
    pool: &Pool,
    key: &str,
    member: &str,
    delta: f64,
) -> Result<f64, AppError> {
    let mut conn = pool.get().await?;

    let new_score: f64 = redis::cmd("ZINCRBY")
        .arg(key)
        .arg(delta)
        .arg(member)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("ZINCRBY failed: {e}")))?;

    Ok(new_score)
}

/// Get the total number of members in a sorted set.
pub async fn zset_card(pool: &Pool, key: &str) -> Result<u64, AppError> {
    let mut conn = pool.get().await?;

    let count: u64 = redis::cmd("ZCARD")
        .arg(key)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("ZCARD failed: {e}")))?;

    Ok(count)
}
