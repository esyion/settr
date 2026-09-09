/**
 * 校验 returnUrl 是否为同源相对路径，避免 open redirect。
 *
 * 攻击面：
 * - `//evil.com/x`  → Next.js router 跳转到 evil.com（protocol-relative）
 * - `/\evil.com/x`  → 浏览器把 `\` 规范化为 `/`，等同上条
 * - `http://evil.com` → 已带 protocol，但 startsWith("/") 为 false，已被现有规则拦截
 * - `/\example.com/foo` 浏览器规范化为 `//example.com/foo`，跳到 example.com
 *
 * 允许：单 `/` 起头的纯路径，可带 query / hash。
 */
export function safeReturnUrl(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  if (value.includes("\\")) return null;
  if (value.includes("\n") || value.includes("\r")) return null;
  return value;
}

/**
 * 在站内路径上追加 returnUrl 查询参数，用于登录 / 注册完成后回到原页面。
 *
 * 值必须先经过 {@link safeReturnUrl} 校验（非法值静默忽略，返回原路径），
 * 拼接时整体 encodeURIComponent，避免破坏目标路径自身的 query（如 /accept-invite?token=xxx）。
 *
 * @param path        站内目标路径，如 "/login" 或 "/register"
 * @param returnUrl   已校验的回跳路径；为 null 时不追加参数
 * @returns 追加后的路径
 */
export function appendReturnUrl(path: string, returnUrl: string | null): string {
  if (!returnUrl) return path;
  const separator = path.includes("?") ? "&" : "?";
  return path + separator + "returnUrl=" + encodeURIComponent(returnUrl);
}