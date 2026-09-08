import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { usePoliciesData } from "@/features/policies/hooks/use-policies-data";
import { useWorkspaceStore } from "@/features/context/store";
import { api } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  api: {
    listPolicyReviewRequests: vi.fn(),
    listPolicyHistory: vi.fn(),
    listPolicyDistributions: vi.fn(),
    getEffectivePolicies: vi.fn(),
  },
  ApiClientError: class extends Error {},
}));

describe("usePoliciesData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.getState().reset();
  });

  it("returns empty when no organizationId", async () => {
    const { result } = renderHook(() => usePoliciesData());
    await waitFor(() => {
      expect(result.current.pendingPolicies).toEqual([]);
    });
    expect(api.listPolicyReviewRequests).not.toHaveBeenCalled();
  });

  it("loads policy review requests when organizationId is set", async () => {
    (api.listPolicyReviewRequests as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (api.listPolicyHistory as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (api.listPolicyDistributions as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (api.getEffectivePolicies as ReturnType<typeof vi.fn>).mockResolvedValue({
      agent: null,
      claude: null,
    });
    useWorkspaceStore.getState().setOrganizations([
      { id: "org-1", name: "Org 1", ownerUserId: "u1" },
    ]);
    useWorkspaceStore.getState().setOrganization("org-1");
    const { result } = renderHook(() => usePoliciesData());
    await waitFor(() => {
      expect(result.current.organizationId).toBe("org-1");
    });
    // 生效规范由服务端聚合解析,客户端不传团队参数(规格 §6.5)
    await waitFor(() => {
      expect(api.getEffectivePolicies).toHaveBeenCalledWith("org-1");
    });
  });
});