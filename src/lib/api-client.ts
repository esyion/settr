import type {
  ApiErrorDetails,
  ApiResponse,
  AuthSession,
  CurrentUser,
  Device,
  DeviceIdentity,
  Document,
  DocumentFormat,
  LocalSnapshot,
  PasswordResetResponse,
  Revision,
  RevisionSummary,
  TokenResponse,
  ApiPage,
} from "@/lib/contracts";
import { nativeApiRequest, invokeNative } from "@/lib/tauri";
import { DOCUMENT_FORMAT_CONFIGS } from "@/lib/document-formats";
import {
  clearSession,
  getMemorySession,
  loadSession,
  saveSession,
} from "@/lib/session-store";
const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:19999"
).replace(/\/$/, "");
const REFRESH_PATH = "/api/v1/auth/refresh";
let refreshPromise: Promise<AuthSession | null> | null = null;
export class ApiClientError extends Error {
  readonly code: number;
  readonly status: number;
  readonly details: ApiErrorDetails | null;
  readonly requestId: string | null;
  constructor(
    message: string,
    code: number,
    status: number,
    details: ApiErrorDetails | null,
    requestId: string | null,
  ) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }
}
function parseEnvelope<T>(response: {
  status: number;
  body: string;
  requestId: string | null;
}): T {
  let envelope: ApiResponse<T>;
  try {
    envelope = JSON.parse(response.body) as ApiResponse<T>;
  } catch {
    throw new ApiClientError(
      "后端返回了无法识别的响应",
      50000,
      response.status,
      null,
      response.requestId,
    );
  }
  if (envelope.code !== 0 || response.status >= 400)
    throw new ApiClientError(
      envelope.message || "请求失败",
      envelope.code || response.status,
      response.status,
      (envelope.data as ApiErrorDetails | null) ?? null,
      envelope.requestId ?? response.requestId,
    );
  return envelope.data;
}
async function refreshAccessToken(): Promise<AuthSession | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const session = await loadSession();
      if (!session?.refreshToken) return null;
      try {
        const result = await nativeApiRequest({
          baseUrl: API_BASE_URL,
          method: "POST",
          path: REFRESH_PATH,
          body: {
            refreshToken: session.refreshToken,
            deviceId: session.deviceId,
          },
        });
        const token = parseEnvelope<TokenResponse>(result);
        const next: AuthSession = {
          ...token,
          accessTokenExpiresAt:
            Date.now() + token.accessTokenExpiresInSeconds * 1000,
        };
        await saveSession(next);
        return next;
      } catch (error) {
        if (
          error instanceof ApiClientError &&
          [40103, 40102, 40100].includes(error.code)
        )
          await clearSession();
        return null;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function request<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    auth?: boolean;
    retry?: boolean;
  } = {},
): Promise<T> {
  const session = options.auth === false ? null : await loadSession();
  const activeSession =
    session && session.accessTokenExpiresAt <= Date.now() + 15_000
      ? await refreshAccessToken()
      : session;
  if (options.auth !== false && !activeSession) {
    throw new ApiClientError(
      "登录会话不存在或无法恢复，请重新登录",
      40100,
      401,
      null,
      null,
    );
  }
  const response = await nativeApiRequest({
    baseUrl: API_BASE_URL,
    method: options.method || "GET",
    path,
    body: options.body,
    accessToken: activeSession?.accessToken,
  });
  try {
    return parseEnvelope<T>(response);
  } catch (error) {
    if (
      options.auth !== false &&
      options.retry !== false &&
      error instanceof ApiClientError &&
      [40100, 40102].includes(error.code)
    ) {
      const refreshed = await refreshAccessToken();
      if (refreshed) return request<T>(path, { ...options, retry: false });
    }
    throw error;
  }
}

