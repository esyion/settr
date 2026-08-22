import { invoke } from "@tauri-apps/api/core";
export interface NativeApiResponse {
  status: number;
  body: string;
  requestId: string | null;
}
export const isTauriRuntime = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export function invokeNative<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  return invoke<T>(command, args);
}
export async function nativeApiRequest(input: {
  baseUrl: string;
  method: string;
  path: string;
  body?: unknown;
  accessToken?: string | null;
}): Promise<NativeApiResponse> {
  if (!isTauriRuntime())
    throw new Error(
      "DESKTOP_RUNTIME_REQUIRED:请在 Agents Plus 桌面应用中使用此功能",
    );
  return invokeNative<NativeApiResponse>("api_request", {
    baseUrl: input.baseUrl,
    method: input.method,
    path: input.path,
    body: input.body === undefined ? null : JSON.stringify(input.body),
    accessToken: input.accessToken ?? null,
    requestId: crypto.randomUUID(),
  });
}
