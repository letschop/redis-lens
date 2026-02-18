# Phase 7: CLI Console + Pub/Sub Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a full CLI console (execute commands, autocomplete, history, dangerous command detection) and Pub/Sub viewer (subscribe, publish, message streaming, channel discovery).

**Architecture:** Both features follow the established Tauri IPC pattern — thin command handlers in `commands/`, service logic in `redis/`, TypeScript types + wrappers + Zustand store + React components on the frontend. Pub/Sub uses a dedicated Redis connection (not the pool) managed by `PubSubManager` as Tauri managed state; messages stream to the frontend via Tauri events.

**Tech Stack:** redis-rs 0.27 (tokio-comp, aio), deadpool-redis, Tauri 2.x IPC + events, Zustand 5, React 18, @tanstack/react-virtual, recharts (already installed).

---

## Task 1: CLI Rust Models + Command Parser

**Files:**
- Create: `src-tauri/src/redis/cli/mod.rs`
- Create: `src-tauri/src/redis/cli/model.rs`
- Create: `src-tauri/src/redis/cli/parser.rs`
- Modify: `src-tauri/src/redis/mod.rs` — add `pub mod cli;`

**Step 1: Create `src-tauri/src/redis/cli/mod.rs`**

```rust
// SPDX-License-Identifier: MIT

pub mod executor;
pub mod model;
pub mod parser;
pub mod suggestions;
```

**Step 2: Create `src-tauri/src/redis/cli/model.rs`**

```rust
// SPDX-License-Identifier: MIT

use serde::Serialize;

/// Recursive result type mirroring Redis RESP responses.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", content = "data", rename_all = "camelCase")]
pub enum CommandResult {
    Ok(String),
    Integer(i64),
    BulkString(String),
    Array(Vec<CommandResult>),
    Error(String),
    Nil,
}

/// Full response from command execution including timing.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteResponse {
    pub result: CommandResult,
    pub duration_ms: f64,
    pub command: String,
}

/// Warning returned when a dangerous command is detected (force=false).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DangerousWarning {
    pub command: String,
    pub level: DangerLevel,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DangerLevel {
    Critical,
    Warning,
}

/// Autocomplete suggestion for a Redis command.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandSuggestion {
    pub command: String,
    pub syntax: String,
    pub summary: String,
    pub group: String,
}

/// A single entry in command history.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub command: String,
    pub timestamp_ms: i64,
    pub success: bool,
    pub duration_ms: f64,
}
```

**Step 3: Create `src-tauri/src/redis/cli/parser.rs`**

```rust
// SPDX-License-Identifier: MIT

use super::model::{DangerLevel, DangerousWarning};

/// Parse a raw command string into argument tokens.
///
/// Handles double-quoted strings (preserving spaces inside quotes)
/// and basic escape sequences (\", \\).
///
/// # Examples
/// ```
/// let args = parse_command("SET key \"hello world\"");
/// assert_eq!(args, vec!["SET", "key", "hello world"]);
/// ```
pub fn parse_command(input: &str) -> Vec<String> {
    let input = input.trim();
    if input.is_empty() {
        return Vec::new();
    }

    let mut args = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut escape_next = false;
    let chars: Vec<char> = input.chars().collect();

    for &ch in &chars {
        if escape_next {
            current.push(ch);
            escape_next = false;
            continue;
        }

        match ch {
            '\\' if in_quotes => {
                escape_next = true;
            }
            '"' => {
                in_quotes = !in_quotes;
            }
            '\'' if !in_quotes => {
                // Also handle single quotes — toggle quote mode
                in_quotes = !in_quotes;
            }
            ' ' | '\t' if !in_quotes => {
                if !current.is_empty() {
                    args.push(current.clone());
                    current.clear();
                }
            }
            _ => {
                current.push(ch);
            }
        }
    }

    if !current.is_empty() {
        args.push(current);
    }

    args
}

/// Dangerous commands and their warning levels/messages.
static DANGEROUS_COMMANDS: &[(&str, DangerLevel, &str)] = &[
    ("FLUSHALL", DangerLevel::Critical, "This will delete ALL keys in ALL databases. This cannot be undone."),
    ("FLUSHDB", DangerLevel::Critical, "This will delete ALL keys in the current database. This cannot be undone."),
    ("SHUTDOWN", DangerLevel::Critical, "This will shut down the Redis server."),
    ("DEBUG", DangerLevel::Warning, "DEBUG commands can cause server instability."),
    ("SWAPDB", DangerLevel::Warning, "This will swap two databases atomically."),
    ("REPLICAOF", DangerLevel::Warning, "This will change the replication topology."),
    ("SLAVEOF", DangerLevel::Warning, "This will change the replication topology."),
    ("FAILOVER", DangerLevel::Warning, "This will trigger a replica failover."),
];

