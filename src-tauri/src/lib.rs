pub mod application;
mod commands;
mod domain;
pub mod dto;
mod hash;
mod infrastructure;
pub mod shared;
pub mod state;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
/// 密码重置深链使用的协议头，与后端 {@code agents.auth.password-reset.reset-url-scheme} 和前端
/// {@link \@/lib/deep-link.ts} 中的常量保持一致。
const RESET_DEEP_LINK_SCHEME: &str = "agentsplus";

/// 开机自启动使用的静默启动参数:带此参数启动时不显示主窗口(驻留托盘)。
/// 与 tauri_plugin_autostart 注册的启动参数保持一致。
const HIDE_AT_LAUNCH_ARG: &str = "--hidden";

/// 全局快捷键(唤起主窗口),Tauri 快捷键语法;与其他应用冲突时注册失败仅降级警告。
const GLOBAL_SHOW_SHORTCUT: &str = "CmdOrCtrl+Alt+A";

/// Builds and runs the Agents Plus Tauri application.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // 生产日志：开发期输出到 stdout（Debug 级），Release 写入系统日志目录（Info 级），
    // 文件超限轮转且保留旧文件；路径为 %LOCALAPPDATA%/com.msi.agents-plus/logs。
    let builder = builder.plugin(
        tauri_plugin_log::Builder::new()
            .targets([
                tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                    file_name: None,
                }),
            ])
            .level(if cfg!(debug_assertions) {
                log::LevelFilter::Debug
            } else {
                log::LevelFilter::Info
            })
            .max_file_size(512_000)
            .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
            .build(),
    );
    // 窗口状态记忆:自动保存/恢复位置、大小与最大化状态。
    let builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());
    // 自动更新:插件先行注册;updater endpoints/pubkey 在 tauri.conf.json 配置并
    // 提供 TAURI_SIGNING_PRIVATE_KEY 后即启用(发布门槛 PRODUCT-BLUEPRINT §11)。
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    // 开机自启动:macOS 用 LaunchAgent;带 --hidden 参数,登录后静默驻留托盘。
    let builder = builder.plugin(tauri_plugin_autostart::init(
        tauri_plugin_autostart::MacosLauncher::LaunchAgent,
        Some(vec![HIDE_AT_LAUNCH_ARG]),
    ));
    // 系统能力插件:系统通知/原生对话框/剪贴板/全局快捷键。前端经 src/services/*
    // 统一调用,capability 按最小权限开放(见 capabilities/default.json)。
    let builder = builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build());

    // 单实例:Windows 走插件;macOS 系统本身保证单实例;Linux 由插件兜底,
    // 同时承接深链 URL 向既有实例的转发(deep-link 插件在运行态依赖该机制)。
    #[cfg(any(windows, target_os = "linux"))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        // 二次启动若来自自启动(带 --hidden),保持静默,不弹主窗口。
        if !_args.iter().any(|arg| arg == HIDE_AT_LAUNCH_ARG) {
            if let Some(window) = app.get_webview_window("main") {
                if let Err(error) = window.show() {
                    log::error!("聚焦已有实例窗口失败: {error}");
                }
                if let Err(error) = window.set_focus() {
                    log::error!("聚焦已有实例窗口失败: {error}");
                }
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
                log::error!("派发深链事件到已有实例失败: {error}");
            }
        }
    }));
    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            // panic 崩溃留痕:release 为 panic=abort,崩溃前把信息写入日志目录
            // panic.log(应在最早期安装,覆盖后续所有启动逻辑)。
            infrastructure::panic_report::install_panic_hook(app.handle());

            // 日志保留策略:清理超期日志(KeepAll 轮转的旧文件会无限累积)。
            infrastructure::log_retention::cleanup_expired_logs(app.handle());

            // 自启动静默启动:带 --hidden 参数时不显示主窗口,驻留托盘。
            // 窗口默认可见,此处尽早隐藏,极短闪现可接受。
            if std::env::args().any(|arg| arg == HIDE_AT_LAUNCH_ARG) {
                if let Some(window) = app.get_webview_window("main") {
                    if let Err(error) = window.hide() {
                        log::error!("静默启动隐藏主窗口失败: {error}");
                    }
                }
            }

            #[cfg(any(windows, target_os = "linux"))]
            {
                if let Err(error) = app.deep_link().register(RESET_DEEP_LINK_SCHEME) {
                    log::error!("注册深链协议失败: {error}");
                }
            }

            let handle = app.handle().clone();
            // 此回调已在正常启动时注册，用于处理深链 URL
            app.deep_link().on_open_url(move |event| {
                let urls: Vec<String> = event.urls().iter().map(|url| url.to_string()).collect();
                if let Err(error) = handle.emit("deep-link://new-url", urls) {
                    log::error!("派发深链事件失败: {error}");
                }
            });

            let watcher = infrastructure::local_watcher::LocalFileWatcher::start(app.handle())
                .map_err(std::io::Error::other)?;
            app.manage(watcher);
            // 设置存储:使用平台推荐配置目录(Windows: %APPDATA%/com.msi.agents-plus)。
            let config_dir = app
                .path()
                .app_config_dir()
                .map_err(|error| std::io::Error::other(format!("无法解析配置目录: {error}")))?;
            let settings_store = infrastructure::settings_store::SettingsStore::new(
                config_dir.join("settings.json"),
            );
            app.manage(state::AppState::new(settings_store));
            infrastructure::tray::setup_tray(app.handle()).map_err(std::io::Error::other)?;
            infrastructure::tray::setup_close_to_tray(app.handle())
                .map_err(std::io::Error::other)?;
            // 全局快捷键:一键唤起主窗口(配合托盘常驻形态)。注册失败仅警告降级,
            // 不阻断启动;常见冲突原因是其他应用占用同组合键。
            if let Err(error) =
                app.global_shortcut()
                    .on_shortcut(GLOBAL_SHOW_SHORTCUT, |app, _shortcut, event| {
                        if event.state() == ShortcutState::Pressed {
                            if let Err(error) = infrastructure::tray::show_main_window(app) {
                                log::error!("全局快捷键唤起主窗口失败: {error}");
                            }
                        }
                    })
            {
                log::warn!(
                    "注册全局快捷键 {GLOBAL_SHOW_SHORTCUT} 失败(可能与其他应用冲突): {error}"
                );
            }
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
            commands::policy::apply_org_policy,
            commands::network::api_request,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::network::api_upload,
            commands::skill::list_skills,
            commands::skill::install_skill,
            commands::skill::enable_skill_harness,
            commands::skill::disable_skill_harness,
            commands::skill::resync_skill_harness,
            commands::skill::scan_local_harnesses,
            commands::skill::read_local_skill_state,
            commands::skill::publish_skill_version
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
