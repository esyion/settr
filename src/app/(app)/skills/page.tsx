"use client";

import { useSearchParams } from "next/navigation";
import { SkillList } from "@/features/skills/components/skill-list";
import { SkillDetail } from "@/features/skills/components/skill-detail";

/**
 * /skills 入口:
 * - 无 query 参数:展示 skill 列表(创建/导入/删除)
 * - 有 ?id=xxx:展示对应 skill 详情(版本列表/发布/删除)
 * <p>
 * 采用 query 参数而非动态路径,以兼容 Next.js output:export 静态导出。
 */
export default function SkillsPage() {
  const params = useSearchParams();
  const id = params.get("id");
  if (id) {
    return <SkillDetail id={id} />;
  }
  return <SkillList />;
}
