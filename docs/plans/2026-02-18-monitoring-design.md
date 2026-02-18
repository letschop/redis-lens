# Phase 6: Monitoring — Design Document

**Date:** 2026-02-18
**Status:** Approved
**Approach:** Hybrid (event streaming for real-time stats + on-demand for slow log, client list, memory)

---

## Overview

Build a full server monitoring suite for RedisLens: real-time dashboard with KPI
cards and time-series charts, slow log viewer, client list manager, and memory
analysis panel. The backend polls `INFO ALL` via a background tokio task and streams
snapshots to the frontend through Tauri events. Slow log, client list, and memory
analysis are fetched on demand.

## Architecture

### Data Flow

```
Frontend                  Backend                     Redis
   |                        |                           |
   | monitor_start_polling  |                           |
   |----------------------->| tokio::spawn              |
   |                        | loop {                    |
   |                        |   INFO ALL -------------->|
   |                        |<---- raw string           |
   |                        |   parse -> derive         |
   |  emit "monitor:stats"  |   emit event              |
   |<-----------------------|   sleep(interval)         |
   | listen() -> store      | }                         |
   |                        |                           |
   | monitor_slow_log       |                           |
   |----------------------->| SLOWLOG GET ------------->|
   |<-----------------------|<---- entries              |
```

### Polling Lifecycle

- `monitor_start_polling` spawns a tokio task, stores an `AbortHandle` keyed by
  connection ID.
- `monitor_stop_polling` aborts the task via the handle.
- Frontend starts polling on mount of the monitor page, stops on unmount.
- Disconnect cleans up all active pollers for that connection.

## Data Models

### ServerInfo (Rust)

```rust
pub struct ServerInfo {
    pub server: ServerSection,
    pub clients: ClientsSection,
    pub memory: MemorySection,
    pub stats: StatsSection,
    pub replication: ReplicationSection,
    pub keyspace: Vec<DatabaseInfo>,
    pub raw: HashMap<String, String>,
}

pub struct ServerSection {
    pub redis_version: String,
    pub redis_mode: String,
    pub os: String,
    pub uptime_in_seconds: u64,
    pub tcp_port: u16,
}

pub struct ClientsSection {
    pub connected_clients: u64,
    pub blocked_clients: u64,
    pub connected_slaves: u64,
}

pub struct MemorySection {
    pub used_memory: u64,
    pub used_memory_human: String,
    pub used_memory_rss: u64,
    pub used_memory_peak_human: String,
    pub maxmemory: u64,
    pub maxmemory_human: String,
    pub mem_fragmentation_ratio: f64,
}

pub struct StatsSection {
    pub instantaneous_ops_per_sec: u64,
    pub total_commands_processed: u64,
    pub keyspace_hits: u64,
    pub keyspace_misses: u64,
    pub expired_keys: u64,
    pub evicted_keys: u64,
}

pub struct ReplicationSection {
    pub role: String,
    pub connected_slaves: u64,
    pub master_repl_offset: Option<u64>,
}

pub struct DatabaseInfo {
    pub index: u8,
    pub keys: u64,
    pub expires: u64,
    pub avg_ttl: u64,
}
```

### DerivedMetrics

```rust
pub struct DerivedMetrics {
    pub hit_rate_percent: f64,
    pub memory_usage_percent: Option<f64>,
    pub fragmentation_health: FragmentationHealth,
}

pub enum FragmentationHealth {
    Good,       // < 1.5
    Warning,    // 1.5 - 2.0
    Critical,   // > 2.0
}
```

### StatsSnapshot (emitted via event)

```rust
pub struct StatsSnapshot {
    pub timestamp_ms: u64,
    pub info: ServerInfo,
    pub derived: DerivedMetrics,
}
```

### SlowLogEntry

```rust
pub struct SlowLogEntry {
    pub id: u64,
    pub timestamp: u64,
    pub duration_us: u64,
    pub command: String,
    pub client_addr: String,
    pub client_name: String,
}
```

### ClientInfo

```rust
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
```

### MemoryStats

