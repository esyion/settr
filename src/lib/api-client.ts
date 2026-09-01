import type {
  ApiErrorDetails,
  ApiResponse,
  AuthSession,
  CurrentUser,
  Device,
  DeviceIdentity,
  Document,
  LocalSnapshot,
  PasswordResetResponse,
  Revision,
  RevisionSummary,
  TokenResponse,
  ApiPage,
} from "@/lib/contracts";
import { nativeApiRequest, invokeNative } from "@/lib/tauri";
import {
  clearSession,
  getMemorySession,
  loadSession,
  saveSession,
} from "@/lib/session-store";
const DEFAULT_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:19999";
const REFRESH_PATH = "/api/v1/auth/refresh";
const STORED_API_BASE_URL = typeof window !== "undefined" ? window.localStorage.getItem("agents-plus.api-base-url") : null;
let baseUrl = STORED_API_BASE_URL || DEFAULT_API_BASE_URL;
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
export function getApiBaseUrl() {
  return baseUrl;
}
export function setApiBaseUrl(value: string) {
  const normalized = value.trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(normalized))
    throw new Error("后端地址必须以 http:// 或 https:// 开头");
  baseUrl = normalized;
  if (typeof window !== "undefined") window.localStorage.setItem("agents-plus.api-base-url", normalized);
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
          baseUrl,
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
    throw new ApiClientError("登录会话不存在或无法恢复，请重新登录", 40100, 401, null, null);
  }
  const response = await nativeApiRequest({
    baseUrl,
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
  document: () => request<Document>("/api/v1/documents/agents-md"),
  documentHead: (documentId: string) =>
    request<Document>(
      "/api/v1/documents/" + encodeURIComponent(documentId) + "/head",
    ),
  revision: (documentId: string, revisionId: string) =>
    request<Revision>(
      "/api/v1/documents/" +
        encodeURIComponent(documentId) +
        "/revisions/" +
        encodeURIComponent(revisionId),
    ),
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
): Promise<{ identity: DeviceIdentity; local: LocalSnapshot }> {
  const [identity, local] = await Promise.all([
    invokeNative<DeviceIdentity>("get_device_identity", { appVersion }),
    invokeNative<LocalSnapshot>("get_local_snapshot"),
  ]);
  return { identity, local };
}

export async function saveLocalManifest(
  manifest: LocalSnapshot["manifest"],
): Promise<LocalSnapshot["manifest"]> {
  return invokeNative("save_local_manifest", { request: { manifest } });
}
export async function applyRemoteDocument(
  content: string,
  expectedContentHash: string | null,
  manifest: LocalSnapshot["manifest"],
): Promise<LocalSnapshot> {
  return invokeNative("apply_remote_document", {
    request: { content, expectedContentHash, manifest },
  });
}
export function isAuthenticated(): boolean {
  return Boolean(getMemorySession());
}
