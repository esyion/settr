mod commands;
mod domain;
mod hash;
mod infrastructure;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;
/// 密码重置深链使用的协议头，与后端 {@code agents.auth.password-reset.reset-url-scheme} 和前端
/// {@link \@/lib/deep-link.ts} 中的常量保持一致。
const RESET_DEEP_LINK_SCHEME: &str = "agentsplus";

/// Builds and runs the Agents Plus Tauri application.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(target_os = "windows")]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            if let Err(error) = window.show() {
                eprintln!("聚焦已有实例窗口失败: {error}");
            }
            if let Err(error) = window.set_focus() {
                eprintln!("聚焦已有实例窗口失败: {error}");
            }
        }
        let urls: Vec<String> = _args
            .iter()
            .filter(|arg| arg.starts_with(RESET_DEEP_LINK_SCHEME))
            .cloned()
            .collect();
        if !urls.is_empty() {
            // 直接向所有窗口发送深链事件，无需调用 on_open_url
            if let Err(error) = app.emit("deep-link://new-url", urls) {
                eprintln!("派发深链事件到已有实例失败: {error}");
            }
        }
    }));
    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            #[cfg(any(windows, target_os = "linux"))]
            {
                if let Err(error) = app.deep_link().register(RESET_DEEP_LINK_SCHEME) {
                    eprintln!("注册深链协议失败: {error}");
                }
            }

            let handle = app.handle().clone();
            // 此回调已在正常启动时注册，用于处理深链 URL
            app.deep_link().on_open_url(move |event| {
                let urls: Vec<String> = event.urls().iter().map(|url| url.to_string()).collect();
                if let Err(error) = handle.emit("deep-link://new-url", urls) {
                    eprintln!("派发深链事件失败: {error}");
                }
            });

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
