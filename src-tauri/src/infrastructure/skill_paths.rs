//! 本地 skill 路径工具。
//!
//! 单一事实源:所有 skill 相关路径都通过这里获取,避免散落硬编码。
//! SSOT = Single Source of Truth,所有分发路径都从 SSOT 拉取。

use std::path::{Path, PathBuf};

/// 客户端 skill 根目录(~/.agents-plus/skills/)。
pub fn ssot_root(home: &Path) -> PathBuf {
    home.join(".agents-plus").join("skills")
}

/// 单一 skill 的 SSOT 子目录(~/.agents-plus/skills/<name>)。
pub fn ssot_skill_dir(home: &Path, name: &str) -> PathBuf {
    ssot_root(home).join(name)
}

/// ZIP 缓存目录(~/.agents-plus/cache/skills/<id>/<version>.zip)。
pub fn cache_root(home: &Path) -> PathBuf {
    home.join(".agents-plus").join("cache").join("skills")
}

/// 单一 skill 的 ZIP 缓存文件。
pub fn cache_zip_path(home: &Path, skill_id: &str, version: &str) -> PathBuf {
    cache_root(home).join(skill_id).join(format!("{version}.zip"))
}

/// 客户端状态文件(~/.agents-plus/skills-state.json)。
pub fn state_file(home: &Path) -> PathBuf {
    home.join(".agents-plus").join("skills-state.json")
}

/// 测试用模块导出 helper。
pub fn ensure_dir(path: &Path) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths_relative_to_home() {
        let home = std::path::PathBuf::from("/home/u");
        assert_eq!(ssot_root(&home), std::path::PathBuf::from("/home/u/.agents-plus/skills"));
        assert_eq!(
            ssot_skill_dir(&home, "alpha"),
            std::path::PathBuf::from("/home/u/.agents-plus/skills/alpha")
        );
        assert_eq!(
            state_file(&home),
            std::path::PathBuf::from("/home/u/.agents-plus/skills-state.json")
        );
    }
}
