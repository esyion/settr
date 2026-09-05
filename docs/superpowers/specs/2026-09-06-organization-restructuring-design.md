# 组织功能重构设计 Spec

**日期**:2026-09-06
**状态**:待用户审阅
**目标读者**:本项目的开发者(含本人)

---

## 1. 背景与动机

### 1.1 当前状态

`src/features/organization/` 已实现一个组织管理面板,包含组织/团队/项目/成员/规范/角色六大抽象,566 行数据中枢 hook 串联所有 CRUD。但产品**用户根本用不了**,原因包括:

- 必须 Tauri 桌面壳运行(否则抛 `DESKTOP_RUNTIME_REQUIRED`)
- 个人用户没有可用上下文(必须先建组织)
- 缺删除/编辑/邀请/分发/撤回等运维动作
- 后端 DTO 命名不够准确(如 `RoleResponse` 后缀、`PolicyChange` 含义模糊)
- AGENTS.md 第 25 行文档路径错(`../settr-server`,实际是 `agents-plus-server`)

### 1.2 产品定位

- **第一场景**:公司多部门多团队治理(to B)
- **抽象初衷**:全面型企业产品,同时也支持个人用户
- **个人/企业关系**:组织是可选上下文,个人空间为默认

### 1.3 不在本次范围

- SSO / SCIM / 签名 / 审计报表
- 个人规则搬入 policies(个人空间已有 sync/versions 覆盖)
- Playwright 等组件渲染测试
- 旧的 `/organization` 路由与旧 DTO 兼容性(本期直接重写)

---

## 2. 概念模型

### 2.1 双上下文

```
个人空间(默认)             组织空间(可选)
─────────────────             ─────────────────
overview                     组织概览
devices                      成员(memberships)
versions                     团队与项目(teams)
settings                     规范(policies)
                             角色与授权(roles)
                             组织设置
```

### 2.2 术语

| 概念 | 说明 | 归属 |
|---|---|---|
| 个人空间 | 用户没加入组织时默认所在 | 已存在,仅补命名 |
| 组织空间 | 用户加入或创建组织后进入 | organization feature 拆分 |
| 上下文 (Context) | 当前激活的工作空间,驱动侧边栏与数据源 | 新增 |
| Policy | 规范,组织空间内可审批的规则 | 独立 feature |
| Membership | 组织成员关系(含状态) | 独立 feature |
| Team / Project | 组织下的子结构 | 独立 feature |
| Role Assignment | 把成员绑到角色,RBAC 实现 | 独立 feature |
| Invitation | 邀请记录,接受后转为 Membership | 新增 |

### 2.3 明确划界

- 不引入 Workspace 作为新顶层抽象(与"组织是可选上下文"冲突)
- 不把个人规则搬进 policies(个人规则由 sync/versions 覆盖)
- scope(规则挂载维度:个人/工作区/项目/组织)与成员结构正交,本期不动

---

## 3. 路由与目录结构

### 3.1 路由划分

```
src/app/
├─ (app)/                        ← 需登录
│  ├─ layout.tsx                 ← 上下文感知,渲染侧边栏
│  ├─ overview/page.tsx          ← 个人空间 dashboard
│  ├─ devices/page.tsx           ← 个人空间
│  ├─ versions/page.tsx          ← 个人空间
│  ├─ settings/page.tsx          ← 通用设置
│  └─ organization/              ← 组织空间根
│     ├─ layout.tsx              ← 必须已选 ctx=组织,否则 redirect → /overview
│     ├─ page.tsx                ← 组织概览
│     ├─ teams/page.tsx
│     ├─ memberships/page.tsx
│     ├─ policies/page.tsx
│     └─ roles/page.tsx
├─ (public)/                     ← 无需登录,接受邀请等公开入口
│  ├─ accept-invite/page.tsx     ← 接受邀请(token 校验)
│  └─ layout.tsx                 ← 极简 layout,无侧边栏
└─ (auth)/                       ← 已有,登录/注册/找回密码
   └─ layout.tsx                 ← 改造:支持 returnUrl 回跳
```

