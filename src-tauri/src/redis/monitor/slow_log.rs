// SPDX-License-Identifier: MIT

use deadpool_redis::Pool;
use redis::Value;

use super::model::SlowLogEntry;
use crate::utils::errors::AppError;

/// Fetch and parse SLOWLOG GET entries.
pub async fn get_slow_log(pool: &Pool, count: u64) -> Result<Vec<SlowLogEntry>, AppError> {
    let mut conn = pool.get().await?;
    let raw: Value = redis::cmd("SLOWLOG")
        .arg("GET")
        .arg(count)
        .query_async(&mut conn)
        .await?;

    Ok(parse_slow_log_response(&raw))
}

/// Parse the raw SLOWLOG GET response into typed entries.
///
/// SLOWLOG GET returns an array of arrays. Each entry is:
/// `[id, timestamp, duration_us, [cmd, arg1, arg2, ...], client_addr, client_name]`
///
/// Redis < 4.0 returns only 4 fields (no `client_addr`, `client_name`).
fn parse_slow_log_response(value: &Value) -> Vec<SlowLogEntry> {
    let Value::Array(entries_arr) = value else {
        return Vec::new();
    };

    let mut entries = Vec::with_capacity(entries_arr.len());

    for entry_val in entries_arr {
        let Value::Array(fields) = entry_val else {
            continue;
        };

        if fields.len() < 4 {
            continue;
        }

        let id = extract_u64(&fields[0]);
        let timestamp = extract_u64(&fields[1]);
        let duration_us = extract_u64(&fields[2]);
        let command = extract_command(&fields[3]);

        let client_addr = if fields.len() > 4 {
            extract_string(&fields[4])
        } else {
            String::new()
        };

        let client_name = if fields.len() > 5 {
            extract_string(&fields[5])
        } else {
            String::new()
        };

        entries.push(SlowLogEntry {
            id,
            timestamp,
            duration_us,
            command,
            client_addr,
            client_name,
        });
    }

    entries
}

/// Extract a command string from the command array.
/// The command array is `[cmd, arg1, arg2, ...]`.
fn extract_command(value: &Value) -> String {
    match value {
        Value::Array(parts) => parts
            .iter()
            .map(extract_string)
            .collect::<Vec<_>>()
            .join(" "),
        _ => extract_string(value),
    }
}

#[allow(clippy::cast_sign_loss)]
fn extract_u64(value: &Value) -> u64 {
    match value {
        Value::Int(n) => *n as u64,
        Value::BulkString(bytes) => String::from_utf8_lossy(bytes).parse().unwrap_or(0),
        _ => 0,
    }
}

fn extract_string(value: &Value) -> String {
    match value {
        Value::BulkString(bytes) => String::from_utf8_lossy(bytes).to_string(),
        Value::SimpleString(s) => s.clone(),
        Value::Int(n) => n.to_string(),
        _ => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_bulk(s: &str) -> Value {
        Value::BulkString(s.as_bytes().to_vec())
    }

    #[test]
    fn test_parse_slow_log_empty() {
        let val = Value::Array(vec![]);
        let result = parse_slow_log_response(&val);
        assert!(result.is_empty());
    }

    #[test]
    fn test_parse_slow_log_single_entry_redis4_plus() {
        let entry = Value::Array(vec![
            Value::Int(1),
            Value::Int(1_700_000_000),
            Value::Int(15000),
            Value::Array(vec![make_bulk("GET"), make_bulk("key1")]),
            make_bulk("127.0.0.1:12345"),
            make_bulk("myapp"),
        ]);
        let val = Value::Array(vec![entry]);
        let result = parse_slow_log_response(&val);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].id, 1);
        assert_eq!(result[0].timestamp, 1_700_000_000);
        assert_eq!(result[0].duration_us, 15000);
        assert_eq!(result[0].command, "GET key1");
        assert_eq!(result[0].client_addr, "127.0.0.1:12345");
        assert_eq!(result[0].client_name, "myapp");
    }

    #[test]
    fn test_parse_slow_log_entry_redis3_compat() {
        let entry = Value::Array(vec![
            Value::Int(5),
            Value::Int(1_600_000_000),
            Value::Int(500),
            Value::Array(vec![make_bulk("HGETALL"), make_bulk("users")]),
        ]);
        let val = Value::Array(vec![entry]);
        let result = parse_slow_log_response(&val);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].id, 5);
        assert_eq!(result[0].command, "HGETALL users");
        assert_eq!(result[0].client_addr, "");
        assert_eq!(result[0].client_name, "");
    }

    #[test]
    fn test_parse_slow_log_multiple_entries() {
        let e1 = Value::Array(vec![
            Value::Int(1),
            Value::Int(100),
            Value::Int(1000),
            Value::Array(vec![make_bulk("SET"), make_bulk("a"), make_bulk("b")]),
            make_bulk("10.0.0.1:1234"),
            make_bulk(""),
        ]);
        let e2 = Value::Array(vec![
            Value::Int(2),
            Value::Int(200),
            Value::Int(2000),
            Value::Array(vec![make_bulk("GET"), make_bulk("c")]),
            make_bulk("10.0.0.2:5678"),
            make_bulk("worker"),
        ]);
        let val = Value::Array(vec![e1, e2]);
        let result = parse_slow_log_response(&val);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].command, "SET a b");
        assert_eq!(result[1].command, "GET c");
        assert_eq!(result[1].client_name, "worker");
    }

    #[test]
    fn test_parse_slow_log_non_array_returns_empty() {
        let val = Value::Nil;
        let result = parse_slow_log_response(&val);
        assert!(result.is_empty());
    }

    #[test]
    fn test_parse_slow_log_short_entry_skipped() {
        let entry = Value::Array(vec![Value::Int(1), Value::Int(2)]);
        let val = Value::Array(vec![entry]);
        let result = parse_slow_log_response(&val);
        assert!(result.is_empty());
    }
}
