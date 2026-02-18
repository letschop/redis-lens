// SPDX-License-Identifier: MIT

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::RwLock;
use tokio::task::JoinHandle;
use tauri::{AppHandle, Emitter};

use super::model::PubSubMessage;
use crate::utils::errors::AppError;

/// Tracks a single active subscription.
struct ActiveSubscription {
    connection_id: String,
    #[allow(dead_code)]
    channels: Vec<String>,
    #[allow(dead_code)]
    patterns: Vec<String>,
    task_handle: JoinHandle<()>,
}

/// Manages all active Pub/Sub subscriptions.
///
/// Each subscription gets a dedicated Redis connection (not from the pool)
/// because subscriber mode locks the connection.
pub struct PubSubManager {
    subscriptions: Arc<RwLock<HashMap<String, ActiveSubscription>>>,
}

impl Default for PubSubManager {
    fn default() -> Self {
        Self::new()
    }
}

impl PubSubManager {
    pub fn new() -> Self {
        Self {
            subscriptions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Subscribe to literal channel names.
    pub async fn subscribe(
        &self,
        connection_id: String,
        connection_url: String,
        channels: Vec<String>,
        app: AppHandle,
    ) -> Result<String, AppError> {
        let sub_id = uuid::Uuid::new_v4().to_string();

        let client = redis::Client::open(connection_url)
            .map_err(|e| AppError::Connection(format!("Failed to create PubSub client: {e}")))?;

        let mut pubsub = tokio::time::timeout(
            Duration::from_secs(10),
            client.get_async_pubsub(),
        )
        .await
        .map_err(|_| AppError::Timeout("PubSub connection timed out".into()))?
        .map_err(|e| AppError::Connection(format!("PubSub connection failed: {e}")))?;

        // Subscribe to all channels
        for ch in &channels {
            pubsub.subscribe(ch).await
                .map_err(|e| AppError::Redis(format!("Subscribe failed: {e}")))?;
        }

        let sub_id_clone = sub_id.clone();
        let task_handle = tokio::spawn(async move {
            let mut stream = pubsub.on_message();
            while let Some(msg) = futures::StreamExt::next(&mut stream).await {
                let channel: String = msg.get_channel_name().to_string();
                let payload: String = msg.get_payload().unwrap_or_default();

                let ps_msg = PubSubMessage {
                    subscription_id: sub_id_clone.clone(),
                    channel,
                    pattern: None,
                    payload,
                    timestamp_ms: chrono::Utc::now().timestamp_millis(),
                };

                let _ = app.emit("pubsub:message", &ps_msg);
            }
        });

        let active = ActiveSubscription {
            connection_id,
            channels: channels.clone(),
            patterns: Vec::new(),
            task_handle,
        };

        self.subscriptions.write().await.insert(sub_id.clone(), active);

        tracing::info!(sub_id = %sub_id, channels = ?channels, "Subscribed");
        Ok(sub_id)
    }

    /// Subscribe to pattern-matched channels.
    pub async fn psubscribe(
        &self,
        connection_id: String,
        connection_url: String,
        patterns: Vec<String>,
        app: AppHandle,
    ) -> Result<String, AppError> {
        let sub_id = uuid::Uuid::new_v4().to_string();

        let client = redis::Client::open(connection_url)
            .map_err(|e| AppError::Connection(format!("Failed to create PubSub client: {e}")))?;

        let mut pubsub = tokio::time::timeout(
            Duration::from_secs(10),
            client.get_async_pubsub(),
        )
        .await
        .map_err(|_| AppError::Timeout("PubSub connection timed out".into()))?
        .map_err(|e| AppError::Connection(format!("PubSub connection failed: {e}")))?;

        for pat in &patterns {
            pubsub.psubscribe(pat).await
                .map_err(|e| AppError::Redis(format!("Pattern subscribe failed: {e}")))?;
        }

        let sub_id_clone = sub_id.clone();
        let patterns_clone = patterns.clone();
        let task_handle = tokio::spawn(async move {
            let mut stream = pubsub.on_message();
            while let Some(msg) = futures::StreamExt::next(&mut stream).await {
                let channel: String = msg.get_channel_name().to_string();
                let payload: String = msg.get_payload().unwrap_or_default();
                let pattern: Option<String> = msg.get_pattern().ok();

                let ps_msg = PubSubMessage {
                    subscription_id: sub_id_clone.clone(),
                    channel,
                    pattern,
                    payload,
                    timestamp_ms: chrono::Utc::now().timestamp_millis(),
                };

                let _ = app.emit("pubsub:message", &ps_msg);
            }
            drop(patterns_clone);
        });

        let active = ActiveSubscription {
            connection_id,
            channels: Vec::new(),
            patterns: patterns.clone(),
            task_handle,
        };

        self.subscriptions.write().await.insert(sub_id.clone(), active);

        tracing::info!(sub_id = %sub_id, patterns = ?patterns, "Pattern subscribed");
        Ok(sub_id)
    }

    /// Unsubscribe and tear down a subscription.
    pub async fn unsubscribe(&self, subscription_id: &str) -> Result<(), AppError> {
        let mut subs = self.subscriptions.write().await;
        if let Some(active) = subs.remove(subscription_id) {
            active.task_handle.abort();
            tracing::info!(sub_id = %subscription_id, "Unsubscribed");
            Ok(())
        } else {
            Err(AppError::NotFound(format!(
                "Subscription {subscription_id} not found"
            )))
        }
    }

    /// Tear down all subscriptions for a given connection.
    pub async fn disconnect_all(&self, connection_id: &str) {
        let mut subs = self.subscriptions.write().await;
        let to_remove: Vec<String> = subs
            .iter()
            .filter(|(_, s)| s.connection_id == connection_id)
            .map(|(id, _)| id.clone())
            .collect();
        for id in &to_remove {
            if let Some(active) = subs.remove(id) {
                active.task_handle.abort();
            }
        }
        if !to_remove.is_empty() {
            tracing::info!(connection_id = %connection_id, count = to_remove.len(), "PubSub subscriptions cleaned up");
        }
    }
}
