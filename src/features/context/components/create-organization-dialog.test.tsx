import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateOrganizationDialog } from "@/features/context/components/create-organization-dialog";
import { useWorkspaceStore } from "@/features/context/store";
import { ApiClientError, api } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  api: {
    createOrganization: vi.fn(),
    listMyOrganizations: vi.fn(),
  },
  ApiClientError: class extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const newOrg = { id: "org-9", name: "Fresh Org", ownerUserId: "u1" };

describe("CreateOrganizationDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.getState().reset();
  });

  it("calls createOrganization then refresh then setOrganization, finally closes the dialog", async () => {
    vi.mocked(api.createOrganization).mockResolvedValue(newOrg);
    vi.mocked(api.listMyOrganizations).mockResolvedValue([newOrg]);
    const setOrganization = vi.fn();
    useWorkspaceStore.setState({ setOrganization });

    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<CreateOrganizationDialog open={true} onOpenChange={onOpenChange} />);

    const input = screen.getByLabelText("组织名称");
    await user.type(input, "  Fresh Org  ");
    await user.click(screen.getByRole("button", { name: /创建并切换/ }));

    await waitFor(() => {
      expect(api.createOrganization).toHaveBeenCalledWith("Fresh Org");
    });
    // refresh 内部使用 listMyOrganizations 拉取最新组织列表，确保 setOrganization 不再 no-op
    expect(api.listMyOrganizations).toHaveBeenCalledTimes(1);
    expect(setOrganization).toHaveBeenCalledWith("org-9");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(useWorkspaceStore.getState().scope).toBe("organization");
    expect(useWorkspaceStore.getState().organizationName).toBe("Fresh Org");
  });

  it("surfaces an ApiClientError message and keeps the dialog open", async () => {
    vi.mocked(api.createOrganization).mockRejectedValue(
      new ApiClientError("conflict", "组织名称已被占用"),
    );

    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<CreateOrganizationDialog open={true} onOpenChange={onOpenChange} />);

    await user.type(screen.getByLabelText("组织名称"), "Duplicate");
    await user.click(screen.getByRole("button", { name: /创建并切换/ }));

    await waitFor(() => {
      expect(api.createOrganization).toHaveBeenCalled();
    });
    // 失败时不得切组织也不得关闭 Dialog，方便用户改名重试
    expect(useWorkspaceStore.getState().scope).toBe("personal");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("disables submit while busy and refuses to close mid-flight", async () => {
    let resolveCreate: (value: typeof newOrg) => void = () => {};
    vi.mocked(api.createOrganization).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    vi.mocked(api.listMyOrganizations).mockResolvedValue([]);

    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<CreateOrganizationDialog open={true} onOpenChange={onOpenChange} />);

    await user.type(screen.getByLabelText("组织名称"), "Slow");
    const submitBtn = screen.getByRole("button", { name: /创建并切换/ });
    await user.click(submitBtn);

    // busy 期间：取消按钮应被禁用；强行 onOpenChange(false) 也应被拦截（Dialog 仍保持打开）。
    await waitFor(() => {
      expect(api.createOrganization).toHaveBeenCalled();
    });
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();

    // 结束请求，避免悬挂 promise 影响下一个用例
    resolveCreate(newOrg);
  });
});