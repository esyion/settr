import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useRolesData } from "@/features/roles/hooks/use-roles-data";
import { useWorkspaceStore } from "@/features/context/store";
import { api } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  api: {
    listRoles: vi.fn(),
    listRoleAssignments: vi.fn(),
  },
  ApiClientError: class extends Error {},
}));

describe("useRolesData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.getState().reset();
  });

  it("returns empty when no organizationId", async () => {
    const { result } = renderHook(() => useRolesData());
    await waitFor(() => {
      expect(result.current.roles).toEqual([]);
    });
    expect(api.listRoles).not.toHaveBeenCalled();
  });

  it("loads roles when organizationId is set", async () => {
    (api.listRoles as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "r1", roleCode: "ADMIN", roleName: "Admin", description: null, scope: "ORG" },
    ]);
    (api.listRoleAssignments as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    useWorkspaceStore.getState().setOrganizations([
      { id: "org-1", name: "Org 1", ownerUserId: "u1" },
    ]);
    useWorkspaceStore.getState().setOrganization("org-1");
    const { result } = renderHook(() => useRolesData());
    await waitFor(() => {
      expect(result.current.roles.length).toBeGreaterThanOrEqual(0);
    });
    expect(result.current.organizationId).toBe("org-1");
  });
});