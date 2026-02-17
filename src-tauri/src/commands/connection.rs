// SPDX-License-Identifier: MIT

use serde::{Deserialize, Serialize};

use crate::utils::errors::AppError;

/// Parameters for testing a Redis connection.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestParams {
    pub host: String,
    pub port: u16,
    pub password: Option<String>,
    pub tls: bool,
}

/// Result of a connection test.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestResult {
    pub success: bool,
    pub message: String,
    pub latency_ms: Option<f64>,
}

/// Test a Redis connection without persisting it.
///
/// This is a stub that validates the input parameters.
/// Full Redis connectivity will be implemented in Phase 2 (Connection Engine).
#[tauri::command]
pub async fn connection_test(
    params: ConnectionTestParams,
) -> Result<ConnectionTestResult, AppError> {
    // Validate inputs
    if params.host.is_empty() {
        return Err(AppError::InvalidInput("Host must not be empty".to_string()));
    }

    if params.port == 0 {
        return Err(AppError::InvalidInput(
            "Port must be greater than 0".to_string(),
        ));
    }

    tracing::info!(
        host = %params.host,
        port = %params.port,
        tls = %params.tls,
        "Connection test requested (stub)"
    );

    // Stub: will be replaced with actual Redis connection in Phase 2
    Ok(ConnectionTestResult {
        success: true,
        message: format!(
            "Connection test stub: {}:{} (TLS: {}). Redis client not yet integrated.",
            params.host, params.port, params.tls
        ),
        latency_ms: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_connection_test_validates_empty_host() {
        let params = ConnectionTestParams {
            host: String::new(),
            port: 6379,
            password: None,
            tls: false,
        };

        let result = connection_test(params).await;
        assert!(result.is_err());

        if let Err(AppError::InvalidInput(msg)) = result {
            assert!(msg.contains("Host"));
        } else {
            panic!("Expected InvalidInput error");
        }
    }

    #[tokio::test]
    async fn test_connection_test_validates_zero_port() {
        let params = ConnectionTestParams {
            host: "localhost".to_string(),
            port: 0,
            password: None,
            tls: false,
        };

        let result = connection_test(params).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_connection_test_stub_succeeds() {
        let params = ConnectionTestParams {
            host: "localhost".to_string(),
            port: 6379,
            password: None,
            tls: false,
        };

        let result = connection_test(params).await;
        assert!(result.is_ok());

        let response = result.unwrap();
        assert!(response.success);
        assert!(response.message.contains("localhost:6379"));
    }
}
