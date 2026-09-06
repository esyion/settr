import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidebarProvider } from "@/components/ui/sidebar";
import { WorkspaceSwitcher } from "@/features/app/components/workspace-switcher";
import { WorkspaceContext } from "@/features/context/workspace-context";
import type { WorkspaceContextApi } from "@/features/context/hooks/use-workspace-context";
import type { Organization } from "@/lib/contracts";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (...args: unknown[]) => toastSuccess(...args) },
}));

const organizations: Organization[] = [
  { id: "org-1", name: "Acme Inc", ownerUserId: "u-1" },
  { id: "org-2", name: "Evil Corp", ownerUserId: "u-1" },
];

function renderWithContext(
  ctx: Partial<WorkspaceContextApi>,
  ui: React.ReactNode,
) {
  const fullCtx: WorkspaceContextApi = {
    scope: ctx.scope ?? "personal",
    organizationId: ctx.organizationId ?? null,
    organizationName: ctx.organizationName ?? null,
    organizations: ctx.organizations ?? [],
    loading: ctx.loading ?? false,
    error: ctx.error ?? null,
    setOrganization: ctx.setOrganization ?? vi.fn(),
    clearOrganization: ctx.clearOrganization ?? vi.fn(),
    refresh: ctx.refresh ?? vi.fn(),
  };
  return render(
    <WorkspaceContext.Provider value={fullCtx}>
      <SidebarProvider>{ui}</SidebarProvider>
    </WorkspaceContext.Provider>,
  );
}

describe("WorkspaceSwitcher", () => {
  beforeEach(() => {
    push.mockClear();
    toastSuccess.mockClear();
  });

  it("shows '个人空间' when scope is personal", () => {
    renderWithContext({ scope: "personal" }, <WorkspaceSwitcher />);
    expect(screen.getByText("个人空间")).toBeInTheDocument();
  });

  it("shows the organization name when scope is organization", () => {
    renderWithContext(
      { scope: "organization", organizationId: "org-1", organizationName: "Acme Inc" },
      <WorkspaceSwitcher />,
    );
    expect(screen.getByText("Acme Inc")).toBeInTheDocument();
  });

  it("clicking an org item calls setOrganization and toasts", async () => {
    const user = userEvent.setup();
    const setOrganization = vi.fn();
    renderWithContext(
      { scope: "personal", organizations, setOrganization },
      <WorkspaceSwitcher />,
    );
    await user.click(screen.getByText("个人空间"));
    await user.click(screen.getByText("Acme Inc"));
    expect(setOrganization).toHaveBeenCalledWith("org-1");
    expect(toastSuccess).toHaveBeenCalledWith("已切换到 Acme Inc");
  });

  it("clicking '个人空间' calls clearOrganization", async () => {
    const user = userEvent.setup();
    const clearOrganization = vi.fn();
    renderWithContext(
      { scope: "organization", organizationId: "org-1", organizationName: "Acme Inc", clearOrganization },
      <WorkspaceSwitcher />,
    );
    await user.click(screen.getByText("Acme Inc"));
    await user.click(screen.getByText("个人空间"));
    expect(clearOrganization).toHaveBeenCalledTimes(1);
  });

  it("clicking '进入组织管理' navigates to /organization", async () => {
    const user = userEvent.setup();
    renderWithContext({ scope: "personal" }, <WorkspaceSwitcher />);
    await user.click(screen.getByText("个人空间"));
    await user.click(screen.getByText("进入组织管理"));
    expect(push).toHaveBeenCalledWith("/organization");
  });
});
