mod commands;
mod hash;
mod infrastructure;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// Builds and runs the Agents Plus Tauri application.
pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(target_os = "windows")]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Err(error) = app
            .get_webview_window("main")
            .ok_or_else(|| "未找到主窗口".to_string())
            .and_then(|window| {
                window.show().map_err(|error| error.to_string())?;
                window.set_focus().map_err(|error| error.to_string())
            })
        {
            eprintln!("聚焦已有实例窗口失败: {error}");
        }
    }));

    builder
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let watcher = infrastructure::local_watcher::LocalFileWatcher::start(app.handle())
                .map_err(std::io::Error::other)?;
            app.manage(watcher);
            infrastructure::tray::setup_tray(app.handle()).map_err(std::io::Error::other)?;
            infrastructure::tray::setup_close_to_tray(app.handle())
                .map_err(std::io::Error::other)?;
            Ok(())
        })
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
