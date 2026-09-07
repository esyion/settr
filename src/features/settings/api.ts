/**
 * 设置模块前端 API gateway(AGENTS.md §4.1:组件不散落 invoke)。
 * <p>
 * 后端地址读写在 lib 层(api-request)实现,此处提供 feature 语义化入口,
 * 供设置页组件与后续 hooks 复用。
 */
import {
  getApiBaseUrl,
  getSettings,
  saveApiBaseUrl,
  saveCloseToTray,
  saveStartupCheck,
  type AppSettingsDto,
} from "@/lib/api-request";
import { isTauriRuntime } from "@/lib/tauri";

/**
 * 读取当前用户设置(当前仅含后端地址)。
 */
export function fetchSettings(): Promise<string> {
  return getApiBaseUrl();
}

/**
 * 更新后端地址;返回归一化后的地址,失败时抛出稳定错误。
 */
export function updateBackendBaseUrl(rawUrl: string): Promise<string> {
  return saveApiBaseUrl(rawUrl);
}

/**
 * 读取全量用户设置。
 */
export function fetchAllSettings(): Promise<AppSettingsDto> {
  return getSettings();
}

/**
 * 更新"关闭到托盘"开关。
 */
export function updateCloseToTray(closeToTray: boolean): Promise<AppSettingsDto> {
  return saveCloseToTray(closeToTray);
}

/**
 * 读取当前后端地址(表单回填用)。
 */
export function fetchBackendBaseUrl(): Promise<string> {
  return getApiBaseUrl();
}

/**
 * 更新"启动时检查"开关。
 */
export function updateStartupCheck(startupCheck: boolean): Promise<AppSettingsDto> {
  return saveStartupCheck(startupCheck);
}

/**
 * 判断本次进入应用是否应自动执行启动检查。
 * <p>
 * 非桌面环境(浏览器预览)始终返回 true,保持可浏览;
 * 桌面环境读取用户设置,开关关闭时跳过自动刷新。
 */
export async function shouldRunStartupCheck(): Promise<boolean> {
  if (!isTauriRuntime()) return true;
  try {
    const settings = await getSettings();
    return settings.startupCheck;
  } catch {
    // 读取失败视为开启,保持既有自动刷新行为。
    return true;
  }
}