export const api = {
  listOrganizations: () =>
    request<import("@/lib/contracts").Organization[]>("/api/v1/organizations"),
  createOrganization: (name: string) =>
    request<import("@/lib/contracts").Organization>("/api/v1/organizations", {
      method: "POST",
      body: { name },
    }),
  createTeam: (organizationId: string, name: string) =>
    request<import("@/lib/contracts").Team>(
      "/api/v1/organizations/" + encodeURIComponent(organizationId) + "/teams",
      { method: "POST", body: { name } },
    ),
  createProject: (organizationId: string, teamId: string, name: string) =>
    request<import("@/lib/contracts").Project>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/teams/" +
        encodeURIComponent(teamId) +
        "/projects",
      { method: "POST", body: { name } },
    ),
  enableOrganizationMember: (organizationId: string, memberId: string) =>
    request<void>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/members/" +
        encodeURIComponent(memberId) +
        "/enable",
      { method: "POST" },
    ),
  disableOrganizationMember: (organizationId: string, memberId: string) =>
    request<void>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/members/" +
        encodeURIComponent(memberId) +
        "/disable",
      { method: "POST" },
    ),
  removeOrganizationMember: (organizationId: string, memberId: string) =>
    request<void>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/members/" +
        encodeURIComponent(memberId),
      { method: "DELETE" },
    ),
  enableTeamMember: (teamId: string, memberId: string) =>
    request<void>(
      "/api/v1/teams/" +
        encodeURIComponent(teamId) +
        "/members/" +
        encodeURIComponent(memberId) +
        "/enable",
      { method: "POST" },
    ),
  disableTeamMember: (teamId: string, memberId: string) =>
    request<void>(
      "/api/v1/teams/" +
        encodeURIComponent(teamId) +
        "/members/" +
        encodeURIComponent(memberId) +
        "/disable",
      { method: "POST" },
    ),
  addOrganizationMember: (organizationId: string, userId: string) =>
    request<import("@/lib/contracts").OrganizationMember>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/members",
      { method: "POST", body: { userId } },
    ),
  listTeams: (organizationId: string) =>
    request<import("@/lib/contracts").Team[]>(
      "/api/v1/organizations/" + encodeURIComponent(organizationId) + "/teams",
    ),
  listTeamMembers: (teamId: string) =>
    request<import("@/lib/contracts").TeamMember[]>(
      "/api/v1/teams/" + encodeURIComponent(teamId) + "/members",
    ),
  addTeamMember: (teamId: string, organizationMemberId: string) =>
    request<import("@/lib/contracts").TeamMember>(
      "/api/v1/teams/" + encodeURIComponent(teamId) + "/members",
      { method: "POST", body: { organizationMemberId } },
    ),
  removeTeamMember: (teamId: string, memberId: string) =>
    request<void>(
      "/api/v1/teams/" +
        encodeURIComponent(teamId) +
        "/members/" +
        encodeURIComponent(memberId),
      { method: "DELETE" },
    ),
  listProjects: (organizationId: string, teamId: string) =>
    request<import("@/lib/contracts").Project[]>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/teams/" +
        encodeURIComponent(teamId) +
        "/projects",
    ),
  listOrganizationMembers: (organizationId: string) =>
    request<import("@/lib/contracts").OrganizationMember[]>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/members",
    ),
  getEffectivePolicies: (
    organizationId: string,
    teamId: string,
    projectId: string,
  ) =>
    request<import("@/lib/contracts").EffectivePolicies>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/policies/effective?teamId=" +
        encodeURIComponent(teamId) +
        "&projectId=" +
        encodeURIComponent(projectId),
    ),
  listRoles: (organizationId: string) =>
    request<import("@/lib/contracts").RoleResponse[]>(
      "/api/v1/organizations/" + encodeURIComponent(organizationId) + "/roles",
    ),
  listRoleAssignments: (organizationId: string) =>
    request<import("@/lib/contracts").RoleAssignment[]>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/roles/assignments",
    ),
  revokeRole: (organizationId: string, assignmentId: string) =>
    request<void>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/roles/" +
        encodeURIComponent(assignmentId),
      { method: "DELETE" },
    ),
  withdrawPolicyDistribution: (
    organizationId: string,
    distributionId: string,
  ) =>
    request<import("@/lib/contracts").PolicyDistribution>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/policies/distributions/" +
        encodeURIComponent(distributionId),
      { method: "DELETE" },
    ),
  listPolicyDistributions: (organizationId: string) =>
    request<import("@/lib/contracts").PolicyDistribution[]>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/policies/distributions",
    ),
  assignRole: (
    organizationId: string,
    input: {
      organizationMemberId: string;
      roleId: string;
      teamId?: string;
      projectId?: string;
    },
  ) =>
    request<import("@/lib/contracts").RoleResponse>(
      "/api/v1/organizations/" + encodeURIComponent(organizationId) + "/roles",
      { method: "POST", body: input },
    ),
  submitPolicyChange: (
    organizationId: string,
    input: { policyType: "AGENT" | "CLAUDE"; content: string; message: string },
  ) =>
    request<import("@/lib/contracts").PolicyChange>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/policies/changes",
      { method: "POST", body: input },
    ),
  listPendingPolicyChanges: (organizationId: string) =>
    request<import("@/lib/contracts").PendingPolicyRequest[]>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/policies/changes/pending",
    ),
  distributePolicy: (
    organizationId: string,
    input: {
      versionId: string;
      scopeType: string;
      teamId?: string;
      projectId?: string;
      memberId?: string;
    },
  ) =>
    request<import("@/lib/contracts").PolicyDistribution>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/policies/distributions",
      { method: "POST", body: input },
    ),
  reviewPolicyChange: (
    organizationId: string,
    requestId: string,
    decision: "APPROVED" | "REJECTED",
    comment?: string,
  ) =>
    request<import("@/lib/contracts").PolicyChange>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/policies/changes/" +
        encodeURIComponent(requestId) +
        "/review",
      { method: "POST", body: { decision, comment } },
    ),
  listPolicyHistory: (organizationId: string, policyType: "AGENT" | "CLAUDE") =>
    request<import("@/lib/contracts").PolicyVersion[]>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/policies/history?policyType=" +
        policyType,
    ),
  register: (email: string, password: string) =>
    request<CurrentUser>("/api/v1/auth/register", {
      method: "POST",
      auth: false,
      body: { email, password },
    }),
  login: async (input: {
    email: string;
    password: string;
    identity: DeviceIdentity;
  }) => {
    const token = await request<TokenResponse>("/api/v1/auth/login", {
      method: "POST",
      auth: false,
      body: {
        email: input.email,
        password: input.password,
        deviceId: input.identity.deviceId,
        deviceName: input.identity.deviceName,
        platform: input.identity.platform,
        appVersion: input.identity.appVersion,
      },
    });
    const session: AuthSession = {
      ...token,
      accessTokenExpiresAt:
        Date.now() + token.accessTokenExpiresInSeconds * 1000,
    };
    await saveSession(session);
    return session;
  },
  logout: async () => {
    try {
      await request<void>("/api/v1/auth/logout", { method: "POST" });
    } finally {
      await clearSession();
    }
  },
  requestPasswordReset: (email: string) =>
    request<PasswordResetResponse>("/api/v1/auth/forgot-password", {
      method: "POST",
      auth: false,
      body: { email: email.trim() },
    }),
  confirmPasswordReset: (token: string, newPassword: string) =>
    request<PasswordResetResponse>("/api/v1/auth/reset-password", {
      method: "POST",
      auth: false,
      body: { token, newPassword },
    }),
  me: () => request<CurrentUser>("/api/v1/auth/me"),
  devices: () => request<Device[]>("/api/v1/devices"),
  heartbeat: (deviceId: string) =>
    request<Device>(
      "/api/v1/devices/" + encodeURIComponent(deviceId) + "/heartbeat",
      { method: "POST" },
    ),
  renameDevice: (deviceId: string, deviceName: string) =>
    request<Device>("/api/v1/devices/" + encodeURIComponent(deviceId), {
      method: "PATCH",
      body: { deviceName },
    }),
  revokeDevice: (deviceId: string) =>
    request<void>("/api/v1/devices/" + encodeURIComponent(deviceId), {
      method: "DELETE",
    }),
  document: (format: DocumentFormat) =>
    request<Document>(
      "/api/v1/documents/" + DOCUMENT_FORMAT_CONFIGS[format].apiSlug,
    ),
  documentHead: (documentId: string) =>
    request<Document>(
      "/api/v1/documents/" + encodeURIComponent(documentId) + "/head"
    ),
  /**
   * 获取单个版本详情；版本标识为空时直接返回 null，避免拼接出 /revisions/null。
   */
  revision: (documentId: string, revisionId: string | null | undefined) => {
    if (!revisionId) {
      return Promise.resolve<Revision | null>(null);
    }
    return request<Revision>(
      "/api/v1/documents/" +
        encodeURIComponent(documentId) +
        "/revisions/" +
        encodeURIComponent(revisionId),
    );
  },
  revisions: (documentId: string, page = 1, size = 20) =>
    request<ApiPage<RevisionSummary>>(
      "/api/v1/documents/" +
        encodeURIComponent(documentId) +
        "/revisions?page=" +
        page +
        "&size=" +
        size,
    ),
  submitRevision: (
    documentId: string,
    input: {
      parentRevisionId: string | null;
      content: string;
      contentHash: string;
      message: string;
      clientMutationId: string;
      metadata: Record<string, unknown>;
    },
  ) =>
    request<Revision>(
      "/api/v1/documents/" + encodeURIComponent(documentId) + "/revisions",
      { method: "POST", body: input },
    ),
  restoreRevision: (
    documentId: string,
    sourceRevisionId: string,
    message: string,
  ) =>
    request<Revision>(
      "/api/v1/documents/" + encodeURIComponent(documentId) + "/restore",
      {
        method: "POST",
        body: {
          sourceRevisionId,
          clientMutationId: crypto.randomUUID(),
          message,
        },
      },
    ),
};

export async function loadRuntimeSnapshot(
  appVersion: string,
  format: DocumentFormat,
): Promise<{ identity: DeviceIdentity; local: LocalSnapshot }> {
  const [identity, local] = await Promise.all([
    invokeNative<DeviceIdentity>("get_device_identity", { appVersion }),
    invokeNative<LocalSnapshot>("get_local_snapshot", { format }),
  ]);
  return { identity, local };
}

export async function saveLocalManifest(
  format: DocumentFormat,
  manifest: LocalSnapshot["manifest"],
): Promise<LocalSnapshot["manifest"]> {
  return invokeNative("save_local_manifest", { request: { format, manifest } });
}
export async function applyRemoteDocument(
  format: DocumentFormat,
  content: string,
  expectedContentHash: string | null,
  manifest: LocalSnapshot["manifest"],
): Promise<LocalSnapshot> {
  return invokeNative("apply_remote_document", {
    request: { format, content, expectedContentHash, manifest },
  });
}
export function isAuthenticated(): boolean {
  return Boolean(getMemorySession());
}
