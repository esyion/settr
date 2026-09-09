import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  notifyOrgContentChange,
  resetPushBusForTest,
  subscribeOrgContentChange,
} from "./push-bus";

describe("push-bus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetPushBusForTest();
  });

  afterEach(() => {
    resetPushBusForTest();
    vi.useRealTimers();
  });

  it("通知在合并窗口(1 秒)后触达订阅者,并携带组织 ID", () => {
    const listener = vi.fn();
    subscribeOrgContentChange(listener);

    notifyOrgContentChange("42");
    expect(listener).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_000);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("42");
  });

  it("窗口内的多次通知只触发一轮,保留首个组织 ID", () => {
    const listener = vi.fn();
    subscribeOrgContentChange(listener);

    notifyOrgContentChange("42");
    vi.advanceTimersByTime(500);
    notifyOrgContentChange("43");
    vi.advanceTimersByTime(1_000);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("42");
  });

  it("取消订阅后不再收到通知;重复取消幂等", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeOrgContentChange(listener);
    unsubscribe();
    unsubscribe();

    notifyOrgContentChange("42");
    vi.advanceTimersByTime(1_000);

    expect(listener).not.toHaveBeenCalled();
  });

  it("无订阅者时通知为空操作", () => {
    expect(() => {
      notifyOrgContentChange("42");
      vi.advanceTimersByTime(1_000);
    }).not.toThrow();
  });
});
