use serde::Serialize;
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;
use uuid::Uuid;

pub fn replace_file(source: &Path, destination: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::{
            MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
        };
        let source_wide: Vec<u16> = source
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let destination_wide: Vec<u16> = destination
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let replaced = unsafe {
            MoveFileExW(
                source_wide.as_ptr(),
                destination_wide.as_ptr(),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        };
        if replaced == 0 {
            return Err(format!(
                "无法完成本地文件原子替换: {}",
                std::io::Error::last_os_error()
            ));
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        fs::rename(source, destination)
            .map_err(|error| format!("无法完成本地文件原子替换: {error}"))
    }
}

pub fn write_json_atomically(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| "本地路径无效".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("无法创建本地目录: {error}"))?;
    let temp_path = parent.join(format!(
        ".{}.tmp-{}",
        path.file_name().unwrap_or_default().to_string_lossy(),
        Uuid::new_v4().simple()
    ));
    let serialized = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("无法序列化本地元数据: {error}"))?;
    {
        let mut file =
            File::create(&temp_path).map_err(|error| format!("无法写入本地临时文件: {error}"))?;
        file.write_all(&serialized)
            .map_err(|error| format!("无法写入本地元数据: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("无法持久化本地元数据: {error}"))?;
    }
    replace_file(&temp_path, path)
}
