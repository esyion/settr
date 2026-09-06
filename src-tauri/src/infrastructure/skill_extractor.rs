//! Skill ZIP 解压器:把服务端返回的 ZIP 写到 SSOT 目录。
//!
//! 简化设计:与后端 SkillZipValidator 共享阈值(条目数/单文件大小),但仅做"必要校验 + 写入",
//! 任何条目/路径不合规立即整体失败回滚。

use crate::domain::skill::is_valid_skill_name;
use crate::infrastructure::skill_paths::{ensure_dir, ssot_skill_dir};
use std::io::Read;
use std::path::{Path, PathBuf};
use thiserror::Error;
use zip::ZipArchive;

const MAX_ENTRIES: usize = 10_000;
/// 解压后总字节上限(对齐后端 512 MB)。
const MAX_TOTAL_BYTES: u64 = 512 * 1024 * 1024;
/// 单文件大小上限(对齐后端 50 MB)。
const MAX_FILE_BYTES: u64 = 50 * 1024 * 1024;
/// symlink target 长度上限。
const MAX_SYMLINK_BYTES: u64 = 4 * 1024;

#[derive(Debug, Error)]
pub enum ExtractError {
    #[error("ZIP 读取失败: {0}")]
    Io(#[from] std::io::Error),
    #[error("ZIP 不是有效 zip 文件: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("skill name 非法: {0}")]
    InvalidName(String),
    #[error("ZIP 内不包含顶层 SKILL.md")]
    MissingSkillMd,
    #[error("ZIP 包含非法路径: {0}")]
    UnsafePath(String),
    #[error("ZIP 条目数超限({found} > {limit})")]
    TooManyEntries { found: usize, limit: usize },
    #[error("ZIP 解压后总字节超限({found} > {limit})")]
    TotalBytesExceeded { found: u64, limit: u64 },
    #[error("ZIP 内单文件超限: {name} ({size} > {limit})")]
    FileTooLarge { name: String, size: u64, limit: u64 },
    #[error("ZIP 包含符号链接 target 超长: {name}")]
    SymlinkTooLong { name: String },
}

/// 解压结果。
#[derive(Debug)]
pub struct ExtractResult {
    pub target_dir: PathBuf,
    pub entry_count: usize,
    pub total_bytes: u64,
    pub has_skill_md: bool,
}

/// 把 zip 字节流解压到 {@code ssot_skill_dir(home, name)}。
/// <p>
/// 解压策略:写到临时目录 + 原子 rename,失败回滚。
pub fn extract_zip_to_ssot(
    home: &Path,
    name: &str,
    zip_bytes: &[u8],
) -> Result<ExtractResult, ExtractError> {
    if !is_valid_skill_name(name) {
        return Err(ExtractError::InvalidName(name.to_string()));
    }
    let target = ssot_skill_dir(home, name);
    // 临时目录:target.<nonce>.<pid>,在成功后 rename 到 target
    let nonce = uuid::Uuid::new_v4().simple().to_string();
    let tmp = target.with_extension(format!("tmp.{}.{}", std::process::id(), nonce));
    if tmp.exists() {
        let _ = std::fs::remove_dir_all(&tmp);
    }
    std::fs::create_dir_all(&tmp)?;

    // 任何后续失败都需要回滚 tmp
    let result = (|| -> Result<ExtractResult, ExtractError> {
        let mut archive = ZipArchive::new(std::io::Cursor::new(zip_bytes))?;
        if archive.len() > MAX_ENTRIES {
            return Err(ExtractError::TooManyEntries {
                found: archive.len(),
                limit: MAX_ENTRIES,
            });
        }

        let mut total: u64 = 0;
        let mut entry_count: usize = 0;
        let mut has_skill_md = false;

        for i in 0..archive.len() {
            let mut entry = archive.by_index(i)?;
            entry_count += 1;
            let raw_name = entry.name().to_string();

            // 校验路径
            if raw_name.contains("..") || raw_name.starts_with('/') || raw_name.starts_with("\\") {
                return Err(ExtractError::UnsafePath(raw_name));
            }
            // 控制字符(防 zip slip)
            if raw_name.chars().any(|c| (c as u32) < 0x20) {
                return Err(ExtractError::UnsafePath(raw_name));
            }

            // 处理 symlink 条目(JDK ZipEntry 无 unix mode,标准库不暴露;
            // 简化:仅看 entry.symlink_target 是否 Some,若有则校验 target 长度)

            // 目标路径
            let rel = PathBuf::from(&raw_name);
            let out_path = tmp.join(&rel);

            // 二次防越界:resolved 必须以 tmp 为根
            let canon_tmp = tmp.canonicalize().unwrap_or_else(|_| tmp.clone());
            if let Ok(canon_out) = out_path.canonicalize() {
                if !canon_out.starts_with(&canon_tmp) {
                    return Err(ExtractError::UnsafePath(raw_name));
                }
            } else {
                // 文件还不存在(尚未创建),用父目录 + 自身重新拼一个等价"解析后"路径
                if let Some(parent) = out_path.parent() {
                    if !parent.starts_with(&tmp) {
                        return Err(ExtractError::UnsafePath(raw_name));
                    }
                }
            }

            if entry.is_dir() {
                std::fs::create_dir_all(&out_path)?;
                continue;
            }
            // 符号链接检测:读 unix 模式位(0xA000 = S_IFLNK)
            let is_symlink = entry
                .unix_mode()
                .map(|m| (m & 0xF000) == 0xA000)
                .unwrap_or(false);
            if is_symlink {
                let mut buf = Vec::new();
                entry.read_to_end(&mut buf)?;
                if buf.len() as u64 > MAX_SYMLINK_BYTES {
                    return Err(ExtractError::SymlinkTooLong { name: raw_name });
                }
                ensure_dir(&out_path)?;
                let target_str = String::from_utf8_lossy(&buf).to_string();
                if target_str.contains("..") || target_str.starts_with('/') {
                    return Err(ExtractError::UnsafePath(raw_name));
                }
                #[cfg(unix)]
                {
                    std::os::unix::fs::symlink(&target_str, &out_path)?;
                }
                #[cfg(windows)]
                {
                    std::os::windows::fs::symlink_file(&target_str, &out_path)?;
                }
                continue;
            }

            // 普通文件
            let declared_size = entry.size();
            if declared_size > MAX_FILE_BYTES {
                return Err(ExtractError::FileTooLarge {
                    name: raw_name,
                    size: declared_size,
                    limit: MAX_FILE_BYTES,
                });
            }
            ensure_dir(&out_path)?;
            let mut out_file = std::fs::File::create(&out_path)?;
            let mut copied: u64 = 0;
            // 限制解压字节
            let mut limited = entry.take(MAX_FILE_BYTES + 1);
            let n = std::io::copy(&mut limited, &mut out_file)?;
            copied = n;
            if copied > MAX_FILE_BYTES {
                return Err(ExtractError::FileTooLarge {
                    name: raw_name,
                    size: copied,
                    limit: MAX_FILE_BYTES,
                });
            }
            total += copied;
            if total > MAX_TOTAL_BYTES {
                return Err(ExtractError::TotalBytesExceeded {
                    found: total,
                    limit: MAX_TOTAL_BYTES,
                });
            }

            // 顶层 SKILL.md 检测(去前导目录后 basename == SKILL.md)
            let normalized = raw_name.replace('\\', "/");
            let last = normalized.rsplit('/').next().unwrap_or("");
            if last == "SKILL.md" && normalized.matches('/').count() <= 1 {
                has_skill_md = true;
            }
        }

        if !has_skill_md {
            return Err(ExtractError::MissingSkillMd);
        }

        Ok(ExtractResult {
            target_dir: target.clone(),
            entry_count,
            total_bytes: total,
            has_skill_md,
        })
    })();

    match result {
        Ok(r) => {
            // 原子 rename 替换旧目录
            if target.exists() {
                let _ = std::fs::remove_dir_all(&target);
            }
            std::fs::rename(&tmp, &target)?;
            Ok(r)
        }
        Err(e) => {
            let _ = std::fs::remove_dir_all(&tmp);
            Err(e)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn build_zip(entries: &[(&str, &[u8])]) -> Vec<u8> {
        use std::io::Write;
        let mut out = Vec::new();
        {
            let cursor = std::io::Cursor::new(&mut out);
            let mut zip = zip::ZipWriter::new(cursor);
            let opts = zip::write::FileOptions::default()
                .compression_method(zip::CompressionMethod::Stored);
            for (name, data) in entries {
                zip.start_file(*name, opts).unwrap();
                zip.write_all(data).unwrap();
            }
            zip.finish().unwrap();
        }
        out
    }

    fn tmp_home() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "agents-plus-extract-test-{}-{}",
            std::process::id(),
            uuid::Uuid::new_v4().simple()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn valid_zip_with_skill_md_passes() {
        let zip = build_zip(&[
            ("alpha/", b""),
            ("alpha/SKILL.md", b"# alpha skill"),
            ("alpha/assets/icon.svg", b"<svg/>"),
        ]);
        let home = tmp_home();
        let r = extract_zip_to_ssot(&home, "alpha", &zip).unwrap();
        assert!(r.has_skill_md);
        assert!(r.target_dir.exists());
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn missing_skill_md_fails() {
        let zip = build_zip(&[
            ("alpha/", b""),
            ("alpha/README.md", b"# r"),
        ]);
        let home = tmp_home();
        let err = extract_zip_to_ssot(&home, "alpha", &zip).unwrap_err();
        assert!(matches!(err, ExtractError::MissingSkillMd));
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn invalid_name_rejected() {
        let zip = build_zip(&[("alpha/SKILL.md", b"x")]);
        let home = tmp_home();
        let err = extract_zip_to_ssot(&home, "BadName", &zip).unwrap_err();
        assert!(matches!(err, ExtractError::InvalidName(_)));
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn path_traversal_rejected() {
        let zip = build_zip(&[("alpha/../etc/passwd", b"x")]);
        let home = tmp_home();
        let err = extract_zip_to_ssot(&home, "alpha", &zip).unwrap_err();
        // 顶层只有一个目录 + ../ 在子段 → UnsafePath
        assert!(matches!(err, ExtractError::UnsafePath(_)));
        let _ = std::fs::remove_dir_all(&home);
    }
}