**登录跳转流程:**
- 未登录用户访问 `/accept-invite?token=xxx` → 重定向 `/login?returnUrl=/accept-invite?token=xxx`
- 登录成功后,`/login` 解析 `returnUrl` 并跳转
- 注册同理

### 3.2 feature 模块目录

```
src/features/
├─ context/                      ← 新增,跨 feature 共享
│  ├─ components/context-switcher.tsx
│  ├─ hooks/use-workspace-context.ts
│  ├─ store.ts                   ← zustand
│  └─ index.ts
├─ teams/
│  ├─ components/
│  │  ├─ organization-selector.tsx
│  │  ├─ team-card.tsx
│  │  ├─ project-card.tsx
│  │  └─ create-forms.tsx
│  ├─ hooks/use-teams-data.ts
│  ├─ api.ts
│  ├─ types.ts
│  └─ index.ts
├─ memberships/
│  ├─ components/
│  │  ├─ organization-members.tsx
│  │  ├─ team-members.tsx
│  │  ├─ invite-modal.tsx       ← 新增
│  │  └─ pending-invitations.tsx ← 新增
│  ├─ hooks/use-memberships-data.ts
│  ├─ api.ts
│  ├─ types.ts
│  └─ index.ts
├─ policies/
│  ├─ components/
│  │  ├─ submit-policy.tsx
│  │  ├─ pending-policies.tsx
│  │  ├─ effective-policy.tsx
│  │  ├─ history-panel.tsx
│  │  └─ distribute-panel.tsx    ← 新增
│  ├─ hooks/use-policies-data.ts
│  ├─ api.ts
│  ├─ types.ts
│  └─ index.ts
├─ roles/
│  ├─ components/
│  │  ├─ assign-role.tsx
│  │  └─ assignments-list.tsx
│  ├─ hooks/use-roles-data.ts
│  ├─ api.ts
│  ├─ types.ts
│  └─ index.ts
```

### 3.3 侧边栏(上下文感知)

```
个人空间:                    组织空间:
[▾ 个人空间       ▼]         [▾ Acme Corp   ▼]
─ 概览                        ─ 组织概览
─ 设备                        ─ 团队与项目
─ 版本                        ─ 成员
─ 设置                        ─ 规范
                              ─ 角色
─── 组织 ───                  ─ 组织设置
+ 加入或创建组织
```

切换组织时,路由不改变,但所有数据来源切换;离开 `/organization/*` 自动回到个人空间。

---

## 4. 数据流

### 4.1 上下文加载

```
登录
  ↓
(app)/layout.tsx 挂载
  ↓
useWorkspaceContext()(全局只加载一次)
  ↓
  ├─ 调 api.listMyOrganizations() → 列出用户所属组织
  ├─ 从 sessionStorage 读上次 organizationId
  ├─ 默认 scope = "personal"
  └─ store 写入
  ↓
侧边栏根据 store scope 渲染菜单
  ↓
用户点击 context-switcher 选组织 A
  ↓
setOrganization(orgA)
  ├─ store 更新 organizationId
  ├─ 子 feature hooks 订阅 organizationId 变化
  └─ 每个 feature hook 各自重置 + 重新拉取
     (teams、memberships、policies、roles)
```

### 4.2 共享约束

- `useWorkspaceContext()` **只在 `(app)/layout.tsx` 调用一次**
- 各 feature 通过 zustand selector 取值,**不重复调 `listMyOrganizations()`**
- 切组织时只重拉子 feature 数据

---

## 5. 错误处理(全局统一使用 sonner)

### 5.1 两类错误反馈

| 类型 | 反馈方式 | 触发场景 |
|---|---|---|
| **操作反馈**(短暂) | `toast.success()` / `toast.error()` / `toast.loading()` | 单次操作成功/失败 |
| **持续性错误** | 页面顶部 `<Alert variant="destructive">` | 网络断开、组织失效需用户动作 |

