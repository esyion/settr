"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiClientError } from "@/lib/api-client";
import { useWorkspaceStore } from "@/features/context/store";
import { toast } from "sonner";
import { rolesApi } from "@/features/roles/api";
import type { Role, RoleAssignment } from "@/lib/contracts";
import type { RolesDataApi } from "@/features/roles/types";

function readableError(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

/**
 * roles feature 数据中枢。
 */
export function useRolesData(): RolesDataApi {
  const organizationId = useWorkspaceStore((s) => s.organizationId);
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) {
      void Promise.resolve().then(() => {
        setRoles([]);
        setRoleAssignments([]);
      });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [r, ra] = await Promise.all([
          rolesApi.listRoles(organizationId),
          rolesApi.listRoleAssignments(organizationId),
        ]);
        if (cancelled) return;
        setRoles(r);
        setRoleAssignments(ra);
      } catch (caught) {
        if (!cancelled) setError(readableError(caught, "加载角色失败"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const refresh = useCallback(async () => {
    if (!organizationId) return;
    try {
      const [r, ra] = await Promise.all([
        rolesApi.listRoles(organizationId),
        rolesApi.listRoleAssignments(organizationId),
      ]);
      setRoles(r);
      setRoleAssignments(ra);
    } catch (caught) {
      toast.error(readableError(caught, "刷新角色失败"));
    }
  }, [organizationId]);

  const assignRole = useCallback(
    async (input: { organizationMemberId: string; roleId: string }) => {
      if (!organizationId) return;
      setBusy("分配角色");
      try {
        await rolesApi.assignRole(organizationId, input);
        const fresh = await rolesApi.listRoleAssignments(organizationId);
        setRoleAssignments(fresh);
        toast.success("角色已分配");
      } catch (caught) {
        toast.error(readableError(caught, "分配角色失败"));
      } finally {
        setBusy(null);
      }
    },
    [organizationId],
  );

  const revokeRoleAssignment = useCallback(
    async (assignmentId: string) => {
      setBusy("撤销角色");
      try {
        await rolesApi.revokeRoleAssignment(assignmentId);
        setRoleAssignments((cur) =>
          cur.filter((a) => a.id !== assignmentId),
        );
        toast.success("角色已撤销");
      } catch (caught) {
        toast.error(readableError(caught, "撤销角色失败"));
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  return {
    roles,
    roleAssignments,
    organizationId: organizationId ?? "",
    error,
    busy,
    refresh,
    assignRole,
    revokeRoleAssignment,
  };
}