/**
 * 组织内容变更的进程内广播(推送信号 → 各数据中枢刷新)。
 *
 * usePushEvents 收到服务端 org-change 信号后调用 notifyOrgContentChange(),
 * 订阅方(policies 数据中枢、skill 列表、组织分发卡等)各自触发既有刷新。
 * 广播带 1 秒合并窗口:突发多条信号只通知一轮,避免订阅方连续重复拉取。
 */

/** 变更监听器:参数为发生变化的组织 ID(未知来源时为 undefined)。 */
type OrgContentChangeListener = (organizationId: string | undefined) => void;

/** 合并窗口时长(毫秒):窗口内的后续信号不再另行通知。 */
const COALESCE_MS = 1_000;

const listeners = new Set<OrgContentChangeListener>();
let coalesceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingOrganizationId: string | undefined;

/**
 * 通知"组织内容已变化"。带合并窗口:窗口内的重复调用只保留首个组织
 * 并在窗口结束时触发一轮监听器(合并期内的多次变更本就要一次重拉覆盖)。
 *
 * @param organizationId 发生变化的组织 ID(信号载荷缺失时省略)
 */
export function notifyOrgContentChange(organizationId?: string): void {
  if (coalesceTimer) {
    pendingOrganizationId ??= organizationId;
    return;
  }
  pendingOrganizationId = organizationId;
  coalesceTimer = setTimeout(() => {
    coalesceTimer = null;
    const organizationId = pendingOrganizationId;
    pendingOrganizationId = undefined;
    for (const listener of [...listeners]) {
      listener(organizationId);
    }
  }, COALESCE_MS);
}

/**
 * 订阅组织内容变更;返回取消订阅函数(幂等)。
 *
 * @param listener 变更回调,参数为发生变化的组织 ID
 */
export function subscribeOrgContentChange(
  listener: OrgContentChangeListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 重置总线状态(仅供测试:清空计时器与监听器)。
 */
export function resetPushBusForTest(): void {
  if (coalesceTimer) {
    clearTimeout(coalesceTimer);
    coalesceTimer = null;
  }
  pendingOrganizationId = undefined;
  listeners.clear();
}
