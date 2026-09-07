use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE};
use reqwest::{Client, Method};
use serde::Serialize;
use std::time::Duration;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiHttpResponse {
    pub status: u16,
    pub body: String,
    pub request_id: Option<String>,
}

pub async fn request(
    base_url: String,
    method: String,
    path: String,
    body: Option<String>,
    access_token: Option<String>,
    request_id: String,
) -> Result<ApiHttpResponse, String> {
    let method = method
        .parse::<Method>()
        .map_err(|_| "不支持的 HTTP 方法".to_string())?;
    if !path.starts_with("/api/v1/") {
        return Err("只允许访问 Agents Plus API 路径".to_string());
    }
    let base = crate::shared::url::validate_backend_base_url(&base_url)?;
    let url = format!("{base}{path}");
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .user_agent(concat!("Agents Plus/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|error| format!("无法初始化网络客户端: {error}"))?;
    let mut request = client
        .request(method, url)
        .header(ACCEPT, "application/json")
        .header("X-Request-Id", request_id)
        .header("Accept-Encoding", "gzip, br")
        .header(CONTENT_TYPE, "application/json");
    if let Some(token) = access_token.filter(|value| !value.is_empty()) {
        request = request.header(AUTHORIZATION, format!("Bearer {token}"));
    }
    if let Some(body) = body {
        request = request.body(body);
    }
    let response = request.send().await.map_err(|error| {
        if error.is_timeout() {
            "NETWORK_TIMEOUT:连接后端超时".to_string()
        } else {
            format!("NETWORK_ERROR:{error}")
        }
    })?;
    let status = response.status().as_u16();
    let response_request_id = response
        .headers()
        .get("X-Request-Id")
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let body = response
        .text()
        .await
        .map_err(|error| format!("无法读取后端响应: {error}"))?;
    Ok(ApiHttpResponse {
        status,
        body,
        request_id: response_request_id,
    })
}

/// Multipart 上传请求:服务端期望 multipart/form-data 包含一个或多个 part。
/// <p>
/// 当前 skill 业务只用到 zip + meta,但 DTO 通用化以支持后续。
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultipartPart {
    /// part 名称(如 "zip"、"meta"、"name")
    pub name: String,
    /// part 文件名(可选;二进制 part 必填,纯文本 part 可省略)
    pub filename: Option<String>,
    /// part MIME 类型(可选;二进制 part 必填,纯文本 part 可省略)
    pub content_type: Option<String>,
    /// part 字节内容(空 part 用空数组)
    pub data: Vec<u8>,
}

/// Multipart 上传:对 /api/v1/* 路径发起 multipart/form-data POST。
/// <p>
/// 复用 {@link request} 的大部分前置校验(路径白名单、HTTPS-only),只换 body 编码。
/// 手工拼装 multipart/form-data body,避免引入 reqwest::multipart 带来的 mime_guess 依赖。
/// <p>
/// 输出格式遵循 RFC 7578;boundary 由本函数生成并随 body 一起返回。
fn build_multipart_body(parts: &[MultipartPart]) -> (Vec<u8>, String) {
    use std::time::{SystemTime, UNIX_EPOCH};
    let boundary = format!(
        "----AgentsPlusBoundary{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    );
    let mut body: Vec<u8> = Vec::new();
    for part in parts {
        body.extend_from_slice(b"--");
        body.extend_from_slice(boundary.as_bytes());
        body.extend_from_slice(b"\r\n");
        body.extend_from_slice(b"Content-Disposition: form-data; name=\"");
        // name 不含特殊字符(后端/前端都校验)
        body.extend_from_slice(part.name.as_bytes());
        body.extend_from_slice(b"\"");
        if let Some(filename) = part.filename.as_deref() {
            body.extend_from_slice(b"; filename=\"");
            body.extend_from_slice(filename.as_bytes());
            body.extend_from_slice(b"\"");
        }
        body.extend_from_slice(b"\r\n");
        if let Some(ct) = part.content_type.as_deref() {
            body.extend_from_slice(b"Content-Type: ");
            body.extend_from_slice(ct.as_bytes());
            body.extend_from_slice(b"\r\n");
        }
        body.extend_from_slice(b"\r\n");
        body.extend_from_slice(&part.data);
        body.extend_from_slice(b"\r\n");
    }
    body.extend_from_slice(b"--");
    body.extend_from_slice(boundary.as_bytes());
    body.extend_from_slice(b"--\r\n");
    (body, boundary)
}

/// Multipart 上传:对 /api/v1/* 路径发起 multipart/form-data POST。
/// <p>
/// 复用 {@link request} 的大部分前置校验(路径白名单、HTTPS-only),只换 body 编码。
/// multipart 编码在本模块手写,避免引入额外 crate 依赖。
pub async fn upload_multipart(
    base_url: String,
    path: String,
    parts: Vec<MultipartPart>,
    access_token: Option<String>,
    request_id: String,
) -> Result<ApiHttpResponse, String> {
    if !path.starts_with("/api/v1/") {
        return Err("只允许访问 Agents Plus API 路径".to_string());
    }
    let base = crate::shared::url::validate_backend_base_url(&base_url)?;
    let url = format!("{base}{path}");

    let (body, boundary) = build_multipart_body(&parts);
    let content_type = format!("multipart/form-data; boundary={boundary}");

    let client = Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(120)) // 上传大文件需要更长超时
        .user_agent(concat!("Agents Plus/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|error| format!("无法初始化网络客户端: {error}"))?;
    let mut request = client
        .post(&url)
        .header(ACCEPT, "application/json")
        .header("X-Request-Id", &request_id)
        .header("Accept-Encoding", "gzip, br")
        .header(CONTENT_TYPE, &content_type)
        .body(body);
    if let Some(token) = access_token.filter(|value| !value.is_empty()) {
        request = request.header(AUTHORIZATION, format!("Bearer {token}"));
    }
    let response = request.send().await.map_err(|error| {
        if error.is_timeout() {
            "NETWORK_TIMEOUT:连接后端超时".to_string()
        } else {
            format!("NETWORK_ERROR:{error}")
        }
    })?;
    let status = response.status().as_u16();
    let response_request_id = response
        .headers()
        .get("X-Request-Id")
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let body = response
        .text()
        .await
        .map_err(|error| format!("无法读取后端响应: {error}"))?;
    Ok(ApiHttpResponse {
        status,
        body,
        request_id: response_request_id,
    })
}