### 5.2 操作反馈模式

```ts
const promise = data.createTeam(name);
toast.promise(promise, {
  loading: "创建团队中...",
  success: "已创建团队",
  error: (e) => readableError(e, "创建失败"),
});
await promise;
```

### 5.3 其他规则

- **401**:api-client.ts 已自动 `refreshAccessToken()` 重试一次
- **404 组织不存在**:`(app)/organization/layout.tsx` 触发 redirect + `toast.error("组织已失效")`
- **403 无权限**:各 feature page 顶部 Alert,隐藏写操作按钮
- **422 校验失败**:表单字段级错误

---

## 6. 后端 API 缺口

### 6.1 新增端点

| 方法 | 路径 | 说明 |
|---|---|---|
| `DELETE` | `/api/v1/organizations/{id}` | 删除组织 |
| `PATCH` | `/api/v1/organizations/{id}` | 重命名组织 |
| `DELETE` | `/api/v1/organizations/{id}/teams/{tid}` | 删除团队 |
| `PATCH` | `/api/v1/organizations/{id}/teams/{tid}` | 重命名团队 |
| `DELETE` | `/api/v1/organizations/{id}/teams/{tid}/projects/{pid}` | 删除项目 |
| `PATCH` | `/api/v1/organizations/{id}/teams/{tid}/projects/{pid}` | 重命名项目 |
| `POST` | `/api/v1/organizations/{id}/invitations` | 创建邀请 |
| `GET` | `/api/v1/organizations/{id}/invitations` | 列出邀请 |
| `DELETE` | `/api/v1/organizations/{id}/invitations/{iid}` | 撤销邀请 |
| `POST` | `/api/v1/invitations/accept` | 接受邀请 |

### 6.2 已有端点(本次需要 UI 挂载)

- `POST /api/v1/organizations/{id}/policies/distributions` — 客户端有,UI 未挂
- `DELETE /api/v1/organizations/{id}/policies/distributions/{did}` — UI 未挂

---

## 7. DTO 重命名

### 7.1 前端 `contracts.ts`

| 旧名 | 新名 |
|---|---|
| `OrganizationMember` | `Membership` |
| `TeamMember` | `TeamMembership` |
| `RoleResponse` | `Role` |
| `PendingPolicyRequest` | `PolicyReviewRequest` |
| `PolicyChange` | `PolicyDraft` |

### 7.2 端点路径

| 旧路径 | 新路径 |
|---|---|
| `DELETE /roles/{assignmentId}` | `DELETE /role-assignments/{id}` |

### 7.3 新增 DTO

- `Invitation` { id, organizationId, email, roleId?, teamIds[], token, expiresAt, status, createdAt }
- `InvitationStatus` = `"PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED"`

### 7.4 后端协同

`agents-plus-server` 的 controller、service、repository、database migration 全部同步重命名。本期无兼容性约束,旧 DTO 全部替换。

---

## 8. 邀请流程

### 8.1 发起邀请

```
组织管理员在 /memberships 页面点「邀请成员」
  ↓ 弹窗:输入邮箱 + 选角色(可选) + 选加入团队(可选)
POST /api/v1/organizations/{id}/invitations
  ├─ 后端生成 token(UUID,一次性,72h 过期)
  ├─ MailSender port 发送邮件(本期 ConsoleMailSender,生产 SMTP)
  ├─ 存 invitation 记录
  └─ 返回 201 + Invitation
前端 toast.success("邀请已发送至 user@example.com")
「待处理邀请」列表显示该邀请(status=PENDING)
```

### 8.2 接受邀请

```
被邀请人点邮件链接 https://app/accept-invite?token=xxx
  ↓ 未登录 → 跳 /login,登录后回该链接
  ↓ 登录后访问 /accept-invite?token=xxx
POST /api/v1/invitations/accept { token }
  ├─ 校验 token 未过期
  ├─ 校验邀请邮箱与当前用户邮箱匹配
  ├─ 创建 Membership 记录
  ├─ 如邀请时含 teamIds → 创建 TeamMembership
  ├─ 如邀请时含 roleId → 创建 RoleAssignment
  ├─ 标记 invitation.status = "ACCEPTED"
  └─ 返回 organizationId
前端跳转 /organization/{id}/overview
```

