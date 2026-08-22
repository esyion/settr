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
      typeof parsed.sessionId !== "string"
    )
      return null;
    return parsed as AuthSession;
  } catch {
    return null;
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
  memorySession = session;
  await invokeNative("save_auth_session", { session: JSON.stringify(session) });
}
export async function clearSession(): Promise<void> {
  memorySession = null;
  await invokeNative("clear_auth_session");
}
export function getMemorySession(): AuthSession | null {
  return memorySession ?? null;
}
