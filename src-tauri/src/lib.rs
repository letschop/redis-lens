// SPDX-License-Identifier: MIT

#![deny(clippy::all)]
#![warn(clippy::pedantic)]
#![allow(clippy::missing_panics_doc)]
#![allow(clippy::missing_errors_doc)]
#![allow(clippy::must_use_candidate)]

pub mod commands;
pub mod config;
pub mod redis;
pub mod utils;

use redis::connection::manager::ConnectionManager;
use redis::monitor::poller::MonitorPoller;
use tracing_subscriber::EnvFilter;

/// Initialize the Tauri application.
///
/// Registers all IPC command handlers, sets up managed state,
/// and launches the native window.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize structured logging
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    tracing::info!("Starting RedisLens v{}", env!("CARGO_PKG_VERSION"));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(ConnectionManager::new())
        .manage(MonitorPoller::new())
        .manage(commands::cli::CliHistory::new())
        .manage(redis::pubsub::subscriber::PubSubManager::new())
        .invoke_handler(tauri::generate_handler![
            commands::health::health_check,
            commands::connection::connection_test,
            commands::connection::connection_parse_uri,
            commands::connection::connection_save,
            commands::connection::connection_list,
            commands::connection::connection_delete,
            commands::connection::connection_connect,
            commands::connection::connection_disconnect,
            commands::connection::connection_state,
            // Browser commands
            commands::browser::browser_scan_keys,
            commands::browser::browser_build_tree,
            commands::browser::browser_get_children,
            commands::browser::browser_get_keys_info,
            commands::browser::browser_get_key_info,
            commands::browser::browser_delete_keys,
            commands::browser::browser_rename_key,
            // Editor commands — string
            commands::editor::editor_get_string_value,
            commands::editor::editor_set_string_value,
            commands::editor::editor_get_string_range,
            // Editor commands — hash
            commands::editor::editor_get_hash_all,
            commands::editor::editor_scan_hash_fields,
            commands::editor::editor_set_hash_field,
            commands::editor::editor_delete_hash_fields,
            // Editor commands — list
            commands::editor::editor_get_list_range,
            commands::editor::editor_push_list_element,
            commands::editor::editor_set_list_element,
            commands::editor::editor_remove_list_element,
            // Editor commands — set
            commands::editor::editor_get_set_members,
            commands::editor::editor_scan_set_members,
            commands::editor::editor_add_set_members,
            commands::editor::editor_remove_set_members,
            // Editor commands — sorted set
            commands::editor::editor_get_zset_range,
            commands::editor::editor_scan_zset_members,
            commands::editor::editor_add_zset_member,
            commands::editor::editor_remove_zset_members,
            commands::editor::editor_incr_zset_score,
            commands::editor::editor_zset_card,
            // Editor commands — stream
            commands::editor::editor_get_stream_range,
            commands::editor::editor_get_stream_range_rev,
            commands::editor::editor_add_stream_entry,
            commands::editor::editor_delete_stream_entries,
            commands::editor::editor_get_stream_info,
            // Editor commands — JSON
            commands::editor::editor_get_json_value,
            commands::editor::editor_set_json_value,
            // Editor commands — HyperLogLog
            commands::editor::editor_get_hll_info,
            commands::editor::editor_add_hll_elements,
            // Editor commands — bitmap
            commands::editor::editor_get_bitmap_info,
            commands::editor::editor_set_bitmap_bit,
            // Editor commands — geospatial
            commands::editor::editor_get_geo_members,
            commands::editor::editor_add_geo_member,
            commands::editor::editor_geo_distance,
            commands::editor::editor_remove_geo_members,
            // Editor commands — TTL
            commands::editor::editor_get_ttl,
            commands::editor::editor_set_ttl,
            commands::editor::editor_persist_key,
            // Monitor commands
            commands::monitor::monitor_server_info,
            commands::monitor::monitor_start_polling,
            commands::monitor::monitor_stop_polling,
            commands::monitor::monitor_slow_log,
            commands::monitor::monitor_client_list,
            commands::monitor::monitor_kill_client,
            commands::monitor::monitor_memory_stats,
            // CLI commands
            commands::cli::cli_execute,
            commands::cli::cli_get_command_suggestions,
            commands::cli::cli_get_command_history,
            // Pub/Sub commands
            commands::pubsub::pubsub_subscribe,
            commands::pubsub::pubsub_psubscribe,
            commands::pubsub::pubsub_unsubscribe,
            commands::pubsub::pubsub_publish,
            commands::pubsub::pubsub_get_active_channels,
        ])
        .run(tauri::generate_context!())
        .expect("error while running RedisLens");
}
