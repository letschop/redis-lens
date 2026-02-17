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
        assert_eq!(
            serde_json::to_string(&head).expect("serialize"),
            "\"head\""
        );
        assert_eq!(
            serde_json::to_string(&tail).expect("serialize"),
            "\"tail\""
        );
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
}
