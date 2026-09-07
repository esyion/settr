//! Skill 领域类型。
//!
//! 纯 Rust 业务类型:不含 IO、不含 Tauri / reqwest 引用。
//! AGENTS.md §4.4 领域层应保持纯 Rust,可脱离 Tauri 运行和测试。

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// 支持的 AI harness(用于 skill 分发目标)。
/// <p>
/// 命名与 cc-switch 对齐,以便未来跨项目对照;每个变体都带：
/// - 路径解析(相对用户主目录的 skills 子目录,或 platform-specific config dir)
/// - supported: 该 harness 当前是否已实现(unsupported 在 UI 标红)
/// - symlink target 长度阈值(沿用 cc-switch 的 4 KiB)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HarnessId {
    Claude,
    Codex,
    Gemini,
    GrokBuild,
    OpenCode,
    Hermes,
    Pi,
}

impl HarnessId {
    /// 全部 harness(用于扫描本机存在的 harness)。
    pub const ALL: [HarnessId; 7] = [
        HarnessId::Claude,
        HarnessId::Codex,
        HarnessId::Gemini,
        HarnessId::GrokBuild,
        HarnessId::OpenCode,
        HarnessId::Hermes,
        HarnessId::Pi,
    ];

    /// 在序列化时使用的 snake_case 名称(与 IPC 契约对齐)。
    pub fn as_str(&self) -> &'static str {
        match self {
            HarnessId::Claude => "claude",
            HarnessId::Codex => "codex",
            HarnessId::Gemini => "gemini",
            HarnessId::GrokBuild => "grokbuild",
            HarnessId::OpenCode => "opencode",
            HarnessId::Hermes => "hermes",
            HarnessId::Pi => "pi",
        }
    }

    /// 解析目标 harness 路径(相对用户主目录)。
    /// <p>
    /// Pi 走 ~/.pi/agent/skills/;其他走 ~/.{harness}/skills/。
    /// 不在此实现 override 机制(简化 MVP,后续可加 settings.json 覆盖)。
    pub fn skills_dir(&self, home: &std::path::Path) -> PathBuf {
        match self {
            HarnessId::Pi => home.join(".pi").join("agent").join("skills"),
            _ => home.join(format!(".{}", self.as_str())).join("skills"),
        }
    }
}

/// Skill 同步方式(SSOT → harness)。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SyncMethod {
    /// 自动:优先 symlink,失败回退 copy。
    #[default]
    Auto,
    /// 强制符号链接。
    Symlink,
    /// 强制文件复制(兼容老式 harness / NTFS 受限场景)。
    Copy,
}

/// skill name 合法性:仅小写字母/数字/连字符,首字符为字母或数字,长度 1-64。
/// <p>
/// 对齐 spec §9 与后端 SkillService 的 @Pattern:^[a-z0-9][a-z0-9-]{0,63}$。
pub fn is_valid_skill_name(name: &str) -> bool {
    if name.is_empty() || name.len() > 64 {
        return false;
    }
    let mut chars = name.chars();
    let first = chars.next().unwrap();
    if !(first.is_ascii_digit() || (first.is_ascii_lowercase())) {
        return false;
    }
    name.chars()
        .all(|c| c.is_ascii_digit() || (c.is_ascii_lowercase()) || c == '-')
}
