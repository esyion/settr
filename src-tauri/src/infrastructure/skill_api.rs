//! 客户端调服务端的 HTTP 客户端。
//!
//! 复用 {@code crate::infrastructure::api::request} 的路径白名单与 HTTPS 校验,
//! 所有响应按业务 envelope 解:{ ok: true, data: T }。

use serde::{Deserialize, Serialize};

/// 服务端返回的 skill 摘要(用于客户端列表)。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSummary {
    pub id: String,
    pub name: String,
    pub display_name: Option<String>,
    pub description: Option<String>,
    pub source_type: String,
    pub owner_scope: String,
    pub latest_version: Option<String>,
    pub has_update_available: bool,
}

/// 服务端返回的 skill 详情(用于客户端下载)。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDetail {
    pub id: String,
    pub name: String,
    pub latest_version_id: Option<String>,
    pub latest_version: Option<String>,
    pub content_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillVersionDetail {
    pub id: String,
    pub skill_id: String,
    pub version: String,
    pub content_hash: String,
    pub size_bytes: u64,
    pub changelog: Option<String>,
    pub download_url: Option<String>,
}

/// HTTP 客户端错误。
#[derive(Debug, thiserror::Error)]
pub enum SkillApiError {
    #[error("IPC 失败: {0}")]
    Ipc(String),
    #[error("业务错误: {message} (requestId={request_id:?})")]
    Business {
        message: String,
        request_id: Option<String>,
    },
    #[error("反序列化失败: {0}")]
    Decode(String),
}

/// 客户端 skill API(走 Tauri IPC → Rust api_request → 后端)。
pub struct SkillApiClient {
    pub base_url: String,
    pub access_token: String,
}

impl SkillApiClient {
    pub fn new(base_url: String, access_token: String) -> Self {
        Self {
            base_url,
            access_token,
        }
    }

    /// 拉取 skill 列表(scope=personal;org-scope 后续支持)。
    pub async fn list_skills(&self) -> Result<Vec<SkillSummary>, SkillApiError> {
        let body = serde_json::json!({ "scope": "personal", "size": 100 });
        let raw: serde_json::Value = self.get("/api/v1/skills", Some(body)).await?;
        let records = raw
            .get("records")
            .cloned()
            .unwrap_or(serde_json::Value::Null);
        serde_json::from_value(records).map_err(|e| SkillApiError::Decode(e.to_string()))
    }

    /// 拉取 skill 详情。
    pub async fn get_skill(&self, skill_id: &str) -> Result<SkillDetail, SkillApiError> {
        self.get(&format!("/api/v1/skills/{}", skill_id), None)
            .await
    }

    /// 拉取指定版本的详情(含 presigned download URL)。
    pub async fn get_version(
        &self,
        skill_id: &str,
        version: &str,
    ) -> Result<SkillVersionDetail, SkillApiError> {
        self.get(
            &format!("/api/v1/skills/{}/versions/{}", skill_id, version),
            None,
        )
        .await
    }

    async fn get<T: for<'de> Deserialize<'de>>(
        &self,
        path: &str,
        body: Option<serde_json::Value>,
    ) -> Result<T, SkillApiError> {
        let method = if body.is_some() { "POST" } else { "GET" };
        let req_id = uuid::Uuid::new_v4().to_string();
        let result = crate::infrastructure::api::request(
            self.base_url.clone(),
            method.to_string(),
            path.to_string(),
            body.map(|v| v.to_string()),
            Some(self.access_token.clone()),
            req_id,
        )
        .await
        .map_err(SkillApiError::Ipc)?;
        let parsed: serde_json::Value =
            serde_json::from_str(&result.body).map_err(|e| SkillApiError::Decode(e.to_string()))?;
        if parsed.get("code").and_then(|v| v.as_i64()).unwrap_or(-1) != 0 {
            let message = parsed
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("未知错误")
                .to_string();
            let request_id = parsed
                .get("requestId")
                .and_then(|v| v.as_str())
                .map(String::from);
            return Err(SkillApiError::Business {
                message,
                request_id,
            });
        }
        let data = parsed
            .get("data")
            .cloned()
            .unwrap_or(serde_json::Value::Null);
        serde_json::from_value(data).map_err(|e| SkillApiError::Decode(e.to_string()))
    }
}
