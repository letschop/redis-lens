# Phase 6: Monitoring — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a full server monitoring suite: real-time dashboard with KPI cards, time-series charts, slow log viewer, client list manager, and memory analysis panel.

**Architecture:** Hybrid approach — background tokio task polls INFO ALL and streams StatsSnapshot via Tauri events for real-time metrics. Slow log, client list, and memory analysis are on-demand request-response via invoke(). Poller lifecycle managed by AbortHandle keyed by connection ID.

**Tech Stack:** Rust (tokio, redis-rs, deadpool-redis, serde), Tauri 2.x events, TypeScript, React, Zustand, Recharts, shadcn/ui

---

## Task 1: Rust Monitor Models

**Files:**
- Create: `src-tauri/src/redis/monitor/model.rs`

**Step 1: Create the model file with all monitoring structs**

```rust
// src-tauri/src/redis/monitor/model.rs
// SPDX-License-Identifier: MIT

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

/// Parsed INFO output organized into typed sections.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfo {
    pub server: ServerSection,
    pub clients: ClientsSection,
    pub memory: MemorySection,
    pub stats: StatsSection,
    pub replication: ReplicationSection,
    pub keyspace: Vec<DatabaseInfo>,
    /// All raw key-value pairs from INFO for the "raw info" view.
    pub raw: HashMap<String, String>,
}

/// Fields from the # Server section.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerSection {
    pub redis_version: String,
    pub redis_mode: String,
    pub os: String,
    pub uptime_in_seconds: u64,
    pub tcp_port: u16,
}

/// Fields from the # Clients section.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientsSection {
    pub connected_clients: u64,
    pub blocked_clients: u64,
    pub connected_slaves: u64,
}

/// Fields from the # Memory section.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySection {
    pub used_memory: u64,
    pub used_memory_human: String,
    pub used_memory_rss: u64,
    pub used_memory_peak_human: String,
    pub maxmemory: u64,
    pub maxmemory_human: String,
    pub mem_fragmentation_ratio: f64,
}

/// Fields from the # Stats section.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsSection {
    pub instantaneous_ops_per_sec: u64,
    pub total_commands_processed: u64,
    pub keyspace_hits: u64,
    pub keyspace_misses: u64,
    pub expired_keys: u64,
    pub evicted_keys: u64,
}

/// Fields from the # Replication section.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplicationSection {
    pub role: String,
    pub connected_slaves: u64,
    pub master_repl_offset: Option<u64>,
}

/// Per-database keyspace info (e.g., db0: keys=123,expires=10,avg_ttl=5000).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseInfo {
    pub index: u8,
    pub keys: u64,
    pub expires: u64,
    pub avg_ttl: u64,
}

/// Metrics derived from ServerInfo.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DerivedMetrics {
    pub hit_rate_percent: f64,
    pub memory_usage_percent: Option<f64>,
    pub fragmentation_health: FragmentationHealth,
}

/// Fragmentation health indicator.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FragmentationHealth {
    Good,
    Warning,
    Critical,
}

/// Timestamped snapshot emitted via Tauri event.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsSnapshot {
    pub timestamp_ms: u64,
    pub info: ServerInfo,
    pub derived: DerivedMetrics,
}

/// A single slow log entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlowLogEntry {
    pub id: u64,
    pub timestamp: u64,
    pub duration_us: u64,
    pub command: String,
    pub client_addr: String,
    pub client_name: String,
}

/// A connected client's info.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientInfo {
    pub id: u64,
    pub addr: String,
    pub age: u64,
    pub idle: u64,
    pub flags: String,
    pub db: i64,
    pub cmd: String,
    pub name: String,
}

/// Memory analysis result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryStats {
    pub stats: HashMap<String, String>,
    pub doctor_advice: String,
}
```

**Step 2: Run `cargo check` to verify the model file compiles**

Run: `cd src-tauri && cargo check 2>&1 | tail -5`
Expected: won't compile yet — need mod.rs. We'll add it next.

---

## Task 2: Rust Monitor Module Wiring

**Files:**
- Create: `src-tauri/src/redis/monitor/mod.rs`
- Modify: `src-tauri/src/redis/mod.rs`

**Step 1: Create the monitor module root**

```rust
// src-tauri/src/redis/monitor/mod.rs
// SPDX-License-Identifier: MIT

pub mod client_list;
pub mod info_parser;
pub mod model;
pub mod poller;
pub mod slow_log;
```

**Step 2: Register the monitor module in the redis module**

In `src-tauri/src/redis/mod.rs`, add `pub mod monitor;` so it becomes:

```rust
// SPDX-License-Identifier: MIT

pub mod browser;
pub mod connection;
pub mod editor;
pub mod monitor;
```

**Step 3: Create placeholder files so cargo check passes**

Create these 4 empty placeholder files (just the SPDX header):

`src-tauri/src/redis/monitor/info_parser.rs`:
```rust
// SPDX-License-Identifier: MIT
```

`src-tauri/src/redis/monitor/poller.rs`:
```rust
// SPDX-License-Identifier: MIT
```

`src-tauri/src/redis/monitor/slow_log.rs`:
```rust
// SPDX-License-Identifier: MIT
```

`src-tauri/src/redis/monitor/client_list.rs`:
```rust
// SPDX-License-Identifier: MIT
```

**Step 4: Run cargo check**

