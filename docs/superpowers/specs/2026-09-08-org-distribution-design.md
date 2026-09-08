# 组织下发闭环设计 Spec

**日期**:2026-09-08
**状态**:待用户审阅
**目标读者**:本项目的开发者(含本人)
**范围**:agents-plus(前端/Tauri) + agents-plus-server(后端) 跨仓改动

---

## 1. 背景与问题

组织下发闭环 = 管理端(A)"上传 → 审核 → 分发" + 成员端(B)"发现 → 生效/安装"。逐项核查后,当前链路存在 5 处断链:

| # | 断链 | 证据 |
|---|---|---|
| F1 | ORG skill 造不出来:`create` 硬编码 `ownerScope=PERSONAL`,而 skill 分发前置要求 `ownerScope=ORG` | `SkillServiceImpl.java:73`;`SkillDistributionServiceImpl.java:57-61` |
| F2 | skill 分发游离于 RBAC 外:仅要求"活跃成员" | `SkillDistributionServiceImpl.java:52` 注释自述 |
| F3 | 可见性不一致:详情可见(`isVisibleTo` 含 org 分发命中)但版本下载 403(`requireVisibleSkill` 只认 owner+显式订阅);且 `subscribe` 无可见性校验(越权洞:任何用户可订阅任意 skill 后借订阅下载) | `SkillServiceImpl.java:270-290`;`SkillVersionServiceImpl.java:153-160`;`SkillSubscriptionServiceImpl.subscribe` |
| F4 | TEAM/PROJECT 维度分发生效不了:客户端无团队上下文,`/effective` 固定传 `teamId=0&projectId=0`,SQL 精确匹配永不命中 | `use-org-policy-sync.ts:15,44-45`;`PolicyDocumentVersionMapper.xml:52-53` |
| F5 | 管理端无"创建分发"UI:Policy 的 `DistributePanel` 只有查看+撤回,`policiesApi` 未封装 distribute;Skill 侧 `distributeSkill` 已封装但全工程零调用 | `distribute-panel.tsx:34-60`;`features/policies/api.ts:37-49`;`lib/api-skill.ts:94` |

另:org 侧边栏无 Skills 入口(`app-sidebar.tsx:52-56`),与"组织空间同样管理 skill"的产品预期不符。

## 2. 目标与非目标

### 2.1 目标

1. 组织所有者/管理员可在组织空间用**与个人空间一致的体验**创建、导入、发布 skill(归属绑 orgId)
2. 按 RBAC 分发 skill 与规范(AGENTS.md/CLAUDE.md)到 ORGANIZATION / TEAM / MEMBER 三档作用域
3. 成员端自动发现并生效:Policy 写入本地托管块;skill 可在组织空间列表看到并正常安装到本机 harness
4. TEAM 维度分发生效:服务端聚合解析,客户端不传团队参数

### 2.2 非目标

- PROJECT 维度本期不接(客户端无项目上下文,后端 SQL 保留优先级位)
- 成员端"立即同步"按钮(轮询最终一致,延后)
- 权限变更的前端推送失效(切换组织时重拉)
- Rust 层任何改动(SSOT/托管块/dispatch 机制零改动)
- Document/Revision 个人文档体系不动

## 3. 决策记录

| 决策 | 结论 | 理由 |
|---|---|---|
| D1 分发权限模型 | 沿用现有 RBAC 权限点;skill 侧新增 `skill:manage`、`skill:distribute` | Policy 侧 `policy:distribute` 已实现且 TEAM_ADMIN 已授权(V2 seed:40);`hasPermission` 的作用域行匹配天然支持"TEAM_ADMIN 仅本 team"(UserRoleMapper.xml:60-64) |
| D2 ORG skill 入口 | 组织空间复用同一套 skill UI,创建/导入时归属自动 = 当前 orgId,无空间选择器 | 用户明确要求"操作一样,只绑组织 id" |
| D3 TEAM 生效 | 服务端聚合解析"我的生效内容",删除 `/effective` 的 teamId/projectId 参数 | 规则收敛服务端一处;项目规范禁止兼容旧逻辑(开发期) |
| D4 契约变更方式 | 直接改契约,不做兼容版 | `agents-plus-server/AGENTS.md:186`;客户端唯一调用方,无双调用方包袱 |
| D5 MEMBER 分发权限 | 仅 org 级角色(OWNER/ADMIN)可分发到 MEMBER;TEAM_ADMIN 不可点名分发 | `teamId=null` 时 SQL 只命中 org 级角色行,行为与模型一致 |
| D6 org skill 删除与活跃分发 | 阻止删除,报 `SKILL_HAS_ACTIVE_DISTRIBUTION` 提示先撤回 | 与"分发需手动撤回"语义一致,不做级联静默撤回 |

