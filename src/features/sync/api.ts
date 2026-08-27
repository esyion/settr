export { api } from "@/lib/api-client";

import { listen } from "@tauri-apps/api/event";
import { isTauriRuntime } from "@/lib/tauri";

const LOCAL_FILE_CHANGED_EVENT = "local-file-changed";

/** Subscribes to native notifications for changes to the local primary document. */
export function listenLocalFileChanged(handler: () => void): Promise<() => void> {
  if (!isTauriRuntime()) {
    return Promise.reject(
      new Error("DESKTOP_RUNTIME_REQUIRED:请在 Agents Plus 桌面应用中使用此功能"),
    );
  }
  return listen(LOCAL_FILE_CHANGED_EVENT, handler);
}
