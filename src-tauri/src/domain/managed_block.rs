//! 组织策略托管区块(领域层纯函数)。
//!
//! 本地规则文档(~/AGENTS.md、~/.claude/CLAUDE.md)在逻辑上由两段组成:
//! 个人区(归 revision 同步链路所有)与托管区(归组织策略下发所有)。
//! 托管区以 HTML 注释标记包裹,由 compose 统一放在文件末尾:
//!
//! ```text
//! {个人内容}
//!
//! <!-- BEGIN:agents-plus-org -->
//! {组织策略内容}
//! <!-- END:agents-plus-org -->
//! ```
//!
//! 设计约束(AGENTS.md §5 显式数据契约):
//! - 同步链路(read_snapshot/apply_document)只读写个人区,托管区内容永不进入
//!   hash、revision 或三方合并,两条链路互不覆盖;
//! - compose/split 是收敛的:split(compose(P)) 之后再次 compose/split 结果不变,
//!   代价是首次应用策略时个人区可能被规范化为"以空行结尾";
//! - 标记必须独占一行,行尾允许 CR/LF 差异;BEGIN 未闭合时按普通个人内容处理。

/// 托管区块起始标记(独占一行)。
pub const BEGIN_MARKER: &str = "<!-- BEGIN:agents-plus-org -->";

/// 托管区块结束标记(独占一行)。
pub const END_MARKER: &str = "<!-- END:agents-plus-org -->";

/// split 的解析结果。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManagedSplit {
    /// 个人区:移除所有完整托管区块后的内容。
    pub personal: String,
    /// 第一个完整区块内的策略内容;文件中没有完整区块时为 None。
    pub policy: Option<String>,
}

/// 判断策略内容本身是否包含托管标记。
///
/// 组织策略内容若嵌入了标记字符串,会破坏区块解析,必须在应用前拒绝。
pub fn contains_managed_marker(policy: &str) -> bool {
    policy.contains(BEGIN_MARKER) || policy.contains(END_MARKER)
}

/// 逐行移除完整托管区块,并提取第一个完整区块的策略内容。
///
/// BEGIN 后找不到匹配 END 时,该片段按普通个人内容原样保留,不做任何删除。
/// 同一文件出现多个完整区块时全部移除(收敛到单区块布局),策略取第一个。
pub fn split(content: &str) -> ManagedSplit {
    let mut personal = String::with_capacity(content.len());
    let mut policy: Option<String> = None;
    let mut in_block = false;
    let mut block_body = String::new();
    for line in content.split_inclusive('\n') {
        let trimmed = line.trim_end_matches(['\r', '\n']).trim_end();
        if !in_block && trimmed == BEGIN_MARKER {
            in_block = true;
            block_body.clear();
            continue;
        }
        if in_block && trimmed == END_MARKER {
            in_block = false;
            if policy.is_none() {
                policy = Some(block_body.trim_end_matches(['\r', '\n']).to_string());
            }
            continue;
        }
        if in_block {
            block_body.push_str(line);
        } else {
            personal.push_str(line);
        }
    }
    if in_block {
        // 未闭合的 BEGIN 不是完整区块:标记行和已收集内容原样归还个人区。
        personal.push_str(BEGIN_MARKER);
        personal.push('\n');
        personal.push_str(&block_body);
    }
    ManagedSplit { personal, policy }
}

/// 把组织策略作为托管区块追加到个人区末尾。
///
/// - policy 为 None 或纯空白时不添加区块,个人区原样返回(用于撤回下发);
/// - 个人区先规范化为"单个换行结尾",再保证与区块之间恰好一个空行;
/// - 策略内容仅去除结尾换行,其余字节原样保留。
pub fn compose(personal: &str, policy: Option<&str>) -> String {
    let Some(policy) = policy.filter(|value| !value.trim().is_empty()) else {
        return personal.to_string();
    };
    let mut composed =
        String::with_capacity(personal.len() + policy.len() + BEGIN_MARKER.len() * 2);
    if !personal.is_empty() {
        if !personal.ends_with('\n') {
            composed.push_str(personal);
            composed.push('\n');
        } else {
            composed.push_str(personal);
        }
        if !composed.ends_with("\n\n") {
            composed.push('\n');
        }
    }
    composed.push_str(BEGIN_MARKER);
    composed.push('\n');
    composed.push_str(policy.trim_end_matches('\n'));
    composed.push('\n');
    composed.push_str(END_MARKER);
    composed.push('\n');
    composed
}

