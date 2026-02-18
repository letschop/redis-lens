// SPDX-License-Identifier: MIT

use tauri::State;
use uuid::Uuid;

use crate::redis::connection::manager::ConnectionManager;
use crate::redis::monitor::model::{ClientInfo, MemoryStats, SlowLogEntry, StatsSnapshot};
use crate::redis::monitor::{client_list, info_parser, poller, slow_log};
use crate::utils::errors::AppError;

/// Fetch a one-shot server info snapshot (no polling).
#[tauri::command]
pub async fn monitor_server_info(
    connection_id: String,
    manager: State<'_, ConnectionManager>,
) -> Result<StatsSnapshot, AppError> {
    let pool = resolve_pool(&connection_id, &manager).await?;
    let mut conn = pool.get().await?;
    let raw: String = redis::cmd("INFO")
        .arg("ALL")
        .query_async(&mut conn)
        .await?;
    Ok(info_parser::build_snapshot(&raw))
}

/// Start background polling that emits `monitor:stats` events.
#[tauri::command]
pub async fn monitor_start_polling(
    connection_id: String,
    interval_ms: u64,
    manager: State<'_, ConnectionManager>,
    monitor_poller: State<'_, poller::MonitorPoller>,
    app_handle: tauri::AppHandle,
) -> Result<(), AppError> {
    let pool = resolve_pool(&connection_id, &manager).await?;
    let interval = if interval_ms < 500 { 2000 } else { interval_ms };
    monitor_poller
        .start(connection_id, pool, interval, app_handle)
        .await;
    Ok(())
}

/// Stop background polling for a connection.
#[tauri::command]
pub async fn monitor_stop_polling(
    connection_id: String,
    monitor_poller: State<'_, poller::MonitorPoller>,
) -> Result<(), AppError> {
    monitor_poller.stop(&connection_id).await;
    Ok(())
}

/// Fetch the slow log (on demand).
#[tauri::command]
pub async fn monitor_slow_log(
    connection_id: String,
    count: u64,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<SlowLogEntry>, AppError> {
    let pool = resolve_pool(&connection_id, &manager).await?;
    let count = if count == 0 { 50 } else { count };
    slow_log::get_slow_log(&pool, count).await
}

/// Fetch the client list (on demand).
#[tauri::command]
pub async fn monitor_client_list(
    connection_id: String,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<ClientInfo>, AppError> {
    let pool = resolve_pool(&connection_id, &manager).await?;
    client_list::get_client_list(&pool).await
}

/// Kill a connected client by ID.
#[tauri::command]
pub async fn monitor_kill_client(
    connection_id: String,
    client_id: u64,
    manager: State<'_, ConnectionManager>,
) -> Result<(), AppError> {
    let pool = resolve_pool(&connection_id, &manager).await?;
    client_list::kill_client(&pool, client_id).await?;
    tracing::info!(connection_id = %connection_id, client_id = client_id, "Client killed");
    Ok(())
}

/// Fetch MEMORY STATS + MEMORY DOCTOR (on demand).
#[tauri::command]
pub async fn monitor_memory_stats(
    connection_id: String,
    manager: State<'_, ConnectionManager>,
) -> Result<MemoryStats, AppError> {
    let pool = resolve_pool(&connection_id, &manager).await?;
    poller::get_memory_stats(&pool).await
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async fn resolve_pool(
    connection_id: &str,
    manager: &State<'_, ConnectionManager>,
) -> Result<deadpool_redis::Pool, AppError> {
    let uuid = Uuid::parse_str(connection_id)?;
    manager.get_pool(&uuid).await
}
