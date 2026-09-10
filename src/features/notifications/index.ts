// features/notifications/index.ts
// 对外公共入口：只暴露组件 + 必要 hook,内部实现不外泄。

export { NotificationBell } from "./components/NotificationBell";
export { NotificationPreferences } from "./components/NotificationPreferences";
export { useNotifications } from "./hooks/use-notifications";
export { useNotificationStream } from "./hooks/use-notification-stream";
export { useNotificationPreference } from "./hooks/use-notification-preference";
export type {
  NotificationDto,
  NotificationListResponse,
  NotificationCount,
  NotificationPreferenceDto,
  NotificationPreferenceUpdate,
  PushNotifyPayload,
} from "./types";