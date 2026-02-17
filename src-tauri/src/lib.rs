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
        .invoke_handler(tauri::generate_handler![
            commands::connection::connection_test,
            commands::health::health_check,
        ])
        .run(tauri::generate_context!())
        .expect("error while running RedisLens");
}