/// Check if a command is dangerous. Returns a warning if so.
pub fn check_dangerous(args: &[String]) -> Option<DangerousWarning> {
    if args.is_empty() {
        return None;
    }

    let cmd = args[0].to_uppercase();

    // Check CONFIG SET specifically
    if cmd == "CONFIG" && args.len() > 1 && args[1].eq_ignore_ascii_case("SET") {
        return Some(DangerousWarning {
            command: args.join(" "),
            level: DangerLevel::Warning,
            message: "This will modify server configuration.".into(),
        });
    }

    // Check SCRIPT FLUSH
    if cmd == "SCRIPT" && args.len() > 1 && args[1].eq_ignore_ascii_case("FLUSH") {
        return Some(DangerousWarning {
            command: args.join(" "),
            level: DangerLevel::Warning,
            message: "This will remove all cached Lua scripts.".into(),
        });
    }

    // Check CLUSTER write operations
    if cmd == "CLUSTER" && args.len() > 1 {
        let sub = args[1].to_uppercase();
        let write_ops = ["ADDSLOTS", "DELSLOTS", "FAILOVER", "FORGET",
                         "MEET", "REPLICATE", "RESET", "SAVECONFIG",
                         "SET-CONFIG-EPOCH", "SETSLOT", "FLUSHSLOTS"];
        if write_ops.contains(&sub.as_str()) {
            return Some(DangerousWarning {
                command: args.join(" "),
                level: DangerLevel::Warning,
                message: "This will modify the cluster configuration.".into(),
            });
        }
    }

    for &(name, ref level, msg) in DANGEROUS_COMMANDS {
        if cmd == name {
            return Some(DangerousWarning {
                command: args.join(" "),
                level: level.clone(),
                message: msg.into(),
            });
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_command() {
        let args = parse_command("GET mykey");
        assert_eq!(args, vec!["GET", "mykey"]);
    }

    #[test]
    fn test_parse_quoted_string() {
        let args = parse_command("SET key \"hello world\"");
        assert_eq!(args, vec!["SET", "key", "hello world"]);
    }

    #[test]
    fn test_parse_single_quoted() {
        let args = parse_command("SET key 'hello world'");
        assert_eq!(args, vec!["SET", "key", "hello world"]);
    }

    #[test]
    fn test_parse_empty_input() {
        let args = parse_command("");
        assert!(args.is_empty());
    }

    #[test]
    fn test_parse_whitespace_only() {
        let args = parse_command("   ");
        assert!(args.is_empty());
    }

    #[test]
    fn test_parse_multiple_spaces() {
        let args = parse_command("SET   key   value");
        assert_eq!(args, vec!["SET", "key", "value"]);
    }

    #[test]
    fn test_parse_escaped_quote() {
        let args = parse_command(r#"SET key "hello \"world\"""#);
        assert_eq!(args, vec!["SET", "key", "hello \"world\""]);
    }

    #[test]
    fn test_dangerous_flushall() {
        let args = vec!["FLUSHALL".into()];
        let warning = check_dangerous(&args);
        assert!(warning.is_some());
        assert!(matches!(warning.unwrap().level, DangerLevel::Critical));
    }

    #[test]
    fn test_dangerous_flushall_case_insensitive() {
        let args = vec!["flushall".into()];
        let warning = check_dangerous(&args);
        assert!(warning.is_some());
    }

    #[test]
    fn test_dangerous_config_set() {
        let args = vec!["CONFIG".into(), "SET".into(), "maxmemory".into(), "100mb".into()];
        let warning = check_dangerous(&args);
        assert!(warning.is_some());
        assert!(matches!(warning.unwrap().level, DangerLevel::Warning));
    }

    #[test]
    fn test_dangerous_config_get_is_safe() {
        let args = vec!["CONFIG".into(), "GET".into(), "maxmemory".into()];
        let warning = check_dangerous(&args);
        assert!(warning.is_none());
    }

    #[test]
    fn test_safe_command() {
        let args = vec!["GET".into(), "mykey".into()];
        let warning = check_dangerous(&args);
        assert!(warning.is_none());
    }

    #[test]
    fn test_dangerous_cluster_write() {
        let args = vec!["CLUSTER".into(), "FAILOVER".into()];
        let warning = check_dangerous(&args);
        assert!(warning.is_some());
    }

    #[test]
    fn test_safe_cluster_read() {
        let args = vec!["CLUSTER".into(), "INFO".into()];
        let warning = check_dangerous(&args);
        assert!(warning.is_none());
    }

    #[test]
    fn test_empty_args_safe() {
        let args: Vec<String> = vec![];
        let warning = check_dangerous(&args);
        assert!(warning.is_none());
    }
}
```

**Step 4: Add `pub mod cli;` to `src-tauri/src/redis/mod.rs`**

**Step 5: Run tests**

Run: `cargo test -p redis-lens redis::cli::parser`
Expected: All 14 parser tests pass

**Step 6: Commit**

```bash
git add src-tauri/src/redis/cli/
git commit -m "feat(rust): add CLI models and command parser with tests"
```

---

## Task 2: CLI Executor

**Files:**
- Create: `src-tauri/src/redis/cli/executor.rs`

**Step 1: Write executor**

```rust
// SPDX-License-Identifier: MIT

use std::time::Instant;

use deadpool_redis::Pool;

use super::model::{CommandResult, DangerousWarning, ExecuteResponse};
use super::parser;
use crate::utils::errors::AppError;

/// Execute a raw Redis command string.
///
/// Parses the input into arguments, checks for dangerous commands (unless
/// `force` is true), then executes via `redis::cmd()` and converts the
/// response to a `CommandResult`.
pub async fn execute(
    pool: &Pool,
    input: &str,
    force: bool,
) -> Result<ExecuteResponse, AppError> {
    let args = parser::parse_command(input);

    if args.is_empty() {
        return Err(AppError::InvalidInput("Empty command".into()));
    }

    // Check for dangerous commands unless force is set
    if !force {
        if let Some(warning) = parser::check_dangerous(&args) {
            return Ok(ExecuteResponse {
                result: CommandResult::Error(format!(
                    "DANGEROUS: {} — Re-send with force=true to confirm.",
                    warning.message
                )),
                duration_ms: 0.0,
                command: input.to_string(),
            });
        }
    }

    let mut conn = pool.get().await?;

    // Build the redis command
    let mut cmd = redis::cmd(&args[0].to_uppercase());
    for arg in &args[1..] {
        cmd.arg(arg.as_str());
    }

    let start = Instant::now();
    let value: redis::Value = cmd.query_async(&mut conn).await?;
    let duration_ms = start.elapsed().as_secs_f64() * 1000.0;

    let result = value_to_result(value);

    Ok(ExecuteResponse {
        result,
        duration_ms,
        command: input.to_string(),
    })
}

/// Convert a redis::Value into our serializable CommandResult.
fn value_to_result(value: redis::Value) -> CommandResult {
    match value {
        redis::Value::Nil => CommandResult::Nil,
        redis::Value::Int(i) => CommandResult::Integer(i),
        redis::Value::BulkString(bytes) => {
            CommandResult::BulkString(String::from_utf8_lossy(&bytes).into_owned())
        }
        redis::Value::Array(arr) => {
            CommandResult::Array(arr.into_iter().map(value_to_result).collect())
        }
        redis::Value::SimpleString(s) => CommandResult::Ok(s),
        redis::Value::Okay => CommandResult::Ok("OK".into()),
        redis::Value::ServerError(e) => CommandResult::Error(e.to_string()),
        redis::Value::Double(f) => CommandResult::BulkString(f.to_string()),
        redis::Value::Boolean(b) => CommandResult::Integer(i64::from(b)),
        redis::Value::Map(pairs) => {
            let items: Vec<CommandResult> = pairs
                .into_iter()
                .flat_map(|(k, v)| vec![value_to_result(k), value_to_result(v)])
                .collect();
            CommandResult::Array(items)
        }
        redis::Value::Set(items) => {
            CommandResult::Array(items.into_iter().map(value_to_result).collect())
        }
        redis::Value::VerbatimString { text, .. } => CommandResult::BulkString(text),
        redis::Value::BigNumber(n) => CommandResult::BulkString(n.to_string()),
        redis::Value::Push { data, .. } => {
            CommandResult::Array(data.into_iter().map(value_to_result).collect())
        }
    }
}

/// Check if a command is dangerous (for frontend pre-check).
pub fn check_dangerous_command(input: &str) -> Option<DangerousWarning> {
    let args = parser::parse_command(input);
    parser::check_dangerous(&args)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_value_to_result_nil() {
        let result = value_to_result(redis::Value::Nil);
        assert!(matches!(result, CommandResult::Nil));
    }

    #[test]
    fn test_value_to_result_int() {
        let result = value_to_result(redis::Value::Int(42));
        assert!(matches!(result, CommandResult::Integer(42)));
    }

    #[test]
    fn test_value_to_result_ok() {
        let result = value_to_result(redis::Value::Okay);
        if let CommandResult::Ok(s) = result {
            assert_eq!(s, "OK");
        } else {
            panic!("Expected Ok");
        }
    }

    #[test]
    fn test_value_to_result_bulk_string() {
        let result = value_to_result(redis::Value::BulkString(b"hello".to_vec()));
        if let CommandResult::BulkString(s) = result {
            assert_eq!(s, "hello");
        } else {
            panic!("Expected BulkString");
        }
    }

    #[test]
    fn test_value_to_result_array() {
        let arr = redis::Value::Array(vec![
            redis::Value::Int(1),
            redis::Value::BulkString(b"two".to_vec()),
            redis::Value::Nil,
        ]);
        let result = value_to_result(arr);
        if let CommandResult::Array(items) = result {
            assert_eq!(items.len(), 3);
            assert!(matches!(items[0], CommandResult::Integer(1)));
            assert!(matches!(items[2], CommandResult::Nil));
        } else {
            panic!("Expected Array");
        }
    }

    #[test]
    fn test_value_to_result_simple_string() {
        let result = value_to_result(redis::Value::SimpleString("PONG".into()));
        if let CommandResult::Ok(s) = result {
            assert_eq!(s, "PONG");
        } else {
            panic!("Expected Ok");
        }
    }

    #[test]
    fn test_check_dangerous_command_flushall() {
        let warning = check_dangerous_command("FLUSHALL");
        assert!(warning.is_some());
    }

    #[test]
    fn test_check_dangerous_command_safe() {
        let warning = check_dangerous_command("GET mykey");
        assert!(warning.is_none());
    }
}
```

**Step 2: Run tests**

Run: `cargo test -p redis-lens redis::cli::executor`
Expected: All 8 executor tests pass

**Step 3: Commit**

```bash
git add src-tauri/src/redis/cli/executor.rs
git commit -m "feat(rust): add CLI command executor with Value conversion"
```

---

## Task 3: CLI Command Suggestions

**Files:**
- Create: `src-tauri/src/redis/cli/suggestions.rs`

**Step 1: Write suggestions module**

This embeds a table of the ~50 most common Redis commands (not all 240+ — keep it practical). Users can always type any command; this is just for autocomplete.

```rust
// SPDX-License-Identifier: MIT

use super::model::CommandSuggestion;

/// A static table of common Redis commands for autocomplete.
///
/// Each entry: (command, syntax, summary, group)
static COMMAND_TABLE: &[(&str, &str, &str, &str)] = &[
    // String
    ("GET", "GET key", "Get the value of a key", "string"),
    ("SET", "SET key value [EX seconds] [PX ms] [NX|XX]", "Set a key to a value", "string"),
    ("MGET", "MGET key [key ...]", "Get values of multiple keys", "string"),
    ("MSET", "MSET key value [key value ...]", "Set multiple keys", "string"),
    ("INCR", "INCR key", "Increment integer value by one", "string"),
    ("DECR", "DECR key", "Decrement integer value by one", "string"),
    ("INCRBY", "INCRBY key increment", "Increment integer value", "string"),
    ("APPEND", "APPEND key value", "Append value to a key", "string"),
    ("STRLEN", "STRLEN key", "Get length of value", "string"),
    ("GETRANGE", "GETRANGE key start end", "Get substring of value", "string"),
    ("SETNX", "SETNX key value", "Set if not exists", "string"),
    ("SETEX", "SETEX key seconds value", "Set with expiry", "string"),
    // Hash
    ("HGET", "HGET key field", "Get a hash field value", "hash"),
    ("HSET", "HSET key field value [field value ...]", "Set hash fields", "hash"),
    ("HDEL", "HDEL key field [field ...]", "Delete hash fields", "hash"),
    ("HGETALL", "HGETALL key", "Get all hash fields and values", "hash"),
    ("HMGET", "HMGET key field [field ...]", "Get multiple hash field values", "hash"),
    ("HINCRBY", "HINCRBY key field increment", "Increment hash field integer", "hash"),
    ("HLEN", "HLEN key", "Get number of hash fields", "hash"),
    ("HKEYS", "HKEYS key", "Get all hash field names", "hash"),
    ("HVALS", "HVALS key", "Get all hash values", "hash"),
    ("HEXISTS", "HEXISTS key field", "Check if hash field exists", "hash"),
    ("HSCAN", "HSCAN key cursor [MATCH pattern] [COUNT count]", "Incrementally iterate hash", "hash"),
    // List
    ("LPUSH", "LPUSH key element [element ...]", "Prepend elements to a list", "list"),
    ("RPUSH", "RPUSH key element [element ...]", "Append elements to a list", "list"),
    ("LPOP", "LPOP key [count]", "Remove and return first elements", "list"),
    ("RPOP", "RPOP key [count]", "Remove and return last elements", "list"),
    ("LRANGE", "LRANGE key start stop", "Get range of elements", "list"),
    ("LLEN", "LLEN key", "Get list length", "list"),
    ("LINDEX", "LINDEX key index", "Get element by index", "list"),
    ("LSET", "LSET key index element", "Set element at index", "list"),
    // Set
    ("SADD", "SADD key member [member ...]", "Add members to a set", "set"),
    ("SREM", "SREM key member [member ...]", "Remove members from a set", "set"),
    ("SMEMBERS", "SMEMBERS key", "Get all set members", "set"),
    ("SCARD", "SCARD key", "Get set cardinality", "set"),
    ("SISMEMBER", "SISMEMBER key member", "Check membership", "set"),
    ("SSCAN", "SSCAN key cursor [MATCH pattern] [COUNT count]", "Incrementally iterate set", "set"),
    // Sorted Set
    ("ZADD", "ZADD key score member [score member ...]", "Add members with scores", "sorted_set"),
    ("ZREM", "ZREM key member [member ...]", "Remove members", "sorted_set"),
    ("ZRANGE", "ZRANGE key min max [BYSCORE|BYLEX] [REV] [LIMIT offset count]", "Get range of members", "sorted_set"),
    ("ZSCORE", "ZSCORE key member", "Get member score", "sorted_set"),
    ("ZCARD", "ZCARD key", "Get sorted set cardinality", "sorted_set"),
    ("ZRANK", "ZRANK key member", "Get member rank", "sorted_set"),
    ("ZINCRBY", "ZINCRBY key increment member", "Increment member score", "sorted_set"),
    // Keys
    ("DEL", "DEL key [key ...]", "Delete keys", "generic"),
    ("EXISTS", "EXISTS key [key ...]", "Check if keys exist", "generic"),
    ("EXPIRE", "EXPIRE key seconds", "Set expiry in seconds", "generic"),
    ("TTL", "TTL key", "Get remaining TTL in seconds", "generic"),
    ("PTTL", "PTTL key", "Get remaining TTL in milliseconds", "generic"),
    ("PERSIST", "PERSIST key", "Remove expiry from key", "generic"),
    ("TYPE", "TYPE key", "Get key type", "generic"),
    ("RENAME", "RENAME key newkey", "Rename a key", "generic"),
    ("UNLINK", "UNLINK key [key ...]", "Delete keys asynchronously", "generic"),
    ("SCAN", "SCAN cursor [MATCH pattern] [COUNT count] [TYPE type]", "Incrementally iterate keyspace", "generic"),
    ("KEYS", "KEYS pattern", "Find keys matching pattern (use SCAN instead)", "generic"),
    ("DBSIZE", "DBSIZE", "Get number of keys in current database", "generic"),
    ("RANDOMKEY", "RANDOMKEY", "Return a random key", "generic"),
    ("DUMP", "DUMP key", "Serialize key value", "generic"),
    ("OBJECT", "OBJECT subcommand [arguments]", "Inspect Redis object internals", "generic"),
    ("MEMORY", "MEMORY USAGE key [SAMPLES count]", "Estimate key memory usage", "generic"),
    // Stream
    ("XADD", "XADD key [NOMKSTREAM] [MAXLEN|MINID ...] ID field value [field value ...]", "Append to stream", "stream"),
    ("XRANGE", "XRANGE key start end [COUNT count]", "Get range of entries", "stream"),
    ("XREVRANGE", "XREVRANGE key end start [COUNT count]", "Get range in reverse", "stream"),
    ("XLEN", "XLEN key", "Get stream length", "stream"),
    ("XINFO", "XINFO STREAM|GROUPS|CONSUMERS key [group]", "Get stream information", "stream"),
    // Server
    ("PING", "PING [message]", "Ping the server", "server"),
    ("INFO", "INFO [section ...]", "Get server information", "server"),
    ("CONFIG", "CONFIG GET|SET|RESETSTAT|REWRITE parameter [value]", "Manage configuration", "server"),
    ("CLIENT", "CLIENT LIST|KILL|GETNAME|SETNAME ...", "Manage client connections", "server"),
    ("SLOWLOG", "SLOWLOG GET|LEN|RESET [count]", "Manage slow query log", "server"),
    ("SELECT", "SELECT index", "Switch database", "server"),
    ("FLUSHDB", "FLUSHDB [ASYNC|SYNC]", "Delete all keys in current database", "server"),
    ("FLUSHALL", "FLUSHALL [ASYNC|SYNC]", "Delete all keys in all databases", "server"),
    ("SUBSCRIBE", "SUBSCRIBE channel [channel ...]", "Subscribe to channels", "pubsub"),
    ("PUBLISH", "PUBLISH channel message", "Publish a message", "pubsub"),
    ("PUBSUB", "PUBSUB CHANNELS|NUMSUB|NUMPAT [pattern]", "Inspect Pub/Sub state", "pubsub"),
    // HyperLogLog
    ("PFADD", "PFADD key element [element ...]", "Add elements to HyperLogLog", "hyperloglog"),
    ("PFCOUNT", "PFCOUNT key [key ...]", "Get approximate cardinality", "hyperloglog"),
    ("PFMERGE", "PFMERGE destkey sourcekey [sourcekey ...]", "Merge HyperLogLogs", "hyperloglog"),
    // Geo
    ("GEOADD", "GEOADD key longitude latitude member [...]", "Add geospatial members", "geo"),
    ("GEOPOS", "GEOPOS key member [member ...]", "Get member positions", "geo"),
    ("GEODIST", "GEODIST key member1 member2 [m|km|mi|ft]", "Get distance between members", "geo"),
    ("GEOSEARCH", "GEOSEARCH key FROMMEMBER|FROMLONLAT ... BYRADIUS|BYBOX ...", "Search geospatial area", "geo"),
    // Scripting
    ("EVAL", "EVAL script numkeys [key ...] [arg ...]", "Execute Lua script", "scripting"),
    ("EVALSHA", "EVALSHA sha1 numkeys [key ...] [arg ...]", "Execute cached Lua script", "scripting"),
    // Transactions
    ("MULTI", "MULTI", "Start transaction", "transactions"),
    ("EXEC", "EXEC", "Execute transaction", "transactions"),
    ("DISCARD", "DISCARD", "Discard transaction", "transactions"),
    ("WATCH", "WATCH key [key ...]", "Watch keys for changes", "transactions"),
    // JSON (RedisJSON module)
    ("JSON.GET", "JSON.GET key [path ...]", "Get JSON value", "json"),
    ("JSON.SET", "JSON.SET key path value", "Set JSON value", "json"),
];

/// Get command suggestions matching a prefix.
pub fn get_suggestions(prefix: &str) -> Vec<CommandSuggestion> {
    if prefix.is_empty() {
        return Vec::new();
    }

    let upper = prefix.to_uppercase();

    COMMAND_TABLE
        .iter()
        .filter(|(cmd, _, _, _)| cmd.starts_with(&upper))
        .map(|(cmd, syntax, summary, group)| CommandSuggestion {
            command: (*cmd).into(),
            syntax: (*syntax).into(),
            summary: (*summary).into(),
            group: (*group).into(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_suggestions_empty_prefix() {
        let results = get_suggestions("");
        assert!(results.is_empty());
    }

    #[test]
    fn test_get_suggestions_h_prefix() {
        let results = get_suggestions("H");
        assert!(results.len() >= 5); // HGET, HSET, HDEL, HGETALL, etc.
        assert!(results.iter().all(|s| s.command.starts_with('H')));
    }

    #[test]
    fn test_get_suggestions_case_insensitive() {
        let results = get_suggestions("hget");
        assert!(!results.is_empty());
        assert!(results.iter().any(|s| s.command == "HGET"));
    }

    #[test]
    fn test_get_suggestions_exact_match() {
        let results = get_suggestions("PING");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].command, "PING");
        assert_eq!(results[0].group, "server");
    }

    #[test]
    fn test_get_suggestions_no_match() {
        let results = get_suggestions("ZZZZZ");
        assert!(results.is_empty());
    }

    #[test]
    fn test_get_suggestions_ge_prefix() {
        let results = get_suggestions("GE");
        assert!(results.iter().any(|s| s.command == "GET"));
        assert!(results.iter().any(|s| s.command == "GETRANGE"));
        assert!(results.iter().any(|s| s.command == "GEOADD"));
    }
}
```

**Step 2: Run tests**

Run: `cargo test -p redis-lens redis::cli::suggestions`
Expected: All 6 tests pass

**Step 3: Commit**

```bash
git add src-tauri/src/redis/cli/suggestions.rs
git commit -m "feat(rust): add CLI command suggestions with 85-command table"
```

---

## Task 4: CLI Tauri Commands + Module Wiring

**Files:**
- Create: `src-tauri/src/commands/cli.rs`
- Modify: `src-tauri/src/commands/mod.rs` — add `pub mod cli;`
- Modify: `src-tauri/src/lib.rs` — register 3 CLI commands + manage CliHistory state
- Modify: `src-tauri/capabilities/default.json` — no changes needed (core:default covers commands)

**Step 1: Create `src-tauri/src/commands/cli.rs`**

```rust
// SPDX-License-Identifier: MIT

use std::collections::HashMap;
use std::sync::Arc;

use tauri::State;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::redis::cli::{executor, model::*, suggestions};
use crate::redis::connection::manager::ConnectionManager;
use crate::utils::errors::AppError;

/// Per-connection command history, stored in memory (frontend also persists).
pub struct CliHistory {
    histories: Arc<RwLock<HashMap<Uuid, Vec<HistoryEntry>>>>,
}

impl Default for CliHistory {
    fn default() -> Self {
        Self::new()
    }
}

impl CliHistory {
    pub fn new() -> Self {
        Self {
            histories: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    async fn push(&self, id: &Uuid, entry: HistoryEntry) {
        let mut map = self.histories.write().await;
        let history = map.entry(*id).or_default();
        history.push(entry);
        // Keep last 500 entries per connection
        if history.len() > 500 {
            history.drain(..history.len() - 500);
        }
    }

    async fn get(&self, id: &Uuid, limit: usize) -> Vec<HistoryEntry> {
        let map = self.histories.read().await;
        map.get(id)
            .map(|h| {
                let start = h.len().saturating_sub(limit);
                h[start..].to_vec()
            })
            .unwrap_or_default()
    }
}

/// Execute a Redis command string.
#[tauri::command]
pub async fn cli_execute(
    connection_id: String,
    command: String,
    force: bool,
    manager: State<'_, ConnectionManager>,
    history: State<'_, CliHistory>,
) -> Result<ExecuteResponse, AppError> {
    let uuid = Uuid::parse_str(&connection_id)?;
    let pool = manager.get_pool(&uuid).await?;

    let response = executor::execute(&pool, &command, force).await;

    // Record in history
    let entry = HistoryEntry {
        command: command.clone(),
        timestamp_ms: chrono::Utc::now().timestamp_millis(),
        success: response.is_ok(),
        duration_ms: response.as_ref().map_or(0.0, |r| r.duration_ms),
    };
    history.push(&uuid, entry).await;

    response
}

/// Get autocomplete suggestions for a command prefix.
#[tauri::command]
pub async fn cli_get_command_suggestions(
    prefix: String,
) -> Result<Vec<CommandSuggestion>, AppError> {
    Ok(suggestions::get_suggestions(&prefix))
}

/// Get command history for a connection.
#[tauri::command]
pub async fn cli_get_command_history(
    connection_id: String,
    limit: Option<u64>,
    history: State<'_, CliHistory>,
) -> Result<Vec<HistoryEntry>, AppError> {
    let uuid = Uuid::parse_str(&connection_id)?;
    let limit = limit.unwrap_or(100) as usize;
    Ok(history.get(&uuid, limit).await)
}
```

**Step 2: Add `pub mod cli;` to `src-tauri/src/commands/mod.rs`**

**Step 3: Register in `src-tauri/src/lib.rs`**

Add `.manage(commands::cli::CliHistory::new())` after MonitorPoller.
Add the 3 CLI commands to the invoke_handler.

**Step 4: Run `cargo clippy` and `cargo test`**

Expected: Clean clippy, all tests pass.

**Step 5: Commit**

```bash
git commit -m "feat(rust): add CLI Tauri commands (execute, suggestions, history)"
```

---

## Task 5: Pub/Sub Rust Models + Subscriber

**Files:**
- Create: `src-tauri/src/redis/pubsub/mod.rs`
- Create: `src-tauri/src/redis/pubsub/model.rs`
- Create: `src-tauri/src/redis/pubsub/subscriber.rs`
- Create: `src-tauri/src/redis/pubsub/discovery.rs`
- Modify: `src-tauri/src/redis/mod.rs` — add `pub mod pubsub;`
- Modify: `src-tauri/src/redis/connection/manager.rs` — add `get_connection_url()`

**Step 1: Create `src-tauri/src/redis/pubsub/mod.rs`**

```rust
// SPDX-License-Identifier: MIT

pub mod discovery;
pub mod model;
pub mod subscriber;
```

**Step 2: Create `src-tauri/src/redis/pubsub/model.rs`**

```rust
// SPDX-License-Identifier: MIT

use serde::Serialize;

/// A message received from a Pub/Sub subscription.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PubSubMessage {
    pub subscription_id: String,
    pub channel: String,
    pub pattern: Option<String>,
    pub payload: String,
    pub timestamp_ms: i64,
}

/// Info about an active channel from PUBSUB CHANNELS + NUMSUB.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelInfo {
    pub name: String,
    pub subscribers: u64,
}
```

**Step 3: Create `src-tauri/src/redis/pubsub/subscriber.rs`**

```rust
// SPDX-License-Identifier: MIT

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::RwLock;
use tokio::task::JoinHandle;
use tauri::{AppHandle, Emitter};

use super::model::PubSubMessage;
use crate::utils::errors::AppError;

/// Tracks a single active subscription.
struct ActiveSubscription {
    connection_id: String,
    channels: Vec<String>,
    patterns: Vec<String>,
    task_handle: JoinHandle<()>,
}

/// Manages all active Pub/Sub subscriptions.
///
/// Each subscription gets a dedicated Redis connection (not from the pool)
/// because subscriber mode locks the connection.
pub struct PubSubManager {
    subscriptions: Arc<RwLock<HashMap<String, ActiveSubscription>>>,
}

impl Default for PubSubManager {
    fn default() -> Self {
        Self::new()
    }
}

impl PubSubManager {
    pub fn new() -> Self {
        Self {
            subscriptions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Subscribe to literal channel names.
    pub async fn subscribe(
        &self,
        connection_id: String,
        connection_url: String,
        channels: Vec<String>,
        app: AppHandle,
    ) -> Result<String, AppError> {
        let sub_id = uuid::Uuid::new_v4().to_string();

        let client = redis::Client::open(connection_url)
            .map_err(|e| AppError::Connection(format!("Failed to create PubSub client: {e}")))?;

        let mut pubsub = tokio::time::timeout(
            Duration::from_secs(10),
            client.get_async_pubsub(),
        )
        .await
        .map_err(|_| AppError::Timeout("PubSub connection timed out".into()))?
        .map_err(|e| AppError::Connection(format!("PubSub connection failed: {e}")))?;

        // Subscribe to all channels
        for ch in &channels {
            pubsub.subscribe(ch).await
                .map_err(|e| AppError::Redis(format!("Subscribe failed: {e}")))?;
        }

        let sub_id_clone = sub_id.clone();
        let task_handle = tokio::spawn(async move {
            let mut stream = pubsub.on_message();
            while let Some(msg) = futures::StreamExt::next(&mut stream).await {
                let channel: String = msg.get_channel_name().to_string();
                let payload: String = msg.get_payload().unwrap_or_default();

                let ps_msg = PubSubMessage {
                    subscription_id: sub_id_clone.clone(),
                    channel,
                    pattern: None,
                    payload,
                    timestamp_ms: chrono::Utc::now().timestamp_millis(),
                };

                let _ = app.emit("pubsub:message", &ps_msg);
            }
        });

        let active = ActiveSubscription {
            connection_id,
            channels: channels.clone(),
            patterns: Vec::new(),
            task_handle,
        };

        self.subscriptions.write().await.insert(sub_id.clone(), active);

        tracing::info!(sub_id = %sub_id, channels = ?channels, "Subscribed");
        Ok(sub_id)
    }

    /// Subscribe to pattern-matched channels.
    pub async fn psubscribe(
        &self,
        connection_id: String,
        connection_url: String,
        patterns: Vec<String>,
        app: AppHandle,
    ) -> Result<String, AppError> {
        let sub_id = uuid::Uuid::new_v4().to_string();

        let client = redis::Client::open(connection_url)
            .map_err(|e| AppError::Connection(format!("Failed to create PubSub client: {e}")))?;

        let mut pubsub = tokio::time::timeout(
            Duration::from_secs(10),
            client.get_async_pubsub(),
        )
        .await
        .map_err(|_| AppError::Timeout("PubSub connection timed out".into()))?
        .map_err(|e| AppError::Connection(format!("PubSub connection failed: {e}")))?;

        for pat in &patterns {
            pubsub.psubscribe(pat).await
                .map_err(|e| AppError::Redis(format!("Pattern subscribe failed: {e}")))?;
        }

        let sub_id_clone = sub_id.clone();
        let patterns_clone = patterns.clone();
        let task_handle = tokio::spawn(async move {
            let mut stream = pubsub.on_message();
            while let Some(msg) = futures::StreamExt::next(&mut stream).await {
                let channel: String = msg.get_channel_name().to_string();
                let payload: String = msg.get_payload().unwrap_or_default();
                let pattern: Option<String> = msg.get_pattern().ok();

                let ps_msg = PubSubMessage {
                    subscription_id: sub_id_clone.clone(),
                    channel,
                    pattern,
                    payload,
                    timestamp_ms: chrono::Utc::now().timestamp_millis(),
                };

                let _ = app.emit("pubsub:message", &ps_msg);
            }
            drop(patterns_clone);
        });

        let active = ActiveSubscription {
            connection_id,
            channels: Vec::new(),
            patterns: patterns.clone(),
            task_handle,
        };

        self.subscriptions.write().await.insert(sub_id.clone(), active);

        tracing::info!(sub_id = %sub_id, patterns = ?patterns, "Pattern subscribed");
        Ok(sub_id)
    }

    /// Unsubscribe and tear down a subscription.
    pub async fn unsubscribe(&self, subscription_id: &str) -> Result<(), AppError> {
        let mut subs = self.subscriptions.write().await;
        if let Some(active) = subs.remove(subscription_id) {
            active.task_handle.abort();
            tracing::info!(sub_id = %subscription_id, "Unsubscribed");
            Ok(())
        } else {
            Err(AppError::NotFound(format!(
                "Subscription {subscription_id} not found"
            )))
        }
    }

    /// Tear down all subscriptions for a given connection.
    pub async fn disconnect_all(&self, connection_id: &str) {
        let mut subs = self.subscriptions.write().await;
        let to_remove: Vec<String> = subs
            .iter()
            .filter(|(_, s)| s.connection_id == connection_id)
            .map(|(id, _)| id.clone())
            .collect();
        for id in &to_remove {
            if let Some(active) = subs.remove(id) {
                active.task_handle.abort();
            }
        }
        if !to_remove.is_empty() {
            tracing::info!(connection_id = %connection_id, count = to_remove.len(), "PubSub subscriptions cleaned up");
        }
    }
}
```

**Step 4: Create `src-tauri/src/redis/pubsub/discovery.rs`**

```rust
// SPDX-License-Identifier: MIT

use deadpool_redis::Pool;

use super::model::ChannelInfo;
use crate::utils::errors::AppError;

/// Discover active channels and their subscriber counts.
pub async fn get_active_channels(
    pool: &Pool,
    pattern: Option<&str>,
) -> Result<Vec<ChannelInfo>, AppError> {
    let mut conn = pool.get().await?;
    let pat = pattern.unwrap_or("*");

    // Get channel names
    let channels: Vec<String> = redis::cmd("PUBSUB")
        .arg("CHANNELS")
        .arg(pat)
        .query_async(&mut conn)
        .await?;

    if channels.is_empty() {
        return Ok(Vec::new());
    }

    // Get subscriber counts for discovered channels
    let mut cmd = redis::cmd("PUBSUB");
    cmd.arg("NUMSUB");
    for ch in &channels {
        cmd.arg(ch.as_str());
    }

    let numsub: Vec<redis::Value> = cmd.query_async(&mut conn).await?;

    // NUMSUB returns pairs: [channel, count, channel, count, ...]
    let mut result = Vec::with_capacity(channels.len());
    let mut i = 0;
    while i + 1 < numsub.len() {
        let name = match &numsub[i] {
            redis::Value::BulkString(b) => String::from_utf8_lossy(b).into_owned(),
            redis::Value::SimpleString(s) => s.clone(),
            _ => continue,
        };
        let subscribers = match &numsub[i + 1] {
            redis::Value::Int(n) => *n as u64,
            _ => 0,
        };
        result.push(ChannelInfo { name, subscribers });
        i += 2;
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    // Discovery tests require a live Redis connection.
    // These will be integration tests with testcontainers.
}
```

**Step 5: Add `get_connection_url()` to ConnectionManager**

Add this method to `src-tauri/src/redis/connection/manager.rs`:

```rust
/// Get the connection URL for a connected profile (used by PubSub for dedicated connections).
pub async fn get_connection_url(&self, id: &Uuid) -> Result<String, AppError> {
    let conns = self.connections.read().await;
    conns
        .get(id)
        .map(|c| build_connection_url(&c.profile))
        .ok_or_else(|| AppError::Connection("Not connected".into()))
}
```

**Step 6: Add `pub mod pubsub;` to `src-tauri/src/redis/mod.rs`**

**Step 7: Add `futures` dependency to Cargo.toml**

```toml
futures = "0.3"
```

**Step 8: Run `cargo clippy` and `cargo test`**

Expected: Clean clippy, all existing + new tests pass.

**Step 9: Commit**

```bash
git commit -m "feat(rust): add Pub/Sub subscriber, manager, and channel discovery"
```

---

## Task 6: Pub/Sub Tauri Commands + Wiring

**Files:**
- Create: `src-tauri/src/commands/pubsub.rs`
- Modify: `src-tauri/src/commands/mod.rs` — add `pub mod pubsub;`
- Modify: `src-tauri/src/lib.rs` — register PubSubManager + 5 commands

**Step 1: Create `src-tauri/src/commands/pubsub.rs`**

```rust
// SPDX-License-Identifier: MIT

use tauri::State;
use uuid::Uuid;

use crate::redis::connection::manager::ConnectionManager;
use crate::redis::pubsub::{discovery, model::ChannelInfo, subscriber::PubSubManager};
use crate::utils::errors::AppError;

/// Subscribe to literal channel names. Returns a subscription ID.
#[tauri::command]
pub async fn pubsub_subscribe(
    connection_id: String,
    channels: Vec<String>,
    manager: State<'_, ConnectionManager>,
    pubsub: State<'_, PubSubManager>,
    app: tauri::AppHandle,
) -> Result<String, AppError> {
    let uuid = Uuid::parse_str(&connection_id)?;
    let url = manager.get_connection_url(&uuid).await?;
    pubsub
        .subscribe(connection_id, url, channels, app)
        .await
}

/// Subscribe to pattern-matched channels. Returns a subscription ID.
#[tauri::command]
pub async fn pubsub_psubscribe(
    connection_id: String,
    patterns: Vec<String>,
    manager: State<'_, ConnectionManager>,
    pubsub: State<'_, PubSubManager>,
    app: tauri::AppHandle,
) -> Result<String, AppError> {
    let uuid = Uuid::parse_str(&connection_id)?;
    let url = manager.get_connection_url(&uuid).await?;
    pubsub
        .psubscribe(connection_id, url, patterns, app)
        .await
}

/// Unsubscribe and tear down a subscription.
#[tauri::command]
pub async fn pubsub_unsubscribe(
    subscription_id: String,
    pubsub: State<'_, PubSubManager>,
) -> Result<(), AppError> {
    pubsub.unsubscribe(&subscription_id).await
}

/// Publish a message to a channel (uses the regular pool).
#[tauri::command]
pub async fn pubsub_publish(
    connection_id: String,
    channel: String,
    message: String,
    manager: State<'_, ConnectionManager>,
) -> Result<u64, AppError> {
    let uuid = Uuid::parse_str(&connection_id)?;
    let pool = manager.get_pool(&uuid).await?;
    let mut conn = pool.get().await?;
    let count: u64 = redis::cmd("PUBLISH")
        .arg(&channel)
        .arg(&message)
        .query_async(&mut conn)
        .await?;
    Ok(count)
}

/// Get active channels (with optional pattern filter).
#[tauri::command]
pub async fn pubsub_get_active_channels(
    connection_id: String,
    pattern: Option<String>,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<ChannelInfo>, AppError> {
    let uuid = Uuid::parse_str(&connection_id)?;
    let pool = manager.get_pool(&uuid).await?;
    discovery::get_active_channels(&pool, pattern.as_deref()).await
}
```

**Step 2: Add `pub mod pubsub;` to `src-tauri/src/commands/mod.rs`**

**Step 3: Register in `src-tauri/src/lib.rs`**

Add `.manage(redis::pubsub::subscriber::PubSubManager::new())` after CliHistory.
Add the 5 Pub/Sub commands to the invoke_handler.

**Step 4: Run `cargo clippy` and `cargo test`**

**Step 5: Commit**

```bash
git commit -m "feat(rust): add Pub/Sub Tauri commands (subscribe, psubscribe, unsubscribe, publish, channels)"
```

---

## Task 7: Frontend TypeScript Types

**Files:**
- Modify: `src/lib/api/types.ts` — add CLI + PubSub types

**Step 1: Add types to end of types.ts (before default factories)**

```typescript
// ─── CLI Types ──────────────────────────────────────────────

export type CommandResult =
  | { type: 'ok'; data: string }
  | { type: 'integer'; data: number }
  | { type: 'bulkString'; data: string }
  | { type: 'array'; data: CommandResult[] }
  | { type: 'error'; data: string }
  | { type: 'nil' };

export interface ExecuteResponse {
  result: CommandResult;
  durationMs: number;
  command: string;
}

export interface CommandSuggestion {
  command: string;
  syntax: string;
  summary: string;
  group: string;
}

export interface CliHistoryEntry {
  command: string;
  timestampMs: number;
  success: boolean;
  durationMs: number;
}

// ─── Pub/Sub Types ──────────────────────────────────────────

export interface PubSubMessage {
  subscriptionId: string;
  channel: string;
  pattern: string | null;
  payload: string;
  timestampMs: number;
}

export interface ChannelInfo {
  name: string;
  subscribers: number;
}
```

**Step 2: Run `pnpm tsc --noEmit`**

**Step 3: Commit**

```bash
git commit -m "feat(frontend): add CLI and Pub/Sub TypeScript types"
```

---

## Task 8: Frontend IPC Wrappers

**Files:**
- Modify: `src/lib/api/commands.ts` — add CLI + PubSub wrappers

**Step 1: Add imports and wrappers at end of commands.ts**

Add imports for the new types, then append:

```typescript
// ─── CLI ────────────────────────────────────────────────────

export async function cliExecute(
  connectionId: string,
  command: string,
  force: boolean = false,
): Promise<ExecuteResponse> {
  return tauriInvoke<ExecuteResponse>('cli_execute', { connectionId, command, force });
}

export async function cliGetCommandSuggestions(
  prefix: string,
): Promise<CommandSuggestion[]> {
  return tauriInvoke<CommandSuggestion[]>('cli_get_command_suggestions', { prefix });
}

export async function cliGetCommandHistory(
  connectionId: string,
  limit: number = 100,
): Promise<CliHistoryEntry[]> {
  return tauriInvoke<CliHistoryEntry[]>('cli_get_command_history', { connectionId, limit });
}

// ─── Pub/Sub ────────────────────────────────────────────────

export async function pubsubSubscribe(
  connectionId: string,
  channels: string[],
): Promise<string> {
  return tauriInvoke<string>('pubsub_subscribe', { connectionId, channels });
}

export async function pubsubPsubscribe(
  connectionId: string,
  patterns: string[],
): Promise<string> {
  return tauriInvoke<string>('pubsub_psubscribe', { connectionId, patterns });
}

export async function pubsubUnsubscribe(subscriptionId: string): Promise<void> {
  return tauriInvoke<void>('pubsub_unsubscribe', { subscriptionId });
}

export async function pubsubPublish(
  connectionId: string,
  channel: string,
  message: string,
): Promise<number> {
  return tauriInvoke<number>('pubsub_publish', { connectionId, channel, message });
}

export async function pubsubGetActiveChannels(
  connectionId: string,
  pattern?: string,
): Promise<ChannelInfo[]> {
  return tauriInvoke<ChannelInfo[]>('pubsub_get_active_channels', { connectionId, pattern });
}
```

**Step 2: Run `pnpm tsc --noEmit` and `pnpm lint`**

**Step 3: Commit**

```bash
git commit -m "feat(frontend): add CLI and Pub/Sub IPC wrappers"
```

---

## Task 9: Console Store (Zustand)

**Files:**
- Create: `src/lib/stores/console-store.ts`

**Step 1: Write the store**

Console store manages command input state, history (persisted), and autocomplete. See Phase 4-6 stores for the pattern (Zustand + immer is not needed here since state mutations are simple).

```typescript
// SPDX-License-Identifier: MIT

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as api from '@/lib/api/commands';
import type { ExecuteResponse, CommandSuggestion, CliHistoryEntry } from '@/lib/api/types';

interface ConsoleState {
  // Per-connection history (persisted)
  histories: Record<string, ExecuteResponse[]>;
  // Suggestions cache
  suggestions: CommandSuggestion[];
  suggestionsPrefix: string;
  // Loading
  isExecuting: boolean;
  error: string | null;
}

interface ConsoleActions {
  execute: (connectionId: string, command: string, force?: boolean) => Promise<ExecuteResponse | null>;
  loadSuggestions: (prefix: string) => Promise<void>;
  clearSuggestions: () => void;
  clearHistory: (connectionId: string) => void;
}

type ConsoleStore = ConsoleState & ConsoleActions;

const MAX_HISTORY = 500;

export const useConsoleStore = create<ConsoleStore>()(
  persist(
    (set, get) => ({
      histories: {},
      suggestions: [],
      suggestionsPrefix: '',
      isExecuting: false,
      error: null,

      execute: async (connectionId, command, force = false) => {
        set({ isExecuting: true, error: null });
        try {
          const response = await api.cliExecute(connectionId, command, force);
          set((state) => {
            const history = [...(state.histories[connectionId] ?? []), response];
            // Trim to max history
            const trimmed = history.length > MAX_HISTORY
              ? history.slice(history.length - MAX_HISTORY)
              : history;
            return {
              histories: { ...state.histories, [connectionId]: trimmed },
              isExecuting: false,
            };
          });
          return response;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          set({ isExecuting: false, error: msg });
          return null;
        }
      },

      loadSuggestions: async (prefix) => {
        if (prefix.length < 1) {
          set({ suggestions: [], suggestionsPrefix: '' });
          return;
        }
        try {
          const results = await api.cliGetCommandSuggestions(prefix);
          set({ suggestions: results, suggestionsPrefix: prefix });
        } catch {
          // Silently ignore suggestion errors
        }
      },

      clearSuggestions: () => set({ suggestions: [], suggestionsPrefix: '' }),

      clearHistory: (connectionId) =>
        set((state) => ({
          histories: { ...state.histories, [connectionId]: [] },
        })),
    }),
    {
      name: 'redis-lens-console',
      partialize: (state) => ({ histories: state.histories }),
    },
  ),
);
```

**Step 2: Run `pnpm tsc --noEmit` and `pnpm lint`**

**Step 3: Commit**

```bash
git commit -m "feat(frontend): add console Zustand store with history persistence"
```

---

## Task 10: Pub/Sub Store (Zustand)

**Files:**
- Create: `src/lib/stores/pubsub-store.ts`

**Step 1: Write the store**

```typescript
// SPDX-License-Identifier: MIT

import { create } from 'zustand';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import * as api from '@/lib/api/commands';
import type { PubSubMessage, ChannelInfo } from '@/lib/api/types';

interface Subscription {
  id: string;
  channels: string[];
  patterns: string[];
  createdAt: number;
}

interface PubSubState {
  subscriptions: Subscription[];
  messages: PubSubMessage[];
  activeChannels: ChannelInfo[];
  isPaused: boolean;
  maxMessages: number;
  channelFilter: string;
  payloadFilter: string;
  isSubscribing: boolean;
  error: string | null;
  unlisten: UnlistenFn | null;
}

interface PubSubActions {
  subscribe: (connectionId: string, channels: string[]) => Promise<string | null>;
  psubscribe: (connectionId: string, patterns: string[]) => Promise<string | null>;
  unsubscribe: (subscriptionId: string) => Promise<void>;
  unsubscribeAll: () => Promise<void>;
  publish: (connectionId: string, channel: string, message: string) => Promise<number | null>;
  loadActiveChannels: (connectionId: string, pattern?: string) => Promise<void>;
  togglePause: () => void;
  clearMessages: () => void;
  setChannelFilter: (filter: string) => void;
  setPayloadFilter: (filter: string) => void;
  startListening: () => Promise<void>;
  stopListening: () => void;
}

type PubSubStore = PubSubState & PubSubActions;

const MAX_MESSAGES = 10_000;

export const usePubSubStore = create<PubSubStore>()((set, get) => ({
  subscriptions: [],
  messages: [],
  activeChannels: [],
  isPaused: false,
  maxMessages: MAX_MESSAGES,
  channelFilter: '',
  payloadFilter: '',
  isSubscribing: false,
  error: null,
  unlisten: null,

  subscribe: async (connectionId, channels) => {
    set({ isSubscribing: true, error: null });
    try {
      const id = await api.pubsubSubscribe(connectionId, channels);
      set((state) => ({
        subscriptions: [
          ...state.subscriptions,
          { id, channels, patterns: [], createdAt: Date.now() },
        ],
        isSubscribing: false,
      }));
      return id;
    } catch (e) {
      set({ isSubscribing: false, error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  },

  psubscribe: async (connectionId, patterns) => {
    set({ isSubscribing: true, error: null });
    try {
      const id = await api.pubsubPsubscribe(connectionId, patterns);
      set((state) => ({
        subscriptions: [
          ...state.subscriptions,
          { id, channels: [], patterns, createdAt: Date.now() },
        ],
        isSubscribing: false,
      }));
      return id;
    } catch (e) {
      set({ isSubscribing: false, error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  },

  unsubscribe: async (subscriptionId) => {
    try {
      await api.pubsubUnsubscribe(subscriptionId);
      set((state) => ({
        subscriptions: state.subscriptions.filter((s) => s.id !== subscriptionId),
      }));
    } catch {
      // Already unsubscribed
    }
  },

  unsubscribeAll: async () => {
    const subs = get().subscriptions;
    for (const sub of subs) {
      try {
        await api.pubsubUnsubscribe(sub.id);
      } catch {
        // Ignore
      }
    }
    set({ subscriptions: [] });
  },

  publish: async (connectionId, channel, message) => {
    try {
      return await api.pubsubPublish(connectionId, channel, message);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  },

  loadActiveChannels: async (connectionId, pattern) => {
    try {
      const channels = await api.pubsubGetActiveChannels(connectionId, pattern);
      set({ activeChannels: channels });
    } catch {
      // Silently ignore
    }
  },

  togglePause: () => set((state) => ({ isPaused: !state.isPaused })),

  clearMessages: () => set({ messages: [] }),

  setChannelFilter: (filter) => set({ channelFilter: filter }),
  setPayloadFilter: (filter) => set({ payloadFilter: filter }),

  startListening: async () => {
    // Stop existing listener if any
    get().stopListening();

    const fn_ = await listen<PubSubMessage>('pubsub:message', (event) => {
      const state = get();
      if (state.isPaused) return;

      const msgs = [...state.messages, event.payload];
      // Trim ring buffer
      const trimmed = msgs.length > state.maxMessages
        ? msgs.slice(msgs.length - state.maxMessages)
        : msgs;
      set({ messages: trimmed });
    });

    set({ unlisten: fn_ });
  },

  stopListening: () => {
    const { unlisten } = get();
    if (unlisten) {
      unlisten();
      set({ unlisten: null });
    }
  },
}));
```

**Step 2: Run `pnpm tsc --noEmit` and `pnpm lint`**

**Step 3: Commit**

```bash
git commit -m "feat(frontend): add Pub/Sub Zustand store with message ring buffer"
```

---

## Task 11: CLI UI Components + Page

**Files:**
- Create: `src/components/modules/cli/CommandOutput.tsx`
- Create: `src/components/modules/cli/CommandInput.tsx`
- Create: `src/components/modules/cli/CliConsole.tsx`
- Create: `src/app/connections/[id]/cli/page.tsx`

Components implement:
- `CommandOutput`: Renders `ExecuteResponse` results with color-coded output (green for strings, cyan for integers, gray italic for nil, red for errors). Recursive rendering for arrays with indentation.
- `CommandInput`: Text input with up/down arrow history navigation, autocomplete dropdown from suggestions store. Submit on Enter.
- `CliConsole`: Full-height layout with scrollable output area and fixed input at bottom.
- Page: Uses `use(params)` for connection ID, wraps `CliConsole`.

See Phase 6 components for styling patterns (Tailwind classes, shadcn/ui Button/Input).

**Step 1: Create all 4 files (complete code in each)**

**Step 2: Run `pnpm tsc --noEmit` and `pnpm lint`**

**Step 3: Commit**

```bash
git commit -m "feat(frontend): add CLI console components and page"
```

---

## Task 12: Pub/Sub UI Components + Page

**Files:**
- Create: `src/components/modules/pubsub/SubscriptionForm.tsx`
- Create: `src/components/modules/pubsub/PublishForm.tsx`
- Create: `src/components/modules/pubsub/MessageList.tsx`
- Create: `src/components/modules/pubsub/MessageFilter.tsx`
- Create: `src/components/modules/pubsub/PubSubViewer.tsx`
- Create: `src/app/connections/[id]/pubsub/page.tsx`

Components implement:
- `SubscriptionForm`: Channel input (comma-separated), pattern toggle, subscribe button. Shows active subscriptions with unsubscribe buttons.
- `PublishForm`: Channel input + message textarea + publish button. Shows subscriber count on success.
- `MessageList`: Virtual-scrolled message feed using `@tanstack/react-virtual`. Each message shows timestamp, channel badge, payload. Auto-scrolls to bottom on new messages (unless paused).
- `MessageFilter`: Channel filter input, payload regex input, pause/resume toggle, clear button.
- `PubSubViewer`: Split layout with subscription/publish forms on left sidebar, message feed on right.
- Page: Uses `use(params)` for connection ID, starts event listener on mount, cleans up on unmount.

**Step 1: Create all 6 files**

**Step 2: Run `pnpm tsc --noEmit` and `pnpm lint`**

**Step 3: Commit**

```bash
git commit -m "feat(frontend): add Pub/Sub viewer components and page"
```

---

## Task 13: Navigation Links

**Files:**
- Modify: `src/components/modules/browser/Sidebar.tsx` (or equivalent navigation component) — add CLI and Pub/Sub links

**Step 1: Find the navigation component and add links**

Look for the sidebar or navigation component that links to `/connections/[id]/monitor`. Add similar links for `/connections/[id]/cli` and `/connections/[id]/pubsub`.

**Step 2: Run `pnpm tsc --noEmit`**

**Step 3: Commit**

```bash
git commit -m "feat(frontend): add CLI and Pub/Sub navigation links"
```

---

## Task 14: Full Verification + Memory Files

**Step 1: Run all checks**

```bash
cargo clippy    # Must be clean
cargo test      # All tests must pass (expect ~120+ tests)
pnpm tsc --noEmit  # Must be clean
pnpm lint       # Must be clean
```

**Step 2: Update memory files**

- `progress.md`: Phase 7 complete, M7 done, update test count and command count
- `api-contracts.md`: Add CLI (3) + PubSub (5) = 8 new commands, update total to 70
- `learnings.md`: Add any gotchas discovered during implementation
- `MEMORY.md`: Update project state

**Step 3: Commit**

```bash
git commit -m "docs: update memory files for Phase 7 completion"
```
