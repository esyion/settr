// features/notifications/types.ts
// 通用通知契约：与后端 NotificationDto / NotificationPreferenceDto 一一对应。

/**
 * 单条通知 DTO。
 *
 * <p>字段稳定性：新增字段向后兼容；删除字段走 deprecation 周期。
 * <p>安全：列表接口已过滤敏感字段（如邀请原始 token），
 * 调用方不应从 {@link payload} 拿 token 调用 accept 接口；跳转走 {@link deepLink}。
 */
export interface NotificationDto {
  /** 雪花 ID 字符串 */
  id: string;
  /** 接收者 userId 字符串 */
  recipientId: string;
  /** 归属组织 ID 字符串 */
  organizationId: string | null;
  /** 业务分类字符串 */
  category: string;
  severity: "INFO" | "WARNING" | "ERROR";
  title: string;
  body: string | null;
  /** 业务 JSONB（已过滤敏感字段） */
  payload: Record<string, unknown>;
  deepLink: string | null;
  deliveryState: "PENDING" | "DELIVERED" | "READ";
  /** 派生字段：readAt != null */
  read: boolean;
  createdAt: string;
  readAt: string | null;
}

/**
 * 通知列表分页响应。
 */
export interface NotificationListResponse {
  items: NotificationDto[];
  /** 下一页游标（null 表示已到末尾） */
  nextCursor: string | null;
}

/**
 * 未读通知计数。
 */
export interface NotificationCount {
  unread: number;
}

/**
 * 通知偏好 DTO。
 *
 * <p>{@link channels}：渠道总开关，例如 {@code {email: true, desktop: true}}。
 * <p>{@link categories}：按分类 × 渠道精细控制，留空表示走 channels 兜底。
 */
export interface NotificationPreferenceDto {
  channels: {
    email: boolean;
    desktop: boolean;
    [key: string]: boolean;
  };
  categories: Record<string, { email: boolean; desktop: boolean }>;
}

/**
 * 通知偏好更新请求。
 */
export interface NotificationPreferenceUpdate {
  channels: NotificationPreferenceDto["channels"];
  categories?: NotificationPreferenceDto["categories"];
}

/**
 * 实时通道事件载荷（push://notify）。
 */
export interface PushNotifyPayload {
  notificationId: string;
  category: string;
  title: string;
  body: string | null;
  deepLink: string | null;
}

/**
 * 通知通道连接状态（push://notify-status）。
 */
export type NotifyConnectionState =
  | "connected"
  | "disconnected"
  | "unauthorized";