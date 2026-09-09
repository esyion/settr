import { listen } from "@tauri-apps/api/event";
import { isTauriRuntime } from "@/lib/tauri";

/**
 * 应用支持的深链协议头，与后端 agents.auth.password-reset.reset-url-scheme 保持一致。
 */
export const RESET_PASSWORD_SCHEME = "agentsplus";

/**
 * 应用支持的深链 host 段，与后端 agents.auth.password-reset.reset-url-host 保持一致。
 */
export const RESET_PASSWORD_HOST = "reset-password";

/**
 * 邀请深链的 host 段，与后端 agents.auth.invitation.invite-url-host 保持一致，
 * 同时与接受邀请页的路由 /accept-invite 对齐。
 */
export const ACCEPT_INVITE_HOST = "accept-invite";

/**
 * 深链事件名，与 tauri-plugin-deep-link 文档中的 deep-link://new-url 一致。
 */
const DEEP_LINK_EVENT = "deep-link://new-url";

/**
 * 解析后的密码重置深链载荷。
 *
 * @property token 邮件中收到的明文 token，长度为 32~100 字符
 */
export interface ResetDeepLink {
  kind: "reset-password";
  token: string;
}

/**
 * 解析后的组织邀请深链载荷。
 *
 * @property token 邀请邮件或邀请人分享的一次性明文 token
 */
export interface AcceptInviteDeepLink {
  kind: "accept-invite";
  token: string;
}

/**
 * 应用可识别的深链联合类型，便于未来扩展其它动作。
 */
export type AppDeepLink = ResetDeepLink | AcceptInviteDeepLink | null;

/**
 * 把任意 URL 字符串解析成应用可识别的深链载荷；非目标协议或非目标 host 一律返回 null。
 *
 * 深链格式约定：
 * agentsplus://reset-password?token=<token>
 * agentsplus://accept-invite?token=<token>
 *
 * @param raw 深链字符串；为空或非字符串时返回 null
 * @returns 解析结果；无法识别返回 null
 */
export function parseDeepLink(raw: unknown): AppDeepLink {
  if (typeof raw !== "string" || raw.length === 0) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== RESET_PASSWORD_SCHEME + ":") return null;
  const token = (url.searchParams.get("token") || "").trim();
  // 密码重置 token 与邀请 token 均为 32~100 字符的不可猜测随机串。
  if (token.length < 32 || token.length > 100) return null;
  if (url.host === RESET_PASSWORD_HOST) {
    return { kind: "reset-password", token };
  }
  if (url.host === ACCEPT_INVITE_HOST) {
    return { kind: "accept-invite", token };
  }
  return null;
}

/**
 * 监听来自 tauri-plugin-deep-link 的运行时深链事件，解析出应用可识别的载荷。
 *
 * 仅在 Tauri 桌面环境下有效；浏览器中调用会立刻 reject，方便上层 fallback 处理。
 *
 * @param handler 应用层回调，接收 AppDeepLink（按 kind 区分动作）
 * @returns 取消监听的函数
 */
export async function listenAppDeepLink(
  handler: (link: AppDeepLink) => void,
): Promise<() => void> {
  if (!isTauriRuntime()) {
    return Promise.reject(
      new Error("DESKTOP_RUNTIME_REQUIRED:请在 Agents Plus 桌面应用中使用此功能"),
    );
  }
  const unlisten = await listen<string[]>(DEEP_LINK_EVENT, (event) => {
    const urls = Array.isArray(event.payload) ? event.payload : [];
    for (const raw of urls) {
      const parsed = parseDeepLink(raw);
      if (parsed) {
        handler(parsed);
        return;
      }
    }
  });
  return unlisten;
}

/**
 * 监听密码重置深链的兼容入口，只把 reset-password 载荷交给回调。
 *
 * @param handler 应用层回调，接收 ResetDeepLink
 * @returns 取消监听的函数
 */
export async function listenResetDeepLink(
  handler: (link: ResetDeepLink) => void,
): Promise<() => void> {
  return listenAppDeepLink((link) => {
    if (link?.kind === "reset-password") handler(link);
  });
}

/**
 * 拉取一次冷启动时收到的深链。
 *
 * 之所以需要单独拉取，是因为冷启动时 deep-link://new-url 事件可能在 listener 注册之前就发送完毕，
 * 需要主动查一次当前 URL。
 *
 * @returns 当前深链；无法识别返回 null
 */
export async function readCurrentDeepLink(): Promise<AppDeepLink> {
  if (!isTauriRuntime()) return null;
  const mod = await import("@tauri-apps/plugin-deep-link");
  try {
    const current = await mod.getCurrent();
    if (!current) return null;
    return parseDeepLink(current);
  } catch {
    return null;
  }
}
