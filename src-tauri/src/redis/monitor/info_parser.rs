// SPDX-License-Identifier: MIT

use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use super::model::{
    ClientsSection, DatabaseInfo, DerivedMetrics, FragmentationHealth, MemorySection,
    ReplicationSection, ServerInfo, ServerSection, StatsSection, StatsSnapshot,
};

/// Parse raw `INFO ALL` output into a structured `ServerInfo`.
#[allow(clippy::cast_possible_truncation)]
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
#[allow(clippy::cast_precision_loss)]
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
#[allow(clippy::cast_possible_truncation)]
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
            dbs.push(parse_db_info(i, value));
        }
    }
    dbs
}

/// Parse a single db info string like `keys=123,expires=10,avg_ttl=5000`.
fn parse_db_info(index: u8, raw: &str) -> DatabaseInfo {
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

    DatabaseInfo {
        index,
        keys,
        expires,
        avg_ttl,
    }
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
        assert_eq!(info.replication.master_repl_offset, Some(123_456));
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
        assert!(matches!(
            derived.fragmentation_health,
            FragmentationHealth::Good
        ));
    }

    #[test]
    fn test_derive_metrics_fragmentation_warning() {
        let mut info = parse_info(SAMPLE_INFO);
        info.memory.mem_fragmentation_ratio = 1.7;
        let derived = derive_metrics(&info);
        assert!(matches!(
            derived.fragmentation_health,
            FragmentationHealth::Warning
        ));
    }

    #[test]
    fn test_derive_metrics_fragmentation_critical() {
        let mut info = parse_info(SAMPLE_INFO);
        info.memory.mem_fragmentation_ratio = 2.5;
        let derived = derive_metrics(&info);
        assert!(matches!(
            derived.fragmentation_health,
            FragmentationHealth::Critical
        ));
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
