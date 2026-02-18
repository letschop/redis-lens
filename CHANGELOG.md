# Changelog

All notable changes to RedisLens will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.2] - 2026-02-18

### Fixed
- Edit connection page shows raw RSC payload in production build — merged edit flow into new connection page using store-based state instead of separate route

## [0.1.1] - 2026-02-18

### Fixed
- Release build disconnects when navigating to connections — replaced dynamic `[id]` routes with static `/workspace` page using state-based tabs (static export compatibility)

### Changed
- Mask hostnames and hide port numbers in connection cards and workspace header for privacy

## [0.1.0] - 2026-02-18

### Added

#### Connection Management
- Save, edit, and delete Redis connection profiles
- URI paste support (auto-populates form from `redis://` / `rediss://` URIs)
- Connection testing with server info display
- Password storage via OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- Connection pooling with deadpool-redis (configurable pool size, timeouts)
- Connection profile editing (edit existing profiles without re-creating)
- Key rename from browser detail panel

#### Key Browser
- SCAN-based key enumeration (never uses `KEYS *`)
- Tree view with configurable namespace delimiter (default `:`)
- Virtual scrolling for 100K+ keys via @tanstack/react-virtual
- Key search with 300ms debounce
- Key metadata display (type, TTL, encoding, memory usage)
- Key deletion with confirmation

#### Data Editors
- **String Editor**: text display with inline editing
- **Hash Editor**: field/value table with add, edit, delete
- **List Editor**: ordered list with LPUSH/RPUSH, inline editing, removal
- **Set Editor**: member list with add/remove
- **Sorted Set Editor**: sortable member/score table with ZADD/ZREM/ZINCRBY
- **Stream Editor**: timeline view with XRANGE/XREVRANGE, add entry with XADD
- **JSON Editor**: pretty-print textarea with validation for RedisJSON (JSON.GET/JSON.SET)
- **HyperLogLog Viewer**: cardinality, encoding, memory stats, PFADD
- **Bitmap Viewer**: bit grid with toggle (GETBIT/SETBIT), BITCOUNT stats
- **Geospatial Viewer**: member table with GEOADD/GEOPOS/GEODIST
- **TTL Editor**: display, set (EXPIRE), remove (PERSIST) on any key

#### Server Monitor
- Real-time dashboard with INFO ALL parsing
- Metric cards: memory, ops/sec, clients, hit rate, uptime, keys, fragmentation
- Ops/sec and memory time-series charts (recharts)
- Slow log viewer with sortable table
- Client list with CLIENT KILL support
- Memory analysis panel
- Background polling with configurable interval (Tauri event streaming)

#### CLI Console
- Terminal-style command input with Redis command execution
- 85-command autocomplete table with Tab completion
- Arrow key history navigation (per-connection, persisted)
- Color-coded result rendering (strings, integers, arrays, nil, errors)
- Dangerous command detection with confirmation dialogs (FLUSHALL, SHUTDOWN, etc.)

#### Pub/Sub Viewer
- Subscribe/PSubscribe to channels and patterns
- Dedicated connections (outside pool) for subscriber mode
- Real-time message feed with auto-scroll
- Channel/payload filters with pause/resume
- Publish messages to channels with delivery count feedback
- Active channel discovery (PUBSUB CHANNELS + NUMSUB)

#### Application Shell
- Dark and light themes with system preference detection
- Command palette (Cmd/Ctrl+K) for quick navigation
- Cross-page navigation tabs (Keys / Monitor / CLI / Pub/Sub)
- Settings page (theme, key delimiter, scan count, CLI history, monitor interval)
- Error boundary with recovery UI
- Toast notifications (Sonner)

#### Infrastructure
- Tauri 2.x desktop application (macOS, Windows, Linux)
- Rust unit tests + doctests
- 55 Tauri IPC commands
- GitHub Actions CI (lint, typecheck, format, test on all platforms)
- GitHub Actions Release workflow (multi-platform builds with tauri-action)
- letschop.io promotional banner

---

> **Note on versioning:** RedisLens follows [Semantic Versioning](https://semver.org/).
> Given a version number MAJOR.MINOR.PATCH:
>
> - **MAJOR** is incremented for incompatible changes (e.g., breaking config format changes).
> - **MINOR** is incremented for new features that are backward-compatible.
> - **PATCH** is incremented for backward-compatible bug fixes.
>
> Pre-release versions (e.g., `0.x.y`) may include breaking changes in minor releases.
> The public API is considered stable starting from version `1.0.0`.
