//! The native shell around the till.
//!
//! The billing screens are the very same files the website serves, so there is one app to
//! maintain. All this adds is a real SQLite file on the device, which the offline layer in
//! `billing-suite/offline/local-db.js` talks to through the SQL plugin.

use tauri_plugin_sql::{Migration, MigrationKind};

/// The offline layer creates its own tables the first time it opens the database, so the only
/// migration here is the one that proves the file is writable and records which build made it.
fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "till_marker",
        sql: "CREATE TABLE IF NOT EXISTS till_marker (k TEXT PRIMARY KEY, v TEXT NOT NULL);\
              INSERT OR REPLACE INTO till_marker (k, v) VALUES ('schema', '20');",
        kind: MigrationKind::Up,
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // One window only: a second copy of the app must never write to the same till database.
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            use tauri::Manager;
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                // The database lives in the app's own data folder, chosen by the operating
                // system, never in a temporary or cache folder that can be cleared.
                .add_migrations("sqlite:restaurant-till.db", migrations())
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("the till could not start");
}
