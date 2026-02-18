// SPDX-License-Identifier: MIT

use serde::{Deserialize, Serialize};

/// Result of fetching a string value from Redis.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StringValue {
    /// The text value (if UTF-8 decodable).
    pub text: Option<String>,
    /// Base64-encoded binary content (if non-UTF-8).
    pub base64: Option<String>,
    /// Size in bytes.
    pub size_bytes: u64,
    /// Whether the value contains non-printable binary content.
    pub is_binary: bool,
}

/// A single hash field-value pair.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HashField {
    pub field: String,
    pub value: String,
}

/// Result of scanning hash fields with HSCAN.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HashScanResult {
    pub cursor: u64,
    pub fields: Vec<HashField>,
    pub finished: bool,
}

/// A single list element with its index.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListElement {
    pub index: i64,
    pub value: String,
}

/// Position for list push operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ListPosition {
    Head,
    Tail,
}

/// Result of scanning set members with SSCAN.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetScanResult {
    pub cursor: u64,
    pub members: Vec<String>,
    pub finished: bool,
}

/// TTL information for a key.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtlInfo {
    pub seconds: i64,
    pub is_persistent: bool,
    pub is_missing: bool,
}

// ─── Sorted Set Types ────────────────────────────────────────────

/// A single member-score pair in a sorted set.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZSetMember {
    pub member: String,
    pub score: f64,
}

/// Result of scanning sorted set members with ZSCAN.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZSetScanResult {
    pub cursor: u64,
    pub members: Vec<ZSetMember>,
    pub finished: bool,
}

// ─── Stream Types ────────────────────────────────────────────────

/// A single stream entry (ID + field-value pairs).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamEntry {
    pub id: String,
    pub fields: Vec<(String, String)>,
}

/// Result of reading a range of stream entries.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamRangeResult {
    pub entries: Vec<StreamEntry>,
    pub total_length: u64,
}

/// Consumer group information from XINFO GROUPS.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsumerGroupInfo {
    pub name: String,
    pub consumers: u64,
    pub pending: u64,
    pub last_delivered_id: String,
}

/// Full stream info from XINFO STREAM + XINFO GROUPS.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamInfo {
    pub length: u64,
    pub first_entry_id: Option<String>,
    pub last_entry_id: Option<String>,
    pub groups: Vec<ConsumerGroupInfo>,
}

// ─── JSON Type ───────────────────────────────────────────────────

/// JSON value from `RedisJSON` module (or string fallback).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonValue {
    /// The raw JSON string.
    pub json: String,
    /// Whether the value came from `RedisJSON` module (vs plain string).
    pub is_module: bool,
}

// ─── HyperLogLog Type ───────────────────────────────────────────

/// `HyperLogLog` information.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HllInfo {
    /// Estimated cardinality from PFCOUNT.
    pub cardinality: u64,
    /// Encoding type (raw or dense).
    pub encoding: String,
    /// Size in bytes from DEBUG OBJECT or MEMORY USAGE.
    pub size_bytes: u64,
}

// ─── Bitmap Type ────────────────────────────────────────────────

/// Bitmap information and data.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BitmapInfo {
    /// Total set bits from BITCOUNT.
    pub bit_count: u64,
    /// Byte length from STRLEN.
    pub byte_length: u64,
    /// Individual bit values for the requested range (0 or 1).
    pub bits: Vec<u8>,
    /// Start byte offset of the returned bits.
    pub offset: u64,
}

// ─── Geospatial Types ──────────────────────────────────────────

/// A single geospatial member with coordinates.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeoMember {
    pub member: String,
    pub longitude: f64,
    pub latitude: f64,
}

