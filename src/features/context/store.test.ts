import { describe, it, expect, vi, beforeEach } from "vitest";
import { useWorkspaceStore } from "@/features/context/store";
import { api } from "@/lib/api-client";
import { listMyPermissions } from "@/lib/api-permission";
import type { Organization } from "@/lib/contracts";

vi.mock("@/lib/api-client", () => ({
  api: { listMyOrganizations: vi.fn() },
  ApiClientError: class extends Error {},
}));

vi.mock("@/lib/api-permission", () => ({
  listMyPermissions: vi.fn(),
}));

const orgA: Organization = {
  id: "org-1",
  name: "Alpha",
  ownerUserId: "u1",
};
const orgB: Organization = {
  id: "org-2",
  name: "Beta",
  ownerUserId: "u2",
};

describe("workspace store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.getState().reset();
  });

  it("starts in personal scope", () => {
    expect(useWorkspaceStore.getState().scope).toBe("personal");
    expect(useWorkspaceStore.getState().organizationId).toBeNull();
  });

  it("setOrganization switches scope", () => {
    useWorkspaceStore.getState().setOrganizations([orgA, orgB]);
    useWorkspaceStore.getState().setOrganization("org-2");
    const s = useWorkspaceStore.getState();
    expect(s.scope).toBe("organization");
    expect(s.organizationId).toBe("org-2");
    expect(s.organizationName).toBe("Beta");
  });

  it("clearOrganization returns to personal", () => {
    useWorkspaceStore.getState().setOrganizations([orgA]);
    useWorkspaceStore.getState().setOrganization("org-1");
    useWorkspaceStore.getState().clearOrganization();
    const s = useWorkspaceStore.getState();
    expect(s.scope).toBe("personal");
    expect(s.organizationId).toBeNull();
  });

  it("setOrganizations drops invalid organizationId", () => {
    useWorkspaceStore.getState().setOrganizations([orgA]);
    useWorkspaceStore.getState().setOrganization("org-1");
    useWorkspaceStore.getState().setOrganizations([orgB]);
    const s = useWorkspaceStore.getState();
    expect(s.organizationId).toBeNull();
    expect(s.scope).toBe("personal");
  });

  it("refresh loads organizations and keeps a valid selection", async () => {
    vi.mocked(api.listMyOrganizations).mockResolvedValue([orgA, orgB]);
    await useWorkspaceStore.getState().refresh();
    const s = useWorkspaceStore.getState();
    expect(s.organizations).toHaveLength(2);
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });

  it("refresh keeps a still-valid organization selected", async () => {
    useWorkspaceStore.getState().setOrganizations([orgA, orgB]);
    useWorkspaceStore.getState().setOrganization("org-2");
    vi.mocked(api.listMyOrganizations).mockResolvedValue([orgA, orgB]);
    await useWorkspaceStore.getState().refresh();
    const s = useWorkspaceStore.getState();
    expect(s.organizationId).toBe("org-2");
    expect(s.scope).toBe("organization");
  });

  it("refresh normalizes failure into error state and clears loading", async () => {
    vi.mocked(api.listMyOrganizations).mockRejectedValue(new Error("网络中断"));
    await useWorkspaceStore.getState().refresh();
    const s = useWorkspaceStore.getState();
    expect(s.error).toBe("网络中断");
    expect(s.loading).toBe(false);
  });
});

describe("workspace store permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listMyPermissions).mockReset();
    useWorkspaceStore.getState().reset();
  });

  it("进入组织时拉取权限,成功后写入", async () => {
    vi.mocked(listMyPermissions).mockResolvedValue({
      orgLevel: ["skill:distribute"],
      teamLevel: [{ teamId: "100", permissions: ["skill:distribute"] }],
    });
    useWorkspaceStore.getState().setOrganizations([orgA, orgB]);
    useWorkspaceStore.getState().setOrganization("org-1");
    await vi.waitFor(() => {
      expect(useWorkspaceStore.getState().myPermissions?.orgLevel).toEqual(["skill:distribute"]);
    });
  });

  it("拉取失败降级为 null,不阻塞切换", async () => {
    vi.mocked(listMyPermissions).mockRejectedValue(new Error("403"));
    useWorkspaceStore.getState().setOrganizations([orgA]);
    useWorkspaceStore.getState().setOrganization("org-1");
    await vi.waitFor(() => {
      expect(useWorkspaceStore.getState().myPermissions).toBeNull();
    });
    // 切换本身不被权限请求失败阻塞
    expect(useWorkspaceStore.getState().scope).toBe("organization");
    expect(useWorkspaceStore.getState().organizationId).toBe("org-1");
  });

  it("切回个人空间立即清空权限", async () => {
    vi.mocked(listMyPermissions).mockResolvedValue({ orgLevel: ["skill:distribute"], teamLevel: [] });
    useWorkspaceStore.getState().setOrganizations([orgA]);
    useWorkspaceStore.getState().setOrganization("org-1");
    await vi.waitFor(() => {
      expect(useWorkspaceStore.getState().myPermissions).not.toBeNull();
    });
    useWorkspaceStore.getState().clearOrganization();
    expect(useWorkspaceStore.getState().myPermissions).toBeNull();
  });

  it("组织列表复校仍命中当前组织时刷新权限(刷新页面场景)", async () => {
    vi.mocked(listMyPermissions).mockResolvedValue({ orgLevel: ["policy:distribute"], teamLevel: [] });
    // 模拟 sessionStorage 重建后的持久化 organizationId(无 organizations 缓存)
    useWorkspaceStore.setState({ organizationId: "org-1", scope: "organization" });
    useWorkspaceStore.getState().setOrganizations([orgA]);
    await vi.waitFor(() => {
      expect(useWorkspaceStore.getState().myPermissions?.orgLevel).toEqual(["policy:distribute"]);
    });
  });

  it("hasPermission:org 级命中,或 team 级命中;无数据一律 false", () => {
    const s = useWorkspaceStore.getState();
    // 权限数据缺失:一律无权限(宁少勿多)
    expect(s.hasPermission("policy:distribute")).toBe(false);

    useWorkspaceStore.setState({
      myPermissions: {
        orgLevel: ["policy:distribute"],
        teamLevel: [{ teamId: "100", permissions: ["skill:distribute"] }],
      },
    });
    const s2 = useWorkspaceStore.getState();
    expect(s2.hasPermission("policy:distribute")).toBe(true);
    expect(s2.hasPermission("skill:distribute", "100")).toBe(true);
    expect(s2.hasPermission("skill:distribute")).toBe(false);
    expect(s2.hasPermission("skill:distribute", "200")).toBe(false);
  });
});