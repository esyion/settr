use crate::infrastructure::local_paths::document_path;
use notify::{Event, RecommendedWatcher, RecursiveMode, Result as NotifyResult, Watcher};
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

/// Event emitted when the primary local `AGENTS.md` may have changed.
pub const LOCAL_FILE_CHANGED_EVENT: &str = "local-file-changed";

/// Owns the operating-system file watcher for the current user's home directory.
pub struct LocalFileWatcher {
    _watcher: Mutex<RecommendedWatcher>,
}

impl LocalFileWatcher {
    /// Starts watching the user's home directory and emits changes for `AGENTS.md`.
    pub fn start(app: &AppHandle) -> Result<Self, String> {
        let primary_document = document_path()?;
        let watch_directory = primary_document
            .parent()
            .ok_or_else(|| "AGENTS.md 路径无效".to_string())?
            .to_path_buf();
        let app_handle = app.clone();
        let watched_document = primary_document.clone();
        let mut watcher =
            notify::recommended_watcher(move |result: NotifyResult<Event>| match result {
                Ok(event) => {
                    if event_affects_primary_document(&watched_document, &event.paths) {
                        if let Err(error) = app_handle.emit(LOCAL_FILE_CHANGED_EVENT, ()) {
                            eprintln!("发送本地文件变更事件失败: {error}");
                        }
                    }
                }
                Err(error) => {
                    eprintln!("本地文件监听失败: {error}");
                }
            })
            .map_err(|error| format!("无法初始化 AGENTS.md 文件监听: {error}"))?;
        watcher
            .watch(&watch_directory, RecursiveMode::NonRecursive)
            .map_err(|error| format!("无法监听用户主目录: {error}"))?;
        Ok(Self {
            _watcher: Mutex::new(watcher),
        })
    }
}

/// Returns whether an operating-system event path belongs to the primary document.
fn event_affects_primary_document(primary_document: &Path, paths: &[PathBuf]) -> bool {
    let normalized_primary = normalize_path(primary_document);
    paths.iter().any(|path| {
        let normalized_path = normalize_path(path);
        if paths_equal(&normalized_path, &normalized_primary) {
            return true;
        }
        let Some(parent) = normalized_path.parent() else {
            return false;
        };
        let Some(primary_parent) = normalized_primary.parent() else {
            return false;
        };
        paths_equal(parent, primary_parent)
            && normalized_path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(is_atomic_temporary_name)
    })
}

/// Normalizes path components without requiring the target file to exist.
fn normalize_path(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            Component::Prefix(_) | Component::RootDir | Component::Normal(_) => {
                normalized.push(component.as_os_str());
            }
        }
    }
    normalized
}

/// Compares normalized paths using the platform's case-sensitivity rules.
fn paths_equal(left: &Path, right: &Path) -> bool {
    #[cfg(windows)]
    {
        left.to_string_lossy()
            .eq_ignore_ascii_case(&right.to_string_lossy())
    }
    #[cfg(not(windows))]
    {
        left == right
    }
}

/// Returns whether a name is a temporary file created by atomic document replacement.
fn is_atomic_temporary_name(name: &str) -> bool {
    name.starts_with(".AGENTS.md.tmp-")
}

#[cfg(test)]
#[path = "local_watcher_test.rs"]
mod local_watcher_test;