### 8.3 邮件发送

- `agents-plus-server` 在 `application/ports/mail_sender.rs` 定义 `MailSender` trait
- 开发期 `infrastructure/mail/console_mail_sender.rs` 实现,日志打印邀请链接
- 生产期 `infrastructure/mail/smtp_mail_sender.rs` 实现,本期不实现,但 port 已留好

---

## 9. 实施阶段

| 阶段 | 范围 | 工期 |
|---|---|---|
| **P1 上下文基础** | `features/context/`、zustand store、`useWorkspaceContext`、`context-switcher`、(app)/layout 集成、组织空间 layout 加 redirect 守卫 | 1 天 |
| **P2 拆分 feature + DTO 重命名** | 4 个独立 feature + 后端 DTO 同步重命名 + 路由拆分 | 3 天 |
| **P3 补运维 + 修 UX** | 后端 delete/rename + 前端挂删除/编辑 + 6 项 UX bug + sonner + distribute/withdraw UI | 3 天 |
| **P4 单元测试** | context store 状态机 + 4 个 feature hook 用 mock api | 1 天 |
| **P5 邀请流程** | 后端 invitation 服务 + 前端 invite modal + accept 路由 | 2 天 |
| **总计** | | **10 天** |

### 9.1 阶段间独立性

- 每阶段独立 commit + PR
- P2 拆分前先备份原 organization feature,失败可一键回滚
- 后端 delete 接口走新路径,不破坏已有端点(且本期不考虑兼容)

---

## 10. 已知 UX bug(本期修复清单)

| # | 文件:行 | 问题 |
|---|---|---|
| 1 | `organization-tree-panel.tsx:224` | 空状态文案"该项目下还没有项目" → 应为"该团队下还没有项目" |
| 2 | `members-panel.tsx:221` | `formatTime(member.id)` 误用,应使用真实加入时间字段 |
| 3 | `members-panel.tsx:60-74` | "添加成员" 改用邀请流程 |
| 4 | `policy-panel.tsx:230-281` | 版本历史需手动点按钮,改为订阅自动刷新 |
| 5 | `organization-tree-panel.tsx:230-243` | 项目列表只读,改为可点击切换 |
| 6 | 整个 organization 页面 | 缺删除/编辑按钮,本期补齐 |

---

## 11. 测试策略

| 层 | 类型 | 覆盖 |
|---|---|---|
| `features/context/store.ts` | 单元 | scope 切换、organizationId 重置、不变量 |
| 4 个 feature hook | 单元 | mock api,验证级联加载、busy/error 状态 |
| 组件渲染 | 不做 | 工期不允许 |

---

## 12. 文档更新

- `AGENTS.md` 第 25 行:`../settr-server` → `../agents-plus-server`
- `AGENTS.md` 增补"上下文"概念说明
- `docs/PRODUCT-BLUEPRINT.md` 第 16 行 scope 注释:明确 scope 与成员结构正交
- `README.md` 更新"已接入接口"列表,反映新端点

---

## 13. 风险与回滚

| 风险 | 缓解 |
|---|---|
| P2 拆分改动面大 | 每 feature 先 commit 再合并,失败 revert 单独 commit |
| 后端 DTO 改动影响调用方 | 后端 controller/service/migration 同步改,一次性替换 |
| 用户已有组织数据 | 后端 migration 加 column rename 而非 drop+add |
| 邀请邮件发送失败 | MailSender port 抽象,失败时 invitation.status 保留 PENDING,管理员可重发 |

---

## 附录 A:删除的文件

- `src/features/organization/` 整个目录
- `src/app/(app)/organization/page.tsx`(由 4 个新 page 替代)

## 附录 B:新增的文件

见第 3.2 节目录树。
