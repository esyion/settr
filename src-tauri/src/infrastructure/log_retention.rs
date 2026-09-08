//! 日志保留策略(infrastructure 适配器)。
//!
//! tauri-plugin-log 采用 KeepAll 轮转策略,单文件超限会滚动,但旧日志文件
//! 无限累积;应用启动时清理超过保留期的日志文件。单文件删除失败(如被
//! 其他进程占用)仅记录警告,不阻断启动。

use std::path::Path;
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Manager, Runtime};

/// 日志保留天数;最后修改时间早于该时长的日志文件在启动时清理。
const RETENTION_DAYS: u64 = 30;

/**
 * 清理应用日志目录中超期文件(尽力而为)。
 * <p>
 * 日志目录解析失败视为无日志可清,静默跳过;目录遍历失败记录警告。
 * 由应用启动流程调用,只处理日志目录内容,不触碰其他目录。
 */
pub fn cleanup_expired_logs<R: Runtime>(app: &AppHandle<R>) {
    let Ok(log_dir) = app.path().app_log_dir() else {
        return;
    };
    let Some(cutoff) = SystemTime::now().checked_sub(Duration::from_secs(RETENTION_DAYS * 86_400))
    else {
        return;
    };
    match delete_older_than(&log_dir, cutoff) {
        Ok(count) if count > 0 => log::info!("已清理 {count} 个超期日志文件"),
        Ok(_) => {}
        Err(error) => log::warn!("清理日志目录 {:?} 失败: {error}", log_dir),
    }
}

/**
 * 删除目录下最后修改时间早于 cutoff 的普通文件,返回删除数量。
 * <p>
 * 目录不存在视为无日志,返回 Ok(0);单个文件删除失败(被占用等)
 * 记录警告并继续处理后续文件。子目录一律跳过。
 */
pub fn delete_older_than(dir: &Path, cutoff: SystemTime) -> std::io::Result<usize> {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(0),
        Err(error) => return Err(error),
    };
    let mut deleted = 0;
    for entry in entries {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            continue;
        }
        if entry.metadata()?.modified()? < cutoff {
            match std::fs::remove_file(entry.path()) {
                Ok(()) => deleted += 1,
                Err(error) => {
                    log::warn!("删除超期日志文件 {:?} 失败: {error}", entry.path());
                }
            }
        }
    }
    Ok(deleted)
}

#[cfg(test)]
mod tests {
    use super::delete_older_than;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{Duration, SystemTime};
    use uuid::Uuid;

    /**
     * 构造唯一的临时目录,测试结束后整体清理。
     */
    fn temp_dir() -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("agents-plus-test-{}", Uuid::new_v4().simple()));
        fs::create_dir_all(&dir).expect("无法创建临时目录");
        dir
    }

    /// cutoff 在过去:新建文件视为未超期,应保留。
    #[test]
    fn keeps_recent_files() {
        let dir = temp_dir();
        fs::write(dir.join("agents-plus.log"), "new").expect("写入失败");
        let cutoff = SystemTime::now() - Duration::from_secs(3_600);
        let deleted = delete_older_than(&dir, cutoff).expect("清理失败");
        assert_eq!(deleted, 0);
        assert!(dir.join("agents-plus.log").exists());
        fs::remove_dir_all(&dir).ok();
    }

    /// cutoff 在未来:所有文件视为超期删除;子目录跳过。
    #[test]
    fn deletes_expired_files_and_skips_dirs() {
        let dir = temp_dir();
        fs::write(dir.join("agents-plus.log.1"), "old").expect("写入失败");
        fs::write(dir.join("agents-plus.log.2"), "old").expect("写入失败");
        fs::create_dir_all(dir.join("sub")).expect("创建子目录失败");
        let cutoff = SystemTime::now() + Duration::from_secs(3_600);
        let deleted = delete_older_than(&dir, cutoff).expect("清理失败");
        assert_eq!(deleted, 2);
        assert!(!dir.join("agents-plus.log.1").exists());
        assert!(!dir.join("agents-plus.log.2").exists());
        assert!(dir.join("sub").exists());
        fs::remove_dir_all(&dir).ok();
    }

    /// 目录不存在视为无日志可清,返回 Ok(0)。
    #[test]
    fn missing_dir_is_ok() {
        let dir = temp_dir().join("no-such-dir");
        let deleted = delete_older_than(&dir, SystemTime::now()).expect("不应报错");
        assert_eq!(deleted, 0);
    }
}
