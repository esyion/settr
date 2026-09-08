/**
 * 剪贴板 service(AGENTS.md §4.1:插件调用集中收口,组件不得散落)。
 * <p>
 * 封装 @tauri-apps/plugin-clipboard-manager。capability 仅授权
 * clipboard-manager:allow-write-text(复制类场景:路径、ID、错误详情),
 * 不开放读取,避免引入隐私敏感面。非桌面运行时统一抛错。
 */
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { isTauriRuntime } from "@/lib/tauri";

/**
 * 将文本写入系统剪贴板,覆盖现有内容。
 * <p>
 * 失败时抛出插件错误,由调用方 toast 兜底。
 */
export async function copyTextToClipboard(text: string): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error(
      "DESKTOP_RUNTIME_REQUIRED:请在 Agents Plus 桌面应用中使用此功能",
    );
  }
  await writeText(text);
}
