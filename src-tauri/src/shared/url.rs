//! 后端地址校验规则(单一来源)。
//!
//! HTTPS-only 规则:生产环境必须使用 https;http 仅允许 localhost/127.0.0.1/::1,
//! 供本地调试。网络层(infrastructure::api)与设置用例(application::settings)
//! 共用本模块,避免规则在多处复制后漂移。

use reqwest::Url;

/**
 * 校验并归一化后端 API base URL。
 * <p>
 * 返回去掉尾部斜杠的归一化地址;非法格式或违反 HTTPS 规则时返回稳定中文错误文案。
 */
pub fn validate_backend_base_url(raw: &str) -> Result<String, String> {
    let base = raw.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("后端地址不能为空".to_string());
    }
    let parsed = Url::parse(base).map_err(|_| "后端地址格式不合法".to_string())?;
    // Url::host_str() 对 IPv6 返回带方括号形式(如 "[::1]"),先剥掉再匹配。
    let host = parsed
        .host_str()
        .unwrap_or_default()
        .trim_start_matches('[')
        .trim_end_matches(']');
    let is_local_http =
        parsed.scheme() == "http" && matches!(host, "localhost" | "127.0.0.1" | "::1");
    if parsed.scheme() != "https" && !is_local_http {
        return Err("后端地址必须使用 HTTPS；HTTP 仅允许本机 localhost 调试".to_string());
    }
    Ok(base.to_string())
}

#[cfg(test)]
mod tests {
    use super::validate_backend_base_url;

    /// HTTPS 地址合法且尾部斜杠被归一化。
    #[test]
    fn accepts_https_and_trims_trailing_slash() {
        assert_eq!(
            validate_backend_base_url("https://api.example.com/"),
            Ok("https://api.example.com".to_string())
        );
    }

    /// HTTP 仅允许 localhost/127.0.0.1/::1 本机调试。
    #[test]
    fn accepts_local_http_only() {
        assert!(validate_backend_base_url("http://localhost:19999").is_ok());
        assert!(validate_backend_base_url("http://127.0.0.1:19999").is_ok());
        assert!(validate_backend_base_url("http://[::1]:19999").is_ok());
    }

    /// 非本机 HTTP 必须拒绝(生产 HTTPS-only 规则)。
    #[test]
    fn rejects_remote_http() {
        let result = validate_backend_base_url("http://api.example.com");
        assert!(result.is_err());
    }

    /// 空地址与非法格式必须拒绝,错误文案稳定。
    #[test]
    fn rejects_empty_and_malformed_input() {
        assert!(validate_backend_base_url("").is_err());
        assert!(validate_backend_base_url("   ").is_err());
        assert!(validate_backend_base_url("not-a-url").is_err());
        assert!(validate_backend_base_url("ftp://api.example.com").is_err());
    }

    /// 输入前后空白被容忍并裁剪。
    #[test]
    fn trims_surrounding_whitespace() {
        assert_eq!(
            validate_backend_base_url("  https://api.example.com  "),
            Ok("https://api.example.com".to_string())
        );
    }
}
