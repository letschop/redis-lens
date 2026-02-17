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
            // Editor commands — TTL
            commands::editor::editor_get_ttl,
            commands::editor::editor_set_ttl,
            commands::editor::editor_persist_key,
        ])
        .run(tauri::generate_context!())
        .expect("error while running RedisLens");
}
