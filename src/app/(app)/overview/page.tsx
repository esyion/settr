"use client";

import { Overview } from "@/features/sync/components/overview";
import { useSyncController } from "@/features/sync/sync-controller-context";

/**
 * 概览页：通过 SyncController Context 读取同步状态，并把它透传给业务组件。
 * <p>
 * 鉴权、未登录和加载占位已由 (app)/layout 统一处理，这里只关心"已登录 + 已加载"路径。
 */
export default function OverviewPage() {
  const controller = useSyncController();
  return (
    <Overview
      state={controller.state}
      busy={controller.busy}
      mergeDraft={controller.mergeDraft}
      setMergeDraft={controller.setMergeDraft}
      onFormatChange={controller.selectFormat}
      onRefresh={controller.refresh}
      onUpload={controller.upload}
      onApply={controller.apply}
      onStartMerge={controller.startMerge}
      onResolveMerge={controller.resolveMerge}
    />
  );
}
