//! Skill 客户端应用层。
//!
//! AGENTS.md §4.3:表达用户可执行的用例,如创建、导入、同步、导出和删除。
//! 负责流程编排、事务边界、幂等性、重试策略和跨领域协调。
//! 通过 trait 定义端口;具体实现放在 infrastructure。
//!
//! 本模块不依赖 Tauri 运行时,接受 context(API base url、auth token)作为参数,
//! 错误用 {@link crate::shared::error::SkillError} 表达,边界校验由 command 层做。

use crate::domain::skill::HarnessId;
use crate::infrastructure::skill_api::SkillApiClient;
use crate::infrastructure::skill_installer::{
    disable_harness, enable_harness, install_to_local, sync_one, InstallResult,
};
use crate::infrastructure::skill_state::SkillsStateStore;
use std::path::PathBuf;

use crate::shared::error::SkillError;

/// 客户端运行时上下文(从 AppState 抽取)。
/// <p>
/// 由 command 层从全局 State 取出后传入;不依赖 Tauri 类型,便于单测。
#[derive(Debug, Clone)]
pub struct SkillContext {
    pub base_url: String,
    pub access_token: String,
}

impl SkillContext {
    /// 从全局上下文(类似 AppState)构造;token 为空则返回 NotAuthenticated。
    /// <p>
    /// token 不再由前端注入;改为从 OS keyring 拉(单一来源,避免 token 在前端/Tauri 两边不同步)。
    /// base_url 优先使用入参;为空时回退到环境变量,再回退到 localhost 兜底。
    pub fn from_global(base_url: &str) -> Result<Self, SkillError> {
        let access_token = crate::infrastructure::skill_session::read_access_token()?;
        let base_url = if base_url.is_empty() {
            std::env::var("NEXT_PUBLIC_API_BASE_URL")
                .unwrap_or_else(|_| "http://localhost:19999".to_string())
        } else {
            base_url.to_string()
        };
        Ok(Self {
            base_url,
            access_token,
        })
    }
}

/// 客户端 skill 用例服务(由 command 层调用,无 Tauri 依赖)。
/// <p>
/// 通过依赖注入传入 home 路径、API client、state 持久化;方便单测替换。
pub struct SkillUseCases {
    pub home: PathBuf,
    pub api: SkillApiClient,
    pub state: SkillsStateStore,
}

impl SkillUseCases {
    /// 用 context 构造 use cases;home 由调用方决定(默认是用户主目录)。
    /// <p>
    /// 若 ctx.access_token 为空,本构造会触发从 keyring 拉取(委托 SkillContext::from_global)。
    pub fn new(home: PathBuf, ctx: SkillContext) -> Result<Self, SkillError> {
        let ctx = if ctx.access_token.is_empty() {
            // 兼容旧调用方:如果调用方没填 token,这里兜底从 keyring 拉
            SkillContext::from_global(&ctx.base_url)?
        } else {
            ctx
        };
        let state = SkillsStateStore::load(&crate::infrastructure::skill_paths::state_file(&home))
            .map_err(|e| SkillError::InstallFailed(format!("加载 skills-state.json 失败: {e}")))?;
        Ok(Self {
            home,
            api: SkillApiClient::new(ctx.base_url, ctx.access_token),
            state,
        })
    }

    /// 装到本地:服务端拉取 → 解压到 SSOT → 同步已启用 harness。
    pub async fn install(&self, skill_id: &str) -> Result<InstallResult, SkillError> {
        install_to_local(&self.home, &self.api, &self.state, skill_id)
            .await
            .map_err(|e| SkillError::InstallFailed(e.to_string()))
    }

    /// 启用 harness(自动 install + dispatch)。
    pub async fn enable(
        &self,
        skill_id: &str,
        harness: HarnessId,
    ) -> Result<InstallResult, SkillError> {
        enable_harness(&self.home, &self.api, &self.state, skill_id, harness)
            .await
            .map_err(|e| SkillError::InstallFailed(e.to_string()))
    }

    /// 关闭 harness。
    pub fn disable(
        &self,
        skill_id: &str,
        skill_name: &str,
        harness: HarnessId,
    ) -> Result<(), SkillError> {
        disable_harness(&self.home, &self.state, skill_id, skill_name, harness)
            .map_err(|e| SkillError::InstallFailed(e.to_string()))
    }

    /// 重新同步单个 harness。
    pub fn sync(
        &self,
        skill_id: &str,
        skill_name: &str,
        harness: HarnessId,
    ) -> Result<(), SkillError> {
        sync_one(&self.home, &self.state, skill_id, skill_name, harness)
            .map(|_| ())
            .map_err(|e| SkillError::InstallFailed(e.to_string()))
    }

    /// 扫描本机存在的 harness(返回有 skills/ 目录的 harness 名称列表)。
    /// <p>
    /// 实现走文件系统访问,放在 use case 层而非 command 层(AGENTS.md §4.2 不在 command 直访 IO)。
    pub fn scan_installed_harnesses(&self) -> Vec<String> {
        HarnessId::ALL
            .iter()
            .filter(|h| h.skills_dir(&self.home).exists())
            .map(|h| h.as_str().to_string())
            .collect()
    }

    /// 取本地启用矩阵快照,供前端展示"哪些 skill 在哪些 harness 启用"。
    pub fn read_local_state(&self) -> Result<serde_json::Value, SkillError> {
        let snap = self.state.snapshot();
        serde_json::to_value(snap).map_err(|e| SkillError::Internal(e.to_string()))
    }
}
