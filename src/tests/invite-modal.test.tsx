import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { InviteModal } from "./invite-modal";
import { useWorkspaceStore } from "@/features/context/store";
import { useTeamsData } from "@/features/teams";
import { membershipsApi } from "@/features/memberships/api";
import { copyTextToClipboard } from "@/services/clipboard";

vi.mock("@/features/memberships/api", () => ({
  membershipsApi: { createInvitation: vi.fn() },
}));

vi.mock("@/features/context/store", () => ({
  useWorkspaceStore: vi.fn(),
}));

vi.mock("@/features/teams", () => ({
  useTeamsData: vi.fn(),
}));

vi.mock("@/services/clipboard", () => ({
  copyTextToClipboard: vi.fn(),
}));

/** 组装默认渲染环境：组织上下文 + 无团队 + 邀请创建成功，并点击触发器打开弹窗。 */
function setup(invitationResponse: { token: string | null }) {
  vi.mocked(useWorkspaceStore).mockImplementation(((selector: (s: unknown) => unknown) =>
    selector({ organizationId: "10" })) as never);
  vi.mocked(useTeamsData).mockReturnValue({
    teams: [],
  } as never);
  vi.mocked(membershipsApi.createInvitation).mockResolvedValue({
    id: "1",
    organizationId: "10",
    email: "invitee@example.com",
    roleId: null,
    teamIds: [],
    token: invitationResponse.token,
    expiresAt: "2026-09-12T00:00:00Z",
    status: "PENDING",
    createdAt: "2026-09-09T00:00:00Z",
  } as never);
  const view = render(<InviteModal><span>邀请成员</span></InviteModal>);
  // 弹窗默认关闭，先点触发器打开。
  fireEvent.click(screen.getByText("邀请成员"));
  return view;
}

describe("InviteModal 邀请深链兜底", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("创建成功且响应携带 token 时，展示可复制的 agentsplus://accept-invite 深链", async () => {
    setup({ token: "inv-token-123" });
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "invitee@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送邀请" }));

    const link = await screen.findByText(
      "agentsplus://accept-invite?token=inv-token-123",
    );
    expect(link).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /复制邀请链接/ }),
    ).toBeInTheDocument();
  });

  it("点击复制按钮时把完整深链写入系统剪贴板", async () => {
    setup({ token: "inv-token-123" });
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "invitee@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送邀请" }));
    await screen.findByText("agentsplus://accept-invite?token=inv-token-123");

    fireEvent.click(screen.getByRole("button", { name: /复制邀请链接/ }));
    await waitFor(() => {
      expect(copyTextToClipboard).toHaveBeenCalledWith(
        "agentsplus://accept-invite?token=inv-token-123",
      );
    });
  });

  it("响应不含 token（旧后端）时回退为直接关闭，不显示链接面板", async () => {
    setup({ token: null });
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "invitee@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送邀请" }));

    await waitFor(() => {
      expect(membershipsApi.createInvitation).toHaveBeenCalled();
    });
    expect(screen.queryByRole("button", { name: /复制邀请链接/ })).toBeNull();
  });
});
