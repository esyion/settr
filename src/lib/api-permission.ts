import { request } from "@/lib/api-request";

/** 单个团队的权限分组。 */
export interface TeamPermissions {
  teamId: string;
  permissions: string[];
}

/** 当前用户在组织内的权限汇总(权限驱动 UI 的唯一数据源)。 */
export interface MyPermissions {
  orgLevel: string[];
  teamLevel: TeamPermissions[];
}

/**
 * 拉取当前用户在指定组织的权限码汇总(规格 §5.6)。
 *
 * @param organizationId 组织 ID
 * @returns 权限汇总(org 级 + team 级分组)
 */
export function listMyPermissions(organizationId: string): Promise<MyPermissions> {
  return request<MyPermissions>(
    "/api/v1/organizations/" + encodeURIComponent(organizationId) + "/my-permissions"
  );
}
