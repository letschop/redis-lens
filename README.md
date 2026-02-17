# RedisLens

[![CI](https://github.com/your-org/redis-lens/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/redis-lens/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/your-org/redis-lens)](https://github.com/your-org/redis-lens/releases)
[![Downloads](https://img.shields.io/github/downloads/your-org/redis-lens/total)](https://github.com/your-org/redis-lens/releases)

A modern, open-source, cross-platform desktop Redis client. Think MongoDB Compass, but for Redis.

<!-- TODO: Add screenshot -->
<!-- ![RedisLens Screenshot](docs/screenshot.png) -->

## Features

- **Connection Manager** — Save and organize multiple Redis connection profiles with TLS and SSH tunnel support
- **Key Browser** — Explore your keyspace with real-time SCAN, tree view with namespace grouping, and virtual scrolling for millions of keys
- **Type-Aware Editors** — Purpose-built editors for every Redis data type: String, List, Set, Sorted Set, Hash, Stream, and JSON (RedisJSON)
- **CLI Console** — Full Redis CLI with syntax highlighting, auto-complete, and command history
- **Server Monitor** — Real-time server stats, memory usage, connected clients, ops/sec graphs
- **Pub/Sub Viewer** — Subscribe to channels and patterns, view messages in real-time
- **Dark & Light Themes** — Designed for extended use with a dark-first theme inspired by Redis red
- **Keyboard-First** — Command palette (Cmd/Ctrl+K) and comprehensive keyboard shortcuts

## Installation

### Download

Download the latest release for your platform:

| Platform | Download |
|----------|----------|
| macOS (Universal) | [RedisLens.dmg](https://github.com/your-org/redis-lens/releases/latest) |
| Windows (x64) | [RedisLens.msi](https://github.com/your-org/redis-lens/releases/latest) |
| Linux (x64) | [RedisLens.AppImage](https://github.com/your-org/redis-lens/releases/latest) |
| Linux (Debian) | [RedisLens.deb](https://github.com/your-org/redis-lens/releases/latest) |

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
git clone https://github.com/your-org/redis-lens.git
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
| `Cmd/Ctrl + T` | New tab |
| `Cmd/Ctrl + W` | Close tab |
| `Cmd/Ctrl + F` | Find key |
| `Cmd/Ctrl + S` | Save current value |
| `Cmd/Ctrl + D` | Delete selected key |
| `Cmd/Ctrl + R` | Refresh key browser |
| `Cmd/Ctrl + L` | Clear CLI console |
| `` Cmd/Ctrl + ` `` | Toggle CLI panel |
| `Cmd/Ctrl + ,` | Open settings |
| `F5` | Refresh current view |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop framework | [Tauri 2.x](https://tauri.app/) |
| Backend | Rust, [redis-rs](https://github.com/redis-rs/redis-rs), [deadpool-redis](https://crates.io/crates/deadpool-redis), [tokio](https://tokio.rs/) |
| Frontend | [Next.js 14+](https://nextjs.org/), TypeScript, [Tailwind CSS](https://tailwindcss.com/) |
| UI components | [shadcn/ui](https://ui.shadcn.com/) |
| State management | [Zustand](https://zustand-demo.pmnd.rs/) |
| Virtual scrolling | [@tanstack/react-virtual](https://tanstack.com/virtual) |
| Icons | [Lucide](https://lucide.dev/) |

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full development guide.

```bash
# Start development server with hot-reload
make dev

# Run all tests
make test

# Run Rust tests only
make test-rust

# Run frontend tests only
make test-frontend

# Lint everything
make lint

# Format everything
make format

# Start a local Redis for testing
make docker-redis

# Start a Redis Cluster for testing
make docker-cluster
```

## Project Structure

```
redis-lens/
├── src-tauri/               # Rust backend (Tauri)
│   ├── src/
│   │   ├── main.rs          # Entry point
│   │   ├── commands/        # Tauri IPC commands
│   │   ├── services/        # Business logic
│   │   ├── types/           # Shared types
│   │   └── migrations/      # Config migrations
│   ├── Cargo.toml
│   └── tauri.conf.json
├── frontend/                # Next.js frontend
│   ├── src/
│   │   ├── app/             # Next.js app router
│   │   ├── components/      # React components
│   │   ├── stores/          # Zustand stores
│   │   ├── lib/             # Utilities, Tauri wrappers
│   │   └── types/           # TypeScript types
│   ├── package.json
│   └── tailwind.config.ts
├── .claude/                 # Claude Code configuration
├── .github/                 # GitHub Actions, templates
├── docker-compose.yml       # Redis instances for development
├── Makefile                 # Development commands
└── README.md
```

## Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md) before submitting a PR.

- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md)

## Roadmap

- [x] Connection manager with profiles
- [x] Key browser with tree view
- [x] Type-aware data editors
- [x] CLI console
- [ ] Server monitor dashboard
- [ ] Pub/Sub viewer
- [ ] SSH tunnel support
- [ ] Redis Cluster support
- [ ] Redis Sentinel support
- [ ] Import/Export (JSON, CSV)
- [ ] Slow log viewer
- [ ] Memory analysis
- [ ] Auto-update

## License

[MIT](LICENSE) -- Free and open source.

## Acknowledgments

- [Tauri](https://tauri.app/) for the amazing desktop framework
- [redis-rs](https://github.com/redis-rs/redis-rs) for the Rust Redis client
- [shadcn/ui](https://ui.shadcn.com/) for beautiful UI components
- [Lucide](https://lucide.dev/) for the icon library
- The Redis community for inspiration
