import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NotificationBell } from "@/features/notifications/components/NotificationBell";
import type { NotificationDto } from "@/features/notifications/types";

/**
 * NotificationBell 深链跳转回归测试。
 *
 * <p>回归背景：旧实现直接 window.location.assign(deepLink) 导航自定义协议，
 * 在 Tauri WebView 中行为不可预期且绕过 deep-link.ts 的解析校验；
 * 修复后应经 parseDeepLink 校验并 router.replace 到应用内部路由。
 */

// 满足 parseDeepLink 的 token 长度约束（32~100 字符）。
const TOKEN = "a".repeat(40);

const replace = vi.fn();
const markRead = vi.fn();

// Popover 外壳替换为直渲染，聚焦列表项点击与跳转行为本身。
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

// 列表数据在每个用例里重置，闭包在 hook 调用时读取最新值。
let currentItems: NotificationDto[] = [];

vi.mock("@/features/notifications/hooks/use-notifications", () => ({
  useNotifications: () => ({
    items: currentItems,
    unreadCount: currentItems.filter((n) => !n.read).length,
    loading: false,
    reload: async () => {},
    markRead,
    markAllRead: async () => {},
  }),
}));

vi.mock("@/features/notifications/hooks/use-notification-stream", () => ({
  useNotificationStream: () => {},
}));

/** 构造一条默认未读的邀请通知，允许用例覆盖关键字段。 */
function makeNotification(
  overrides: Partial<NotificationDto> = {},
): NotificationDto {
  return {
    id: "90001",
    recipientId: "1",
    organizationId: "10",
    category: "INVITATION",
    severity: "INFO",
    title: "组织邀请",
    body: "你被邀请加入组织",
    payload: {},
    deepLink: null,
    deliveryState: "PENDING",
    read: false,
    createdAt: "2026-09-10T08:00:00Z",
    readAt: null,
    ...overrides,
  };
}

describe("NotificationBell 深链跳转", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentItems = [];
  });

  it("点击携带合法邀请深链的通知：标记已读并跳转 /accept-invite 内部路由", async () => {
    currentItems = [
      makeNotification({
        deepLink: `agentsplus://accept-invite?token=${TOKEN}`,
      }),
    ];
    render(<NotificationBell />);

    fireEvent.click(screen.getByRole("button", { name: "组织邀请" }));

    await waitFor(() => {
      expect(markRead).toHaveBeenCalledWith("90001");
    });
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(
        `/accept-invite?token=${TOKEN}`,
      );
    });
  });

  it("点击携带密码重置深链的通知：跳转 /reset-password 内部路由", async () => {
    currentItems = [
      makeNotification({
        read: true,
        deepLink: `agentsplus://reset-password?token=${TOKEN}`,
      }),
    ];
    render(<NotificationBell />);

    fireEvent.click(screen.getByRole("button", { name: "组织邀请" }));

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(
        `/reset-password?token=${TOKEN}`,
      );
    });
    expect(markRead).not.toHaveBeenCalled();
  });

  it("深链协议或 host 非法（如外部 https 链接）时不做任何路由跳转", async () => {
    currentItems = [
      makeNotification({
        deepLink: `https://evil.example.com/accept-invite?token=${TOKEN}`,
      }),
    ];
    render(<NotificationBell />);

    fireEvent.click(screen.getByRole("button", { name: "组织邀请" }));

    await waitFor(() => {
      expect(markRead).toHaveBeenCalled();
    });
    expect(replace).not.toHaveBeenCalled();
    // 回归断言：不允许再触发浏览器原生导航（jsdom 中 assign 为 no-op，
    // 旧实现会导致 replace 永远不被调用，本组用例在旧代码下必红）。
    expect(window.location.href).toBe("http://localhost:3000/");
  });
});
