# RedisLens System Architecture Overview

**Version:** 1.0
**Date:** 2026-02-14
**Status:** Draft
**Authors:** RedisLens Core Team

---

## Table of Contents

1. [System Context Diagram](#1-system-context-diagram)
2. [Component Diagram](#2-component-diagram)
3. [Layer Architecture](#3-layer-architecture)
4. [Data Flow Diagrams](#4-data-flow-diagrams)
5. [IPC Protocol](#5-ipc-protocol)
6. [State Management](#6-state-management)
7. [Build and Packaging](#7-build-and-packaging)

---

## 1. System Context Diagram

The System Context Diagram shows RedisLens as a single box and its interactions
with external systems. RedisLens is a desktop application that communicates with
Redis servers over the network and uses local OS services for credential storage
and file persistence.

```
                        +-----------------------------+
                        |       Redis Server(s)       |
                        |                             |
                        |  Standalone / Cluster /     |
                        |  Sentinel                   |
                        +-----------------------------+
                             ^           ^
                             |           |
                  Redis Protocol    Pub/Sub Channel
                  (RESP2/RESP3)    (push messages)
                             |           |
                             v           v
+-------------------+  +-----------------------------+  +-------------------+
|   OS Keychain     |  |         RedisLens           |  |   File System     |
|                   |  |                             |  |                   |
| - macOS Keychain  |<-|  Desktop Application        |->| - Connection      |
| - Win Credential  |  |  (Tauri 2.x)               |  |   profiles (.json)|
|   Manager         |  |                             |  | - CLI history     |
| - Linux Secret    |  |  Rust backend +             |  | - App config      |
|   Service (dbus)  |  |  Next.js frontend           |  | - Export files    |
+-------------------+  +-----------------------------+  | - Log files       |
                             ^           ^              +-------------------+
                             |           |
                    OS native APIs   HTTPS (optional)
                             |           |
                             v           v
                        +-----------------------------+
                        |     Update Server           |
                        |     (GitHub Releases)       |
                        |                             |
                        |  - Version check            |
                        |  - Signed binary download   |
                        |  - Release notes            |
                        +-----------------------------+
```

### External System Descriptions

**Redis Server(s):**
The primary external dependency. RedisLens connects to one or more Redis servers
using the Redis protocol (RESP2 or RESP3). Connections may be direct, through an
SSH tunnel, or through TLS. RedisLens supports three deployment topologies:

- **Standalone:** Single Redis instance. Direct connection.
- **Cluster:** Multiple Redis nodes with automatic sharding. RedisLens discovers
  the full topology from any seed node and routes commands to the correct shard.
- **Sentinel:** Redis HA setup with automatic failover. RedisLens resolves the
  current master through Sentinel and monitors for failover events.

**OS Keychain:**
Stores sensitive credentials (Redis passwords, SSH keys, TLS private keys).
RedisLens never writes credentials to disk in plaintext. Platform-specific
implementations:

- macOS: Keychain Services API via `security-framework` crate
- Windows: Windows Credential Manager via `windows-credentials` crate
- Linux: Secret Service API (GNOME Keyring / KWallet) via `secret-service` crate

**File System:**
Stores non-sensitive persistent data in the OS application data directory:

- macOS: `~/Library/Application Support/com.redislens.app/`
- Windows: `%APPDATA%\RedisLens\`
- Linux: `~/.config/redislens/`

Files stored:
- `connections.json` — Connection profiles (credentials excluded, stored as keychain refs)
- `config.json` — Application configuration (theme, window bounds, preferences)
- `history/` — CLI history files (one per connection)
- `logs/` — Application log files (rotated, 7-day retention)

**Update Server (GitHub Releases):**
Optional. When update checking is enabled, RedisLens makes a single HTTPS
request to the GitHub Releases API to check for new versions. The request
contains only the current version and OS platform. If an update is available,
the signed binary is downloaded from GitHub Releases. Updates are verified with
an Ed25519 signature before installation.

---

## 2. Component Diagram

The Component Diagram shows the internal structure of RedisLens. The application
is divided into a Rust backend (running in the Tauri process) and a Next.js
frontend (running in the WebView). Communication between them flows through the
Tauri IPC bridge.

```
+============================================================================+
|                            RedisLens Application                           |
|                                                                            |
|  +----------------------------------------------------------------------+  |
|  |                     NEXT.JS FRONTEND (WebView)                       |  |
|  |                                                                      |  |
|  |  +------------------+  +------------------+  +-------------------+   |  |
|  |  |   App Shell      |  |  Connection UI   |  |   Browser UI      |   |  |
|  |  |                  |  |                  |  |                   |   |  |
|  |  |  - Layout        |  |  - Profile list  |  |  - Tree view      |   |  |
|  |  |  - Tab router    |  |  - URI input     |  |  - Virtual scroll |   |  |
|  |  |  - Keyboard mgr  |  |  - Field form    |  |  - Filter bar     |   |  |
|  |  |  - Theme engine  |  |  - Test button   |  |  - Bulk actions   |   |  |
|  |  |  - Status bar    |  |  - Import/Export |  |  - Context menu   |   |  |
|  |  +------------------+  +------------------+  +-------------------+   |  |
|  |                                                                      |  |
|  |  +------------------+  +------------------+  +-------------------+   |  |
|  |  |   Editor UI      |  |   Monitor UI     |  |   CLI UI          |   |  |
|  |  |                  |  |                  |  |                   |   |  |
|  |  |  - String editor |  |  - Stats cards   |  |  - Input line     |   |  |
|  |  |  - Hash editor   |  |  - Time charts   |  |  - Autocomplete   |   |  |
|  |  |  - List editor   |  |  - Slow log      |  |  - Output pane    |   |  |
|  |  |  - Set editor    |  |  - Client list   |  |  - History search |   |  |
|  |  |  - ZSet editor   |  |  - Memory view   |  |  - Format toggle  |   |  |
|  |  |  - Stream editor |  |  - Keyspace notif|  |  - Script editor  |   |  |
|  |  |  - JSON editor   |  |                  |  |                   |   |  |
|  |  +------------------+  +------------------+  +-------------------+   |  |
|  |                                                                      |  |
|  |  +------------------+  +-----------------------------------------+   |  |
|  |  |  PubSub UI       |  |           Zustand Stores                |   |  |
|  |  |                  |  |                                         |   |  |
|  |  |  - Subscribe     |  |  - connectionStore  (profiles, active) |   |  |
|  |  |  - Message list  |  |  - browserStore     (tree, selection)  |   |  |
|  |  |  - Channel filter|  |  - editorStore      (value, dirty)     |   |  |
|  |  |  - Publish       |  |  - monitorStore     (metrics, history) |   |  |
|  |  |  - Buffer mgmt   |  |  - cliStore         (history, output)  |   |  |
|  |  |                  |  |  - pubsubStore      (subs, messages)   |   |  |
|  |  |                  |  |  - settingsStore    (config, theme)    |   |  |
|  |  +------------------+  +-----------------------------------------+   |  |
|  |                                                                      |  |
|  +----------------------------------------------------------------------+  |
|                                    |                                       |
|                       Tauri IPC (invoke / events)                          |
|                                    |                                       |
|  +----------------------------------------------------------------------+  |
|  |                      RUST BACKEND (Tauri Process)                    |  |
|  |                                                                      |  |
|  |  +------------------+  +------------------+  +-------------------+   |  |
|  |  | Connection Mgr   |  |  Key Browser     |  |  Value Handler    |   |  |
|  |  |                  |  |                  |  |                   |   |  |
|  |  |  - Profile CRUD  |  |  - SCAN executor |  |  - Type detection |   |  |
|  |  |  - Pool manager  |  |  - Tree builder  |  |  - GET/SET family |   |  |
|  |  |  - Cluster disco |  |  - Pattern match |  |  - Serialization  |   |  |
|  |  |  - Sentinel res  |  |  - TTL resolver  |  |  - Encoding info  |   |  |
|  |  |  - SSH tunnel    |  |  - Memory sampler|  |  - Memory usage   |   |  |
|  |  |  - TLS handler   |  |                  |  |                   |   |  |
|  |  +------------------+  +------------------+  +-------------------+   |  |
|  |                                                                      |  |
|  |  +------------------+  +------------------+  +-------------------+   |  |
|  |  |   Monitor        |  |  CLI Executor    |  |  PubSub Manager   |   |  |
|  |  |                  |  |                  |  |                   |   |  |
|  |  |  - INFO poller   |  |  - Command parse |  |  - Subscribe mgr  |   |  |
|  |  |  - Slow log      |  |  - Execution     |  |  - Publish        |   |  |
|  |  |  - Client list   |  |  - Formatting    |  |  - Channel disco  |   |  |
|  |  |  - Memory doctor |  |  - Safety check  |  |  - Event relay    |   |  |
|  |  |  - Event emitter |  |  - History store |  |  - Buffer mgmt    |   |  |
|  |  +------------------+  +------------------+  +-------------------+   |  |
|  |                                                                      |  |
|  |  +-------------------------------+  +----------------------------+   |  |
|  |  |     Config Store              |  |   Credential Manager       |   |  |
|  |  |                               |  |                            |   |  |
|  |  |  - Profile persistence        |  |  - Keychain read/write     |   |  |
|  |  |  - App config persistence     |  |  - Memory zeroization      |   |  |
|  |  |  - Schema migration           |  |  - Platform abstraction    |   |  |
|  |  |  - File I/O                   |  |                            |   |  |
|  |  +-------------------------------+  +----------------------------+   |  |
|  |                                                                      |  |
|  |  +-------------------------------+  +----------------------------+   |  |
|  |  |     Logger                    |  |   Update Manager           |   |  |
|  |  |                               |  |                            |   |  |
|  |  |  - Structured logging         |  |  - Version check           |   |  |
|  |  |  - File rotation              |  |  - Download + verify       |   |  |
|  |  |  - Level filtering            |  |  - Install + restart       |   |  |
|  |  +-------------------------------+  +----------------------------+   |  |
|  |                                                                      |  |
|  +----------------------------------------------------------------------+  |
|                                                                            |
+============================================================================+
```

### Component Responsibilities

#### Frontend Components

**App Shell:**
The root layout component that provides the application frame. Manages the
tab-based navigation (Browser, Monitor, CLI, Pub/Sub), the connection indicator
in the status bar, the global keyboard shortcut handler, and the theme engine
(light/dark/system). The App Shell also handles window chrome (title bar style
on macOS, standard title bar on Windows/Linux).

**Connection UI:**
All UI related to managing and establishing Redis connections. Includes the
connection profile list (sidebar), the connection dialog (URI and field modes),
the SSH tunnel configuration panel, the TLS configuration panel, the "Test
Connection" functionality, and the import/export dialogs for sharing profiles.

**Browser UI:**
The key browser interface. Renders the tree view using virtual scrolling
(`@tanstack/virtual`), manages the filter bar (type, pattern, TTL), provides
the context menu (right-click on keys and folders), and coordinates bulk
selection and operations. The tree view is the most performance-critical frontend
component.

**Editor UI:**
The right panel that displays type-specific editors. Contains seven sub-editors
(String, Hash, List, Set, ZSet, Stream, JSON), each optimized for its data type.
The Editor UI selects the appropriate sub-editor based on the key's type, manages
the metadata bar (key name, TTL, encoding, size), and coordinates save/reset
operations.

**Monitor UI:**
Real-time server monitoring dashboard. Renders metric cards, time-series charts,
the slow log table, the client list table, and the memory analysis views. Charts
update from Tauri event pushes (not polling). Uses a ring buffer for historical
data points to bound memory usage.

**CLI UI:**
The built-in CLI console. Manages the command input line with autocomplete popup,
the output pane with formatted results, the history search overlay (Ctrl+R), and
the format toggle (table/JSON/raw). The CLI UI also handles the dangerous command
confirmation dialog.

**PubSub UI:**
The Pub/Sub viewer. Manages subscription controls (channel name input, pattern
toggle), the message stream display (virtual scrolled for large buffers),
channel filtering controls, and the publish dialog. Messages arrive via Tauri
events and are appended to a bounded buffer.

#### Backend Components

**Connection Manager:**
The central component for managing Redis connections. Responsibilities:

- CRUD operations on connection profiles (stored via Config Store)
- Creating and managing `deadpool-redis` connection pools
- Redis Cluster auto-discovery (`CLUSTER NODES` → topology map → per-node pools)
- Redis Sentinel master resolution (`SENTINEL get-master-addr-by-name`)
- SSH tunnel establishment (spawns an SSH process, forwards a local port)
- TLS configuration (rustls with custom CA, client certificates)
- Connection health monitoring (periodic PING, reconnection on failure)

Each active connection is identified by a `connection_id` (UUID) that the
frontend uses in all subsequent commands.

**Key Browser:**
Executes key enumeration and tree construction. Responsibilities:

- Running `SCAN` with cursor management (handles incomplete scans, pagination)
- Building the tree structure from flat keys using the configured delimiter
- Resolving key metadata in batches (`TYPE`, `TTL`, `OBJECT ENCODING`)
- Sampling key memory usage (`MEMORY USAGE` on selected keys)
- Pattern matching (translates glob patterns to SCAN MATCH arguments)

The Key Browser operates on a per-connection basis. Multiple connections can
browse simultaneously without interference.

**Value Handler:**
Reads and writes Redis values with type awareness. Responsibilities:

- Type detection (`TYPE` command) and dispatch to appropriate handler
- String: `GET`/`SET`, encoding detection (JSON, binary, plaintext)
- Hash: `HGETALL`/`HSET`/`HDEL`, field enumeration with `HSCAN` for large hashes
- List: `LRANGE`/`LPUSH`/`RPUSH`/`LSET`/`LREM`, paginated reads
- Set: `SMEMBERS`/`SADD`/`SREM`, member enumeration with `SSCAN` for large sets
- ZSet: `ZRANGE`/`ZADD`/`ZREM`, score-based and rank-based queries
- Stream: `XRANGE`/`XADD`/`XDEL`, consumer group info (`XINFO`)
- JSON: `JSON.GET`/`JSON.SET` with JSONPath support

All values are serialized as JSON for transport over IPC. Binary values are
Base64-encoded.

**Monitor:**
Collects and relays server statistics. Responsibilities:

- Polling `INFO` at configurable intervals (default: 2 seconds)
- Parsing the INFO response into structured fields
- Computing derived metrics (hit rate, fragmentation ratio)
- Emitting Tauri events with metric snapshots
- Fetching slow log entries (`SLOWLOG GET`)
- Fetching client list (`CLIENT LIST`)
- Running memory analysis (`MEMORY DOCTOR`, sampled `MEMORY USAGE`)

The Monitor runs on a per-connection tokio task. Starting and stopping the
monitor is controlled by the frontend.

**CLI Executor:**
Executes arbitrary Redis commands. Responsibilities:

- Parsing command strings into command + arguments
- Validating against a dangerous command list (FLUSHALL, FLUSHDB, etc.)
- Executing the command on the appropriate connection
- Formatting the response (raw RESP, structured table, JSON)
- Recording commands in the history store

**PubSub Manager:**
Manages Pub/Sub subscriptions. Responsibilities:

- Creating dedicated connections for Pub/Sub (cannot share with command connections)
- Managing subscriptions (`SUBSCRIBE`, `PSUBSCRIBE`)
- Receiving messages and relaying them as Tauri events
- Channel discovery (`PUBSUB CHANNELS`, `PUBSUB NUMSUB`)
- Publishing messages (`PUBLISH`)

Pub/Sub requires a dedicated Redis connection because a connection in subscribe
mode cannot execute other commands. The PubSub Manager maintains separate
connections from the main connection pool.

**Config Store:**
Manages persistent configuration. Responsibilities:

- Reading and writing the `connections.json` file
- Reading and writing the `config.json` file
- Schema migration (upgrading config format between versions)
- File locking (prevent concurrent writes from multiple instances)
- Atomic writes (write to temp file, then rename)

**Credential Manager:**
Interfaces with OS keychain services. Responsibilities:

- Storing credentials keyed by connection profile ID
- Retrieving credentials on demand (just before connection)
- Deleting credentials when profiles are removed
- Zeroing credential memory after use (`zeroize` crate)
- Platform abstraction (macOS Keychain / Windows Credential Manager / Linux Secret Service)

**Logger:**
Structured logging for diagnostics. Responsibilities:

- Log levels: ERROR, WARN, INFO, DEBUG, TRACE
- Structured fields (connection_id, command, duration)
- File output with daily rotation and 7-day retention
- Console output (development mode)
- No sensitive data in logs (credentials, key values)

**Update Manager:**
Handles application updates. Responsibilities:

- Version check against GitHub Releases API
- Download progress reporting
- Ed25519 signature verification
- Installation (Tauri built-in updater)
- User notification and consent

---

## 3. Layer Architecture

RedisLens follows a strict layered architecture where each layer only
communicates with the layer directly below it. This ensures separation of
concerns, testability, and a clear dependency direction.

```
+============================================================================+
|                                                                            |
|   PRESENTATION LAYER (Next.js / React / Tailwind CSS)                     |
|                                                                            |
|   React components, Zustand stores, CSS, layout, user event handling.     |
|   This layer renders the UI and captures user intent. It does NOT          |
|   perform any Redis operations or data processing. All side effects       |
|   flow through the IPC layer.                                             |
|                                                                            |
+============================================================================+
                                    |
                            invoke() / listen()
                                    |
+============================================================================+
|                                                                            |
|   IPC LAYER (Tauri IPC Bridge)                                            |
|                                                                            |
|   Typed TypeScript functions that call Tauri invoke(). Each function       |
|   corresponds to a Tauri command on the Rust side. Request/response       |
|   types are generated from Rust structs. Events flow from Rust to JS     |
|   via the Tauri event system.                                             |
|                                                                            |
+============================================================================+
                                    |
                        #[tauri::command] / app.emit()
                                    |
+============================================================================+
|                                                                            |
|   COMMAND LAYER (Rust / Tauri Commands)                                   |
|                                                                            |
|   Tauri command handler functions. Each function validates input,          |
|   acquires a connection from the pool, delegates to the appropriate       |
|   service, and serializes the response. Error handling and logging        |
|   happen here.                                                            |
|                                                                            |
+============================================================================+
                                    |
                            Service calls
                                    |
+============================================================================+
|                                                                            |
|   CLIENT LAYER (Rust / redis-rs / deadpool-redis)                         |
|                                                                            |
|   Redis client abstractions. Connection pooling with deadpool-redis.      |
|   Cluster slot routing and node management. Sentinel master resolution.   |
|   All Redis I/O happens in this layer. Async via tokio.                   |
|                                                                            |
+============================================================================+
                                    |
                          Redis Protocol (TCP/TLS)
                                    |
+============================================================================+
|                                                                            |
|   INFRASTRUCTURE LAYER (Rust / OS APIs)                                   |
|                                                                            |
|   Config file I/O, OS keychain access, SSH process management, logging,   |
|   update checking. Platform-specific code is isolated here behind         |
|   abstract traits.                                                        |
|                                                                            |
+============================================================================+
```

### 3.1 Presentation Layer

**Technology:** Next.js 14+ (App Router, static export), React 18+, TypeScript,
Tailwind CSS, shadcn/ui, Zustand, @tanstack/virtual.

**Responsibilities:**
- Render UI components (forms, tables, trees, charts, editors)
- Manage component-local state (form inputs, dialog open/close, hover states)
- Manage global state via Zustand stores (connections, browser tree, settings)
- Handle user events (clicks, keyboard shortcuts, drag-and-drop)
- Call IPC functions in response to user actions
- Listen for Tauri events and update stores accordingly
- Provide accessibility (ARIA, keyboard nav, screen reader support)

**Constraints:**
- MUST NOT import any Rust code or Node.js modules
- MUST NOT perform Redis operations directly
- MUST NOT access the file system or OS keychain
- MUST use the IPC layer for all side effects
- MUST handle loading states and errors gracefully
- MUST use virtual scrolling for lists exceeding 100 items

**Key patterns:**
- Components are split into "feature" components (Connection UI, Browser UI,
  etc.) and "primitive" components (Button, Input, Dialog, etc. from shadcn/ui)
- Feature components read from Zustand stores and dispatch IPC calls
- Zustand stores are organized by domain, not by UI structure
- Optimistic updates are used for fast UX (update store immediately, revert on
  error)

### 3.2 IPC Layer

**Technology:** Tauri IPC (`@tauri-apps/api`), TypeScript type definitions
generated from Rust structs.

**Responsibilities:**
- Provide typed TypeScript functions that wrap `invoke()` calls
- Define request and response types that match Rust command signatures
- Handle serialization (TypeScript objects to JSON) and deserialization
- Provide event listener wrappers that type the event payload
- Centralize error handling (convert Rust errors to TypeScript error types)

**Example IPC function:**

```typescript
// Generated or hand-written typed wrapper
import { invoke } from "@tauri-apps/api/core";

export interface ScanKeysRequest {
  connectionId: string;
  cursor: number;
  pattern: string;
  count: number;
  typeFilter: string | null;
}

export interface ScanKeysResponse {
  cursor: number;
  keys: KeyEntry[];
  isComplete: boolean;
}

export async function scanKeys(request: ScanKeysRequest): Promise<ScanKeysResponse> {
  return invoke<ScanKeysResponse>("scan_keys", request);
}
```

**Example event listener:**

```typescript
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface MonitorStatsEvent {
  connectionId: string;
  snapshot: MonitorSnapshot;
}

export function onMonitorStats(
  callback: (event: MonitorStatsEvent) => void
): Promise<UnlistenFn> {
  return listen<MonitorStatsEvent>("monitor:stats", (event) => {
    callback(event.payload);
  });
}
```

**Constraints:**
- Every IPC function MUST have typed request/response interfaces
- Error responses MUST follow the standard error format (see Section 5)
- Event names MUST follow the naming convention (see Section 5)
- The IPC layer MUST NOT contain business logic

### 3.3 Command Layer

**Technology:** Rust, Tauri 2.x `#[tauri::command]` macros, serde for
serialization.

**Responsibilities:**
- Define Tauri command handlers (entry points from IPC calls)
- Validate all input parameters (reject malformed requests)
- Acquire connections from the pool via Connection Manager
- Delegate to the appropriate service/handler
- Serialize responses to JSON (via serde)
- Handle and classify errors (connection errors, Redis errors, validation errors)
- Log operations with structured fields

**Example command handler:**

```rust
use tauri::State;
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct ScanKeysRequest {
    connection_id: String,
    cursor: u64,
    pattern: String,
    count: u32,
    type_filter: Option<String>,
}

#[derive(Serialize)]
pub struct ScanKeysResponse {
    cursor: u64,
    keys: Vec<KeyEntry>,
    is_complete: bool,
}

#[tauri::command]
pub async fn scan_keys(
    request: ScanKeysRequest,
    connection_mgr: State<'_, ConnectionManager>,
) -> Result<ScanKeysResponse, AppError> {
    // Validate input
    if request.count == 0 || request.count > 10000 {
        return Err(AppError::Validation("count must be between 1 and 10000".into()));
    }

    // Get connection pool
    let pool = connection_mgr
        .get_pool(&request.connection_id)
        .await
        .map_err(|e| AppError::Connection(e.to_string()))?;

    // Execute SCAN
    let mut conn = pool.get().await
        .map_err(|e| AppError::Connection(e.to_string()))?;

    let (new_cursor, keys): (u64, Vec<String>) = redis::cmd("SCAN")
        .arg(request.cursor)
        .arg("MATCH")
        .arg(&request.pattern)
        .arg("COUNT")
        .arg(request.count)
        .query_async(&mut *conn)
        .await
        .map_err(|e| AppError::Redis(e.to_string()))?;

    // Build response
    let key_entries = resolve_key_metadata(&mut conn, &keys).await?;

    Ok(ScanKeysResponse {
        cursor: new_cursor,
        keys: key_entries,
        is_complete: new_cursor == 0,
    })
}
```

**Constraints:**
- Commands MUST validate all input before any Redis operation
- Commands MUST NOT hold connection pool locks across await points
- Commands MUST return typed Result<T, AppError> (never panic)
- Commands MUST log errors with structured context
- Commands MUST be registered in the Tauri builder

### 3.4 Client Layer

**Technology:** Rust, `redis-rs` (async, cluster, sentinel), `deadpool-redis`
(connection pooling), `tokio` (async runtime).

**Responsibilities:**
- Establish and maintain Redis connections
- Manage connection pools (one pool per active connection profile)
- Route cluster commands to the correct node (based on key slot)
- Resolve sentinel masters and handle failover
- Handle TLS negotiation (rustls)
- Manage SSH tunnels (background process)
- Implement reconnection logic (exponential backoff)

**Connection pool architecture:**

```
ConnectionManager
  |
  +-- pools: HashMap<ConnectionId, PoolEntry>
       |
       +-- PoolEntry (Standalone)
       |     |
       |     +-- pool: deadpool_redis::Pool (single node)
       |     +-- config: ConnectionProfile
       |     +-- ssh_tunnel: Option<SshTunnel>
       |
       +-- PoolEntry (Cluster)
       |     |
       |     +-- cluster_client: redis::cluster_async::ClusterConnection
       |     +-- topology: ClusterTopology
       |     +-- config: ConnectionProfile
       |
       +-- PoolEntry (Sentinel)
             |
             +-- sentinel: redis::sentinel::SentinelClient
             +-- master_pool: deadpool_redis::Pool (resolved master)
             +-- config: ConnectionProfile
```

**Pool configuration:**

| Parameter           | Value    | Rationale                                   |
|---------------------|----------|---------------------------------------------|
| Max pool size       | 8        | Desktop app, limited concurrency            |
| Min idle            | 1        | Keep one warm connection for instant response|
| Connection timeout  | 5s       | Fail fast for unresponsive servers           |
| Idle timeout        | 300s     | Reclaim unused connections after 5 minutes   |
| Max lifetime        | 3600s    | Recycle connections hourly                   |
| Wait queue          | 16       | Queue IPC calls when all connections busy    |

**Cluster routing:**

When RedisLens connects to a Redis Cluster, the client layer:

1. Connects to the seed node specified in the connection profile
2. Executes `CLUSTER NODES` to discover all nodes and slot assignments
3. Creates internal connection pools for each master node
4. For each command, calculates the key's hash slot: `CRC16(key) % 16384`
5. Routes the command to the node owning that slot
6. Handles `-MOVED` and `-ASK` redirections transparently
7. Periodically refreshes the topology (every 60 seconds or on redirect)

**Sentinel resolution:**

1. Connects to one or more Sentinel nodes from the profile
2. Issues `SENTINEL get-master-addr-by-name <master_name>`
3. Receives the current master host:port
4. Establishes a connection pool to the resolved master
5. Subscribes to `+switch-master` channel on Sentinel
6. On failover: resolves new master, drains old pool, creates new pool
7. In-flight commands receive a retriable error

**Constraints:**
- All Redis I/O MUST be async (no blocking)
- Connection pools MUST be bounded (prevent resource exhaustion)
- Cluster routing MUST handle redirections automatically
- Sentinel failover MUST be transparent to the command layer
- SSH tunnels MUST be managed as child processes with cleanup on exit
- TLS MUST default to verifying server certificates

### 3.5 Infrastructure Layer

**Technology:** Rust, platform-specific crates, `tracing` for logging.

**Responsibilities:**
- File I/O for configuration and history persistence
- OS keychain access for credential storage
- SSH process management (spawn, monitor, kill)
- Structured logging with tracing spans
- Application update management

**Platform abstraction:**

```rust
// Trait for keychain operations (implemented per-platform)
#[async_trait]
pub trait CredentialStore: Send + Sync {
    async fn store(&self, key: &str, value: &[u8]) -> Result<(), CredentialError>;
    async fn retrieve(&self, key: &str) -> Result<Vec<u8>, CredentialError>;
    async fn delete(&self, key: &str) -> Result<(), CredentialError>;
}

// macOS implementation uses security-framework
// Windows implementation uses windows-credentials
// Linux implementation uses secret-service (dbus)
```

**Config file management:**

```rust
pub struct ConfigStore {
    base_dir: PathBuf,  // OS app data directory
}

impl ConfigStore {
    /// Write config atomically (write to .tmp, then rename)
    pub async fn write_config(&self, config: &AppConfig) -> Result<(), ConfigError> {
        let path = self.base_dir.join("config.json");
        let tmp_path = self.base_dir.join("config.json.tmp");

        let json = serde_json::to_string_pretty(config)?;
        tokio::fs::write(&tmp_path, json).await?;
        tokio::fs::rename(&tmp_path, &path).await?;

        Ok(())
    }
}
```

**Constraints:**
- Config writes MUST be atomic (write + rename)
- Credential memory MUST be zeroed after use
- SSH processes MUST be cleaned up on application exit
- Log files MUST NOT contain sensitive data
- Platform-specific code MUST be behind abstract traits

---

## 4. Data Flow Diagrams

### 4.1 Connecting to Redis

This sequence shows what happens when a user creates a new connection profile and
connects to a standalone Redis instance.

```
  User              Frontend           IPC Layer       Command Layer      Client Layer       Infra Layer
   |                   |                   |               |                   |                  |
   |  Fill form +      |                   |               |                   |                  |
   |  click Connect    |                   |               |                   |                  |
   |------------------>|                   |               |                   |                  |
   |                   |  Validate form    |               |                   |                  |
   |                   |  (client-side)    |               |                   |                  |
   |                   |                   |               |                   |                  |
   |                   |  invoke("create_connection",      |                   |                  |
   |                   |    { profile })   |               |                   |                  |
   |                   |------------------>|               |                   |                  |
   |                   |                   |  Deserialize  |                   |                  |
   |                   |                   |  + forward    |                   |                  |
   |                   |                   |-------------->|                   |                  |
   |                   |                   |               |  Validate input   |                  |
   |                   |                   |               |  (host, port,     |                  |
   |                   |                   |               |   required fields)|                  |
   |                   |                   |               |                   |                  |
   |                   |                   |               |  Store password   |                  |
   |                   |                   |               |  in keychain      |                  |
   |                   |                   |               |------------------------------------>|
   |                   |                   |               |                   |   keychain.store |
   |                   |                   |               |<------------------------------------|
   |                   |                   |               |                   |                  |
   |                   |                   |               |  Save profile     |                  |
   |                   |                   |               |  (without pwd)    |                  |
   |                   |                   |               |------------------------------------>|
   |                   |                   |               |                   | config.write     |
   |                   |                   |               |<------------------------------------|
   |                   |                   |               |                   |                  |
   |                   |                   |               |  Create pool      |                  |
   |                   |                   |               |------------------>|                  |
   |                   |                   |               |                   |  Retrieve pwd    |
   |                   |                   |               |                   |  from keychain   |
   |                   |                   |               |                   |----------------->|
   |                   |                   |               |                   |<-----------------|
   |                   |                   |               |                   |                  |
   |                   |                   |               |                   |  redis::connect  |
   |                   |                   |               |                   |  + AUTH + SELECT |
   |                   |                   |               |                   |--------+        |
   |                   |                   |               |                   |        | Redis  |
   |                   |                   |               |                   |<-------+        |
   |                   |                   |               |                   |                  |
   |                   |                   |               |                   |  PING (verify)   |
   |                   |                   |               |                   |--------+        |
   |                   |                   |               |                   |        | PONG   |
   |                   |                   |               |                   |<-------+        |
   |                   |                   |               |                   |                  |
   |                   |                   |               |  Pool ready       |                  |
   |                   |                   |               |<------------------|                  |
   |                   |                   |               |                   |                  |
   |                   |                   |  ConnectionId |                   |                  |
   |                   |                   |<--------------|                   |                  |
   |                   |  { connectionId,  |               |                   |                  |
   |                   |    serverInfo }   |               |                   |                  |
   |                   |<------------------|               |                   |                  |
   |                   |                   |               |                   |                  |
   |                   |  Update stores:   |               |                   |                  |
   |                   |  connectionStore  |               |                   |                  |
   |                   |  .setActive()     |               |                   |                  |
   |                   |                   |               |                   |                  |
   |  Show browser     |                   |               |                   |                  |
   |  with connection  |                   |               |                   |                  |
   |  indicator        |                   |               |                   |                  |
   |<------------------|                   |               |                   |                  |
   |                   |                   |               |                   |                  |
```

### 4.2 Browsing Keys

This sequence shows the SCAN-based key loading process with incremental tree
building.

```
  User              Frontend           IPC Layer       Command Layer      Client Layer
   |                   |                   |               |                   |
   |  Click "Refresh"  |                   |               |                   |
   |  or open browser  |                   |               |                   |
   |------------------>|                   |               |                   |
   |                   |                   |               |                   |
   |                   |  browserStore     |               |                   |
   |                   |  .startScan()     |               |                   |
   |                   |  cursor = 0       |               |                   |
   |                   |                   |               |                   |
   |                   |  invoke("scan_keys", {            |                   |
   |                   |    connectionId,                  |                   |
   |                   |    cursor: 0,                     |                   |
   |                   |    pattern: "*",                  |                   |
   |                   |    count: 500 })                  |                   |
   |                   |------------------>|               |                   |
   |                   |                   |-------------->|                   |
   |                   |                   |               |                   |
   |                   |                   |               |  SCAN 0 MATCH *   |
   |                   |                   |               |  COUNT 500        |
   |                   |                   |               |------------------>|
   |                   |                   |               |                   | ---+
   |                   |                   |               |                   |    | Redis SCAN
   |                   |                   |               |<------------------|<---+
   |                   |                   |               |  (cursor=15872,   |
   |                   |                   |               |   keys=[...])     |
   |                   |                   |               |                   |
   |                   |                   |               |  Pipeline:        |
   |                   |                   |               |  TYPE k1          |
   |                   |                   |               |  TYPE k2          |
   |                   |                   |               |  ...              |
   |                   |                   |               |  TTL k1           |
   |                   |                   |               |  TTL k2           |
   |                   |                   |               |  ...              |
   |                   |                   |               |------------------>|
   |                   |                   |               |<------------------|
   |                   |                   |               |                   |
   |                   |                   |               |  Build KeyEntry   |
   |                   |                   |               |  objects          |
   |                   |                   |               |                   |
   |                   |                   |  { cursor: 15872,                 |
   |                   |                   |    keys: [...],                   |
   |                   |                   |    isComplete: false }            |
   |                   |<------------------|<--------------|                   |
   |                   |                   |               |                   |
   |                   |  browserStore     |               |                   |
   |                   |  .appendKeys()    |               |                   |
   |                   |  Build tree nodes |               |                   |
   |                   |                   |               |                   |
   |  Tree renders     |                   |               |                   |
   |  (partial)        |                   |               |                   |
   |<------------------|                   |               |                   |
   |                   |                   |               |                   |
   |                   |  isComplete=false |               |                   |
   |                   |  so auto-fetch    |               |                   |
   |                   |  next page:       |               |                   |
   |                   |                   |               |                   |
   |                   |  invoke("scan_keys", {            |                   |
   |                   |    cursor: 15872,                 |                   |
   |                   |    ... })                         |                   |
   |                   |------------------>|               |                   |
   |                   |                   |               |                   |
   |                   |  ... (repeat until cursor = 0) ...|                   |
   |                   |                   |               |                   |
   |                   |  Final response:  |               |                   |
   |                   |  { cursor: 0,     |               |                   |
   |                   |    isComplete: true}              |                   |
   |                   |<------------------|               |                   |
   |                   |                   |               |                   |
   |                   |  browserStore     |               |                   |
   |                   |  .scanComplete()  |               |                   |
   |                   |                   |               |                   |
   |  Tree fully       |                   |               |                   |
   |  populated        |                   |               |                   |
   |<------------------|                   |               |                   |
```

### 4.3 Editing a Value

This sequence shows the read-modify-write flow for editing a Hash field.

```
  User              Frontend           IPC Layer       Command Layer      Client Layer
   |                   |                   |               |                   |
   |  Click key        |                   |               |                   |
   |  "user:42:config" |                   |               |                   |
   |------------------>|                   |               |                   |
   |                   |                   |               |                   |
   |                   |  invoke("get_value", {            |                   |
   |                   |    connectionId,                  |                   |
   |                   |    key: "user:42:config" })       |                   |
   |                   |------------------>|               |                   |
   |                   |                   |-------------->|                   |
   |                   |                   |               |  TYPE user:42:... |
   |                   |                   |               |------------------>|
   |                   |                   |               |<------ "hash" ----|
   |                   |                   |               |                   |
   |                   |                   |               |  HGETALL user:42..|
   |                   |                   |               |------------------>|
   |                   |                   |               |<-- {k:v pairs} ---|
   |                   |                   |               |                   |
   |                   |                   |               |  TTL user:42:...  |
   |                   |                   |               |------------------>|
   |                   |                   |               |<---- 3600 --------|
   |                   |                   |               |                   |
   |                   |                   |               |  OBJECT ENCODING  |
   |                   |                   |               |  user:42:config   |
   |                   |                   |               |------------------>|
   |                   |                   |               |<-- "listpack" ----|
   |                   |                   |               |                   |
   |                   |  { type: "hash",  |               |                   |
   |                   |    value: {...},   |               |                   |
   |                   |    ttl: 3600,      |               |                   |
   |                   |    encoding: "..." }              |                   |
   |                   |<------------------|<--------------|                   |
   |                   |                   |               |                   |
   |                   |  editorStore      |               |                   |
   |                   |  .setValue()      |               |                   |
   |                   |  Select Hash      |               |                   |
   |                   |  editor component |               |                   |
   |                   |                   |               |                   |
   |  Hash table       |                   |               |                   |
   |  displayed        |                   |               |                   |
   |<------------------|                   |               |                   |
   |                   |                   |               |                   |
   |  Edit "theme"     |                   |               |                   |
   |  field: "dark"    |                   |               |                   |
   |  -> "light"       |                   |               |                   |
   |------------------>|                   |               |                   |
   |                   |                   |               |                   |
   |                   |  editorStore      |               |                   |
   |                   |  .setDirty(true)  |               |                   |
   |                   |                   |               |                   |
   |  Save indicator   |                   |               |                   |
   |  appears          |                   |               |                   |
   |<------------------|                   |               |                   |
   |                   |                   |               |                   |
   |  Click "Save"     |                   |               |                   |
   |  (or press Ctrl+S)|                   |               |                   |
   |------------------>|                   |               |                   |
   |                   |                   |               |                   |
   |                   |  invoke("hset", {                 |                   |
   |                   |    connectionId,                  |                   |
   |                   |    key: "user:42:config",         |                   |
   |                   |    field: "theme",                |                   |
   |                   |    value: "light" })              |                   |
   |                   |------------------>|               |                   |
   |                   |                   |-------------->|                   |
   |                   |                   |               |  HSET user:42:... |
   |                   |                   |               |  theme light      |
   |                   |                   |               |------------------>|
   |                   |                   |               |<------ OK --------|
   |                   |                   |               |                   |
   |                   |                   |  { success }  |                   |
   |                   |<------------------|<--------------|                   |
   |                   |                   |               |                   |
   |                   |  editorStore      |               |                   |
   |                   |  .setDirty(false) |               |                   |
   |                   |                   |               |                   |
   |  Success flash    |                   |               |                   |
   |  on "theme" field |                   |               |                   |
   |<------------------|                   |               |                   |
```

### 4.4 Server Monitoring (Push-Based)

This sequence shows the real-time monitoring flow using Tauri events.

```
  User              Frontend           IPC Layer       Command Layer      Client Layer
   |                   |                   |               |                   |
   |  Open Monitor tab |                   |               |                   |
   |------------------>|                   |               |                   |
   |                   |                   |               |                   |
   |                   |  invoke("start_monitor", {        |                   |
   |                   |    connectionId,                  |                   |
   |                   |    interval: 2000 })              |                   |
   |                   |------------------>|               |                   |
   |                   |                   |-------------->|                   |
   |                   |                   |               |                   |
   |                   |                   |               |  Spawn tokio task |
   |                   |                   |               |  with interval    |
   |                   |                   |               |  timer            |
   |                   |                   |               |                   |
   |                   |                   |  { monitorId }|                   |
   |                   |<------------------|<--------------|                   |
   |                   |                   |               |                   |
   |                   |  listen("monitor:stats")          |                   |
   |                   |  Register event   |               |                   |
   |                   |  handler          |               |                   |
   |                   |                   |               |                   |
   |  Dashboard shows  |                   |               |                   |
   |  "Monitoring..."  |                   |               |                   |
   |<------------------|                   |               |                   |
   |                   |                   |               |                   |
   |                   |                   |               |  [Timer tick]     |
   |                   |                   |               |  INFO             |
   |                   |                   |               |------------------>|
   |                   |                   |               |<-- info text -----|
   |                   |                   |               |                   |
   |                   |                   |               |  Parse INFO into  |
   |                   |                   |               |  MonitorSnapshot  |
   |                   |                   |               |                   |
   |                   |                   |               |  app.emit(        |
   |                   |                   |               |    "monitor:stats",
   |                   |                   |               |    snapshot)      |
   |                   |                   |               |                   |
   |                   |  Event received:  |               |                   |
   |                   |  "monitor:stats"  |               |                   |
   |                   |<-- event payload--|               |                   |
   |                   |                   |               |                   |
   |                   |  monitorStore     |               |                   |
   |                   |  .appendSnapshot()|               |                   |
   |                   |  Update charts    |               |                   |
   |                   |                   |               |                   |
   |  Charts update    |                   |               |                   |
   |<------------------|                   |               |                   |
   |                   |                   |               |                   |
   |  ... (repeats every 2 seconds) ...   |               |                   |
   |                   |                   |               |                   |
   |  Close Monitor tab|                   |               |                   |
   |------------------>|                   |               |                   |
   |                   |                   |               |                   |
   |                   |  invoke("stop_monitor", {         |                   |
   |                   |    monitorId })   |               |                   |
   |                   |------------------>|               |                   |
   |                   |                   |-------------->|                   |
   |                   |                   |               |  Cancel tokio task|
   |                   |                   |               |  (abort handle)   |
   |                   |                   |               |                   |
   |                   |                   |  { success }  |                   |
   |                   |<------------------|<--------------|                   |
   |                   |                   |               |                   |
   |                   |  Unlisten         |               |                   |
   |                   |  "monitor:stats"  |               |                   |
   |                   |                   |               |                   |
   |                   |  monitorStore     |               |                   |
   |                   |  .clear()         |               |                   |
```

### 4.5 Pub/Sub Message Flow

This sequence shows subscribing to a channel and receiving messages.

```
  User              Frontend           IPC Layer       Command Layer      Client Layer
   |                   |                   |               |                   |
   |  Enter channel:   |                   |               |                   |
   |  "events:orders"  |                   |               |                   |
   |  Click Subscribe  |                   |               |                   |
   |------------------>|                   |               |                   |
   |                   |                   |               |                   |
   |                   |  invoke("subscribe", {            |                   |
   |                   |    connectionId,                  |                   |
   |                   |    channel: "events:orders" })    |                   |
   |                   |------------------>|               |                   |
   |                   |                   |-------------->|                   |
   |                   |                   |               |                   |
   |                   |                   |               |  Create DEDICATED |
   |                   |                   |               |  connection (not  |
   |                   |                   |               |  from pool)       |
   |                   |                   |               |------------------>|
   |                   |                   |               |<--- connected ----|
   |                   |                   |               |                   |
   |                   |                   |               |  SUBSCRIBE        |
   |                   |                   |               |  events:orders    |
   |                   |                   |               |------------------>|
   |                   |                   |               |<-- subscribed ----|
   |                   |                   |               |                   |
   |                   |                   |               |  Spawn listener   |
   |                   |                   |               |  tokio task       |
   |                   |                   |               |                   |
   |                   |                   | { subscriptionId }                |
   |                   |<------------------|<--------------|                   |
   |                   |                   |               |                   |
   |                   |  listen("pubsub:message")         |                   |
   |                   |                   |               |                   |
   |  "Subscribed to   |                   |               |                   |
   |   events:orders"  |                   |               |                   |
   |<------------------|                   |               |                   |
   |                   |                   |               |                   |
   |                   |                   |               |  [Message arrives |
   |                   |                   |               |   from Redis]     |
   |                   |                   |               |<-- message -------|
   |                   |                   |               |                   |
   |                   |                   |               |  Detect JSON      |
   |                   |                   |               |  Build PubSubMsg  |
   |                   |                   |               |                   |
   |                   |                   |               |  app.emit(        |
   |                   |                   |               |   "pubsub:message"|
   |                   |                   |               |    msg)           |
   |                   |                   |               |                   |
   |                   |  Event received   |               |                   |
   |                   |<-- event payload--|               |                   |
   |                   |                   |               |                   |
   |                   |  pubsubStore      |               |                   |
   |                   |  .appendMessage() |               |                   |
   |                   |  (bounded buffer) |               |                   |
   |                   |                   |               |                   |
   |  Message appears  |                   |               |                   |
   |  in stream        |                   |               |                   |
   |<------------------|                   |               |                   |
   |                   |                   |               |                   |
   |  ... (messages continue arriving) ... |               |                   |
   |                   |                   |               |                   |
   |  Click Unsubscribe|                   |               |                   |
   |------------------>|                   |               |                   |
   |                   |                   |               |                   |
   |                   |  invoke("unsubscribe", {          |                   |
   |                   |    subscriptionId })              |                   |
   |                   |------------------>|               |                   |
   |                   |                   |-------------->|                   |
   |                   |                   |               |  UNSUBSCRIBE      |
   |                   |                   |               |  events:orders    |
   |                   |                   |               |------------------>|
   |                   |                   |               |                   |
   |                   |                   |               |  Cancel listener  |
   |                   |                   |               |  Close dedicated  |
   |                   |                   |               |  connection       |
   |                   |                   |               |                   |
   |                   |                   |  { success }  |                   |
   |                   |<------------------|<--------------|                   |
   |                   |                   |               |                   |
   |                   |  Unlisten         |               |                   |
   |                   |  "pubsub:message" |               |                   |
```

---

## 5. IPC Protocol

### 5.1 Command Naming Conventions

All Tauri commands follow a consistent naming convention:

```
<domain>_<action>[_<qualifier>]
```

| Domain       | Actions                                          | Examples                                  |
|--------------|--------------------------------------------------|-------------------------------------------|
| connection   | create, update, delete, test, list, get          | `connection_create`, `connection_test`     |
| keys         | scan, delete, rename, expire, type, info         | `keys_scan`, `keys_delete`                |
| value        | get, set, delete                                 | `value_get`, `value_set`                  |
| hash         | get_all, set, delete_field, scan_fields          | `hash_get_all`, `hash_set`               |
| list         | range, push_left, push_right, set, remove, trim  | `list_range`, `list_push_left`           |
| set          | members, add, remove, is_member, random          | `set_members`, `set_add`                 |
| zset         | range, add, remove, score, increment             | `zset_range`, `zset_add`                 |
| stream       | range, add, delete, trim, info, groups           | `stream_range`, `stream_add`             |
| json         | get, set, delete, type, arr_append               | `json_get`, `json_set`                   |
| monitor      | start, stop                                      | `monitor_start`, `monitor_stop`          |
| slowlog      | get, reset, len                                  | `slowlog_get`, `slowlog_reset`           |
| clients      | list, kill                                       | `clients_list`, `clients_kill`           |
| memory       | doctor, usage, top_keys                          | `memory_doctor`, `memory_usage`          |
| cli          | execute, history                                 | `cli_execute`, `cli_history`             |
| pubsub       | subscribe, unsubscribe, publish, channels        | `pubsub_subscribe`, `pubsub_publish`     |
| config       | get, set                                         | `config_get`, `config_set`               |
| export       | keys_json, keys_commands                         | `export_keys_json`                       |
| import       | keys_json, keys_commands                         | `import_keys_json`                       |

### 5.2 Error Format

All errors returned through IPC follow a consistent format:

```typescript
interface AppError {
  code: ErrorCode;        // Machine-readable error code
  message: string;        // Human-readable error message
  details: string | null; // Additional context (stack trace in dev, null in prod)
}

type ErrorCode =
  | "VALIDATION_ERROR"       // Invalid input parameters
  | "CONNECTION_ERROR"       // Cannot connect to Redis
  | "CONNECTION_NOT_FOUND"   // Connection ID does not exist
  | "REDIS_ERROR"            // Redis returned an error
  | "TIMEOUT_ERROR"          // Operation timed out
  | "AUTH_ERROR"             // Authentication failed
  | "TLS_ERROR"              // TLS handshake failed
  | "SSH_ERROR"              // SSH tunnel failed
  | "CLUSTER_ERROR"          // Cluster-specific error
  | "SENTINEL_ERROR"         // Sentinel-specific error
  | "KEYCHAIN_ERROR"         // OS keychain access failed
  | "CONFIG_ERROR"           // Configuration read/write error
  | "NOT_SUPPORTED"          // Feature not supported by server
  | "INTERNAL_ERROR";        // Unexpected internal error
```

**Rust error type:**

```rust
use serde::Serialize;

#[derive(Debug, Serialize, thiserror::Error)]
#[serde(tag = "code", content = "message")]
pub enum AppError {
    #[error("Validation error: {0}")]
    ValidationError(String),

    #[error("Connection error: {0}")]
    ConnectionError(String),

    #[error("Connection not found: {0}")]
    ConnectionNotFound(String),

    #[error("Redis error: {0}")]
    RedisError(String),

    #[error("Timeout: {0}")]
    TimeoutError(String),

    #[error("Authentication failed: {0}")]
    AuthError(String),

    #[error("TLS error: {0}")]
    TlsError(String),

    #[error("SSH tunnel error: {0}")]
    SshError(String),

    #[error("Cluster error: {0}")]
    ClusterError(String),

    #[error("Sentinel error: {0}")]
    SentinelError(String),

    #[error("Keychain error: {0}")]
    KeychainError(String),

    #[error("Configuration error: {0}")]
    ConfigError(String),

    #[error("Not supported: {0}")]
    NotSupported(String),

    #[error("Internal error: {0}")]
    InternalError(String),
}

// Tauri requires this impl for command return types
impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        // Serialize as { code, message, details }
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("AppError", 3)?;
        state.serialize_field("code", &self.error_code())?;
        state.serialize_field("message", &self.to_string())?;
        state.serialize_field("details", &None::<String>)?;
        state.end()
    }
}
```

### 5.3 Event Naming Conventions

Tauri events (Rust -> Frontend) follow this convention:

```
<domain>:<event_type>
```

| Event Name              | Payload Type        | Trigger                            |
|-------------------------|---------------------|------------------------------------|
| `monitor:stats`         | MonitorSnapshot     | Every monitor interval tick        |
| `monitor:error`         | AppError            | Monitor polling fails              |
| `pubsub:message`        | PubSubMessage       | Pub/Sub message received           |
| `pubsub:subscribed`     | { channel: string } | Subscription confirmed             |
| `pubsub:unsubscribed`   | { channel: string } | Unsubscription confirmed           |
| `connection:lost`       | { connectionId }    | Connection dropped unexpectedly    |
| `connection:reconnected`| { connectionId }    | Connection re-established          |
| `sentinel:failover`     | { connectionId, newMaster } | Sentinel failover detected |
| `cluster:topology`      | ClusterTopology     | Cluster topology changed           |
| `scan:progress`         | { connectionId, scanned, total_estimate } | SCAN progress |
| `update:available`      | { version, notes }  | New version detected               |

### 5.4 Serialization Rules

All data crossing the IPC bridge is serialized as JSON. The following rules
ensure consistent serialization:

1. **Rust structs** use `#[derive(Serialize, Deserialize)]` with serde defaults
2. **Field naming** uses `camelCase` in JSON (via `#[serde(rename_all = "camelCase")]`)
3. **Optional fields** use `Option<T>` in Rust, serialized as `null` or omitted
4. **Dates** are ISO 8601 strings (not timestamps)
5. **Binary data** is Base64-encoded strings
6. **Large integers** (>2^53) are serialized as strings to avoid JS precision loss
7. **Enums** use external tagging: `{ "type": "variant", "data": { ... } }`

**Example serialization config:**

```rust
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyEntry {
    pub key: String,
    pub key_type: RedisType,  // becomes "keyType" in JSON
    pub ttl: i64,
    pub encoding: String,
    pub memory_usage: Option<u64>,  // becomes "memoryUsage" or null
    pub size: Option<u64>,
}
```

---

## 6. State Management

### 6.1 Frontend Store Architecture

RedisLens uses Zustand for global state management. State is divided into
domain-specific stores, each responsible for a single concern. Stores do not
directly depend on each other; cross-store coordination happens through React
components or subscription effects.

```
+============================================================================+
|                          Zustand Store Architecture                        |
|                                                                            |
|  +--------------------+  +--------------------+  +---------------------+   |
|  | connectionStore    |  | browserStore       |  | editorStore         |   |
|  |                    |  |                    |  |                     |   |
|  | - profiles[]       |  | - tree: TreeNode   |  | - activeKey         |   |
|  | - activeId         |  | - expandedPaths[]  |  | - value             |   |
|  | - activeInfo       |  | - selectedKey      |  | - type              |   |
|  | - isConnecting     |  | - isScanning       |  | - isDirty           |   |
|  | - error            |  | - scanProgress     |  | - isLoading         |   |
|  |                    |  | - filters          |  | - error             |   |
|  | Actions:           |  | - searchPattern    |  |                     |   |
|  |  connect()         |  |                    |  | Actions:            |   |
|  |  disconnect()      |  | Actions:           |  |  loadValue()        |   |
|  |  setActive()       |  |  startScan()       |  |  setValue()         |   |
|  |  saveProfile()     |  |  appendKeys()      |  |  setDirty()         |   |
|  |  deleteProfile()   |  |  toggleExpand()     |  |  save()             |   |
|  |  importProfiles()  |  |  selectKey()       |  |  reset()            |   |
|  |  exportProfiles()  |  |  setFilter()       |  |  updateField()      |   |
|  +--------------------+  |  setSearch()       |  +---------------------+   |
|                          |  bulkDelete()      |                            |
|  +--------------------+  +--------------------+  +---------------------+   |
|  | monitorStore       |                          | cliStore            |   |
|  |                    |  +--------------------+  |                     |   |
|  | - isActive         |  | pubsubStore        |  | - history[]         |   |
|  | - snapshots[]      |  |                    |  | - output[]          |   |
|  | - slowLog[]        |  | - subscriptions[]  |  | - inputValue        |   |
|  | - clientList[]     |  | - messages[]       |  | - suggestions[]     |   |
|  | - memoryAnalysis   |  | - isSubscribing    |  | - formatMode        |   |
|  | - chartRange       |  | - filter           |  | - isExecuting       |   |
|  |                    |  | - isPaused         |  |                     |   |
|  | Actions:           |  |                    |  | Actions:            |   |
|  |  start()           |  | Actions:           |  |  execute()          |   |
|  |  stop()            |  |  subscribe()       |  |  setInput()         |   |
|  |  appendSnapshot()  |  |  unsubscribe()     |  |  selectSuggestion() |   |
|  |  fetchSlowLog()    |  |  appendMessage()   |  |  searchHistory()    |   |
|  |  fetchClients()    |  |  publish()         |  |  setFormat()        |   |
|  |  analyzeMemory()   |  |  setFilter()       |  |  clearOutput()      |   |
|  +--------------------+  |  togglePause()     |  +---------------------+   |
|                          |  clearBuffer()     |                            |
|  +--------------------+  +--------------------+                            |
|  | settingsStore      |                                                    |
|  |                    |                                                    |
|  | - theme            |                                                    |
|  | - fontSize         |                                                    |
|  | - fontFamily       |                                                    |
|  | - confirmDangerous |                                                    |
|  | - defaultScanCount |                                                    |
|  | - keyDelimiter     |                                                    |
|  | - checkForUpdates  |                                                    |
|  | - windowBounds     |                                                    |
|  |                    |                                                    |
|  | Actions:           |                                                    |
|  |  setTheme()        |                                                    |
|  |  setFontSize()     |                                                    |
|  |  updateSettings()  |                                                    |
|  |  loadSettings()    |                                                    |
|  |  saveSettings()    |                                                    |
|  +--------------------+                                                    |
|                                                                            |
+============================================================================+
```

### 6.2 Store Descriptions

**connectionStore:**
Manages connection profiles and the currently active connection. Profiles are
loaded from disk on startup and saved on every change. The `activeId` and
`activeInfo` fields track the currently connected Redis server. Connection state
transitions (disconnected -> connecting -> connected -> error) are managed here.

**browserStore:**
Manages the key tree and browser state. The `tree` field is the root TreeNode
built from SCAN results. `expandedPaths` tracks which tree nodes are expanded.
`selectedKey` is the key currently highlighted (whose value is shown in the
editor). Filters and search patterns are stored here so the tree view can
filter in-memory without re-scanning.

**editorStore:**
Manages the value editor state. When a key is selected in the browser, the
editor store loads the value from Redis (via IPC) and stores it along with the
type and metadata. The `isDirty` flag tracks whether the user has unsaved
changes. Save and reset operations are coordinated here.

**monitorStore:**
Manages server monitoring data. Snapshots arrive via Tauri events and are
appended to a ring buffer (bounded to prevent memory growth). The slow log and
client list are fetched on demand. Memory analysis results are stored here after
the analysis scan completes.

**cliStore:**
Manages the CLI console state. Command history is loaded from disk on startup
and saved after each command. The output buffer stores formatted command
results. Autocomplete suggestions are computed here based on the current input
value and available commands/keys.

**pubsubStore:**
Manages Pub/Sub state. Active subscriptions are tracked along with their
channels/patterns. Messages are appended to a bounded buffer. The `isPaused`
flag freezes the message display without stopping subscription. Filters are
applied client-side on the message buffer.

**settingsStore:**
Manages application configuration. Settings are loaded from disk on startup.
Changes trigger both a store update and a disk write (via IPC). The theme
setting is applied immediately to the document root.

### 6.3 Cross-Store Coordination

Stores are independent, but some user actions require coordinating across
stores. This is handled in React components or through Zustand subscriptions:

**Connection change -> Browser reset:**
When `connectionStore.activeId` changes, the browser component calls
`browserStore.startScan()` with the new connection ID. The previous tree is
cleared.

**Key selection -> Editor load:**
When `browserStore.selectedKey` changes, the editor component calls
`editorStore.loadValue()` with the selected key. If the editor has unsaved
changes, a confirmation dialog is shown first.

**Monitor start/stop -> Event listeners:**
When the Monitor tab is opened, the component calls `monitorStore.start()`,
which invokes the `monitor_start` IPC command and registers the event listener.
On tab close, `monitorStore.stop()` invokes `monitor_stop` and unregisters
the listener.

**Settings change -> Theme update:**
When `settingsStore.theme` changes, a subscription effect applies the new
theme class to `document.documentElement`.

---

## 7. Build and Packaging

### 7.1 Development Setup

**Prerequisites:**
- Rust toolchain (stable, via rustup)
- Node.js 20+ (via nvm or fnm)
- pnpm (package manager)
- Platform-specific:
  - macOS: Xcode Command Line Tools
  - Windows: Visual Studio Build Tools + WebView2 SDK
  - Linux: libwebkit2gtk-4.1-dev, build-essential, libssl-dev

**Development workflow:**

```bash
# Install dependencies
pnpm install

# Start development (frontend + Rust backend in parallel)
pnpm tauri dev

# This runs:
#   1. Next.js dev server (port 1420)
#   2. Tauri dev (compiles Rust, opens window pointing to port 1420)
#   3. Hot reload for both frontend and backend changes
```

**Project structure:**

```
redis-lens/
  src-tauri/               # Rust backend
    src/
      main.rs              # Tauri app entry point
      lib.rs               # Module declarations
      commands/            # Tauri command handlers
        connection.rs
        keys.rs
        value.rs
        monitor.rs
        cli.rs
        pubsub.rs
        config.rs
      services/            # Business logic
        connection_manager.rs
        key_browser.rs
        value_handler.rs
        monitor.rs
        cli_executor.rs
        pubsub_manager.rs
      infra/               # Infrastructure
        config_store.rs
        credential_manager.rs
        logger.rs
        update_manager.rs
      models/              # Data types
        connection.rs
        key.rs
        monitor.rs
        pubsub.rs
        error.rs
    Cargo.toml
    tauri.conf.json        # Tauri configuration
    capabilities/          # Tauri 2.x capability files
    icons/                 # Application icons
  src/                     # Next.js frontend
    app/                   # App Router pages
      layout.tsx
      page.tsx
      browser/
      monitor/
      cli/
      pubsub/
      settings/
    components/            # React components
      ui/                  # shadcn/ui primitives
      connection/          # Connection UI
      browser/             # Key browser
      editor/              # Value editors
      monitor/             # Server monitor
      cli/                 # CLI console
      pubsub/              # Pub/Sub viewer
    stores/                # Zustand stores
      connection.ts
      browser.ts
      editor.ts
      monitor.ts
      cli.ts
      pubsub.ts
      settings.ts
    lib/                   # Utilities
      ipc/                 # Tauri IPC wrappers
      hooks/               # Custom React hooks
      utils/               # Helper functions
    styles/                # Global styles
  tests/                   # Test files
    rust/                  # Rust unit + integration tests
    vitest/                # Frontend unit tests
    playwright/            # E2E tests
  .github/
    workflows/
      ci.yml               # Build + test on all platforms
      release.yml          # Build + sign + release
  docs/
  package.json
  next.config.js
  tailwind.config.ts
  tsconfig.json
```

### 7.2 Build Pipeline

**How Tauri bundles the application:**

1. **Frontend build:** `next build && next export` produces static HTML/JS/CSS in
   the `out/` directory. No server-side code is included.

2. **Rust build:** `cargo build --release` compiles the Rust backend into a
   single native binary. All Rust dependencies are statically linked.

3. **Bundle:** Tauri's bundler combines the Rust binary and the frontend static
   files into a platform-specific application package:
   - macOS: `.app` bundle (containing the binary and web assets in Resources/)
   - Windows: `.exe` with web assets embedded as resources
   - Linux: Binary with web assets in a sidecar directory

4. **Package:** The bundle is wrapped in a distributable format:
   - macOS: `.dmg` disk image (with Application symlink for drag-to-install)
   - Windows: `.msi` installer (or NSIS `.exe` installer)
   - Linux: `.AppImage` (portable) and `.deb` (Debian/Ubuntu)

### 7.3 Platform-Specific Build Configuration

**macOS:**

```json
// tauri.conf.json (macOS section)
{
  "bundle": {
    "macOS": {
      "minimumSystemVersion": "12.0",
      "frameworks": [],
      "signingIdentity": "Developer ID Application: RedisLens (TEAMID)",
      "providerShortName": "TEAMID",
      "entitlements": "entitlements.plist"
    }
  }
}
```

Build steps:
1. Build universal binary (x86_64 + aarch64) via `--target universal-apple-darwin`
2. Sign with Developer ID certificate
3. Submit for Apple notarization (via `notarytool`)
4. Staple notarization ticket to the .dmg
5. Verify: `spctl --assess --verbose=4 --type execute RedisLens.app`

**Windows:**

```json
// tauri.conf.json (Windows section)
{
  "bundle": {
    "windows": {
      "certificateThumbprint": "...",
      "timestampUrl": "http://timestamp.digicert.com",
      "webviewInstallMode": {
        "type": "downloadBootstrapper"
      }
    }
  }
}
```

Build steps:
1. Build x64 binary (arm64 as separate artifact)
2. Sign with Authenticode certificate (EV or OV)
3. Embed WebView2 bootstrapper (auto-downloads WebView2 if not present)
4. Create MSI installer via WiX
5. Sign the MSI installer

**Linux:**

Build steps:
1. Build x64 binary on Ubuntu 22.04 (oldest supported)
2. Create .AppImage (portable, no install required)
3. Create .deb package (Debian/Ubuntu)
4. Generate SHA256 checksums
5. GPG-sign the checksums file

### 7.4 CI/CD Pipeline

**CI (on every push and PR):**

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Rust checks
        run: |
          cargo fmt --check
          cargo clippy -- -D warnings
          cargo test
          cargo audit

      - name: Frontend checks
        run: |
          pnpm install
          pnpm lint
          pnpm typecheck
          pnpm test

  build:
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-22.04]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - name: Build
        run: pnpm tauri build
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build-${{ matrix.os }}
          path: src-tauri/target/release/bundle/

  e2e:
    needs: build
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-22.04]
    steps:
      - name: E2E tests
        run: pnpm playwright test
```

**Release (on tag push):**

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags: ["v*"]

jobs:
  release:
    strategy:
      matrix:
        include:
          - os: macos-latest
            target: universal-apple-darwin
          - os: windows-latest
            target: x86_64-pc-windows-msvc
          - os: ubuntu-22.04
            target: x86_64-unknown-linux-gnu
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4

      - name: Build release
        run: pnpm tauri build

      - name: Sign (macOS)
        if: matrix.os == 'macos-latest'
        run: |
          # Code sign + notarize
          xcrun notarytool submit ... --wait
          xcrun stapler staple ...

      - name: Sign (Windows)
        if: matrix.os == 'windows-latest'
        run: |
          # Authenticode sign
          signtool sign ...

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: src-tauri/target/release/bundle/**/*
          generate_release_notes: true
```

### 7.5 Auto-Updater Architecture

RedisLens uses Tauri's built-in updater, which works as follows:

```
+-------------------+         HTTPS          +---------------------+
|   RedisLens App   |----------------------->|  GitHub Releases    |
|                   |                        |                     |
|  Update Manager   |   GET /latest.json     |  latest.json:       |
|                   |<-----------------------|  {                  |
|  1. Check version |                        |    "version": "1.1",|
|  2. Compare       |                        |    "platforms": {   |
|  3. Download      |   GET /RedisLens.dmg   |      "darwin": {    |
|  4. Verify sig    |<-----------------------|        "url": "..." |
|  5. Install       |                        |        "signature": |
|  6. Restart       |                        |          "Ed25519.." |
+-------------------+                        |      }              |
                                             |    }                |
                                             |  }                  |
                                             +---------------------+
```

**Update flow:**

1. On startup (if `checkForUpdates` is enabled), the Update Manager fetches
   `latest.json` from the GitHub Releases endpoint.
2. Compares the remote version with the current version (semver comparison).
3. If a newer version is available, emits an `update:available` event to the
   frontend.
4. The frontend shows a non-intrusive notification: "Version 1.1.0 is available.
   [Update Now] [Later] [Skip This Version]"
5. If the user clicks "Update Now":
   a. Downloads the platform-specific binary
   b. Verifies the Ed25519 signature against the embedded public key
   c. If verification passes, installs the update
   d. Prompts the user to restart
6. If `autoUpdate` is enabled, steps 5a-5d happen automatically.

**Security considerations:**
- The Ed25519 public key is embedded in the binary at compile time
- Updates are delivered over HTTPS (GitHub's CDN)
- If signature verification fails, the update is rejected and the user is warned
- The update check request contains only: current version, OS, architecture
- No cookies, no tracking, no fingerprinting

---

## Appendix A: Technology Reference

| Technology        | Version  | Purpose                                      | Crate/Package           |
|-------------------|----------|----------------------------------------------|-------------------------|
| Rust              | 1.75+    | Backend language                             | N/A                     |
| Tauri             | 2.x      | Desktop framework                            | `tauri`                 |
| redis-rs          | 0.25+    | Redis client                                 | `redis`                 |
| deadpool-redis    | 0.15+    | Connection pooling                           | `deadpool-redis`        |
| tokio             | 1.x      | Async runtime                                | `tokio`                 |
| serde             | 1.x      | Serialization                                | `serde`, `serde_json`   |
| thiserror         | 1.x      | Error types                                  | `thiserror`             |
| tracing           | 0.1      | Structured logging                           | `tracing`               |
| zeroize           | 1.x      | Credential memory safety                     | `zeroize`               |
| rustls            | 0.23+    | TLS implementation                           | `rustls`                |
| Next.js           | 14+      | Frontend framework                           | `next`                  |
| React             | 18+      | UI library                                   | `react`                 |
| TypeScript        | 5.x      | Type system                                  | `typescript`            |
| Tailwind CSS      | 3.x      | Utility-first CSS                            | `tailwindcss`           |
| shadcn/ui         | Latest   | UI component library                         | (copied into project)   |
| Zustand           | 4.x      | State management                             | `zustand`               |
| @tanstack/virtual | 3.x      | Virtual scrolling                            | `@tanstack/react-virtual` |
| Vitest            | 1.x      | Frontend unit testing                        | `vitest`                |
| Playwright        | 1.x      | E2E testing                                  | `@playwright/test`      |

## Appendix B: Decision Log

| ID    | Decision                                   | Rationale                                  | Date       |
|-------|--------------------------------------------|--------------------------------------------|------------|
| AD-01 | Use Tauri 2.x over Electron               | 10x smaller binary, 4x less memory         | 2026-02-14 |
| AD-02 | Use Rust for backend                       | Memory safety, Tauri native, async perf     | 2026-02-14 |
| AD-03 | Use Next.js over SvelteKit                 | Larger contributor pool, richer ecosystem   | 2026-02-14 |
| AD-04 | Use Zustand over Redux                     | Minimal boilerplate, tiny bundle            | 2026-02-14 |
| AD-05 | Use shadcn/ui over Material UI             | Own the code, Radix accessibility, Tailwind | 2026-02-14 |
| AD-06 | SCAN-only, never KEYS *                    | Production safety, non-blocking             | 2026-02-14 |
| AD-07 | Dedicated Pub/Sub connections              | Redis requires separate conn for subscribe  | 2026-02-14 |
| AD-08 | OS keychain for credentials                | Never store passwords in plaintext          | 2026-02-14 |
| AD-09 | Push-based monitoring (events)             | Lower latency, no polling from frontend     | 2026-02-14 |
| AD-10 | Static Next.js export (no server)          | Desktop app, no Node.js runtime needed      | 2026-02-14 |
