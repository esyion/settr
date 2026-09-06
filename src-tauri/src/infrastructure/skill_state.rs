//! skills-state.json 持久化与并发控制。
//!
//! 文件结构(与 spec §8 对齐):
//! {
//!   "version": 1,
//!   "skills": {
//!     "<skill_id>": {
//!       "enabledHarnesses": ["claude", "codex"],
//!       "syncMethodOverride": null,
//!       "lastSyncedVersion": "1.2.0",
//!       "lastInstallError": null
//!     }
//!   },
//!   "harnessOverrides": {},
//!   "globalSyncMethod": "auto"
//! }
//!
//! 并发:用 RwLock 保护 in-memory 状态,文件写采用"写到临时文件 + rename"原子替换。

use crate::domain::skill::SyncMethod;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::io::Write;
use std::path::Path;
use std::sync::RwLock;

const STATE_FORMAT_VERSION: u32 = 1;

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillStateEntry {
    pub enabled_harnesses: BTreeSet<String>,
    pub sync_method_override: Option<SyncMethod>,
    pub last_synced_version: Option<String>,
    pub last_install_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsState {
    pub version: u32,
    pub skills: BTreeMap<String, SkillStateEntry>,
    pub harness_overrides: BTreeMap<String, String>,
    #[serde(default)]
    pub global_sync_method: SyncMethod,
}

impl Default for SkillsState {
    fn default() -> Self {
        Self {
            version: STATE_FORMAT_VERSION,
            skills: BTreeMap::new(),
            harness_overrides: BTreeMap::new(),
            global_sync_method: SyncMethod::Auto,
        }
    }
}

/// 读写 skills-state.json 的并发安全句柄。
/// <p>
/// 内存中的 state 由 RwLock 保护;{@link #save} 走"写临时文件 + rename"避免半写。
pub struct SkillsStateStore {
    path: std::path::PathBuf,
    state: RwLock<SkillsState>,
}

impl SkillsStateStore {
    /// 从磁盘加载(若不存在则用默认空 state)。
    pub fn load(path: &Path) -> Result<Self, std::io::Error> {
        let state = if path.exists() {
            let raw = std::fs::read_to_string(path)?;
            serde_json::from_str::<SkillsState>(&raw).unwrap_or_default()
        } else {
            SkillsState::default()
        };
        Ok(Self {
            path: path.to_path_buf(),
            state: RwLock::new(state),
        })
    }

    /// 读快照(深拷贝避免与写者竞争)。
    pub fn snapshot(&self) -> SkillsState {
        self.state.read().unwrap().clone()
    }

    /// 写回磁盘(原子 rename)。
    pub fn save(&self) -> Result<(), std::io::Error> {
        let state = self.state.read().unwrap().clone();
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(&state).map_err(std::io::Error::other)?;
        // 临时文件 + rename
        let tmp = self.path.with_extension("json.tmp");
        {
            let mut f = std::fs::File::create(&tmp)?;
            f.write_all(json.as_bytes())?;
            f.sync_data()?;
        }
        std::fs::rename(&tmp, &self.path)?;
        Ok(())
    }

    /// 切换 skill × harness 的启用状态。
    /// <p>
    /// 返回是否真的有变化(用于上层决定是否触发实际 sync)。
    pub fn set_enabled(
        &self,
        skill_id: &str,
        harness: &str,
        enabled: bool,
    ) -> Result<bool, std::io::Error> {
        let changed;
        {
            let mut w = self.state.write().unwrap();
            let entry = w.skills.entry(skill_id.to_string()).or_default();
            let before = entry.enabled_harnesses.contains(harness);
            if enabled {
                entry.enabled_harnesses.insert(harness.to_string());
            } else {
                entry.enabled_harnesses.remove(harness);
            }
            changed = before != enabled;
        }
        if changed {
            self.save()?;
        }
        Ok(changed)
    }

    /// 更新最近同步版本与可选错误。
    pub fn record_sync(
        &self,
        skill_id: &str,
        version: Option<String>,
        error: Option<String>,
    ) -> Result<(), std::io::Error> {
        {
            let mut w = self.state.write().unwrap();
            let entry = w.skills.entry(skill_id.to_string()).or_default();
            if let Some(v) = version {
                entry.last_synced_version = Some(v);
            }
            entry.last_install_error = error;
        }
        self.save()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_state_path() -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "agents-plus-state-test-{}-{}",
            std::process::id(),
            uuid::Uuid::new_v4().simple()
        ))
    }

    #[test]
    fn load_default_when_missing() {
        let p = tmp_state_path();
        let store = SkillsStateStore::load(&p).unwrap();
        let snap = store.snapshot();
        assert_eq!(snap.version, 1);
        assert!(snap.skills.is_empty());
        assert_eq!(snap.global_sync_method, SyncMethod::Auto);
    }

    #[test]
    fn set_enabled_persists_to_disk() {
        let p = tmp_state_path();
        let store = SkillsStateStore::load(&p).unwrap();
        let changed = store.set_enabled("alpha", "claude", true).unwrap();
        assert!(changed);
        // 重新加载
        let reloaded = SkillsStateStore::load(&p).unwrap();
        let snap = reloaded.snapshot();
        assert!(snap.skills.get("alpha").unwrap().enabled_harnesses.contains("claude"));
    }

    #[test]
    fn record_sync_writes_version() {
        let p = tmp_state_path();
        let store = SkillsStateStore::load(&p).unwrap();
        store.record_sync("beta", Some("1.0.0".to_string()), None).unwrap();
        let snap = store.snapshot();
        assert_eq!(snap.skills.get("beta").unwrap().last_synced_version.as_deref(), Some("1.0.0"));
    }
}
