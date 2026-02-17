// SPDX-License-Identifier: MIT

use url::Url;

use super::model::ConnectionProfile;
use crate::utils::errors::AppError;

/// Partial profile fields extracted from a Redis URI.
#[derive(Debug)]
pub struct PartialProfile {
    pub host: String,
    pub port: u16,
    pub username: Option<String>,
    pub password: Option<String>,
    pub database: u8,
    pub tls_enabled: bool,
}

/// Parse a `redis://` or `rediss://` URI into connection parameters.
///
/// Supported formats:
/// - `redis://host`
/// - `redis://host:port`
/// - `redis://:password@host:port/db`
/// - `redis://user:password@host:port/db`
/// - `rediss://...` (TLS)
pub fn parse_redis_uri(uri: &str) -> Result<PartialProfile, AppError> {
    let parsed =
        Url::parse(uri).map_err(|e| AppError::InvalidInput(format!("Invalid URI: {e}")))?;

    let scheme = parsed.scheme();
    let tls_enabled = match scheme {
        "redis" => false,
        "rediss" => true,
        _ => {
            return Err(AppError::InvalidInput(format!(
                "Unsupported scheme: {scheme}. Use redis:// or rediss://"
            )));
        }
    };

    let host = parsed.host_str().unwrap_or("127.0.0.1").to_string();
    let port = parsed.port().unwrap_or(6379);

    let username = match parsed.username() {
        "" | "default" => None,
        u => Some(u.to_string()),
    };

    let password = parsed.password().map(|p| {
        percent_encoding::percent_decode_str(p)
            .decode_utf8_lossy()
            .to_string()
    });

    let database: u8 = parsed.path().trim_start_matches('/').parse().unwrap_or(0);

    if database > 15 {
        return Err(AppError::InvalidInput(format!(
            "Database index must be 0-15, got {database}"
        )));
    }

    Ok(PartialProfile {
        host,
        port,
        username,
        password,
        database,
        tls_enabled,
    })
}

/// Build a redis-rs compatible connection URL from a profile.
pub fn build_connection_url(profile: &ConnectionProfile) -> String {
    let scheme = if profile.tls.enabled {
        "rediss"
    } else {
        "redis"
    };

    let auth = match (&profile.username, &profile.password) {
        (Some(user), Some(pass)) => format!("{user}:{pass}@"),
        (None, Some(pass)) => format!(":{pass}@"),
        _ => String::new(),
    };

    format!(
        "{scheme}://{auth}{host}:{port}/{db}",
        host = profile.host,
        port = profile.port,
        db = profile.database,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_redis_uri() {
        let p = parse_redis_uri("redis://localhost").expect("parse");
        assert_eq!(p.host, "localhost");
        assert_eq!(p.port, 6379);
        assert!(p.username.is_none());
        assert!(p.password.is_none());
        assert_eq!(p.database, 0);
        assert!(!p.tls_enabled);
    }

    #[test]
    fn test_parse_uri_with_password_and_db() {
        let p = parse_redis_uri("redis://:secret@10.0.0.1:6380/2").expect("parse");
        assert_eq!(p.host, "10.0.0.1");
        assert_eq!(p.port, 6380);
        assert!(p.username.is_none());
        assert_eq!(p.password.as_deref(), Some("secret"));
        assert_eq!(p.database, 2);
        assert!(!p.tls_enabled);
    }

    #[test]
    fn test_parse_rediss_uri_with_user() {
        let p = parse_redis_uri("rediss://admin:p%40ss@host.io").expect("parse");
        assert_eq!(p.host, "host.io");
        assert_eq!(p.port, 6379);
        assert_eq!(p.username.as_deref(), Some("admin"));
        assert_eq!(p.password.as_deref(), Some("p@ss"));
        assert_eq!(p.database, 0);
        assert!(p.tls_enabled);
    }

    #[test]
    fn test_parse_uri_default_user_is_ignored() {
        let p = parse_redis_uri("redis://default:pass@host/0").expect("parse");
        assert!(p.username.is_none());
        assert_eq!(p.password.as_deref(), Some("pass"));
    }

    #[test]
    fn test_parse_uri_invalid_scheme() {
        let err = parse_redis_uri("http://localhost").unwrap_err();
        match err {
            AppError::InvalidInput(msg) => assert!(msg.contains("Unsupported scheme")),
            _ => panic!("Expected InvalidInput error"),
        }
    }

    #[test]
    fn test_parse_uri_invalid_database() {
        let err = parse_redis_uri("redis://localhost/16").unwrap_err();
        match err {
            AppError::InvalidInput(msg) => assert!(msg.contains("0-15")),
            _ => panic!("Expected InvalidInput error"),
        }
    }

    #[test]
    fn test_parse_uri_garbage() {
        let err = parse_redis_uri("not a uri");
        assert!(err.is_err());
    }

    #[test]
    fn test_build_connection_url_plain() {
        let profile = ConnectionProfile::new_standalone("test".into(), "localhost".into(), 6379);
        let url = build_connection_url(&profile);
        assert_eq!(url, "redis://localhost:6379/0");
    }

    #[test]
    fn test_build_connection_url_with_auth() {
        let mut profile = ConnectionProfile::new_standalone("test".into(), "myhost".into(), 6380);
        profile.password = Some("secret".into());
        profile.database = 2;
        let url = build_connection_url(&profile);
        assert_eq!(url, "redis://:secret@myhost:6380/2");
    }

    #[test]
    fn test_build_connection_url_tls() {
        let mut profile =
            ConnectionProfile::new_standalone("test".into(), "secure.io".into(), 6379);
        profile.tls.enabled = true;
        let url = build_connection_url(&profile);
        assert!(url.starts_with("rediss://"));
    }

    #[test]
    fn test_build_connection_url_with_username() {
        let mut profile = ConnectionProfile::new_standalone("test".into(), "host".into(), 6379);
        profile.username = Some("admin".into());
        profile.password = Some("pass".into());
        let url = build_connection_url(&profile);
        assert_eq!(url, "redis://admin:pass@host:6379/0");
    }
}
