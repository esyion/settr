"use client";

import { Settings } from "@/features/settings/components/settings";
import { useSyncController } from "@/features/sync/sync-controller-context";

/** 设置页：当前设备重命名、退出当前账号。 */
export default function SettingsPage() {
  const controller = useSyncController();
  return (
    <Settings
      identity={controller.state.identity}
      busy={controller.busy}
      onRename={controller.rename}
      onLogout={controller.logout}
    />
  );
}
