// SPDX-License-Identifier: MIT

use deadpool_redis::Pool;

use super::model::{KeyInfo, RedisKeyType, ScanResult, Ttl};
use crate::utils::errors::AppError;

/// Execute a single SCAN iteration and return results.
///
/// Uses the cursor-based SCAN command which is non-blocking and safe for
/// production servers with millions of keys.
pub async fn scan_keys(
    pool: &Pool,
    cursor: u64,
    pattern: &str,
    count: u32,
) -> Result<ScanResult, AppError> {
    let mut conn = pool.get().await?;

    // Get total key count for progress estimation
    let db_size: u64 = redis::cmd("DBSIZE")
        .query_async(&mut conn)
        .await
        .unwrap_or(0);

    // Execute SCAN
    let (new_cursor, keys): (u64, Vec<String>) = redis::cmd("SCAN")
        .arg(cursor)
        .arg("MATCH")
        .arg(pattern)
        .arg("COUNT")
        .arg(count)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("SCAN failed: {e}")))?;

    Ok(ScanResult {
        cursor: new_cursor,
        keys,
        finished: new_cursor == 0,
        scanned_count: 0, // Caller tracks cumulative count
        total_estimate: db_size,
    })
}

/// Get metadata (type + TTL) for a batch of keys using a single pipeline.
///
/// This is much more efficient than issuing individual TYPE and TTL commands.
pub async fn get_keys_info(pool: &Pool, keys: &[String]) -> Result<Vec<KeyInfo>, AppError> {
    if keys.is_empty() {
        return Ok(Vec::new());
    }

    let mut conn = pool.get().await?;

    // Pipeline: TYPE + TTL for each key
    let mut pipe = redis::pipe();
    for key in keys {
        pipe.cmd("TYPE").arg(key);
        pipe.cmd("TTL").arg(key);
    }

    let results: Vec<redis::Value> = pipe
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("Pipeline query failed: {e}")))?;

    let mut infos = Vec::with_capacity(keys.len());
    for (i, key) in keys.iter().enumerate() {
        let type_val = results.get(i * 2);
        let ttl_val = results.get(i * 2 + 1);

        let key_type = parse_type_value(type_val);
        let ttl = parse_ttl_value(ttl_val);

        infos.push(KeyInfo {
            key: key.clone(),
            key_type,
            ttl,
            size_bytes: None,
            encoding: None,
            length: None,
        });
    }

    Ok(infos)
}

/// Get detailed info for a single key including encoding and element count.
pub async fn get_key_detail(pool: &Pool, key: &str) -> Result<KeyInfo, AppError> {
    let mut conn = pool.get().await?;

    // Pipeline: TYPE + TTL + OBJECT ENCODING
    let mut pipe = redis::pipe();
    pipe.cmd("TYPE").arg(key);
    pipe.cmd("TTL").arg(key);
    pipe.cmd("OBJECT").arg("ENCODING").arg(key);

    let results: Vec<redis::Value> = pipe
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("Pipeline query failed: {e}")))?;

    let key_type = parse_type_value(results.first());
    let ttl = parse_ttl_value(results.get(1));
    let encoding = extract_string_value(results.get(2));

    // Get element count based on type
    let length = get_length_for_type(&mut conn, key, &key_type).await;

    Ok(KeyInfo {
        key: key.to_string(),
        key_type,
        ttl,
        size_bytes: None,
        encoding,
        length,
    })
}

/// Delete one or more keys using UNLINK (non-blocking).
pub async fn delete_keys(pool: &Pool, keys: &[String]) -> Result<u64, AppError> {
    if keys.is_empty() {
        return Ok(0);
    }

    let mut conn = pool.get().await?;

    let count: u64 = redis::cmd("UNLINK")
        .arg(keys)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("UNLINK failed: {e}")))?;

    Ok(count)
}

