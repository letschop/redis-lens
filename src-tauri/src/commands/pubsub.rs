// SPDX-License-Identifier: MIT

use tauri::State;
use uuid::Uuid;

use crate::redis::connection::manager::ConnectionManager;
use crate::redis::pubsub::{discovery, model::ChannelInfo, subscriber::PubSubManager};
use crate::utils::errors::AppError;

/// Subscribe to literal channel names. Returns a subscription ID.
#[tauri::command]
pub async fn pubsub_subscribe(
    connection_id: String,
    channels: Vec<String>,
    manager: State<'_, ConnectionManager>,
    pubsub: State<'_, PubSubManager>,
    app: tauri::AppHandle,
) -> Result<String, AppError> {
    let uuid = Uuid::parse_str(&connection_id)?;
    let url = manager.get_connection_url(&uuid).await?;
    pubsub.subscribe(connection_id, url, channels, app).await
}

/// Subscribe to pattern-matched channels. Returns a subscription ID.
#[tauri::command]
pub async fn pubsub_psubscribe(
    connection_id: String,
    patterns: Vec<String>,
    manager: State<'_, ConnectionManager>,
    pubsub: State<'_, PubSubManager>,
    app: tauri::AppHandle,
) -> Result<String, AppError> {
    let uuid = Uuid::parse_str(&connection_id)?;
    let url = manager.get_connection_url(&uuid).await?;
    pubsub.psubscribe(connection_id, url, patterns, app).await
}

/// Unsubscribe and tear down a subscription.
#[tauri::command]
pub async fn pubsub_unsubscribe(
    subscription_id: String,
    pubsub: State<'_, PubSubManager>,
) -> Result<(), AppError> {
    pubsub.unsubscribe(&subscription_id).await
}

/// Publish a message to a channel (uses the regular pool).
#[tauri::command]
pub async fn pubsub_publish(
    connection_id: String,
    channel: String,
    message: String,
    manager: State<'_, ConnectionManager>,
) -> Result<u64, AppError> {
    let uuid = Uuid::parse_str(&connection_id)?;
    let pool = manager.get_pool(&uuid).await?;
    let mut conn = pool.get().await?;
    let count: u64 = redis::cmd("PUBLISH")
        .arg(&channel)
        .arg(&message)
        .query_async(&mut conn)
        .await?;
    Ok(count)
}

/// Get active channels (with optional pattern filter).
#[tauri::command]
pub async fn pubsub_get_active_channels(
    connection_id: String,
    pattern: Option<String>,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<ChannelInfo>, AppError> {
    let uuid = Uuid::parse_str(&connection_id)?;
    let pool = manager.get_pool(&uuid).await?;
    discovery::get_active_channels(&pool, pattern.as_deref()).await
}
