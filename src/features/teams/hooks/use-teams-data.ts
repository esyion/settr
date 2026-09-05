"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiClientError, api } from "@/lib/api-client";
import { useWorkspaceStore } from "@/features/context/store";
import { useWorkspaceContextValue } from "@/features/context/workspace-context";
import { toast } from "sonner";
import { teamsApi } from "@/features/teams/api";
import type { Project, Team } from "@/lib/contracts";
import type { TeamsDataApi } from "@/features/teams/types";

function readableError(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

/**
 * teams feature 数据中枢：基于工作区上下文的 organizationId 级联加载
 * 团队与项目，并对外暴露统一的 CRUD 入口。
 */
export function useTeamsData(): TeamsDataApi {
  const organizationId = useWorkspaceStore((s) => s.organizationId);
  const ctx = useWorkspaceContextValue();
  const [teams, setTeams] = useState<Team[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teamId, setTeamId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!organizationId) {
      setTeams([]);
      setTeamId("");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await teamsApi.listTeams(organizationId);
        if (cancelled) return;
        setTeams(list);
        setTeamId(list[0]?.id ?? "");
      } catch (caught) {
        if (!cancelled) setError(readableError(caught, "加载团队失败"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId || !teamId) {
      setProjects([]);
      setProjectId("");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await teamsApi.listProjects(organizationId, teamId);
        if (cancelled) return;
        setProjects(list);
        setProjectId(list[0]?.id ?? "");
      } catch (caught) {
        if (!cancelled) setError(readableError(caught, "加载项目失败"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, teamId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const refresh = useCallback(async () => {
    if (!organizationId) return;
    try {
      const list = await teamsApi.listTeams(organizationId);
      setTeams(list);
    } catch (caught) {
      toast.error(readableError(caught, "刷新团队失败"));
    }
  }, [organizationId]);

  const createTeam = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || !organizationId) return;
      setBusy("创建团队");
      try {
        const team = await teamsApi.createTeam(organizationId, trimmed);
        setTeams((cur) => [...cur, team]);
        setTeamId(team.id);
        toast.success(`已创建团队 ${team.name}`);
      } catch (caught) {
        toast.error(readableError(caught, "创建团队失败"));
      } finally {
        setBusy(null);
      }
    },
    [organizationId],
  );

  const createProject = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || !organizationId || !teamId) return;
      setBusy("创建项目");
      try {
        const project = await teamsApi.createProject(
          organizationId,
          teamId,
          trimmed,
        );
        setProjects((cur) => [...cur, project]);
        setProjectId(project.id);
        toast.success(`已创建项目 ${project.name}`);
      } catch (caught) {
        toast.error(readableError(caught, "创建项目失败"));
      } finally {
        setBusy(null);
      }
    },
    [organizationId, teamId],
  );

  const deleteOrganization = useCallback(async () => {
    if (!organizationId) return;
    if (!window.confirm("确认删除当前组织？此操作不可撤销")) return;
    setBusy("删除组织");
    try {
      await api.deleteOrganization(organizationId);
      toast.success("组织已删除");
      useWorkspaceStore.getState().clearOrganization();
    } catch (caught) {
      toast.error(readableError(caught, "删除组织失败"));
    } finally {
      setBusy(null);
    }
  }, [organizationId]);

  const renameOrganization = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || !organizationId) return;
      setBusy("重命名组织");
      try {
        const org = await api.renameOrganization(organizationId, trimmed);
        useWorkspaceStore.getState().setOrganization(org.id);
        toast.success(`已重命名为 ${org.name}`);
      } catch (caught) {
        toast.error(readableError(caught, "重命名组织失败"));
      } finally {
        setBusy(null);
      }
    },
    [organizationId],
  );

  const deleteTeam = useCallback(
    async (targetTeamId: string) => {
      if (!organizationId) return;
      if (!window.confirm("确认删除该团队？")) return;
      setBusy("删除团队");
      try {
        await api.deleteTeam(organizationId, targetTeamId);
        setTeams((cur) => cur.filter((t) => t.id !== targetTeamId));
        if (teamId === targetTeamId) setTeamId("");
        toast.success("团队已删除");
      } catch (caught) {
        toast.error(readableError(caught, "删除团队失败"));
      } finally {
        setBusy(null);
      }
    },
    [organizationId, teamId],
  );

  const renameTeam = useCallback(
    async (targetTeamId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed || !organizationId) return;
      setBusy("重命名团队");
      try {
        const team = await api.renameTeam(organizationId, targetTeamId, trimmed);
        setTeams((cur) =>
          cur.map((t) => (t.id === team.id ? team : t)),
        );
        toast.success("团队已重命名");
      } catch (caught) {
        toast.error(readableError(caught, "重命名团队失败"));
      } finally {
        setBusy(null);
      }
    },
    [organizationId],
  );

  const deleteProject = useCallback(
    async (targetProjectId: string) => {
      if (!organizationId || !teamId) return;
      if (!window.confirm("确认删除该项目？")) return;
      setBusy("删除项目");
      try {
        await api.deleteProject(organizationId, teamId, targetProjectId);
        setProjects((cur) => cur.filter((p) => p.id !== targetProjectId));
        if (projectId === targetProjectId) setProjectId("");
        toast.success("项目已删除");
      } catch (caught) {
        toast.error(readableError(caught, "删除项目失败"));
      } finally {
        setBusy(null);
      }
    },
    [organizationId, teamId, projectId],
  );

  const renameProject = useCallback(
    async (targetProjectId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed || !organizationId || !teamId) return;
      setBusy("重命名项目");
      try {
        const project = await api.renameProject(
          organizationId,
          teamId,
          targetProjectId,
          trimmed,
        );
        setProjects((cur) =>
          cur.map((p) => (p.id === project.id ? project : p)),
        );
        toast.success("项目已重命名");
      } catch (caught) {
        toast.error(readableError(caught, "重命名项目失败"));
      } finally {
        setBusy(null);
      }
    },
    [organizationId, teamId],
  );

  return {
    organizations: ctx.organizations,
    teams,
    projects,
    organizationId: organizationId ?? "",
    teamId,
    projectId,
    error,
    busy,
    setTeamId,
    setProjectId,
    refresh,
    createTeam,
    createProject,
    deleteOrganization,
    renameOrganization,
    deleteTeam,
    renameTeam,
    deleteProject,
    renameProject,
  };
}