import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { OrgDistributionCard } from "./org-distribution-card";
import { api } from "@/lib/api-client";
import { notifyOrgContentChange, resetPushBusForTest } from "@/lib/push-bus";

vi.mock("@/lib/api-client", () => ({
  api: {
    listSkillDistributions: vi.fn(),
    withdrawSkillDistribution: vi.fn().mockResolvedValue(undefined),
  },
  ApiClientError: class extends Error {},
}));

describe("OrgDistributionCard", () => {
  beforeEach(() => {
    vi.mocked(api.listSkillDistributions).mockReset();
    resetPushBusForTest();
  });

  it("空列表渲染空态", async () => {
    vi.mocked(api.listSkillDistributions).mockResolvedValue([]);
    render(<OrgDistributionCard orgId="10" canWithdraw />);
    await waitFor(() => expect(screen.getByText("暂无分发")).toBeInTheDocument());
  });

  it("撤回成功后刷新列表", async () => {
    vi.mocked(api.listSkillDistributions).mockResolvedValue([
      {
        id: "7", skillId: "2", organizationId: "10", scopeType: "TEAM" as const,
        teamId: "100", memberId: null, distributedByMemberId: "1", withdrawn: false,
      },
    ]);
    render(<OrgDistributionCard orgId="10" canWithdraw />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /撤回/ })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /撤回/ }));
    await waitFor(() =>
      expect(api.withdrawSkillDistribution).toHaveBeenCalledWith("10", "7"),
    );
    await waitFor(() =>
      expect(api.listSkillDistributions).toHaveBeenCalledTimes(2),
    );
  });

  it("canWithdraw=false 或已撤回记录不渲染撤回按钮", async () => {
    vi.mocked(api.listSkillDistributions).mockResolvedValue([
      {
        id: "7", skillId: "2", organizationId: "10", scopeType: "ORGANIZATION" as const,
        teamId: null, memberId: null, distributedByMemberId: "1", withdrawn: false,
      },
    ]);
    render(<OrgDistributionCard orgId="10" canWithdraw={false} />);
    await waitFor(() =>
      expect(screen.getByText(/ORGANIZATION/)).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /撤回/ })).toBeNull();
  });

  it("canWithdraw=true 但记录已撤回(withdrawn=true)时不渲染撤回按钮", async () => {
    vi.mocked(api.listSkillDistributions).mockResolvedValue([
      {
        id: "8", skillId: "3", organizationId: "10", scopeType: "TEAM" as const,
        teamId: "100", memberId: null, distributedByMemberId: "1", withdrawn: true,
      },
    ]);
    render(<OrgDistributionCard orgId="10" canWithdraw />);
    await waitFor(() => expect(screen.getByText(/TEAM/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /撤回/ })).toBeNull();
  });

  it("加载失败渲染 error + 重试", async () => {
    vi.mocked(api.listSkillDistributions).mockRejectedValue(new Error("网络错误"));
    render(<OrgDistributionCard orgId="10" canWithdraw />);
    await waitFor(() => expect(screen.getByText(/网络错误/)).toBeInTheDocument());
    vi.mocked(api.listSkillDistributions).mockResolvedValue([]);
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(screen.getByText("暂无分发")).toBeInTheDocument());
  });

  it("非本组织的推送信号不触发刷新", async () => {
    vi.mocked(api.listSkillDistributions).mockResolvedValue([]);
    render(<OrgDistributionCard orgId="10" canWithdraw />);
    await waitFor(() => expect(screen.getByText("暂无分发")).toBeInTheDocument());

    notifyOrgContentChange("999");
    // 越过总线的 1 秒合并窗口后确认未被刷新。
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    expect(api.listSkillDistributions).toHaveBeenCalledTimes(1);
  });

  it("本组织的推送信号(合并窗口后)触发一次刷新", async () => {
    vi.mocked(api.listSkillDistributions).mockResolvedValue([]);
    render(<OrgDistributionCard orgId="10" canWithdraw />);
    await waitFor(() => expect(screen.getByText("暂无分发")).toBeInTheDocument());

    notifyOrgContentChange("10");
    await waitFor(
      () => expect(api.listSkillDistributions).toHaveBeenCalledTimes(2),
      { timeout: 3_000 },
    );
  });
});
