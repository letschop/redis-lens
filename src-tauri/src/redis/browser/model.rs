// SPDX-License-Identifier: MIT

use serde::{Deserialize, Serialize};

/// Redis key type classification.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RedisKeyType {
    String,
    List,
    Set,
    Zset,
    Hash,
    Stream,
    #[serde(untagged)]
    Unknown(std::string::String),
}

impl RedisKeyType {
    /// Parse a Redis TYPE command response into a `RedisKeyType`.
    pub fn from_type_str(s: &str) -> Self {
        match s {
            "string" => Self::String,
            "list" => Self::List,
            "set" => Self::Set,
            "zset" => Self::Zset,
            "hash" => Self::Hash,
            "stream" => Self::Stream,
            other => Self::Unknown(other.to_string()),
        }
    }

    /// Return the Redis TYPE string representation.
    pub fn as_type_str(&self) -> &str {
        match self {
            Self::String => "string",
            Self::List => "list",
            Self::Set => "set",
            Self::Zset => "zset",
            Self::Hash => "hash",
            Self::Stream => "stream",
            Self::Unknown(s) => s,
        }
    }
}

/// TTL state for a Redis key.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Ttl {
    /// Key has no expiry.
    Persistent,
    /// Key expires in the given number of seconds.
    Seconds { value: i64 },
    /// Key does not exist (TTL returned -2).
    Missing,
}

impl Ttl {
    /// Parse a TTL integer response into a `Ttl`.
    pub fn from_ttl_response(ttl: i64) -> Self {
        match ttl {
            -1 => Self::Persistent,
            -2 => Self::Missing,
            n => Self::Seconds { value: n },
        }
    }
}

/// Metadata for a single Redis key.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyInfo {
    pub key: std::string::String,
    pub key_type: RedisKeyType,
    pub ttl: Ttl,
    pub size_bytes: Option<u64>,
    pub encoding: Option<std::string::String>,
    pub length: Option<u64>,
}

/// Result of a single SCAN iteration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub cursor: u64,
    pub keys: Vec<std::string::String>,
    pub finished: bool,
    pub scanned_count: u64,
    pub total_estimate: u64,
}

/// A node in the key namespace tree.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyNode {
    /// Segment name (e.g., "users").
    pub name: std::string::String,
    /// Full key path (e.g., "app:users").
    pub full_path: std::string::String,
    /// True if this node represents an actual Redis key.
    pub is_leaf: bool,
    /// Redis type (only for leaf nodes).
    pub key_type: Option<RedisKeyType>,
    /// TTL (only for leaf nodes).
    pub ttl: Option<Ttl>,
    /// Number of direct children.
    pub children_count: u64,
    /// Nesting depth (0 = root level).
    pub depth: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_redis_key_type_from_str() {
        assert_eq!(RedisKeyType::from_type_str("string"), RedisKeyType::String);
        assert_eq!(RedisKeyType::from_type_str("hash"), RedisKeyType::Hash);
        assert_eq!(RedisKeyType::from_type_str("list"), RedisKeyType::List);
        assert_eq!(RedisKeyType::from_type_str("set"), RedisKeyType::Set);
        assert_eq!(RedisKeyType::from_type_str("zset"), RedisKeyType::Zset);
        assert_eq!(RedisKeyType::from_type_str("stream"), RedisKeyType::Stream);
        assert_eq!(
            RedisKeyType::from_type_str("unknown_type"),
            RedisKeyType::Unknown("unknown_type".into())
        );
    }

    #[test]
    fn test_redis_key_type_roundtrip() {
        let key_type = RedisKeyType::Hash;
        assert_eq!(key_type.as_type_str(), "hash");
        assert_eq!(RedisKeyType::from_type_str("hash"), key_type);
    }

    #[test]
    fn test_ttl_from_response() {
        assert_eq!(Ttl::from_ttl_response(-1), Ttl::Persistent);
        assert_eq!(Ttl::from_ttl_response(-2), Ttl::Missing);
        assert_eq!(Ttl::from_ttl_response(300), Ttl::Seconds { value: 300 });
    }

    #[test]
    fn test_key_info_serialization() {
        let info = KeyInfo {
            key: "user:123".into(),
            key_type: RedisKeyType::Hash,
            ttl: Ttl::Seconds { value: 3600 },
            size_bytes: Some(256),
            encoding: Some("ziplist".into()),
            length: Some(5),
        };
        let json = serde_json::to_string(&info).expect("serialize");
        assert!(json.contains("\"keyType\":\"hash\""));
        assert!(json.contains("\"type\":\"seconds\""));
        assert!(json.contains("\"value\":3600"));
    }

    #[test]
    fn test_scan_result_serialization() {
        let result = ScanResult {
            cursor: 42,
            keys: vec!["key1".into(), "key2".into()],
            finished: false,
            scanned_count: 100,
            total_estimate: 1000,
        };
        let json = serde_json::to_string(&result).expect("serialize");
        assert!(json.contains("\"cursor\":42"));
        assert!(json.contains("\"finished\":false"));
    }

    #[test]
    fn test_key_node_serialization() {
        let node = KeyNode {
            name: "users".into(),
            full_path: "app:users".into(),
            is_leaf: false,
            key_type: None,
            ttl: None,
            children_count: 3,
            depth: 1,
        };
        let json = serde_json::to_string(&node).expect("serialize");
        assert!(json.contains("\"isLeaf\":false"));
        assert!(json.contains("\"childrenCount\":3"));
    }
}
