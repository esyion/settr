//! panic 崩溃留痕(infrastructure 适配器)。
//!
//! release 构建配置 `panic = "abort"`,进程崩溃前默认 hook 的输出可能丢失;
//! 安装 panic hook,把崩溃信息以追加方式写入日志目录 panic.log,便于用户
//! 回故障时提供现场。写入尽力而为,任何失败都不得再引发 panic。

use std::io::Write;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, Runtime};

/// panic 记录文件名,与日志插件同目录存放。
const PANIC_LOG_FILE: &str = "panic.log";

/// panic.log 超过该字节数时重建,避免无限增长。
const MAX_PANIC_LOG_BYTES: u64 = 1024 * 1024;

/**
 * 安装全局 panic hook:崩溃信息追加写入日志目录并同步 log 插件。
 * <p>
 * 应在应用启动流程最早期调用一次;保留先前 hook 并在记录后调用,
 * 保持默认 stderr 输出与潜在第三方 hook 的行为。
 */
pub fn install_panic_hook<R: Runtime>(app: &AppHandle<R>) {
    let log_dir = app.path().app_log_dir().ok();
    let previous_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        if let Some(log_dir) = log_dir.as_ref() {
            let message = info.to_string();
            // 崩溃路径上尽力而为:写失败仅走 stderr,绝不再 panic。
            if let Err(error) = append_entry(log_dir, &message, MAX_PANIC_LOG_BYTES) {
                eprintln!("写入 panic 记录失败: {error}");
            }
        }
        log::error!("应用发生 panic: {info}");
        previous_hook(info);
    }));
}

/**
 * 追加一条 panic 记录到 dir/panic.log。
 * <p>
 * 行格式:`[unix 秒时间戳] 崩溃信息`;现有文件超过 max_bytes 时先重建,
 * 只保留最新记录。目录不存在时自动创建。供 install_panic_hook 与测试使用,
 * 错误直接上抛由调用方兜底。
 */
pub fn append_entry(dir: &Path, message: &str, max_bytes: u64) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let file_path = dir.join(PANIC_LOG_FILE);
    if std::fs::metadata(&file_path)
        .map(|meta| meta.len() >= max_bytes)
        .unwrap_or(false)
    {
        std::fs::remove_file(&file_path)?;
    }
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file_path)?;
    writeln!(file, "[{timestamp}] {message}")
}

#[cfg(test)]
mod tests {
    use super::append_entry;
    use std::fs;
    use std::path::PathBuf;
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

    /// 连续两次追加应产生两行带时间戳的记录。
    #[test]
    fn appends_lines() {
        let dir = temp_dir();
        append_entry(&dir, "panic one", 1024).expect("追加失败");
        append_entry(&dir, "panic two", 1024).expect("追加失败");
        let content = fs::read_to_string(dir.join("panic.log")).expect("读取失败");
        let lines: Vec<&str> = content.lines().collect();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].ends_with("panic one"));
        assert!(lines[1].ends_with("panic two"));
        fs::remove_dir_all(&dir).ok();
    }

    /// 超过大小上限时应重建文件,只保留最新一条。
    #[test]
    fn rebuilds_file_when_over_cap() {
        let dir = temp_dir();
        append_entry(&dir, "old large entry padding", 16).expect("追加失败");
        append_entry(&dir, "new entry", 16).expect("追加失败");
        let content = fs::read_to_string(dir.join("panic.log")).expect("读取失败");
        assert_eq!(content.lines().count(), 1);
        assert!(content.ends_with("new entry\n"));
        fs::remove_dir_all(&dir).ok();
    }

    /// 目录不存在时自动创建(含多级)。
    #[test]
    fn creates_missing_dir() {
        let dir = temp_dir().join("nested/panic-dir");
        append_entry(&dir, "boom", 1024).expect("追加失败");
        assert!(dir.join("panic.log").exists());
        fs::remove_dir_all(dir).ok();
    }
}
