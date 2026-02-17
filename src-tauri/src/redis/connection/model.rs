// SPDX-License-Identifier: MIT

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Top-level connection profile persisted to disk.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionProfile {
    pub id: Uuid,
    pub name: String,
    pub color: Option<String>,
    pub connection_type: ConnectionType,
    pub host: String,
    pub port: u16,
    pub username: Option<String>,
    /// Stored as a keychain reference in production; kept in-memory only during session.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    pub database: u8,
    pub tls: TlsConfig,
    pub ssh: Option<SshConfig>,
    pub pool: PoolConfig,
    pub timeout: TimeoutConfig,
    pub readonly: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

/// Connection topology mode.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionType {
    Standalone,
    Cluster,
    Sentinel,
}

/// TLS configuration for a connection.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TlsConfig {
    pub enabled: bool,
    pub ca_cert_path: Option<String>,
    pub client_cert_path: Option<String>,
    pub client_key_path: Option<String>,
    pub accept_self_signed: bool,
}

/// SSH tunnel configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConfig {
    pub enabled: bool,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: SshAuth,
    pub local_port: Option<u16>,
}

/// SSH authentication method.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SshAuth {
    Password {
        password: String,
    },
    PrivateKey {
        key_path: String,
        passphrase: Option<String>,
    },
    Agent,
}

/// Connection pool sizing.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PoolConfig {
    pub max_size: u32,
    pub min_idle: Option<u32>,
    pub idle_timeout_secs: Option<u64>,
    pub max_lifetime_secs: Option<u64>,
    pub connection_timeout_secs: u64,
}

/// Per-operation timeout configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeoutConfig {
    pub connect_secs: u64,
    pub read_secs: u64,
    pub write_secs: u64,
}

/// State of a connection at any point in time.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum ConnectionState {
    Disconnected,
    Connecting,
    Connected { server_info: ServerInfoSummary },
    Error { message: String, retry_count: u32 },
}

/// Summary of Redis server info returned after a successful connection.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfoSummary {
    pub redis_version: String,
    pub mode: String,
    pub os: String,
    pub uptime_in_seconds: u64,
    pub connected_clients: u64,
    pub used_memory_human: String,
    pub db_size: u64,
}

impl Default for PoolConfig {
    fn default() -> Self {
        Self {
            max_size: 8,
            min_idle: None,
            idle_timeout_secs: Some(300),
            max_lifetime_secs: Some(1800),
            connection_timeout_secs: 5,
        }
    }
}

impl Default for TimeoutConfig {
    fn default() -> Self {
        Self {
            connect_secs: 5,
            read_secs: 10,
            write_secs: 10,
        }
    }
}

impl ConnectionProfile {
    /// Create a new profile with defaults for a standalone Redis server.
    pub fn new_standalone(name: String, host: String, port: u16) -> Self {
        let now = chrono::Utc::now();
        Self {
            id: Uuid::new_v4(),
            name,
            color: None,
            connection_type: ConnectionType::Standalone,
            host,
            port,
            username: None,
            password: None,
            database: 0,
            tls: TlsConfig::default(),
            ssh: None,
            pool: PoolConfig::default(),
            timeout: TimeoutConfig::default(),
            readonly: false,
            created_at: now,
            updated_at: now,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_standalone_defaults() {
        let profile = ConnectionProfile::new_standalone("test".into(), "localhost".into(), 6379);
        assert_eq!(profile.connection_type, ConnectionType::Standalone);
        assert_eq!(profile.host, "localhost");
        assert_eq!(profile.port, 6379);
        assert_eq!(profile.database, 0);
        assert!(!profile.tls.enabled);
        assert!(!profile.readonly);
        assert!(profile.ssh.is_none());
    }

    #[test]
    fn test_profile_serialization_roundtrip() {
        let profile = ConnectionProfile::new_standalone("dev".into(), "127.0.0.1".into(), 6379);
        let json = serde_json::to_string(&profile).expect("serialize");
        let restored: ConnectionProfile = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(restored.id, profile.id);
        assert_eq!(restored.name, "dev");
        assert_eq!(restored.host, "127.0.0.1");
    }

    #[test]
    fn test_connection_state_serialization() {
        let state = ConnectionState::Connected {
            server_info: ServerInfoSummary {
                redis_version: "7.2.0".into(),
                mode: "standalone".into(),
                os: "Linux".into(),
                uptime_in_seconds: 3600,
                connected_clients: 5,
                used_memory_human: "1.5M".into(),
                db_size: 100,
            },
        };
        let json = serde_json::to_string(&state).expect("serialize");
        assert!(json.contains("\"status\":\"connected\""));
        assert!(json.contains("\"redisVersion\":\"7.2.0\""));
    }

    #[test]
    fn test_password_not_serialized_when_none() {
        let profile = ConnectionProfile::new_standalone("test".into(), "localhost".into(), 6379);
        let json = serde_json::to_string(&profile).expect("serialize");
        assert!(!json.contains("password"));
    }
}
