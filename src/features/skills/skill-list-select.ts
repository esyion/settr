import type { Skill } from "@/lib/contracts";
import {
  HARNESS_LIST,
  type HarnessKey,
  type LocalState,
} from "@/features/skills/skill-harness";

/**
 * 订阅列表的选择逻辑(纯函数,便于单测):
 * 按本地启用矩阵统计各 harness 的 skill 数,并按关键字与 harness 过滤可见列表。
 */

/** 构造全零的 harness 计数骨架(键序与 HARNESS_LIST 一致)。 */
export function emptyHarnessCounts(): Record<HarnessKey, number> {
  return Object.fromEntries(
    HARNESS_LIST.map((harness) => [harness, 0]),
  ) as Record<HarnessKey, number>;
}

/** 统计本地启用矩阵中每个 harness 启用的 skill 数(用于顶部 chips 计数)。 */
export function countByHarness(localState: LocalState): Record<HarnessKey, number> {
  const counts = emptyHarnessCounts();
  for (const entry of Object.values(localState)) {
    for (const harness of entry.enabledHarnesses) {
      if (harness in counts) counts[harness as HarnessKey] += 1;
    }
  }
  return counts;
}

/** 按关键字(名称/显示名/描述)与 harness 过滤订阅列表。 */
export function filterVisibleSkills(
  skills: Skill[],
  localState: LocalState,
  harnessFilter: HarnessKey | "all",
  query: string,
): Skill[] {
  const keyword = query.trim().toLowerCase();
  return skills.filter((skill) => {
    if (
      harnessFilter !== "all" &&
      !(localState[skill.id]?.enabledHarnesses ?? []).includes(harnessFilter)
    ) {
      return false;
    }
    if (!keyword) return true;
    return (
      skill.name.toLowerCase().includes(keyword) ||
      (skill.displayName?.toLowerCase().includes(keyword) ?? false) ||
      (skill.description?.toLowerCase().includes(keyword) ?? false)
    );
  });
}
