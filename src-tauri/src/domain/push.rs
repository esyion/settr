//! 推送领域层:与传输无关的纯算法(SSE 帧解析、重连退避策略)。
//!
//! 本模块保持纯 Rust:不读取环境变量、不访问网络、不依赖 Tauri 运行时,
//! 可脱离运行环境单测(SSE 协议规则见 WHATWG HTML 标准的 server-sent events 节)。

use std::time::Duration;

/// 重连退避基数(首次断线 1 秒后重试)。
pub const RECONNECT_BASE_DELAY: Duration = Duration::from_millis(1_000);
/// 重连退避上限(指数增长封顶 30 秒)。
pub const RECONNECT_MAX_DELAY: Duration = Duration::from_millis(30_000);
/// 退避抖动幅度:实际延迟在标称值 ±20% 内浮动,防止重连风暴同步。
pub const RECONNECT_JITTER_RATIO: f64 = 0.2;

/**
 * 一帧完整的 SSE 事件(以空行分隔的文本块)。
 */
#[derive(Debug, PartialEq, Eq)]
pub struct SseFrame {
    /// `event:` 字段声明的名称;未声明时为 None(默认消息)
    pub event: Option<String>,
    /// `data:` 字段内容(多行 data 以 \n 连接);注释行(:开头)不计入
    pub data: String,
}

/**
 * 从增量缓冲中解析出全部完整 SSE 帧,并把已消费部分从缓冲中移除。
 *
 * 以空行(\n\n)作为帧边界(仅支持 LF 分帧;对端为本项目后端,不产生
 * CRLF)。不完整帧(末尾无空行)保留在缓冲中等待后续 chunk。按 WHATWG
 * 规则:冒号开头的行是注释(心跳)直接忽略;多行 data 以 \n 连接;
 * `event:`/`data:` 字段名后允许一个可选空格。
 *
 * @param buffer 累积的原始字节文本,函数会就地消费已解析部分
 * @return 按到达顺序解析出的完整帧(可能为空)
 */
pub fn parse_sse_frames(buffer: &mut String) -> Vec<SseFrame> {
    let mut frames = Vec::new();
    // 以 \n\n 切分;find 不到说明没有完整帧,保留缓冲等下一个 chunk。
    while let Some(boundary) = buffer.find("\n\n") {
        let raw_frame: String = buffer.drain(..boundary + 2).collect();
        let mut event: Option<String> = None;
        let mut data_lines: Vec<String> = Vec::new();
        for line in raw_frame.lines() {
            if let Some(field) = line.strip_prefix("event:") {
                event = Some(field.strip_prefix(' ').unwrap_or(field).to_string());
            } else if let Some(field) = line.strip_prefix("data:") {
                data_lines.push(field.strip_prefix(' ').unwrap_or(field).to_string());
            }
            // 其余行(:注释、id:、retry:、未知字段)按协议忽略。
        }
        if !data_lines.is_empty() {
            frames.push(SseFrame {
                event,
                data: data_lines.join("\n"),
            });
        }
    }
    frames
}

/**
 * 计算第 attempt 次重连(从 1 计)的退避延迟。
 *
 * 标称延迟为指数增长:1s、2s、4s、…,封顶 30s;再叠加 [0,1) 的 jitter
 * 随机量产生 ±20% 浮动,避免大量客户端同时重连。
 *
 * @param attempt 重试次数,从 1 计;0 会被视为 1
 * @param jitter  [0,1) 区间的随机量(由调用方提供,保证纯函数可测)
 * @return 本次重连前的等待时长
 */
pub fn reconnect_delay(attempt: u32, jitter: f64) -> Duration {
    let attempt = attempt.max(1);
    let nominal_ms = RECONNECT_BASE_DELAY
        .as_millis()
        .saturating_mul(1u128 << (attempt - 1).min(16));
    let capped_ms = nominal_ms.min(RECONNECT_MAX_DELAY.as_millis());
    let clamped_jitter = jitter.clamp(0.0, 1.0);
    // jitter<0.5 → 向下浮动,jitter>0.5 → 向上浮动,幅度 20%。
    let scaled = capped_ms as f64 * (1.0 + (clamped_jitter - 0.5) * 2.0 * RECONNECT_JITTER_RATIO);
    Duration::from_millis(scaled.max(0.0) as u64)
}

#[cfg(test)]
mod tests {
    use super::{parse_sse_frames, reconnect_delay, Duration, RECONNECT_MAX_DELAY};

    /// 解析完整帧:event 与 data 字段均带可选空格。
    #[test]
    fn parses_event_and_data_with_optional_space() {
        let mut buffer = String::from("event: org-change\ndata: {\"a\":1}\n\n");
        let frames = parse_sse_frames(&mut buffer);
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0].event.as_deref(), Some("org-change"));
        assert_eq!(frames[0].data, "{\"a\":1}");
        assert!(buffer.is_empty());
    }

    /// 心跳注释帧(:hb)被忽略,不产出帧但消费字节。
    #[test]
    fn ignores_comment_only_frames() {
        let mut buffer = String::from(":hb\n\n");
        let frames = parse_sse_frames(&mut buffer);
        assert!(frames.is_empty());
        assert!(buffer.is_empty());
    }

    /// 不完整帧保留在缓冲中,后续 chunk 补齐后可解析。
    #[test]
    fn keeps_partial_frame_in_buffer() {
        let mut buffer = String::from("event: init\ndata: {\"ch");
        assert!(parse_sse_frames(&mut buffer).is_empty());
        buffer.push_str("angeId\":\"5\"}\n\n");
        let frames = parse_sse_frames(&mut buffer);
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0].event.as_deref(), Some("init"));
    }

    /// 多行 data 以 \n 连接;一次可解析多帧;无 event 字段的帧 event 为 None。
    #[test]
    fn parses_multi_line_data_and_multiple_frames() {
        let mut buffer = String::from("data: a\ndata: b\n\ndata: only\n\n");
        let frames = parse_sse_frames(&mut buffer);
        assert_eq!(frames.len(), 2);
        assert_eq!(frames[0].data, "a\nb");
        assert_eq!(frames[0].event, None);
        assert_eq!(frames[1].data, "only");
    }

    /// 首次重连约 1 秒,±20% 抖动生效。
    #[test]
    fn first_reconnect_is_about_one_second() {
        let low = reconnect_delay(1, 0.0);
        let high = reconnect_delay(1, 1.0);
        assert_eq!(low, Duration::from_millis(800));
        assert_eq!(high, Duration::from_millis(1_200));
    }

    /// 指数退避封顶 30 秒;0 视为 1。
    #[test]
    fn reconnect_caps_at_thirty_seconds() {
        let capped = reconnect_delay(10, 0.5);
        let zero_attempt = reconnect_delay(0, 0.5);
        assert_eq!(capped, RECONNECT_MAX_DELAY);
        assert_eq!(zero_attempt, Duration::from_millis(1_000));
    }
}
