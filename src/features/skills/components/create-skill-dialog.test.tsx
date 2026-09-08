import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreateSkillDialog } from "./create-skill-dialog";
import { useWorkspaceStore } from "@/features/context/store";
import { api } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  api: { createSkill: vi.fn().mockResolvedValue({ id: "1" }) },
  ApiClientError: class extends Error {},
}));

vi.mock("@/features/context/store", () => ({
  useWorkspaceStore: vi.fn(),
}));

describe("CreateSkillDialog org binding", () => {
  beforeEach(() => {
    vi.mocked(api.createSkill).mockReset();
    vi.mocked(api.createSkill).mockResolvedValue({ id: "1" } as never);
  });

  it("组织态提交携带 ownerScope=ORG 与 orgId", async () => {
    vi.mocked(useWorkspaceStore).mockImplementation(((selector: (s: unknown) => unknown) =>
      selector({ scope: "organization", organizationId: "10" })) as never);
    render(<CreateSkillDialog open onOpenChange={() => {}} onCreated={() => {}} />);
    fireEvent.change(screen.getByLabelText(/名称/), { target: { value: "alpha" } });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));
    await waitFor(() =>
      expect(api.createSkill).toHaveBeenCalledWith(
        expect.objectContaining({ ownerScope: "ORG", orgId: "10" }),
      ),
    );
  });

  it("个人态提交不带归属字段", async () => {
    vi.mocked(useWorkspaceStore).mockImplementation(((selector: (s: unknown) => unknown) =>
      selector({ scope: "personal", organizationId: null })) as never);
    render(<CreateSkillDialog open onOpenChange={() => {}} onCreated={() => {}} />);
    fireEvent.change(screen.getByLabelText(/名称/), { target: { value: "beta" } });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));
    await waitFor(() => {
      expect(api.createSkill).toHaveBeenCalled();
      const body = vi.mocked(api.createSkill).mock.calls[0][0] as unknown as Record<string, unknown>;
      expect(body.ownerScope).toBeUndefined();
      expect(body.orgId).toBeUndefined();
    });
  });
});
