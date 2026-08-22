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
