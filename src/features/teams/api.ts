import { api } from "@/lib/api-client";

/**
 * teams feature API 客户端：对 /api/v1/organizations/{orgId}/teams 与
 * /teams/{teamId}/projects 的薄封装。
 */
export const teamsApi = {
  listTeams: (orgId: string) => api.listTeams(orgId),
  createTeam: (orgId: string, name: string) => api.createTeam(orgId, name),
  listProjects: (orgId: string, teamId: string) =>
    api.listProjects(orgId, teamId),
  createProject: (orgId: string, teamId: string, name: string) =>
    api.createProject(orgId, teamId, name),
};