import { describe, expect, it } from "vitest";
import {
  ACCEPT_INVITE_HOST,
  parseDeepLink,
  RESET_PASSWORD_HOST,
  RESET_PASSWORD_SCHEME,
} from "./deep-link";

/** 32 字符以上的合法 token 形状（与后端 UUID / 随机 token 一致）。 */
const VALID_TOKEN = "a".repeat(36);

describe("parseDeepLink", () => {
  it("解析邀请深链 agentsplus://accept-invite?token=", () => {
    const link = parseDeepLink(
      RESET_PASSWORD_SCHEME + "://" + ACCEPT_INVITE_HOST + "?token=" + VALID_TOKEN,
    );
    expect(link).toEqual({ kind: "accept-invite", token: VALID_TOKEN });
  });

  it("解析密码重置深链 agentsplus://reset-password?token=", () => {
    const link = parseDeepLink(
      RESET_PASSWORD_SCHEME + "://" + RESET_PASSWORD_HOST + "?token=" + VALID_TOKEN,
    );
    expect(link).toEqual({ kind: "reset-password", token: VALID_TOKEN });
  });

  it("拒绝非应用协议与未知 host", () => {
    expect(parseDeepLink("https://" + ACCEPT_INVITE_HOST + "?token=" + VALID_TOKEN)).toBeNull();
    expect(parseDeepLink(RESET_PASSWORD_SCHEME + "://unknown?token=" + VALID_TOKEN)).toBeNull();
  });

  it("拒绝缺失或过短的 token", () => {
    expect(parseDeepLink(RESET_PASSWORD_SCHEME + "://" + ACCEPT_INVITE_HOST)).toBeNull();
    expect(
      parseDeepLink(RESET_PASSWORD_SCHEME + "://" + ACCEPT_INVITE_HOST + "?token=short"),
    ).toBeNull();
  });

  it("拒绝空值与无法解析的字符串", () => {
    expect(parseDeepLink(null)).toBeNull();
    expect(parseDeepLink("")).toBeNull();
    expect(parseDeepLink("::not-a-url::")).toBeNull();
  });
});
