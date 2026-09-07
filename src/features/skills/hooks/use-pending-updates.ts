"use client";

import { useCallback } from "react";
import { api, ApiClientError } from "@/lib/api-client";
import { useSkillStore } from "@/features/skills/store/skill-store";

/**
 * 「有可用更新」角标的共享数据源：
 * <ul>
 *   <li>读取 useSkillStore.pendingUpdates / pendingLoading；</li>
 *   <li>reload 供顶栏角标挂载时拉取，也供列表/详情页在创建、删除、
 *       检查更新、发布版本后同步刷新角标计数。</li>
 * </ul>
 * 请求失败时静默保留旧数据（角标不阻塞主流程）。
 */
export function usePendingUpdates() {
  const pendingUpdates = useSkillStore((s) => s.pendingUpdates);
  const pendingLoading = useSkillStore((s) => s.pendingLoading);
  const setPendingUpdates = useSkillStore((s) => s.setPendingUpdates);
  const setPendingLoading = useSkillStore((s) => s.setPendingLoading);

  /** 拉取最新 pending-updates 并写入 store；失败静默，仅非 ApiClientError 记录 warn。 */
  const reload = useCallback(async () => {
    setPendingLoading(true);
    try {
      const items = await api.listSkillPendingUpdates();
      setPendingUpdates(items);
    } catch (err) {
      if (!(err instanceof ApiClientError)) {
        console.warn("PendingUpdates reload failed", err);
      }
    } finally {
      setPendingLoading(false);
    }
  }, [setPendingUpdates, setPendingLoading]);

  return { pendingUpdates, pendingLoading, reload };
}