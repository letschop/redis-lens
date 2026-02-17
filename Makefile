# RedisLens Makefile
# Usage: make <target>

.PHONY: help dev build build-release test test-rust test-frontend test-e2e \
        lint lint-rust lint-frontend format format-rust format-frontend \
        clean audit audit-rust audit-frontend \
        release-patch release-minor release-major \
        docker-redis docker-cluster docker-sentinel docker-down \
        install-deps check-prereqs check

# Default target
help: ## Show this help message
	@echo "RedisLens Development Commands"
	@echo "=============================="
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ─── Development ────────────────────────────────────────────────

dev: ## Start development server with hot-reload
	cargo tauri dev

build: ## Build debug binary
	cargo tauri build --debug

build-release: ## Build release binary (optimized + bundled)
	cargo tauri build

# ─── Testing ────────────────────────────────────────────────────

test: test-rust test-frontend ## Run all tests

test-rust: ## Run Rust tests
	cd src-tauri && cargo test

test-rust-verbose: ## Run Rust tests with output
	cd src-tauri && cargo test -- --nocapture

test-frontend: ## Run frontend tests
	pnpm test

test-frontend-watch: ## Run frontend tests in watch mode
	pnpm test:watch

test-frontend-coverage: ## Run frontend tests with coverage
	pnpm test:coverage

test-e2e: ## Run end-to-end tests
	pnpm test:e2e

test-integration: docker-redis ## Run integration tests (starts Redis)
	cd src-tauri && cargo test --test '*' -- --test-threads=1
	@$(MAKE) docker-down

# ─── Linting ────────────────────────────────────────────────────

lint: lint-rust lint-frontend ## Lint all code

lint-rust: ## Run Clippy on Rust code
	cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings

lint-frontend: ## Run ESLint and TypeScript check on frontend code
	pnpm lint
	pnpm typecheck

# ─── Formatting ─────────────────────────────────────────────────

format: format-rust format-frontend ## Format all code

format-rust: ## Format Rust code
	cd src-tauri && cargo fmt

format-rust-check: ## Check Rust formatting (CI)
	cd src-tauri && cargo fmt --check

format-frontend: ## Format frontend code
	pnpm format

format-frontend-check: ## Check frontend formatting (CI)
	pnpm format:check

# ─── Full Check (CI) ──────────────────────────────────────────

check: lint test ## Run all lints and tests (full CI locally)
	@echo "All checks passed."

# ─── Cleaning ───────────────────────────────────────────────────

clean: ## Remove build artifacts
	cd src-tauri && cargo clean
	rm -rf .next node_modules/.cache out
	@echo "Clean complete."

clean-all: clean ## Remove ALL generated files (including node_modules)
	rm -rf node_modules
	@echo "Full clean complete. Run 'make install-deps' to reinstall."

# ─── Security Audit ─────────────────────────────────────────────

audit: audit-rust audit-frontend ## Run security audits

audit-rust: ## Audit Rust dependencies
	cd src-tauri && cargo audit

audit-frontend: ## Audit frontend dependencies
	pnpm audit

# ─── Releases ───────────────────────────────────────────────────

release-patch: ## Bump patch version and release (X.Y.Z+1)
	@echo "Use '/release patch' command in Claude Code for full release workflow"
	@echo "Or manually: bump version, update CHANGELOG, tag, push"

release-minor: ## Bump minor version and release (X.Y+1.0)
	@echo "Use '/release minor' command in Claude Code for full release workflow"

release-major: ## Bump major version and release (X+1.0.0)
	@echo "Use '/release major' command in Claude Code for full release workflow"

# ─── Docker (Redis instances for development) ───────────────────

docker-redis: ## Start standalone Redis (port 6379)
	docker compose up -d redis-standalone
	@echo "Redis available at localhost:6379"

docker-redis-auth: ## Start Redis with AUTH (port 6380)
	docker compose up -d redis-auth
	@echo "Redis with AUTH available at localhost:6380 (password: redislens)"

docker-redis-tls: ## Start Redis with TLS (port 6381)
	docker compose up -d redis-tls
	@echo "Redis with TLS available at localhost:6381"

docker-cluster: ## Start Redis Cluster (ports 7000-7005)
	docker compose up -d redis-cluster-1 redis-cluster-2 redis-cluster-3 \
		redis-cluster-4 redis-cluster-5 redis-cluster-6
	@echo "Waiting for cluster nodes to start..."
	@sleep 3
	docker exec redis-cluster-1 redis-cli --cluster create \
		redis-cluster-1:7000 redis-cluster-2:7001 redis-cluster-3:7002 \
		redis-cluster-4:7003 redis-cluster-5:7004 redis-cluster-6:7005 \
		--cluster-replicas 1 --cluster-yes 2>/dev/null || true
	@echo "Redis Cluster available at localhost:7000-7005"

