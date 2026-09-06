//! 共享错误类型(AGENTS.md §5 IPC 错误契约)。
//!
//! 推荐响应结构:
//!   type IpcResult<T> = { ok: true; data: T } | { ok: false, error: { code, message, details? } }
//!
//! Skill 模块错误码(稳定,前端可按 code 分支):
//!   - NOT_AUTHENTICATED   未登录或 token 过期
//!   - INVALID_HARNESS     不支持的 harness 标识
//!   - INSTALL_FAILED      安装/分发失败
//!   - INTERNAL            内部错误

use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SkillError {
    #[error("未登录或 token 已过期")]
    NotAuthenticated,
    #[error("不支持的 harness: {0}")]
    InvalidHarness(String),
    #[error("安装失败: {0}")]
    InstallFailed(String),
    #[error("内部错误: {0}")]
    Internal(String),
}

impl SkillError {
    /// 稳定错误码(IPC 边界值)。
    pub fn code(&self) -> &'static str {
        match self {
            SkillError::NotAuthenticated => "NOT_AUTHENTICATED",
            SkillError::InvalidHarness(_) => "INVALID_HARNESS",
            SkillError::InstallFailed(_) => "INSTALL_FAILED",
            SkillError::Internal(_) => "INTERNAL",
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillErrorDto {
    pub code: String,
    pub message: String,
}

impl From<SkillError> for SkillErrorDto {
    fn from(e: SkillError) -> Self {
        Self {
            code: e.code().to_string(),
            message: e.to_string(),
        }
    }
}

/// IPC 错误响应结构(对齐 AGENTS.md §5 推荐的 IpcResult 风格)。
#[derive(Debug, Serialize)]
#[serde(tag = "ok", rename_all = "camelCase")]
pub enum IpcResponse<T: Serialize> {
    Ok { data: T },
    #[serde(rename = "false")]
    Err { error: SkillErrorDto },
}

impl<T: Serialize> From<Result<T, SkillError>> for IpcResponse<T> {
    fn from(r: Result<T, SkillError>) -> Self {
        match r {
            Ok(data) => IpcResponse::Ok { data },
            Err(e) => IpcResponse::Err { error: e.into() },
        }
    }
}
