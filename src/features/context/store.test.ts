import { describe, it, expect, vi, beforeEach } from "vitest";
import { useWorkspaceStore } from "@/features/context/store";
import { api } from "@/lib/api-client";
import type { Organization } from "@/lib/contracts";

vi.mock("@/lib/api-client", () => ({
  api: { listMyOrganizations: vi.fn() },
  ApiClientError: class extends Error {},
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