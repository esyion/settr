use crate::infrastructure::api;

/// 通用后端 HTTP 入口:前端所有普通 JSON 请求都走这里。
/// <p>
/// 与 {@code api_upload} 走同一条路径白名单(/api/v1/*)与 HTTPS 校验,
/// 不接收 multipart 负载;multipart 请用 {@link api_upload}。
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
