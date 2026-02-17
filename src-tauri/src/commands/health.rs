// SPDX-License-Identifier: MIT

use serde::Serialize;

/// Health check response returned to the frontend.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
}

/// Simple health check to verify IPC bridge is working.
#[tauri::command]
pub fn health_check() -> HealthResponse {
    HealthResponse {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}
