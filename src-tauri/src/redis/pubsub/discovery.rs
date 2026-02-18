// SPDX-License-Identifier: MIT

use deadpool_redis::Pool;

use super::model::ChannelInfo;
use crate::utils::errors::AppError;

/// Discover active channels and their subscriber counts.
pub async fn get_active_channels(
    pool: &Pool,
    pattern: Option<&str>,
) -> Result<Vec<ChannelInfo>, AppError> {
    let mut conn = pool.get().await?;
    let pat = pattern.unwrap_or("*");

    // Get channel names
    let channels: Vec<String> = redis::cmd("PUBSUB")
        .arg("CHANNELS")
        .arg(pat)
        .query_async(&mut conn)
        .await?;

    if channels.is_empty() {
        return Ok(Vec::new());
    }

    // Get subscriber counts for discovered channels
    let mut cmd = redis::cmd("PUBSUB");
    cmd.arg("NUMSUB");
    for ch in &channels {
        cmd.arg(ch.as_str());
    }

    let numsub: Vec<redis::Value> = cmd.query_async(&mut conn).await?;

    // NUMSUB returns pairs: [channel, count, channel, count, ...]
    let mut result = Vec::with_capacity(channels.len());
    let mut i = 0;
    while i + 1 < numsub.len() {
        let name = match &numsub[i] {
            redis::Value::BulkString(b) => String::from_utf8_lossy(b).into_owned(),
            redis::Value::SimpleString(s) => s.clone(),
            _ => {
                i += 2;
                continue;
            }
        };
        let subscribers = match &numsub[i + 1] {
            redis::Value::Int(n) => u64::try_from(*n).unwrap_or(0),
            _ => 0,
        };
        result.push(ChannelInfo { name, subscribers });
        i += 2;
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    // Discovery tests require a live Redis connection.
    // These will be integration tests with testcontainers.
}
