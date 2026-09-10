//! 推送连接的 Tauri command 薄适配器。
//!
//! 只做边界校验(参数、URL 规则、组织 ID 格式)、从 State 取协调器、以应用
//! 用例装配后台连接任务;连接生命周期内的重连、退避、信号解析全部在应用层
//! 循环中完成。

use crate::application::push::{run_push_loop, PushLoopFinishHook, PushSpec, PushStreamFactory};
use crate::dto::push::{PushConnectRequest, PushStatusDto};
use crate::infrastructure::sse_client::{ReqwestPushStreamFactory, WebviewPushEventSink};
use crate::shared::url::validate_backend_base_url;
use crate::state::AppState;
use std::sync::Arc;
use tauri::{AppHandle, State};
use tokio::sync::watch;

/**
 * 打开组织变更推送连接(SSE)。
 *
 * 同一时刻只保留一条连接:重复调用会先停掉旧连接再启动新连接(新连接
 * 代际更新,旧连接的迟到事件会被丢弃)。连接状态与变更信号通过
 * push://status 与 push://org-change 事件发往 webview;认证失效(401)时
 * 循环自动停止,前端刷新 token 后需重新调用本命令。
 *
 * @param request 连接参数(base URL、access token、组织 ID)
 * @param state   全局应用状态(取推送协调器)
 * @param app     应用句柄(事件出口)
 * @return 受理后的连接状态(连通性以 push://status 事件为准)
 */
#[tauri::command]
pub async fn push_connect(
    request: PushConnectRequest,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<PushStatusDto, String> {
    let base_url = validate_backend_base_url(&request.base_url)?;
    if request.access_token.trim().is_empty() {
        return Err("缺少登录凭据,请先登录".to_string());
    }
    let organization_id = request.organization_id.trim().to_string();
    // 组织 ID 直接拼入请求路径且请求携带 Bearer token,必须在边界校验格式:
    // 只允许 1~64 位十进制数字(雪花 ID),阻断 ../ 之类的路径重塑输入。
    if !is_snowflake_id(&organization_id) {
        return Err("组织 ID 格式不合法".to_string());
    }
    let spec = PushSpec {
        base_url,
        access_token: request.access_token,
        organization_id: organization_id.clone(),
    };
    let (stop_sender, stop_receiver) = watch::channel(false);
    let generation = state.push.activate(stop_sender);
    let factory: Arc<dyn PushStreamFactory> = Arc::new(ReqwestPushStreamFactory);
    let sink = Arc::new(WebviewPushEventSink::new(
        app,
        Arc::clone(&state.push),
        generation,
    ));
    let coordinator = Arc::clone(&state.push);
    let on_finish: PushLoopFinishHook =
        Arc::new(move || coordinator.deactivate_if_current(generation));
    tauri::async_runtime::spawn(run_push_loop(spec, stop_receiver, factory, sink, on_finish));
    Ok(PushStatusDto {
        connected: true,
        organization_id: Some(organization_id),
    })
}

/**
 * 关闭组织变更推送连接(幂等):登出或切换工作区时调用。
 *
 * @param state 全局应用状态(取推送协调器)
 * @return 关闭后的连接状态
 */
#[tauri::command]
pub fn push_disconnect(state: State<'_, AppState>) -> PushStatusDto {
    state.push.stop_active();
    PushStatusDto {
        connected: false,
        organization_id: None,
    }
}

/**
 * 查询推送连接是否处于登记状态(供前端在窗口重载后对齐状态)。
 *
 * @param state 全局应用状态
 * @return 当前连接状态
 */
#[tauri::command]
pub fn push_status(state: State<'_, AppState>) -> PushStatusDto {
    let connected = state.push.has_active();
    PushStatusDto {
        connected,
        organization_id: None,
    }
}

/**
 * 校验雪花 ID 格式:1~64 位十进制数字(命令边界防线路重塑,见 push_connect)。
 *
 * @param value 待校验字符串(已 trim)
 * @return 合法时返回 true
 */
fn is_snowflake_id(value: &str) -> bool {
    let length = value.chars().count();
    (1..=64).contains(&length) && value.chars().all(|c| c.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use super::is_snowflake_id;

    /// 合法雪花 ID:纯数字、长度 1~64。
    #[test]
    fn accepts_numeric_ids() {
        assert!(is_snowflake_id("1"));
        assert!(is_snowflake_id(&"9".repeat(64)));
    }

    /// 非法输入:路径穿越、非数字、超长、空串。
    #[test]
    fn rejects_path_traversal_and_garbage() {
        assert!(!is_snowflake_id("../../x"));
        assert!(!is_snowflake_id("1a"));
        assert!(!is_snowflake_id(&"9".repeat(65)));
        assert!(!is_snowflake_id(""));
    }
}

// ========== 用户维度推送(通知通道) ==========
//
// 与组织维度推送解耦,严格保持通知与组织内容变更正交
// （docs/messagePushSubscribe.md §4.1）。
// 注册表、协调器、事件名均独立维护。

use crate::application::notify::{
    run_notify_loop, NotifyLoopFinishHook, NotifySpec, NotifyStreamFactory,
};
use crate::dto::notify::{NotifyStatusDto, NotifySubscribeRequest};
use crate::infrastructure::notify_sink::{ReqwestNotifyStreamFactory, WebviewNotifyEventSink};

/**
 * 打开用户维度实时通知连接(SSE)。
 *
 * 同一时刻只保留一条用户连接:重复调用会替换旧连接(代际更新,旧连接
 * 的迟到事件会被丢弃)。连接状态与通知信号通过 push://notify-status
 * 与 push://notify 事件发往 webview;认证失效(401)时循环自动停止,
 * 前端刷新 token 后需重新调用本命令。
 *
 * @param request 连接参数(base URL、access token)
 * @param state   全局应用状态(取通知协调器)
 * @param app     应用句柄(事件出口)
 * @return 受理后的连接状态
 */
#[tauri::command]
pub async fn push_subscribe_user(
    request: NotifySubscribeRequest,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<NotifyStatusDto, String> {
    let base_url = validate_backend_base_url(&request.base_url)?;
    if request.access_token.trim().is_empty() {
        return Err("缺少登录凭据,请先登录".to_string());
    }
    let spec = NotifySpec {
        base_url,
        access_token: request.access_token,
    };
    let (stop_sender, stop_receiver) = watch::channel(false);
    let generation = state.notify.activate(stop_sender);
    let factory: Arc<dyn NotifyStreamFactory> = Arc::new(ReqwestNotifyStreamFactory);
    let sink = Arc::new(WebviewNotifyEventSink::new(
        app,
        Arc::clone(&state.notify),
        generation,
    ));
    let coordinator = Arc::clone(&state.notify);
    let on_finish: NotifyLoopFinishHook =
        Arc::new(move || coordinator.deactivate_if_current(generation));
    tauri::async_runtime::spawn(run_notify_loop(
        spec,
        stop_receiver,
        factory,
        sink,
        on_finish,
    ));
    Ok(NotifyStatusDto { connected: true })
}

/**
 * 关闭用户维度实时通知连接(幂等):登出时调用。
 */
#[tauri::command]
pub fn push_unsubscribe_user(state: State<'_, AppState>) -> NotifyStatusDto {
    state.notify.stop_active();
    NotifyStatusDto { connected: false }
}

/**
 * 查询用户维度推送连接登记状态(供前端在窗口重载后对齐状态)。
 */
#[tauri::command]
pub fn push_user_status(state: State<'_, AppState>) -> NotifyStatusDto {
    let connected = state.notify.has_active();
    NotifyStatusDto { connected }
}
