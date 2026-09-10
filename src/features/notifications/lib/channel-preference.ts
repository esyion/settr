// features/notifications/lib/channel-preference.ts
// 偏好判定的纯函数：渠道总开关 + 分类精细覆盖的组合语义。

import type { NotificationPreferenceDto } from "../types";

/**
 * 判断给定分类的通知是否允许弹桌面系统通知。
 *
 * <p>组合语义（与后端偏好契约对齐，categories 留空走 channels 兜底）：
 * <ul>
 *   <li>channels.desktop 关闭 → 全部拦截;</li>
 *   <li>channels.desktop 开启时，分类条目显式关 desktop → 该分类拦截;</li>
 *   <li>其余情况放行。</li>
 * </ul>
 *
 * @param preference 偏好快照
 * @param category   通知业务分类（如 INVITATION）
 * @returns 是否允许弹系统通知
 */
export function isDesktopChannelEnabled(
  preference: NotificationPreferenceDto,
  category: string,
): boolean {
  if (preference.channels.desktop === false) return false;
  const categoryOverride = preference.categories?.[category];
  if (categoryOverride && categoryOverride.desktop === false) return false;
  return true;
}
