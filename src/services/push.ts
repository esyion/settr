import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invokeNative, isTauriRuntime } from "@/lib/tauri";

/**
 * 组织推送的 IPC 网关:封装 push_connect / push_disconnect / push_status
 * 三个 Rust 命令,以及 push://status、push://org-change 两个 webview 事件。
 *
 * 推送连接由 Rust 侧持有(reqwest 长连接);本网关只负责发起、停止与监听,
 * 不维护连接状态机——生命周期由 usePushEvents hook 驱动。
 */

/** 连接状态事件名(与 src-tauri infrastructure/sse_client.rs 约定一致)。 */
export const PUSH_STATUS_EVENT = "push://status";
/** 组织变更信号事件名(与 src-tauri infrastructure/sse_client.rs 约定一致)。 */
export const PUSH_CHANGE_EVENT = "push://org-change";

/** push://status 事件的载荷。 */
export interface PushStatusPayload {
  /** connected:已连上;disconnected:断开(自动重连中);unauthorized:凭据失效已停止 */
  state: "connected" | "disconnected" | "unauthorized";
}

/** push://org-change 事件的载荷(与服务端 SseChangePayload 对应)。 */
export interface PushChangePayload {
  /** 发生变化的组织 ID */
  organizationId: string;
  /** 变更类型(POLICY / SKILL) */
  changeType: string;
  /** 组织当前最新变更游标 id */
  changeId: string;
}

/** push_connect / push_disconnect 的响应。 */
export interface PushStatusResult {
  /** 是否存在登记中的连接 */
  connected: boolean;
  /** 当前订阅的组织 ID;未连接时为 null */
  organizationId: string | null;
}

/** push_connect 入参。 */
export interface PushConnectInput {
  /** 后端 API base URL(与设置页 apiBaseUrl 同源) */
  baseUrl: string;
  /** 当前登录会话的 access token */
  accessToken: string;
  /** 订阅的组织 ID */
  organizationId: string;
}

/**
 * 打开组织推送连接(SSE)。重复调用会替换旧连接;凭据失效时 Rust 侧停止,
 * 需以新 token 重新调用。
 *
 * @param input 连接参数
 */
export async function pushConnect(input: PushConnectInput): Promise<PushStatusResult> {
  if (!isTauriRuntime()) {
    throw new Error("DESKTOP_RUNTIME_REQUIRED:请在 Agents Plus 桌面应用中使用此功能");
  }
  return invokeNative<PushStatusResult>("push_connect", { request: input });
}

/**
 * 关闭组织推送连接(幂等):登出或切回个人空间时调用。
 */
export async function pushDisconnect(): Promise<PushStatusResult> {
  if (!isTauriRuntime()) {
    throw new Error("DESKTOP_RUNTIME_REQUIRED:请在 Agents Plus 桌面应用中使用此功能");
  }
  return invokeNative<PushStatusResult>("push_disconnect");
}

/**
 * 查询推送连接登记状态(供窗口重载后对齐状态;连通性以 push://status 为准)。
 */
export async function pushStatus(): Promise<PushStatusResult> {
  if (!isTauriRuntime()) {
    throw new Error("DESKTOP_RUNTIME_REQUIRED:请在 Agents Plus 桌面应用中使用此功能");
  }
  return invokeNative<PushStatusResult>("push_status");
}

/**
 * 订阅连接状态变化。
 *
 * @param handler 状态回调
 * @returns 取消监听函数
 */
export async function onPushStatus(
  handler: (payload: PushStatusPayload) => void,
): Promise<UnlistenFn> {
  return listen<PushStatusPayload>(PUSH_STATUS_EVENT, (event) => handler(event.payload));
}

/**
 * 订阅组织变更信号。
 *
 * @param handler 变更回调
 * @returns 取消监听函数
 */
export async function onPushChange(
  handler: (payload: PushChangePayload) => void,
): Promise<UnlistenFn> {
  return listen<PushChangePayload>(PUSH_CHANGE_EVENT, (event) => handler(event.payload));
}
