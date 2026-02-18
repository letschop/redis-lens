// SPDX-License-Identifier: MIT

use deadpool_redis::Pool;
use redis::Value;

use super::model::{ConsumerGroupInfo, StreamEntry, StreamInfo, StreamRangeResult};
use crate::utils::errors::AppError;

/// Get a range of stream entries using XRANGE.
pub async fn get_stream_range(
    pool: &Pool,
    key: &str,
    start: &str,
    end: &str,
    count: u64,
) -> Result<StreamRangeResult, AppError> {
    let mut conn = pool.get().await?;

    // Get total length
    let total_length: u64 = redis::cmd("XLEN")
        .arg(key)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("XLEN failed: {e}")))?;

    // XRANGE key start end COUNT count
    let raw: Vec<Value> = redis::cmd("XRANGE")
        .arg(key)
        .arg(start)
        .arg(end)
        .arg("COUNT")
        .arg(count)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("XRANGE failed: {e}")))?;

    let entries = parse_stream_entries(&raw);

    Ok(StreamRangeResult {
        entries,
        total_length,
    })
}

/// Get stream entries in reverse order using XREVRANGE.
pub async fn get_stream_range_rev(
    pool: &Pool,
    key: &str,
    end: &str,
    start: &str,
    count: u64,
) -> Result<StreamRangeResult, AppError> {
    let mut conn = pool.get().await?;

    let total_length: u64 = redis::cmd("XLEN")
        .arg(key)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("XLEN failed: {e}")))?;

    let raw: Vec<Value> = redis::cmd("XREVRANGE")
        .arg(key)
        .arg(end)
        .arg(start)
        .arg("COUNT")
        .arg(count)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("XREVRANGE failed: {e}")))?;

    let entries = parse_stream_entries(&raw);

    Ok(StreamRangeResult {
        entries,
        total_length,
    })
}

/// Add an entry to a stream.
pub async fn add_stream_entry(
    pool: &Pool,
    key: &str,
    id: &str,
    fields: &[(String, String)],
) -> Result<String, AppError> {
    if fields.is_empty() {
        return Err(AppError::InvalidInput(
            "Stream entry must have at least one field".into(),
        ));
    }

    let mut conn = pool.get().await?;

    let mut cmd = redis::cmd("XADD");
    cmd.arg(key).arg(id);
    for (k, v) in fields {
        cmd.arg(k).arg(v);
    }

    let entry_id: String = cmd
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("XADD failed: {e}")))?;

    Ok(entry_id)
}

/// Delete one or more entries from a stream.
pub async fn delete_stream_entries(
    pool: &Pool,
    key: &str,
    ids: &[String],
) -> Result<u64, AppError> {
    if ids.is_empty() {
        return Ok(0);
    }

    let mut conn = pool.get().await?;

    let deleted: u64 = redis::cmd("XDEL")
        .arg(key)
        .arg(ids)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("XDEL failed: {e}")))?;

    Ok(deleted)
}

/// Get stream info including length and consumer groups.
pub async fn get_stream_info(pool: &Pool, key: &str) -> Result<StreamInfo, AppError> {
    let mut conn = pool.get().await?;

    // XINFO STREAM key
    let raw: Value = redis::cmd("XINFO")
        .arg("STREAM")
        .arg(key)
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Redis(format!("XINFO STREAM failed: {e}")))?;

    let info = parse_xinfo_stream(&raw);

    // XINFO GROUPS key
    let groups_raw: Value = redis::cmd("XINFO")
        .arg("GROUPS")
        .arg(key)
        .query_async(&mut conn)
        .await
        .unwrap_or(Value::Array(vec![]));

    let groups = parse_xinfo_groups(&groups_raw);

    Ok(StreamInfo {
        length: info.0,
        first_entry_id: info.1,
        last_entry_id: info.2,
        groups,
    })
}

// ─── Parsers ─────────────────────────────────────────────────────

fn parse_stream_entries(raw: &[Value]) -> Vec<StreamEntry> {
    let mut entries = Vec::new();

    for item in raw {
        if let Value::Array(pair) = item {
            if pair.len() == 2 {
                let id = value_to_string(&pair[0]);
                let fields = parse_field_pairs(&pair[1]);
                entries.push(StreamEntry { id, fields });
            }
        }
    }

    entries
}

fn parse_field_pairs(val: &Value) -> Vec<(String, String)> {
    let mut pairs = Vec::new();
    if let Value::Array(items) = val {
        let mut iter = items.iter();
        while let Some(k) = iter.next() {
            let v = iter.next().unwrap_or(&Value::Nil);
            pairs.push((value_to_string(k), value_to_string(v)));
        }
    }
    pairs
}

fn value_to_string(val: &Value) -> String {
    match val {
        Value::BulkString(bytes) => String::from_utf8_lossy(bytes).to_string(),
        Value::SimpleString(s) => s.clone(),
        Value::Int(i) => i.to_string(),
        Value::Nil => String::new(),
        _ => format!("{val:?}"),
    }
}

fn parse_xinfo_stream(raw: &Value) -> (u64, Option<String>, Option<String>) {
    let mut length: u64 = 0;
    let mut first_entry_id: Option<String> = None;
    let mut last_entry_id: Option<String> = None;

    if let Value::Array(items) = raw {
        let mut iter = items.iter();
        while let Some(key_val) = iter.next() {
            let key = value_to_string(key_val);
            let val = iter.next();
            match key.as_str() {
                "length" => {
                    if let Some(v) = val {
                        length = match v {
                            Value::Int(i) => u64::try_from(*i).unwrap_or(0),
                            _ => 0,
                        };
                    }
                }
                "first-entry" => {
                    if let Some(Value::Array(entry)) = val {
                        if let Some(id_val) = entry.first() {
                            first_entry_id = Some(value_to_string(id_val));
                        }
                    }
                }
                "last-entry" => {
                    if let Some(Value::Array(entry)) = val {
                        if let Some(id_val) = entry.first() {
                            last_entry_id = Some(value_to_string(id_val));
                        }
                    }
                }
                _ => {}
            }
        }
    }

    (length, first_entry_id, last_entry_id)
}

fn parse_xinfo_groups(raw: &Value) -> Vec<ConsumerGroupInfo> {
    let mut groups = Vec::new();

    if let Value::Array(group_list) = raw {
        for group_val in group_list {
            if let Value::Array(fields) = group_val {
                let mut name = String::new();
                let mut consumers: u64 = 0;
                let mut pending: u64 = 0;
                let mut last_delivered_id = String::new();

                let mut iter = fields.iter();
                while let Some(key_val) = iter.next() {
                    let key = value_to_string(key_val);
                    let val = iter.next();
                    match key.as_str() {
                        "name" => {
                            if let Some(v) = val {
                                name = value_to_string(v);
                            }
                        }
                        "consumers" => {
                            if let Some(Value::Int(i)) = val {
                                consumers = u64::try_from(*i).unwrap_or(0);
                            }
                        }
                        "pending" => {
                            if let Some(Value::Int(i)) = val {
                                pending = u64::try_from(*i).unwrap_or(0);
                            }
                        }
                        "last-delivered-id" => {
                            if let Some(v) = val {
                                last_delivered_id = value_to_string(v);
                            }
                        }
                        _ => {}
                    }
                }

                groups.push(ConsumerGroupInfo {
                    name,
                    consumers,
                    pending,
                    last_delivered_id,
                });
            }
        }
    }

    groups
}
