import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppSidebar } from "@/features/app/components/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useWorkspaceStore } from "@/features/context/store";
import type { DeviceIdentity } from "@/lib/contracts";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("@/features/app/components/workspace-switcher", () => ({
  WorkspaceSwitcher: () => <div data-testid="workspace-switcher" />,
}));
vi.mock("@/features/app/components/user-menu", () => ({
  UserMenu: () => <div data-testid="user-menu" />,
}));

const identity: DeviceIdentity = {
  deviceId: "d1",
  deviceName: "QING",
  platform: "windows",
  appVersion: "0.1.0",
};

/** 用例间隔离：先 reset 再按需覆写 store 状态（动作保持 store 原实现）。 */
function renderSidebar(ctx: {
  scope?: "personal" | "organization";
  organizationId?: string | null;
  organizationName?: string | null;
}) {
  useWorkspaceStore.getState().reset();
  useWorkspaceStore.setState({
    scope: ctx.scope ?? "personal",
    organizationId: ctx.organizationId ?? null,
    organizationName: ctx.organizationName ?? null,
    organizations: [],
    loading: false,
    error: null,
  });
  return render(
    <SidebarProvider>
      <AppSidebar
        identity={identity}
        format="agentsMd"
        user={{ email: "qingbo.my@gmail.com", name: null, avatar: null }}
        onLogout={vi.fn()}
        busy={false}
      />
    </SidebarProvider>,
  );
}

describe("AppSidebar", () => {
  beforeEach(() => {
    useWorkspaceStore.getState().reset();
  });

  it("renders WorkspaceSwitcher, NavMain and UserMenu when scope is personal", () => {
    renderSidebar({ scope: "personal" });
    expect(screen.getByTestId("workspace-switcher")).toBeInTheDocument();
    expect(screen.getByTestId("user-menu")).toBeInTheDocument();
    // personal scope 下仅暴露「工作区」组；组织入口已收敛到 WorkspaceSwitcher 顶部菜单。
    expect(screen.getByText("工作区")).toBeInTheDocument();
    expect(screen.queryByText("组织")).not.toBeInTheDocument();
    expect(screen.queryByText("组织空间")).not.toBeInTheDocument();
  });

  it("renders only 组织空间 group when scope is organization", () => {
    renderSidebar({
      scope: "organization",
      organizationId: "org-1",
      organizationName: "Acme Inc",
    });
    expect(screen.getByText("组织空间")).toBeInTheDocument();
    expect(screen.queryByText("工作区")).not.toBeInTheDocument();
    expect(screen.queryByText("组织")).not.toBeInTheDocument();
    // 「组织概览」已并入 /organization/teams，不再作为独立菜单项出现。
    expect(screen.queryByText("组织概览")).not.toBeInTheDocument();
  });
});