/// Rename a key, failing if the new name already exists.
pub async fn rename_key(pool: &Pool, old_name: &str, new_name: &str) -> Result<(), AppError> {
    let mut conn = pool.get().await?;

    // Check if new name already exists
    let exists: bool = redis::cmd("EXISTS")
        .arg(new_name)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("EXISTS check failed: {e}")))?;

    if exists {
        return Err(AppError::InvalidInput(format!(
            "Key '{new_name}' already exists"
        )));
    }

    redis::cmd("RENAMENX")
        .arg(old_name)
        .arg(new_name)
        .query_async::<i32>(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("RENAMENX failed: {e}")))?;

    Ok(())
}

/// Parse a Redis TYPE response value into a `RedisKeyType`.
fn parse_type_value(value: Option<&redis::Value>) -> RedisKeyType {
    match value {
        Some(redis::Value::SimpleString(s)) => RedisKeyType::from_type_str(s),
        Some(redis::Value::BulkString(bytes)) => {
            let s = String::from_utf8_lossy(bytes);
            RedisKeyType::from_type_str(&s)
        }
        _ => RedisKeyType::Unknown("none".into()),
    }
}

/// Parse a Redis TTL response value into a `Ttl`.
fn parse_ttl_value(value: Option<&redis::Value>) -> Ttl {
    match value {
        Some(redis::Value::Int(n)) => Ttl::from_ttl_response(*n),
        _ => Ttl::Missing,
    }
}

/// Extract a string from a Redis value.
fn extract_string_value(value: Option<&redis::Value>) -> Option<String> {
    match value {
        Some(redis::Value::SimpleString(s)) => Some(s.clone()),
        Some(redis::Value::BulkString(bytes)) => {
            Some(String::from_utf8_lossy(bytes).into_owned())
        }
        _ => None,
    }
}

/// Get element count for a key based on its type.
async fn get_length_for_type(
    conn: &mut deadpool_redis::Connection,
    key: &str,
    key_type: &RedisKeyType,
) -> Option<u64> {
    let cmd = match key_type {
        RedisKeyType::String => "STRLEN",
        RedisKeyType::Hash => "HLEN",
        RedisKeyType::List => "LLEN",
        RedisKeyType::Set => "SCARD",
        RedisKeyType::Zset => "ZCARD",
        RedisKeyType::Stream => "XLEN",
        RedisKeyType::Unknown(_) => return None,
    };

    redis::cmd(cmd)
        .arg(key)
        .query_async::<u64>(conn)
        .await
        .ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_type_value_simple_string() {
        let value = redis::Value::SimpleString("hash".into());
        assert_eq!(parse_type_value(Some(&value)), RedisKeyType::Hash);
    }

    #[test]
    fn test_parse_type_value_bulk_string() {
        let value = redis::Value::BulkString(b"string".to_vec());
        assert_eq!(parse_type_value(Some(&value)), RedisKeyType::String);
    }

    #[test]
    fn test_parse_type_value_none() {
        let result = parse_type_value(None);
        assert_eq!(result, RedisKeyType::Unknown("none".into()));
    }

    #[test]
    fn test_parse_ttl_value_persistent() {
        let value = redis::Value::Int(-1);
        assert_eq!(parse_ttl_value(Some(&value)), Ttl::Persistent);
    }

    #[test]
    fn test_parse_ttl_value_missing() {
        let value = redis::Value::Int(-2);
        assert_eq!(parse_ttl_value(Some(&value)), Ttl::Missing);
    }

    #[test]
    fn test_parse_ttl_value_seconds() {
        let value = redis::Value::Int(120);
        assert_eq!(parse_ttl_value(Some(&value)), Ttl::Seconds { value: 120 });
    }

    #[test]
    fn test_extract_string_value_simple() {
        let value = redis::Value::SimpleString("ziplist".into());
        assert_eq!(extract_string_value(Some(&value)), Some("ziplist".into()));
    }

    #[test]
    fn test_extract_string_value_bulk() {
        let value = redis::Value::BulkString(b"listpack".to_vec());
        assert_eq!(
            extract_string_value(Some(&value)),
            Some("listpack".into())
        );
    }

    #[test]
    fn test_extract_string_value_none() {
        assert_eq!(extract_string_value(None), None);
    }
}
