//! 客户端 Skill Tauri commands(接口层薄适配器)。
//!
//! AGENTS.md §4.2 每个 command 必须遵循以下顺序:
//!   1. 接收 DTO 参数
//!   2. 边界校验、权限检查和必要的上下文提取
//!   3. 从 State 获取应用服务
//!   4. 调用一个明确的应用用例
//!   5. 将领域结果映射为响应 DTO
//!   6. 将错误转换为稳定的 IPC 错误结构
//!
//! 本文件严格保持 command 薄:不做 IO、不做编排,所有业务交给 {@link application::skill::SkillUseCases}。

use crate::application::skill::SkillContext;
use crate::domain::skill::HarnessId;
use crate::dto::skill::{InstallResultDto, SkillListItemDto};
use crate::infrastructure::skill_api::SkillApiClient;
use crate::shared::error::SkillError;
use std::path::PathBuf;
use tauri::State;

/// 从 AppState 抽取 SkillContext,顺便做 NotAuthenticated 校验(边界校验第二步)。
/// 从 AppState 取出 base_url(只取这一项),token 走 keyring(由 SkillContext 内部处理)。
fn extract_context(state: &State<'_, crate::state::AppState>) -> Result<SkillContext, SkillError> {
    let st = state.inner();
    SkillContext::from_global(&st.api_base_url)
}

/// 解析 harness 字符串为 HarnessId;非法值返回 SkillError::InvalidHarness(IPC 稳定错误码)。
fn parse_harness(s: &str) -> Result<HarnessId, SkillError> {
    Ok(match s {
        "claude" => HarnessId::Claude,
        "codex" => HarnessId::Codex,
        "gemini" => HarnessId::Gemini,
        "grokbuild" => HarnessId::GrokBuild,
        "opencode" => HarnessId::OpenCode,
        "hermes" => HarnessId::Hermes,
        "pi" => HarnessId::Pi,
        other => return Err(SkillError::InvalidHarness(other.to_string())),
    })
}

/// 在 command 内把 base_url 取成 owned(避免 async 闭包持有 State),token 由 SkillContext 走 keyring。
fn build_for_use(
    state: &State<'_, crate::state::AppState>,
) -> Result<(PathBuf, SkillContext), SkillError> {
    let ctx = extract_context(state)?;
    let home =
        dirs::home_dir().ok_or_else(|| SkillError::Internal("无法解析 home 目录".to_string()))?;
    Ok((home, ctx))
}

/// 列出服务端可见 skill(MVP: personal 范围)。
/// <p>
/// 注意:Tauri command 的 future 必须是 'static,所以这里不能直接持有 State。
/// 我们先把必要字段(API 客户端)取出成 owned,再 spawn 一个独立 future。
#[tauri::command]
pub async fn list_skills(
    state: State<'_, crate::state::AppState>,
) -> Result<Vec<SkillListItemDto>, String> {
    let ctx = extract_context(&state).map_err(|e| format!("[{}] {}", e.code(), e))?;
    let api = SkillApiClient::new(ctx.base_url, ctx.access_token);
    api.list_skills()
        .await
        .map(|list| {
            list.into_iter()
                .map(SkillListItemDto::from)
                .collect::<Vec<_>>()
        })
        .map_err(|e| format!("[INSTALL_FAILED] 拉取列表失败: {e}"))
}

/// 装到本地 SSOT(并按 state 自动同步到已启用 harness)。
#[tauri::command]
pub async fn install_skill(
    state: State<'_, crate::state::AppState>,
    skill_id: String,
) -> Result<InstallResultDto, String> {
    let (home, ctx) = build_for_use(&state).map_err(|e| format!("[{}] {}", e.code(), e))?;
    let uc = crate::application::skill::SkillUseCases::new(home, ctx)
        .map_err(|e| format!("[{}] {}", e.code(), e))?;
    uc.install(&skill_id)
        .await
        .map(InstallResultDto::from)
        .map_err(|e| format!("[{}] {}", e.code(), e))
}

/// 启用 harness(自动 install + dispatch)。
#[tauri::command]
pub async fn enable_skill_harness(
    state: State<'_, crate::state::AppState>,
    skill_id: String,
    harness: String,
) -> Result<InstallResultDto, String> {
    let h = parse_harness(&harness).map_err(|e| format!("[{}] {}", e.code(), e))?;
    let (home, ctx) = build_for_use(&state).map_err(|e| format!("[{}] {}", e.code(), e))?;
    let uc = crate::application::skill::SkillUseCases::new(home, ctx)
        .map_err(|e| format!("[{}] {}", e.code(), e))?;
    uc.enable(&skill_id, h)
        .await
        .map(InstallResultDto::from)
        .map_err(|e| format!("[{}] {}", e.code(), e))
}

/// 禁用 harness(从 state 移除 + 删除 harness 目录下的副本)。
#[tauri::command]
pub fn disable_skill_harness(
    state: State<'_, crate::state::AppState>,
    skill_id: String,
    skill_name: String,
    harness: String,
) -> Result<(), String> {
    let h = parse_harness(&harness).map_err(|e| format!("[{}] {}", e.code(), e))?;
    let (home, ctx) = build_for_use(&state).map_err(|e| format!("[{}] {}", e.code(), e))?;
    let uc = crate::application::skill::SkillUseCases::new(home, ctx)
        .map_err(|e| format!("[{}] {}", e.code(), e))?;
    uc.disable(&skill_id, &skill_name, h)
        .map_err(|e| format!("[{}] {}", e.code(), e))
}

/// 重新同步单个 harness(SSOT 已存在前提下)。
#[tauri::command]
pub fn resync_skill_harness(
    state: State<'_, crate::state::AppState>,
    skill_id: String,
    skill_name: String,
    harness: String,
) -> Result<(), String> {
    let h = parse_harness(&harness).map_err(|e| format!("[{}] {}", e.code(), e))?;
    let (home, ctx) = build_for_use(&state).map_err(|e| format!("[{}] {}", e.code(), e))?;
    let uc = crate::application::skill::SkillUseCases::new(home, ctx)
        .map_err(|e| format!("[{}] {}", e.code(), e))?;
    uc.sync(&skill_id, &skill_name, h)
        .map_err(|e| format!("[{}] {}", e.code(), e))
}

/// 扫描本机存在的 harness(返回有 skills/ 目录的 harness 列表)。
/// <p>
/// IO 在 use case 层,command 仅做结果序列化。
#[tauri::command]
pub fn scan_local_harnesses(
    state: State<'_, crate::state::AppState>,
) -> Result<Vec<String>, String> {
    let (home, ctx) = build_for_use(&state).map_err(|e| format!("[{}] {}", e.code(), e))?;
    let uc = crate::application::skill::SkillUseCases::new(home, ctx)
        .map_err(|e| format!("[{}] {}", e.code(), e))?;
    Ok(uc.scan_installed_harnesses())
}

/// 取本地状态快照(给前端展示"哪些 skill 已启用哪些 harness"用)。
#[tauri::command]
pub fn read_local_skill_state(
    state: State<'_, crate::state::AppState>,
) -> Result<serde_json::Value, String> {
    let (home, ctx) = build_for_use(&state).map_err(|e| format!("[{}] {}", e.code(), e))?;
    let uc = crate::application::skill::SkillUseCases::new(home, ctx)
        .map_err(|e| format!("[{}] {}", e.code(), e))?;
    uc.read_local_state()
        .map_err(|e| format!("[{}] {}", e.code(), e))
}
