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
