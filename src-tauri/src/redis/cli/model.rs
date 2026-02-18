// SPDX-License-Identifier: MIT

use serde::Serialize;

/// Recursive result type mirroring Redis RESP responses.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", content = "data", rename_all = "camelCase")]
pub enum CommandResult {
    Ok(String),
    Integer(i64),
    BulkString(String),
    Array(Vec<CommandResult>),
    Error(String),
    Nil,
}

/// Full response from command execution including timing.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteResponse {
    pub result: CommandResult,
    pub duration_ms: f64,
    pub command: String,
}

/// Warning returned when a dangerous command is detected (force=false).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DangerousWarning {
    pub command: String,
    pub level: DangerLevel,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DangerLevel {
    Critical,
    Warning,
}

/// Autocomplete suggestion for a Redis command.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandSuggestion {
    pub command: String,
    pub syntax: String,
    pub summary: String,
    pub group: String,
}

/// A single entry in command history.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub command: String,
    pub timestamp_ms: i64,
    pub success: bool,
    pub duration_ms: f64,
}
