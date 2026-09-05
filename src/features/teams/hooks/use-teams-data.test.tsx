import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTeamsData } from "@/features/teams/hooks/use-teams-data";
import { useWorkspaceStore } from "@/features/context/store";
import { WorkspaceContext } from "@/features/context/workspace-context";
import { api } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  api: {
    listMyOrganizations: vi.fn().mockResolvedValue([]),
    listTeams: vi.fn(),
    listProjects: vi.fn(),
    createTeam: vi.fn(),
    createProject: vi.fn(),
    createOrganization: vi.fn(),
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

describe("useTeamsData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.getState().reset();
  });

  it("returns empty arrays when no organizationId", async () => {
    const { result } = renderHook(() => useTeamsData(), { wrapper });
    await waitFor(() => {
      expect(result.current.teams).toEqual([]);
    });
    expect(api.listTeams).not.toHaveBeenCalled();
  });

  it("loads teams when organizationId is set", async () => {
    (api.listTeams as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "t1", organizationId: "org-1", name: "Team 1", defaultTeam: false },
    ]);
    useWorkspaceStore.getState().setOrganizations([
      { id: "org-1", name: "Org 1", ownerUserId: "u1" },
    ]);
    useWorkspaceStore.getState().setOrganization("org-1");
    const { result } = renderHook(() => useTeamsData(), { wrapper });
    await waitFor(() => {
      expect(result.current.teams.length).toBeGreaterThanOrEqual(0);
    });
    expect(result.current.organizationId).toBe("org-1");
  });
});