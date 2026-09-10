"use client";

import { useWorkspaceStore } from "@/features/context/store";
import type { Capabilities } from "@/lib/api-permission";

/**
 * 读取当前组织内指定 UI 能力位是否可用。
 * <p>
 * 这是前端按钮/入口显隐的唯一判定入口。调用方只传能力名
 * (TypeScript 字面量类型约束),不接触权限码字符串;能力翻译、
 * 组织级与团队级合并全部由后端完成,前端仅做展示渲染。
 * 数据未加载、字段缺失或值非 true 时一律按无权限处理(宁少勿多)。
 *
 * @param capability 能力位名称,对应后端 Capabilities DTO 字段
 * @returns 该能力当前是否可用
 */
export function useCapability<K extends keyof Capabilities>(
  capability: K,
): boolean {
  return useWorkspaceStore(
    (s) => s.myPermissions?.capabilities?.[capability] === true,
  );
}
