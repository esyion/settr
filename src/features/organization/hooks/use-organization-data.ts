"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiClientError } from "@/lib/api-client";
import type {
  EffectivePolicies,
  Organization,
  OrganizationMember,
  PendingPolicyRequest,
  PolicyDistribution,
  PolicyVersion,
  Project,
  RoleAssignment,
  RoleResponse,
  Team,
  TeamMember,
} from "@/lib/contracts";

/**
 * 把任意未知错误归一化为可向用户展示的中文提示文案。
 */
function readableError(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

export interface OrganizationDataApi {
  organizations: Organization[];
  teams: Team[];
  projects: Project[];
  members: OrganizationMember[];
  teamMembers: TeamMember[];
  roles: RoleResponse[];
  roleAssignments: RoleAssignment[];
  pendingPolicies: PendingPolicyRequest[];
  policyVersions: PolicyVersion[];
  distributions: PolicyDistribution[];
  effectivePolicies: EffectivePolicies | null;
  organizationId: string;
  teamId: string;
  projectId: string;
  error: string | null;
  busy: string | null;
  setOrganizationId: (id: string) => void;
  setTeamId: (id: string) => void;
  setProjectId: (id: string) => void;
  refresh: () => Promise<void>;
  createOrganization: (name: string) => Promise<void>;
  createTeam: (name: string) => Promise<void>;
  createProject: (name: string) => Promise<void>;
  addOrganizationMember: (userId: string) => Promise<void>;
  disableOrganizationMember: (id: string) => Promise<void>;
  enableOrganizationMember: (id: string) => Promise<void>;
  removeOrganizationMember: (id: string) => Promise<void>;
  addTeamMember: (organizationMemberId: string) => Promise<void>;
  disableTeamMember: (organizationMemberId: string) => Promise<void>;
  enableTeamMember: (organizationMemberId: string) => Promise<void>;
  removeTeamMember: (organizationMemberId: string) => Promise<void>;
  submitPolicyChange: (input: {
    policyType: "AGENT" | "CLAUDE";
    content: string;
    message: string;
  }) => Promise<void>;
  reviewPolicyChange: (
    requestId: string,
    decision: "APPROVED" | "REJECTED",
  ) => Promise<void>;
  loadPolicyHistory: (policyType: "AGENT" | "CLAUDE") => Promise<void>;
  withdrawDistribution: (distributionId: string) => Promise<void>;
  assignRole: (input: {
    organizationMemberId: string;
    roleId: string;
  }) => Promise<void>;
  revokeRoleAssignment: (assignmentId: string) => Promise<void>;
}

/**
 * 组织管理页的数据中枢：
 * <ul>
 *   <li>负责组织和团队的级联数据加载（组织 -> 团队 -> 项目 -> 团队成员）；</li>
 *   <li>对外暴露所有 CRUD 操作，统一 busy / error 状态；</li>
 *   <li>下层 panel 只关心交互 UI，不直接持有跨面板共享的请求状态。</li>
 * </ul>
 */
export function useOrganizationData(): OrganizationDataApi {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [roles, setRoles] = useState<RoleResponse[]>([]);
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignment[]>([]);
  const [pendingPolicies, setPendingPolicies] = useState<PendingPolicyRequest[]>([]);
  const [policyVersions, setPolicyVersions] = useState<PolicyVersion[]>([]);
  const [distributions, setDistributions] = useState<PolicyDistribution[]>([]);
  const [effectivePolicies, setEffectivePolicies] = useState<EffectivePolicies | null>(null);
  const [organizationId, setOrganizationId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  /**
   * 包一层执行函数，集中处理 busy / error 状态，让上层 action 简洁。
   */
  const run = useCallback(
    async (name: string, fn: () => Promise<void>): Promise<void> => {
      setBusy(name);
      setError(null);
      try {
        await fn();
      } catch (caught) {
        setError(readableError(caught, name + "失败"));
        throw caught;
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  // 数据加载副作用：使用 setState 同步外部状态到 React 是正确的模式；
  // 此处集中豁免 react-hooks/set-state-in-effect。
  /* eslint-disable react-hooks/set-state-in-effect */

  /**
   * 初次挂载时拉取组织列表。
   */
  useEffect(() => {
    let cancelled = false;
    void run("加载组织", async () => {
      const items = await api.listOrganizations();
      if (cancelled) return;
      setOrganizations(items);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [run]);

  /**
   * 切换组织时重置下级列表并重新拉取。
   */
  useEffect(() => {
    if (!organizationId) {
      setTeams([]);
      setMembers([]);
      setRoles([]);
      setRoleAssignments([]);
      setPendingPolicies([]);
      setDistributions([]);
      setEffectivePolicies(null);
      setProjects([]);
      setTeamId("");
      setProjectId("");
      return;
    }
    let cancelled = false;
    void run("加载组织数据", async () => {
      const [teamList, memberList, roleList] = await Promise.all([
        api.listTeams(organizationId),
        api.listOrganizationMembers(organizationId),
        api.listRoles(organizationId),
      ]);
      if (cancelled) return;
      setTeams(teamList);
      setMembers(memberList);
      setRoles(roleList);
      setTeamId(teamList[0]?.id || "");
      setProjectId("");
      // 后续请求不阻塞首屏。
      const followUps = [
        api
          .listRoleAssignments(organizationId)
          .then(setRoleAssignments)
          .catch(() => setRoleAssignments([])),
        api
          .listPolicyDistributions(organizationId)
          .then(setDistributions)
          .catch(() => setDistributions([])),
        api
          .listPendingPolicyChanges(organizationId)
          .then(setPendingPolicies)
          .catch(() => setPendingPolicies([])),
      ];
      void Promise.allSettled(followUps);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [organizationId, run]);

  /**
   * 切换团队时重新拉取项目和团队成员。
   */
  useEffect(() => {
    if (!organizationId || !teamId) {
      setProjects([]);
      setTeamMembers([]);
      setEffectivePolicies(null);
      return;
    }
    let cancelled = false;
    void run("加载团队", async () => {
      const [projectList, memberList] = await Promise.all([
        api.listProjects(organizationId, teamId),
        api.listTeamMembers(teamId),
      ]);
      if (cancelled) return;
      setProjects(projectList);
      setTeamMembers(memberList);
      setProjectId(projectList[0]?.id || "");
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [organizationId, teamId, run]);

  /**
   * 切换项目时拉取生效规范。
   */
  useEffect(() => {
    if (!organizationId || !teamId || !projectId) {
      setEffectivePolicies(null);
      return;
    }
    let cancelled = false;
    api
      .getEffectivePolicies(organizationId, teamId, projectId)
      .then((value) => {
        if (!cancelled) setEffectivePolicies(value);
      })
      .catch(() => {
        if (!cancelled) setEffectivePolicies(null);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, teamId, projectId]);

  /* eslint-enable react-hooks/set-state-in-effect */


  /**
   * 显式触发全部数据刷新，主要供顶栏"刷新"按钮使用。
   */
  const refresh = useCallback(async () => {
    if (!organizationId) return;
    await run("刷新", async () => {
      const [teamList, memberList, roleList, projectList] = await Promise.all([
        api.listTeams(organizationId),
        api.listOrganizationMembers(organizationId),
        api.listRoles(organizationId),
        teamId
          ? api.listProjects(organizationId, teamId)
          : Promise.resolve([] as Project[]),
      ]);
      setTeams(teamList);
      setMembers(memberList);
      setRoles(roleList);
      if (teamId) setProjects(projectList);
    });
  }, [organizationId, teamId, run]);

  const createOrganization = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      await run("创建组织", async () => {
        const item = await api.createOrganization(trimmed);
        setOrganizations((current) => [...current, item]);
        setOrganizationId(item.id);
      });
    },
    [run],
  );

  const createTeam = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || !organizationId) return;
      await run("创建团队", async () => {
        const item = await api.createTeam(organizationId, trimmed);
        setTeams((current) => [...current, item]);
        setTeamId(item.id);
      });
    },
    [organizationId, run],
  );

  const createProject = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || !organizationId || !teamId) return;
      await run("创建项目", async () => {
        const item = await api.createProject(organizationId, teamId, trimmed);
        setProjects((current) => [...current, item]);
        setProjectId(item.id);
      });
    },
    [organizationId, teamId, run],
  );

  const addOrganizationMember = useCallback(
    async (userId: string) => {
      const trimmed = userId.trim();
      if (!trimmed || !organizationId) return;
      await run("添加成员", async () => {
        const item = await api.addOrganizationMember(organizationId, trimmed);
        setMembers((current) => [...current, item]);
      });
    },
    [organizationId, run],
  );

  const updateOrganizationMember = useCallback(
    async (memberId: string, action: "enable" | "disable" | "remove") => {
      if (!organizationId) return;
      await run("成员" + action, async () => {
        if (action === "enable") {
          await api.enableOrganizationMember(organizationId, memberId);
          setMembers((current) =>
            current.map((m) =>
              m.id === memberId ? { ...m, status: "ACTIVE" } : m,
            ),
          );
        } else if (action === "disable") {
          await api.disableOrganizationMember(organizationId, memberId);
          setMembers((current) =>
            current.map((m) =>
              m.id === memberId ? { ...m, status: "DISABLED" } : m,
            ),
          );
        } else {
          await api.removeOrganizationMember(organizationId, memberId);
          setMembers((current) => current.filter((m) => m.id !== memberId));
        }
      });
    },
    [organizationId, run],
  );

  const enableOrganizationMember = useCallback(
    (id: string) => updateOrganizationMember(id, "enable"),
    [updateOrganizationMember],
  );
  const disableOrganizationMember = useCallback(
    (id: string) => updateOrganizationMember(id, "disable"),
    [updateOrganizationMember],
  );
  const removeOrganizationMember = useCallback(
    (id: string) => updateOrganizationMember(id, "remove"),
    [updateOrganizationMember],
  );

  const updateTeamMember = useCallback(
    async (
      organizationMemberId: string,
      action: "enable" | "disable" | "remove",
    ) => {
      if (!teamId) return;
      await run("团队成员" + action, async () => {
        if (action === "enable") {
          await api.enableTeamMember(teamId, organizationMemberId);
        } else if (action === "disable") {
          await api.disableTeamMember(teamId, organizationMemberId);
        } else {
          await api.removeTeamMember(teamId, organizationMemberId);
        }
        const fresh = await api.listTeamMembers(teamId);
        setTeamMembers(fresh);
      });
    },
    [teamId, run],
  );

  const addTeamMember = useCallback(
    async (organizationMemberId: string) => {
      if (!teamId || !organizationMemberId) return;
      await run("添加团队成员", async () => {
        await api.addTeamMember(teamId, organizationMemberId);
        const fresh = await api.listTeamMembers(teamId);
        setTeamMembers(fresh);
      });
    },
    [teamId, run],
  );

  const enableTeamMember = useCallback(
    (organizationMemberId: string) =>
      updateTeamMember(organizationMemberId, "enable"),
    [updateTeamMember],
  );
  const disableTeamMember = useCallback(
    (organizationMemberId: string) =>
      updateTeamMember(organizationMemberId, "disable"),
    [updateTeamMember],
  );
  const removeTeamMember = useCallback(
    (organizationMemberId: string) =>
      updateTeamMember(organizationMemberId, "remove"),
    [updateTeamMember],
  );

  const submitPolicyChange = useCallback(
    async (input: {
      policyType: "AGENT" | "CLAUDE";
      content: string;
      message: string;
    }) => {
      if (!organizationId) return;
      await run("提交规范申请", async () => {
        await api.submitPolicyChange(organizationId, input);
        const fresh = await api.listPendingPolicyChanges(organizationId);
        setPendingPolicies(fresh);
      });
    },
    [organizationId, run],
  );

  const reviewPolicyChange = useCallback(
    async (requestId: string, decision: "APPROVED" | "REJECTED") => {
      if (!organizationId) return;
      await run("审核规范申请", async () => {
        await api.reviewPolicyChange(organizationId, requestId, decision);
        setPendingPolicies((current) =>
          current.filter((p) => p.id !== requestId),
        );
      });
    },
    [organizationId, run],
  );

  const loadPolicyHistory = useCallback(
    async (policyType: "AGENT" | "CLAUDE") => {
      if (!organizationId) return;
      await run("加载版本历史", async () => {
        const items = await api.listPolicyHistory(organizationId, policyType);
        setPolicyVersions(items);
      });
    },
    [organizationId, run],
  );

  const withdrawDistribution = useCallback(
    async (distributionId: string) => {
      if (!organizationId) return;
      await run("撤回分发", async () => {
        await api.withdrawPolicyDistribution(organizationId, distributionId);
        setDistributions((current) =>
          current.map((d) =>
            d.id === distributionId ? { ...d, withdrawn: true } : d,
          ),
        );
      });
    },
    [organizationId, run],
  );

  const assignRole = useCallback(
    async (input: { organizationMemberId: string; roleId: string }) => {
      if (!organizationId) return;
      await run("分配角色", async () => {
        await api.assignRole(organizationId, {
          organizationMemberId: input.organizationMemberId,
          roleId: input.roleId,
        });
        const fresh = await api.listRoleAssignments(organizationId);
        setRoleAssignments(fresh);
      });
    },
    [organizationId, run],
  );

  const revokeRoleAssignment = useCallback(
    async (assignmentId: string) => {
      if (!organizationId) return;
      await run("撤销角色", async () => {
        await api.revokeRole(organizationId, assignmentId);
        setRoleAssignments((current) =>
          current.filter((a) => a.id !== assignmentId),
        );
      });
    },
    [organizationId, run],
  );

  return useMemo(
    () => ({
      organizations,
      teams,
      projects,
      members,
      teamMembers,
      roles,
      roleAssignments,
      pendingPolicies,
      policyVersions,
      distributions,
      effectivePolicies,
      organizationId,
      teamId,
      projectId,
      error,
      busy,
      setOrganizationId,
      setTeamId,
      setProjectId,
      refresh,
      createOrganization,
      createTeam,
      createProject,
      addOrganizationMember,
      enableOrganizationMember,
      disableOrganizationMember,
      removeOrganizationMember,
      addTeamMember,
      enableTeamMember,
      disableTeamMember,
      removeTeamMember,
      submitPolicyChange,
      reviewPolicyChange,
      loadPolicyHistory,
      withdrawDistribution,
      assignRole,
      revokeRoleAssignment,
    }),
    [
      organizations,
      teams,
      projects,
      members,
      teamMembers,
      roles,
      roleAssignments,
      pendingPolicies,
      policyVersions,
      distributions,
      effectivePolicies,
      organizationId,
      teamId,
      projectId,
      error,
      busy,
      refresh,
      createOrganization,
      createTeam,
      createProject,
      addOrganizationMember,
      enableOrganizationMember,
      disableOrganizationMember,
      removeOrganizationMember,
      addTeamMember,
      enableTeamMember,
      disableTeamMember,
      removeTeamMember,
      submitPolicyChange,
      reviewPolicyChange,
      loadPolicyHistory,
      withdrawDistribution,
      assignRole,
      revokeRoleAssignment,
    ],
  );
}
