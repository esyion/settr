use crate::domain::document_format::SUPPORTED_FORMATS;
use crate::infrastructure::local_paths::{
    document_directories, document_paths, ensure_document_parent,
};
use notify::{Event, RecommendedWatcher, RecursiveMode, Result as NotifyResult, Watcher};
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

/// Event emitted when any supported local rule document may have changed.
pub const LOCAL_FILE_CHANGED_EVENT: &str = "local-file-changed";

/// Owns the operating-system file watchers for supported local rule documents.
pub struct LocalFileWatcher {
    _watcher: Mutex<RecommendedWatcher>,
}

impl LocalFileWatcher {
    /// Starts watching every supported rule-document directory.
    pub fn start(app: &AppHandle) -> Result<Self, String> {
        for format in SUPPORTED_FORMATS {
            ensure_document_parent(format)?;
        }
        let documents = document_paths()?;
        let directories = document_directories()?;
        let app_handle = app.clone();
        let watched_documents = documents.clone();
        let mut watcher =
            notify::recommended_watcher(move |result: NotifyResult<Event>| match result {
                Ok(event) => {
                    if event_affects_documents(&watched_documents, &event.paths) {
                        if let Err(error) = app_handle.emit(LOCAL_FILE_CHANGED_EVENT, ()) {
                            eprintln!("发送本地文件变更事件失败: {error}");
                        }
                    }
                }
                Err(error) => {
                    eprintln!("本地文件监听失败: {error}");
                }
            })
            .map_err(|error| format!("无法初始化本地规则文件监听: {error}"))?;
        for directory in directories {
            watcher
                .watch(&directory, RecursiveMode::NonRecursive)
                .map_err(|error| format!("无法监听本地规则目录: {error}"))?;
        }
        Ok(Self {
            _watcher: Mutex::new(watcher),
        })
    }
}

/// Returns whether an operating-system event affects any supported document.
fn event_affects_documents(documents: &[PathBuf], paths: &[PathBuf]) -> bool {
    paths.iter().any(|path| {
        let normalized_path = normalize_path(path);
        documents.iter().any(|document| {
            let normalized_document = normalize_path(document);
            if paths_equal(&normalized_path, &normalized_document) {
                return true;
            }
            let Some(parent) = normalized_path.parent() else {
                return false;
            };
            let Some(document_parent) = normalized_document.parent() else {
                return false;
            };
            paths_equal(parent, document_parent)
                && normalized_path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| {
                        is_atomic_temporary_name(
                            name,
                            normalized_document
                                .file_name()
                                .and_then(|value| value.to_str())
                                .unwrap_or_default(),
                        )
                    })
        })
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
fn is_atomic_temporary_name(name: &str, document_name: &str) -> bool {
    name.starts_with(&format!(".{document_name}.tmp-"))
}

#[cfg(test)]
#[path = "local_watcher_test.rs"]
mod local_watcher_test;
