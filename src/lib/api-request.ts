import type { ApiErrorDetails, ApiResponse } from "@/lib/contracts";
import {
  clearSession,
  loadSession,
  saveSession,
} from "@/lib/session-store";
import {
  invokeNative,
  isTauriRuntime,
  nativeApiRequest,
} from "@/lib/tauri";
import type { AuthSession, TokenResponse } from "@/lib/contracts";

/**
 * 编译期兜底地址:仅用于非桌面环境(浏览器直接访问静态导出页面)或用户尚未配置时。
 * 桌面运行时的真实地址始终来自用户设置(Rust 侧 settings.json)。
 */
const FALLBACK_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:19999"
).replace(/\/$/, "");

let cachedBaseUrl: string | null = null;

/**
 * 获取当前后端地址。
 * <p>
 * 桌面运行时读取用户设置(get_settings)并缓存;非桌面环境回退编译期默认。
 * 缓存通过 saveApiBaseUrl 更新,保证设置页保存后立即生效。
 */
export async function getApiBaseUrl(): Promise<string> {
  if (cachedBaseUrl) return cachedBaseUrl;
  if (!isTauriRuntime()) return FALLBACK_BASE_URL;
  const settings = await invokeNative<{ apiBaseUrl: string }>("get_settings");
  cachedBaseUrl = settings.apiBaseUrl.replace(/\/$/, "");
  return cachedBaseUrl;
}

/**
 * 保存后端地址到用户设置(经 IPC 由 Rust 校验并持久化),并刷新本地缓存。
 * <p>
 * 校验规则(格式、HTTPS-only)以 Rust 侧为最终约束;失败时抛出携带原因的异常。
 */
export async function saveApiBaseUrl(rawUrl: string): Promise<string> {
  const settings = await invokeNative<{ apiBaseUrl: string }>("update_settings", {
    request: { apiBaseUrl: rawUrl },
  });
  cachedBaseUrl = settings.apiBaseUrl.replace(/\/$/, "");
  return cachedBaseUrl;
}
/**
 * 用户设置 IPC DTO(camelCase,与 Rust SettingsDto 对应)。
 */
export interface AppSettingsDto {
  apiBaseUrl: string;
  closeToTray: boolean;
  startupCheck: boolean;
}

/**
 * 读取全量用户设置(桌面运行时);非桌面环境返回编译期默认。
 */
export async function getSettings(): Promise<AppSettingsDto> {
  if (!isTauriRuntime()) {
    return { apiBaseUrl: FALLBACK_BASE_URL, closeToTray: true, startupCheck: true };
  }
  const settings = await invokeNative<AppSettingsDto>("get_settings");
  cachedBaseUrl = settings.apiBaseUrl.replace(/\/$/, "");
  return settings;
}

/**
 * 保存"关闭到托盘"开关;返回更新后的全量设置。
 * <p>
 * 后端地址传当前缓存值(Rust 端保持原值),仅覆盖开关字段。
 */
export async function saveCloseToTray(closeToTray: boolean): Promise<AppSettingsDto> {
  const settings = await invokeNative<AppSettingsDto>("update_settings", {
    request: { apiBaseUrl: await getApiBaseUrl(), closeToTray },
  });
  cachedBaseUrl = settings.apiBaseUrl.replace(/\/$/, "");
  return settings;
}
/**
 * 保存"启动时检查"开关;返回更新后的全量设置。
 */
export async function saveStartupCheck(startupCheck: boolean): Promise<AppSettingsDto> {
  const settings = await invokeNative<AppSettingsDto>("update_settings", {
    request: { apiBaseUrl: await getApiBaseUrl(), startupCheck },
  });
  cachedBaseUrl = settings.apiBaseUrl.replace(/\/$/, "");
  return settings;
}
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
          baseUrl: await getApiBaseUrl(),
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
    baseUrl: await getApiBaseUrl(),
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