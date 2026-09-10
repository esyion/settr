import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWorkspaceStore } from "@/features/context/store";
import { useCapability } from "@/features/context/hooks/use-capability";
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
  /**
   * 每个用例独立复位全局 store 与 mock,避免权限状态串台。
   */
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.getState().reset();
  });

  /**
   * 登录后未选组织前应停留在个人空间。
   */
  it("starts in personal scope", () => {
    expect(useWorkspaceStore.getState().scope).toBe("personal");
    expect(useWorkspaceStore.getState().organizationId).toBeNull();
  });

  /**
   * setOrganization 应切换 scope 并同步组织名称。
   */
  it("setOrganization switches scope", () => {
    useWorkspaceStore.getState().setOrganizations([orgA, orgB]);
    useWorkspaceStore.getState().setOrganization("org-2");
    const s = useWorkspaceStore.getState();
    expect(s.scope).toBe("organization");
    expect(s.organizationId).toBe("org-2");
    expect(s.organizationName).toBe("Beta");
  });

  /**
   * clearOrganization 应回到个人空间并清空组织上下文。
   */
  it("clearOrganization returns to personal", () => {
    useWorkspaceStore.getState().setOrganizations([orgA]);
    useWorkspaceStore.getState().setOrganization("org-1");
    useWorkspaceStore.getState().clearOrganization();
    const s = useWorkspaceStore.getState();
    expect(s.scope).toBe("personal");
    expect(s.organizationId).toBeNull();
  });

  /**
   * 组织列表复校时,已失效的当前组织应被丢弃并降级到个人空间。
   */
  it("setOrganizations drops invalid organizationId", () => {
    useWorkspaceStore.getState().setOrganizations([orgA]);
    useWorkspaceStore.getState().setOrganization("org-1");
    useWorkspaceStore.getState().setOrganizations([orgB]);
    const s = useWorkspaceStore.getState();
    expect(s.organizationId).toBeNull();
    expect(s.scope).toBe("personal");
  });

  /**
   * refresh 应加载组织列表并结束 loading 态。
   */
  it("refresh loads organizations and keeps a valid selection", async () => {
    vi.mocked(api.listMyOrganizations).mockResolvedValue([orgA, orgB]);
    await useWorkspaceStore.getState().refresh();
    const s = useWorkspaceStore.getState();
    expect(s.organizations).toHaveLength(2);
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });

  /**
   * refresh 后仍有效的当前组织应保持选中。
   */
  it("refresh keeps a still-valid organization selected", async () => {
    useWorkspaceStore.getState().setOrganizations([orgA, orgB]);
    useWorkspaceStore.getState().setOrganization("org-2");
    vi.mocked(api.listMyOrganizations).mockResolvedValue([orgA, orgB]);
    await useWorkspaceStore.getState().refresh();
    const s = useWorkspaceStore.getState();
    expect(s.organizationId).toBe("org-2");
    expect(s.scope).toBe("organization");
  });

  /**
   * refresh 失败应归一化为 error 状态并清掉 loading。
   */
  it("refresh normalizes failure into error state and clears loading", async () => {
    vi.mocked(api.listMyOrganizations).mockRejectedValue(new Error("网络中断"));
    await useWorkspaceStore.getState().refresh();
    const s = useWorkspaceStore.getState();
    expect(s.error).toBe("网络中断");
    expect(s.loading).toBe(false);
  });
});

describe("workspace store capabilities", () => {
  /**
   * 权限相关用例需要显式复位 listMyPermissions,避免上一个用例的 resolved 值泄漏。
   */
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listMyPermissions).mockReset();
    useWorkspaceStore.getState().reset();
  });

  /**
   * 进入组织时应拉取能力位并在成功后写入 store。
   */
  it("进入组织时拉取能力位,成功后写入", async () => {
    vi.mocked(listMyPermissions).mockResolvedValue({
      capabilities: { canDistributeSkill: true },
    });
    useWorkspaceStore.getState().setOrganizations([orgA, orgB]);
    useWorkspaceStore.getState().setOrganization("org-1");
    await vi.waitFor(() => {
      expect(useWorkspaceStore.getState().myPermissions?.capabilities
        ?.canDistributeSkill).toBe(true);
    });
  });

  /**
   * 能力位请求失败应降级为 null,但不能阻塞组织切换本身。
   */
  it("拉取失败降级为 null,不阻塞切换", async () => {
    vi.mocked(listMyPermissions).mockRejectedValue(new Error("403"));
    useWorkspaceStore.getState().setOrganizations([orgA]);
    useWorkspaceStore.getState().setOrganization("org-1");
    await vi.waitFor(() => {
      expect(useWorkspaceStore.getState().myPermissions).toBeNull();
    });
    expect(useWorkspaceStore.getState().scope).toBe("organization");
    expect(useWorkspaceStore.getState().organizationId).toBe("org-1");
  });

  /**
   * 切回个人空间必须立即清空上一组织的能力位,防止旧能力泄漏到个人态 UI。
   */
  it("切回个人空间立即清空能力位", async () => {
    vi.mocked(listMyPermissions).mockResolvedValue({
      capabilities: { canDistributeSkill: true },
    });
    useWorkspaceStore.getState().setOrganizations([orgA]);
    useWorkspaceStore.getState().setOrganization("org-1");
    await vi.waitFor(() => {
      expect(useWorkspaceStore.getState().myPermissions).not.toBeNull();
    });
    useWorkspaceStore.getState().clearOrganization();
    expect(useWorkspaceStore.getState().myPermissions).toBeNull();
  });

  /**
   * 页面刷新后组织列表复校仍命中当前组织时,应重新拉取能力位。
   */
  it("组织列表复校仍命中当前组织时刷新能力位(刷新页面场景)", async () => {
    vi.mocked(listMyPermissions).mockResolvedValue({
      capabilities: { canDistributePolicy: true },
    });
    // 模拟 sessionStorage 重建后的持久化 organizationId(无 organizations 缓存)
    useWorkspaceStore.setState({ organizationId: "org-1", scope: "organization" });
    useWorkspaceStore.getState().setOrganizations([orgA]);
    await vi.waitFor(() => {
      expect(useWorkspaceStore.getState().myPermissions?.capabilities
        ?.canDistributePolicy).toBe(true);
    });
  });

  /**
   * useCapability 只读后端能力位:未加载/缺失/非 true 一律 false,true 才为 true。
   * 该用例回归旧权限字符串大小写漂移导致按钮消失的问题。
   */
  it("useCapability:只认后端布尔能力位,数据缺失一律 false", () => {
    const { result } = renderHook(() => useCapability("canDistributeSkill"));
    expect(result.current).toBe(false);

    act(() => {
      useWorkspaceStore.setState({
        myPermissions: { capabilities: { canDistributeSkill: true } },
      });
    });
    expect(result.current).toBe(true);

    act(() => {
      useWorkspaceStore.setState({
        myPermissions: { capabilities: { canDistributeSkill: false } },
      });
    });
    expect(result.current).toBe(false);
  });
});