```rust
pub struct MemoryStats {
    pub stats: HashMap<String, String>,
    pub doctor_advice: String,
}
```

## Tauri Commands (7)

| Command | Type | Redis Commands | Returns |
|---|---|---|---|
| `monitor_server_info` | request-response | `INFO ALL`, `DBSIZE` | `StatsSnapshot` |
| `monitor_start_polling` | fire-and-forget | (starts background task) | `()` |
| `monitor_stop_polling` | fire-and-forget | (stops background task) | `()` |
| `monitor_slow_log` | request-response | `SLOWLOG GET <count>` | `Vec<SlowLogEntry>` |
| `monitor_client_list` | request-response | `CLIENT LIST` | `Vec<ClientInfo>` |
| `monitor_kill_client` | request-response | `CLIENT KILL ID <id>` | `()` |
| `monitor_memory_stats` | request-response | `MEMORY STATS`, `MEMORY DOCTOR` | `MemoryStats` |

**Event:** `monitor:stats` emitted every `interval_ms` (default 2000) with
`StatsSnapshot` payload.

## Rust Module Structure

```
src-tauri/src/redis/monitor/
├── mod.rs
├── model.rs          // All structs above
├── info_parser.rs    // parse_info(&str) -> ServerInfo
├── poller.rs         // MonitorPoller with spawn/stop
├── slow_log.rs       // parse_slow_log(Vec<Value>) -> Vec<SlowLogEntry>
└── client_list.rs    // parse_client_list(&str) -> Vec<ClientInfo>

src-tauri/src/commands/monitor.rs   // 7 command handlers
```

## Frontend

### Monitor Store (Zustand)

```typescript
interface MonitorStore {
  timeSeries: StatsSnapshot[];      // sliding window, max 300 samples
  latestInfo: ServerInfo | null;
  latestDerived: DerivedMetrics | null;
  polling: boolean;

  slowLog: SlowLogEntry[];
  clientList: ClientInfo[];
  memoryStats: MemoryStats | null;

  startPolling: (connectionId: string, intervalMs?: number) => Promise<void>;
  stopPolling: (connectionId: string) => Promise<void>;
  appendSnapshot: (snapshot: StatsSnapshot) => void;
  fetchSlowLog: (connectionId: string, count?: number) => Promise<void>;
  fetchClientList: (connectionId: string) => Promise<void>;
  killClient: (connectionId: string, clientId: number) => Promise<void>;
  fetchMemoryStats: (connectionId: string) => Promise<void>;
  reset: () => void;
}
```

### Dashboard Layout

```
┌─────────────────────────────────────────────────────┐
│ Monitor Dashboard                    [2s polling ●]  │
├────────┬────────┬────────┬────────┬────────┬────────┤
│ Memory │ Ops/s  │Clients │Hit Rate│ Uptime │  Keys  │
├────────┴────────┴────────┴────────┴────────┴────────┤
│  Ops/sec LineChart (10min sliding window)             │
│  Memory AreaChart (used / rss / peak)                │
├──────────────────────────────────────────────────────┤
│  [Server Info] [Slow Log] [Clients] [Memory]         │
│  (tabbed content area)                               │
└──────────────────────────────────────────────────────┘
```

### Components

| Component | Purpose |
|---|---|
| `MonitorDashboard` | Page layout, polling lifecycle |
| `MetricCard` | Reusable KPI card (value, label, trend) |
| `OpsChart` | recharts LineChart from time series |
| `MemoryChart` | recharts AreaChart (used vs rss) |
| `ServerInfoPanel` | Key-value grid of server details |
| `SlowLogTable` | Sortable table, fetched on tab activation |
| `ClientListTable` | Sortable table with kill button |
| `MemoryAnalysisPanel` | Fragmentation, MEMORY DOCTOR advice |

## Testing

- **Rust unit tests:** INFO parser (multiple Redis versions), SLOWLOG parser,
  CLIENT LIST parser, derived metrics computation, poller start/stop lifecycle
- **Frontend:** Store snapshot accumulation, ring buffer overflow, tab switching
