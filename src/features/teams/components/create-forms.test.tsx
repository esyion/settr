import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateOrganizationForm } from "@/features/teams/components/create-forms";
import { useWorkspaceStore } from "@/features/context/store";
import { api } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  api: {
    createOrganization: vi.fn(),
    listMyOrganizations: vi.fn(),
  },
  ApiClientError: class extends Error {},
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const newOrg = { id: "org-9", name: "Fresh Org", ownerUserId: "u1" };

/**
 * 回归测试：修复前创建组织后直接 setOrganization(org.id)，
 * 新组织不在已缓存 organizations 列表中导致静默 no-op，scope 一直停在 personal。
 * 修复后必须先 refresh 拉取列表（含新组织）再切换，最终 scope 变为 organization。
 */
describe("CreateOrganizationForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.getState().reset();
  });

  it("refreshes organization list then switches scope to the created org", async () => {
    vi.mocked(api.createOrganization).mockResolvedValue(newOrg);
    vi.mocked(api.listMyOrganizations).mockResolvedValue([newOrg]);
    const user = userEvent.setup();
    render(<CreateOrganizationForm />);
    await user.type(screen.getByPlaceholderText("组织名称"), "Fresh Org");
    await user.click(screen.getByRole("button", { name: /创建并切换/ }));
    await waitFor(() => {
      expect(useWorkspaceStore.getState().scope).toBe("organization");
    });
    expect(useWorkspaceStore.getState().organizationId).toBe("org-9");
    expect(useWorkspaceStore.getState().organizationName).toBe("Fresh Org");
    expect(api.listMyOrganizations).toHaveBeenCalled();
  });
});