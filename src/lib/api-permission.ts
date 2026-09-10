import { request } from "@/lib/api-request";

/**
 * UI 动作级能力位(CapBAC)。
 * <p>
 * 后端把组织级/团队级权限码统一翻译为这组与 UI 控件一一对应的布尔位;
 * 前端只读 boolean,不接触任何权限码字面值,从根上避免前后端
 * 权限字符串同步漂移(例如大小写/命名风格调整导致按钮消失)。
 * <p>
 * 字段全部可选:权限数据尚未加载、或后端新增字段时,缺失一律按 false 处理。
 */
export interface Capabilities {
  /** 是否可以新建组织 skill。 */
  readonly canCreateSkill?: boolean;
  /** 是否可以编辑组织 skill。 */
  readonly canEditSkill?: boolean;
  /** 是否可以删除组织 skill。 */
  readonly canDeleteSkill?: boolean;
  /** 是否可以导入组织 skill。 */
  readonly canImportSkill?: boolean;
  /** 是否可以分发组织 skill。 */
  readonly canDistributeSkill?: boolean;
  /** 是否可以撤回已分发的组织 skill。 */
  readonly canWithdrawSkillDistribution?: boolean;
  /** 是否可以修改组织设置。 */
  readonly canManageOrganization?: boolean;
  /** 是否可以管理组织成员。 */
  readonly canManageMembers?: boolean;
  /** 是否可以管理组织角色。 */
  readonly canManageRoles?: boolean;
  /** 是否可以创建团队。 */
  readonly canCreateTeam?: boolean;
  /** 是否可以编辑/删除团队。 */
  readonly canManageTeam?: boolean;
  /** 是否可以创建项目。 */
  readonly canCreateProject?: boolean;
  /** 是否可以编辑/删除项目。 */
  readonly canManageProject?: boolean;
  /** 是否可以查看组织规范。 */
  readonly canReadPolicy?: boolean;
  /** 是否可以提交组织规范变更。 */
  readonly canSubmitPolicy?: boolean;
  /** 是否可以审批组织规范变更。 */
  readonly canReviewPolicy?: boolean;
  /** 是否可以分发组织规范版本。 */
  readonly canDistributePolicy?: boolean;
}

/**
 * 当前用户在组织内的权限汇总。
 * <p>
 * 前端契约只声明能力位;后端响应里的原始权限码数组属于服务端内部细节,
 * 不进入前端类型,业务代码也没有可拼错的权限字符串。
 */
export interface MyPermissions {
  /** UI 动作级能力位;缺失表示权限尚未加载或接口降级,调用方按无权限处理。 */
  readonly capabilities?: Capabilities;
}

/**
 * 拉取当前用户在指定组织的能力位汇总(规格 §5.6)。
 *
 * @param organizationId 组织 ID
 * @returns 能力位汇总;后端已在服务端完成权限码到 canXxx 布尔位的翻译
 */
export function listMyPermissions(organizationId: string): Promise<MyPermissions> {
  return request<MyPermissions>(
    "/api/v1/organizations/" + encodeURIComponent(organizationId) + "/my-permissions"
  );
}
