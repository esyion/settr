/**
 * 系统通知 service(AGENTS.md §4.1:插件调用集中收口,组件不得散落)。
 * <p>
 * 封装 @tauri-apps/plugin-notification:权限查询/申请与发送系统通知。
 * 非桌面运行时(静态导出页面在浏览器打开)统一抛错,避免静默失败。
 */
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { isTauriRuntime } from "@/lib/tauri";

/**
 * 断言当前处于 Tauri 桌面运行时;否则抛出稳定错误码。
 */
function assertDesktopRuntime(): void {
  if (!isTauriRuntime()) {
    throw new Error(
      "DESKTOP_RUNTIME_REQUIRED:请在 Agents Plus 桌面应用中使用此功能",
    );
  }
}

/**
 * 查询系统通知权限是否已授予。
 * <p>
 * 未授予时可调用 {@link requestNotificationPermission} 触发系统授权弹窗。
 */
export async function isNotificationPermissionGranted(): Promise<boolean> {
  assertDesktopRuntime();
  return isPermissionGranted();
}

/**
 * 申请系统通知权限(首次调用触发系统授权弹窗)。
 * <p>
 * 返回申请后的授权结果;用户拒绝返回 false,不抛错。
 */
export async function requestNotificationPermission(): Promise<boolean> {
  assertDesktopRuntime();
  const status = await requestPermission();
  return status === "granted";
}

/**
 * 发送一条系统通知。
 * <p>
 * 权限未授予时会先自动申请;用户拒绝授权时抛出稳定错误,由调用方决定降级
 * (如回退为 toast),本层不做 UI 假设。
 */
export async function sendSystemNotification(
  title: string,
  body?: string,
): Promise<void> {
  assertDesktopRuntime();
  if (!(await isPermissionGranted())) {
    const granted = await requestPermission();
    if (!granted) {
      throw new Error("NOTIFICATION_PERMISSION_DENIED:系统通知权限未授予");
    }
  }
  sendNotification({ title, body });
}
