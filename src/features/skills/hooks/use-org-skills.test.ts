import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useOrgSkills } from "./use-org-skills";
import { api } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  api: { listSkills: vi.fn() },
  ApiClientError: class extends Error {},
}));

describe("useOrgSkills", () => {
  beforeEach(() => vi.mocked(api.listSkills).mockReset());

  it("以 scope=org 拉取组织 skill 列表", async () => {
    vi.mocked(api.listSkills).mockResolvedValue({
      records: [{ id: "2", name: "alpha" }],
      total: 1,
    } as never);
    const { result } = renderHook(() => useOrgSkills("10"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.listSkills).toHaveBeenCalledWith({ scope: "org", orgId: "10", size: 100 });
    expect(result.current.skills).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it("orgId 为空时不请求", async () => {
    renderHook(() => useOrgSkills(null));
    expect(api.listSkills).not.toHaveBeenCalled();
  });

  it("请求失败写 error(retry 态),刷新成功后清除", async () => {
    vi.mocked(api.listSkills).mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useOrgSkills("10"));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    vi.mocked(api.listSkills).mockResolvedValue({ records: [], total: 0 } as never);
    await result.current.refresh();
    await waitFor(() => expect(result.current.error).toBeNull());
  });
});
