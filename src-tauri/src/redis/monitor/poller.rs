// SPDX-License-Identifier: MIT

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use deadpool_redis::Pool;
use tauri::Emitter;
use tokio::sync::RwLock;
use tokio::task::AbortHandle;

use super::info_parser;
use super::model::{MemoryStats, StatsSnapshot};
use crate::utils::errors::AppError;

/// Manages background polling tasks, one per connection.
pub struct MonitorPoller {
    handles: Arc<RwLock<HashMap<String, AbortHandle>>>,
}

impl Default for MonitorPoller {
    fn default() -> Self {
        Self::new()
    }
}

impl MonitorPoller {
    /// Create a new poller manager with no active pollers.
    pub fn new() -> Self {
        Self {
            handles: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Start polling for a connection. Spawns a background tokio task.
    ///
    /// If already polling for this connection, stops the old one first.
    pub async fn start(
        &self,
        connection_id: String,
        pool: Pool,
        interval_ms: u64,
        app_handle: tauri::AppHandle,
    ) {
        // Stop any existing poller for this connection
        self.stop(&connection_id).await;

        let handles = self.handles.clone();
        let conn_id = connection_id.clone();

        let task = tokio::spawn(async move {
            let interval = Duration::from_millis(interval_ms);
            loop {
                // Fetch INFO ALL
                match fetch_info_all(&pool).await {
                    Ok(snapshot) => {
                        // Emit the snapshot via Tauri event
                        if let Err(e) = app_handle.emit("monitor:stats", &snapshot) {
                            tracing::warn!(connection_id = %conn_id, "Failed to emit monitor event: {e}");
                            break;
                        }
                    }
                    Err(e) => {
                        tracing::warn!(connection_id = %conn_id, "Monitor poll failed: {e}");
                        // Don't break — transient errors should not kill the poller.
                        // The next iteration will retry.
                    }
                }

                tokio::time::sleep(interval).await;
            }
        });

        let abort_handle = task.abort_handle();
        let mut h = handles.write().await;
        h.insert(connection_id, abort_handle);
    }

    /// Stop polling for a connection.
    pub async fn stop(&self, connection_id: &str) {
        let mut h = self.handles.write().await;
        if let Some(handle) = h.remove(connection_id) {
            handle.abort();
            tracing::info!(connection_id = %connection_id, "Monitor polling stopped");
        }
    }

    /// Stop all active pollers (e.g., on app shutdown).
    pub async fn stop_all(&self) {
        let mut h = self.handles.write().await;
        for (id, handle) in h.drain() {
            handle.abort();
            tracing::info!(connection_id = %id, "Monitor polling stopped (shutdown)");
        }
    }

    /// Check if a connection is currently being polled.
    pub async fn is_polling(&self, connection_id: &str) -> bool {
        let h = self.handles.read().await;
        h.contains_key(connection_id)
    }
}

/// Fetch INFO ALL and build a `StatsSnapshot`.
async fn fetch_info_all(pool: &Pool) -> Result<StatsSnapshot, AppError> {
    let mut conn = pool.get().await?;
    let raw: String = redis::cmd("INFO").arg("ALL").query_async(&mut conn).await?;

    Ok(info_parser::build_snapshot(&raw))
}

/// Fetch MEMORY STATS and MEMORY DOCTOR on demand.
pub async fn get_memory_stats(pool: &Pool) -> Result<MemoryStats, AppError> {
    let mut conn = pool.get().await?;

    // MEMORY STATS returns a flat array of key-value pairs
    let stats_raw: Vec<redis::Value> = redis::cmd("MEMORY")
        .arg("STATS")
        .query_async(&mut conn)
        .await
        .unwrap_or_default();

    let mut stats = HashMap::new();
    let mut i = 0;
    while i + 1 < stats_raw.len() {
        let key = match &stats_raw[i] {
            redis::Value::BulkString(b) => String::from_utf8_lossy(b).to_string(),
            redis::Value::SimpleString(s) => s.clone(),
            _ => {
                i += 2;
                continue;
            }
        };
        let value = match &stats_raw[i + 1] {
            redis::Value::Int(n) => n.to_string(),
            redis::Value::BulkString(b) => String::from_utf8_lossy(b).to_string(),
            redis::Value::SimpleString(s) => s.clone(),
            redis::Value::Double(f) => f.to_string(),
            _ => String::new(),
        };
        stats.insert(key, value);
        i += 2;
    }

    // MEMORY DOCTOR
    let doctor_advice: String = redis::cmd("MEMORY")
        .arg("DOCTOR")
        .query_async(&mut conn)
        .await
        .unwrap_or_else(|_| "MEMORY DOCTOR not available".to_string());

    Ok(MemoryStats {
        stats,
        doctor_advice,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_poller_new_not_polling() {
        let poller = MonitorPoller::new();
        assert!(!poller.is_polling("conn-1").await);
    }

    #[tokio::test]
    async fn test_poller_stop_nonexistent_is_noop() {
        let poller = MonitorPoller::new();
        poller.stop("nonexistent").await;
        // Should not panic
    }
}
