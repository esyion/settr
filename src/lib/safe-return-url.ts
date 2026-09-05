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