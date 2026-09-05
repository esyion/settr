import type {
  Organization,
  Project,
  Team,
} from "@/lib/contracts";

export type { Organization, Project, Team };

/**
 * teams feature 数据中枢对外接口。
 */
export interface TeamsDataApi {
  organizations: Organization[];
  teams: Team[];
  projects: Project[];
  organizationId: string;
  teamId: string;
  projectId: string;
  error: string | null;
  busy: string | null;
  setTeamId: (id: string) => void;
  setProjectId: (id: string) => void;
  refresh: () => Promise<void>;
  createTeam: (name: string) => Promise<void>;
  createProject: (name: string) => Promise<void>;
  deleteOrganization: () => Promise<void>;
  renameOrganization: (name: string) => Promise<void>;
  deleteTeam: (teamId: string) => Promise<void>;
  renameTeam: (teamId: string, name: string) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  renameProject: (projectId: string, name: string) => Promise<void>;
}