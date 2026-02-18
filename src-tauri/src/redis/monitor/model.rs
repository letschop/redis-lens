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

/// Per-database keyspace info (e.g., `db0:keys=123,expires=10,avg_ttl=5000`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseInfo {
    pub index: u8,
    pub keys: u64,
    pub expires: u64,
    pub avg_ttl: u64,
}

/// Metrics derived from `ServerInfo`.
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
