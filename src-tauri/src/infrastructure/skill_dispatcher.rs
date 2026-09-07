//! Skill 分发器:SSOT → 目标 harness 目录。
//!
//! 核心逻辑(对齐 cc-switch 思路但简化):
//! 1. 检查 SSOT 含 SKILL.md(未安装不能分发)
//! 2. 取 SyncMethod(Auto / Symlink / Copy)
//! 3. Auto:目标不存在 → 尝试 symlink → 失败回退 copy
//! 4. Auto:目标存在但非 symlink → copy 替换
//! 5. Symlink:目标存在先删 → 创建 symlink
//! 6. Copy:目标存在先删 → 递归 copy
//! 7. 整个过程异常 → 状态文件记录 last_install_error
//!
//! 平台差异:Windows 上目录 symlink 用 symlink_dir,文件 symlink 用 symlink_file;
//! 服务端分发到 Pi(对齐 cc-switch)走 Pi 特殊处理(MVP 简化为直接同步)。

use crate::domain::skill::{HarnessId, SyncMethod};
use crate::infrastructure::fs_utils::copy_dir_recursive;
use crate::infrastructure::skill_paths::{ensure_dir, ssot_skill_dir};
use std::path::Path;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum DispatchError {
    #[error("SSOT 不存在: {0}")]
    SsotMissing(String),
    #[error("SSOT 缺少 SKILL.md: {0}")]
    SsotMissingSkillMd(String),
    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DispatchOutcome {
    /// 同步成功(method 标明实际使用的同步方式)。
    Synced { method: SyncMethod },
}

/// 把 {@code skill_name} 从 SSOT 同步到目标 harness 目录。
/// <p>
/// 若目标目录已存在 symlink 指向相同 SSOT 路径,视为幂等成功(不重复写)。
pub fn dispatch_to_harness(
    home: &Path,
    skill_name: &str,
    harness: HarnessId,
    method: SyncMethod,
) -> Result<DispatchOutcome, DispatchError> {
    let ssot = ssot_skill_dir(home, skill_name);
    if !ssot.exists() {
        return Err(DispatchError::SsotMissing(skill_name.to_string()));
    }
    if !ssot.join("SKILL.md").exists() {
        return Err(DispatchError::SsotMissingSkillMd(skill_name.to_string()));
    }
    let target_dir = harness.skills_dir(home);
    ensure_dir(&target_dir)?;
    let dest = target_dir.join(skill_name);

    // 幂等:已存在同名 symlink 指向相同 SSOT
    if dest.is_symlink() {
        if let Ok(existing) = std::fs::read_link(&dest) {
            if existing == ssot {
                return Ok(DispatchOutcome::Synced {
                    method: SyncMethod::Symlink,
                });
            }
        }
    }

    let used_method = match method {
        SyncMethod::Auto => {
            if dest.exists() && !dest.is_symlink() {
                replace_with_copy(&ssot, &dest)?;
                SyncMethod::Copy
            } else {
                if dest.is_symlink() {
                    remove_path(&dest)?;
                }
                match create_symlink(&ssot, &dest) {
                    Ok(()) => SyncMethod::Symlink,
                    Err(_) => {
                        replace_with_copy(&ssot, &dest)?;
                        SyncMethod::Copy
                    }
                }
            }
        }
        SyncMethod::Symlink => {
            if dest.exists() || dest.is_symlink() {
                remove_path(&dest)?;
            }
            create_symlink(&ssot, &dest)?;
            SyncMethod::Symlink
        }
        SyncMethod::Copy => {
            replace_with_copy(&ssot, &dest)?;
            SyncMethod::Copy
        }
    };
    Ok(DispatchOutcome::Synced {
        method: used_method,
    })
}

/// 取消分发:从目标 harness 目录移除该 skill(SSOT 保留)。
pub fn undispatch_from_harness(
    home: &Path,
    skill_name: &str,
    harness: HarnessId,
) -> Result<(), DispatchError> {
    let dest = harness.skills_dir(home).join(skill_name);
    if dest.exists() || dest.is_symlink() {
        remove_path(&dest)?;
    }
    Ok(())
}

fn replace_with_copy(src: &Path, dest: &Path) -> Result<(), DispatchError> {
    if dest.exists() || dest.is_symlink() {
        remove_path(dest)?;
    }
    copy_dir_recursive(src, dest).map_err(DispatchError::Io)
}

fn remove_path(path: &Path) -> Result<(), DispatchError> {
    if path.is_symlink() {
        #[cfg(unix)]
        std::fs::remove_file(path)?;
        #[cfg(windows)]
        std::fs::remove_dir(path)?;
    } else if path.is_dir() {
        std::fs::remove_dir_all(path)?;
    } else if path.exists() {
        std::fs::remove_file(path)?;
    }
    Ok(())
}

#[cfg(unix)]
fn create_symlink(src: &Path, dest: &Path) -> std::io::Result<()> {
    std::os::unix::fs::symlink(src, dest)
}

#[cfg(windows)]
fn create_symlink(src: &Path, dest: &Path) -> std::io::Result<()> {
    // Windows 上目录需要 symlink_dir;Developer Mode 开启时才允许非特权创建
    std::os::windows::fs::symlink_dir(src, dest)
}
