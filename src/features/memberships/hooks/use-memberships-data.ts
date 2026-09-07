"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiClientError } from "@/lib/api-client";
import { useWorkspaceStore } from "@/features/context/store";
import { toast } from "sonner";
import { membershipsApi } from "@/features/memberships/api";
import type { Membership, TeamMembership } from "@/lib/contracts";
import type { MembershipsDataApi } from "@/features/memberships/types";

function readableError(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

/**
 * memberships feature 数据中枢：根据工作区上下文加载组织成员与团队成员。
 */
export function useMembershipsData(): MembershipsDataApi {
  const organizationId = useWorkspaceStore((s) => s.organizationId);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [teamMemberships, setTeamMemberships] = useState<TeamMembership[]>([]);
  const [teamId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // 组织成员加载
  useEffect(() => {
    if (!organizationId) {
      void Promise.resolve().then(() => setMemberships([]));
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await membershipsApi.listMemberships(organizationId);
        if (cancelled) return;
        setMemberships(list);
      } catch (caught) {
        if (!cancelled) setError(readableError(caught, "加载成员失败"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  // 团队成员加载(简化版:实际应用应联动 teams feature 的当前 teamId)
  useEffect(() => {
    if (!teamId) {
      void Promise.resolve().then(() => setTeamMemberships([]));
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await membershipsApi.listTeamMemberships(teamId);
        if (cancelled) return;
        setTeamMemberships(list);
      } catch (caught) {
        if (!cancelled) setError(readableError(caught, "加载团队成员失败"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  const refresh = useCallback(async () => {
    if (!organizationId) return;
    try {
      const list = await membershipsApi.listMemberships(organizationId);
      setMemberships(list);
    } catch (caught) {
      toast.error(readableError(caught, "刷新成员失败"));
    }
  }, [organizationId]);

  const run = useCallback(
    async (name: string, fn: () => Promise<void>) => {
      setBusy(name);
      try {
        await fn();
        toast.success(`${name}成功`);
      } catch (caught) {
        toast.error(readableError(caught, `${name}失败`));
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const enableMembership = useCallback(
    async (id: string) => {
      if (!organizationId) return;
      await run("启用成员", async () => {
        await membershipsApi.enableMembership(organizationId, id);
        setMemberships((cur) =>
          cur.map((m) => (m.id === id ? { ...m, status: "ACTIVE" } : m)),
        );
      });
    },
    [organizationId, run],
  );

  const disableMembership = useCallback(
    async (id: string) => {
      if (!organizationId) return;
      await run("停用成员", async () => {
        await membershipsApi.disableMembership(organizationId, id);
        setMemberships((cur) =>
          cur.map((m) => (m.id === id ? { ...m, status: "DISABLED" } : m)),
        );
      });
    },
    [organizationId, run],
  );

  const removeMembership = useCallback(
    async (id: string) => {
      if (!organizationId) return;
      await run("移除成员", async () => {
        await membershipsApi.removeMembership(organizationId, id);
        setMemberships((cur) => cur.filter((m) => m.id !== id));
      });
    },
    [organizationId, run],
  );

  const addTeamMembership = useCallback(
    async (organizationMemberId: string) => {
      if (!teamId) return;
      await run("添加到团队", async () => {
        const tm = await membershipsApi.addTeamMembership(
          teamId,
          organizationMemberId,
        );
        setTeamMemberships((cur) => [...cur, tm]);
      });
    },
    [teamId, run],
  );

  const enableTeamMembership = useCallback(
    async (id: string) => {
      if (!teamId) return;
      await run("启用团队成员", async () => {
        await membershipsApi.enableTeamMembership(teamId, id);
        setTeamMemberships((cur) =>
          cur.map((m) => (m.id === id ? { ...m, status: "ACTIVE" } : m)),
        );
      });
    },
    [teamId, run],
  );

  const disableTeamMembership = useCallback(
    async (id: string) => {
      if (!teamId) return;
      await run("停用团队成员", async () => {
        await membershipsApi.disableTeamMembership(teamId, id);
        setTeamMemberships((cur) =>
          cur.map((m) => (m.id === id ? { ...m, status: "DISABLED" } : m)),
        );
      });
    },
    [teamId, run],
  );

  const removeTeamMembership = useCallback(
    async (id: string) => {
      if (!teamId) return;
      await run("移除团队成员", async () => {
        await membershipsApi.removeTeamMembership(teamId, id);
        setTeamMemberships((cur) => cur.filter((m) => m.id !== id));
      });
    },
    [teamId, run],
  );

  return {
    memberships,
    teamMemberships,
    organizationId: organizationId ?? "",
    teamId,
    error,
    busy,
    refresh,
    enableMembership,
    disableMembership,
    removeMembership,
    addTeamMembership,
    enableTeamMembership,
    disableTeamMembership,
    removeTeamMembership,
  };
}