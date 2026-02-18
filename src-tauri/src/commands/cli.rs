// SPDX-License-Identifier: MIT

use std::collections::HashMap;
use std::sync::Arc;

use tauri::State;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::redis::cli::{
    executor,
    model::{CommandSuggestion, ExecuteResponse, HistoryEntry},
    suggestions,
};
use crate::redis::connection::manager::ConnectionManager;
use crate::utils::errors::AppError;

/// Per-connection command history, stored in memory (frontend also persists).
pub struct CliHistory {
    histories: Arc<RwLock<HashMap<Uuid, Vec<HistoryEntry>>>>,
}

impl Default for CliHistory {
    fn default() -> Self {
        Self::new()
    }
}

impl CliHistory {
    pub fn new() -> Self {
        Self {
            histories: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    async fn push(&self, id: &Uuid, entry: HistoryEntry) {
        let mut map = self.histories.write().await;
        let history = map.entry(*id).or_default();
        history.push(entry);
        // Keep last 500 entries per connection
        if history.len() > 500 {
            history.drain(..history.len() - 500);
        }
    }

    async fn get(&self, id: &Uuid, limit: usize) -> Vec<HistoryEntry> {
        let map = self.histories.read().await;
        map.get(id)
            .map(|h| {
                let start = h.len().saturating_sub(limit);
                h[start..].to_vec()
            })
            .unwrap_or_default()
    }
}

/// Execute a Redis command string.
#[tauri::command]
pub async fn cli_execute(
    connection_id: String,
    command: String,
    force: bool,
    manager: State<'_, ConnectionManager>,
    history: State<'_, CliHistory>,
) -> Result<ExecuteResponse, AppError> {
    let uuid = Uuid::parse_str(&connection_id)?;
    let pool = manager.get_pool(&uuid).await?;

    let response = executor::execute(&pool, &command, force).await;

    // Record in history
    let entry = HistoryEntry {
        command: command.clone(),
        timestamp_ms: chrono::Utc::now().timestamp_millis(),
        success: response.is_ok(),
        duration_ms: response.as_ref().map_or(0.0, |r| r.duration_ms),
    };
    history.push(&uuid, entry).await;

    response
}

/// Get autocomplete suggestions for a command prefix.
#[tauri::command]
pub async fn cli_get_command_suggestions(
    prefix: String,
) -> Result<Vec<CommandSuggestion>, AppError> {
    Ok(suggestions::get_suggestions(&prefix))
}

/// Get command history for a connection.
#[tauri::command]
pub async fn cli_get_command_history(
    connection_id: String,
    limit: Option<u64>,
    history: State<'_, CliHistory>,
) -> Result<Vec<HistoryEntry>, AppError> {
    let uuid = Uuid::parse_str(&connection_id)?;
    #[allow(clippy::cast_possible_truncation)]
    let limit = limit.unwrap_or(100) as usize;
    Ok(history.get(&uuid, limit).await)
}
