"use client";

import { Versions } from "@/features/versions/components/versions";
import { useSyncController } from "@/features/sync/sync-controller-context";

/** 版本历史页：列出云端版本并支持恢复到新版本。 */
export default function VersionsPage() {
  const controller = useSyncController();
  return (
    <Versions
      state={controller.state}
      busy={controller.busy}
      onRestore={controller.restore}
    />
  );
}
