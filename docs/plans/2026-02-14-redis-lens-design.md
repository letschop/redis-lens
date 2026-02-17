# RedisLens Master Design Document

**Version:** 1.0
**Date:** 2026-02-14
**Status:** Draft
**Authors:** RedisLens Core Team

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Competitive Analysis](#3-competitive-analysis)
4. [Product Vision](#4-product-vision)
5. [User Personas](#5-user-personas)
6. [Feature Breakdown](#6-feature-breakdown)
7. [Architecture Overview](#7-architecture-overview)
8. [Technology Decisions](#8-technology-decisions)
9. [Data Model](#9-data-model)
10. [User Flows](#10-user-flows)
11. [Non-Functional Requirements](#11-non-functional-requirements)
12. [Release Strategy](#12-release-strategy)
13. [Risk Register](#13-risk-register)
14. [Success Metrics](#14-success-metrics)

---

## 1. Executive Summary

RedisLens is an open-source, cross-platform desktop Redis client built with Rust
(Tauri 2.x) and Next.js/TypeScript. It provides a modern, performant graphical
interface for developers, DevOps engineers, and data architects who work with
Redis daily. Think MongoDB Compass, but for Redis.

The project exists to fill a gap in the Redis tooling ecosystem: there is no
high-quality, open-source, privacy-respecting Redis GUI that combines
comprehensive type support, modern UX, and native-like performance. Existing
tools are either proprietary with telemetry (RedisInsight), built on heavy
Electron runtimes (ARDM), limited in scope (redis-commander, Medis), or
abandoned entirely.

RedisLens targets three primary audiences:

- **Developers** who use Redis as a cache, session store, or message broker and
  need a fast way to inspect and edit data during development.
- **DevOps engineers** who monitor production Redis instances and need real-time
  server statistics, slow query logs, and client management.
- **Data architects** who design and manage complex Redis data schemas, requiring
  type-aware editing, bulk operations, and export/import capabilities.

The application is built on Tauri 2.x, which pairs a Rust backend with a web
frontend to produce small binaries (~15 MB), low memory usage (~80 MB idle),
and native OS integration. The Rust backend manages all Redis connections through
pooled clients, ensuring thread-safe concurrent access. The Next.js frontend
delivers a polished, responsive UI with virtual scrolling for large keyspaces.

RedisLens is licensed under the MIT license and follows open-source best
practices: semantic versioning, signed releases, a contributor guide, and
automated CI/CD through GitHub Actions.

---

## 2. Problem Statement

### 2.1 The Need for Redis GUIs

Redis is the most popular in-memory data store, used by millions of developers
worldwide. While `redis-cli` is adequate for ad-hoc commands, it falls short for
everyday data management tasks:

- **No visual hierarchy.** Redis has no concept of databases beyond numbered
  indices. Keys are flat strings. Developers impose structure through naming
  conventions (e.g., `user:42:sessions:abc123`), but `redis-cli` cannot
  visualize this hierarchy.

- **No type-aware editing.** Viewing a Redis Hash requires multiple commands
  (`HGETALL`, then mental parsing). Editing a sorted set member's score requires
  knowing exact syntax. GUIs should present type-appropriate editors.

- **No monitoring dashboard.** Extracting useful information from `INFO` output
  requires parsing hundreds of lines of text. Memory trends, ops/sec graphs,
  and slow query analysis should be visual.

- **No safe bulk operations.** Deleting a namespace of keys in `redis-cli`
  requires scripting. A GUI should provide safe, filtered bulk operations with
  confirmation dialogs.

### 2.2 Pain Points with Existing Solutions

Developers who seek a GUI face a set of recurring frustrations:

**Privacy and telemetry concerns.** RedisInsight, the official Redis GUI,
collects usage telemetry by default. For organizations handling sensitive data,
even the presence of telemetry code in a tool that connects to production
databases is unacceptable. Users should never have to wonder whether their
keyspace layout, query patterns, or server addresses are being transmitted to
a third party.

**Heavy resource consumption.** Electron-based Redis GUIs (RedisInsight, ARDM)
ship a full Chromium browser. This results in:

- Binary sizes of 200-400 MB
- Idle memory consumption of 300-500 MB
- Slow startup times (3-8 seconds)
- Excessive CPU usage during idle operation

For developers who keep their Redis GUI open alongside an IDE, a browser, Docker,
and other tools, this resource overhead is significant.

**Incomplete type support.** Many Redis GUIs handle only String, Hash, List, Set,
and Sorted Set. Redis has expanded to include Streams, JSON (via RedisJSON),
probabilistic data structures, and more. Developers using these types are forced
back to the CLI.

**Poor large keyspace handling.** Tools that use `KEYS *` under the hood block
the Redis server when keyspaces contain millions of keys. Even tools that use
`SCAN` often load entire result sets into memory, causing the GUI itself to
become unresponsive. Virtual scrolling and lazy loading are essential.

**Limited cluster and sentinel support.** Many GUIs support only standalone Redis
connections. Developers working with Redis Cluster or Sentinel topologies must
either use `redis-cli` or manually connect to individual nodes.

**Stale or abandoned projects.** Several promising open-source Redis GUIs (Medis,
FastoRedis, Redsmin) have been abandoned or have not received meaningful updates
in years. Users invest time learning a tool only to find it unsupported when they
encounter bugs or need features.

**Platform restrictions.** Some tools are macOS-only (Medis) or web-only
(redis-commander). Developers working across platforms need a single tool that
works consistently on macOS, Windows, and Linux.

### 2.3 The Opportunity

There is a clear opportunity for a Redis GUI that is:

1. **Open source and telemetry-free** -- fully transparent, community-driven
2. **Lightweight and fast** -- Rust backend, small binary, low memory
3. **Comprehensive** -- all Redis types, all deployment topologies
4. **Modern** -- polished UI, keyboard-driven, accessible
5. **Actively maintained** -- regular releases, responsive to issues

RedisLens is designed to be that tool.

---

## 3. Competitive Analysis

### 3.1 Feature Comparison Matrix

| Dimension              | RedisInsight         | ARDM                | redis-commander     | Medis               | RedisLens (Target)   |
|------------------------|----------------------|---------------------|---------------------|---------------------|----------------------|
| **License**            | Proprietary (SSPL)   | MIT                 | MIT                 | MIT (unmaintained)  | MIT                  |
| **Binary Size**        | ~350 MB              | ~250 MB             | N/A (web)           | ~120 MB             | ~15 MB               |
| **Memory Usage (idle)**| ~400 MB              | ~350 MB             | ~150 MB (Node)      | ~200 MB             | ~80 MB               |
| **Redis Type Coverage**| Excellent (all)      | Good (basic 5+JSON) | Basic (String/Hash) | Basic (String/Hash) | Excellent (all)      |
| **Cluster Support**    | Yes                  | Partial             | No                  | No                  | Yes                  |
| **Telemetry**          | Yes (opt-out)        | No                  | No                  | No                  | No (never)           |
| **Maintenance Status** | Active (commercial)  | Active              | Sporadic            | Abandoned           | Active               |
| **UX Quality**         | High                 | Medium              | Low                 | Medium              | High                 |
| **Platform Support**   | macOS/Win/Linux      | macOS/Win/Linux     | Any (web browser)   | macOS only          | macOS/Win/Linux      |
| **Extensibility**      | Plugins (limited)    | None                | None                | None                | Plugin system (v2.0) |

### 3.2 Detailed Competitor Profiles

#### RedisInsight (Redis Ltd)

**Strengths:**
- Comprehensive feature set covering all Redis types and modules
- Professional-quality UI with good UX patterns
- Active development backed by Redis Ltd's commercial interest
- Built-in profiling and memory analysis tools
- Workbench mode for complex query composition

**Weaknesses:**
- Proprietary license (SSPL) creates legal uncertainty for many organizations
- Mandatory telemetry collection (even with "opt-out," telemetry code is present)
- Electron-based, resulting in high resource consumption
- Slow startup, especially on older machines
- Cloud-connected features push users toward Redis Cloud

**Why users switch:** Privacy concerns are the number one reason developers seek
alternatives to RedisInsight. The combination of proprietary licensing and
telemetry makes it unsuitable for security-conscious organizations.

#### Another Redis Desktop Manager (ARDM)

**Strengths:**
- Open source with MIT license
- Cross-platform support
- Active development community
- Free for basic use (premium features available)

**Weaknesses:**
- Electron-based with significant resource overhead
- UI feels dated compared to modern design standards
- Limited Redis type support (no Stream editor, basic JSON handling)
- Cluster support is partial and sometimes unreliable
- Some features gated behind paid "premium" tier

**Why users switch:** Developers find the UI unintuitive and the type support
insufficient for modern Redis workloads that use Streams and JSON.

#### redis-commander

**Strengths:**
- Zero-install web interface (runs as a Node.js server)
- Lightweight compared to desktop alternatives
- Good for quick server-side inspection

**Weaknesses:**
- Web-based only (no desktop integration, no OS keychain)
- Minimal feature set (basic CRUD, no monitoring, no CLI)
- Exposes a web server that must be secured separately
- No virtual scrolling or lazy loading for large keyspaces
- Development has slowed significantly

**Why users switch:** Too limited for daily use. Suitable only for occasional
quick inspections.

#### Medis

**Strengths:**
- Clean, minimal macOS-native UI
- Lightweight for an Electron app
- Simple connection management

**Weaknesses:**
- macOS only (no Windows or Linux support)
- Effectively abandoned (last meaningful update years ago)
- Minimal feature set (no monitoring, no CLI, no Pub/Sub)
- No cluster or sentinel support
- No bulk operations

**Why users switch:** Abandonment and platform restriction are the primary
reasons. Developers on mixed-platform teams cannot standardize on Medis.

### 3.3 RedisLens Positioning

RedisLens occupies the intersection of four qualities that no existing tool
combines:

```
                    Open Source
                        |
                        |
          ARDM          |         RedisLens
          redis-cmdr    |
                        |
   ----Low Resources----|----High Resources----
                        |
                        |         RedisInsight
          Medis         |
                        |
                    Proprietary
```

RedisLens is the only tool that is simultaneously open source, low resource,
feature-comprehensive, and cross-platform. This is the core value proposition.

---

## 4. Product Vision

### 4.1 Vision Statement

**RedisLens: The definitive open-source Redis GUI.**

Fast. Private. Comprehensive.

### 4.2 Core Principles

**Performance is a feature.** Every interaction should feel instant. Startup
under 2 seconds. Key browsing under 100ms. No loading spinners for common
operations. This is achievable because of our Rust + Tauri architecture -- we do
not carry the weight of a full Chromium browser.

**Privacy is non-negotiable.** RedisLens will never collect telemetry, phone
home, or transmit any user data. Connection credentials are stored in the OS
keychain. Crash reports are opt-in and contain no identifying information. Users
connecting to production databases must have absolute confidence in their tool's
privacy posture.

**Comprehensiveness without complexity.** RedisLens supports all Redis data
types, all deployment topologies, and all common operations. But features are
presented progressively -- a developer inspecting a simple String key should not
be overwhelmed by cluster management controls. The UI adapts to the context.

**Open source is a commitment.** MIT license, public roadmap, transparent
decision-making, welcoming contribution process. The project's success is
measured by community adoption and contribution, not by revenue.

### 4.3 Long-Term Goals

- Become the most-used open-source Redis GUI (measured by GitHub stars and
  downloads)
- Establish a vibrant contributor community with 50+ contributors
- Support all Redis data types and modules, including third-party modules
- Provide a plugin system for custom data viewers and tools
- Offer first-class integration with Redis development workflows (migration
  tools, schema validation, test data generation)

---

## 5. User Personas

### 5.1 Persona: Priya -- Backend Developer

**Demographics:**
- 28 years old, 5 years of experience
- Works at a mid-size SaaS company (200 employees)
- Uses Redis as a cache and session store
- Primary language: Python (FastAPI)
- OS: macOS (M-series MacBook Pro)

**Goals:**
- Quickly inspect cached values during development
- Debug session data when authentication issues arise
- Monitor cache hit rates to validate caching strategies
- Edit individual keys without writing CLI commands

**Pain points:**
- RedisInsight consumes too much memory alongside her IDE and Docker
- `redis-cli` is tedious for inspecting complex Hash values
- She has been burned by tools that use `KEYS *` and block production Redis
- She needs to connect to 3-4 different Redis instances (local, staging, QA)

**Typical workflow:**
1. Open RedisLens alongside her IDE (expects low memory overhead)
2. Connect to local Redis (saved profile, one click)
3. Browse to `cache:user:*` keys using the tree browser
4. Inspect a specific Hash to verify cached user data
5. Delete stale cache entries for a specific user namespace
6. Switch to staging Redis to compare data

**What success looks like:**
Priya keeps RedisLens open all day. It uses less memory than a single Chrome tab.
She can inspect any key in 2 clicks. She never worries about the tool sending her
data anywhere.

### 5.2 Persona: Marcus -- DevOps Engineer

**Demographics:**
- 35 years old, 10 years of experience
- Works at a fintech startup (50 employees)
- Manages 3 Redis Cluster deployments (prod, staging, dev)
- Also manages Redis Sentinel for legacy services
- OS: Ubuntu Linux (desktop) and macOS (laptop)

**Goals:**
- Monitor production Redis health in real time
- Investigate slow queries reported by application teams
- Manage client connections (identify and kill problematic clients)
- Analyze memory usage patterns and identify large keys
- Perform emergency key deletions during incidents

**Pain points:**
- `INFO` command output is a wall of text that requires scripting to parse
- He needs to check multiple Redis nodes in a cluster quickly
- Slow log analysis in `redis-cli` requires manual timestamp calculation
- He needs a tool that works on both his Linux desktop and macOS laptop
- RedisInsight's telemetry is a non-starter for his fintech company's security
  policy

**Typical workflow:**
1. Open RedisLens on his monitoring station
2. Connect to production Redis Cluster (auto-discovers topology)
3. Check the server monitor dashboard: ops/sec, memory, connected clients
4. Drill into slow log to identify recent slow queries
5. Navigate to the client list, filter by application name
6. During an incident: browse to a key namespace, bulk delete with confirmation

**What success looks like:**
Marcus uses RedisLens as his primary Redis monitoring tool. The dashboard gives
him at-a-glance health status. Cluster topology is auto-discovered and
visualized. He can investigate and resolve issues without switching to the CLI.

### 5.3 Persona: Aisha -- Data Architect

**Demographics:**
- 42 years old, 18 years of experience
- Works at a large e-commerce company (5,000 employees)
- Designs Redis data schemas for multiple application teams
- Heavy user of Redis Streams, JSON, and Sorted Sets
- OS: Windows 11 (company standard)

**Goals:**
- Design and validate Redis data schemas across multiple types
- Edit complex nested JSON values stored in Redis
- Manage Redis Stream consumer groups and inspect stream entries
- Export and import key sets for environment provisioning
- Document data patterns and share connection profiles with teams

**Pain points:**
- No existing GUI handles Redis Streams well
- JSON editing in redis-cli is error-prone for deeply nested structures
- She manages 12+ Redis instances and needs organized connection profiles
- Bulk export/import is currently handled through custom scripts
- She needs to demonstrate data patterns to junior developers

**Typical workflow:**
1. Open RedisLens and select the "Catalog Service" connection group
2. Browse to `product:stream:updates` (a Redis Stream)
3. Inspect stream entries, verify consumer group lag
4. Switch to a JSON key, open the tree-based JSON editor
5. Modify a nested field, validate, and save
6. Export a set of template keys for provisioning a new environment

**What success looks like:**
Aisha uses RedisLens as her Redis schema design workbench. The type-aware editors
handle every data structure she uses. She shares connection profiles with her
team. Export/import replaces her custom provisioning scripts.

---

## 6. Feature Breakdown

### 6.1 Connection Manager

The Connection Manager handles all aspects of establishing, persisting, and
organizing Redis connections.

#### 6.1.1 Connection Methods

**URI Paste:**
Users can paste a Redis URI in any standard format:

```
redis://username:password@hostname:6379/0
rediss://username:password@hostname:6380/0     (TLS)
redis+sentinel://username:password@host1:26379,host2:26379/mymaster/0
```

The URI is parsed and fields are auto-populated. Validation occurs immediately
and errors are shown inline.

**Field-by-Field Configuration:**
For users who prefer explicit configuration:

| Field              | Type        | Default     | Notes                          |
|--------------------|-------------|-------------|--------------------------------|
| Name               | Text        | (required)  | Human-readable connection name |
| Host               | Text        | `localhost` | Hostname or IP address         |
| Port               | Number      | `6379`      | Port number (1-65535)          |
| Username           | Text        | (empty)     | Redis 6+ ACL username          |
| Password           | Password    | (empty)     | Stored in OS keychain          |
| Database           | Number      | `0`         | Database index (0-15)          |
| TLS Enabled        | Toggle      | Off         | Enable TLS/SSL                 |
| TLS CA Certificate | File picker | (optional)  | Custom CA for self-signed      |
| TLS Client Cert    | File picker | (optional)  | Mutual TLS client certificate  |
| TLS Client Key     | File picker | (optional)  | Mutual TLS client key          |

**SSH Tunnel:**
For Redis instances behind firewalls:

| Field              | Type        | Default     | Notes                          |
|--------------------|-------------|-------------|--------------------------------|
| SSH Host           | Text        | (required)  | SSH server hostname            |
| SSH Port           | Number      | `22`        | SSH server port                |
| SSH Username       | Text        | (required)  | SSH login username             |
| SSH Auth Method    | Select      | `key`       | `password` or `key`            |
| SSH Password       | Password    | (optional)  | SSH password                   |
| SSH Private Key    | File picker | (optional)  | Path to private key file       |
| SSH Passphrase     | Password    | (optional)  | Key passphrase                 |

**Cluster Auto-Discovery:**
When connecting to a Redis Cluster node, RedisLens automatically:

1. Issues `CLUSTER INFO` to verify cluster mode
2. Issues `CLUSTER NODES` to discover all nodes
3. Builds a topology map (masters, replicas, slot ranges)
4. Establishes connection pools to all reachable nodes
5. Routes commands to the correct node based on key slot

**Sentinel Resolution:**
When connecting through Redis Sentinel:

1. Connects to the specified Sentinel node(s)
2. Issues `SENTINEL get-master-addr-by-name` for the named master
3. Resolves the current master address
4. Establishes a connection to the master
5. Monitors for failover events and reconnects automatically

#### 6.1.2 Connection Profiles

Connections are saved as profiles that persist across sessions:

- **Profile groups:** Organize connections by environment (Development, Staging,
  Production) or by project
- **Color coding:** Each profile can be assigned a color that appears in the UI
  chrome, making it immediately clear which environment is active
- **Quick connect:** Recent connections appear at the top of the connection list
- **Import/Export:** Profiles can be exported as JSON (with passwords excluded)
  and imported on another machine
- **Duplicate detection:** Warns when creating a profile that matches an existing
  one
- **Connection testing:** "Test Connection" button validates connectivity without
  fully initializing

#### 6.1.3 Credential Management

- Passwords and SSH keys are stored in the OS keychain (macOS Keychain, Windows
  Credential Manager, Linux Secret Service)
- Credentials are never written to disk in plaintext
- Connection profile exports exclude credentials by default
- Memory containing credentials is zeroed after use

### 6.2 Key Browser

The Key Browser is the primary interface for navigating and managing Redis keys.

#### 6.2.1 SCAN-Based Tree View

RedisLens builds a hierarchical tree from flat Redis keys using the `:`
delimiter (configurable per connection):

```
Given keys:
  user:42:name
  user:42:email
  user:42:sessions:abc123
  user:42:sessions:def456
  user:99:name
  product:1001:title
  product:1001:price

Tree view:
  user (2)
    42 (3)
      name          [String]  TTL: -1
      email         [String]  TTL: 3600
      sessions (2)
        abc123      [Hash]    TTL: 7200
        def456      [Hash]    TTL: 7200
    99 (1)
      name          [String]  TTL: -1
  product (1)
    1001 (2)
      title         [String]  TTL: -1
      price         [String]  TTL: -1
```

**SCAN-based loading:**
- Uses `SCAN` with configurable `COUNT` hint (default: 500)
- Never uses `KEYS *` (documented as a hard constraint)
- Incrementally builds the tree as SCAN pages arrive
- Shows a progress indicator during initial scan
- Supports cancellation of in-progress scans
- Caches results with configurable TTL and manual refresh

**Virtual scrolling:**
- Uses `@tanstack/virtual` for rendering
- Only DOM nodes visible in the viewport are rendered
- Handles keyspaces of 10M+ keys without UI degradation
- Smooth scrolling at 60fps even during active scanning

#### 6.2.2 Filtering and Search

**Type filter:** Toggle visibility by Redis type (String, Hash, List, Set, ZSet,
Stream, JSON). Filter buttons show count per type.

**Pattern search:** Text input with glob-pattern matching (`user:*:sessions:*`).
Search is performed server-side using `SCAN ... MATCH pattern`.

**TTL filter:** Filter keys by TTL ranges: No Expiry, Expiring (<1h, <24h,
<7d, custom).

**Combined filters:** All filters compose. Users can search for
`user:*:sessions:*` with type=Hash and TTL<1h simultaneously.

#### 6.2.3 Key Information Display

Each key in the tree shows:

- **Key name** (leaf portion of the path)
- **Type badge** (color-coded: String=green, Hash=blue, List=orange, Set=purple,
  ZSet=red, Stream=teal, JSON=yellow)
- **TTL indicator** (remaining time, or infinity symbol for persistent keys)
- **Size estimate** (via `MEMORY USAGE` for selected keys, batch-loaded)
- **Encoding** (via `OBJECT ENCODING` for selected keys)

#### 6.2.4 Bulk Operations

- **Multi-select:** Shift+click for range, Cmd/Ctrl+click for individual
- **Bulk delete:** Delete selected keys with confirmation dialog showing count
  and key names
- **Bulk TTL update:** Set or remove expiry on selected keys
- **Bulk export:** Export selected keys as JSON, Redis protocol (RDB-like), or
  CLI commands
- **Namespace delete:** Right-click a tree folder to delete all keys under that
  prefix (with confirmation and count)

#### 6.2.5 Import and Export

**Export formats:**
- JSON (key-value pairs with type metadata)
- Redis CLI commands (SET, HSET, etc. -- replayable)
- CSV (for String and Hash types)

**Import formats:**
- JSON (matching export schema)
- Redis CLI commands (parsed and executed)

### 6.3 Data Editor

The Data Editor provides type-specific editors for all Redis data types. Each
editor is designed for the unique characteristics of its type.

#### 6.3.1 String Editor

**Raw mode:** Monospace text area with syntax highlighting for JSON, XML, and
other detected formats. Supports copy, paste, and find/replace.

**Formatted mode:** When the value is valid JSON, presents a tree view with
collapsible nodes, inline editing, and type indicators.

**Binary mode:** Hex viewer for binary values with ASCII sidebar.

**Metadata bar:** Displays key name, TTL, encoding (raw/int/embstr), and memory
usage.

```
+------------------------------------------------------------------+
| Key: user:42:profile                                             |
| Type: String | TTL: 3600s | Encoding: raw | Size: 342 bytes     |
|------------------------------------------------------------------|
| {                                                          [RAW] |
|   "name": "Alice",                                    [FORMATTED]|
|   "email": "alice@example.com",                           [HEX]  |
|   "preferences": {                                               |
|     "theme": "dark",                                             |
|     "notifications": true                                        |
|   }                                                              |
| }                                                                |
|------------------------------------------------------------------|
| [Save] [Reset] [Copy] [Set TTL] [Delete Key]                    |
+------------------------------------------------------------------+
```

#### 6.3.2 Hash Editor

**Table mode:** Displays fields and values in a two-column table with inline
editing. Supports sorting by field name or value.

**Add/Remove:** Add new fields via an inline row at the bottom. Delete fields
via a row-level action button.

**Search:** Filter fields by name or value pattern.

```
+------------------------------------------------------------------+
| Key: user:42:settings                                            |
| Type: Hash | TTL: -1 | Fields: 5 | Size: 198 bytes              |
|------------------------------------------------------------------|
| Field              | Value                              | Actions|
|--------------------|------------------------------------+--------|
| theme              | dark                               | [X]    |
| language           | en-US                              | [X]    |
| notifications      | true                               | [X]    |
| timezone           | America/New_York                   | [X]    |
| items_per_page     | 25                                 | [X]    |
|--------------------|------------------------------------+--------|
| + Add field...     |                                    |        |
|------------------------------------------------------------------|
| [Save All] [Reset] [Copy as JSON] [Set TTL] [Delete Key]        |
+------------------------------------------------------------------+
```

#### 6.3.3 List Editor

**Ordered view:** Displays elements with index numbers. Supports inline editing
of individual elements.

**Operations:**
- LPUSH/RPUSH: Add elements to head or tail via input at top/bottom
- LREM: Remove specific elements by value (with count option)
- LSET: Edit element at specific index (click to edit)
- LTRIM: Truncate list via range selector
- Drag-and-drop reordering (translates to LSET operations)

**Pagination:** Lists with 1000+ elements are paginated with configurable page
size.

```
+------------------------------------------------------------------+
| Key: queue:emails:pending                                        |
| Type: List | TTL: -1 | Length: 1,247 | Encoding: quicklist       |
|------------------------------------------------------------------|
| [+ Push Left]                                                    |
|  #0  | {"to":"alice@example.com","subject":"Welcome"}     | [X]  |
|  #1  | {"to":"bob@example.com","subject":"Invoice #42"}    | [X]  |
|  #2  | {"to":"carol@example.com","subject":"Reset pwd"}    | [X]  |
|  ...                                                             |
|  Page 1 of 13  [< Prev] [Next >]                                |
|                                                     [+ Push Right]|
|------------------------------------------------------------------|
| [Copy as JSON] [Set TTL] [Delete Key]                            |
+------------------------------------------------------------------+
```

#### 6.3.4 Set Editor

**Member list:** Displays all members with a search/filter bar. Supports inline
editing (remove + add to change a value, since sets are unordered).

**Operations:**
- SADD: Add member via input field with duplicate detection
- SREM: Remove member via row-level button
- SISMEMBER: Highlight search results that are members
- SRANDMEMBER: "Pick random" button for sampling large sets
- Set operations: SUNION, SINTER, SDIFF with other keys (via key picker)

```
+------------------------------------------------------------------+
| Key: user:42:roles                                               |
| Type: Set | TTL: -1 | Members: 4 | Encoding: listpack            |
|------------------------------------------------------------------|
| [Search members...]                                              |
|  admin                                                     | [X] |
|  editor                                                    | [X] |
|  viewer                                                    | [X] |
|  billing_admin                                             | [X] |
|------------------------------------------------------------|-----|
| + Add member: [________________] [Add]                           |
|------------------------------------------------------------------|
| [Copy as JSON] [Set TTL] [Delete Key]                            |
+------------------------------------------------------------------+
```

#### 6.3.5 Sorted Set Editor

**Table view:** Displays members with scores in a sortable two-column table.
Default sort is by score (ascending).

**Operations:**
- ZADD: Add member with score via inline input
- ZREM: Remove member via row-level button
- Score editing: Click score to edit inline
- ZINCRBY: Increment/decrement buttons on score
- Range queries: Filter by score range or rank range
- ZRANGEBYLEX: Lexicographic range filtering (for same-score members)

```
+------------------------------------------------------------------+
| Key: leaderboard:weekly                                          |
| Type: ZSet | TTL: 604800s | Members: 10,432 | Encoding: skiplist |
|------------------------------------------------------------------|
| [Filter by score range: [min] - [max]]                           |
| Rank | Member           | Score                          | Actions|
|------|------------------|--------------------------------+--------|
|    1 | player:9901      | 98,450                         | [X]    |
|    2 | player:4521      | 97,200                         | [X]    |
|    3 | player:7788      | 95,800                         | [X]    |
|  ... |                  |                                |        |
|  Page 1 of 105  [< Prev] [Next >]                               |
|------------------------------------------------------------|-----|
| + Add: Member [________] Score [_____] [Add]                     |
|------------------------------------------------------------------|
| [Copy as JSON] [Set TTL] [Delete Key]                            |
+------------------------------------------------------------------+
```

#### 6.3.6 Stream Editor

**Entry viewer:** Displays stream entries in reverse chronological order with
expandable field-value pairs.

**Consumer groups panel:** Shows all consumer groups, pending entries (PEL),
consumer details, and lag.

**Operations:**
- XADD: Add new entry with field-value pairs
- XDEL: Delete specific entries by ID
- XTRIM: Trim stream by maxlen or minid
- XACK: Acknowledge pending entries
- XCLAIM: Transfer pending entries between consumers
- XINFO: Full stream metadata display

```
+------------------------------------------------------------------+
| Key: events:orders                                               |
| Type: Stream | TTL: -1 | Length: 45,231 | Groups: 3              |
|------------------------------------------------------------------|
| [Entries]  [Consumer Groups]  [Info]                              |
|                                                                  |
| 1708345600000-0                                   2024-02-19 ...  |
|   action: order_created                                          |
|   order_id: ORD-42                                               |
|   amount: 99.99                                                  |
|   customer_id: C-1001                                            |
|                                                                  |
| 1708345590000-0                                   2024-02-19 ...  |
|   action: payment_received                                       |
|   order_id: ORD-41                                               |
|   amount: 149.50                                                 |
|                                                                  |
| Page 1 of 453  [< Prev] [Next >]                                |
|------------------------------------------------------------------|
| + Add Entry: [field] [value] [+ field] [Submit]                  |
|------------------------------------------------------------------|
| Consumer Groups:                                                 |
| Group            | Consumers | Pending | Last Delivered          |
|------------------|-----------|---------|------------------------|
| order-processor  | 3         | 12      | 1708345600000-0        |
| analytics        | 1         | 0       | 1708345600000-0        |
| audit-log        | 2         | 5       | 1708345595000-0        |
+------------------------------------------------------------------+
```

#### 6.3.7 JSON Editor (RedisJSON)

**Tree view:** Hierarchical, collapsible JSON tree with type indicators (string,
number, boolean, null, array, object).

**Code view:** Monaco-like editor with JSON syntax highlighting, validation, and
formatting.

**Path navigator:** JSONPath breadcrumb for navigating deeply nested structures.
Individual sub-paths can be edited without loading the full document.

```
+------------------------------------------------------------------+
| Key: product:1001                                                |
| Type: ReJSON-RL | TTL: -1 | Size: 2.1 KB                        |
|------------------------------------------------------------------|
| Path: $.inventory.warehouses[0]                                  |
| [Tree View]  [Code View]                                         |
|                                                                  |
|  - product:1001 {8}                                              |
|    - name: "Wireless Keyboard"                     (string)      |
|    - price: 79.99                                  (number)      |
|    - active: true                                  (boolean)     |
|    - tags: ["electronics", "peripherals"]          (array[2])    |
|    - inventory {3}                                               |
|      - total: 1,234                                (number)      |
|      - warehouses [2]                              (array)       |
|        - [0] {3}                                                 |
|          - location: "US-East"                     (string)      |
|          - quantity: 800                           (number)      |
|          - last_restock: "2024-02-01"              (string)      |
|        - [1] {3}                                                 |
|          - location: "EU-West"                     (string)      |
|          - quantity: 434                           (number)      |
|          - last_restock: "2024-01-15"              (string)      |
|------------------------------------------------------------------|
| [Save] [Reset] [Copy] [Format] [Set TTL] [Delete Key]           |
+------------------------------------------------------------------+
```

### 6.4 Server Monitor

The Server Monitor provides real-time visibility into Redis server health and
performance.

#### 6.4.1 Dashboard Metrics

Real-time charts (updated every 2 seconds by default, configurable):

**Performance:**
- Operations per second (instantaneous_ops_per_sec)
- Hit rate (keyspace_hits / (keyspace_hits + keyspace_misses))
- Latency histogram (from `LATENCY HISTORY`)
- Connected clients over time

**Memory:**
- Used memory vs. max memory (with threshold indicator)
- Memory fragmentation ratio
- RSS vs. allocated memory
- Peak memory usage

**Network:**
- Input/output bytes per second
- Connected clients count
- Blocked clients count
- Rejected connections

**Persistence:**
- Last RDB save time and status
- Last AOF rewrite time and status
- RDB/AOF file sizes
- Pending writes

#### 6.4.2 Slow Log Viewer

- Fetches entries from `SLOWLOG GET`
- Displays as a sortable table: timestamp, duration (microseconds), command, args
- Duration color-coding: green (<1ms), yellow (1-10ms), red (>10ms)
- Filter by command type, duration threshold, or time range
- One-click copy of slow commands for analysis
- Trend chart showing slow query frequency over time

#### 6.4.3 Client List

- Displays output of `CLIENT LIST` as a structured table
- Columns: ID, Name, Address, Age, Idle, Flags, Database, Command, Memory
- Sort by any column
- Filter by client name, address, or command pattern
- Kill client button with confirmation (issues `CLIENT KILL`)
- Group by application name or connection source

#### 6.4.4 Memory Analysis

- `MEMORY DOCTOR` output with recommendations
- Top keys by memory usage (sampled via `SCAN` + `MEMORY USAGE`)
- Memory distribution by key type (pie chart)
- Memory distribution by key prefix (treemap)
- Big key detection with configurable thresholds

#### 6.4.5 Keyspace Notifications

- Subscribe to keyspace notifications (`__keyevent@*__:*`)
- Real-time event stream with filtering by operation type
- Event aggregation: show "42 SET operations in the last minute" rather than 42
  individual events
- Pause/resume to freeze the stream for inspection

### 6.5 CLI Console

The built-in CLI Console provides a `redis-cli` experience within the GUI,
enhanced with features not available in the standard CLI.

#### 6.5.1 Command Autocomplete

- Context-aware: suggests commands valid for the current connection mode
- Parameter hints: shows expected arguments for each command
- Key completion: suggests keys matching partial input (via SCAN)
- History completion: suggests from command history

#### 6.5.2 Command History

- Persistent across sessions (stored locally)
- Searchable (Ctrl+R for reverse search, like bash)
- Per-connection history isolation
- Exportable as a text file

#### 6.5.3 Output Formatting

- **Table mode:** Formats Hash output as tables, list output as numbered rows
- **JSON mode:** Formats all output as valid JSON
- **Raw mode:** Shows exact Redis protocol responses (RESP3)

#### 6.5.4 Safety Features

- **Dangerous command warnings:** Commands like `FLUSHALL`, `FLUSHDB`, `DEBUG`,
  `CONFIG SET`, and `SHUTDOWN` trigger a confirmation dialog with impact
  description
- **KEYS * interception:** If the user types `KEYS *`, RedisLens suggests using
  `SCAN` instead and explains why
- **Production safeguards:** Connections tagged as "production" require
  additional confirmation for write operations

#### 6.5.5 Multi-line Support

- Supports multi-line Lua scripts (via `EVAL`)
- Script editor mode for writing and testing Lua scripts
- Syntax highlighting for Lua within the CLI

### 6.6 Pub/Sub Viewer

The Pub/Sub Viewer provides a visual interface for Redis Pub/Sub messaging.

#### 6.6.1 Subscribe

- Subscribe to one or more channels by name
- Subscribe to patterns (`news.*`, `events:*`)
- Channel discovery: scan for active channels via `PUBSUB CHANNELS`
- Active subscription indicator in the UI chrome

#### 6.6.2 Message Display

- Real-time message stream with channel, timestamp, and payload
- Auto-detect JSON payloads and format accordingly
- Message count indicator per channel
- Color-coding by channel for visual distinction

#### 6.6.3 Filtering

- Filter by channel name pattern
- Filter by message content (regex)
- Filter by time range
- Show/hide individual channels

#### 6.6.4 Message Buffer

- Configurable buffer size (default: 10,000 messages)
- Oldest messages are discarded when the buffer is full
- Pause/resume to freeze the stream for inspection
- Export buffer contents as JSON or CSV

#### 6.6.5 Publish

- Publish messages to any channel from the UI
- Message templates for common payloads
- Publish history for re-sending previous messages

---

## 7. Architecture Overview

### 7.1 High-Level Architecture

```
+---------------------------------------------------------------+
|                        RedisLens Application                   |
|                                                               |
|  +-------------------------+   +---------------------------+  |
|  |    Next.js Frontend     |   |     Rust Backend          |  |
|  |                         |   |                           |  |
|  |  App Shell              |   |  Connection Manager       |  |
|  |  Connection UI          |   |  Key Browser Engine       |  |
|  |  Browser UI             |   |  Value Serializer         |  |
|  |  Editor UI              |   |  Monitor Poller           |  |
|  |  Monitor UI             |   |  CLI Executor             |  |
|  |  CLI UI                 |   |  PubSub Manager           |  |
|  |  PubSub UI              |   |  Config Store             |  |
|  |                         |   |  Credential Manager       |  |
|  +----------|--------------+   +-------------|-------------+  |
|             |    Tauri IPC (invoke/events)    |               |
|             +--------------------------------+               |
+---------------------------------------------------------------+
        |                    |                    |
        v                    v                    v
  +----------+        +----------+        +-----------+
  | Redis    |        | OS       |        | File      |
  | Server(s)|        | Keychain |        | System    |
  +----------+        +----------+        +-----------+
```

### 7.2 Layer Descriptions

**Presentation Layer (Next.js):**
Renders the UI, manages component state, and dispatches user actions to the
backend via Tauri IPC. Uses Zustand for global state management and React Query
for server state caching.

**IPC Bridge (Tauri):**
Provides typed function calls (`invoke`) from JavaScript to Rust and an event
system for Rust-to-JavaScript push notifications. All data crosses the bridge as
JSON, serialized by serde on the Rust side.

**Command Layer (Rust):**
Tauri command handlers that validate input, orchestrate business logic, and
serialize responses. Each command is a thin function that delegates to service
modules.

**Client Layer (Rust):**
Manages Redis connections through `deadpool-redis` connection pools. Handles
cluster slot routing, sentinel failover, and TLS negotiation. All Redis I/O is
async via `tokio`.

**Infrastructure Layer (Rust):**
OS integrations including keychain access, file system operations (config
storage, import/export), and logging.

### 7.3 Key Data Flows

**Browse keys flow:**

```
User clicks "Refresh" in Browser UI
  -> Browser UI calls invoke("scan_keys", { connectionId, cursor, pattern, count })
  -> Rust scan_keys command validates input
  -> Gets pool from Connection Manager
  -> Executes SCAN on Redis
  -> Builds tree structure from flat keys
  -> Serializes tree as JSON
  -> Returns to Browser UI
  -> Browser UI renders tree with virtual scrolling
  -> If cursor != 0, UI auto-fetches next page
```

**Edit value flow:**

```
User edits a Hash field in the Editor UI
  -> Editor UI calls invoke("hset", { connectionId, key, field, value })
  -> Rust hset command validates input
  -> Gets pool from Connection Manager
  -> Executes HSET on Redis
  -> Returns success/failure
  -> Editor UI updates local state
  -> If key browser is visible, refresh TTL display
```

**Monitor flow (push-based):**

```
User opens Server Monitor for a connection
  -> Monitor UI calls invoke("start_monitor", { connectionId, interval })
  -> Rust starts a tokio timer that runs every `interval` ms
  -> Every tick: execute INFO, parse fields, emit Tauri event
  -> Frontend listens for "monitor:stats" events
  -> Monitor UI updates charts with new data points
  -> User closes Monitor: invoke("stop_monitor", { connectionId })
  -> Rust cancels the timer
```

---

## 8. Technology Decisions

### 8.1 Why Tauri 2.x (vs Electron)

| Criterion           | Tauri 2.x              | Electron                |
|---------------------|------------------------|-------------------------|
| Binary size         | ~15 MB                 | ~200-400 MB             |
| Memory (idle)       | ~80 MB                 | ~300-500 MB             |
| Startup time        | <2s                    | 3-8s                    |
| Backend language    | Rust (memory-safe)     | Node.js                 |
| WebView             | OS native (WebView2)   | Bundled Chromium         |
| Auto-updater        | Built-in               | electron-updater         |
| Security            | Strict CSP, no Node    | Full Node.js access      |
| Cross-platform      | macOS/Win/Linux        | macOS/Win/Linux          |

**Decision rationale:** Tauri's use of the OS native WebView eliminates the
Chromium overhead that makes Electron apps heavy. The Rust backend provides
memory safety, excellent async I/O through tokio, and direct access to system
APIs. The trade-off is that WebView behavior can vary across platforms, but
Tauri 2.x has matured significantly in this area.

### 8.2 Why Rust (vs Go, Node.js)

| Criterion           | Rust                   | Go                     | Node.js               |
|---------------------|------------------------|------------------------|------------------------|
| Memory safety       | Compile-time (borrow)  | GC-managed             | GC-managed             |
| Async I/O           | tokio (zero-cost)      | goroutines (runtime)   | libuv (event loop)     |
| Binary size         | Small (static link)    | Medium                 | Large (V8 bundled)     |
| Redis client        | redis-rs (mature)      | go-redis (mature)      | ioredis (mature)       |
| Tauri integration   | Native (first-class)   | N/A (FFI required)     | N/A (Electron only)    |
| Learning curve      | Steep                  | Moderate               | Low                    |

**Decision rationale:** Rust is the native language for Tauri backends. Beyond
this, Rust's ownership model prevents data races in our concurrent connection
pool management. The `redis-rs` crate provides async Redis operations with
cluster and sentinel support. The learning curve is offset by long-term
maintainability and performance.

### 8.3 Why Next.js 14+ (vs Svelte, vanilla)

| Criterion           | Next.js 14+            | SvelteKit              | Vanilla TS             |
|---------------------|------------------------|------------------------|------------------------|
| Component model     | React (ecosystem)      | Svelte (compiled)      | Custom (manual)        |
| Ecosystem           | Massive                | Growing                | DIY                    |
| Developer pool      | Very large             | Moderate               | Large                  |
| Bundle optimization | App Router + RSC       | Compiler-optimized     | Manual tree-shaking    |
| UI libraries        | shadcn/ui, radix, etc. | Limited                | Headless only          |
| Learning curve      | Moderate               | Low                    | High (architecture)    |

**Decision rationale:** Next.js provides the largest ecosystem of UI components,
patterns, and developer familiarity. For an open-source project that depends on
community contributions, React/Next.js maximizes the contributor pool. The App
Router provides built-in code splitting. In a Tauri context, we use Next.js in
static export mode (SSG), so no server runtime is needed.

Note: In the Tauri context, Next.js is used purely as a frontend framework with
`output: 'export'`. There is no Next.js server. All "API" calls go through Tauri
IPC, not HTTP.

### 8.4 Why Zustand (vs Redux, Jotai)

| Criterion           | Zustand                | Redux Toolkit          | Jotai                  |
|---------------------|------------------------|------------------------|------------------------|
| Boilerplate         | Minimal                | Moderate               | Minimal                |
| DevTools            | Redux DevTools compat  | Native                 | Limited                |
| Learning curve      | Very low               | Moderate               | Low                    |
| Bundle size         | ~1 KB                  | ~12 KB                 | ~3 KB                  |
| TypeScript          | Excellent              | Excellent              | Excellent              |
| Middleware          | Simple                 | RTK middleware         | Atom middleware         |

**Decision rationale:** Zustand's minimal API and tiny bundle size make it ideal
for a desktop application where bundle size matters and state management needs
are straightforward. The Redux DevTools compatibility provides debugging
capabilities without Redux's boilerplate.

### 8.5 Why shadcn/ui (vs Material UI, Ant Design)

| Criterion           | shadcn/ui              | Material UI            | Ant Design             |
|---------------------|------------------------|------------------------|------------------------|
| Ownership           | Copy into project      | npm dependency         | npm dependency         |
| Customization       | Full (own the code)    | Theme + CSS overrides  | Theme + CSS overrides  |
| Bundle impact       | Zero unused components | Tree-shakeable         | Large base CSS         |
| Accessibility       | Radix primitives       | Material spec          | WCAG partial           |
| Styling             | Tailwind CSS           | Emotion/CSS-in-JS      | Less/CSS modules       |
| Look and feel       | Modern, neutral        | Material design        | Enterprise Chinese     |

**Decision rationale:** shadcn/ui's copy-paste model means we own every
component in our codebase. This is critical for a desktop application where we
need precise control over styling, behavior, and accessibility. The Radix
primitive foundation ensures keyboard navigation and screen reader support.
Tailwind CSS provides utility-first styling without CSS-in-JS runtime overhead.

---

## 9. Data Model

### 9.1 Connection Profile

The Connection Profile is the central configuration entity. It contains all
information needed to establish and identify a Redis connection.

```typescript
interface ConnectionProfile {
  id: string;                      // UUID v4, generated on creation
  name: string;                    // Human-readable name (e.g., "Production Cluster")
  group: string;                   // Organizational group (e.g., "Production")
  color: string;                   // Hex color for UI chrome (e.g., "#EF4444")
  createdAt: string;               // ISO 8601 timestamp
  updatedAt: string;               // ISO 8601 timestamp
  lastConnectedAt: string | null;  // ISO 8601 timestamp of last successful connection

  // Connection target
  mode: "standalone" | "cluster" | "sentinel";
  host: string;                    // Hostname or IP
  port: number;                    // Port number (1-65535)
  database: number;                // Database index (0-15, standalone only)

  // Sentinel-specific
  sentinelNodes: { host: string; port: number }[];  // Sentinel node addresses
  sentinelMasterName: string;                        // Master name to resolve

  // Authentication
  username: string;                // Redis 6+ ACL username (empty for default)
  passwordRef: string;             // Reference to OS keychain entry (not the actual password)

  // TLS
  tls: {
    enabled: boolean;
    caCertPath: string | null;     // Path to custom CA certificate
    clientCertPath: string | null; // Path to client certificate
    clientKeyPath: string | null;  // Path to client private key
    rejectUnauthorized: boolean;   // Verify server certificate (default: true)
  };

  // SSH Tunnel
  ssh: {
    enabled: boolean;
    host: string;
    port: number;
    username: string;
    authMethod: "password" | "key";
    passwordRef: string;           // Reference to OS keychain entry
    privateKeyPath: string | null;
    passphraseRef: string;         // Reference to OS keychain entry
  };

  // Preferences (per-connection)
  preferences: {
    keyDelimiter: string;          // Tree delimiter (default: ":")
    scanCount: number;             // SCAN COUNT hint (default: 500)
    autoRefreshInterval: number;   // Key browser refresh interval in ms (0 = off)
    readOnly: boolean;             // Prevent all write operations
  };
}
```

### 9.2 Key Entry

Represents a single Redis key as displayed in the browser.

```typescript
interface KeyEntry {
  key: string;                     // Full key name
  type: RedisType;                 // "string" | "hash" | "list" | "set" | "zset" | "stream" | "ReJSON-RL"
  ttl: number;                     // Seconds remaining (-1 = no expiry, -2 = key does not exist)
  encoding: string;                // Internal encoding (e.g., "raw", "ziplist", "skiplist")
  memoryUsage: number | null;      // Bytes (null if not yet fetched)
  size: number | null;             // Element count (HLEN, LLEN, SCARD, ZCARD, XLEN)
}
```

### 9.3 Tree Node

Internal representation of the key browser tree.

```typescript
interface TreeNode {
  name: string;                    // This node's segment (e.g., "user" or "42")
  fullPath: string;                // Full path up to this node (e.g., "user:42")
  isLeaf: boolean;                 // true if this node is an actual Redis key
  children: Map<string, TreeNode>; // Child nodes (empty if isLeaf)
  childCount: number;              // Total descendant leaf count (for folder labels)
  keyEntry: KeyEntry | null;       // Key metadata (only for leaf nodes)
}
```

### 9.4 Monitor Snapshot

A point-in-time snapshot of server statistics.

```typescript
interface MonitorSnapshot {
  timestamp: string;               // ISO 8601 timestamp
  connectionId: string;            // Which connection this data belongs to

  // Performance
  opsPerSecond: number;            // instantaneous_ops_per_sec
  hitRate: number;                 // Calculated: hits / (hits + misses)
  connectedClients: number;        // connected_clients
  blockedClients: number;          // blocked_clients

  // Memory
  usedMemory: number;              // used_memory (bytes)
  usedMemoryPeak: number;          // used_memory_peak (bytes)
  maxMemory: number;               // maxmemory (bytes, 0 = unlimited)
  fragmentationRatio: number;      // mem_fragmentation_ratio
  usedMemoryRss: number;           // used_memory_rss (bytes)

  // Network
  inputBytesPerSecond: number;     // instantaneous_input_kbps * 1024
  outputBytesPerSecond: number;    // instantaneous_output_kbps * 1024
  totalConnectionsReceived: number;// total_connections_received
  rejectedConnections: number;     // rejected_connections

  // Persistence
  rdbLastSaveTime: number;         // rdb_last_save_time (unix timestamp)
  rdbLastSaveStatus: string;       // rdb_last_bgsave_status
  aofEnabled: boolean;             // aof_enabled
  aofLastRewriteStatus: string;    // aof_last_bgrewrite_status

  // Keyspace
  databases: {
    index: number;
    keys: number;
    expires: number;
    avgTtl: number;
  }[];
}
```

### 9.5 Slow Log Entry

```typescript
interface SlowLogEntry {
  id: number;                      // Unique incrementing ID
  timestamp: number;               // Unix timestamp (seconds)
  duration: number;                // Execution time (microseconds)
  command: string;                 // The command that was slow
  args: string[];                  // Command arguments
  clientAddress: string;           // Client IP:port
  clientName: string;              // Client name (if set via CLIENT SETNAME)
}
```

### 9.6 PubSub Message

```typescript
interface PubSubMessage {
  id: string;                      // Local UUID for UI keying
  channel: string;                 // Channel name
  pattern: string | null;          // Matching pattern (if subscribed via PSUBSCRIBE)
  payload: string;                 // Message payload
  receivedAt: string;              // ISO 8601 timestamp (local receipt time)
  isJson: boolean;                 // Whether payload was detected as valid JSON
}
```

### 9.7 CLI History Entry

```typescript
interface CliHistoryEntry {
  id: string;                      // UUID
  connectionId: string;            // Which connection
  command: string;                 // The command that was executed
  response: string;                // Raw response text
  duration: number;                // Execution time (milliseconds)
  executedAt: string;              // ISO 8601 timestamp
  isError: boolean;                // Whether the response was an error
}
```

### 9.8 Application Configuration

Persisted as a JSON file in the OS application data directory.

```typescript
interface AppConfig {
  version: number;                 // Config schema version (for migrations)

  // Appearance
  theme: "light" | "dark" | "system";
  fontSize: number;                // Base font size (12-18)
  fontFamily: string;              // Monospace font for code/CLI

  // Behavior
  confirmDangerousCommands: boolean;  // Show confirmation for FLUSHALL, etc.
  maxCliHistory: number;              // Max CLI history entries per connection
  maxPubSubBuffer: number;            // Max buffered Pub/Sub messages
  defaultScanCount: number;           // Default SCAN COUNT hint
  defaultKeyDelimiter: string;        // Default tree delimiter

  // Updates
  checkForUpdates: boolean;           // Check for new versions on startup
  autoUpdate: boolean;                // Automatically download and install updates

  // Window
  windowBounds: {                     // Restore window position/size
    x: number;
    y: number;
    width: number;
    height: number;
  };
}
```

---

## 10. User Flows

### 10.1 First Launch

```
1. Application starts (< 2 seconds)
2. Welcome screen displayed:
   - "Welcome to RedisLens"
   - Brief feature overview (3 cards: Browse, Monitor, Query)
   - "Connect to Redis" primary button
   - "Import Connections" secondary link
3. User clicks "Connect to Redis"
4. Connection dialog opens with two tabs: "Quick Connect" and "Advanced"
5. Quick Connect tab:
   a. Large URI input field with placeholder: "redis://localhost:6379"
   b. "Connect" button (disabled until valid URI)
   c. User pastes URI
   d. URI is validated in real-time (green checkmark or red error)
   e. User clicks "Connect"
6. Application tests the connection:
   a. Spinner with "Connecting..."
   b. On success: connection is saved as a profile, key browser opens
   c. On failure: error message with details and "Edit Connection" option
7. Key browser loads:
   a. Initial SCAN begins immediately
   b. Tree builds incrementally as results arrive
   c. Progress indicator shows scan progress
   d. Sidebar shows connection info (server version, mode, database)
```

### 10.2 Connecting to a Saved Profile

```
1. Application starts
2. Connection list shown in left sidebar:
   - Grouped by folder (Development, Staging, Production)
   - Each profile shows: name, host:port, color indicator
   - Recently used profiles appear at top
   - Search/filter bar at top
3. User double-clicks "Production Cluster" (red color indicator)
4. Production safeguard dialog:
   - "You are connecting to a production environment"
   - Connection details shown
   - "Connect (Read-Only)" and "Connect (Full Access)" buttons
5. User clicks "Connect (Read-Only)"
6. Connection established:
   a. Red border appears around the application window
   b. "PRODUCTION - READ ONLY" badge in title bar
   c. Key browser loads with write operations disabled
   d. Cluster topology panel shows master/replica layout
```

### 10.3 Browsing and Editing a Key

```
1. Key browser is open, tree is populated
2. User types "user:42" in the search bar
3. Tree filters to show only matching keys:
   - user:42:name
   - user:42:email
   - user:42:sessions:abc123
   - user:42:sessions:def456
4. User clicks on "user:42:sessions:abc123" [Hash]
5. Right panel shows the Hash editor:
   a. Key metadata bar: type=Hash, TTL=7200s, fields=5, size=342B
   b. Field-value table loads
   c. Fields: session_id, user_agent, ip_address, created_at, last_active
6. User clicks on the "last_active" value to edit
7. Inline editor activates:
   a. Value becomes an editable text field
   b. Original value shown as placeholder
   c. Save (Enter) and Cancel (Escape) options
8. User changes the value and presses Enter
9. HSET command executes:
   a. Brief success indicator (green flash on the field)
   b. Updated value displayed
   c. If TTL was set, TTL continues unchanged
10. User right-clicks the key in the tree
11. Context menu: Copy Key, Copy Value, Rename, Set TTL, Delete
12. User selects "Set TTL"
13. TTL dialog:
    a. Input field with current TTL pre-filled
    b. Quick presets: 1h, 24h, 7d, 30d, No Expiry
    c. User selects "24h"
    d. EXPIRE command executes
    e. TTL indicator in tree updates
```

### 10.4 Monitoring Server

```
1. User clicks "Monitor" tab in the top navigation
2. Server monitor dashboard opens:
   a. Four metric cards at top: Ops/sec, Hit Rate, Memory, Clients
   b. Main chart area with time-series graph (last 5 minutes)
   c. Metric selector: ops/sec, memory, clients, network
3. Charts begin updating in real-time (every 2 seconds)
4. User notices high memory usage (card shows yellow warning)
5. User clicks the Memory card for details:
   a. Detailed memory breakdown view
   b. used_memory: 2.1 GB / 4 GB max (52%)
   c. Fragmentation ratio: 1.3
   d. Peak memory: 3.8 GB
   e. "Analyze Large Keys" button
6. User clicks "Analyze Large Keys"
7. Analysis begins:
   a. SCAN + MEMORY USAGE sampling (progress bar)
   b. Results table: top 50 keys by memory usage
   c. Columns: key, type, size, TTL, encoding
   d. Treemap visualization by key prefix
8. User switches to "Slow Log" tab
9. Slow log table loads:
   a. 50 most recent slow queries
   b. Sorted by duration (descending)
   c. User sees a ZRANGEBYSCORE taking 45ms
   d. User clicks the entry to see full command and arguments
   e. "Copy Command" button to reproduce in CLI
```

### 10.5 Using the CLI Console

```
1. User clicks "CLI" tab or presses Ctrl+`
2. CLI console opens at the bottom of the screen (resizable)
3. Prompt shows: "redis> " (with connection name in the prompt)
4. User types "H" -- autocomplete suggests:
   - HDEL, HEXISTS, HGET, HGETALL, HINCRBY, ...
5. User selects "HGETALL" from autocomplete
6. Autocomplete now suggests key names matching partial input
7. User types "user:42:settings" and presses Enter
8. Output displayed in table format:
   +-------------------+------------------+
   | Field             | Value            |
   +-------------------+------------------+
   | theme             | dark             |
   | language          | en-US            |
   | notifications     | true             |
   +-------------------+------------------+
   (3 fields, 0.42ms)
9. User types "FLUSHDB"
10. Dangerous command dialog:
    a. "FLUSHDB will delete all keys in database 0"
    b. "This action cannot be undone"
    c. "Type 'FLUSHDB' to confirm" input field
    d. Cancel and Confirm buttons
11. User cancels
12. User presses Ctrl+R for reverse history search
13. Types "ZADD" -- history shows previous ZADD commands
14. User selects one, modifies it, and executes
```

---

## 11. Non-Functional Requirements

### 11.1 Performance

| Metric                          | Target              | Measurement Method         |
|---------------------------------|----------------------|----------------------------|
| Application startup (cold)      | < 2 seconds          | Time to interactive        |
| Application startup (warm)      | < 1 second           | Time to interactive        |
| Key browser initial load        | < 100 ms (1K keys)   | Time to first render       |
| Key browser scroll (10M keys)   | 60 fps               | Frame rate measurement     |
| Key value load (String, <1MB)   | < 50 ms              | Time from click to display |
| Key value load (Hash, 100 fields)| < 100 ms            | Time from click to display |
| SCAN page (COUNT=500)           | < 200 ms             | Round-trip time            |
| Monitor chart update            | < 16 ms (60 fps)     | Frame time measurement     |
| CLI command execution           | < 10 ms overhead     | Over raw redis-cli time    |
| Memory usage (idle, 1 conn)     | < 100 MB             | RSS measurement            |
| Memory usage (browse, 10K keys) | < 200 MB             | RSS measurement            |
| Binary size (macOS universal)   | < 25 MB              | Built artifact size        |
| Binary size (Windows x64)       | < 20 MB              | Built artifact size        |

### 11.2 Security

**No telemetry:** The application contains no telemetry code, no analytics
SDKs, and no network calls other than Redis connections and optional update
checks.

**Credential storage:** All passwords, SSH keys, and TLS certificates are stored
in the OS keychain. At no point are credentials written to disk in plaintext.
Connection profile export explicitly excludes credentials.

**Memory hygiene:** Buffers containing credentials are zeroed after use. The Rust
backend uses `zeroize` for sensitive data types.

**Content Security Policy:** The Tauri WebView runs with a strict CSP that
prevents inline scripts, external resource loading, and eval().

**IPC validation:** All Tauri command inputs are validated on the Rust side.
The frontend is not trusted. Malformed inputs are rejected with typed errors.

**Dependency auditing:** `cargo audit` and `npm audit` run in CI. Dependencies
with known vulnerabilities block the build.

**Update verification:** Auto-updates are delivered over HTTPS and verified with
Ed25519 signatures. The public key is embedded in the binary.

### 11.3 Accessibility

**Target:** WCAG 2.1 AA compliance.

**Keyboard navigation:**
- All features accessible via keyboard
- Consistent shortcut scheme (documented in Help menu)
- Focus indicators visible on all interactive elements
- Tree browser supports arrow key navigation
- Tab order follows visual layout

**Screen reader support:**
- ARIA labels on all interactive elements
- ARIA live regions for dynamic content (monitor updates, scan progress)
- Semantic HTML structure (headings, landmarks, lists)
- Status announcements for async operations

**Visual accessibility:**
- Minimum contrast ratio of 4.5:1 for text
- Color is never the sole indicator (always paired with icon or text)
- Respects OS reduced-motion preference
- Font size configurable (12-18px base)
- Support for system high-contrast mode

**Testing:**
- Automated accessibility testing with axe-core in Vitest
- Manual testing with VoiceOver (macOS), NVDA (Windows), Orca (Linux)
- Keyboard-only testing for all user flows

### 11.4 Platform Support

| Platform          | Minimum Version   | WebView Engine         | Notes                  |
|-------------------|-------------------|------------------------|------------------------|
| macOS             | 12.0 (Monterey)   | WebKit (WKWebView)     | Universal binary (x64+arm64) |
| Windows           | 10 (1809+)        | WebView2 (Edge)        | x64, arm64             |
| Linux             | Ubuntu 22.04+     | WebKitGTK 4.1          | x64, AppImage + .deb   |

**Cross-platform consistency:**
- UI rendering differences between WebView engines are tested in CI
- Platform-specific features (e.g., macOS titlebar style) are handled via
  conditional compilation
- Keyboard shortcuts follow platform conventions (Cmd on macOS, Ctrl elsewhere)

### 11.5 Reliability

- **Connection resilience:** Automatic reconnection with exponential backoff
  when Redis connections drop
- **Data safety:** Confirmation dialogs for all destructive operations
- **Crash recovery:** Application state (open tabs, scroll position) is persisted
  and restored after crash or unexpected quit
- **Graceful degradation:** If a feature fails (e.g., MEMORY USAGE not
  available), the UI degrades gracefully with an informative message

---

## 12. Release Strategy

### 12.1 Development Phases

#### Phase 1: Foundation (Weeks 1-3)
**Goal:** Buildable, runnable application with basic connection.

- Tauri 2.x project scaffolding
- Next.js frontend with app shell (layout, routing, theme)
- Rust backend with connection manager (standalone only)
- Basic connection dialog (URI paste + field-by-field)
- Connection profile storage (config file + keychain)
- CI/CD pipeline (build, test, lint for all platforms)

**Exit criteria:** User can launch the app, create a connection profile, and
successfully connect to a standalone Redis instance.

#### Phase 2: Key Browser (Weeks 4-6)
**Goal:** Browse and inspect Redis keys with tree view.

- SCAN-based key loading with cursor management
- Tree builder from flat keys (configurable delimiter)
- Virtual scrolling for key list
- Type-aware key display (badges, icons)
- TTL display and refresh
- Basic filtering (by type, by pattern)

**Exit criteria:** User can browse a keyspace of 100K+ keys smoothly, filter by
type, and search by pattern.

#### Phase 3: Data Editors (Weeks 7-10)
**Goal:** View and edit all Redis data types.

- String editor (raw, formatted JSON, hex)
- Hash editor (table view, inline editing)
- List editor (ordered view, push/pop, pagination)
- Set editor (member list, add/remove)
- Sorted Set editor (score table, range filtering)
- Stream editor (entry viewer, consumer groups)
- JSON editor (tree view, code view)
- Key metadata display (encoding, memory usage)
- TTL management (set, remove, update)

**Exit criteria:** User can view and edit values of all Redis types. Editors
handle large values (1MB+ strings, 10K+ hash fields) without degradation.

#### Phase 4: CLI Console (Weeks 11-12)
**Goal:** Built-in CLI with modern features.

- Command input with syntax highlighting
- Autocomplete (commands, keys)
- Command history (persistent, searchable)
- Output formatting (table, JSON, raw)
- Dangerous command warnings
- Multi-line support (Lua scripts)

**Exit criteria:** User can execute any Redis command through the built-in CLI
with autocomplete and formatted output. Dangerous commands show warnings.

**--- MVP Release (v0.1.0) after Phase 4 ---**

#### Phase 5: Server Monitor (Weeks 13-15)
**Goal:** Real-time server monitoring dashboard.

- INFO parsing and metric extraction
- Real-time dashboard with charts
- Slow log viewer with filtering
- Client list with kill capability
- Memory analysis (large key detection)

**Exit criteria:** User can monitor server health in real time, investigate slow
queries, and manage client connections.

#### Phase 6: Advanced Connections (Weeks 16-18)
**Goal:** Cluster, Sentinel, SSH tunnel, TLS.

- Redis Cluster support (auto-discovery, slot routing)
- Redis Sentinel support (master resolution, failover detection)
- SSH tunnel support (password and key auth)
- TLS/mTLS support (custom CA, client certificates)
- Cluster topology visualization

**Exit criteria:** User can connect to and fully operate Redis in any deployment
topology (standalone, cluster, sentinel) through any connection method (direct,
SSH tunnel, TLS).

#### Phase 7: Pub/Sub and Polish (Weeks 19-22)
**Goal:** Pub/Sub viewer and UX polish for v1.0.

- Pub/Sub subscribe and message viewer
- Channel discovery and pattern matching
- Publish from UI
- Bulk key operations (delete, TTL update, export)
- Import/export (JSON, CLI commands)
- Keyboard shortcuts (comprehensive scheme)
- Settings UI (all configuration options)
- Auto-updater
- Comprehensive documentation (user guide, contributor guide)

**Exit criteria:** All features from the Feature Breakdown section are
implemented, tested, and documented.

**--- v1.0.0 Release after Phase 7 ---**

### 12.2 Beyond v1.0

**v1.1 - Developer Experience:**
- Lua script editor with debugging
- Key pattern analysis and recommendations
- Redis module support (RedisTimeSeries, RedisBloom, etc.)
- Query bookmarks and sharing

**v1.2 - Enterprise Features:**
- Connection sharing via file (team profiles)
- Audit log (record all commands executed through RedisLens)
- Read-only mode enforcement (per connection)
- Custom key formatters (plugin system foundation)

**v2.0 - Plugin System:**
- Plugin API for custom data viewers
- Plugin API for custom key formatters
- Plugin marketplace (community-driven)
- Custom dashboard widgets
- Import/export plugins (CSV, Parquet, etc.)

### 12.3 Versioning and Release Process

- **Semantic versioning:** MAJOR.MINOR.PATCH
- **Release cadence:** Monthly minor releases, patch releases as needed
- **Release channels:**
  - Stable: Fully tested, recommended for production monitoring
  - Beta: Feature-complete but less tested, for early adopters
  - Nightly: Automated builds from main branch, for contributors
- **Signed releases:** All binaries are signed:
  - macOS: Apple Developer ID + notarization
  - Windows: Authenticode code signing
  - Linux: GPG-signed checksums
- **Changelog:** Every release includes a detailed changelog following
  Keep a Changelog format

---

## 13. Risk Register

### 13.1 Technical Risks

| ID   | Risk                                    | Probability | Impact  | Mitigation                                           |
|------|-----------------------------------------|-------------|---------|------------------------------------------------------|
| T-01 | Tauri 2.x WebView inconsistencies       | Medium      | High    | Extensive cross-platform testing in CI; feature detection; graceful fallbacks |
| T-02 | redis-rs cluster support limitations     | Low         | High    | Upstream contributions; fallback to manual slot routing |
| T-03 | Virtual scrolling performance ceiling    | Medium      | Medium  | Benchmark early; switch to canvas rendering if needed |
| T-04 | Large value handling (>10MB strings)     | Medium      | Medium  | Streaming reads; pagination; size warnings           |
| T-05 | WebView2 availability on Windows         | Low         | High    | Bundle WebView2 bootstrapper; document requirement   |
| T-06 | macOS notarization requirements change   | Low         | Medium  | Monitor Apple developer news; maintain signing infra |
| T-07 | Memory leaks from long-running monitors  | Medium      | High    | Bounded buffers; periodic cleanup; memory profiling  |
| T-08 | Redis version compatibility (2.x-7.x)   | Medium      | Medium  | Feature detection; graceful degradation for old versions |
| T-09 | SSH tunnel stability (long connections)  | Medium      | Medium  | Keep-alive configuration; automatic reconnection     |
| T-10 | JSON module availability detection       | Low         | Low     | Probe with MODULE LIST; disable JSON editor if absent |

### 13.2 Product Risks

| ID   | Risk                                    | Probability | Impact  | Mitigation                                           |
|------|-----------------------------------------|-------------|---------|------------------------------------------------------|
| P-01 | RedisInsight goes fully open source      | Low         | High    | Focus on performance and privacy differentiators     |
| P-02 | Low community adoption                  | Medium      | High    | Marketing: blog posts, conference talks, HN/Reddit launch |
| P-03 | Contributor burnout (small core team)    | Medium      | High    | Clear contribution guide; good-first-issue labels; mentorship |
| P-04 | Feature scope creep                     | High        | Medium  | Strict phase gating; MVP-first mindset; public roadmap |
| P-05 | Redis protocol breaking changes         | Low         | Medium  | Track Redis releases; RESP3 support from day one     |

### 13.3 Operational Risks

| ID   | Risk                                    | Probability | Impact  | Mitigation                                           |
|------|-----------------------------------------|-------------|---------|------------------------------------------------------|
| O-01 | CI/CD pipeline breaks (GH Actions)      | Medium      | Low     | Pin action versions; cache dependencies; self-hosted runners as backup |
| O-02 | Code signing certificate expiry         | Low         | High    | Calendar reminders; automated cert rotation          |
| O-03 | Dependency supply chain attack          | Low         | Critical| cargo audit + npm audit in CI; Dependabot; lockfile pinning |
| O-04 | Accidental credential commit            | Low         | High    | Pre-commit hooks; .gitignore; secret scanning        |

---

## 14. Success Metrics

### 14.1 Adoption Metrics

| Metric                          | 3 Months        | 6 Months        | 12 Months       |
|---------------------------------|-----------------|-----------------|-----------------|
| GitHub stars                    | 500             | 2,000           | 5,000           |
| Total downloads (all platforms) | 1,000           | 10,000          | 50,000          |
| Monthly active users (opt-in)   | 200             | 2,000           | 10,000          |
| Homebrew installs (macOS)       | 100             | 1,000           | 5,000           |

Note: "Monthly active users" is measured only through opt-in update checks (the
update check request is the only network request RedisLens makes, and it contains
only the current version number and OS platform).

### 14.2 Community Metrics

| Metric                          | 3 Months        | 6 Months        | 12 Months       |
|---------------------------------|-----------------|-----------------|-----------------|
| Contributors (commits)          | 5               | 15              | 50              |
| Open issues (healthy range)     | 10-30           | 20-60           | 30-100          |
| Issue response time (median)    | < 48 hours      | < 24 hours      | < 12 hours      |
| PR review time (median)         | < 72 hours      | < 48 hours      | < 24 hours      |
| Discord/community members       | 50              | 200             | 1,000           |

### 14.3 Quality Metrics

| Metric                          | Target                               |
|---------------------------------|--------------------------------------|
| Test coverage (Rust)            | > 80%                                |
| Test coverage (TypeScript)      | > 80%                                |
| Crash rate                      | < 0.1% of sessions                   |
| Startup time (p95)              | < 2 seconds                          |
| Memory usage (p95, idle)        | < 100 MB                             |
| Binary size (max, any platform) | < 25 MB                              |
| Accessibility audit score       | WCAG 2.1 AA compliance               |
| Dependency vulnerabilities      | Zero known critical/high             |

### 14.4 Competitive Metrics

| Metric                              | Target                            |
|-------------------------------------|-----------------------------------|
| Binary size vs RedisInsight          | < 10% of RedisInsight             |
| Memory usage vs RedisInsight         | < 25% of RedisInsight             |
| Startup time vs RedisInsight         | < 50% of RedisInsight             |
| Type coverage vs RedisInsight        | Parity (all types)                |
| Cluster support vs RedisInsight      | Parity                            |
| GitHub stars vs ARDM (after 12mo)    | > 50% of ARDM's total stars       |

---

## Appendix A: Glossary

| Term                 | Definition                                                    |
|----------------------|---------------------------------------------------------------|
| Connection Profile   | Saved configuration for connecting to a Redis instance        |
| Key Browser          | UI component for navigating Redis keys in a tree view         |
| Data Editor          | Type-specific UI for viewing and editing Redis values         |
| Server Monitor       | Real-time dashboard for Redis server statistics               |
| CLI Console          | Built-in command-line interface for executing Redis commands   |
| Pub/Sub Viewer       | UI for subscribing to and viewing Redis Pub/Sub messages      |
| SCAN                 | Redis command for incrementally iterating keys (non-blocking) |
| Virtual Scrolling    | Rendering technique that only creates DOM nodes for visible items |
| IPC                  | Inter-Process Communication (Tauri bridge between Rust and JS)|
| RESP3                | Redis Serialization Protocol version 3                        |
| Keychain             | OS-level secure credential storage (macOS Keychain, etc.)     |
| Sentinel             | Redis high-availability solution for automatic failover       |
| Cluster              | Redis horizontal scaling with automatic sharding              |

## Appendix B: References

- [Tauri 2.x Documentation](https://v2.tauri.app/)
- [redis-rs Crate](https://crates.io/crates/redis)
- [deadpool-redis Crate](https://crates.io/crates/deadpool-redis)
- [Next.js Documentation](https://nextjs.org/docs)
- [shadcn/ui Components](https://ui.shadcn.com/)
- [Zustand](https://github.com/pmndrs/zustand)
- [TanStack Virtual](https://tanstack.com/virtual)
- [Redis Commands Reference](https://redis.io/commands)
- [Redis Cluster Specification](https://redis.io/docs/reference/cluster-spec/)
- [Redis Sentinel Documentation](https://redis.io/docs/management/sentinel/)
- [WCAG 2.1 Guidelines](https://www.w3.org/TR/WCAG21/)
- [Keep a Changelog](https://keepachangelog.com/)