docker-sentinel: ## Start Redis Sentinel (master + 2 replicas + 3 sentinels)
	docker compose up -d redis-master redis-replica-1 redis-replica-2 \
		redis-sentinel-1 redis-sentinel-2 redis-sentinel-3
	@echo "Redis Sentinel available at localhost:26379-26381"

docker-all: ## Start all Redis configurations
	docker compose up -d
	@echo "All Redis instances started."

docker-down: ## Stop all Docker containers
	docker compose down
	@echo "All containers stopped."

docker-clean: ## Stop all containers and remove volumes
	docker compose down -v
	@echo "All containers and volumes removed."

# ─── Dependencies ───────────────────────────────────────────────

install-deps: ## Install all dependencies
	@echo "Installing Rust dependencies..."
	cd src-tauri && cargo fetch
	@echo "Installing frontend dependencies..."
	pnpm install
	@echo "All dependencies installed."

update-deps: ## Update all dependencies
	cd src-tauri && cargo update
	pnpm update
	@echo "Dependencies updated. Run tests to verify."

# ─── Prerequisites Check ────────────────────────────────────────

check-prereqs: ## Check if all prerequisites are installed
	@echo "Checking prerequisites..."
	@echo ""
	@printf "  Rust:    " && (rustc --version 2>/dev/null || echo "NOT FOUND - install from https://rustup.rs")
	@printf "  Cargo:   " && (cargo --version 2>/dev/null || echo "NOT FOUND")
	@printf "  Node:    " && (node --version 2>/dev/null || echo "NOT FOUND - install from https://nodejs.org")
	@printf "  pnpm:    " && (pnpm --version 2>/dev/null || echo "NOT FOUND - install with: npm i -g pnpm")
	@printf "  Tauri:   " && (cargo tauri --version 2>/dev/null || echo "NOT FOUND - install with: cargo install tauri-cli")
	@printf "  Docker:  " && (docker --version 2>/dev/null || echo "NOT FOUND (optional, for local Redis)")
	@echo ""
	@echo "Optional tools:"
	@printf "  clippy:  " && (cargo clippy --version 2>/dev/null || echo "NOT FOUND - install with: rustup component add clippy")
	@printf "  cargo-audit: " && (cargo audit --version 2>/dev/null || echo "NOT FOUND - install with: cargo install cargo-audit")
	@printf "  tokei:   " && (tokei --version 2>/dev/null || echo "NOT FOUND - install with: cargo install tokei")
	@echo ""

# ─── Utilities ──────────────────────────────────────────────────

loc: ## Count lines of code
	@tokei --type Rust TypeScript CSS --compact 2>/dev/null || \
		echo "Install tokei: cargo install tokei"

size: ## Check release binary size
	@echo "Binary sizes:"
	@ls -lh src-tauri/target/release/redis-lens 2>/dev/null || echo "  No release binary. Run: make build-release"
	@echo ""
	@echo "Bundle sizes:"
	@ls -lh src-tauri/target/release/bundle/**/* 2>/dev/null || echo "  No bundle. Run: make build-release"

bench: ## Run benchmarks
	cd src-tauri && cargo bench

seed-redis: docker-redis ## Seed local Redis with sample data
	@echo "Seeding Redis with sample data..."
	@docker exec redis-standalone redis-cli FLUSHDB
	@for i in $$(seq 1 100); do \
		docker exec redis-standalone redis-cli SET "user:profile:$$i" '{"id":'$$i',"name":"User '$$i'"}'; \
	done
	@for i in $$(seq 1 50); do \
		docker exec redis-standalone redis-cli HSET "user:settings:$$i" theme dark lang en; \
	done
	@for i in $$(seq 1 30); do \
		docker exec redis-standalone redis-cli LPUSH "queue:jobs" "job-$$i"; \
	done
	@for i in $$(seq 1 20); do \
		docker exec redis-standalone redis-cli SADD "cache:tags" "tag-$$i"; \
	done
	@for i in $$(seq 1 10); do \
		docker exec redis-standalone redis-cli ZADD "leaderboard:daily" $$((RANDOM % 1000)) "player-$$i"; \
	done
	@echo "Seeded: 100 strings, 50 hashes, 30 list items, 20 set members, 10 sorted set members"