## 4. 总体架构

```
【管理端 A】
创建/导入 skill ──(归属: 个人 or 当前组织)──→ t_skills(ownerScope=ORG, orgId)
                                               ↓ 发布版本(zip→MinIO, 权限 skill:manage)
提交规范(policy:submit) ──→ 审核(policy:review) → APPROVED 版本
                                     ↓                ↓
              分发(scope: ORG/TEAM/MEMBER) ←──────────┘
              权限: policy:distribute / skill:distribute(TEAM_ADMIN 仅本 team)
                ↓
        t_policy_distribution / t_skill_distribution (withdrawn 软撤回)

【成员端 B】
轮询 GET 我的生效内容(服务端聚合: MEMBER>TEAM>ORG, AGENT/CLAUDE 各一条)
     ↓                                ↓
Policy → 托管块写入                  Skill → org 空间列表(可见性=org 分发命中)
~/AGENTS.md ~/.claude/CLAUDE.md            → toggle 安装(版本下载不再 403)
                                             → SSOT ~/.agents-plus/skills/{name}
                                             → dispatch 到 ~/.{harness}/skills(symlink/copy)
```

改动落点:

- 后端 6 处:`SkillServiceImpl`(org 归属+可见性统一)、`SkillVersionServiceImpl`(org 发布权限+可见性)、`SkillSubscriptionServiceImpl`(subscribe 校验)、`SkillDistributionServiceImpl`(RBAC)、`PolicyServiceImpl/Controller`(聚合生效)、`RoleController`(my-permissions);权限矩阵走 V8 migration
- 前端 3 个 feature:`skills`(组织态页面)、`policies`(分发创建面板+useOrgPolicySync 改造)、`context/store`(my-permissions)
- 新增 1 个路由:`/organization/skills`

## 5. 后端设计

### 5.1 V8 migration:权限点与矩阵

```sql
-- t_permission 新增(perm_type=3 接口类,风格沿用 V2)
skill:manage     (org skill 创建/发布/编辑/删除)
skill:distribute (org skill 分发/撤回)

-- t_role_permission 矩阵(与 V2:39-43 同构)
ORGANIZATION_OWNER, ORGANIZATION_ADMIN → skill:manage, skill:distribute
TEAM_ADMIN                             → skill:distribute
```

`policy:*` 矩阵零改动。TEAM_ADMIN 的"仅本 team"不靠代码,靠 `hasPermission` 作用域行匹配:分发到 TEAM 时 Service 传 `teamId`,SQL 只认 `ur.team_id=#{teamId}` 的角色行;分发到 ORGANIZATION/MEMBER 时传 `teamId=null`,仅 org 级行命中。

### 5.2 F1:skill 归属组织

契约变更(直接改,不做兼容):

- `CreateSkillRequest` 增加 `ownerScope`(PERSONAL/ORG,缺省 PERSONAL)+ `orgId`(ownerScope=ORG 时必填,由请求体显式传入;创建接口 `/api/v1/skills` 本身无 org 前缀,归属以请求体为准)
- `SkillServiceImpl.create`:ORG 分支校验 `skill:manage` + 活跃成员,落 `ownerScope=ORG, orgId, createdBy, ownerUserId=创建者`;**不写个人订阅行**(org 资产可见性走成员资格+分发,不靠订阅)。ownerUserId 必须落库:§5.3 可见性公式为 `活跃成员 ∧ (owner ∨ 分发 ∨ 订阅)`,导入后尚无分发/订阅,若 owner 为空则创建者在组织列表里看不到刚导入的资产
- `SkillImportServiceImpl`:GitHub / skills.sh / ZIP 三入口同参数支持目标 org
- `SkillVersionServiceImpl.publish`:PERSONAL 维持"仅 owner 本人";ORG 分支改校验 `skill:manage`(原 owner-personal 硬校验移入 PERSONAL 分支)
- `update`/`delete` 同规则双分支;delete 增加 D6 活跃分发检查
- `SkillService.get` 的 org 可见性判定复用 5.3 的统一方法

### 5.3 F3:可见性统一 + 越权修复

单一判定(放 `SkillServiceImpl`,`SkillVersionServiceImpl` 复用):

```
isVisible(skill, principal):
  PERSONAL → owner ∨ 显式订阅
  ORG      → 本 org 活跃成员 ∧ (owner ∨ 分发命中 ∨ 显式订阅)
```

