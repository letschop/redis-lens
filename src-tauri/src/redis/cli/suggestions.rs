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
