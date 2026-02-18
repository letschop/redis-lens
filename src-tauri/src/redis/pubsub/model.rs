// SPDX-License-Identifier: MIT

use serde::Serialize;

/// A message received from a Pub/Sub subscription.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PubSubMessage {
    pub subscription_id: String,
    pub channel: String,
    pub pattern: Option<String>,
    pub payload: String,
    pub timestamp_ms: i64,
}

/// Info about an active channel from PUBSUB CHANNELS + NUMSUB.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelInfo {
    pub name: String,
    pub subscribers: u64,
}
