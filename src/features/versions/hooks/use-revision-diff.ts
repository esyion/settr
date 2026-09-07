import { useEffect, useState } from "react";
import type { DiffFile } from "@git-diff-view/file";
import type { DocumentFormat, Revision } from "@/lib/contracts";
import { getDocumentFormatConfig } from "@/lib/document-formats";

export interface DiffState {
  key: string;
  file: DiffFile | null;
  error: string | null;
  loading: boolean;
}

/**
 * Builds and disposes the open-source unified diff when its inputs change.
 * Extracted from Versions to keep the component under the 300-line limit.
 */
export function useRevisionDiff(
  format: DocumentFormat,
  selected: Revision | null,
  localContent: string | undefined,
): DiffState | null {
  const formatConfig = getDocumentFormatConfig(format);
  const diffKey =
    selected && localContent !== null && localContent !== undefined
      ? `${formatConfig.label}:${selected.id}:${localContent.length}`
      : null;
  const [diffState, setDiffState] = useState<DiffState | null>(null);

  useEffect(() => {
    if (!diffKey || !selected || localContent === null || localContent === undefined) {
      // 不在 effect 中同步 setState;返回 null 由下方返回逻辑直接派生。
      return;
    }
    let active = true;
    let generated: DiffFile | null = null;
    // 订阅外部模块加载结果,通过 setState 反馈(在异步回调内 setState 符合 hook 规则)。
    void Promise.resolve()
      .then(() => {
        if (!active) return null;
        // 切到 loading 状态:作为订阅外部系统更新的一部分。
        setDiffState({ key: diffKey, file: null, error: null, loading: true });
        return import("@git-diff-view/file");
      })
      .then((module) => {
        if (!module || !active) return;
        generated = module.generateDiffFile(
          `local/${formatConfig.label}`,
          localContent,
          `revision/${selected.id}/${formatConfig.label}`,
          selected.content,
          "markdown",
          "markdown",
        );
        generated.initTheme("light");
        generated.init();
        generated.buildUnifiedDiffLines();
        setDiffState({ key: diffKey, file: generated, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (active) {
          setDiffState({
            key: diffKey,
            file: null,
            error: error instanceof Error ? error.message : "无法生成 Unified Diff",
            loading: false,
          });
        }
      });
    return () => {
      active = false;
      generated?.clear();
    };
  }, [diffKey, formatConfig.label, localContent, selected]);

  // 没有有效 diffKey 时返回 null;否则返回最近一次的 DiffState(loading/error 由调用方展示)。
  if (!diffKey) return null;
  return diffState;
}
