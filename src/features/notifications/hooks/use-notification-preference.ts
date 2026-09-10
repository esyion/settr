// features/notifications/hooks/use-notification-preference.ts
// 通知偏好读写 hook。

"use client";

import { useCallback, useEffect, useState } from "react";
import { notificationsApi } from "../api";
import { useNotificationStore } from "../store/notification-store";
import type {
  NotificationPreferenceDto,
  NotificationPreferenceUpdate,
} from "../types";

/** 默认偏好：与后端 NotificationServiceImpl.DEFAULT_CHANNELS 对齐。 */
const DEFAULT_PREFERENCE: NotificationPreferenceDto = {
  channels: { email: true, desktop: true },
  categories: {},
};

/**
 * 通知偏好读写 hook。
 *
 * <p>挂载时拉取偏好；{@link update} 乐观更新 + 失败回滚。
 */
export function useNotificationPreference() {
  const [preference, setPreference] = useState<NotificationPreferenceDto>(DEFAULT_PREFERENCE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const next = await notificationsApi.getPreference();
      setPreference(next);
      // 同步到全局 store：实时通道据此决定是否弹系统通知。
      useNotificationStore.getState().setPreference(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const update = useCallback(
    async (input: NotificationPreferenceUpdate) => {
      const previous = preference;
      setPreference({
        channels: input.channels,
        categories: input.categories ?? preference.categories,
      });
      try {
        const next = await notificationsApi.updatePreference(input);
        setPreference(next);
        useNotificationStore.getState().setPreference(next);
        setError(null);
      } catch (e) {
        setPreference(previous);
        useNotificationStore.getState().setPreference(previous);
        setError(e instanceof Error ? e.message : String(e));
        throw e;
      }
    },
    [preference],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  return { preference, loading, error, reload, update };
}