- `requireVisibleSkill`(版本列表/版本详情)改调此判定 → 修 403 断链
- 删除 `SkillServiceImpl.isVisibleTo` 重复实现,两处合一
- `SkillSubscriptionServiceImpl.subscribe` 前置同一校验 → 修越权洞
- `mySubscriptions` 的 ORG_SUBSCRIBE 运行时合并逻辑不变(复用分发命中分支)

### 5.4 F2:skill 分发接入 RBAC

`SkillDistributionServiceImpl` 三处 `requireActiveMember` 替换为 `requirePermission(principal, orgId, teamId, null, "skill:distribute")`。**权限上下文按操作分别取**:

- `distribute`:透传目标 `teamId`(TEAM 分发 → TEAM_ADMIN 可;ORG/MEMBER 分发 → 仅 org 级,见 D5)
- `withdraw`:先取分发记录,以**该记录自身的 scopeType/teamId** 为权限上下文判定(否则 TEAM_ADMIN 撤回不了自己创建的本 team 分发)
- `listDistributions`:org 级角色(命中 `teamId=null` 判定)返回全部分发;否则过滤为"我在权限上可见的 team"的分发(否则 TEAM_ADMIN 的分发列表恒空)

其余校验保留:skill 必须 ORG 归属且属本 org;同 scope 唯一活跃分发唯一索引冲突语义不变(报错提示先撤回)。

### 5.5 F4:聚合生效接口(Policy)

- `GET /api/v1/organizations/{orgId}/policies/effective` **删除** `teamId`/`projectId` 参数
- 服务端解析:`membership.findActive(orgId, userId)` → `myMemberId`(无成员资格 403);`teamMembership.findTeamIdsByUserAndOrganization` → `myTeamIds`
- `selectEffective` 签名改 `(orgId, memberId, teamIds, policyType)`;TEAM 条件改 `team_id IN (foreach)` 且用 `<if test="teamIds != null and !teamIds.isEmpty()">` 包裹(teamIds 为空时整段不生成,规避 `IN ()` 语法错误);优先级排序不变:MEMBER(4) > PROJECT(3,本期恒空) > TEAM(2) > ORGANIZATION(1),LIMIT 1
- `EffectivePolicyResponse` 结构不变(agent/claude 各含 versionId/content/contentHash)
- `policy:read` 权限校验保留

### 5.6 新接口:my-permissions

`GET /api/v1/organizations/{orgId}/my-permissions`

- 响应:`{ orgLevel: string[], teamLevel: [{ teamId, permissions: string[] }] }`
- 实现:一条 GROUP BY 查询(`t_user_role → t_role_permission → t_permission` join,与 `hasPermission` 同构);非活跃成员 403
- 为什么不用现成 `/roles/assignments`:那是角色码;系统支持自定义角色(`role:manage`),UI 必须按**权限码**显隐才能与后端判定同源

## 6. 前端设计

### 6.1 Workspace 感知

- 侧边栏 org 导航(`app-sidebar.tsx:52-56`)加 `{ href: "/organization/skills", label: "Skills" }`
- 新路由 `app/(app)/organization/skills/page.tsx`,复用 `features/skills` 组件

### 6.2 Skills 页面双态

| | 个人态 `/skills` | 组织态 `/organization/skills` |
|---|---|---|
| 列表数据 | `/subscriptions`(现状不变) | `GET /skills?scope=ORG&org_id`(枚举大写;lib/api-skill.ts listSkills 已封装) |
| 创建/导入/发布 | 现状 | 同一套表单组件;归属自动 = 当前 orgId,无空间选择器 |
| 编辑/删除/发布按钮 | owner 恒可见 | 按 `skill:manage` 显隐;无权限成员只读+可安装 |
| 分发入口 | 无 | 行菜单"分发"(按 `skill:distribute` 显隐) |
| harness toggle | 不变 | 不变(后端 F3 修复后自然通) |

org skills 页顶部加"组织分发"卡片:列出该 org 的活跃分发(复用 `listSkillDistributions`/`withdrawSkillDistribution`),支持撤回。

### 6.3 分发 UI(一个组件、两个入口)

新组件 `DistributeDialog`:

- scope 三选:ORGANIZATION / TEAM / MEMBER
- 目标选择器:TEAM → `features/teams` 数据;MEMBER → `features/memberships` 数据
- Policy 入口:`policies` 页 `HistoryCard` 每行(APPROVED/ACTIVE 版本)加"分发"按钮,补 `policiesApi.distributePolicyVersion` 封装 → `POST /distributions`
- Skill 入口:org 态 skill 行菜单"分发" → `distributeSkill`(`lib/api-skill.ts:94` 接上零调用封装)
- 创建成功后刷新对应列表;按 `policy:distribute` / `skill:distribute` 权限码显隐