#[cfg(test)]
mod tests {
    use super::*;

    /** 无区块文件:个人区原样返回,policy 为 None。 */
    #[test]
    fn split_without_block_returns_content_as_personal() {
        let result = split("# 个人规范\n- 规则\n");
        assert_eq!(result.personal, "# 个人规范\n- 规则\n");
        assert_eq!(result.policy, None);
    }

    /** compose→split 往返:个人区只经历"换行+空行结尾"的规范化。 */
    #[test]
    fn split_after_compose_round_trips_personal() {
        let file = compose("个人内容\n", Some("组织策略"));
        let result = split(&file);
        assert_eq!(result.personal, "个人内容\n\n");
        assert_eq!(result.policy, Some("组织策略".to_string()));
        // 收敛:对 split 结果再 compose/split 不再变化。
        let again = split(&compose(&result.personal, Some("组织策略")));
        assert_eq!(again, result);
    }

    /** 个人区缺少结尾换行时,compose 规范化补齐一次。 */
    #[test]
    fn compose_normalizes_missing_trailing_newline() {
        let file = compose("个人内容", Some("组织策略"));
        let result = split(&file);
        assert_eq!(result.personal, "个人内容\n\n");
    }

    /** 空个人区:文件只包含托管区块。 */
    #[test]
    fn compose_with_empty_personal_writes_block_only() {
        let file = compose("", Some("组织策略"));
        assert_eq!(
            file,
            "<!-- BEGIN:agents-plus-org -->\n组织策略\n<!-- END:agents-plus-org -->\n"
        );
        let result = split(&file);
        assert_eq!(result.personal, "");
        assert_eq!(result.policy, Some("组织策略".to_string()));
    }

    /** policy 为 None 或空白:个人区原样返回(撤回下发语义)。 */
    #[test]
    fn compose_without_policy_returns_personal_unchanged() {
        assert_eq!(compose("个人内容\n", None), "个人内容\n");
        assert_eq!(compose("个人内容\n", Some("   \n")), "个人内容\n");
    }

    /** 空白 policy 的 split 语义:完整区块仍被移除。 */
    #[test]
    fn split_removes_block_even_when_policy_blank() {
        let file = "个人内容\n\n<!-- BEGIN:agents-plus-org -->\n\n<!-- END:agents-plus-org -->\n";
        let result = split(file);
        assert_eq!(result.personal, "个人内容\n\n");
        assert_eq!(result.policy, Some(String::new()));
    }

    /** 未闭合 BEGIN:按个人内容原样保留,不丢字节。 */
    #[test]
    fn split_keeps_unclosed_block_as_personal() {
        let content = "个人内容\n<!-- BEGIN:agents-plus-org -->\n未闭合内容\n";
        let result = split(content);
        assert_eq!(result.personal, content);
        assert_eq!(result.policy, None);
    }

    /** 多个完整区块全部移除,策略取第一个。 */
    #[test]
    fn split_removes_all_complete_blocks() {
        let block = |policy: &str| compose("", Some(policy));
        let content = format!("{}个人区\n{}", block("第一段"), block("第二段"));
        let result = split(&content);
        assert_eq!(result.personal, "个人区\n");
        assert_eq!(result.policy, Some("第一段".to_string()));
    }

    /** 策略内容包含标记时被 contains_managed_marker 拒绝。 */
    #[test]
    fn contains_managed_marker_detects_nested_markers() {
        assert!(contains_managed_marker(
            "x\n<!-- BEGIN:agents-plus-org -->\ny"
        ));
        assert!(contains_managed_marker("<!-- END:agents-plus-org -->"));
        assert!(!contains_managed_marker("正常策略内容"));
    }

    /** 标记行容忍 CRLF 与行尾空格。 */
    #[test]
    fn split_tolerates_crlf_and_trailing_spaces() {
        let content = "个人内容\r\n<!-- BEGIN:agents-plus-org --> \r\n策略\r\n<!-- END:agents-plus-org -->\r\n";
        let result = split(content);
        assert_eq!(result.personal, "个人内容\r\n");
        assert_eq!(result.policy, Some("策略".to_string()));
    }
}
