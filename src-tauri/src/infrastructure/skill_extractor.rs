//! Skill ZIP 解压器:把服务端返回的 ZIP 写到 SSOT 目录。
//!
//! 简化设计:与后端 SkillZipValidator 共享阈值(条目数/单文件大小),但仅做"必要校验 + 写入",
//! 任何条目/路径不合规立即整体失败回滚。

use crate::domain::skill::is_valid_skill_name;
use crate::infrastructure::fs_utils::copy_dir_recursive;
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
    #[error("ZIP 顶层目录结构非法: {0}")]
    InvalidStructure(String),
}

/// 解压结果。
#[derive(Debug)]
pub struct ExtractResult {
    pub target_dir: PathBuf,
    pub entry_count: usize,
    pub total_bytes: u64,
    /// ZIP 是否包含 SKILL.md;仅在测试中断言,非测试路径不读。
    #[allow(dead_code)]
    pub has_skill_md: bool,
}

/// 把 zip 字节流解压到 `ssot_skill_dir(home, name)`。
///
/// 解压策略:写到独立临时目录(不进 SSOT)→ 校验顶层恰好 1 个名为 name 的目录 →
/// 校验 inner 含 SKILL.md → 原子 rename inner 到 SSOT target。失败回滚 tmp,SSOT 不动。
pub fn extract_zip_to_ssot(
    home: &Path,
    name: &str,
    zip_bytes: &[u8],
) -> Result<ExtractResult, ExtractError> {
    if !is_valid_skill_name(name) {
        return Err(ExtractError::InvalidName(name.to_string()));
    }
    let target = ssot_skill_dir(home, name);

    // 临时目录:不进 SSOT 路径,避免 tmp/<name>/ 变成 SSOT 的多余嵌套
    let nonce = uuid::Uuid::new_v4().simple().to_string();
    let tmp_root = std::env::temp_dir().join(format!(
        "agents-plus-extract-{}-{}-{}",
        std::process::id(),
        nonce,
        name
    ));
    if tmp_root.exists() {
        let _ = std::fs::remove_dir_all(&tmp_root);
    }
    std::fs::create_dir_all(&tmp_root)?;

    // 解压到 tmp_root;失败回滚 tmp_root
    let extract = (|| -> Result<ExtractMeta, ExtractError> {
        let mut archive = ZipArchive::new(std::io::Cursor::new(zip_bytes))?;
        if archive.len() > MAX_ENTRIES {
            return Err(ExtractError::TooManyEntries {
                found: archive.len(),
                limit: MAX_ENTRIES,
            });
        }

        let mut total: u64 = 0;
        let mut entry_count: usize = 0;

        for i in 0..archive.len() {
            let mut entry = archive.by_index(i)?;
            entry_count += 1;
            let raw_name = entry.name().to_string();

            // 校验路径
            if raw_name.contains("..") || raw_name.starts_with('/') || raw_name.starts_with("\\") {
                return Err(ExtractError::UnsafePath(raw_name));
            }
            if raw_name.chars().any(|c| (c as u32) < 0x20) {
                return Err(ExtractError::UnsafePath(raw_name));
            }

            // 目标路径:tmp_root + raw_name(保留服务端校验过的单层前缀)
            let out_path = tmp_root.join(&raw_name);

            // 二次防越界:resolved 必须以 tmp_root 为根
            let canon_root = tmp_root.canonicalize().unwrap_or_else(|_| tmp_root.clone());
            if let Ok(canon_out) = out_path.canonicalize() {
                if !canon_out.starts_with(&canon_root) {
                    return Err(ExtractError::UnsafePath(raw_name));
                }
            } else if let Some(parent) = out_path.parent() {
                if !parent.starts_with(&tmp_root) {
                    return Err(ExtractError::UnsafePath(raw_name));
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
            let mut limited = entry.take(MAX_FILE_BYTES + 1);
            let n = std::io::copy(&mut limited, &mut out_file)?;
            if n > MAX_FILE_BYTES {
                return Err(ExtractError::FileTooLarge {
                    name: raw_name,
                    size: n,
                    limit: MAX_FILE_BYTES,
                });
            }
            total += n;
            if total > MAX_TOTAL_BYTES {
                return Err(ExtractError::TotalBytesExceeded {
                    found: total,
                    limit: MAX_TOTAL_BYTES,
                });
            }
        }

        Ok(ExtractMeta {
            entry_count,
            total_bytes: total,
        })
    })();

    match extract {
        Ok(meta) => match locate_and_validate_inner(&tmp_root, name) {
            Ok(inner) => {
                if target.exists() {
                    // 旧 SSOT 目录(如上次解压坏的)直接清掉
                    let _ = std::fs::remove_dir_all(&target);
                }
                if let Err(rename_err) = std::fs::rename(&inner, &target) {
                    // rename 失败(跨盘等)→ 退化为 copy + remove
                    if let Err(copy_err) = copy_dir_recursive(&inner, &target) {
                        let _ = std::fs::remove_dir_all(&tmp_root);
                        return Err(ExtractError::InvalidStructure(format!(
                            "rename inner -> SSOT 失败且 copy 兜底也失败: rename={}, copy={}",
                            rename_err, copy_err
                        )));
                    }
                    let _ = std::fs::remove_dir_all(&inner);
                }
                // tmp_root 现在应只剩空壳,清掉
                let _ = std::fs::remove_dir_all(&tmp_root);

                Ok(ExtractResult {
                    target_dir: target,
                    entry_count: meta.entry_count,
                    total_bytes: meta.total_bytes,
                    has_skill_md: true,
                })
            }
            Err(e) => {
                let _ = std::fs::remove_dir_all(&tmp_root);
                Err(e)
            }
        },
        Err(e) => {
            let _ = std::fs::remove_dir_all(&tmp_root);
            Err(e)
        }
    }
}

/// 在解压后的 tmp_root 下定位唯一顶层目录,且该目录必须名为 skill name,内含 SKILL.md。
fn locate_and_validate_inner(
    tmp_root: &Path,
    expected_name: &str,
) -> Result<PathBuf, ExtractError> {
    let read = match std::fs::read_dir(tmp_root) {
        Ok(r) => r,
        Err(e) => {
            return Err(ExtractError::InvalidStructure(format!(
                "读取 tmp_root 失败: {e}"
            )));
        }
    };

    let mut top_dirs: Vec<PathBuf> = Vec::new();
    let mut top_files: Vec<String> = Vec::new();
    for entry in read.flatten() {
        let p = entry.path();
        let ft = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        if ft.is_dir() {
            top_dirs.push(p);
        } else if ft.is_file() || ft.is_symlink() {
            top_files.push(entry.file_name().to_string_lossy().to_string());
        }
    }

    if !top_files.is_empty() {
        return Err(ExtractError::InvalidStructure(format!(
            "ZIP 顶层存在裸露文件:{:?};服务端应保证只有一个顶层目录",
            top_files
        )));
    }
    if top_dirs.len() != 1 {
        return Err(ExtractError::InvalidStructure(format!(
            "ZIP 顶层目录数必须为 1,实际为 {}",
            top_dirs.len()
        )));
    }

    let inner = top_dirs.into_iter().next().expect("len == 1 已校验");
    let inner_name = inner.file_name().and_then(|n| n.to_str()).unwrap_or("");
    if inner_name != expected_name {
        return Err(ExtractError::InvalidStructure(format!(
            "ZIP inner 目录名 '{}' 与 skill name '{}' 不一致",
            inner_name, expected_name
        )));
    }

    let skill_md = inner.join("SKILL.md");
    if !skill_md.is_file() {
        return Err(ExtractError::MissingSkillMd);
    }
    Ok(inner)
}

struct ExtractMeta {
    entry_count: usize,
    total_bytes: u64,
}
