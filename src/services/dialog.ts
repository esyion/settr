/**
 * 原生对话框 service(AGENTS.md §4.1:插件调用集中收口,组件不得散落)。
 * <p>
 * 封装 @tauri-apps/plugin-dialog 的文件/目录选择与保存对话框。
 * 仅开放 capability 中授权的 open/save 两类;非桌面运行时统一抛错。
 */
import { open, save } from "@tauri-apps/plugin-dialog";
import { isTauriRuntime } from "@/lib/tauri";

/** 文件类型过滤器(与 plugin-dialog 契约一致)。 */
export interface DialogFileFilter {
  /** 过滤器显示名称,如 "Markdown 文档"。 */
  name: string;
  /** 不含点号的扩展名列表,如 ["md", "markdown"];空数组表示不过滤。 */
  extensions: string[];
}

/** 打开(选择)对话框选项。 */
export interface OpenDialogOptions {
  /** 对话框标题。 */
  title?: string;
  /** 文件类型过滤器。 */
  filters?: DialogFileFilter[];
  /** 初始目录或文件路径。 */
  defaultPath?: string;
  /** true 时选择目录而非文件。 */
  directory?: boolean;
  /** true 时允许多选,返回字符串数组。 */
  multiple?: boolean;
}

/** 保存对话框选项。 */
export interface SaveDialogOptions {
  /** 对话框标题。 */
  title?: string;
  /** 文件类型过滤器。 */
  filters?: DialogFileFilter[];
  /** 默认文件名(含扩展名)。 */
  defaultPath?: string;
}

/**
 * 打开原生文件/目录选择对话框。
 * <p>
 * 用户取消时返回 null;multiple 为 true 时返回所选路径数组。
 */
export async function openNativeDialog(
  options: OpenDialogOptions,
): Promise<string | string[] | null> {
  if (!isTauriRuntime()) {
    throw new Error(
      "DESKTOP_RUNTIME_REQUIRED:请在 Agents Plus 桌面应用中使用此功能",
    );
  }
  return open(options);
}

/**
 * 打开原生保存对话框,返回用户确认保存的目标路径;取消时返回 null。
 * <p>
 * 仅返回路径,写文件由调用方经既有文件能力完成。
 */
export async function saveViaNativeDialog(
  options: SaveDialogOptions,
): Promise<string | null> {
  if (!isTauriRuntime()) {
    throw new Error(
      "DESKTOP_RUNTIME_REQUIRED:请在 Agents Plus 桌面应用中使用此功能",
    );
  }
  return save(options);
}
