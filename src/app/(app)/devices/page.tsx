"use client";

import { Devices } from "@/features/devices/components/devices";
import { useSyncController } from "@/features/sync/sync-controller-context";

/** 设备管理页：列出当前账号下的授权设备，支持重命名和撤销。 */
export default function DevicesPage() {
  const controller = useSyncController();
  return (
    <Devices
      devices={controller.state.devices}
      currentDeviceId={controller.state.identity?.deviceId}
      busy={controller.busy}
      onRename={controller.rename}
      onRevoke={controller.revoke}
    />
  );
}
