import { describe, it, expect, beforeEach } from "vitest";
import { useWorkspaceStore } from "@/features/context/store";
import type { Organization } from "@/lib/contracts";

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
});