Run: `cd src-tauri && cargo check 2>&1 | tail -5`
Expected: Compiles successfully (may have unused warnings, that's OK)

**Step 5: Commit**

```bash
git add src-tauri/src/redis/monitor/
git add src-tauri/src/redis/mod.rs
git commit -m "feat(rust): scaffold monitor module with models"
```

---

## Task 3: INFO Parser with Tests

**Files:**
- Modify: `src-tauri/src/redis/monitor/info_parser.rs`

**Step 1: Write the tests first**

```rust
// src-tauri/src/redis/monitor/info_parser.rs
// SPDX-License-Identifier: MIT

use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use super::model::{
    ClientsSection, DatabaseInfo, DerivedMetrics, FragmentationHealth, MemorySection,
    ReplicationSection, ServerInfo, ServerSection, StatsSection, StatsSnapshot,
};

/// Parse raw `INFO ALL` output into a structured `ServerInfo`.
pub fn parse_info(raw: &str) -> ServerInfo {
    let map = parse_raw(raw);

    let server = ServerSection {
        redis_version: get_str(&map, "redis_version"),
        redis_mode: get_str(&map, "redis_mode"),
        os: get_str(&map, "os"),
        uptime_in_seconds: get_u64(&map, "uptime_in_seconds"),
        tcp_port: get_u64(&map, "tcp_port") as u16,
    };

    let clients = ClientsSection {
        connected_clients: get_u64(&map, "connected_clients"),
        blocked_clients: get_u64(&map, "blocked_clients"),
        connected_slaves: get_u64(&map, "connected_slaves"),
    };

    let memory = MemorySection {
        used_memory: get_u64(&map, "used_memory"),
        used_memory_human: get_str(&map, "used_memory_human"),
        used_memory_rss: get_u64(&map, "used_memory_rss"),
        used_memory_peak_human: get_str(&map, "used_memory_peak_human"),
        maxmemory: get_u64(&map, "maxmemory"),
        maxmemory_human: get_str(&map, "maxmemory_human"),
        mem_fragmentation_ratio: get_f64(&map, "mem_fragmentation_ratio"),
    };

    let stats = StatsSection {
        instantaneous_ops_per_sec: get_u64(&map, "instantaneous_ops_per_sec"),
        total_commands_processed: get_u64(&map, "total_commands_processed"),
        keyspace_hits: get_u64(&map, "keyspace_hits"),
        keyspace_misses: get_u64(&map, "keyspace_misses"),
        expired_keys: get_u64(&map, "expired_keys"),
        evicted_keys: get_u64(&map, "evicted_keys"),
    };

    let replication = ReplicationSection {
        role: get_str(&map, "role"),
        connected_slaves: get_u64(&map, "connected_slaves"),
        master_repl_offset: map
            .get("master_repl_offset")
            .and_then(|v| v.parse().ok()),
    };

    let keyspace = parse_keyspace(&map);

    ServerInfo {
        server,
        clients,
        memory,
        stats,
        replication,
        keyspace,
        raw: map,
    }
}

/// Derive computed metrics from a `ServerInfo`.
pub fn derive_metrics(info: &ServerInfo) -> DerivedMetrics {
    let total = info.stats.keyspace_hits + info.stats.keyspace_misses;
    let hit_rate_percent = if total > 0 {
        (info.stats.keyspace_hits as f64 / total as f64) * 100.0
    } else {
        0.0
    };

    let memory_usage_percent = if info.memory.maxmemory > 0 {
        Some((info.memory.used_memory as f64 / info.memory.maxmemory as f64) * 100.0)
    } else {
        None
    };

    let fragmentation_health = if info.memory.mem_fragmentation_ratio > 2.0 {
        FragmentationHealth::Critical
    } else if info.memory.mem_fragmentation_ratio > 1.5 {
        FragmentationHealth::Warning
    } else {
        FragmentationHealth::Good
    };

    DerivedMetrics {
        hit_rate_percent,
        memory_usage_percent,
        fragmentation_health,
    }
}

/// Build a `StatsSnapshot` from raw INFO output.
pub fn build_snapshot(raw: &str) -> StatsSnapshot {
    let info = parse_info(raw);
    let derived = derive_metrics(&info);
    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64);

    StatsSnapshot {
        timestamp_ms,
        info,
        derived,
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Parse raw INFO output into a flat key-value map.
fn parse_raw(raw: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((key, value)) = line.split_once(':') {
            map.insert(key.to_string(), value.to_string());
        }
    }
    map
}

/// Parse keyspace entries like `db0:keys=123,expires=10,avg_ttl=5000`.
fn parse_keyspace(map: &HashMap<String, String>) -> Vec<DatabaseInfo> {
    let mut dbs = Vec::new();
    for i in 0..16u8 {
        let key = format!("db{i}");
        if let Some(value) = map.get(&key) {
            if let Some(db_info) = parse_db_info(i, value) {
                dbs.push(db_info);
            }
        }
    }
    dbs
}

/// Parse a single db info string like `keys=123,expires=10,avg_ttl=5000`.
fn parse_db_info(index: u8, raw: &str) -> Option<DatabaseInfo> {
    let mut keys = 0u64;
    let mut expires = 0u64;
    let mut avg_ttl = 0u64;

    for part in raw.split(',') {
        if let Some((k, v)) = part.split_once('=') {
            match k {
                "keys" => keys = v.parse().unwrap_or(0),
                "expires" => expires = v.parse().unwrap_or(0),
                "avg_ttl" => avg_ttl = v.parse().unwrap_or(0),
                _ => {}
            }
        }
    }

    Some(DatabaseInfo {
        index,
        keys,
        expires,
        avg_ttl,
    })
}

fn get_str(map: &HashMap<String, String>, key: &str) -> String {
    map.get(key).cloned().unwrap_or_default()
}

fn get_u64(map: &HashMap<String, String>, key: &str) -> u64 {
    map.get(key).and_then(|v| v.parse().ok()).unwrap_or(0)
}

fn get_f64(map: &HashMap<String, String>, key: &str) -> f64 {
    map.get(key).and_then(|v| v.parse().ok()).unwrap_or(0.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_INFO: &str = "\
# Server\r\n\
redis_version:7.2.4\r\n\
redis_mode:standalone\r\n\
os:Linux 5.15.0\r\n\
uptime_in_seconds:86400\r\n\
tcp_port:6379\r\n\
\r\n\
# Clients\r\n\
connected_clients:42\r\n\
blocked_clients:3\r\n\
connected_slaves:2\r\n\
\r\n\
# Memory\r\n\
used_memory:1073741824\r\n\
used_memory_human:1.00G\r\n\
used_memory_rss:1300000000\r\n\
used_memory_peak_human:1.50G\r\n\
maxmemory:2147483648\r\n\
maxmemory_human:2.00G\r\n\
mem_fragmentation_ratio:1.21\r\n\
\r\n\
# Stats\r\n\
instantaneous_ops_per_sec:12345\r\n\
total_commands_processed:9999999\r\n\
keyspace_hits:900\r\n\
keyspace_misses:100\r\n\
expired_keys:50\r\n\
evicted_keys:0\r\n\
\r\n\
# Replication\r\n\
role:master\r\n\
master_repl_offset:123456\r\n\
\r\n\
# Keyspace\r\n\
db0:keys=1000,expires=100,avg_ttl=5000\r\n\
db1:keys=50,expires=5,avg_ttl=3000\r\n\
";

    #[test]
    fn test_parse_info_server_section() {
        let info = parse_info(SAMPLE_INFO);
        assert_eq!(info.server.redis_version, "7.2.4");
        assert_eq!(info.server.redis_mode, "standalone");
        assert_eq!(info.server.os, "Linux 5.15.0");
        assert_eq!(info.server.uptime_in_seconds, 86400);
        assert_eq!(info.server.tcp_port, 6379);
    }

    #[test]
    fn test_parse_info_clients_section() {
        let info = parse_info(SAMPLE_INFO);
        assert_eq!(info.clients.connected_clients, 42);
        assert_eq!(info.clients.blocked_clients, 3);
        assert_eq!(info.clients.connected_slaves, 2);
    }

    #[test]
    fn test_parse_info_memory_section() {
        let info = parse_info(SAMPLE_INFO);
        assert_eq!(info.memory.used_memory, 1_073_741_824);
        assert_eq!(info.memory.used_memory_human, "1.00G");
        assert_eq!(info.memory.maxmemory, 2_147_483_648);
        assert!((info.memory.mem_fragmentation_ratio - 1.21).abs() < f64::EPSILON);
    }

    #[test]
    fn test_parse_info_stats_section() {
        let info = parse_info(SAMPLE_INFO);
        assert_eq!(info.stats.instantaneous_ops_per_sec, 12345);
        assert_eq!(info.stats.keyspace_hits, 900);
        assert_eq!(info.stats.keyspace_misses, 100);
        assert_eq!(info.stats.evicted_keys, 0);
    }

    #[test]
    fn test_parse_info_replication_section() {
        let info = parse_info(SAMPLE_INFO);
        assert_eq!(info.replication.role, "master");
        assert_eq!(info.replication.master_repl_offset, Some(123456));
    }

    #[test]
    fn test_parse_info_keyspace() {
        let info = parse_info(SAMPLE_INFO);
        assert_eq!(info.keyspace.len(), 2);
        assert_eq!(info.keyspace[0].index, 0);
        assert_eq!(info.keyspace[0].keys, 1000);
        assert_eq!(info.keyspace[0].expires, 100);
        assert_eq!(info.keyspace[0].avg_ttl, 5000);
        assert_eq!(info.keyspace[1].index, 1);
        assert_eq!(info.keyspace[1].keys, 50);
    }

    #[test]
    fn test_derive_metrics_hit_rate() {
        let info = parse_info(SAMPLE_INFO);
        let derived = derive_metrics(&info);
        assert!((derived.hit_rate_percent - 90.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_derive_metrics_memory_usage() {
        let info = parse_info(SAMPLE_INFO);
        let derived = derive_metrics(&info);
        let usage = derived.memory_usage_percent.unwrap();
        assert!((usage - 50.0).abs() < 0.1);
    }

    #[test]
    fn test_derive_metrics_fragmentation_good() {
        let info = parse_info(SAMPLE_INFO);
        let derived = derive_metrics(&info);
        assert!(matches!(derived.fragmentation_health, FragmentationHealth::Good));
    }

    #[test]
    fn test_derive_metrics_fragmentation_warning() {
        let mut info = parse_info(SAMPLE_INFO);
        info.memory.mem_fragmentation_ratio = 1.7;
        let derived = derive_metrics(&info);
        assert!(matches!(derived.fragmentation_health, FragmentationHealth::Warning));
    }

    #[test]
    fn test_derive_metrics_fragmentation_critical() {
        let mut info = parse_info(SAMPLE_INFO);
        info.memory.mem_fragmentation_ratio = 2.5;
        let derived = derive_metrics(&info);
        assert!(matches!(derived.fragmentation_health, FragmentationHealth::Critical));
    }

    #[test]
    fn test_derive_metrics_zero_hits_misses() {
        let mut info = parse_info(SAMPLE_INFO);
        info.stats.keyspace_hits = 0;
        info.stats.keyspace_misses = 0;
        let derived = derive_metrics(&info);
        assert!((derived.hit_rate_percent - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_derive_metrics_no_maxmemory() {
        let mut info = parse_info(SAMPLE_INFO);
        info.memory.maxmemory = 0;
        let derived = derive_metrics(&info);
        assert!(derived.memory_usage_percent.is_none());
    }

    #[test]
    fn test_parse_empty_info() {
        let info = parse_info("");
        assert_eq!(info.server.redis_version, "");
        assert_eq!(info.keyspace.len(), 0);
    }

    #[test]
    fn test_build_snapshot() {
        let snapshot = build_snapshot(SAMPLE_INFO);
        assert!(snapshot.timestamp_ms > 0);
        assert_eq!(snapshot.info.server.redis_version, "7.2.4");
        assert!((snapshot.derived.hit_rate_percent - 90.0).abs() < f64::EPSILON);
    }
}
```

**Step 2: Run the tests**

Run: `cd src-tauri && cargo test --lib redis::monitor::info_parser -- --nocapture 2>&1 | tail -20`
Expected: All 14 tests pass

**Step 3: Run clippy**

Run: `cd src-tauri && cargo clippy 2>&1 | tail -10`
Expected: Clean (no warnings)

**Step 4: Commit**

```bash
git add src-tauri/src/redis/monitor/info_parser.rs
git commit -m "feat(rust): add INFO ALL parser with 14 tests"
```

---

## Task 4: Slow Log Parser with Tests

**Files:**
- Modify: `src-tauri/src/redis/monitor/slow_log.rs`

**Step 1: Implement the slow log parser**

```rust
// src-tauri/src/redis/monitor/slow_log.rs
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

    parse_slow_log_response(&raw)
}

/// Parse the raw SLOWLOG GET response into typed entries.
///
/// SLOWLOG GET returns an array of arrays. Each entry is:
/// `[id, timestamp, duration_us, [cmd, arg1, arg2, ...], client_addr, client_name]`
///
/// Redis < 4.0 returns only 4 fields (no client_addr, client_name).
fn parse_slow_log_response(value: &Value) -> Result<Vec<SlowLogEntry>, AppError> {
    let entries_arr = match value {
        Value::Array(arr) => arr,
        _ => return Ok(Vec::new()),
    };

    let mut entries = Vec::with_capacity(entries_arr.len());

    for entry_val in entries_arr {
        let fields = match entry_val {
            Value::Array(f) => f,
            _ => continue,
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

    Ok(entries)
}

/// Extract a command string from the command array.
/// The command array is `[cmd, arg1, arg2, ...]`.
fn extract_command(value: &Value) -> String {
    match value {
        Value::Array(parts) => parts
            .iter()
            .map(|p| extract_string(p))
            .collect::<Vec<_>>()
            .join(" "),
        _ => extract_string(value),
    }
}

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
        let result = parse_slow_log_response(&val).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_parse_slow_log_single_entry_redis4_plus() {
        let entry = Value::Array(vec![
            Value::Int(1),                                         // id
            Value::Int(1_700_000_000),                             // timestamp
            Value::Int(15000),                                     // duration_us
            Value::Array(vec![make_bulk("GET"), make_bulk("key1")]), // command
            make_bulk("127.0.0.1:12345"),                          // client_addr
            make_bulk("myapp"),                                    // client_name
        ]);
        let val = Value::Array(vec![entry]);
        let result = parse_slow_log_response(&val).unwrap();
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
        // Redis < 4.0 returns only 4 fields
        let entry = Value::Array(vec![
            Value::Int(5),
            Value::Int(1_600_000_000),
            Value::Int(500),
            Value::Array(vec![make_bulk("HGETALL"), make_bulk("users")]),
        ]);
        let val = Value::Array(vec![entry]);
        let result = parse_slow_log_response(&val).unwrap();
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
        let result = parse_slow_log_response(&val).unwrap();
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].command, "SET a b");
        assert_eq!(result[1].command, "GET c");
        assert_eq!(result[1].client_name, "worker");
    }

    #[test]
    fn test_parse_slow_log_non_array_returns_empty() {
        let val = Value::Nil;
        let result = parse_slow_log_response(&val).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_parse_slow_log_short_entry_skipped() {
        // Entry with fewer than 4 fields should be skipped
        let entry = Value::Array(vec![Value::Int(1), Value::Int(2)]);
        let val = Value::Array(vec![entry]);
        let result = parse_slow_log_response(&val).unwrap();
        assert!(result.is_empty());
    }
}
```

**Step 2: Run the tests**

Run: `cd src-tauri && cargo test --lib redis::monitor::slow_log -- --nocapture 2>&1 | tail -15`
Expected: All 5 tests pass

**Step 3: Commit**

```bash
git add src-tauri/src/redis/monitor/slow_log.rs
git commit -m "feat(rust): add SLOWLOG parser with 5 tests"
```

---

## Task 5: CLIENT LIST Parser with Tests

**Files:**
- Modify: `src-tauri/src/redis/monitor/client_list.rs`

**Step 1: Implement the client list parser**

```rust
// src-tauri/src/redis/monitor/client_list.rs
// SPDX-License-Identifier: MIT

use deadpool_redis::Pool;

use super::model::ClientInfo;
use crate::utils::errors::AppError;

/// Fetch and parse CLIENT LIST output.
pub async fn get_client_list(pool: &Pool) -> Result<Vec<ClientInfo>, AppError> {
    let mut conn = pool.get().await?;
    let raw: String = redis::cmd("CLIENT")
        .arg("LIST")
        .query_async(&mut conn)
        .await?;

    Ok(parse_client_list(&raw))
}

/// Kill a client by ID.
pub async fn kill_client(pool: &Pool, client_id: u64) -> Result<(), AppError> {
    let mut conn = pool.get().await?;
    redis::cmd("CLIENT")
        .arg("KILL")
        .arg("ID")
        .arg(client_id)
        .query_async::<()>(&mut conn)
        .await?;
    Ok(())
}

/// Parse CLIENT LIST output into structured entries.
///
/// CLIENT LIST returns one line per client with space-separated key=value pairs:
/// `id=1 addr=127.0.0.1:6379 fd=5 name= age=100 idle=10 flags=N db=0 ...`
pub fn parse_client_list(raw: &str) -> Vec<ClientInfo> {
    raw.lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| parse_client_line(line))
        .collect()
}

/// Parse a single CLIENT LIST line.
fn parse_client_line(line: &str) -> Option<ClientInfo> {
    let mut id = 0u64;
    let mut addr = String::new();
    let mut age = 0u64;
    let mut idle = 0u64;
    let mut flags = String::new();
    let mut db = 0i64;
    let mut cmd = String::new();
    let mut name = String::new();

    for part in line.split_whitespace() {
        if let Some((key, value)) = part.split_once('=') {
            match key {
                "id" => id = value.parse().unwrap_or(0),
                "addr" => addr = value.to_string(),
                "age" => age = value.parse().unwrap_or(0),
                "idle" => idle = value.parse().unwrap_or(0),
                "flags" => flags = value.to_string(),
                "db" => db = value.parse().unwrap_or(0),
                "cmd" => cmd = value.to_string(),
                "name" => name = value.to_string(),
                _ => {}
            }
        }
    }

    // Skip entries with no ID (shouldn't happen, but be defensive)
    if id == 0 && addr.is_empty() {
        return None;
    }

    Some(ClientInfo {
        id,
        addr,
        age,
        idle,
        flags,
        db,
        cmd,
        name,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_client_list_single() {
        let raw = "id=5 addr=127.0.0.1:52340 fd=8 name=myapp age=100 idle=10 flags=N db=0 sub=0 psub=0 multi=-1 qbuf=0 qbuf-free=32768 obl=0 oll=0 omem=0 events=r cmd=get\n";
        let clients = parse_client_list(raw);
        assert_eq!(clients.len(), 1);
        assert_eq!(clients[0].id, 5);
        assert_eq!(clients[0].addr, "127.0.0.1:52340");
        assert_eq!(clients[0].name, "myapp");
        assert_eq!(clients[0].age, 100);
        assert_eq!(clients[0].idle, 10);
        assert_eq!(clients[0].flags, "N");
        assert_eq!(clients[0].db, 0);
        assert_eq!(clients[0].cmd, "get");
    }

    #[test]
    fn test_parse_client_list_multiple() {
        let raw = "id=1 addr=10.0.0.1:1234 fd=5 name= age=50 idle=5 flags=N db=0 cmd=set\nid=2 addr=10.0.0.2:5678 fd=6 name=worker age=200 idle=0 flags=S db=1 cmd=subscribe\n";
        let clients = parse_client_list(raw);
        assert_eq!(clients.len(), 2);
        assert_eq!(clients[0].id, 1);
        assert_eq!(clients[0].name, "");
        assert_eq!(clients[1].id, 2);
        assert_eq!(clients[1].name, "worker");
        assert_eq!(clients[1].db, 1);
    }

    #[test]
    fn test_parse_client_list_empty() {
        let clients = parse_client_list("");
        assert!(clients.is_empty());
    }

    #[test]
    fn test_parse_client_list_with_blank_lines() {
        let raw = "id=1 addr=127.0.0.1:1234 fd=5 name= age=10 idle=0 flags=N db=0 cmd=ping\n\n";
        let clients = parse_client_list(raw);
        assert_eq!(clients.len(), 1);
    }
}
```

**Step 2: Run the tests**

Run: `cd src-tauri && cargo test --lib redis::monitor::client_list -- --nocapture 2>&1 | tail -10`
Expected: All 4 tests pass

**Step 3: Commit**

```bash
git add src-tauri/src/redis/monitor/client_list.rs
git commit -m "feat(rust): add CLIENT LIST parser with 4 tests"
```

---

## Task 6: Monitor Poller (Background Task)

**Files:**
- Modify: `src-tauri/src/redis/monitor/poller.rs`

**Step 1: Implement the poller with AbortHandle lifecycle**

```rust
// src-tauri/src/redis/monitor/poller.rs
// SPDX-License-Identifier: MIT

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use deadpool_redis::Pool;
use tokio::sync::RwLock;
use tokio::task::AbortHandle;

use super::info_parser;
use super::model::{MemoryStats, StatsSnapshot};
use crate::utils::errors::AppError;

/// Manages background polling tasks, one per connection.
pub struct MonitorPoller {
    handles: Arc<RwLock<HashMap<String, AbortHandle>>>,
}

impl Default for MonitorPoller {
    fn default() -> Self {
        Self::new()
    }
}

impl MonitorPoller {
    /// Create a new poller manager with no active pollers.
    pub fn new() -> Self {
        Self {
            handles: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Start polling for a connection. Spawns a background tokio task.
    ///
    /// If already polling for this connection, stops the old one first.
    pub async fn start(
        &self,
        connection_id: String,
        pool: Pool,
        interval_ms: u64,
        app_handle: tauri::AppHandle,
    ) {
        // Stop any existing poller for this connection
        self.stop(&connection_id).await;

        let handles = self.handles.clone();
        let conn_id = connection_id.clone();

        let task = tokio::spawn(async move {
            let interval = Duration::from_millis(interval_ms);
            loop {
                // Fetch INFO ALL
                match fetch_info_all(&pool).await {
                    Ok(snapshot) => {
                        // Emit the snapshot via Tauri event
                        if let Err(e) = app_handle.emit("monitor:stats", &snapshot) {
                            tracing::warn!(connection_id = %conn_id, "Failed to emit monitor event: {e}");
                            break;
                        }
                    }
                    Err(e) => {
                        tracing::warn!(connection_id = %conn_id, "Monitor poll failed: {e}");
                        // Don't break — transient errors should not kill the poller.
                        // The next iteration will retry.
                    }
                }

                tokio::time::sleep(interval).await;
            }
        });

        let abort_handle = task.abort_handle();
        let mut h = handles.write().await;
        h.insert(connection_id, abort_handle);
    }

    /// Stop polling for a connection.
    pub async fn stop(&self, connection_id: &str) {
        let mut h = self.handles.write().await;
        if let Some(handle) = h.remove(connection_id) {
            handle.abort();
            tracing::info!(connection_id = %connection_id, "Monitor polling stopped");
        }
    }

    /// Stop all active pollers (e.g., on app shutdown).
    pub async fn stop_all(&self) {
        let mut h = self.handles.write().await;
        for (id, handle) in h.drain() {
            handle.abort();
            tracing::info!(connection_id = %id, "Monitor polling stopped (shutdown)");
        }
    }

    /// Check if a connection is currently being polled.
    pub async fn is_polling(&self, connection_id: &str) -> bool {
        let h = self.handles.read().await;
        h.contains_key(connection_id)
    }
}

/// Fetch INFO ALL and build a StatsSnapshot.
async fn fetch_info_all(pool: &Pool) -> Result<StatsSnapshot, AppError> {
    let mut conn = pool.get().await?;
    let raw: String = redis::cmd("INFO")
        .arg("ALL")
        .query_async(&mut conn)
        .await?;

    Ok(info_parser::build_snapshot(&raw))
}

/// Fetch MEMORY STATS and MEMORY DOCTOR on demand.
pub async fn get_memory_stats(pool: &Pool) -> Result<MemoryStats, AppError> {
    let mut conn = pool.get().await?;

    // MEMORY STATS returns a flat array of key-value pairs
    let stats_raw: Vec<redis::Value> = redis::cmd("MEMORY")
        .arg("STATS")
        .query_async(&mut conn)
        .await
        .unwrap_or_default();

    let mut stats = HashMap::new();
    let mut i = 0;
    while i + 1 < stats_raw.len() {
        let key = match &stats_raw[i] {
            redis::Value::BulkString(b) => String::from_utf8_lossy(b).to_string(),
            redis::Value::SimpleString(s) => s.clone(),
            _ => {
                i += 2;
                continue;
            }
        };
        let value = match &stats_raw[i + 1] {
            redis::Value::Int(n) => n.to_string(),
            redis::Value::BulkString(b) => String::from_utf8_lossy(b).to_string(),
            redis::Value::SimpleString(s) => s.clone(),
            redis::Value::Double(f) => f.to_string(),
            _ => String::new(),
        };
        stats.insert(key, value);
        i += 2;
    }

    // MEMORY DOCTOR
    let doctor_advice: String = redis::cmd("MEMORY")
        .arg("DOCTOR")
        .query_async(&mut conn)
        .await
        .unwrap_or_else(|_| "MEMORY DOCTOR not available".to_string());

    Ok(MemoryStats {
        stats,
        doctor_advice,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_poller_new_not_polling() {
        let poller = MonitorPoller::new();
        assert!(!poller.is_polling("conn-1").await);
    }

    #[tokio::test]
    async fn test_poller_stop_nonexistent_is_noop() {
        let poller = MonitorPoller::new();
        poller.stop("nonexistent").await;
        // Should not panic
    }
}
```

**Step 2: Run cargo check and tests**

Run: `cd src-tauri && cargo check 2>&1 | tail -5`
Expected: Compiles (requires `tauri` for `AppHandle`)

Run: `cd src-tauri && cargo test --lib redis::monitor::poller -- --nocapture 2>&1 | tail -10`
Expected: 2 tests pass

**Step 3: Commit**

```bash
git add src-tauri/src/redis/monitor/poller.rs
git commit -m "feat(rust): add monitor poller with AbortHandle lifecycle"
```

---

## Task 7: Tauri Monitor Commands

**Files:**
- Create: `src-tauri/src/commands/monitor.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Create the monitor commands file**

```rust
// src-tauri/src/commands/monitor.rs
// SPDX-License-Identifier: MIT

use tauri::State;
use uuid::Uuid;

use crate::redis::connection::manager::ConnectionManager;
use crate::redis::monitor::model::{ClientInfo, MemoryStats, SlowLogEntry, StatsSnapshot};
use crate::redis::monitor::{client_list, info_parser, poller, slow_log};
use crate::utils::errors::AppError;

/// Fetch a one-shot server info snapshot (no polling).
#[tauri::command]
pub async fn monitor_server_info(
    connection_id: String,
    manager: State<'_, ConnectionManager>,
) -> Result<StatsSnapshot, AppError> {
    let pool = resolve_pool(&connection_id, &manager).await?;
    let mut conn = pool.get().await?;
    let raw: String = redis::cmd("INFO")
        .arg("ALL")
        .query_async(&mut conn)
        .await?;
    Ok(info_parser::build_snapshot(&raw))
}

/// Start background polling that emits `monitor:stats` events.
#[tauri::command]
pub async fn monitor_start_polling(
    connection_id: String,
    interval_ms: u64,
    manager: State<'_, ConnectionManager>,
    monitor_poller: State<'_, poller::MonitorPoller>,
    app_handle: tauri::AppHandle,
) -> Result<(), AppError> {
    let pool = resolve_pool(&connection_id, &manager).await?;
    let interval = if interval_ms < 500 { 2000 } else { interval_ms };
    monitor_poller
        .start(connection_id, pool, interval, app_handle)
        .await;
    Ok(())
}

/// Stop background polling for a connection.
#[tauri::command]
pub async fn monitor_stop_polling(
    connection_id: String,
    monitor_poller: State<'_, poller::MonitorPoller>,
) -> Result<(), AppError> {
    monitor_poller.stop(&connection_id).await;
    Ok(())
}

/// Fetch the slow log (on demand).
#[tauri::command]
pub async fn monitor_slow_log(
    connection_id: String,
    count: u64,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<SlowLogEntry>, AppError> {
    let pool = resolve_pool(&connection_id, &manager).await?;
    let count = if count == 0 { 50 } else { count };
    slow_log::get_slow_log(&pool, count).await
}

/// Fetch the client list (on demand).
#[tauri::command]
pub async fn monitor_client_list(
    connection_id: String,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<ClientInfo>, AppError> {
    let pool = resolve_pool(&connection_id, &manager).await?;
    client_list::get_client_list(&pool).await
}

/// Kill a connected client by ID.
#[tauri::command]
pub async fn monitor_kill_client(
    connection_id: String,
    client_id: u64,
    manager: State<'_, ConnectionManager>,
) -> Result<(), AppError> {
    let pool = resolve_pool(&connection_id, &manager).await?;
    client_list::kill_client(&pool, client_id).await?;
    tracing::info!(connection_id = %connection_id, client_id = client_id, "Client killed");
    Ok(())
}

/// Fetch MEMORY STATS + MEMORY DOCTOR (on demand).
#[tauri::command]
pub async fn monitor_memory_stats(
    connection_id: String,
    manager: State<'_, ConnectionManager>,
) -> Result<MemoryStats, AppError> {
    let pool = resolve_pool(&connection_id, &manager).await?;
    poller::get_memory_stats(&pool).await
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async fn resolve_pool(
    connection_id: &str,
    manager: &State<'_, ConnectionManager>,
) -> Result<deadpool_redis::Pool, AppError> {
    let uuid = Uuid::parse_str(connection_id)?;
    manager.get_pool(&uuid).await
}
```

**Step 2: Register monitor module in commands/mod.rs**

Add `pub mod monitor;` to `src-tauri/src/commands/mod.rs`:

```rust
// SPDX-License-Identifier: MIT

pub mod browser;
pub mod connection;
pub mod editor;
pub mod health;
pub mod monitor;
```

**Step 3: Register commands and MonitorPoller state in lib.rs**

In `src-tauri/src/lib.rs`, add `MonitorPoller` managed state and register all 7 monitor commands in the `generate_handler![]` macro:

Add this import near the top:
```rust
use redis::monitor::poller::MonitorPoller;
```

Add `.manage(MonitorPoller::new())` after `.manage(ConnectionManager::new())`.

Add these 7 commands after the TTL commands in `generate_handler![]`:
```rust
// Monitor commands
commands::monitor::monitor_server_info,
commands::monitor::monitor_start_polling,
commands::monitor::monitor_stop_polling,
commands::monitor::monitor_slow_log,
commands::monitor::monitor_client_list,
commands::monitor::monitor_kill_client,
commands::monitor::monitor_memory_stats,
```

**Step 4: Add event permission to capabilities**

In `src-tauri/capabilities/default.json`, add event permissions:

```json
{
  "$schema": "https://raw.githubusercontent.com/nicegoodthings/tauri-capability-schema/main/schema.json",
  "identifier": "default",
  "description": "Default capabilities for RedisLens",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "shell:allow-open",
    "core:event:default"
  ]
}
```

**Step 5: Run cargo check and clippy**

Run: `cd src-tauri && cargo check 2>&1 | tail -10`
Expected: Compiles

Run: `cd src-tauri && cargo clippy 2>&1 | tail -10`
Expected: Clean

**Step 6: Run all Rust tests**

Run: `cd src-tauri && cargo test 2>&1 | tail -20`
Expected: All tests pass (79 existing + ~20 new monitor tests)

**Step 7: Commit**

```bash
git add src-tauri/src/commands/monitor.rs
git add src-tauri/src/commands/mod.rs
git add src-tauri/src/lib.rs
git add src-tauri/capabilities/default.json
git commit -m "feat(rust): add 7 monitor Tauri commands with poller state"
```

---

## Task 8: Frontend TypeScript Types

**Files:**
- Modify: `src/lib/api/types.ts`

**Step 1: Add monitor types at the end of types.ts**

Append these types to the end of `src/lib/api/types.ts`:

```typescript
// ─── Monitor Types ───────────────────────────────────────────

export interface ServerInfo {
  server: ServerSection;
  clients: ClientsSection;
  memory: MemorySection;
  stats: StatsSection;
  replication: ReplicationSection;
  keyspace: DatabaseInfo[];
  raw: Record<string, string>;
}

export interface ServerSection {
  redisVersion: string;
  redisMode: string;
  os: string;
  uptimeInSeconds: number;
  tcpPort: number;
}

export interface ClientsSection {
  connectedClients: number;
  blockedClients: number;
  connectedSlaves: number;
}

export interface MemorySection {
  usedMemory: number;
  usedMemoryHuman: string;
  usedMemoryRss: number;
  usedMemoryPeakHuman: string;
  maxmemory: number;
  maxmemoryHuman: string;
  memFragmentationRatio: number;
}

export interface StatsSection {
  instantaneousOpsPerSec: number;
  totalCommandsProcessed: number;
  keyspaceHits: number;
  keyspaceMisses: number;
  expiredKeys: number;
  evictedKeys: number;
}

export interface ReplicationSection {
  role: string;
  connectedSlaves: number;
  masterReplOffset: number | null;
}

export interface DatabaseInfo {
  index: number;
  keys: number;
  expires: number;
  avgTtl: number;
}

export interface DerivedMetrics {
  hitRatePercent: number;
  memoryUsagePercent: number | null;
  fragmentationHealth: 'good' | 'warning' | 'critical';
}

export interface StatsSnapshot {
  timestampMs: number;
  info: ServerInfo;
  derived: DerivedMetrics;
}

export interface SlowLogEntry {
  id: number;
  timestamp: number;
  durationUs: number;
  command: string;
  clientAddr: string;
  clientName: string;
}

export interface ClientInfo {
  id: number;
  addr: string;
  age: number;
  idle: number;
  flags: string;
  db: number;
  cmd: string;
  name: string;
}

export interface MemoryStats {
  stats: Record<string, string>;
  doctorAdvice: string;
}
```

**Step 2: Run TypeScript check**

Run: `pnpm tsc --noEmit 2>&1 | tail -5`
Expected: Clean

**Step 3: Commit**

```bash
git add src/lib/api/types.ts
git commit -m "feat(frontend): add monitor TypeScript types"
```

---

## Task 9: Frontend IPC Wrappers

**Files:**
- Modify: `src/lib/api/commands.ts`

**Step 1: Add monitor IPC wrappers at the end of commands.ts**

Append to the imports at the top of the file, add the new types:

```typescript
import type {
  // ... existing imports ...
  StatsSnapshot,
  SlowLogEntry,
  ClientInfo as MonitorClientInfo,
  MemoryStats,
} from './types';
```

Then append these functions at the end of the file:

```typescript
// ─── Monitor ──────────────────────────────────────────────────

/** Fetch a one-shot server info snapshot. */
export async function monitorServerInfo(connectionId: string): Promise<StatsSnapshot> {
  return tauriInvoke<StatsSnapshot>('monitor_server_info', { connectionId });
}

/** Start background polling (emits monitor:stats events). */
export async function monitorStartPolling(
  connectionId: string,
  intervalMs: number = 2000,
): Promise<void> {
  return tauriInvoke<void>('monitor_start_polling', { connectionId, intervalMs });
}

/** Stop background polling. */
export async function monitorStopPolling(connectionId: string): Promise<void> {
  return tauriInvoke<void>('monitor_stop_polling', { connectionId });
}

/** Fetch slow log entries (on demand). */
export async function monitorSlowLog(
  connectionId: string,
  count: number = 50,
): Promise<SlowLogEntry[]> {
  return tauriInvoke<SlowLogEntry[]>('monitor_slow_log', { connectionId, count });
}

/** Fetch the connected client list (on demand). */
export async function monitorClientList(connectionId: string): Promise<MonitorClientInfo[]> {
  return tauriInvoke<MonitorClientInfo[]>('monitor_client_list', { connectionId });
}

/** Kill a connected client by ID. */
export async function monitorKillClient(
  connectionId: string,
  clientId: number,
): Promise<void> {
  return tauriInvoke<void>('monitor_kill_client', { connectionId, clientId });
}

/** Fetch MEMORY STATS + MEMORY DOCTOR. */
export async function monitorMemoryStats(connectionId: string): Promise<MemoryStats> {
  return tauriInvoke<MemoryStats>('monitor_memory_stats', { connectionId });
}
```

**Step 2: Run TypeScript check**

Run: `pnpm tsc --noEmit 2>&1 | tail -5`
Expected: Clean

**Step 3: Commit**

```bash
git add src/lib/api/commands.ts
git commit -m "feat(frontend): add 7 monitor IPC wrappers"
```

---

## Task 10: Zustand Monitor Store

**Files:**
- Create: `src/lib/stores/monitor-store.ts`

**Step 1: Create the monitor store**

```typescript
// src/lib/stores/monitor-store.ts
// SPDX-License-Identifier: MIT

import { create } from 'zustand';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import * as api from '@/lib/api/commands';
import type {
  StatsSnapshot,
  SlowLogEntry,
  ClientInfo as MonitorClientInfo,
  MemoryStats,
  ServerInfo,
  DerivedMetrics,
} from '@/lib/api/types';

const MAX_TIME_SERIES = 300; // 10 minutes at 2s interval

interface MonitorStore {
  /** Sliding window of stats snapshots for charts. */
  timeSeries: StatsSnapshot[];

  /** Most recent server info. */
  latestInfo: ServerInfo | null;

  /** Most recent derived metrics. */
  latestDerived: DerivedMetrics | null;

  /** Whether polling is active. */
  polling: boolean;

  /** Slow log entries (fetched on demand). */
  slowLog: SlowLogEntry[];

  /** Connected clients (fetched on demand). */
  clientList: MonitorClientInfo[];

  /** Memory analysis (fetched on demand). */
  memoryStats: MemoryStats | null;

  /** Loading states for on-demand tabs. */
  loadingSlowLog: boolean;
  loadingClientList: boolean;
  loadingMemory: boolean;

  /** Error message if any. */
  error: string | null;

  /** Tauri event unlisten handle. */
  _unlisten: UnlistenFn | null;

  // Actions
  startPolling: (connectionId: string, intervalMs?: number) => Promise<void>;
  stopPolling: (connectionId: string) => Promise<void>;
  appendSnapshot: (snapshot: StatsSnapshot) => void;
  fetchSlowLog: (connectionId: string, count?: number) => Promise<void>;
  fetchClientList: (connectionId: string) => Promise<void>;
  killClient: (connectionId: string, clientId: number) => Promise<void>;
  fetchMemoryStats: (connectionId: string) => Promise<void>;
  reset: () => void;
}

const initialState = {
  timeSeries: [] as StatsSnapshot[],
  latestInfo: null as ServerInfo | null,
  latestDerived: null as DerivedMetrics | null,
  polling: false,
  slowLog: [] as SlowLogEntry[],
  clientList: [] as MonitorClientInfo[],
  memoryStats: null as MemoryStats | null,
  loadingSlowLog: false,
  loadingClientList: false,
  loadingMemory: false,
  error: null as string | null,
  _unlisten: null as UnlistenFn | null,
};

export const useMonitorStore = create<MonitorStore>((set, get) => ({
  ...initialState,

  startPolling: async (connectionId, intervalMs = 2000) => {
    // Clean up any existing listener
    const existing = get()._unlisten;
    if (existing) {
      existing();
    }

    try {
      // Subscribe to Tauri events BEFORE starting the poller
      const unlisten = await listen<StatsSnapshot>('monitor:stats', (event) => {
        get().appendSnapshot(event.payload);
      });

      set({ _unlisten: unlisten, polling: true, error: null });

      await api.monitorStartPolling(connectionId, intervalMs);
    } catch (e) {
      set({ error: String(e), polling: false });
    }
  },

  stopPolling: async (connectionId) => {
    try {
      await api.monitorStopPolling(connectionId);
    } catch {
      // Best-effort stop
    }

    const unlisten = get()._unlisten;
    if (unlisten) {
      unlisten();
    }

    set({ polling: false, _unlisten: null });
  },

  appendSnapshot: (snapshot) => {
    set((state) => {
      const next = [...state.timeSeries, snapshot];
      // Ring buffer: keep only the last MAX_TIME_SERIES entries
      const trimmed = next.length > MAX_TIME_SERIES ? next.slice(-MAX_TIME_SERIES) : next;
      return {
        timeSeries: trimmed,
        latestInfo: snapshot.info,
        latestDerived: snapshot.derived,
      };
    });
  },

  fetchSlowLog: async (connectionId, count = 50) => {
    set({ loadingSlowLog: true });
    try {
      const entries = await api.monitorSlowLog(connectionId, count);
      set({ slowLog: entries, loadingSlowLog: false });
    } catch (e) {
      set({ error: String(e), loadingSlowLog: false });
    }
  },

  fetchClientList: async (connectionId) => {
    set({ loadingClientList: true });
    try {
      const clients = await api.monitorClientList(connectionId);
      set({ clientList: clients, loadingClientList: false });
    } catch (e) {
      set({ error: String(e), loadingClientList: false });
    }
  },

  killClient: async (connectionId, clientId) => {
    try {
      await api.monitorKillClient(connectionId, clientId);
      // Refresh client list after kill
      const clients = await api.monitorClientList(connectionId);
      set({ clientList: clients });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  fetchMemoryStats: async (connectionId) => {
    set({ loadingMemory: true });
    try {
      const stats = await api.monitorMemoryStats(connectionId);
      set({ memoryStats: stats, loadingMemory: false });
    } catch (e) {
      set({ error: String(e), loadingMemory: false });
    }
  },

  reset: () => {
    const unlisten = get()._unlisten;
    if (unlisten) {
      unlisten();
    }
    set({ ...initialState });
  },
}));
```

**Step 2: Run TypeScript check**

Run: `pnpm tsc --noEmit 2>&1 | tail -5`
Expected: Clean

**Step 3: Commit**

```bash
git add src/lib/stores/monitor-store.ts
git commit -m "feat(frontend): add Zustand monitor store with event streaming"
```

---

## Task 11: Install Recharts

**Step 1: Install recharts**

Run: `pnpm add recharts`

**Step 2: Run TypeScript check**

Run: `pnpm tsc --noEmit 2>&1 | tail -5`
Expected: Clean

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "deps(frontend): add recharts for monitoring charts"
```

---

## Task 12: MetricCard Component

**Files:**
- Create: `src/components/modules/monitor/MetricCard.tsx`

**Step 1: Create the MetricCard component**

```tsx
// src/components/modules/monitor/MetricCard.tsx
'use client';

// SPDX-License-Identifier: MIT

interface MetricCardProps {
  label: string;
  value: string;
  subtitle?: string;
  trend?: 'up' | 'down' | 'stable';
  status?: 'good' | 'warning' | 'critical';
}

export function MetricCard({ label, value, subtitle, trend, status }: MetricCardProps) {
  const statusColor =
    status === 'critical'
      ? 'text-red-500'
      : status === 'warning'
        ? 'text-yellow-500'
        : 'text-green-500';

  const trendIcon =
    trend === 'up' ? '\u2191' : trend === 'down' ? '\u2193' : '';

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-1">
        <p className={`text-2xl font-bold ${status ? statusColor : ''}`}>{value}</p>
        {trendIcon && (
          <span className={`text-sm ${trend === 'up' ? 'text-green-500' : 'text-red-500'}`}>
            {trendIcon}
          </span>
        )}
      </div>
      {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
```

**Step 2: Run checks**

Run: `pnpm tsc --noEmit 2>&1 | tail -5`
Expected: Clean

Run: `pnpm lint 2>&1 | tail -5`
Expected: Clean

**Step 3: Commit**

```bash
git add src/components/modules/monitor/MetricCard.tsx
git commit -m "feat(frontend): add MetricCard component"
```

---

## Task 13: OpsChart and MemoryChart Components

**Files:**
- Create: `src/components/modules/monitor/OpsChart.tsx`
- Create: `src/components/modules/monitor/MemoryChart.tsx`

**Step 1: Create the OpsChart component**

```tsx
// src/components/modules/monitor/OpsChart.tsx
'use client';

// SPDX-License-Identifier: MIT

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { StatsSnapshot } from '@/lib/api/types';

interface OpsChartProps {
  data: StatsSnapshot[];
}

export function OpsChart({ data }: OpsChartProps) {
  const chartData = data.map((s) => ({
    time: new Date(s.timestampMs).toLocaleTimeString(),
    opsPerSec: s.info.stats.instantaneousOpsPerSec,
  }));

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-2 text-sm font-medium">Operations / sec</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData}>
          <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="opsPerSec"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

**Step 2: Create the MemoryChart component**

```tsx
// src/components/modules/monitor/MemoryChart.tsx
'use client';

// SPDX-License-Identifier: MIT

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { StatsSnapshot } from '@/lib/api/types';

interface MemoryChartProps {
  data: StatsSnapshot[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${val.toFixed(1)} ${sizes[i]}`;
}

export function MemoryChart({ data }: MemoryChartProps) {
  const chartData = data.map((s) => ({
    time: new Date(s.timestampMs).toLocaleTimeString(),
    used: s.info.memory.usedMemory,
    rss: s.info.memory.usedMemoryRss,
  }));

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-2 text-sm font-medium">Memory Usage</h3>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData}>
          <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={formatBytes} />
          <Tooltip formatter={(value: number) => formatBytes(value)} />
          <Area
            type="monotone"
            dataKey="rss"
            stroke="hsl(var(--destructive))"
            fill="hsl(var(--destructive) / 0.1)"
            strokeWidth={1}
            dot={false}
            name="RSS"
          />
          <Area
            type="monotone"
            dataKey="used"
            stroke="hsl(var(--primary))"
            fill="hsl(var(--primary) / 0.1)"
            strokeWidth={2}
            dot={false}
            name="Used"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
```

**Step 3: Run checks**

Run: `pnpm tsc --noEmit 2>&1 | tail -5`
Expected: Clean

**Step 4: Commit**

```bash
git add src/components/modules/monitor/OpsChart.tsx
git add src/components/modules/monitor/MemoryChart.tsx
git commit -m "feat(frontend): add OpsChart and MemoryChart components"
```

---

## Task 14: Tabbed Content Panels (ServerInfoPanel, SlowLogTable, ClientListTable, MemoryAnalysisPanel)

**Files:**
- Create: `src/components/modules/monitor/ServerInfoPanel.tsx`
- Create: `src/components/modules/monitor/SlowLogTable.tsx`
- Create: `src/components/modules/monitor/ClientListTable.tsx`
- Create: `src/components/modules/monitor/MemoryAnalysisPanel.tsx`

**Step 1: Create ServerInfoPanel**

```tsx
// src/components/modules/monitor/ServerInfoPanel.tsx
'use client';

// SPDX-License-Identifier: MIT

import type { ServerInfo } from '@/lib/api/types';

interface ServerInfoPanelProps {
  info: ServerInfo;
}

export function ServerInfoPanel({ info }: ServerInfoPanelProps) {
  const rows = [
    ['Redis Version', info.server.redisVersion],
    ['Mode', info.server.redisMode],
    ['OS', info.server.os],
    ['Port', String(info.server.tcpPort)],
    ['Uptime', formatUptime(info.server.uptimeInSeconds)],
    ['Connected Clients', String(info.clients.connectedClients)],
    ['Blocked Clients', String(info.clients.blockedClients)],
    ['Memory Used', info.memory.usedMemoryHuman],
    ['Memory Peak', info.memory.usedMemoryPeakHuman],
    ['Max Memory', info.memory.maxmemoryHuman || 'No limit'],
    ['Fragmentation Ratio', info.memory.memFragmentationRatio.toFixed(2)],
    ['Role', info.replication.role],
    ['Connected Slaves', String(info.replication.connectedSlaves)],
    ['Total Commands', info.stats.totalCommandsProcessed.toLocaleString()],
    ['Expired Keys', info.stats.expiredKeys.toLocaleString()],
    ['Evicted Keys', info.stats.evictedKeys.toLocaleString()],
  ];

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-b last:border-b-0">
              <td className="py-2 pr-4 font-medium text-muted-foreground">{label}</td>
              <td className="py-2 font-mono">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {info.keyspace.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-2 text-sm font-medium">Keyspace</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-1">DB</th>
                <th className="py-1">Keys</th>
                <th className="py-1">Expires</th>
                <th className="py-1">Avg TTL</th>
              </tr>
            </thead>
            <tbody>
              {info.keyspace.map((db) => (
                <tr key={db.index} className="border-b last:border-b-0">
                  <td className="py-1 font-mono">db{db.index}</td>
                  <td className="py-1 font-mono">{db.keys.toLocaleString()}</td>
                  <td className="py-1 font-mono">{db.expires.toLocaleString()}</td>
                  <td className="py-1 font-mono">{db.avgTtl}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
```

**Step 2: Create SlowLogTable**

```tsx
// src/components/modules/monitor/SlowLogTable.tsx
'use client';

// SPDX-License-Identifier: MIT

import { useEffect } from 'react';
import { useMonitorStore } from '@/lib/stores/monitor-store';
import { Button } from '@/components/ui/button';

interface SlowLogTableProps {
  connectionId: string;
}

export function SlowLogTable({ connectionId }: SlowLogTableProps) {
  const { slowLog, loadingSlowLog, fetchSlowLog } = useMonitorStore();

  useEffect(() => {
    fetchSlowLog(connectionId);
  }, [connectionId, fetchSlowLog]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-medium">Slow Log</h4>
        <Button size="sm" variant="outline" onClick={() => fetchSlowLog(connectionId)}>
          {loadingSlowLog ? 'Loading...' : 'Refresh'}
        </Button>
      </div>
      {slowLog.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {loadingSlowLog ? 'Loading...' : 'No slow log entries'}
        </p>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-1 pr-2">ID</th>
                <th className="py-1 pr-2">Time</th>
                <th className="py-1 pr-2">Duration</th>
                <th className="py-1 pr-2">Command</th>
                <th className="py-1 pr-2">Client</th>
              </tr>
            </thead>
            <tbody>
              {slowLog.map((entry) => (
                <tr key={entry.id} className="border-b last:border-b-0">
                  <td className="py-1 pr-2 font-mono text-xs">{entry.id}</td>
                  <td className="py-1 pr-2 text-xs">
                    {new Date(entry.timestamp * 1000).toLocaleString()}
                  </td>
                  <td className="py-1 pr-2 font-mono text-xs">
                    {(entry.durationUs / 1000).toFixed(1)}ms
                  </td>
                  <td className="max-w-[300px] truncate py-1 pr-2 font-mono text-xs">
                    {entry.command}
                  </td>
                  <td className="py-1 pr-2 text-xs">{entry.clientAddr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

**Step 3: Create ClientListTable**

```tsx
// src/components/modules/monitor/ClientListTable.tsx
'use client';

// SPDX-License-Identifier: MIT

import { useEffect, useState } from 'react';
import { useMonitorStore } from '@/lib/stores/monitor-store';
import { Button } from '@/components/ui/button';

interface ClientListTableProps {
  connectionId: string;
}

export function ClientListTable({ connectionId }: ClientListTableProps) {
  const { clientList, loadingClientList, fetchClientList, killClient } = useMonitorStore();
  const [killingId, setKillingId] = useState<number | null>(null);

  useEffect(() => {
    fetchClientList(connectionId);
  }, [connectionId, fetchClientList]);

  const handleKill = async (clientId: number) => {
    setKillingId(clientId);
    await killClient(connectionId, clientId);
    setKillingId(null);
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-medium">
          Connected Clients ({clientList.length})
        </h4>
        <Button size="sm" variant="outline" onClick={() => fetchClientList(connectionId)}>
          {loadingClientList ? 'Loading...' : 'Refresh'}
        </Button>
      </div>
      {clientList.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {loadingClientList ? 'Loading...' : 'No clients'}
        </p>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-1 pr-2">ID</th>
                <th className="py-1 pr-2">Address</th>
                <th className="py-1 pr-2">Age</th>
                <th className="py-1 pr-2">Idle</th>
                <th className="py-1 pr-2">DB</th>
                <th className="py-1 pr-2">Cmd</th>
                <th className="py-1 pr-2">Name</th>
                <th className="py-1 pr-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {clientList.map((client) => (
                <tr key={client.id} className="border-b last:border-b-0">
                  <td className="py-1 pr-2 font-mono text-xs">{client.id}</td>
                  <td className="py-1 pr-2 font-mono text-xs">{client.addr}</td>
                  <td className="py-1 pr-2 text-xs">{client.age}s</td>
                  <td className="py-1 pr-2 text-xs">{client.idle}s</td>
                  <td className="py-1 pr-2 font-mono text-xs">{client.db}</td>
                  <td className="py-1 pr-2 font-mono text-xs">{client.cmd}</td>
                  <td className="py-1 pr-2 text-xs">{client.name || '-'}</td>
                  <td className="py-1 pr-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-6 px-2 text-xs"
                      onClick={() => handleKill(client.id)}
                      disabled={killingId === client.id}
                    >
                      {killingId === client.id ? '...' : 'Kill'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

**Step 4: Create MemoryAnalysisPanel**

```tsx
// src/components/modules/monitor/MemoryAnalysisPanel.tsx
'use client';

// SPDX-License-Identifier: MIT

import { useEffect } from 'react';
import { useMonitorStore } from '@/lib/stores/monitor-store';
import { Button } from '@/components/ui/button';

interface MemoryAnalysisPanelProps {
  connectionId: string;
}

export function MemoryAnalysisPanel({ connectionId }: MemoryAnalysisPanelProps) {
  const { memoryStats, loadingMemory, fetchMemoryStats } = useMonitorStore();

  useEffect(() => {
    fetchMemoryStats(connectionId);
  }, [connectionId, fetchMemoryStats]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-medium">Memory Analysis</h4>
        <Button size="sm" variant="outline" onClick={() => fetchMemoryStats(connectionId)}>
          {loadingMemory ? 'Loading...' : 'Refresh'}
        </Button>
      </div>
      {!memoryStats ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {loadingMemory ? 'Loading...' : 'No memory data'}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/50 p-3">
            <h5 className="mb-1 text-xs font-medium">MEMORY DOCTOR</h5>
            <p className="whitespace-pre-wrap font-mono text-xs">{memoryStats.doctorAdvice}</p>
          </div>
          <div>
            <h5 className="mb-2 text-xs font-medium">MEMORY STATS</h5>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(memoryStats.stats).map(([key, value]) => (
                    <tr key={key} className="border-b last:border-b-0">
                      <td className="py-1 pr-4 font-mono text-xs text-muted-foreground">{key}</td>
                      <td className="py-1 font-mono text-xs">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 5: Run checks**

Run: `pnpm tsc --noEmit 2>&1 | tail -5`
Expected: Clean

Run: `pnpm lint 2>&1 | tail -5`
Expected: Clean

**Step 6: Commit**

```bash
git add src/components/modules/monitor/ServerInfoPanel.tsx
git add src/components/modules/monitor/SlowLogTable.tsx
git add src/components/modules/monitor/ClientListTable.tsx
git add src/components/modules/monitor/MemoryAnalysisPanel.tsx
git commit -m "feat(frontend): add monitor tab panels (ServerInfo, SlowLog, Clients, Memory)"
```

---

## Task 15: Monitor Dashboard Page

**Files:**
- Create: `src/app/connections/[id]/monitor/page.tsx`

**Step 1: Create the monitor dashboard page**

```tsx
// src/app/connections/[id]/monitor/page.tsx
'use client';

// SPDX-License-Identifier: MIT

import { use, useEffect, useState } from 'react';
import { useMonitorStore } from '@/lib/stores/monitor-store';
import { MetricCard } from '@/components/modules/monitor/MetricCard';
import { OpsChart } from '@/components/modules/monitor/OpsChart';
import { MemoryChart } from '@/components/modules/monitor/MemoryChart';
import { ServerInfoPanel } from '@/components/modules/monitor/ServerInfoPanel';
import { SlowLogTable } from '@/components/modules/monitor/SlowLogTable';
import { ClientListTable } from '@/components/modules/monitor/ClientListTable';
import { MemoryAnalysisPanel } from '@/components/modules/monitor/MemoryAnalysisPanel';

type Tab = 'server' | 'slowlog' | 'clients' | 'memory';

export default function MonitorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: connectionId } = use(params);
  const {
    timeSeries,
    latestInfo,
    latestDerived,
    polling,
    startPolling,
    stopPolling,
    reset,
  } = useMonitorStore();

  const [activeTab, setActiveTab] = useState<Tab>('server');

  // Start polling on mount, stop on unmount
  useEffect(() => {
    startPolling(connectionId);
    return () => {
      stopPolling(connectionId);
    };
  }, [connectionId, startPolling, stopPolling]);

  // Reset store when leaving the page entirely
  useEffect(() => {
    return () => {
      reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional cleanup-only effect
  }, []);

  const totalKeys = latestInfo?.keyspace.reduce((sum, db) => sum + db.keys, 0) ?? 0;

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Monitor Dashboard</h2>
        <div className="flex items-center gap-2 text-sm">
          <span className={`h-2 w-2 rounded-full ${polling ? 'bg-green-500' : 'bg-gray-400'}`} />
          <span className="text-muted-foreground">{polling ? '2s polling' : 'Stopped'}</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard
          label="Memory"
          value={latestInfo?.memory.usedMemoryHuman ?? '-'}
          subtitle={latestInfo?.memory.maxmemoryHuman ? `/ ${latestInfo.memory.maxmemoryHuman}` : undefined}
          status={
            latestDerived?.memoryUsagePercent
              ? latestDerived.memoryUsagePercent > 90
                ? 'critical'
                : latestDerived.memoryUsagePercent > 70
                  ? 'warning'
                  : 'good'
              : undefined
          }
        />
        <MetricCard
          label="Ops/sec"
          value={latestInfo?.stats.instantaneousOpsPerSec.toLocaleString() ?? '-'}
        />
        <MetricCard
          label="Clients"
          value={String(latestInfo?.clients.connectedClients ?? '-')}
        />
        <MetricCard
          label="Hit Rate"
          value={latestDerived ? `${latestDerived.hitRatePercent.toFixed(1)}%` : '-'}
          status={
            latestDerived
              ? latestDerived.hitRatePercent > 90
                ? 'good'
                : latestDerived.hitRatePercent > 50
                  ? 'warning'
                  : 'critical'
              : undefined
          }
        />
        <MetricCard
          label="Uptime"
          value={latestInfo ? formatUptime(latestInfo.server.uptimeInSeconds) : '-'}
        />
        <MetricCard
          label="Keys"
          value={totalKeys.toLocaleString()}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <OpsChart data={timeSeries} />
        <MemoryChart data={timeSeries} />
      </div>

      {/* Tabbed Content */}
      <div className="flex-1 rounded-lg border bg-card">
        <div className="flex border-b">
          {(['server', 'slowlog', 'clients', 'memory'] as Tab[]).map((tab) => (
            <button
              key={tab}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === tab
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'server'
                ? 'Server Info'
                : tab === 'slowlog'
                  ? 'Slow Log'
                  : tab === 'clients'
                    ? 'Clients'
                    : 'Memory'}
            </button>
          ))}
        </div>
        <div className="p-4">
          {activeTab === 'server' && latestInfo && <ServerInfoPanel info={latestInfo} />}
          {activeTab === 'slowlog' && <SlowLogTable connectionId={connectionId} />}
          {activeTab === 'clients' && <ClientListTable connectionId={connectionId} />}
          {activeTab === 'memory' && <MemoryAnalysisPanel connectionId={connectionId} />}
          {activeTab === 'server' && !latestInfo && (
            <p className="py-8 text-center text-sm text-muted-foreground">Waiting for data...</p>
          )}
        </div>
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
```

**Step 2: Remove .gitkeep from monitor components dir if it exists**

Run: `rm -f src/components/modules/monitor/.gitkeep`

**Step 3: Run full checks**

Run: `pnpm tsc --noEmit 2>&1 | tail -10`
Expected: Clean

Run: `pnpm lint 2>&1 | tail -10`
Expected: Clean

**Step 4: Commit**

```bash
git add src/app/connections/\[id\]/monitor/page.tsx
git rm -f --ignore-unmatch src/components/modules/monitor/.gitkeep
git commit -m "feat(frontend): add MonitorDashboard page with KPI cards, charts, tabbed panels"
```

---

## Task 16: Full Verification

**Step 1: Run all Rust tests**

Run: `cd src-tauri && cargo test 2>&1 | tail -25`
Expected: All tests pass (~100 total: 79 existing + ~25 new monitor tests)

**Step 2: Run Rust clippy**

Run: `cd src-tauri && cargo clippy 2>&1 | tail -10`
Expected: Clean

**Step 3: Run frontend TypeScript check**

Run: `pnpm tsc --noEmit 2>&1 | tail -10`
Expected: Clean

**Step 4: Run frontend lint**

Run: `pnpm lint 2>&1 | tail -10`
Expected: Clean

---

## Task 17: Update Memory Files

**Files:**
- Modify: `.claude/memory/progress.md`
- Modify: `.claude/memory/api-contracts.md`
- Modify: `.claude/memory/learnings.md`

**Step 1: Update progress.md**

- Phase 6 status: **Done**
- Add Sprint 5 backlog with all monitor tasks
- Update Milestone M6: Server Dashboard → **Done**
- Update Rust tests count
- Add Recent Activity entry

**Step 2: Update api-contracts.md**

Add 7 new monitor commands:
- `monitor_server_info` — request-response, returns `StatsSnapshot`
- `monitor_start_polling` — fire-and-forget, starts background task
- `monitor_stop_polling` — fire-and-forget, stops background task
- `monitor_slow_log` — request-response, returns `Vec<SlowLogEntry>`
- `monitor_client_list` — request-response, returns `Vec<ClientInfo>`
- `monitor_kill_client` — request-response, kills client by ID
- `monitor_memory_stats` — request-response, returns `MemoryStats`

Add event: `monitor:stats` — emitted every `interval_ms` with `StatsSnapshot` payload.

**Step 3: Add learnings**

Add entries for:
- Tauri event streaming pattern (background tokio task + AbortHandle)
- MonitorPoller as managed state alongside ConnectionManager

**Step 4: Commit**

```bash
git add .claude/memory/progress.md .claude/memory/api-contracts.md .claude/memory/learnings.md
git commit -m "docs: update memory files for Phase 6 completion"
```

---

## Summary

| Task | Description | New Tests | New Files |
|------|-------------|-----------|-----------|
| 1 | Rust monitor models | 0 | `model.rs` |
| 2 | Module wiring | 0 | `mod.rs` + 4 placeholders |
| 3 | INFO parser | 14 | `info_parser.rs` |
| 4 | Slow log parser | 5 | `slow_log.rs` |
| 5 | Client list parser | 4 | `client_list.rs` |
| 6 | Monitor poller | 2 | `poller.rs` |
| 7 | 7 Tauri commands | 0 | `commands/monitor.rs` |
| 8 | TS types | 0 | (modify `types.ts`) |
| 9 | IPC wrappers | 0 | (modify `commands.ts`) |
| 10 | Zustand store | 0 | `monitor-store.ts` |
| 11 | Install recharts | 0 | — |
| 12 | MetricCard | 0 | `MetricCard.tsx` |
| 13 | Charts | 0 | `OpsChart.tsx`, `MemoryChart.tsx` |
| 14 | Tab panels | 0 | 4 panel components |
| 15 | Dashboard page | 0 | `monitor/page.tsx` |
| 16 | Full verification | 0 | — |
| 17 | Memory files | 0 | — |

**Total: ~25 new Rust tests, 7 new Tauri commands, 1 Tauri event, 8 new frontend components, 1 new Zustand store**
