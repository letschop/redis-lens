// SPDX-License-Identifier: MIT

use deadpool_redis::Pool;

use super::model::TtlInfo;
use crate::utils::errors::AppError;

/// Get TTL information for a key.
pub async fn get_ttl(pool: &Pool, key: &str) -> Result<TtlInfo, AppError> {
    let mut conn = pool.get().await?;

    let ttl_secs: i64 = redis::cmd("TTL")
        .arg(key)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("TTL failed: {e}")))?;

    Ok(TtlInfo {
        seconds: ttl_secs,
        is_persistent: ttl_secs == -1,
        is_missing: ttl_secs == -2,
    })
}

/// Set TTL on a key (in seconds).
pub async fn set_key_ttl(pool: &Pool, key: &str, seconds: i64) -> Result<bool, AppError> {
    let mut conn = pool.get().await?;

    let result: bool = redis::cmd("EXPIRE")
        .arg(key)
        .arg(seconds)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("EXPIRE failed: {e}")))?;

    Ok(result)
}

/// Remove TTL from a key (make it persistent).
pub async fn persist_key(pool: &Pool, key: &str) -> Result<bool, AppError> {
    let mut conn = pool.get().await?;

    let result: bool = redis::cmd("PERSIST")
        .arg(key)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("PERSIST failed: {e}")))?;

    Ok(result)
}
