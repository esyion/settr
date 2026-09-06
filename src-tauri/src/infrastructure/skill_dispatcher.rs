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
    /// skill 未启用该 harness,跳过。
    Skipped,
    /// 同步失败(已记到 state.last_install_error,这里返回错误)。
    Failed(String),
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
                return Ok(DispatchOutcome::Synced { method: SyncMethod::Symlink });
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
    Ok(DispatchOutcome::Synced { method: used_method })
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
    copy_dir_recursive(src, dest)
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> Result<(), DispatchError> {
    std::fs::create_dir_all(dest)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let entry_path = entry.path();
        let dest_path = dest.join(entry.file_name());
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            copy_dir_recursive(&entry_path, &dest_path)?;
        } else if file_type.is_symlink() {
            // 跟随源 symlink 内容(避免链路)
            let target = std::fs::read_link(&entry_path)?;
            #[cfg(unix)]
            std::os::unix::fs::symlink(&target, &dest_path)?;
            #[cfg(windows)]
            std::os::windows::fs::symlink_file(&target, &dest_path)?;
        } else {
            std::fs::copy(&entry_path, &dest_path)?;
        }
    }
    Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_home() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "agents-plus-dispatch-test-{}-{}",
            std::process::id(),
            uuid::Uuid::new_v4().simple()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// 检测本机 symlink 创建是否可用(Windows 非 Developer Mode 不可用)。
    fn symlink_available() -> bool {
        let probe = std::env::temp_dir().join(format!("agents-plus-symlink-probe-{}-{}",
            std::process::id(), uuid::Uuid::new_v4().simple()));
        let target = std::env::temp_dir().join(format!("agents-plus-symlink-probe-target-{}-{}",
            std::process::id(), uuid::Uuid::new_v4().simple()));
        let _ = std::fs::remove_file(&probe);
        let _ = std::fs::remove_file(&target);
        std::fs::write(&target, b"x").unwrap();
        #[cfg(unix)]
        let result = std::os::unix::fs::symlink(&target, &probe);
        #[cfg(windows)]
        let result = std::os::windows::fs::symlink_file(&target, &probe);
        let ok = result.is_ok();
        let _ = std::fs::remove_file(&probe);
        let _ = std::fs::remove_file(&target);
        ok
    }

    fn write_skill(home: &Path, name: &str) {
        let dir = ssot_skill_dir(home, name);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("SKILL.md"), b"# test").unwrap();
    }

    #[test]
    fn dispatch_auto_then_undispatch() {
        let home = tmp_home();
        write_skill(&home, "alpha");
        let outcome = dispatch_to_harness(&home, "alpha", HarnessId::Codex, SyncMethod::Auto).unwrap();
        match outcome {
            DispatchOutcome::Synced { .. } => {}
            other => panic!("expected Synced, got {:?}", other),
        }
        // 目标目录已建立
        let dest = HarnessId::Codex.skills_dir(&home).join("alpha");
        assert!(dest.exists());
        assert!(dest.join("SKILL.md").exists());
        // 取消
        undispatch_from_harness(&home, "alpha", HarnessId::Codex).unwrap();
        assert!(!dest.exists());
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn dispatch_idempotent_when_already_correct() {
        // 统一用 Copy 测幂等,避免 Windows symlink 权限依赖;symlink 行为单独在
        // dispatch_copy_replaces_existing_dir 之类测试中覆盖(若需要)
        let home = tmp_home();
        write_skill(&home, "beta");
        dispatch_to_harness(&home, "beta", HarnessId::Claude, SyncMethod::Copy).unwrap();
        let outcome = dispatch_to_harness(&home, "beta", HarnessId::Claude, SyncMethod::Copy).unwrap();
        assert!(matches!(outcome, DispatchOutcome::Synced { method: SyncMethod::Copy }));
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn dispatch_copy_replaces_existing_dir() {
        let home = tmp_home();
        write_skill(&home, "gamma");
        // 先建一个空目录作为 target
        let dest = HarnessId::Gemini.skills_dir(&home).join("gamma");
        std::fs::create_dir_all(&dest).unwrap();
        std::fs::write(dest.join("stale.txt"), b"old").unwrap();
        // 强制 copy
        dispatch_to_harness(&home, "gamma", HarnessId::Gemini, SyncMethod::Copy).unwrap();
        // 旧文件应被替换
        assert!(dest.join("SKILL.md").exists());
        assert!(!dest.join("stale.txt").exists());
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn missing_ssot_fails() {
        let home = tmp_home();
        let err = dispatch_to_harness(&home, "nope", HarnessId::Claude, SyncMethod::Auto).unwrap_err();
        assert!(matches!(err, DispatchError::SsotMissing(_)));
        let _ = std::fs::remove_dir_all(&home);
    }
}
