# Phase 7: CLI Console + Pub/Sub — Design

**Date:** 2026-02-18
**Status:** Approved

---

## CLI Console

### Rust Backend (`src-tauri/src/redis/cli/`)

- **command_parser.rs** — Split raw command string into args (respecting quoted strings), detect dangerous commands against blocklist (FLUSHALL, FLUSHDB, SHUTDOWN, DEBUG, CONFIG SET, SLAVEOF/REPLICAOF, CLUSTER write ops, SCRIPT FLUSH)
- **executor.rs** — Execute parsed commands via `redis::cmd()`, return recursive `CommandResult` tagged union (Ok/Integer/BulkString/Array/Nil/Error) with duration_ms
- **suggestions.rs** — Embedded Redis command table (240+ commands with syntax, summary, complexity, group), prefix matching for autocomplete
- **history.rs** — In-memory ring buffer of executed commands per connection

### Tauri Commands (3)

| Command | Args | Returns |
|---------|------|---------|
| `cli_execute` | `connection_id`, `command`, `force` | `CommandResult` |
| `cli_get_command_suggestions` | `prefix` | `Vec<CommandSuggestion>` |
| `cli_get_command_history` | `connection_id`, `limit` | `Vec<HistoryEntry>` |

### CommandResult Enum

```
CommandResult (tagged union)
  +-- Ok(String)
  +-- Integer(i64)
  +-- BulkString(Option<String>)
  +-- Array(Vec<CommandResult>)
  +-- Error(String)
  +-- Nil
  +-- DangerousCommand { command, warning }
```

Duration tracked separately in the execute response wrapper.

### Dangerous Command Detection

Before executing, check command name against blocklist. Return `DangerousCommand` variant with warning message. Frontend shows confirmation dialog. On confirmation, re-invoke with `force: true`.

### Frontend

- **console-store.ts** — Command history (Zustand persist), current input, autocomplete state
- **Components:** CliConsole, CommandInput (with autocomplete), CommandOutput (color-coded results)
- **Page:** `/connections/[id]/cli/page.tsx`

---

## Pub/Sub

### Rust Backend (`src-tauri/src/redis/pubsub/`)

- **subscriber.rs** — Dedicated Redis connections per subscription. Uses `redis::aio::PubSub` with `on_message()` stream. Spawns tokio task to relay messages as Tauri events.
- **channel_discovery.rs** — `PUBSUB CHANNELS` + `PUBSUB NUMSUB` via regular pool
- **model.rs** — PubSubMessage, ChannelInfo, SubscriptionState

### State Management

`PubSubManager` as Tauri managed state:
- `subscriptions: RwLock<HashMap<String, ActiveSubscription>>`
- ActiveSubscription holds JoinHandle, channel list, creation timestamp
- Cleanup on connection disconnect

### Tauri Commands (5)

| Command | Args | Returns |
|---------|------|---------|
| `pubsub_subscribe` | `connection_id`, `channels` | `String` (subscription ID) |
| `pubsub_psubscribe` | `connection_id`, `patterns` | `String` (subscription ID) |
| `pubsub_unsubscribe` | `subscription_id` | `()` |
| `pubsub_publish` | `connection_id`, `channel`, `message` | `u64` (subscriber count) |
| `pubsub_get_active_channels` | `connection_id`, `pattern?` | `Vec<ChannelInfo>` |

### Tauri Event

`pubsub:message` with payload:
```json
{
  "subscriptionId": "uuid",
  "channel": "notifications",
  "pattern": null,
  "payload": "hello",
  "timestampMs": 1708300000000
}
```

### Message Flow

```
Redis → dedicated connection → tokio task → app.emit("pubsub:message")
→ listen() in pubsub-store → message array → virtual-scrolled MessageList
```

### Frontend

- **pubsub-store.ts** — Subscriptions, message ring buffer (10K max), filters, pause/resume
- **Components:** PubSubViewer, SubscriptionForm (with channel autocomplete), MessageList (virtual scroll), MessageFilter, PublishForm
- **Page:** `/connections/[id]/pubsub/page.tsx`
