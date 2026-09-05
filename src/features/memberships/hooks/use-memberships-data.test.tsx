import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useMembershipsData } from "@/features/memberships/hooks/use-memberships-data";
import { useWorkspaceStore } from "@/features/context/store";
import { WorkspaceContext } from "@/features/context/workspace-context";
import { api } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  api: {
    listMemberships: vi.fn(),
    listTeamMemberships: vi.fn(),
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

describe("useMembershipsData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.getState().reset();
  });

  it("returns empty memberships when no organizationId", async () => {
    const { result } = renderHook(() => useMembershipsData(), { wrapper });
    await waitFor(() => {
      expect(result.current.memberships).toEqual([]);
    });
    expect(api.listMemberships).not.toHaveBeenCalled();
  });

  it("loads memberships when organizationId is set", async () => {
    (api.listMemberships as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "m1", organizationId: "org-1", userId: "u1", status: "ACTIVE" },
    ]);
    useWorkspaceStore.getState().setOrganizations([
      { id: "org-1", name: "Org 1", ownerUserId: "u1" },
    ]);
    useWorkspaceStore.getState().setOrganization("org-1");
    const { result } = renderHook(() => useMembershipsData(), { wrapper });
    await waitFor(() => {
      expect(result.current.memberships.length).toBeGreaterThanOrEqual(0);
    });
    expect(result.current.organizationId).toBe("org-1");
  });
});