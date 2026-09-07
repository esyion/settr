//! 共享文件系统工具函数。
//!
//! 供 skill_extractor 与 skill_dispatcher 复用,避免重复实现递归复制。

use std::io;
use std::path::Path;

/// 递归复制目录(跟随源 symlink 的 target)。
pub fn copy_dir_recursive(src: &Path, dest: &Path) -> io::Result<()> {
    std::fs::create_dir_all(dest)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dest_path = dest.join(entry.file_name());
        let ft = entry.file_type()?;
        if ft.is_dir() {
            copy_dir_recursive(&src_path, &dest_path)?;
        } else if ft.is_symlink() {
            #[cfg(unix)]
            {
                let target = std::fs::read_link(&src_path)?;
                std::os::unix::fs::symlink(&target, &dest_path)?;
            }
            #[cfg(windows)]
            {
                let target = std::fs::read_link(&src_path)?;
                std::os::windows::fs::symlink_file(&target, &dest_path)?;
            }
        } else {
            std::fs::copy(&src_path, &dest_path)?;
        }
    }
    Ok(())
}
