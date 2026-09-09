import { describe, expect, it } from "vitest";
import { appendReturnUrl, safeReturnUrl } from "./safe-return-url";

describe("safeReturnUrl", () => {
  it("放行同源相对路径（含 query）", () => {
    expect(safeReturnUrl("/accept-invite?token=abc")).toBe("/accept-invite?token=abc");
  });

  it("拦截开放重定向与非法字符", () => {
    expect(safeReturnUrl("//evil.com/x")).toBeNull();
    expect(safeReturnUrl("/\\evil.com/x")).toBeNull();
    expect(safeReturnUrl("https://evil.com")).toBeNull();
    expect(safeReturnUrl("/a\\b")).toBeNull();
    expect(safeReturnUrl(null)).toBeNull();
  });
});

describe("appendReturnUrl", () => {
  it("在路径上追加编码后的 returnUrl，保留目标路径自身 query", () => {
    expect(appendReturnUrl("/login", "/accept-invite?token=abc")).toBe(
      "/login?returnUrl=%2Faccept-invite%3Ftoken%3Dabc",
    );
  });

  it("无 returnUrl 时返回原路径", () => {
    expect(appendReturnUrl("/login", null)).toBe("/login");
  });

  it("在已有查询参数的路径上以 & 追加", () => {
    expect(appendReturnUrl("/login?notice=auto-login-failed", "/accept-invite?token=abc")).toBe(
      "/login?notice=auto-login-failed&returnUrl=%2Faccept-invite%3Ftoken%3Dabc",
    );
  });
});
