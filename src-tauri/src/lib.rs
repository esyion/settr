mod commands;
mod infrastructure;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::auth::get_auth_session,
            commands::auth::save_auth_session,
            commands::auth::clear_auth_session,
            commands::local::get_device_identity,
            commands::local::get_local_snapshot,
            commands::local::save_local_manifest,
            commands::local::apply_remote_document,
            commands::network::api_request
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
