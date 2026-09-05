"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiClientError } from "@/lib/api-client";
import { useWorkspaceStore } from "@/features/context/store";
import { useWorkspaceContextValue } from "@/features/context/workspace-context";
import { toast } from "sonner";
import { teamsApi } from "@/features/teams/api";
import type { Project, Team } from "@/lib/contracts";
import type { TeamsDataApi } from "@/features/teams/types";

/**
 * 把任意错误归一化为可向用户展示的中文提示。
 */
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

  // 加载 teams 当 organizationId 变化时
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

  // 加载 projects 当 teamId 变化时
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
  };
}