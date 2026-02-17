# Contributing to RedisLens

Thank you for your interest in contributing to RedisLens! This guide will help you get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Prerequisites](#prerequisites)
- [Development Setup](#development-setup)
- [Workflow](#workflow)
- [Coding Standards](#coding-standards)
- [Commit Conventions](#commit-conventions)
- [Pull Request Process](#pull-request-process)
- [Issue Guidelines](#issue-guidelines)
- [Getting Help](#getting-help)

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## Prerequisites

Before you begin, ensure you have the following installed:

| Tool | Minimum Version | Installation |
|------|----------------|-------------|
| Rust | 1.75.0 | [rustup.rs](https://rustup.rs/) |
| Node.js | 20.0.0 | [nodejs.org](https://nodejs.org/) |
| pnpm | 8.0.0 | `npm install -g pnpm` |
| Tauri CLI | 2.0.0 | `cargo install tauri-cli` |
| Docker | (any recent) | [docker.com](https://www.docker.com/) (optional, for testing) |

### Platform-Specific Dependencies

**macOS:**
```bash
xcode-select --install
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

**Windows:**
- Visual Studio Build Tools (with C++ workload)
- WebView2 (usually pre-installed on Windows 10/11)

## Development Setup

1. **Fork and clone the repository:**
   ```bash
   gh repo fork your-org/redis-lens --clone
   cd redis-lens
   ```

2. **Install dependencies:**
   ```bash
   make install-deps
   ```

3. **Verify your setup:**
   ```bash
   make check-prereqs
   ```

4. **Start a local Redis (optional but recommended):**
   ```bash
   make docker-redis
   ```

5. **Run in development mode:**
   ```bash
   make dev
   ```

   This launches the Tauri app with hot-reload for both Rust and Next.js.

6. **Run tests:**
   ```bash
   make test
   ```

## Workflow

### Branch Naming

Create a branch from `main` using this naming convention:

```
feat/short-description     # New features
fix/short-description      # Bug fixes
docs/short-description     # Documentation changes
refactor/short-description # Code refactoring
test/short-description     # Test additions/changes
chore/short-description    # Maintenance tasks
```

### Development Cycle

1. **Pick an issue** (or create one for your proposed change)
2. **Create a branch** from `main`
3. **Write tests first** (TDD is encouraged)
4. **Implement the feature/fix**
5. **Run the full test suite:** `make test`
6. **Run lints:** `make lint`
7. **Commit with conventional commit messages**
8. **Open a Pull Request**

### Running Tests

```bash
# All tests
make test

# Rust tests only
make test-rust

# Frontend tests only
make test-frontend

# Integration tests (requires Docker)
make test-integration

# Frontend tests in watch mode (for development)
make test-frontend-watch
```

### Running Lints

```bash
# All lints
make lint

# Rust only (Clippy)
make lint-rust

# Frontend only (ESLint)
make lint-frontend

# Auto-format everything
make format
```

## Coding Standards

### Rust

- **No `unwrap()` or `expect()`** in non-test code. Use the `?` operator with proper error types.
- **All public items** must have doc comments (`///`).
- **Async by default** -- no blocking operations on the main thread.
- **Error types** use `thiserror`. Return `Result<T, RedisLensError>` from Tauri commands.
- **Clippy** must pass with no warnings: `cargo clippy -- -D warnings`
- **Format** with `cargo fmt`

```rust
// Good
/// Scans keys matching the given pattern.
///
/// Returns a page of matching keys and a cursor for the next page.
#[tauri::command]
async fn keys_scan(
    state: State<'_, AppState>,
    conn_id: String,
    pattern: String,
    cursor: u64,
    count: u32,
) -> Result<ScanResult, RedisLensError> {
    let pool = state.get_pool(&conn_id).await
        .ok_or(RedisLensError::ConnectionNotFound(conn_id))?;
    // ...
}

// Bad
#[tauri::command]
async fn keys_scan(conn_id: String, pattern: String) -> Result<Vec<String>, String> {
    let pool = POOL.get().unwrap(); // unwrap in non-test code
    // ...
}
```

### TypeScript / React

- **Strict TypeScript** -- no `any` types. Use `unknown` with type guards.
- **Functional components** only (no class components).
- **Named exports** preferred over default exports.
- **Props** must have explicit type definitions.
- **ESLint** must pass with no errors.
- **Prettier** for formatting.

```typescript
// Good
interface KeyListProps {
  keys: KeyEntry[];
  onSelect: (key: string) => void;
  isLoading: boolean;
}

export function KeyList({ keys, onSelect, isLoading }: KeyListProps) {
  // ...
}

// Bad
export default function KeyList(props: any) {
  // ...
}
```

### Tests

- **Test names** describe behavior: `test_scan_with_glob_returns_matching_keys`
- **No flaky tests** -- avoid `sleep()`, use deterministic assertions.
- **Arrange-Act-Assert** pattern.
- **Coverage target**: 80% for both Rust and TypeScript.

## Commit Conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only changes |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or updating tests |
| `chore` | Maintenance (deps, CI, build) |
| `perf` | Performance improvement |
| `ci` | CI/CD changes |
| `build` | Build system changes |

### Scopes

| Scope | Area |
|-------|------|
| `rust` | Rust backend (src-tauri/) |
| `ui` | Frontend components |
| `ipc` | Tauri IPC commands |
| `redis` | Redis operations |
| `cli` | CLI console feature |
| `monitor` | Server monitor feature |
| `pubsub` | Pub/Sub feature |
| `ci` | GitHub Actions |
| `deps` | Dependency updates |

### Examples

```
feat(redis): add SCAN with TYPE filter support
fix(ui): key tree not refreshing after delete
docs: update README with cluster connection guide
refactor(ipc): extract connection pool into service layer
test(rust): add integration tests for hash operations
chore(deps): update redis-rs to 0.25.0
perf(ui): virtualize key tree for 100K+ keys
```

## Pull Request Process

1. **Fill out the PR template** completely.
2. **Link to the related issue** (use "Closes #123" in the description).
3. **Ensure CI passes** -- all tests, lints, and builds must be green.
4. **Keep PRs focused** -- one feature or fix per PR. Large PRs are harder to review.
5. **Respond to feedback** promptly. If you disagree, explain your reasoning.
6. **Squash commits** if your history is messy (the maintainer may do this on merge).

### PR Size Guidelines

| Size | Lines Changed | Review Time |
|------|--------------|-------------|
| Small | < 50 | Same day |
| Medium | 50-200 | 1-2 days |
| Large | 200-500 | 2-3 days |
| Extra Large | 500+ | Split into smaller PRs |

### What to Expect

- A maintainer will review your PR within 48 hours.
- You may receive requests for changes -- this is normal and collaborative.
- Once approved, a maintainer will merge your PR.
- Your contribution will be included in the next release's changelog.

## Issue Guidelines

### Bug Reports

Use the bug report template. Include:
- RedisLens version
- Operating system
- Steps to reproduce
- Expected vs. actual behavior
- Screenshots or error messages

### Feature Requests

Use the feature request template. Include:
- The problem you are trying to solve
- Your proposed solution
- Alternatives you have considered

### Questions

Use [GitHub Discussions](https://github.com/your-org/redis-lens/discussions) for questions, not Issues.

## Getting Help

- **GitHub Discussions**: Ask questions, share ideas
- **Issue tracker**: Report bugs, request features
- **Code review**: Maintainers are happy to guide contributors

If you are new to open source, look for issues labeled `good-first-issue` -- these are specifically chosen to be approachable for newcomers.

---

Thank you for contributing to RedisLens! Every contribution, no matter how small, makes a difference.