/// Result of a GEOSEARCH query with optional distances.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeoSearchResult {
    pub members: Vec<GeoMember>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_string_value_text_serialization() {
        let val = StringValue {
            text: Some("hello world".into()),
            base64: None,
            size_bytes: 11,
            is_binary: false,
        };
        let json = serde_json::to_string(&val).expect("serialize");
        assert!(json.contains("\"sizeBytes\":11"));
        assert!(json.contains("\"isBinary\":false"));
        assert!(json.contains("\"text\":\"hello world\""));
    }

    #[test]
    fn test_string_value_binary_serialization() {
        let val = StringValue {
            text: None,
            base64: Some("AQID".into()),
            size_bytes: 3,
            is_binary: true,
        };
        let json = serde_json::to_string(&val).expect("serialize");
        assert!(json.contains("\"isBinary\":true"));
        assert!(json.contains("\"base64\":\"AQID\""));
    }

    #[test]
    fn test_hash_field_serialization() {
        let field = HashField {
            field: "name".into(),
            value: "Alice".into(),
        };
        let json = serde_json::to_string(&field).expect("serialize");
        assert!(json.contains("\"field\":\"name\""));
        assert!(json.contains("\"value\":\"Alice\""));
    }

    #[test]
    fn test_hash_scan_result_serialization() {
        let result = HashScanResult {
            cursor: 42,
            fields: vec![HashField {
                field: "a".into(),
                value: "b".into(),
            }],
            finished: false,
        };
        let json = serde_json::to_string(&result).expect("serialize");
        assert!(json.contains("\"cursor\":42"));
        assert!(json.contains("\"finished\":false"));
    }

    #[test]
    fn test_list_element_serialization() {
        let elem = ListElement {
            index: 5,
            value: "item".into(),
        };
        let json = serde_json::to_string(&elem).expect("serialize");
        assert!(json.contains("\"index\":5"));
        assert!(json.contains("\"value\":\"item\""));
    }

    #[test]
    fn test_list_position_serialization() {
        let head = ListPosition::Head;
        let tail = ListPosition::Tail;
        assert_eq!(serde_json::to_string(&head).expect("serialize"), "\"head\"");
        assert_eq!(serde_json::to_string(&tail).expect("serialize"), "\"tail\"");
    }

    #[test]
    fn test_set_scan_result_serialization() {
        let result = SetScanResult {
            cursor: 0,
            members: vec!["a".into(), "b".into()],
            finished: true,
        };
        let json = serde_json::to_string(&result).expect("serialize");
        assert!(json.contains("\"finished\":true"));
        assert!(json.contains("\"cursor\":0"));
    }

    #[test]
    fn test_ttl_info_serialization() {
        let info = TtlInfo {
            seconds: 300,
            is_persistent: false,
            is_missing: false,
        };
        let json = serde_json::to_string(&info).expect("serialize");
        assert!(json.contains("\"seconds\":300"));
        assert!(json.contains("\"isPersistent\":false"));
    }

    #[test]
    fn test_ttl_info_persistent() {
        let info = TtlInfo {
            seconds: -1,
            is_persistent: true,
            is_missing: false,
        };
        let json = serde_json::to_string(&info).expect("serialize");
        assert!(json.contains("\"isPersistent\":true"));
    }

    #[test]
    fn test_list_position_deserialization() {
        let head: ListPosition = serde_json::from_str("\"head\"").expect("deserialize");
        assert!(matches!(head, ListPosition::Head));
        let tail: ListPosition = serde_json::from_str("\"tail\"").expect("deserialize");
        assert!(matches!(tail, ListPosition::Tail));
    }

    // ─── Sorted Set tests ────────────────────────────────────────

    #[test]
    fn test_zset_member_serialization() {
        let m = ZSetMember {
            member: "alice".into(),
            score: 42.5,
        };
        let json = serde_json::to_string(&m).expect("serialize");
        assert!(json.contains("\"member\":\"alice\""));
        assert!(json.contains("\"score\":42.5"));
    }

    #[test]
    fn test_zset_scan_result_serialization() {
        let result = ZSetScanResult {
            cursor: 10,
            members: vec![ZSetMember {
                member: "a".into(),
                score: 1.0,
            }],
            finished: false,
        };
        let json = serde_json::to_string(&result).expect("serialize");
        assert!(json.contains("\"cursor\":10"));
        assert!(json.contains("\"finished\":false"));
    }

    // ─── Stream tests ────────────────────────────────────────────

    #[test]
    fn test_stream_entry_serialization() {
        let entry = StreamEntry {
            id: "1234567890-0".into(),
            fields: vec![("name".into(), "alice".into())],
        };
        let json = serde_json::to_string(&entry).expect("serialize");
        assert!(json.contains("\"id\":\"1234567890-0\""));
        assert!(json.contains("name"));
    }

    #[test]
    fn test_stream_info_serialization() {
        let info = StreamInfo {
            length: 100,
            first_entry_id: Some("0-1".into()),
            last_entry_id: Some("0-100".into()),
            groups: vec![ConsumerGroupInfo {
                name: "mygroup".into(),
                consumers: 2,
                pending: 5,
                last_delivered_id: "0-50".into(),
            }],
        };
        let json = serde_json::to_string(&info).expect("serialize");
        assert!(json.contains("\"length\":100"));
        assert!(json.contains("\"firstEntryId\""));
        assert!(json.contains("\"mygroup\""));
    }

    // ─── JSON tests ──────────────────────────────────────────────

    #[test]
    fn test_json_value_serialization() {
        let val = JsonValue {
            json: r#"{"key":"value"}"#.into(),
            is_module: true,
        };
        let json = serde_json::to_string(&val).expect("serialize");
        assert!(json.contains("\"isModule\":true"));
    }

    // ─── HLL tests ──────────────────────────────────────────────

    #[test]
    fn test_hll_info_serialization() {
        let info = HllInfo {
            cardinality: 42,
            encoding: "dense".into(),
            size_bytes: 12304,
        };
        let json = serde_json::to_string(&info).expect("serialize");
        assert!(json.contains("\"cardinality\":42"));
        assert!(json.contains("\"sizeBytes\":12304"));
    }

    // ─── Bitmap tests ───────────────────────────────────────────

    #[test]
    fn test_bitmap_info_serialization() {
        let info = BitmapInfo {
            bit_count: 10,
            byte_length: 4,
            bits: vec![1, 0, 1, 1, 0, 0, 0, 0],
            offset: 0,
        };
        let json = serde_json::to_string(&info).expect("serialize");
        assert!(json.contains("\"bitCount\":10"));
        assert!(json.contains("\"byteLength\":4"));
    }

    // ─── Geo tests ──────────────────────────────────────────────

    #[test]
    fn test_geo_member_serialization() {
        let m = GeoMember {
            member: "rome".into(),
            longitude: 12.4964,
            latitude: 41.9028,
        };
        let json = serde_json::to_string(&m).expect("serialize");
        assert!(json.contains("\"member\":\"rome\""));
        assert!(json.contains("\"longitude\":12.4964"));
    }

    #[test]
    fn test_geo_search_result_serialization() {
        let result = GeoSearchResult {
            members: vec![GeoMember {
                member: "paris".into(),
                longitude: 2.3522,
                latitude: 48.8566,
            }],
        };
        let json = serde_json::to_string(&result).expect("serialize");
        assert!(json.contains("\"paris\""));
    }
}
