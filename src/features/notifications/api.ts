// features/notifications/api.ts
// 通用通知 HTTP gateway —— 所有调用经此收口，避免散落 fetch/invoke。

import { request } from "@/lib/api-request";
import type {
  NotificationCount,
  NotificationDto,
  NotificationListResponse,
  NotificationPreferenceDto,
  NotificationPreferenceUpdate,
} from "./types";

/**
 * 通用通知 API gateway。
 *
 * <p>符合 {@code agents-plus/AGENTS.md} §4.1：IPC gateway 集中收口。
 */
export const notificationsApi = {
  /**
   * 拉取通知列表（按 created_at DESC, id DESC 游标分页）。
   *
   * @param query.cursor 上一页游标；null/undefined 表示首页
   * @param query.limit  最大返回条数（≤100）
   */
  list: (query: { cursor?: string | null; limit?: number }) =>
    request<NotificationListResponse>(
      "/api/v1/users/me/notifications" + buildListQuery(query),
    ),

  /** 当前用户未读通知数。 */
  countUnread: () =>
    request<NotificationCount>("/api/v1/users/me/notifications/count"),

  /** 标记单条通知为已读。 */
  markRead: (id: string) =>
    request<void>(
      `/api/v1/users/me/notifications/${encodeURIComponent(id)}/read`,
      { method: "POST" },
    ),

  /** 批量标记当前用户全部未读通知为已读。 */
  markAllRead: () =>
    request<{ updated: number }>(
      "/api/v1/users/me/notifications/read-all",
      { method: "POST" },
    ),

  /** 读取当前用户通知偏好；服务端兜底默认值 {email:true,desktop:true}。 */
  getPreference: () =>
    request<NotificationPreferenceDto>(
      "/api/v1/users/me/notifications/preference",
    ),

  /** 更新当前用户通知偏好。 */
  updatePreference: (input: NotificationPreferenceUpdate) =>
    request<NotificationPreferenceDto>(
      "/api/v1/users/me/notifications/preference",
      { method: "PUT", body: input },
    ),
};

function buildListQuery(query: { cursor?: string | null; limit?: number }): string {
  const params = new URLSearchParams();
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit && query.limit > 0) params.set("limit", String(query.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}