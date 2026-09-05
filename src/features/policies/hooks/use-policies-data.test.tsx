import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { usePoliciesData } from "@/features/policies/hooks/use-policies-data";
import { useWorkspaceStore } from "@/features/context/store";
import { WorkspaceContext } from "@/features/context/workspace-context";
import { api } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  api: {
    listPolicyReviewRequests: vi.fn(),
    listPolicyHistory: vi.fn(),
    listPolicyDistributions: vi.fn(),
  },
  ApiClientError: class extends Error {},
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceContext.Provider
      value={{
        scope: "personal",
        organizationId: null,
        organizationName: null,
        organizations: [],
        loading: false,
        error: null,
        setOrganization: vi.fn(),
        clearOrganization: vi.fn(),
        refresh: vi.fn(),
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

describe("usePoliciesData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.getState().reset();
  });

  it("returns empty when no organizationId", async () => {
    const { result } = renderHook(() => usePoliciesData(), { wrapper });
    await waitFor(() => {
      expect(result.current.pendingPolicies).toEqual([]);
    });
    expect(api.listPolicyReviewRequests).not.toHaveBeenCalled();
  });

  it("loads policy review requests when organizationId is set", async () => {
    (api.listPolicyReviewRequests as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (api.listPolicyHistory as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (api.listPolicyDistributions as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    useWorkspaceStore.getState().setOrganizations([
      { id: "org-1", name: "Org 1", ownerUserId: "u1" },
    ]);
    useWorkspaceStore.getState().setOrganization("org-1");
    const { result } = renderHook(() => usePoliciesData(), { wrapper });
    await waitFor(() => {
      expect(result.current.organizationId).toBe("org-1");
    });
  });
});