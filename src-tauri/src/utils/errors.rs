// SPDX-License-Identifier: MIT

use serde::Serialize;

/// Top-level application error enum.
///
/// All errors flowing through Tauri IPC must implement `Serialize`.
/// The `tag` + `content` pattern lets the frontend distinguish error kinds.
#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    #[error("Connection failed: {0}")]
    Connection(String),

    #[error("Redis error: {0}")]
    Redis(String),

    #[error("Pool error: {0}")]
    Pool(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Timeout: {0}")]
    Timeout(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl From<redis::RedisError> for AppError {
    fn from(err: redis::RedisError) -> Self {
        let msg = err.to_string();
        if msg.contains("NOAUTH") || msg.contains("ERR AUTH") || msg.contains("WRONGPASS") {
            AppError::Connection(format!("Authentication failed: {msg}"))
        } else if msg.contains("Connection refused") {
            AppError::Connection(format!("Connection refused: {msg}"))
        } else {
            AppError::Redis(msg)
        }
    }
}

impl From<deadpool_redis::PoolError> for AppError {
    fn from(err: deadpool_redis::PoolError) -> Self {
        AppError::Pool(format!("Connection pool error: {err}"))
    }
}

impl From<uuid::Error> for AppError {
    fn from(err: uuid::Error) -> Self {
        AppError::InvalidInput(format!("Invalid UUID: {err}"))
    }
}
