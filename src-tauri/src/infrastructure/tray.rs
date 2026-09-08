use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime, WindowEvent,
};

const MAIN_WINDOW_LABEL: &str = "main";

/// Initializes the system tray with commands for showing the main window and exiting the app.
pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)
        .map_err(|error| error.to_string())?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)
        .map_err(|error| error.to_string())?;
    let menu =
        Menu::with_items(app, &[&show_item, &quit_item]).map_err(|error| error.to_string())?;

    let tray_builder = app
        .default_window_icon()
        .map(|icon| TrayIconBuilder::new().icon(icon.clone()))
        .unwrap_or_else(TrayIconBuilder::new);

    tray_builder
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                if let Err(error) = show_main_window(app) {
                    log::error!("显示主窗口失败: {error}");
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Err(error) = show_main_window(tray.app_handle()) {
                    log::error!("显示主窗口失败: {error}");
                }
            }
        })
        .build(app)
        .map_err(|error| error.to_string())?;

    Ok(())
}

/// Shows and focuses the main application window.
/// <p>
/// 托盘菜单、托盘点击与全局快捷键共用;crate 内可见。
pub(crate) fn show_main_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "未找到主窗口".to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    Ok(())
}

/// Changes the main window close action according to the user setting.
/// <p>
/// 每次关闭事件实时读取设置(锁仅覆盖布尔克隆):开启"关闭到托盘"时
/// 阻止关闭并隐藏窗口;关闭该选项时直接放行默认关闭行为,设置修改即时生效。
pub fn setup_close_to_tray<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let app_handle = app.clone();
    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "未找到主窗口，无法注册关闭到托盘事件".to_string())?;
    let window_to_hide = window.clone();

    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            let close_to_tray = app_handle
                .state::<crate::state::AppState>()
                .settings
                .read()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .close_to_tray;
            if !close_to_tray {
                // 用户选择关闭即退出:不拦截默认行为。
                return;
            }
            api.prevent_close();
            if let Err(error) = window_to_hide.hide() {
                log::error!("隐藏主窗口失败: {error}");
            }
        }
    });

    Ok(())
}
