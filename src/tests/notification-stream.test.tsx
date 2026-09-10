import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useNotificationStream } from "@/features/notifications/hooks/use-notification-stream";
import { useNotificationStore } from "@/features/notifications/store/notification-store";
import { isDesktopChannelEnabled } from "@/features/notifications/lib/channel-preference";
import { sendSystemNotification } from "@/services/notification";
import { refreshAccessToken } from "@/lib/api-request";
import { notificationsApi } from "@/features/notifications/api";
import type { PushNotifyPayload } from "@/services/push";

/**
 * 通知实时通道回归测试。
 *
 * <p>回归背景：
 * <ul>
 *   <li>旧实现弹系统通知前不检查 desktop 偏好，关闭"桌面通知"后照弹；</li>
 *   <li>unauthorized 终态无人处理，通道静默死亡；现接入既有 refreshAccessToken 自救。</li>
 * </ul>
 */

// 事件处理器捕获：由用例直接触发，模拟 Rust webview 事件。
let notifyHandler: ((payload: PushNotifyPayload) => void) | null = null;
let statusHandler: ((payload: { state: string }) => void) | null = null;

vi.mock("@/services/push", () => ({
  onPushNotify: (handler: (p: PushNotifyPayload) => void) => {
    notifyHandler = handler;
    return () => {};
  },
  onPushNotifyStatus: (handler: (p: { state: string }) => void) => {
    statusHandler = handler;
    return () => {};
  },
  pushSubscribeUser: vi.fn().mockResolvedValue({ connected: true }),
  pushUnsubscribeUser: vi.fn().mockResolvedValue({ connected: false }),
}));

vi.mock("@/services/notification", () => ({
  sendSystemNotification: vi.fn(),
}));

vi.mock("@/lib/api-request", () => ({
  getApiBaseUrl: vi.fn().mockResolvedValue("https://api.example.com"),
  refreshAccessToken: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/session-store", () => ({
  loadSession: vi.fn().mockResolvedValue(null),
  onSessionChanged: () => () => {},
}));

vi.mock("@/features/notifications/api", () => ({
  notificationsApi: { getPreference: vi.fn().mockResolvedValue({
    channels: { email: true, desktop: true },
    categories: {},
  }) },
}));

vi.mock("@/lib/tauri", () => ({
  isTauriRuntime: () => true,
}));

function makePayload(id: string, category = "INVITATION"): PushNotifyPayload {
  return {
    notificationId: id,
    category,
    title: "组织邀请",
    body: "你被邀请加入组织",
    deepLink: null,
  };
}

describe("useNotificationStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notifyHandler = null;
    statusHandler = null;
    act(() => useNotificationStore.getState().reset());
    // 模拟窗口不在前台：仅此场景弹系统通知。
    Object.defineProperty(document, "hidden", {
      value: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(document, "hidden", {
      value: false,
      configurable: true,
    });
  });

  it("desktop 偏好关闭（回归）：实时信号仍写入 store，但不弹系统通知", async () => {
    vi.mocked(notificationsApi.getPreference).mockResolvedValue({
      channels: { email: true, desktop: false },
      categories: {},
    });
    renderHook(() => useNotificationStream());

    await waitFor(() => {
      expect(useNotificationStore.getState().preference.channels.desktop).toBe(false);
    });
    await act(async () => {
      await notifyHandler?.(makePayload("n-1"));
    });

    expect(useNotificationStore.getState().items.map((i) => i.id)).toContain("n-1");
    expect(sendSystemNotification).not.toHaveBeenCalled();
  });

  it("偏好放行时弹系统通知；分类级关闭只拦该分类", async () => {
    renderHook(() => useNotificationStream());

    await act(async () => {
      await notifyHandler?.(makePayload("n-2"));
    });
    await waitFor(() => {
      expect(sendSystemNotification).toHaveBeenCalledWith(
        "组织邀请",
        "你被邀请加入组织",
      );
    });

    act(() => {
      useNotificationStore.getState().setPreference({
        channels: { email: true, desktop: true },
        categories: { INVITATION: { email: true, desktop: false } },
      });
    });
    await act(async () => {
      await notifyHandler?.(makePayload("n-3"));
    });
    expect(sendSystemNotification).toHaveBeenCalledTimes(1);
    expect(useNotificationStore.getState().items.map((i) => i.id)).toContain("n-3");
  });

  it("unauthorized 终态触发既有 token 刷新自救；transient 断线不触发", async () => {
    renderHook(() => useNotificationStream());

    await waitFor(() => {
      expect(statusHandler).not.toBeNull();
    });
    act(() => {
      statusHandler?.({ state: "disconnected" });
    });
    expect(refreshAccessToken).not.toHaveBeenCalled();

    act(() => {
      statusHandler?.({ state: "unauthorized" });
    });
    await waitFor(() => {
      expect(refreshAccessToken).toHaveBeenCalled();
    });
  });
});

describe("isDesktopChannelEnabled 组合语义", () => {
  it("渠道总开关关闭时全拦；分类覆盖仅拦对应分类；默认放行", () => {
    const allOff = { channels: { email: true, desktop: false }, categories: {} };
    expect(isDesktopChannelEnabled(allOff, "INVITATION")).toBe(false);

    const categoryOff = {
      channels: { email: true, desktop: true },
      categories: { INVITATION: { email: true, desktop: false } },
    };
    expect(isDesktopChannelEnabled(categoryOff, "INVITATION")).toBe(false);
    expect(isDesktopChannelEnabled(categoryOff, "SKILL_UPDATE")).toBe(true);

    const allOn = { channels: { email: true, desktop: true }, categories: {} };
    expect(isDesktopChannelEnabled(allOn, "INVITATION")).toBe(true);
  });
});
