import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  onPushChange,
  onPushStatus,
  pushConnect,
  pushDisconnect,
  PUSH_CHANGE_EVENT,
  PUSH_STATUS_EVENT,
} from "./push";

const invokeNativeMock = vi.hoisted(() => vi.fn());
const isTauriRuntimeMock = vi.hoisted(() => vi.fn(() => true));
const listenMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tauri", () => ({
  invokeNative: invokeNativeMock,
  isTauriRuntime: isTauriRuntimeMock,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

describe("services/push gateway", () => {
  beforeEach(() => {
    invokeNativeMock.mockReset();
    listenMock.mockReset();
    isTauriRuntimeMock.mockReturnValue(true);
  });

  it("push_connect 转发 camelCase 请求到 Rust 命令", async () => {
    invokeNativeMock.mockResolvedValue({ connected: true, organizationId: "42" });

    const result = await pushConnect({
      baseUrl: "https://api.example.com",
      accessToken: "token-1",
      organizationId: "42",
    });

    expect(invokeNativeMock).toHaveBeenCalledWith("push_connect", {
      request: {
        baseUrl: "https://api.example.com",
        accessToken: "token-1",
        organizationId: "42",
      },
    });
    expect(result).toEqual({ connected: true, organizationId: "42" });
  });

  it("非桌面运行时拒绝连接与断开", async () => {
    isTauriRuntimeMock.mockReturnValue(false);

    await expect(
      pushConnect({ baseUrl: "https://api.example.com", accessToken: "t", organizationId: "1" }),
    ).rejects.toThrow("DESKTOP_RUNTIME_REQUIRED");
    await expect(pushDisconnect()).rejects.toThrow("DESKTOP_RUNTIME_REQUIRED");
    expect(invokeNativeMock).not.toHaveBeenCalled();
  });

  it("push_disconnect 转发命令", async () => {
    invokeNativeMock.mockResolvedValue({ connected: false, organizationId: null });

    const result = await pushDisconnect();

    expect(invokeNativeMock).toHaveBeenCalledWith("push_disconnect");
    expect(result).toEqual({ connected: false, organizationId: null });
  });

  it("onPushStatus/onPushChange 订阅约定事件名并把载荷回调出去", async () => {
    const unlisten = vi.fn();
    listenMock.mockResolvedValue(unlisten);
    const statusHandler = vi.fn();
    const changeHandler = vi.fn();

    const offStatus = await onPushStatus(statusHandler);
    const offChange = await onPushChange(changeHandler);

    expect(listenMock).toHaveBeenNthCalledWith(
      1,
      PUSH_STATUS_EVENT,
      expect.any(Function),
    );
    expect(listenMock).toHaveBeenNthCalledWith(
      2,
      PUSH_CHANGE_EVENT,
      expect.any(Function),
    );

    const statusListener = listenMock.mock.calls[0][1] as (event: {
      payload: unknown;
    }) => void;
    const changeListener = listenMock.mock.calls[1][1] as (event: {
      payload: unknown;
    }) => void;
    statusListener({ payload: { state: "connected" } });
    changeListener({
      payload: { organizationId: "1", changeType: "POLICY", changeId: "9" },
    });

    expect(statusHandler).toHaveBeenCalledWith({ state: "connected" });
    expect(changeHandler).toHaveBeenCalledWith({
      organizationId: "1",
      changeType: "POLICY",
      changeId: "9",
    });

    offStatus();
    offChange();
    expect(unlisten).toHaveBeenCalledTimes(2);
  });
});
