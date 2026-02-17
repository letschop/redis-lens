// SPDX-License-Identifier: MIT

use deadpool_redis::Pool;

use super::model::StringValue;
use crate::utils::errors::AppError;

/// Get a string value from Redis.
///
/// Returns the value as text if it is valid UTF-8, or as base64-encoded
/// binary if it contains non-printable characters.
pub async fn get_string_value(pool: &Pool, key: &str) -> Result<StringValue, AppError> {
    let mut conn = pool.get().await?;

    let value: Option<Vec<u8>> = redis::cmd("GET")
        .arg(key)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("GET failed: {e}")))?;

    match value {
        Some(bytes) => {
            let size_bytes = bytes.len() as u64;
            let has_binary = bytes
                .iter()
                .any(|&b| b < 32 && b != b'\n' && b != b'\r' && b != b'\t');

            if has_binary {
                use base64::Engine;
                Ok(StringValue {
                    text: None,
                    base64: Some(base64::engine::general_purpose::STANDARD.encode(&bytes)),
                    size_bytes,
                    is_binary: true,
                })
            } else {
                let text = String::from_utf8_lossy(&bytes).into_owned();
                Ok(StringValue {
                    text: Some(text),
                    base64: None,
                    size_bytes,
                    is_binary: false,
                })
            }
        }
        None => Err(AppError::NotFound(format!("Key '{key}' not found"))),
    }
}

/// Set a string value in Redis.
///
/// If `ttl` is provided (> 0), the key will expire after that many seconds.
/// If `ttl` is None, the existing TTL is preserved by not touching it.
pub async fn set_string_value(
    pool: &Pool,
    key: &str,
    value: &str,
    ttl: Option<i64>,
) -> Result<(), AppError> {
    let mut conn = pool.get().await?;

    match ttl {
        Some(secs) if secs > 0 => {
            redis::cmd("SET")
                .arg(key)
                .arg(value)
                .arg("EX")
                .arg(secs)
                .query_async::<String>(&mut conn)
                .await
                .map_err(|e| AppError::Redis(format!("SET EX failed: {e}")))?;
        }
        _ => {
            // SET without TTL — preserves existing expiry only if we don't
            // use KEEPTTL (Redis 6.0+). We use KEEPTTL for safety.
            redis::cmd("SET")
                .arg(key)
                .arg(value)
                .arg("KEEPTTL")
                .query_async::<String>(&mut conn)
                .await
                .map_err(|e| AppError::Redis(format!("SET KEEPTTL failed: {e}")))?;
        }
    }

    Ok(())
}

/// Get a substring of a string value (for large strings).
pub async fn get_string_range(
    pool: &Pool,
    key: &str,
    start: i64,
    end: i64,
) -> Result<String, AppError> {
    let mut conn = pool.get().await?;

    let value: String = redis::cmd("GETRANGE")
        .arg(key)
        .arg(start)
        .arg(end)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("GETRANGE failed: {e}")))?;

    Ok(value)
}
