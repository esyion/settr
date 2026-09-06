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


/** Multipart part:由前端传入,Rust 端负责构造 multipart/form-data body。 */
export interface NativeApiUploadPart {
  name: string;
  filename?: string;
  contentType?: string;
  /** 字节内容;文本 part 可传入 UTF-8 编码后的字节。 */
  data: number[];
}

export interface NativeApiUploadInput {
  baseUrl: string;
  path: string;
  parts: NativeApiUploadPart[];
  accessToken?: string | null;
}

/**
 * Multipart 上传到后端:经 Tauri IPC 调 Rust {@code api_upload} 命令。
 * <p>
 * 前端不直接用 fetch;所有网络请求统一走 IPC gateway,以便 Rust 端统一控制
 * 路径白名单、HTTPS-only 校验、超时与 User-Agent。
 */
export async function nativeApiUpload(input: NativeApiUploadInput): Promise<NativeApiResponse> {
  if (!isTauriRuntime())
    throw new Error(
      "DESKTOP_RUNTIME_REQUIRED:请在 Agents Plus 桌面应用中使用此功能",
    );
  return invokeNative<NativeApiResponse>("api_upload", {
    baseUrl: input.baseUrl,
    path: input.path,
    parts: input.parts,
    accessToken: input.accessToken ?? null,
    requestId: crypto.randomUUID(),
  });
}
