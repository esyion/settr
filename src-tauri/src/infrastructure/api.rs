use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE};
use reqwest::{Client, Method, Url};
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
    let base = base_url.trim_end_matches('/');
    let parsed = Url::parse(base).map_err(|_| "后端地址格式不合法".to_string())?;
    let host = parsed.host_str().unwrap_or_default();
    let is_local_http =
        parsed.scheme() == "http" && matches!(host, "localhost" | "127.0.0.1" | "::1");
    if parsed.scheme() != "https" && !is_local_http {
        return Err("生产环境后端地址必须使用 HTTPS；HTTP 仅允许本机 localhost 调试".to_string());
    }
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
    let base = base_url.trim_end_matches('/');
    let parsed = Url::parse(base).map_err(|_| "后端地址格式不合法".to_string())?;
    let host = parsed.host_str().unwrap_or_default();
    let is_local_http =
        parsed.scheme() == "http" && matches!(host, "localhost" | "127.0.0.1" | "::1");
    if parsed.scheme() != "https" && !is_local_http {
        return Err("生产环境后端地址必须使用 HTTPS;HTTP 仅允许本机 localhost 调试".to_string());
    }
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



#[cfg(test)]
mod multipart_tests {
    use super::{build_multipart_body, MultipartPart};

    /// 校验 multipart body 结构:boundary、Content-Disposition、Content-Type、终结 boundary。
    #[test]
    fn multipart_body_format_is_well_formed() {
        let parts = vec![
            MultipartPart {
                name: "name".to_string(),
                filename: None,
                content_type: Some("text/plain; charset=utf-8".to_string()),
                data: b"my-skill".to_vec(),
            },
            MultipartPart {
                name: "zip".to_string(),
                filename: Some("skill.zip".to_string()),
                content_type: Some("application/zip".to_string()),
                data: vec![0x50, 0x4B, 0x03, 0x04],
            },
        ];
        let (body, boundary) = build_multipart_body(&parts);
        let text = String::from_utf8_lossy(&body);
        // boundary 必须出现在每段分隔符与终结符中
        assert!(text.contains(&format!("--{boundary}\r\n")));
        assert!(text.contains(&format!("--{boundary}--\r\n")));
        // Content-Disposition 含 name 与 filename
        assert!(text.contains("Content-Disposition: form-data; name=\"name\""));
        assert!(text.contains("Content-Disposition: form-data; name=\"zip\"; filename=\"skill.zip\""));
        // Content-Type 出现在 zip part
        assert!(text.contains("Content-Type: application/zip"));
        // body 实际字节包含 zip magic 与 my-skill 文本
        assert!(text.contains("my-skill"));
        assert!(body.windows(4).any(|w| w == [0x50, 0x4B, 0x03, 0x04]));
    }

    /// 纯文本 part 不带 filename 也应正常编码。
    #[test]
    fn multipart_text_part_without_filename() {
        let parts = vec![MultipartPart {
            name: "meta".to_string(),
            filename: None,
            content_type: Some("application/json".to_string()),
            data: br#"{"version":"1.0.0"}"#.to_vec(),
        }];
        let (body, boundary) = build_multipart_body(&parts);
        let text = String::from_utf8_lossy(&body);
        assert!(text.contains("name=\"meta\""));
        assert!(!text.contains("filename=\""));
        assert!(text.contains("Content-Type: application/json"));
        assert!(text.contains("{\"version\":\"1.0.0\"}"));
        // 终结 boundary
        assert!(text.ends_with(&format!("--{boundary}--\r\n")));
    }
}
