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

/// Multipart 上传到后端:接收一组 part,转发为 multipart/form-data POST。
/// <p>
/// 这是 {@link api_request} 的二进制伴侣:同一路径白名单与 HTTPS 校验逻辑,
/// 但支持任意 {@code content-type} 与二进制负载,供 skill ZIP 上传等场景使用。
#[tauri::command]
pub async fn api_upload(
    base_url: String,
    path: String,
    parts: Vec<api::MultipartPart>,
    access_token: Option<String>,
    request_id: String,
) -> Result<api::ApiHttpResponse, String> {
    api::upload_multipart(base_url, path, parts, access_token, request_id).await
}
