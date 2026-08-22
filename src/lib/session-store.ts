import type { AuthSession } from "@/lib/contracts";
import { invokeNative } from "@/lib/tauri";

let memorySession: AuthSession | null | undefined;
let pendingLoad: Promise<AuthSession | null> | null = null;

function parseSession(value: string | null): AuthSession | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<AuthSession>;
    if (
      typeof parsed.accessToken !== "string" ||
      typeof parsed.refreshToken !== "string" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.deviceId !== "string" ||
      typeof parsed.sessionId !== "string" ||
      (parsed.accessTokenExpiresAt !== undefined && typeof parsed.accessTokenExpiresAt !== "number")
    ) {
      throw new Error("SESSION_INVALID:系统凭据中的登录会话格式无效");
    }
    return {
      ...(parsed as AuthSession),
      // 兼容旧版本已保存的会话；缺少过期时间时立即走 refresh token 轮换。
      accessTokenExpiresAt: typeof parsed.accessTokenExpiresAt === "number" ? parsed.accessTokenExpiresAt : 0,
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("SESSION_INVALID:")) throw error;
    throw new Error("SESSION_INVALID:系统凭据中的登录会话无法解析");
  }
}

export async function loadSession(): Promise<AuthSession | null> {
  if (memorySession !== undefined) return memorySession;
  if (!pendingLoad) {
    pendingLoad = invokeNative<string | null>("get_auth_session")
      .then((value) => {
        memorySession = parseSession(value);
        return memorySession;
      })
      .finally(() => {
        pendingLoad = null;
      });
  }
  return pendingLoad;
}

export async function saveSession(session: AuthSession): Promise<void> {
  await invokeNative("save_auth_session", { session: JSON.stringify(session) });
  const persisted = await invokeNative<string | null>("get_auth_session");
  const parsed = parseSession(persisted);
  if (!parsed || parsed.refreshToken !== session.refreshToken || parsed.sessionId !== session.sessionId) {
    throw new Error("SESSION_NOT_PERSISTED:登录会话未能写入系统凭据存储");
  }
  memorySession = session;
}

export async function clearSession(): Promise<void> {
  await invokeNative("clear_auth_session");
  memorySession = null;
}

export function getMemorySession(): AuthSession | null {
  return memorySession ?? null;
}
