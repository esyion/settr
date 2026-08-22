use crate::infrastructure::api;

#[tauri::command]
pub async fn api_request(
    base_url: String,
    method: String,
    path: String,
    body: Option<String>,
    access_token: Option<String>,
    request_id: String,
) -> Result<api::ApiHttpResponse, String> {
    api::request(base_url, method, path, body, access_token, request_id).await
}
