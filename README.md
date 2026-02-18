# RedisLens

[![CI](https://github.com/letschop/redis-lens/actions/workflows/ci.yml/badge.svg)](https://github.com/letschop/redis-lens/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/letschop/redis-lens)](https://github.com/letschop/redis-lens/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A modern, open-source, cross-platform desktop Redis client built with Rust and Tauri. Think MongoDB Compass, but for Redis.

<!-- TODO: Add screenshot -->
<!-- ![RedisLens Screenshot](docs/screenshot.png) -->

## Features

- **Connection Manager** -- Save and organize multiple Redis connection profiles with TLS and SSH tunnel support
- **Key Browser** -- Explore your keyspace with real-time SCAN, tree view with namespace grouping, and virtual scrolling for millions of keys
- **Type-Aware Editors** -- Purpose-built editors for every Redis data type: String, Hash, List, Set, Sorted Set, Stream, JSON (RedisJSON), HyperLogLog, Bitmap, and Geospatial
- **CLI Console** -- Full Redis CLI with autocomplete, command history, and dangerous command detection
- **Server Monitor** -- Real-time server stats dashboard with ops/sec and memory charts, slow log, client list, and memory analysis
- **Pub/Sub Viewer** -- Subscribe to channels and patterns, view messages in real-time, publish with delivery feedback
- **Dark & Light Themes** -- System-aware theme switching with command palette (Cmd/Ctrl+K)
- **Settings** -- Configurable key delimiter, scan count, CLI history size, monitor interval
- **Zero Telemetry** -- Makes exactly zero network calls except to your Redis servers

## Installation

### Download

Download the latest release for your platform:

| Platform | Download |
|----------|----------|
| macOS (Intel + Apple Silicon) | [RedisLens.dmg](https://github.com/letschop/redis-lens/releases/latest) |
| Windows (x64) | [RedisLens.exe](https://github.com/letschop/redis-lens/releases/latest) / [.msi](https://github.com/letschop/redis-lens/releases/latest) |
| Linux (x64) | [RedisLens.AppImage](https://github.com/letschop/redis-lens/releases/latest) / [.deb](https://github.com/letschop/redis-lens/releases/latest) / [.rpm](https://github.com/letschop/redis-lens/releases/latest) |

### Build from Source

#### Prerequisites

- [Rust](https://rustup.rs/) >= 1.75.0
- [Node.js](https://nodejs.org/) >= 20.0.0
- [pnpm](https://pnpm.io/) >= 8.0.0
- Platform-specific dependencies:
  - **macOS**: Xcode Command Line Tools
  - **Windows**: Visual Studio Build Tools, WebView2
  - **Linux**: `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`

#### Steps

```bash
# Clone the repository
git clone https://github.com/letschop/redis-lens.git
cd redis-lens

# Install dependencies
make install-deps

# Run in development mode (with hot-reload)
make dev

# Build release binary
make build-release
```

The built application will be in `src-tauri/target/release/bundle/`.

## Usage

### Quick Start

1. Launch RedisLens
2. Click "New Connection" or press `Cmd/Ctrl+N`
3. Enter your Redis server details (host, port, password)
4. Click "Test Connection" to verify, then "Save & Connect"
5. Browse your keys in the sidebar, click to view/edit values

### Connecting to Redis

RedisLens supports:
- **Standalone** Redis servers
- **TLS/SSL** encrypted connections
- **AUTH** password and ACL (username + password) authentication
- **SSH Tunnel** connections through a bastion host
- **Redis Cluster** (multi-node topology)
- **Redis Sentinel** (automatic failover)

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Command palette |
| `Cmd/Ctrl + N` | New connection |
| `Cmd/Ctrl + ,` | Open settings |
| `F5` | Refresh current view |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop framework | [Tauri 2.x](https://tauri.app/) |
| Backend | Rust, [redis-rs](https://github.com/redis-rs/redis-rs), [deadpool-redis](https://crates.io/crates/deadpool-redis), [tokio](https://tokio.rs/) |
| Frontend | [Next.js 15](https://nextjs.org/), TypeScript, [Tailwind CSS](https://tailwindcss.com/) |
| UI components | [shadcn/ui](https://ui.shadcn.com/) (Radix primitives) |
| State management | [Zustand 5](https://zustand-demo.pmnd.rs/) |
| Virtual scrolling | [@tanstack/react-virtual](https://tanstack.com/virtual) |
| Charts | [Recharts](https://recharts.org/) |
| Icons | [Lucide](https://lucide.dev/) |

## Project Structure

```
redis-lens/
├── src-tauri/               # Rust backend (Tauri 2.x)
│   ├── src/
│   │   ├── lib.rs           # Library root with module declarations
│   │   ├── main.rs          # Entry point
│   │   ├── commands/        # Tauri IPC command handlers (63 commands)
│   │   ├── redis/           # Redis client logic
│   │   │   ├── connection/  # Pool management, standalone connections
│   │   │   ├── browser/     # SCAN engine, tree builder, key info
│   │   │   ├── editor/      # Type-specific value operations
│   │   │   ├── monitor/     # INFO parser, poller, slow log, client list
│   │   │   ├── cli/         # Command parser, executor, suggestions
│   │   │   └── pubsub/      # Subscriber, publisher, channel discovery
│   │   ├── config/          # App config, profile storage
│   │   └── utils/           # Errors, keychain, URI parsing, logging
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                     # Next.js frontend
│   ├── app/                 # App Router pages
│   │   ├── layout.tsx       # Root layout (theme, error boundary, toaster)
│   │   ├── page.tsx         # Connection list
│   │   ├── connections/     # Connection pages ([id], new)
│   │   └── settings/        # Settings page
│   ├── components/
│   │   ├── ui/              # shadcn/ui primitives
│   │   ├── layout/          # Shell, theme, error boundary, command palette
│   │   └── modules/         # Feature modules (connection, browser, editor,
│   │                        #   monitor, cli, pubsub)
│   ├── lib/
│   │   ├── api/             # Typed Tauri IPC wrappers
│   │   └── stores/          # Zustand stores (7 stores)
│   └── styles/              # Tailwind globals
├── .github/workflows/       # CI/CD (lint, test, build)
├── Makefile                 # Development commands
├── docker-compose.yml       # Local Redis instances
└── package.json
```

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full development guide.

```bash
# Start development server with hot-reload
make dev

# Run all tests (135 Rust tests + frontend)
make test

# Lint everything (clippy + ESLint + tsc)
make lint

# Format everything (rustfmt + prettier)
make format

# Start a local Redis for testing
make docker-redis
```

## Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md) before submitting a PR.

- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md)

## Roadmap

- [x] Connection manager with profiles
- [x] Key browser with tree view and virtual scrolling
- [x] Type-aware data editors (all 10 Redis types)
- [x] Server monitor dashboard with charts
- [x] CLI console with autocomplete
- [x] Pub/Sub viewer
- [x] Settings page
- [x] Command palette (Cmd/Ctrl+K)
- [x] Dark/light theme support
- [x] GitHub Actions CI
- [ ] SSH tunnel support
- [ ] Redis Cluster topology viewer
- [ ] Redis Sentinel failover UI
- [ ] Import/Export (JSON, CSV)
- [ ] Auto-update
- [ ] Code signing

## License

[MIT](LICENSE) -- Free and open source.

## Acknowledgments

- [Tauri](https://tauri.app/) for the amazing desktop framework
- [redis-rs](https://github.com/redis-rs/redis-rs) for the Rust Redis client
- [shadcn/ui](https://ui.shadcn.com/) for beautiful UI components
- [Lucide](https://lucide.dev/) for the icon library
- The Redis community for inspiration
