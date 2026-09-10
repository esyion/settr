import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Versions } from "@/features/versions/components/versions";
import { api } from "@/lib/api-client";
import { copyTextToClipboard } from "@/services/clipboard";
import { toast } from "sonner";
import type { Revision, SyncState } from "@/lib/contracts";

/**
 * Versions 复制内容回归测试。
 *
 * <p>回归背景：旧实现直接 navigator.clipboard?.writeText 散落在组件里，
 * 违反 AGENTS.md §4.1 插件调用集中收口，且静默吞掉失败；
 * 修复后应走 services/clipboard 的 copyTextToClipboard 并用 toast 兜底。
 */

vi.mock("@/lib/api-client", () => ({
  api: { revision: vi.fn() },
}));

vi.mock("@/services/clipboard", () => ({
  copyTextToClipboard: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/features/versions/hooks/use-revision-diff", () => ({
  useRevisionDiff: () => null,
}));

vi.mock("@/features/versions/components/diff-viewer", () => ({
  DiffViewer: () => <div data-testid="diff-viewer" />,
  DiffUnavailable: () => <div data-testid="diff-unavailable" />,
}));

const REVISION_CONTENT = "# AGENTS.md\n初始版本内容";

const revision: Revision = {
  id: "rev-1",
  documentId: "doc-1",
  parentRevisionId: null,
  deviceId: "device-1",
  content: REVISION_CONTENT,
  contentHash: "hash-0001",
  message: "初始版本",
  restoredFromRevisionId: null,
  createdAt: "2026-09-01T08:00:00Z",
};

/** 组装仅含一条版本记录的最小同步状态，供 Versions 渲染版本列表。 */
function makeState(): SyncState {
  return {
    status: "synced",
    format: "agentsMd",
    local: null,
    identity: null,
    user: null,
    document: {
      id: "doc-1",
      documentType: "AGENTS_MD",
      headRevisionId: "rev-1",
      createdAt: "2026-09-01T07:00:00Z",
      updatedAt: "2026-09-01T08:00:00Z",
    },
    head: null,
    base: null,
    devices: null,
    revisions: {
      records: [revision],
      page: 1,
      pageSize: 20,
      total: 1,
      pages: 1,
    },
    message: null,
    requestId: null,
    refreshedAt: null,
  };
}

/** 选中首条版本并等待详情加载完成，返回复制按钮。 */
async function selectRevision() {
  render(<Versions state={makeState()} busy={null} onRestore={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /初始版本/ }));
  await waitFor(() => {
    expect(api.revision).toHaveBeenCalledWith("doc-1", "rev-1");
  });
  return await screen.findByRole("button", { name: /复制内容/ });
}

// 注入浏览器原生剪贴板 spy：组件必须收口到统一服务，不允许散落调用。
const nativeClipboardWrite = vi.fn();

describe("Versions 复制内容", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.revision).mockResolvedValue(revision);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: nativeClipboardWrite },
      configurable: true,
    });
  });

  afterEach(() => {
    delete (navigator as { clipboard?: unknown }).clipboard;
  });

  it("点击复制：走统一剪贴板服务写入选中版本内容并成功提示", async () => {
    vi.mocked(copyTextToClipboard).mockResolvedValue(undefined);
    const copyButton = await selectRevision();

    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(copyTextToClipboard).toHaveBeenCalledWith(REVISION_CONTENT);
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("版本内容已复制");
    });
    // 回归断言：不得直接调用浏览器原生 clipboard API（旧实现在此必红）。
    expect(nativeClipboardWrite).not.toHaveBeenCalled();
  });

  it("复制失败：toast 兜底提示错误，不静默吞错", async () => {
    vi.mocked(copyTextToClipboard).mockRejectedValueOnce(
      new Error("剪贴板不可用"),
    );
    const copyButton = await selectRevision();

    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("剪贴板不可用");
    });
    expect(toast.success).not.toHaveBeenCalled();
    expect(nativeClipboardWrite).not.toHaveBeenCalled();
  });
});
