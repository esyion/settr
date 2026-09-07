import type {
  ApiErrorDetails,
  ApiResponse,
  ApiPage,
} from "@/lib/contracts";
import {
  clearSession,
  loadSession,
  saveSession,
} from "@/lib/session-store";
import { nativeApiRequest } from "@/lib/tauri";
import type { AuthSession, TokenResponse } from "@/lib/contracts";

export const API_BASE_URL = (
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

export function parseEnvelope<T>(response: {
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

export async function request<T>(
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