import type {
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
import { request, ApiClientError } from "@/lib/api-request";
import { organizationApi } from "@/lib/api-organization";
import { policyApi } from "@/lib/api-policy";
import {
  skillApi,
  SkillDistribution,
  DistributeSkillRequestBody,
} from "@/lib/api-skill";
import { invokeNative } from "@/lib/tauri";
import { DOCUMENT_FORMAT_CONFIGS } from "@/lib/document-formats";
import {
  clearSession,
  getMemorySession,
  saveSession,
} from "@/lib/session-store";

// Re-export types and classes consumed by feature modules.
export { ApiClientError };
export type { SkillDistribution, DistributeSkillRequestBody };

export const api = {
  ...organizationApi,
  ...policyApi,
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
  ...skillApi,
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