### 6.4 权限感知

- `features/context/store` 存 `my-permissions` 响应;**仅在切换组织时重拉**(R4,不做推送失效,不做页面级重拉)
- 权限数据缺失时按无权限处理(按钮隐藏而非禁用,宁少勿多)

### 6.5 成员端生效改造(删代码为主)

- `use-org-policy-sync.ts`:`getEffectivePolicies(organizationId)`,删除 `NO_SCOPE_ID` 与"客户端无团队上下文"注释;轮询间隔 5min 不变;切回个人空间清托管块逻辑不变
- `lib/api-policy.ts` / `lib/api-client.ts` 签名同步收敛
- Rust 层零改动

## 7. 错误处理

- 后端统一 `BusinessException + ErrorCode + ApiResponse`;新增错误码仅 1 个:`SKILL_HAS_ACTIVE_DISTRIBUTION`(D6)
- 前端五态覆盖(loading/success/empty/error/retry,AGENTS.md §6):分发对话框失败 toast 错误文案;同 scope 重复分发命中既有文案"该 skill 已在同 scope 活跃分发,请先撤回旧分发"
- `my-permissions` 请求失败:全部分发/管理按钮隐藏,不阻塞浏览

## 8. 测试策略

### 8.1 后端(mvn test)

1. RBAC 矩阵:TEAM_ADMIN 分发本 team ✅ / 他 team ❌ / ORGANIZATION ❌ / MEMBER ❌;OWNER 全 ✅;ORG_MEMBER 全 ❌
2. 分发管理权限上下文:TEAM_ADMIN 可撤回本 team 分发 ✅、撤回他 team 分发 ❌、listDistributions 仅见本 team;org 级角色见全部
2. 可见性:分发命中成员 `get_version` 200;未命中 403;无可见性用户 `subscribe` 403(越权洞回归用例)
3. 聚合生效优先级:同一用户 MEMBER/TEAM/ORG 三层不同版本 → MEMBER 胜;撤回 MEMBER 回落 TEAM;再撤回回落 ORG;teamIds 为空不产生 SQL 错误
4. org skill 生命周期:admin 创建/发布 ✅、成员 ❌;带活跃分发删除被阻(`SKILL_HAS_ACTIVE_DISTRIBUTION`)
5. 幂等:同 scope 重复分发唯一索引冲突语义不变

### 8.2 前端(vitest)

- `DistributeDialog` scope→body 字段映射、提交/失败分支
- 权限码显隐逻辑(有/无 `skill:distribute`)
- `useOrgPolicySync` 新签名调用与切组织清除行为

### 8.3 端到端手工验证剧本(发布前必跑)

A(owner)创建 org skill → 发布版本 → 分发到 team T;B(TEAM_ADMIN of T)登录 → 侧边栏见 Skills → 列表出现该 skill → toggle 安装 → `~/.claude/skills/` 出现;A 提交+审核+分发 AGENTS.md 到 team T → B 5 分钟内 `~/AGENTS.md` 托管块出现、个人区不受影响;撤回后 B 侧托管块移除。

## 9. 风险与既定决策

| # | 风险 | 处理 |
|---|---|---|
| R1 | `/effective` 契约破坏 + skills 语义变更 | 开发期单客户端,前后端同版本发;规范明令禁止兼容(D4) |
| R2 | MEMBER 分发权限语义 | 既定 D5:仅 org 级角色 |
| R3 | `teamIds` 空列表 `IN ()` SQL 错误 | Mapper `<if>` 包裹 TEAM 分支(5.5) |
| R4 | 角色变更后前端权限缓存 | 切换组织时重拉;不做推送失效 |
| R5 | 分发生效延迟(5min 轮询) | 接受最终一致;"立即同步"延后 |
| R6 | 个人态 `/subscriptions`(含 ORG_SUBSCRIBE 项)与组织态列表并存 | 两页语义不同不合并:个人态=与我相关的,组织态=org 资产 |

## 10. 验收标准

1. `mvn clean test`、`mvn package -DskipTests` 通过;`pnpm` 下 vitest 通过
2. 8.3 手工剧本全绿
3. 断链核查项逐条闭合:F1 组织空间可创建 org skill;F2 分发接口走 RBAC;F3 分发命中成员可安装、越权订阅被拒;F4 不传团队参数 TEAM 分发可生效;F5 两个分发入口可创建分发
