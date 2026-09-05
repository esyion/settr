# 组织功能重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前的 organization feature 拆为 4 个独立 feature,补个人空间上下文、补运维动作、加邀请流程、修 6 项 UX bug、重命名 DTO;前后端同步,工期约 10 天。

**Architecture:**
- 双上下文(个人空间 + 组织空间),通过 zustand store 切换
- organization 拆为 teams / memberships / policies / roles 4 个独立 feature
- 路由从单一 `/organization` 拆为 4 个独立 page
- 后端 DTO 同步重命名,无兼容性约束,直接删除旧代码
- 错误反馈统一用 sonner,持续错误用页面顶部 Alert
- 邀请流程用后端已有 EmailSender + LoggingEmailSender(开发期)

**Tech Stack:**
- 前端:Next.js 16 App Router + React 19 + TypeScript + shadcn/ui + Tailwind 4 + zustand 5 + sonner 2
- 后端:Spring Boot 4.1.1 + Java 17 + MyBatis + MySQL

**Spec:** `docs/superpowers/specs/2026-09-06-organization-restructuring-design.md`

---

## Task Map

### P1: Context Foundation(7 tasks)

- T1.1: 在 zustand store 定义 WorkspaceContext 状态
- T1.2: 实现 `useWorkspaceContext()` hook
- T1.3: 创建 `context-switcher.tsx` 组件
- T1.4: 改造 `(app)/layout.tsx` 加载 context 并渲染侧边栏
- T1.5: 创建 `(app)/organization/layout.tsx` redirect 守卫
- T1.6: 创建 `(public)/accept-invite/page.tsx` 骨架
- T1.7: 改造 `(auth)/login` 与 `(auth)/register` 支持 `returnUrl`

### P2: Split + DTO Rename(11 tasks)

- T2.1: 重命名 `src/lib/contracts.ts` 内的 DTO
- T2.2: 后端 DTO + 实体 + Mapper 同步重命名
- T2.3: 后端 controller 路径调整(`/roles/{id}` → `/role-assignments/{id}`)
- T2.4: 创建 `features/context/index.ts`
- T2.5: 创建 `features/teams/`(components + hook + api + types + index)
- T2.6: 创建 `features/memberships/`(components + hook + api + types + index)
- T2.7: 创建 `features/policies/`(components + hook + api + types + index)
- T2.8: 创建 `features/roles/`(components + hook + api + types + index)
- T2.9: 创建 4 个独立 page.tsx(teams/memberships/policies/roles)
- T2.10: 删除旧 `src/features/organization/` 整目录
- T2.11: 删除旧 `src/app/(app)/organization/page.tsx`

### P3: Operations + UX + sonner(10 tasks)

- T3.1: 后端 Organization DELETE/PATCH controller
- T3.2: 后端 Team DELETE/PATCH controller
- T3.3: 后端 Project DELETE/PATCH controller
- T3.4: 前端 teams feature 挂删除/重命名按钮
- T3.5: 前端 4 个 feature 的操作统一改用 sonner toast
- T3.6: 修复 `organization-tree-panel.tsx:224`(已迁移到 teams feature)
- T3.7: 修复 `members-panel.tsx:221`(已迁移到 memberships feature)
- T3.8: project 列表改为可点击切换
- T3.9: policies 版本历史订阅自动刷新
- T3.10: policies feature 挂 distribute/withdraw UI

### P4: Unit Tests(5 tasks)

- T4.1: `features/context/store.ts` 状态机测试
- T4.2: `features/teams/hooks/use-teams-data.ts` 单测
- T4.3: `features/memberships/hooks/use-memberships-data.ts` 单测
- T4.4: `features/policies/hooks/use-policies-data.ts` 单测
- T4.5: `features/roles/hooks/use-roles-data.ts` 单测

### P5: Invitation Flow(8 tasks)

- T5.1: 后端 Invitation entity + mapper + repository
- T5.2: 后端 InvitationService(create/list/revoke/accept)
- T5.3: 后端 InvitationController(4 个端点)
- T5.4: 前端 `features/memberships/api.ts` 加 invitation 方法
- T5.5: 前端 `InviteModal` 组件
- T5.6: 前端 `PendingInvitations` 列表组件
- T5.7: 前端 `/accept-invite` 页面完整实现
- T5.8: 前端 memberships page 接入邀请流程,移除 userId 直接添加

### Out of Scope(显式不做)

- SSO / SCIM / 签名 / 审计报表
- 个人规则搬入 policies
- Playwright 组件测试
- 后端 MailSender 已有 `LoggingEmailSender` 与 `SmtpEmailSender`,本期直接用 `LoggingEmailSender`,**不新增 `ConsoleMailSender`**

---

## P1: Context Foundation

### Task 1.1: zustand store 状态定义 [x]

**Files:**
- Create: `src/features/context/store.ts`

- [ ] **Step 1: 创建 store 文件**

```ts
// src/features/context/store.ts
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Organization } from "@/lib/contracts";

export type WorkspaceScope = "personal" | "organization";

interface WorkspaceState {
  scope: WorkspaceScope;
  organizationId: string | null;
  organizationName: string | null;
  organizations: Organization[];

  setOrganizations: (orgs: Organization[]) => void;
  setOrganization: (id: string) => void;
  clearOrganization: () => void;
  reset: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      scope: "personal",
      organizationId: null,
      organizationName: null,
      organizations: [],

      setOrganizations: (orgs) => {
        const currentId = get().organizationId;
        const exists = currentId && orgs.some((o) => o.id === currentId);
        set({
          organizations: orgs,
          organizationId: exists ? currentId : null,
          organizationName: exists
            ? orgs.find((o) => o.id === currentId)?.name ?? null
            : null,
          scope: exists ? "organization" : "personal",
        });
      },

      setOrganization: (id) => {
        const org = get().organizations.find((o) => o.id === id);
        if (!org) return;
        set({
          organizationId: id,
          organizationName: org.name,
          scope: "organization",
        });
      },

      clearOrganization: () =>
        set({
          organizationId: null,
          organizationName: null,
          scope: "personal",
        }),

      reset: () =>
        set({
          scope: "personal",
          organizationId: null,
          organizationName: null,
          organizations: [],
        }),
    }),
    {
      name: "agents-plus:workspace",
      partialize: (state) => ({
        organizationId: state.organizationId,
      }),
    },
  ),
);
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
cd D:/workspace/agents-plus && npx tsc --noEmit
```

Expected: 0 errors(其他文件不会引用,新增文件本身必须类型正确)

- [ ] **Step 3: Commit**

```bash
git add src/features/context/store.ts
git commit -m "feat(context): add zustand store for workspace context"
```

---

### Task 1.2: useWorkspaceContext hook [x]

**Files:**
- Create: `src/features/context/hooks/use-workspace-context.ts`

- [ ] **Step 1: 创建 hook**

```ts
// src/features/context/hooks/use-workspace-context.ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiClientError } from "@/lib/api-client";
import { useWorkspaceStore } from "@/features/context/store";

export interface WorkspaceContextApi {
  scope: "personal" | "organization";
  organizationId: string | null;
  organizationName: string | null;
  organizations: Array<{ id: string; name: string }>;
  loading: boolean;
  error: string | null;
  setOrganization: (id: string) => void;
  clearOrganization: () => void;
  refresh: () => Promise<void>;
}

export function useWorkspaceContext(): WorkspaceContextApi {
  const {
    scope,
    organizationId,
    organizationName,
    organizations,
    setOrganizations,
    setOrganization,
    clearOrganization,
  } = useWorkspaceStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const orgs = await api.listMyOrganizations();
      setOrganizations(orgs);
    } catch (caught) {
      const msg =
        caught instanceof ApiClientError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : "加载组织列表失败";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [setOrganizations]);

  // 首次挂载自动加载
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    scope,
    organizationId,
    organizationName,
    organizations,
    loading,
    error,
    setOrganization,
    clearOrganization,
    refresh,
  };
}
```

- [ ] **Step 2: 验证类型**

```bash
cd D:/workspace/agents-plus && npx tsc --noEmit
```

Expected: 0 errors(`api.listMyOrganizations` 在 T2.1 重命名后接入,这里先在 contracts.ts 加占位)

- [ ] **Step 3: 临时给 contracts.ts 加占位方法(待 T2.1 正式接入)**

打开 `src/lib/contracts.ts`,在 export 区域确认已有 `listMyOrganizations`。**如果还没有**,先临时在 `src/lib/api-client.ts` 的 `api` 对象里加:

```ts
listMyOrganizations: () =>
  request<Organization[]>("/api/v1/me/organizations"),
```

(T2.1 会替换为正式端点 `/api/v1/organizations` 并由 backend listMyOrganizations 实现)

- [ ] **Step 4: Commit**

```bash
git add src/features/context/hooks/use-workspace-context.ts src/lib/api-client.ts
git commit -m "feat(context): add useWorkspaceContext hook"
```

---

### Task 1.3: ContextSwitcher 组件 [x] [x]

**Files:**
- Create: `src/features/context/components/context-switcher.tsx`

- [ ] **Step 1: 创建组件**

```tsx
// src/features/context/components/context-switcher.tsx
"use client";

import { Building2, ChevronDown, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspaceContext } from "@/features/context/hooks/use-workspace-context";
import { toast } from "sonner";

export function ContextSwitcher() {
  const ctx = useWorkspaceContext();

  const triggerLabel =
    ctx.scope === "organization"
      ? ctx.organizationName || "选择组织"
      : "个人空间";
  const TriggerIcon = ctx.scope === "organization" ? Building2 : User;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between gap-2"
          disabled={ctx.loading}
        >
          <span className="flex items-center gap-2 truncate">
            <TriggerIcon className="size-4 shrink-0" />
            <span className="truncate">{triggerLabel}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>切换工作区</DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => {
            ctx.clearOrganization();
            toast.success("已切换到个人空间");
          }}
          className="flex items-center gap-2"
        >
          <User className="size-4" />
          <span>个人空间</span>
          {ctx.scope === "personal" && (
            <span className="ml-auto text-xs text-muted-foreground">当前</span>
          )}
        </DropdownMenuItem>

        {ctx.organizations.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              我的组织
            </DropdownMenuLabel>
            {ctx.organizations.map((org) => (
              <DropdownMenuItem
                key={org.id}
                onClick={() => {
                  ctx.setOrganization(org.id);
                  toast.success(`已切换到 ${org.name}`);
                }}
                className="flex items-center gap-2"
              >
                <Building2 className="size-4" />
                <span className="truncate">{org.name}</span>
                {ctx.organizationId === org.id && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    当前
                  </span>
                )}
              </DropdownMenuItem>
            ))}
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            window.location.href = "/organization";
          }}
        >
          <Building2 className="size-4" />
          进入组织管理
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: 验证渲染(只编译)**

```bash
cd D:/workspace/agents-plus && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/features/context/components/context-switcher.tsx
git commit -m "feat(context): add context switcher dropdown component"
```

---

### Task 1.4: 改造 (app)/layout.tsx 加载 context [x]

**Files:**
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: 读取现有 layout**

打开 `src/app/(app)/layout.tsx`,了解当前结构(已在前文扫过,包含侧边栏)。

- [ ] **Step 2: 在 layout 顶部加入 ContextSwitcher**

在侧边栏头部(`<SidebarHeader>` 或对应位置)插入:

```tsx
import { ContextSwitcher } from "@/features/context/components/context-switcher";

// 在侧边栏 header 内部、菜单之前
<div className="p-2">
  <ContextSwitcher />
</div>
```

具体位置取决于现有 sidebar 结构;`/features/app/components/app-sidebar.tsx` 是常见位置,把 ContextSwitcher 嵌入到该组件顶部即可。

- [ ] **Step 3: 验证编译**

```bash
cd D:/workspace/agents-plus && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 4: 提交**

```bash
git add src/app/'(app)'/layout.tsx src/features/app/components/app-sidebar.tsx
git commit -m "feat(context): wire context switcher into app sidebar"
```

---

### Task 1.5: organization 路由组 layout 加 redirect 守卫 [x]

**Files:**
- Create: `src/app/(app)/organization/layout.tsx`

- [ ] **Step 1: 创建 layout**

```tsx
// src/app/(app)/organization/layout.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceContext } from "@/features/context/hooks/use-workspace-context";
import { toast } from "sonner";

/**
 * 组织空间根布局:无 ctx=organization 时 redirect 到 /overview,
 * 并 toast 提示用户。
 */
export default function OrganizationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = useWorkspaceContext();
  const router = useRouter();

  useEffect(() => {
    if (!ctx.loading && ctx.scope !== "organization") {
      toast.error("请先选择一个组织", {
        description: "侧边栏顶部可切换或创建组织",
      });
      router.replace("/overview");
    }
  }, [ctx.loading, ctx.scope, router]);

  if (ctx.loading || ctx.scope !== "organization") {
    return (
      <div className="flex h-full items-center justify-center p-12">
        <p className="text-sm text-muted-foreground">正在加载组织上下文…</p>
      </div>
    );
  }

  return <>{children}</>;
}
```

- [ ] **Step 2: 验证**

```bash
cd D:/workspace/agents-plus && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/app/'(app)'/organization/layout.tsx
git commit -m "feat(context): add organization layout redirect guard"
```

---

### Task 1.6: 公开路由骨架 [x] [x]

**Files:**
- Create: `src/app/(public)/layout.tsx`
- Create: `src/app/(public)/accept-invite/page.tsx`

- [ ] **Step 1: 创建 (public) layout**

```tsx
// src/app/(public)/layout.tsx
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      {children}
    </main>
  );
}
```

- [ ] **Step 2: 创建 accept-invite 骨架(P5 完整实现)**

```tsx
// src/app/(public)/accept-invite/page.tsx
"use client";

import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AcceptInvitePage() {
  const params = useSearchParams();
  const token = params.get("token");

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>接受组织邀请</CardTitle>
      </CardHeader>
      <CardContent>
        {token ? (
          <p className="text-sm text-muted-foreground">
            正在处理邀请(token 校验将在 P5 任务实现)
          </p>
        ) : (
          <p className="text-sm text-destructive">邀请链接无效</p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: 验证**

```bash
cd D:/workspace/agents-plus && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/app/'(public)'/
git commit -m "feat(context): add public route group with accept-invite skeleton"
```

---

### Task 1.7: [x] 登录/注册支持 returnUrl [x]

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/app/(auth)/register/page.tsx`

- [ ] **Step 1: 在 login 页面读取 returnUrl**

在 login page 顶部:

```tsx
import { useRouter, useSearchParams } from "next/navigation";

// 在组件内
const router = useRouter();
const params = useSearchParams();
const returnUrl = params.get("returnUrl");

async function onLogin() {
  // ... 现有登录逻辑成功后:
  router.push(returnUrl ?? "/overview");
}
```

- [ ] **Step 2: 在 register 页面同样处理**

读取 `returnUrl`,注册成功后跳转。

- [ ] **Step 3: 验证**

```bash
cd D:/workspace/agents-plus && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/app/'(auth)'/login/page.tsx src/app/'(auth)'/register/page.tsx
git commit -m "feat(auth): support returnUrl on login and register"
```

---

## P2: Split + DTO Rename

### Task 2.1: 重命名 contracts.ts 中的 DTO

**Files:**
- Modify: `src/lib/contracts.ts`

- [ ] **Step 1: 全局重命名**

```diff
-export interface OrganizationMember { id: string; organizationId: string; userId: string; status: string; }
+export interface Membership { id: string; organizationId: string; userId: string; status: string; }

-export interface TeamMember { id: string; teamId: string; organizationMemberId: string; status: string; }
+export interface TeamMembership { id: string; teamId: string; organizationMemberId: string; status: string; }

-export interface PendingPolicyRequest { id: string; message: string; status: string; }
+export interface PolicyReviewRequest { id: string; message: string; status: string; }

-export interface PolicyChange { id: string; policyDocumentId: string; status: string; contentHash: string; message: string; }
+export interface PolicyDraft { id: string; policyDocumentId: string; status: string; contentHash: string; message: string; }

-export interface RoleResponse { id: string; roleCode: string; roleName: string; description: string | null; scope: string; }
+export interface Role { id: string; roleCode: string; roleName: string; description: string | null; scope: string; }
```

- [ ] **Step 2: 添加 Invitation 类型**

```ts
export type InvitationStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";

export interface Invitation {
  id: string;
  organizationId: string;
  email: string;
  roleId: string | null;
  teamIds: string[];
  token: string;
  expiresAt: string;
  status: InvitationStatus;
  createdAt: string;
}
```

- [ ] **Step 3: 全局替换引用(用 IDE rename 或 grep 手工改)**

```bash
cd D:/workspace/agents-plus && grep -rln "OrganizationMember\|TeamMember\|PendingPolicyRequest\|PolicyChange\|RoleResponse" src/
```

把所有引用替换为新名。**注意**:旧 `use-organization-data.ts` 在 T2.5 会被拆掉,这里只改 contracts.ts 即可,T2.5 之后再无残留引用。

- [ ] **Step 4: 验证**

```bash
cd D:/workspace/agents-plus && npx tsc --noEmit
```

Expected: 报错(因为旧 organization feature 引用旧名),T2.5-T2.8 完成后会消除。

- [ ] **Step 5: Commit(暂时允许编译失败,后续 task 修复)**

```bash
git add src/lib/contracts.ts
git commit -m "refactor(contracts): rename DTOs (OrganizationMember→Membership etc.)"
```

---

### Task 2.2: 后端 DTO + entity + mapper 重命名

**Files:**
- Modify: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/dto/**`
- Modify: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/entity/**`
- Modify: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/mapper/**`

- [ ] **Step 1: 重命名 DTO 类**

| 旧类名 | 新类名 | 文件 |
|---|---|---|
| `OrganizationMemberDto` | `MembershipDto` | `dto/MembershipDto.java` |
| `TeamMemberDto` | `TeamMembershipDto` | `dto/TeamMembershipDto.java` |
| `PendingPolicyRequestDto` | `PolicyReviewRequestDto` | `dto/PolicyReviewRequestDto.java` |
| `PolicyChangeDto` | `PolicyDraftDto` | `dto/PolicyDraftDto.java` |
| `RoleResponseDto` | `RoleDto` | `dto/RoleDto.java` |
| (新增) | `InvitationDto` | `dto/InvitationDto.java` |
| (新增) | `CreateInvitationRequest` | `dto/CreateInvitationRequest.java` |
| (新增) | `AcceptInvitationRequest` | `dto/AcceptInvitationRequest.java` |

执行 `git mv` 重命名,然后更新每个文件 `class` 声明。

- [ ] **Step 2: 重命名 entity**

| 旧表/类 | 新类 | 文件 |
|---|---|---|
| `OrganizationMember` | `Membership` | `entity/Membership.java` |
| `TeamMember` | `TeamMembership` | `entity/TeamMembership.java` |

如有 MyBatis `@Table` 注解,更新表名映射。

- [ ] **Step 3: 重命名 mapper**

| 旧接口 | 新接口 |
|---|---|
| `OrganizationMemberMapper` | `MembershipMapper` |
| `TeamMemberMapper` | `TeamMembershipMapper` |

- [ ] **Step 4: 全局替换引用(controller/service/repository)**

```bash
cd D:/workspace/agents-plus-server && grep -rln "OrganizationMemberDto\|TeamMemberDto\|PendingPolicyRequestDto\|PolicyChangeDto\|RoleResponseDto" src/main/java/
```

逐个替换 import 和类型引用。

- [ ] **Step 5: 编译验证**

```bash
cd D:/workspace/agents-plus-server && mvn compile -q
```

Expected: BUILD SUCCESS

- [ ] **Step 6: 跑现有测试**

```bash
cd D:/workspace/agents-plus-server && mvn test -q
```

Expected: 现有测试全部通过(类型重命名不应破坏测试)

- [ ] **Step 7: Commit**

```bash
cd D:/workspace/agents-plus-server && git add . && git commit -m "refactor(dto): rename to align with frontend contracts"
```

---

### Task 2.3: 后端 controller 路径调整

**Files:**
- Modify: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/controller/RoleController.java`

- [ ] **Step 1: 把 `DELETE /roles/{assignmentId}` 改为 `/role-assignments/{id}`**

```java
// 删除原路径映射
- @DeleteMapping("/roles/{assignmentId}")
+ @DeleteMapping("/role-assignments/{id}")
```

如果有 `@PathVariable("assignmentId")` 同步改为 `@PathVariable("id")`。

- [ ] **Step 2: 编译验证**

```bash
cd D:/workspace/agents-plus-server && mvn compile -q
```

Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
cd D:/workspace/agents-plus-server && git add . && git commit -m "refactor(api): rename roles/{id} to role-assignments/{id}"
```

---

### Task 2.4: 创建 features/context/index.ts

**Files:**
- Create: `src/features/context/index.ts`

- [ ] **Step 1: 写 barrel 文件**

```ts
// src/features/context/index.ts
export { ContextSwitcher } from "./components/context-switcher";
export {
  useWorkspaceContext,
  type WorkspaceContextApi,
} from "./hooks/use-workspace-context";
export {
  useWorkspaceStore,
  type WorkspaceScope,
} from "./store";
```

- [ ] **Step 2: 验证**

```bash
cd D:/workspace/agents-plus && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/features/context/index.ts
git commit -m "feat(context): add barrel exports"
```

---

### Task 2.5: 创建 features/teams/

**Files:**
- Create: `src/features/teams/types.ts`
- Create: `src/features/teams/api.ts`
- Create: `src/features/teams/hooks/use-teams-data.ts`
- Create: `src/features/teams/components/organization-selector.tsx`
- Create: `src/features/teams/components/team-card.tsx`
- Create: `src/features/teams/components/project-card.tsx`
- Create: `src/features/teams/components/create-forms.tsx`
- Create: `src/features/teams/index.ts`

- [ ] **Step 1: types.ts(只 import 团队/项目相关)**

```ts
// src/features/teams/types.ts
import type { Organization, Team, Project } from "@/lib/contracts";
export type { Organization, Team, Project };

export interface TeamsDataApi {
  organizations: Organization[];
  teams: Team[];
  projects: Project[];
  organizationId: string;
  teamId: string;
  projectId: string;
  error: string | null;
  busy: string | null;
  setOrganizationId: (id: string) => void;
  setTeamId: (id: string) => void;
  setProjectId: (id: string) => void;
  createOrganization: (name: string) => Promise<void>;
  createTeam: (name: string) => Promise<void>;
  createProject: (name: string) => Promise<void>;
}
```

- [ ] **Step 2: api.ts**

```ts
// src/features/teams/api.ts
import { api } from "@/lib/api-client";
import type { Organization, Team, Project } from "@/lib/contracts";

export const teamsApi = {
  listOrganizations: () => api.listMyOrganizations(),

  listTeams: (orgId: string) => api.listTeams(orgId),
  createTeam: (orgId: string, name: string) =>
    api.createTeam(orgId, name),

  listProjects: (orgId: string, teamId: string) =>
    api.listProjects(orgId, teamId),
  createProject: (orgId: string, teamId: string, name: string) =>
    api.createProject(orgId, teamId, name),
};

export type { Organization, Team, Project };
```

- [ ] **Step 3: hook use-teams-data.ts**

```ts
// src/features/teams/hooks/use-teams-data.ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useWorkspaceStore } from "@/features/context/store";
import { teamsApi } from "@/features/teams/api";
import { ApiClientError } from "@/lib/api-client";
import type { Organization, Project, Team } from "@/lib/contracts";
import type { TeamsDataApi } from "@/features/teams/types";

function readableError(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

export function useTeamsData(): TeamsDataApi {
  const organizationId = useWorkspaceStore((s) => s.organizationId);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teamId, setTeamId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // 加载当前 organizationId 下的 teams
  useEffect(() => {
    if (!organizationId) {
      setTeams([]);
      setTeamId("");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await teamsApi.listTeams(organizationId);
        if (cancelled) return;
        setTeams(list);
        setTeamId(list[0]?.id || "");
      } catch (caught) {
        if (!cancelled) setError(readableError(caught, "加载团队失败"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  // 加载 teamId 下的 projects
  useEffect(() => {
    if (!organizationId || !teamId) {
      setProjects([]);
      setProjectId("");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await teamsApi.listProjects(organizationId, teamId);
        if (cancelled) return;
        setProjects(list);
        setProjectId(list[0]?.id || "");
      } catch (caught) {
        if (!cancelled) setError(readableError(caught, "加载项目失败"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, teamId]);

  const setOrganizationId = useCallback(
    (id: string) => useWorkspaceStore.getState().setOrganization(id),
    [],
  );

  const createOrganization = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy("创建组织");
    try {
      const org = await api().createOrganization(trimmed);
      // 把新组织加入 store 列表,然后切到它
      const next = [
        ...useWorkspaceStore.getState().organizations,
        org,
      ];
      useWorkspaceStore.getState().setOrganizations(next);
      useWorkspaceStore.getState().setOrganization(org.id);
      toast.success(`已创建组织 ${org.name}`);
    } catch (caught) {
      toast.error(readableError(caught, "创建组织失败"));
    } finally {
      setBusy(null);
    }
  }, []);

  const createTeam = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || !organizationId) return;
      setBusy("创建团队");
      try {
        const team = await teamsApi.createTeam(organizationId, trimmed);
        setTeams((cur) => [...cur, team]);
        setTeamId(team.id);
        toast.success(`已创建团队 ${team.name}`);
      } catch (caught) {
        toast.error(readableError(caught, "创建团队失败"));
      } finally {
        setBusy(null);
      }
    },
    [organizationId],
  );

  const createProject = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || !organizationId || !teamId) return;
      setBusy("创建项目");
      try {
        const project = await teamsApi.createProject(
          organizationId,
          teamId,
          trimmed,
        );
        setProjects((cur) => [...cur, project]);
        setProjectId(project.id);
        toast.success(`已创建项目 ${project.name}`);
      } catch (caught) {
        toast.error(readableError(caught, "创建项目失败"));
      } finally {
        setBusy(null);
      }
    },
    [organizationId, teamId],
  );

  return {
    organizations,
    teams,
    projects,
    organizationId,
    teamId,
    projectId,
    error,
    busy,
    setOrganizationId,
    setTeamId,
    setProjectId,
    createOrganization,
    createTeam,
    createProject,
  };
}
```

(注:上面引用了 `api().createOrganization`,实际是从 `src/lib/api-client.ts` 的 `api` 对象导入 — 在生产代码中改为正常 import:)

```ts
import { api } from "@/lib/api-client";
// ...
const org = await api.createOrganization(trimmed);
```

- [ ] **Step 4: components**

参考原 `organization-tree-panel.tsx` 的实现,但分拆为 4 个组件文件。代码结构沿用现有 shadcn Card/Select/Input/Button,完整 JSX 与原文件对应;**唯一例外是 T3.6/T3.8 要修的 bug**(空状态文案 + 项目可点击)。

- [ ] **Step 5: index.ts**

```ts
// src/features/teams/index.ts
export { useTeamsData } from "./hooks/use-teams-data";
export type { TeamsDataApi } from "./types";
export { teamsApi } from "./api";
```

- [ ] **Step 6: 验证**

```bash
cd D:/workspace/agents-plus && npx tsc --noEmit
```

Expected: teams feature 内部 0 errors;旧 organization feature 报错(预期,T2.10 删除)

- [ ] **Step 7: Commit**

```bash
git add src/features/teams/
git commit -m "feat(teams): extract teams feature from organization"
```

---

### Task 2.6: 创建 features/memberships/

**Files:**
- Create: `src/features/memberships/types.ts`
- Create: `src/features/memberships/api.ts`
- Create: `src/features/memberships/hooks/use-memberships-data.ts`
- Create: `src/features/memberships/components/organization-members.tsx`
- Create: `src/features/memberships/components/team-members.tsx`
- Create: `src/features/memberships/index.ts`

- [ ] **Step 1: types.ts**

```ts
// src/features/memberships/types.ts
import type { Membership, TeamMembership } from "@/lib/contracts";
export type { Membership, TeamMembership };

export interface MembershipsDataApi {
  members: Membership[];
  teamMembers: TeamMembership[];
  organizationId: string;
  teamId: string;
  error: string | null;
  busy: string | null;
  addOrganizationMember: (userId: string) => Promise<void>;
  enableOrganizationMember: (id: string) => Promise<void>;
  disableOrganizationMember: (id: string) => Promise<void>;
  removeOrganizationMember: (id: string) => Promise<void>;
  addTeamMember: (organizationMemberId: string) => Promise<void>;
  enableTeamMember: (organizationMemberId: string) => Promise<void>;
  disableTeamMember: (organizationMemberId: string) => Promise<void>;
  removeTeamMember: (organizationMemberId: string) => Promise<void>;
}
```

- [ ] **Step 2: api.ts**

```ts
// src/features/memberships/api.ts
import { api } from "@/lib/api-client";
import type { Membership, TeamMembership } from "@/lib/contracts";

export const membershipsApi = {
  listOrganizationMembers: (orgId: string) =>
    api.listOrganizationMembers(orgId),
  addOrganizationMember: (orgId: string, userId: string) =>
    api.addOrganizationMember(orgId, userId),
  enableOrganizationMember: (orgId: string, memberId: string) =>
    api.enableOrganizationMember(orgId, memberId),
  disableOrganizationMember: (orgId: string, memberId: string) =>
    api.disableOrganizationMember(orgId, memberId),
  removeOrganizationMember: (orgId: string, memberId: string) =>
    api.removeOrganizationMember(orgId, memberId),

  listTeamMembers: (teamId: string) => api.listTeamMembers(teamId),
  addTeamMember: (teamId: string, organizationMemberId: string) =>
    api.addTeamMember(teamId, organizationMemberId),
  enableTeamMember: (teamId: string, memberId: string) =>
    api.enableTeamMember(teamId, memberId),
  disableTeamMember: (teamId: string, memberId: string) =>
    api.disableTeamMember(teamId, memberId),
  removeTeamMember: (teamId: string, memberId: string) =>
    api.removeTeamMember(teamId, memberId),
};
```

- [ ] **Step 3: hook use-memberships-data.ts**

沿用 `use-organization-data.ts` 第 305-404 行的成员管理逻辑,把 `api.xxx` 替换为 `membershipsApi.xxx`,把团队 ID 来源改为 `useWorkspaceStore` 关联的 teamId(此处需要在 teams feature 暴露或在此处读 store)。

实现提示:由于 membership 涉及 teams feature 的 teamId,这里改为:

```ts
import { useTeamsData } from "@/features/teams/hooks/use-teams-data";

// 在 hook 内
const teams = useTeamsData();
const teamId = teams.teamId;
const organizationId = teams.organizationId;
```

(共享同一 store,数据自然一致,无须 props drilling)

- [ ] **Step 4: components**

参考原 `members-panel.tsx` 拆为 `organization-members.tsx` + `team-members.tsx`。**T3.7 修复**:`team-members.tsx` 不再用 `formatTime(member.id)`,改为从后端响应增加 `joinedAt: string` 字段(T2.2 已扩展)。

- [ ] **Step 5: index.ts**

```ts
// src/features/memberships/index.ts
export { useMembershipsData } from "./hooks/use-memberships-data";
export { membershipsApi } from "./api";
export type { MembershipsDataApi } from "./types";
```

- [ ] **Step 6: Commit**

```bash
git add src/features/memberships/
git commit -m "feat(memberships): extract memberships feature from organization"
```

---

### Task 2.7: 创建 features/policies/

**Files:**
- Create: `src/features/policies/types.ts`
- Create: `src/features/policies/api.ts`
- Create: `src/features/policies/hooks/use-policies-data.ts`
- Create: `src/features/policies/components/submit-policy.tsx`
- Create: `src/features/policies/components/pending-policies.tsx`
- Create: `src/features/policies/components/effective-policy.tsx`
- Create: `src/features/policies/components/history-panel.tsx`
- Create: `src/features/policies/components/distribute-panel.tsx`
- Create: `src/features/policies/index.ts`

- [ ] **Step 1: types.ts**

```ts
// src/features/policies/types.ts
import type {
  EffectivePolicies,
  PolicyDistribution,
  PolicyDraft,
  PolicyReviewRequest,
  PolicyVersion,
} from "@/lib/contracts";
export type {
  EffectivePolicies,
  PolicyDistribution,
  PolicyDraft,
  PolicyReviewRequest,
  PolicyVersion,
};

export interface PoliciesDataApi {
  pendingPolicies: PolicyReviewRequest[];
  policyVersions: PolicyVersion[];
  distributions: PolicyDistribution[];
  effectivePolicies: EffectivePolicies | null;
  organizationId: string;
  teamId: string;
  projectId: string;
  error: string | null;
  busy: string | null;
  submitPolicyChange: (input: {
    policyType: "AGENT" | "CLAUDE";
    content: string;
    message: string;
  }) => Promise<void>;
  reviewPolicyChange: (
    requestId: string,
    decision: "APPROVED" | "REJECTED",
  ) => Promise<void>;
  loadPolicyHistory: (policyType: "AGENT" | "CLAUDE") => Promise<void>;
  withdrawDistribution: (distributionId: string) => Promise<void>;
}
```

- [ ] **Step 2: api.ts**

```ts
// src/features/policies/api.ts
import { api } from "@/lib/api-client";

export const policiesApi = {
  getEffectivePolicies: (orgId: string, teamId: string, projectId: string) =>
    api.getEffectivePolicies(orgId, teamId, projectId),
  listPendingPolicyChanges: (orgId: string) =>
    api.listPendingPolicyChanges(orgId),
  submitPolicyChange: (orgId: string, input: unknown) =>
    api.submitPolicyChange(orgId, input),
  reviewPolicyChange: (orgId: string, requestId: string, decision: string) =>
    api.reviewPolicyChange(orgId, requestId, decision),
  listPolicyHistory: (orgId: string, policyType: string) =>
    api.listPolicyHistory(orgId, policyType),
  listPolicyDistributions: (orgId: string) =>
    api.listPolicyDistributions(orgId),
  withdrawPolicyDistribution: (orgId: string, distributionId: string) =>
    api.withdrawPolicyDistribution(orgId, distributionId),
};
```

- [ ] **Step 3: hook use-policies-data.ts**

沿用 `use-organization-data.ts` 第 220-240 行(effective)+ 第 406-459 行(policy/distribution),把 `api.xxx` 替换为 `policiesApi.xxx`,`useTeamsData()` 拿 organizationId/teamId/projectId。

- [ ] **Step 4: components**

参考原 `policy-panel.tsx` 拆分。**T3.9 改进**:`history-panel.tsx` 改为挂载即调 `loadPolicyHistory("AGENT")` + `loadPolicyHistory("CLAUDE")`,不依赖手动按钮。

**T3.10**:`distribute-panel.tsx` 新建,展示 `data.distributions` 列表 + "撤回"按钮 + "新增分发"表单(scope: org/team/project)。

- [ ] **Step 5: index.ts**

```ts
// src/features/policies/index.ts
export { usePoliciesData } from "./hooks/use-policies-data";
export { policiesApi } from "./api";
export type { PoliciesDataApi } from "./types";
```

- [ ] **Step 6: Commit**

```bash
git add src/features/policies/
git commit -m "feat(policies): extract policies feature from organization"
```

---

### Task 2.8: 创建 features/roles/

**Files:**
- Create: `src/features/roles/types.ts`
- Create: `src/features/roles/api.ts`
- Create: `src/features/roles/hooks/use-roles-data.ts`
- Create: `src/features/roles/components/assign-role.tsx`
- Create: `src/features/roles/components/assignments-list.tsx`
- Create: `src/features/roles/index.ts`

- [ ] **Step 1: types.ts**

```ts
// src/features/roles/types.ts
import type { Role, RoleAssignment } from "@/lib/contracts";
export type { Role, RoleAssignment };

export interface RolesDataApi {
  roles: Role[];
  roleAssignments: RoleAssignment[];
  organizationId: string;
  error: string | null;
  busy: string | null;
  assignRole: (input: {
    organizationMemberId: string;
    roleId: string;
  }) => Promise<void>;
  revokeRoleAssignment: (assignmentId: string) => Promise<void>;
}
```

- [ ] **Step 2: api.ts**

```ts
// src/features/roles/api.ts
import { api } from "@/lib/api-client";

export const rolesApi = {
  listRoles: (orgId: string) => api.listRoles(orgId),
  listRoleAssignments: (orgId: string) => api.listRoleAssignments(orgId),
  assignRole: (orgId: string, input: unknown) => api.assignRole(orgId, input),
  revokeRole: (orgId: string, assignmentId: string) =>
    api.revokeRole(orgId, assignmentId),
};
```

- [ ] **Step 3: hook**

沿用 `use-organization-data.ts` 第 461-487 行。

- [ ] **Step 4: components**

参考 `roles-panel.tsx` 拆为 `assign-role.tsx` + `assignments-list.tsx`。

- [ ] **Step 5: index.ts**

```ts
export { useRolesData } from "./hooks/use-roles-data";
export { rolesApi } from "./api";
export type { RolesDataApi } from "./types";
```

- [ ] **Step 6: Commit**

```bash
git add src/features/roles/
git commit -m "feat(roles): extract roles feature from organization"
```

---

### Task 2.9: 创建 4 个独立 page

**Files:**
- Create: `src/app/(app)/organization/page.tsx`
- Create: `src/app/(app)/organization/teams/page.tsx`
- Create: `src/app/(app)/organization/memberships/page.tsx`
- Create: `src/app/(app)/organization/policies/page.tsx`
- Create: `src/app/(app)/organization/roles/page.tsx`

- [ ] **Step 1: organization/page.tsx(组织概览)**

```tsx
// src/app/(app)/organization/page.tsx
"use client";

import { Building2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { useWorkspaceContext } from "@/features/context/hooks/use-workspace-context";

export default function OrganizationOverviewPage() {
  const ctx = useWorkspaceContext();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="工作区"
        title={ctx.organizationName ?? "组织"}
        description="当前组织的管理入口。"
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-5" />
            组织概览
          </CardTitle>
          <CardDescription>
            使用左侧菜单进入团队与项目、成员管理、规范和角色。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            组织 ID:<code className="font-mono">{ctx.organizationId}</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: organization/teams/page.tsx**

```tsx
"use client";

import { PageHeader } from "@/components/page-header";
import { OrganizationSelector } from "@/features/teams/components/organization-selector";
import { TeamCard } from "@/features/teams/components/team-card";
import { ProjectCard } from "@/features/teams/components/project-card";
import { CreateOrganizationForm } from "@/features/teams/components/create-forms";
import { useTeamsData } from "@/features/teams";

export default function TeamsPage() {
  const data = useTeamsData();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="组织"
        title="团队与项目"
        description="管理组织下的团队和项目层级。"
      />
      <OrganizationSelector data={data} />
      <CreateOrganizationForm data={data} />
      <TeamCard data={data} />
      {data.teamId && <ProjectCard data={data} />}
    </div>
  );
}
```

- [ ] **Step 3: organization/memberships/page.tsx**

```tsx
"use client";

import { PageHeader } from "@/components/page-header";
import { OrganizationMembers } from "@/features/memberships/components/organization-members";
import { TeamMembers } from "@/features/memberships/components/team-members";
import { useMembershipsData } from "@/features/memberships";

export default function MembershipsPage() {
  const data = useMembershipsData();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="组织"
        title="成员"
        description="管理组织成员与团队成员。"
      />
      <OrganizationMembers data={data} />
      <TeamMembers data={data} />
    </div>
  );
}
```

- [ ] **Step 4: organization/policies/page.tsx**

```tsx
"use client";

import { PageHeader } from "@/components/page-header";
import { SubmitPolicyCard } from "@/features/policies/components/submit-policy";
import { PendingPoliciesCard } from "@/features/policies/components/pending-policies";
import { EffectivePolicyCard } from "@/features/policies/components/effective-policy";
import { HistoryCard } from "@/features/policies/components/history-panel";
import { DistributePanel } from "@/features/policies/components/distribute-panel";
import { usePoliciesData } from "@/features/policies";

export default function PoliciesPage() {
  const data = usePoliciesData();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="组织"
        title="规范"
        description="提交、审批、查看与分发规则版本。"
      />
      <SubmitPolicyCard data={data} />
      <PendingPoliciesCard data={data} />
      <EffectivePolicyCard data={data} />
      <HistoryCard data={data} />
      <DistributePanel data={data} />
    </div>
  );
}
```

- [ ] **Step 5: organization/roles/page.tsx**

```tsx
"use client";

import { PageHeader } from "@/components/page-header";
import { AssignRoleCard } from "@/features/roles/components/assign-role";
import { AssignmentsCard } from "@/features/roles/components/assignments-list";
import { useRolesData } from "@/features/roles";

export default function RolesPage() {
  const data = useRolesData();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="组织"
        title="角色与授权"
        description="把组织成员绑定到角色,实现 RBAC。"
      />
      <AssignRoleCard data={data} />
      <AssignmentsCard data={data} />
    </div>
  );
}
```

- [ ] **Step 6: 验证**

```bash
cd D:/workspace/agents-plus && npx tsc --noEmit
```

Expected: 仅旧的 organization/page.tsx 和旧 features/organization 报错(T2.10/T2.11 删除)

- [ ] **Step 7: Commit**

```bash
git add src/app/'(app)'/organization/
git commit -m "feat(org-routes): split organization into 5 pages"
```

---

### Task 2.10: 删除旧 src/features/organization/

**Files:**
- Delete: `src/features/organization/` 整目录

- [ ] **Step 1: 删除**

```bash
cd D:/workspace/agents-plus && rm -rf src/features/organization
```

- [ ] **Step 2: 验证**

```bash
cd D:/workspace/agents-plus && npx tsc --noEmit
```

Expected: 0 errors(旧文件已删除,所有引用已迁移到新 feature)

- [ ] **Step 3: 提交**

```bash
git rm -r src/features/organization
git commit -m "refactor: remove legacy organization feature"
```

---

### Task 2.11: 删除旧 organization/page.tsx

**Files:**
- Delete: `src/app/(app)/organization/page.tsx`(旧 8 行版本)

- [ ] **Step 1: 删除(在 T2.9 已用新 page 覆盖,这里确认)**

```bash
cd D:/workspace/agents-plus && cat src/app/'(app)'/organization/page.tsx
```

确认是新 organization/page.tsx(T2.9 创建)。如果不是,删除旧的:

```bash
git rm src/app/'(app)'/organization/page.tsx
```

- [ ] **Step 2: 验证**

```bash
cd D:/workspace/agents-plus && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: 提交(如需要)**

```bash
git commit -m "refactor: remove legacy organization page (replaced by sub-pages)" --allow-empty
```

---

## P3: Operations + UX + sonner

### Task 3.1: 后端 Organization DELETE/PATCH controller

**Files:**
- Modify: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/controller/OrganizationController.java`
- Modify: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/service/OrganizationService.java`
- Modify: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/dto/UpdateOrganizationRequest.java`(新增)

- [ ] **Step 1: 新增 DTO**

```java
// dto/UpdateOrganizationRequest.java
package com.krmeow.agentsplus.dto;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateOrganizationRequest(
    @NotBlank @Size(max = 120) String name
) {}
```

- [ ] **Step 2: 在 OrganizationService 加方法**

```java
@Transactional
public void delete(String organizationId) {
    // 校验当前用户是 owner 或 admin
    // 软删除或硬删除(根据产品决策,默认软删除)
    repository.softDelete(organizationId);
}

@Transactional
public OrganizationDto rename(String organizationId, String newName) {
    var org = repository.findById(organizationId)
        .orElseThrow(() -> new NotFoundException("Organization not found"));
    org.setName(newName);
    return mapper.toDto(repository.save(org));
}
```

- [ ] **Step 3: 在 controller 加端点**

```java
@DeleteMapping("/{id}")
public ResponseEntity<Void> delete(@PathVariable String id) {
    service.delete(id);
    return ResponseEntity.noContent().build();
}

@PatchMapping("/{id}")
public OrganizationDto update(
    @PathVariable String id,
    @Valid @RequestBody UpdateOrganizationRequest body
) {
    return service.rename(id, body.name());
}
```

- [ ] **Step 4: 编译验证**

```bash
cd D:/workspace/agents-plus-server && mvn compile -q
```

Expected: BUILD SUCCESS

- [ ] **Step 5: 跑现有测试**

```bash
cd D:/workspace/agents-plus-server && mvn test -q
```

Expected: 通过

- [ ] **Step 6: Commit**

```bash
cd D:/workspace/agents-plus-server && git add . && git commit -m "feat(api): add organization DELETE and PATCH endpoints"
```

---

### Task 3.2: 后端 Team DELETE/PATCH controller

**Files:**
- Modify: `TeamController.java`, `TeamService.java`

- [ ] **Step 1-5: 与 T3.1 类似**

参考 T3.1 步骤,实现 `DELETE /api/v1/organizations/{orgId}/teams/{teamId}` 和 `PATCH /api/v1/organizations/{orgId}/teams/{teamId}`(body: `{ name }`)。

- [ ] **Step 6: Commit**

```bash
cd D:/workspace/agents-plus-server && git add . && git commit -m "feat(api): add team DELETE and PATCH endpoints"
```

---

### Task 3.3: 后端 Project DELETE/PATCH controller

**Files:**
- Modify: `ProjectController.java`, `ProjectService.java`

- [ ] **Step 1-5: 与 T3.1 类似**

参考 T3.1,实现 `DELETE /api/v1/organizations/{orgId}/teams/{teamId}/projects/{projectId}` 和 `PATCH` 同路径。

- [ ] **Step 6: Commit**

```bash
cd D:/workspace/agents-plus-server && git add . && git commit -m "feat(api): add project DELETE and PATCH endpoints"
```

---

### Task 3.4: 前端 teams feature 挂删除/重命名按钮

**Files:**
- Modify: `src/features/teams/components/team-card.tsx`
- Modify: `src/features/teams/components/project-card.tsx`
- Modify: `src/features/teams/components/create-forms.tsx`(可能并入 team-card)
- Modify: `src/features/teams/api.ts`
- Modify: `src/features/teams/hooks/use-teams-data.ts`

- [ ] **Step 1: api.ts 加 delete/rename**

```ts
// 追加
deleteOrganization: (orgId: string) =>
  api.deleteOrganization(orgId),
renameOrganization: (orgId: string, name: string) =>
  api.renameOrganization(orgId, name),
deleteTeam: (orgId: string, teamId: string) =>
  api.deleteTeam(orgId, teamId),
renameTeam: (orgId: string, teamId: string, name: string) =>
  api.renameTeam(orgId, teamId, name),
deleteProject: (orgId: string, teamId: string, projectId: string) =>
  api.deleteProject(orgId, teamId, projectId),
renameProject: (orgId: string, teamId: string, projectId: string, name: string) =>
  api.renameProject(orgId, teamId, projectId, name),
```

- [ ] **Step 2: src/lib/api-client.ts 加对应方法**

在 `api` 对象中加 6 个新方法,实现参考 `api.removeOrganizationMember` 的 POST/DELETE 模式。

- [ ] **Step 3: use-teams-data 加 6 个 action**

按现有 `createTeam` 模式,实现 `deleteTeam` / `renameTeam` / `deleteProject` / `renameProject` / `deleteOrganization` / `renameOrganization`,每个 action 调 API 后用 `toast.success/error` 反馈,刷新对应列表。

- [ ] **Step 4: TeamCard 加删除/重命名 UI**

每个团队行右侧加两个按钮:
- 编辑图标 → 弹窗输入新名字 → 确认
- 删除图标 → 二次确认 modal → 调 `deleteTeam`

参考 `members-panel.tsx` 的 enable/disable 按钮模式。

- [ ] **Step 5: ProjectCard 同样加按钮**

- [ ] **Step 6: OrganizationSelector 顶部加 "重命名组织" / "删除组织" 按钮**

放在 selector 卡片右上角,删除按钮带确认。

- [ ] **Step 7: 验证**

```bash
cd D:/workspace/agents-plus && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add src/features/teams/
git commit -m "feat(teams): add delete and rename actions"
```

---

### Task 3.5: 4 个 feature 改用 sonner 反馈

**Files:**
- Modify: `src/features/teams/hooks/use-teams-data.ts`(已在 T2.5 中部分实现,补齐)
- Modify: `src/features/memberships/hooks/use-memberships-data.ts`
- Modify: `src/features/policies/hooks/use-policies-data.ts`
- Modify: `src/features/roles/hooks/use-roles-data.ts`

- [ ] **Step 1: 规则**

- 所有 action(创建/删除/启用/禁用/分配/撤销/审批/分发)改用 `toast.success`/`toast.error`
- 持续错误(网络断开、组织失效)仍在 page 顶部用 `<Alert>`
- 删除 hook 中的顶层 `<Alert>` 渲染依赖(`data.error` 仍保留,但 page 不渲染 Alert 改为 toast)

- [ ] **Step 2: 各 hook 改造示例**

参考 T2.5 `createTeam` 的 toast 模式:

```ts
try {
  await api.x();
  toast.success("操作成功");
} catch (caught) {
  toast.error(readableError(caught, "操作失败"));
}
```

不再 `setError(...)`。

- [ ] **Step 3: page.tsx 移除 `<Alert>`**

`teams/page.tsx` 等四个 page 顶部不再写:

```tsx
{data.error && <Alert variant="destructive">...</Alert>}
```

持续错误情况由 layout(redirect)+ toast 处理。

- [ ] **Step 4: 验证**

```bash
cd D:/workspace/agents-plus && npx tsc --noEmit && npm run lint
```

Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add src/features/ src/app/'(app)'/organization/
git commit -m "refactor: replace top alerts with sonner toast for operations"
```

---

### Task 3.6: 修复空状态文案 bug

**Files:**
- Modify: `src/features/teams/components/project-card.tsx`

- [ ] **Step 1: 修改文案**

```diff
-<EmptyTitle>该项目下还没有项目</EmptyTitle>
+<EmptyTitle>该团队下还没有项目</EmptyTitle>
```

- [ ] **Step 2: 验证**

```bash
cd D:/workspace/agents-plus && npm run lint
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/features/teams/components/project-card.tsx
git commit -m "fix(teams): correct empty state copy"
```

---

### Task 3.7: 修复成员加入时间显示 bug

**Files:**
- Modify: `src/lib/contracts.ts`(`TeamMembership` 加 `joinedAt` 字段)
- Modify: 后端 `TeamMembershipDto.java`
- Modify: `src/features/memberships/components/team-members.tsx`
- Modify: 后端 `TeamMembershipMapper.java`(查询时 SELECT joined_at)

- [ ] **Step 1: 后端 entity 加字段**

```java
@Column(name = "joined_at")
private Instant joinedAt;
```

数据库 migration 加列(默认 `CURRENT_TIMESTAMP`)。

- [ ] **Step 2: 后端 DTO 加字段**

```java
public record TeamMembershipDto(
    String id,
    String teamId,
    String organizationMemberId,
    String status,
    Instant joinedAt
) {}
```

- [ ] **Step 3: 前端 contracts.ts 加字段**

```ts
export interface TeamMembership {
  id: string;
  teamId: string;
  organizationMemberId: string;
  status: string;
  joinedAt: string;
}
```

- [ ] **Step 4: 前端展示**

```tsx
<p className="text-xs text-muted-foreground">
  加入时间:{formatTime(member.joinedAt)}
</p>
```

- [ ] **Step 5: 编译验证**

```bash
cd D:/workspace/agents-plus && npx tsc --noEmit
cd D:/workspace/agents-plus-server && mvn compile -q
```

Expected: BUILD SUCCESS

- [ ] **Step 6: Commit**

```bash
git add src/features/memberships/ src/lib/contracts.ts
cd D:/workspace/agents-plus-server && git add . && git commit -m "feat(api): expose joinedAt on team membership"
cd D:/workspace/agents-plus && git commit -m "fix(memberships): show joinedAt instead of formatting member id"
```

---

### Task 3.8: 项目列表改为可点击切换

**Files:**
- Modify: `src/features/teams/components/project-card.tsx`
- Modify: `src/features/teams/hooks/use-teams-data.ts`

- [ ] **Step 1: 项目列表项改为按钮**

```tsx
{data.projects.map((project) => (
  <li key={project.id}>
    <button
      type="button"
      className={`flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted ${
        project.id === data.projectId ? "bg-muted font-medium" : ""
      }`}
      onClick={() => data.setProjectId(project.id)}
    >
      <span>{project.name}</span>
      <code className="font-mono text-xs text-muted-foreground">
        {project.id}
      </code>
    </button>
  </li>
))}
```

- [ ] **Step 2: 验证编译**

```bash
cd D:/workspace/agents-plus && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/features/teams/
git commit -m "feat(teams): make project list clickable to switch"
```

---

### Task 3.9: 政策版本历史自动刷新

**Files:**
- Modify: `src/features/policies/hooks/use-policies-data.ts`
- Modify: `src/features/policies/components/history-panel.tsx`

- [ ] **Step 1: 挂载时自动加载历史**

在 hook 内,organizationId 变化时:

```ts
useEffect(() => {
  if (!organizationId) return;
  void policiesApi.listPolicyHistory(organizationId, "AGENT")
    .then(setAgentVersions).catch(() => setAgentVersions([]));
  void policiesApi.listPolicyHistory(organizationId, "CLAUDE")
    .then(setClaudeVersions).catch(() => setClaudeVersions([]));
}, [organizationId]);
```

把单数组 `policyVersions` 改为 `{ agent: PolicyVersion[]; claude: PolicyVersion[] }`。

- [ ] **Step 2: history-panel.tsx 用 tabs 分开显示 AGENT/CLAUDE 历史**

沿用现有 shadcn Tabs,两个 tab 内容分别渲染对应类型历史。

- [ ] **Step 3: 验证**

```bash
cd D:/workspace/agents-plus && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/features/policies/
git commit -m "feat(policies): auto-load policy history on mount"
```

---

### Task 3.10: policies 挂 distribute/withdraw UI

**Files:**
- Modify: `src/features/policies/components/distribute-panel.tsx`(T2.7 已创建骨架)

- [ ] **Step 1: 实现完整组件**

```tsx
"use client";

import { useState } from "react";
import { Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { policiesApi } from "@/features/policies/api";
import { useWorkspaceStore } from "@/features/context/store";
import type { PoliciesDataApi } from "@/features/policies/types";

export function DistributePanel({ data }: { data: PoliciesDataApi }) {
  const organizationId = useWorkspaceStore((s) => s.organizationId);
  const [versionId, setVersionId] = useState("");
  const [scope, setScope] = useState<"ORGANIZATION" | "TEAM" | "PROJECT">(
    "ORGANIZATION",
  );
  const [scopeId, setScopeId] = useState("");

  async function distribute() {
    if (!organizationId || !versionId) return;
    try {
      await policiesApi.distribute(organizationId, {
        versionId,
        scopeType: scope,
        scopeId: scope === "ORGANIZATION" ? null : scopeId,
      } as never);
      toast.success("已分发");
      // refresh
    } catch (caught) {
      toast.error((caught as Error).message ?? "分发失败");
    }
  }

  async function withdraw(id: string) {
    if (!organizationId) return;
    try {
      await policiesApi.withdraw(organizationId, id);
      toast.success("已撤回");
    } catch (caught) {
      toast.error((caught as Error).message ?? "撤回失败");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>分发</CardTitle>
        <CardDescription>把已批准的版本分发到组织/团队/项目。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* 分发表单 */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>版本</Label>
            <Input
              value={versionId}
              onChange={(e) => setVersionId(e.target.value)}
              placeholder="versionId"
            />
          </div>
          <div>
            <Label>范围</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as never)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ORGANIZATION">组织</SelectItem>
                <SelectItem value="TEAM">团队</SelectItem>
                <SelectItem value="PROJECT">项目</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {scope !== "ORGANIZATION" && (
            <div>
              <Label>{scope === "TEAM" ? "团队 ID" : "项目 ID"}</Label>
              <Input
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                placeholder={scope === "TEAM" ? "teamId" : "projectId"}
              />
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <Button onClick={distribute} disabled={!versionId}>
            <Send />
            分发
          </Button>
        </div>

        {/* 现有分发列表 */}
        <div className="space-y-2">
          {data.distributions.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无分发</p>
          ) : (
            data.distributions.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <div>
                  <p>
                    {d.scopeType} · {d.teamId ?? d.projectId ?? d.memberId}
                  </p>
                  <code className="text-xs text-muted-foreground">{d.id}</code>
                </div>
                {!d.withdrawn && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => withdraw(d.id)}
                  >
                    <Trash2 />
                    撤回
                  </Button>
                )}
                {d.withdrawn && (
                  <span className="text-xs text-muted-foreground">已撤回</span>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: api.ts 加 distribute 方法**

```ts
distribute: (orgId: string, input: unknown) =>
  api.distributePolicy(orgId, input),
```

(后端 T3.1-T3.3 同节奏已有 `POST /policies/distributions` 端点,但可能名为 `distributePolicy` —— 确认 `src/lib/api-client.ts` 是否有此方法,如无则补;现有代码已发现 `withdrawPolicyDistribution`,参考其实现。)

- [ ] **Step 3: 验证**

```bash
cd D:/workspace/agents-plus && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/features/policies/
git commit -m "feat(policies): add distribute and withdraw UI"
```

---

## P4: Unit Tests

### Task 4.1: workspace store 状态机测试

**Files:**
- Create: `src/features/context/store.test.ts`(使用 vitest,需先 `npm install -D vitest`)

- [ ] **Step 1: 安装 vitest**

```bash
cd D:/workspace/agents-plus && npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

在 `package.json` 加 `"test": "vitest"`,在 `vitest.config.ts` 加 jsdom 环境配置。

- [ ] **Step 2: 写测试**

```ts
// src/features/context/store.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { useWorkspaceStore } from "@/features/context/store";
import type { Organization } from "@/lib/contracts";

const orgA: Organization = {
  id: "org-1",
  name: "Alpha",
  ownerUserId: "u1",
};
const orgB: Organization = {
  id: "org-2",
  name: "Beta",
  ownerUserId: "u2",
};

describe("workspace store", () => {
  beforeEach(() => {
    useWorkspaceStore.getState().reset();
  });

  it("starts in personal scope", () => {
    expect(useWorkspaceStore.getState().scope).toBe("personal");
    expect(useWorkspaceStore.getState().organizationId).toBeNull();
  });

  it("setOrganization switches scope", () => {
    useWorkspaceStore.getState().setOrganizations([orgA, orgB]);
    useWorkspaceStore.getState().setOrganization("org-2");
    const s = useWorkspaceStore.getState();
    expect(s.scope).toBe("organization");
    expect(s.organizationId).toBe("org-2");
    expect(s.organizationName).toBe("Beta");
  });

  it("clearOrganization returns to personal", () => {
    useWorkspaceStore.getState().setOrganizations([orgA]);
    useWorkspaceStore.getState().setOrganization("org-1");
    useWorkspaceStore.getState().clearOrganization();
    const s = useWorkspaceStore.getState();
    expect(s.scope).toBe("personal");
    expect(s.organizationId).toBeNull();
  });

  it("setOrganizations drops invalid organizationId", () => {
    useWorkspaceStore.getState().setOrganizations([orgA]);
    useWorkspaceStore.getState().setOrganization("org-1");
    useWorkspaceStore.getState().setOrganizations([orgB]);
    const s = useWorkspaceStore.getState();
    expect(s.organizationId).toBeNull();
    expect(s.scope).toBe("personal");
  });
});
```

- [ ] **Step 3: 运行测试**

```bash
cd D:/workspace/agents-plus && npm test -- src/features/context/store.test.ts
```

Expected: PASS(4 tests)

- [ ] **Step 4: Commit**

```bash
git add package.json vitest.config.ts src/features/context/store.test.ts
git commit -m "test(context): add workspace store state machine tests"
```

---

### Task 4.2: useTeamsData hook 测试

**Files:**
- Create: `src/features/teams/hooks/use-teams-data.test.ts`

- [ ] **Step 1: mock api**

```ts
// src/features/teams/hooks/use-teams-data.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTeamsData } from "@/features/teams/hooks/use-teams-data";
import { useWorkspaceStore } from "@/features/context/store";
import { api } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  api: {
    listTeams: vi.fn(),
    listProjects: vi.fn(),
    createTeam: vi.fn(),
    createProject: vi.fn(),
    createOrganization: vi.fn(),
  },
  ApiClientError: class extends Error {},
}));

describe("useTeamsData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.getState().reset();
  });

  it("loads teams when organizationId is set", async () => {
    useWorkspaceStore.getState().setOrganization("org-1");
    (api.listTeams as any).mockResolvedValue([
      { id: "t1", organizationId: "org-1", name: "Team 1", defaultTeam: false },
    ]);
    renderHook(() => useTeamsData());
    await waitFor(() => {
      expect(useTeamsStore._getTeams?.()?.length).toBe(1);
    });
  });
});
```

实际写时按 hook 实际暴露的 selector 实现 — 上面只是示意骨架,具体 selector 在 T2.5 已定义。

- [ ] **Step 2: 运行**

```bash
cd D:/workspace/agents-plus && npm test -- src/features/teams
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/features/teams/hooks/use-teams-data.test.ts
git commit -m "test(teams): add useTeamsData hook test"
```

---

### Task 4.3-4.5: memberships / policies / roles hook 测试

- 模式与 T4.2 相同,分别为三个 hook 写测试
- mock 各自的 api 模块,验证级联加载、busy/error 状态
- 每个 task 一个 commit

```bash
git commit -m "test(memberships): add useMembershipsData hook test"
git commit -m "test(policies): add usePoliciesData hook test"
git commit -m "test(roles): add useRolesData hook test"
```

---

## P5: Invitation Flow

### Task 5.1: 后端 Invitation entity + mapper + repository

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/entity/Invitation.java`
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/mapper/InvitationMapper.java`
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/repository/InvitationRepository.java`

- [ ] **Step 1: entity**

```java
@Entity
@Table(name = "invitations")
public class Invitation {
    @Id
    private String id;

    @Column(name = "organization_id", nullable = false)
    private String organizationId;

    @Column(nullable = false)
    private String email;

    @Column(name = "role_id")
    private String roleId;

    @Column(name = "team_ids")
    private String teamIds; // JSON array

    @Column(nullable = false, unique = true)
    private String token;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(nullable = false)
    private String status;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
}
```

- [ ] **Step 2: mapper interface + xml**

```java
public interface InvitationMapper {
    int insert(Invitation inv);
    Invitation findById(String id);
    Invitation findByToken(String token);
    List<Invitation> listByOrganization(String organizationId);
    int updateStatus(String id, String status);
}
```

XML 在 `src/main/resources/mapper/InvitationMapper.xml` 提供 SQL。

- [ ] **Step 3: repository**

```java
@Repository
public class InvitationRepository {
    private final InvitationMapper mapper;
    // 封装 findByToken / listByOrganization / updateStatus / insert
}
```

- [ ] **Step 4: 数据库 migration**

V0.0.x__create_invitations.sql:

```sql
CREATE TABLE invitations (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL,
  email VARCHAR(255) NOT NULL,
  role_id VARCHAR(64),
  team_ids JSON,
  token VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  status VARCHAR(32) NOT NULL,
  created_at TIMESTAMP NOT NULL,
  INDEX idx_invitations_org (organization_id),
  INDEX idx_invitations_email (email)
);
```

- [ ] **Step 5: 编译验证**

```bash
cd D:/workspace/agents-plus-server && mvn compile -q
```

Expected: BUILD SUCCESS

- [ ] **Step 6: Commit**

```bash
cd D:/workspace/agents-plus-server && git add . && git commit -m "feat(api): add Invitation entity, mapper, repository"
```

---

### Task 5.2: 后端 InvitationService

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/service/InvitationService.java`

- [ ] **Step 1: service 实现**

```java
@Service
public class InvitationService {
    private final InvitationRepository invitations;
    private final EmailSender emailSender;
    private final MembershipService memberships;
    // ...

    @Transactional
    public InvitationDto create(String organizationId, CreateInvitationRequest req) {
        String token = UUID.randomUUID().toString();
        Invitation inv = new Invitation();
        inv.setId(UUID.randomUUID().toString());
        inv.setOrganizationId(organizationId);
        inv.setEmail(req.email());
        inv.setRoleId(req.roleId());
        inv.setTeamIds(toJson(req.teamIds()));
        inv.setToken(token);
        inv.setExpiresAt(Instant.now().plus(72, ChronoUnit.HOURS));
        inv.setStatus("PENDING");
        inv.setCreatedAt(Instant.now());
        invitations.insert(inv);

        String link = "https://app/accept-invite?token=" + token;
        emailSender.send(req.email(),
            "Organization invitation",
            "Click to accept: " + link);

        return mapper.toDto(inv);
    }

    @Transactional
    public void revoke(String organizationId, String invitationId) {
        Invitation inv = invitations.findById(invitationId);
        if (!inv.getOrganizationId().equals(organizationId))
            throw new NotFoundException();
        invitations.updateStatus(invitationId, "REVOKED");
    }

    @Transactional
    public OrganizationDto accept(String token, String currentUserEmail) {
        Invitation inv = invitations.findByToken(token);
        if (inv == null) throw new NotFoundException("Invalid token");
        if (inv.getExpiresAt().isBefore(Instant.now()))
            throw new BadRequestException("Invitation expired");
        if (!inv.getEmail().equalsIgnoreCase(currentUserEmail))
            throw new ForbiddenException("Email mismatch");
        if (!"PENDING".equals(inv.getStatus()))
            throw new BadRequestException("Already processed");

        var membership = memberships.create(
            inv.getOrganizationId(), currentUserEmail
        );
        if (inv.getRoleId() != null) {
            roles.assign(membership.getId(), inv.getRoleId());
        }
        for (String teamId : fromJson(inv.getTeamIds())) {
            memberships.addTeamMember(teamId, membership.getId());
        }
        invitations.updateStatus(inv.getId(), "ACCEPTED");

        return organizationMapper.toDto(organizations.findById(inv.getOrganizationId()));
    }

    public List<InvitationDto> list(String organizationId) {
        return invitations.listByOrganization(organizationId).stream()
            .map(mapper::toDto).toList();
    }
}
```

- [ ] **Step 2: 编译**

```bash
cd D:/workspace/agents-plus-server && mvn compile -q
```

Expected: BUILD SUCCESS(可能需要根据实际 `EmailSender`、`MembershipService` 路径调整 import)

- [ ] **Step 3: Commit**

```bash
cd D:/workspace/agents-plus-server && git add . && git commit -m "feat(api): add InvitationService with create/list/revoke/accept"
```

---

### Task 5.3: 后端 InvitationController

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/controller/InvitationController.java`

- [ ] **Step 1: 实现 4 个端点**

```java
@RestController
public class InvitationController {
    private final InvitationService service;

    @PostMapping("/api/v1/organizations/{orgId}/invitations")
    @ResponseStatus(HttpStatus.CREATED)
    public InvitationDto create(
        @PathVariable String orgId,
        @Valid @RequestBody CreateInvitationRequest req
    ) {
        return service.create(orgId, req);
    }

    @GetMapping("/api/v1/organizations/{orgId}/invitations")
    public List<InvitationDto> list(@PathVariable String orgId) {
        return service.list(orgId);
    }

    @DeleteMapping("/api/v1/organizations/{orgId}/invitations/{id}")
    public ResponseEntity<Void> revoke(
        @PathVariable String orgId,
        @PathVariable String id
    ) {
        service.revoke(orgId, id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/api/v1/invitations/accept")
    public OrganizationDto accept(@Valid @RequestBody AcceptInvitationRequest req) {
        var email = SecurityContextHolder.getContext().getAuthentication().getName();
        return service.accept(req.token(), email);
    }
}
```

- [ ] **Step 2: 编译并启动验证**

```bash
cd D:/workspace/agents-plus-server && mvn spring-boot:run
```

期望:启动后 `/api/v1/organizations/test/invitations` 端点可访问(返回空数组或 401)。

- [ ] **Step 3: Commit**

```bash
cd D:/workspace/agents-plus-server && git add . && git commit -m "feat(api): add InvitationController with 4 endpoints"
```

---

### Task 5.4: 前端 api.ts 加 invitation 方法

**Files:**
- Modify: `src/features/memberships/api.ts`

- [ ] **Step 1: 加 4 个方法**

```ts
export const membershipsApi = {
  // ... 既有方法
  listInvitations: (orgId: string) =>
    request<Invitation[]>(
      `/api/v1/organizations/${encodeURIComponent(orgId)}/invitations`,
    ),
  createInvitation: (orgId: string, input: CreateInvitationRequest) =>
    request<Invitation>(
      `/api/v1/organizations/${encodeURIComponent(orgId)}/invitations`,
      { method: "POST", body: input },
    ),
  revokeInvitation: (orgId: string, id: string) =>
    request<void>(
      `/api/v1/organizations/${encodeURIComponent(orgId)}/invitations/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),
  acceptInvitation: (token: string) =>
    request<{ organizationId: string }>(
      "/api/v1/invitations/accept",
      { method: "POST", body: { token } },
    ),
};
```

- [ ] **Step 2: 验证编译**

```bash
cd D:/workspace/agents-plus && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/features/memberships/api.ts
git commit -m "feat(memberships): add invitation api methods"
```

---

### Task 5.5: InviteModal 组件

**Files:**
- Create: `src/features/memberships/components/invite-modal.tsx`

- [ ] **Step 1: 实现组件**

```tsx
"use client";

import { useState } from "react";
import { Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useWorkspaceStore } from "@/features/context/store";
import { membershipsApi } from "@/features/memberships/api";
import { useTeamsData } from "@/features/teams";

export function InviteModal({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const organizationId = useWorkspaceStore((s) => s.organizationId);
  const teams = useTeamsData();

  async function submit() {
    if (!organizationId || !email.trim()) return;
    setBusy(true);
    try {
      await membershipsApi.createInvitation(organizationId, {
        email: email.trim(),
        roleId: roleId || null,
        teamIds: selectedTeams,
      });
      toast.success(`邀请已发送至 ${email}`);
      setOpen(false);
      setEmail("");
      setRoleId("");
      setSelectedTeams([]);
    } catch (caught) {
      toast.error((caught as Error).message ?? "邀请失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="size-5" />
            邀请新成员
          </DialogTitle>
          <DialogDescription>
            邀请发出后,被邀请人会收到一封邮件。链接 72 小时内有效。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="invite-email">邮箱</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
            />
          </div>
          <div>
            <Label htmlFor="invite-role">角色(可选)</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger id="invite-role">
                <SelectValue placeholder="选择角色" />
              </SelectTrigger>
              <SelectContent>
                {/* 实际角色从 useRolesData().roles 取,这里省略 */}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>加入团队(可选)</Label>
            <div className="space-y-2">
              {teams.teams.map((team) => (
                <label key={team.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedTeams.includes(team.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedTeams([...selectedTeams, team.id]);
                      } else {
                        setSelectedTeams(
                          selectedTeams.filter((id) => id !== team.id),
                        );
                      }
                    }}
                  />
                  {team.name}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || !email.trim()}>
            <Send />
            发送邀请
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: 验证**

```bash
cd D:/workspace/agents-plus && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/features/memberships/components/invite-modal.tsx
git commit -m "feat(memberships): add InviteModal component"
```

---

### Task 5.6: PendingInvitations 列表组件

**Files:**
- Create: `src/features/memberships/components/pending-invitations.tsx`

- [ ] **Step 1: 实现**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Mail, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useWorkspaceStore } from "@/features/context/store";
import { membershipsApi } from "@/features/memberships/api";
import { formatTime } from "@/lib/format";
import type { Invitation } from "@/lib/contracts";

export function PendingInvitations() {
  const organizationId = useWorkspaceStore((s) => s.organizationId);
  const [items, setItems] = useState<Invitation[]>([]);

  useEffect(() => {
    if (!organizationId) return;
    membershipsApi
      .listInvitations(organizationId)
      .then(setItems)
      .catch(() => setItems([]));
  }, [organizationId]);

  async function revoke(id: string) {
    if (!organizationId) return;
    try {
      await membershipsApi.revokeInvitation(organizationId, id);
      setItems((cur) =>
        cur.map((i) => (i.id === id ? { ...i, status: "REVOKED" } : i)),
      );
      toast.success("已撤销邀请");
    } catch (caught) {
      toast.error((caught as Error).message ?? "撤销失败");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="size-5" />
          待处理邀请
        </CardTitle>
        <CardDescription>已发送但尚未被接受的邀请。</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无邀请</p>
        ) : (
          <ul className="space-y-2">
            {items.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatTime(inv.createdAt)} 发送
                    · 过期 {formatTime(inv.expiresAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={inv.status === "PENDING" ? "default" : "outline"}>
                    {inv.status}
                  </Badge>
                  {inv.status === "PENDING" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => revoke(inv.id)}
                    >
                      <Trash2 />
                      撤销
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: 验证**

```bash
cd D:/workspace/agents-plus && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/features/memberships/components/pending-invitations.tsx
git commit -m "feat(memberships): add PendingInvitations list component"
```

---

### Task 5.7: accept-invite 页面完整实现

**Files:**
- Modify: `src/app/(public)/accept-invite/page.tsx`

- [ ] **Step 1: 完整实现**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Mail } from "lucide-react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { membershipsApi } from "@/features/memberships/api";

export default function AcceptInvitePage() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const [orgId, setOrgId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("邀请链接无效");
      return;
    }
    setStatus("loading");
    membershipsApi
      .acceptInvitation(token)
      .then((res) => {
        setStatus("success");
        setOrgId(res.organizationId);
        toast.success("已加入组织");
      })
      .catch((caught: Error) => {
        setStatus("error");
        setErrorMsg(caught.message || "接受邀请失败");
      });
  }, [token]);

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="size-5" />
          接受组织邀请
        </CardTitle>
        <CardDescription>
          {status === "loading" && "正在校验邀请..."}
          {status === "idle" && "准备中..."}
          {status === "success" && "已成功加入组织"}
          {status === "error" && "邀请处理失败"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {status === "success" && orgId && (
          <Button
            className="w-full"
            onClick={() => router.push("/organization")}
          >
            <Building2 />
            进入组织
          </Button>
        )}
        {status === "error" && (
          <p className="text-sm text-destructive">{errorMsg}</p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: 验证**

```bash
cd D:/workspace/agents-plus && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/'(public)'/accept-invite/page.tsx
git commit -m "feat(auth): full accept-invite page implementation"
```

---

### Task 5.8: memberships page 接入邀请流程

**Files:**
- Modify: `src/app/(app)/organization/memberships/page.tsx`
- Modify: `src/features/memberships/components/organization-members.tsx`

- [ ] **Step 1: 在 page 顶部加邀请入口**

```tsx
"use client";

import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { OrganizationMembers } from "@/features/memberships/components/organization-members";
import { TeamMembers } from "@/features/memberships/components/team-members";
import { PendingInvitations } from "@/features/memberships/components/pending-invitations";
import { InviteModal } from "@/features/memberships/components/invite-modal";
import { useMembershipsData } from "@/features/memberships";

export default function MembershipsPage() {
  const data = useMembershipsData();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="组织"
        title="成员"
        description="通过邀请添加组织成员,或维护现有成员状态。"
        actions={
          <InviteModal>
            <Button>
              <Mail />
              邀请成员
            </Button>
          </InviteModal>
        }
      />
      <PendingInvitations />
      <OrganizationMembers data={data} />
      <TeamMembers data={data} />
    </div>
  );
}
```

(注意:`PageHeader` 需要支持 `actions` prop,如果还没有则加上)

- [ ] **Step 2: organization-members.tsx 移除 "添加成员" 表单,改为提示**

把"按 userId 直接添加"的 Input + 按钮改为:

```tsx
<Alert>
  <AlertCircle />
  <AlertTitle>添加成员请使用邀请</AlertTitle>
  <AlertDescription>
    点击右上角「邀请成员」按钮,通过邮件发送邀请链接。
  </AlertDescription>
</Alert>
```

- [ ] **Step 3: 验证**

```bash
cd D:/workspace/agents-plus && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/features/memberships/ src/app/'(app)'/organization/memberships/page.tsx
git commit -m "feat(memberships): integrate invitation flow, remove userId direct add"
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Implemented in |
|---|---|
| §2.1 双上下文 | T1.1-T1.5 |
| §2.2 术语 | 全部 task |
| §3.1 路由 | T1.5-T1.7, T2.9 |
| §3.2 feature 模块目录 | T2.5-T2.8 |
| §3.3 侧边栏 | T1.3, T1.4 |
| §4 数据流 | T1.1-T1.4, T2.5-T2.8 |
| §5 错误处理(sonner) | T3.5 |
| §6.1 新增后端端点 | T3.1-T3.3, T5.3 |
| §6.2 已有端点 UI 挂载 | T3.10 |
| §7 DTO 重命名 | T2.1, T2.2, T2.3 |
| §8 邀请流程 | T5.1-T5.8 |
| §9 实施阶段 | 全部 |
| §10 UX bug 修复 | T3.6, T3.7, T3.8, T3.9, T5.8, T2.6(form 已迁移)+ delete/rename(T3.4) |
| §11 测试 | T4.1-T4.5 |
| §12 文档更新 | 留到 implementation 之后单独做 |

**Type consistency:**
- DTO 名(`Membership`/`TeamMembership`/`Role`/`PolicyReviewRequest`/`PolicyDraft`)在各 task 一致 ✓
- Hook 名(`useTeamsData`/`useMembershipsData`/`usePoliciesData`/`useRolesData`)一致 ✓
- API 方法名(`listMyOrganizations`/`listInvitations`/`createInvitation`/`acceptInvitation`)一致 ✓

**Placeholder scan:**
- T3.7 提到 "数据库 migration 加列" — 具体 migration 文件名留给实施时根据 Flyway 版本号确定 ✓
- T4.2 测试代码注释了 "实际写时按 hook 实际暴露的 selector 实现" — 这是提醒,实际写时按 hook 实际暴露的 selector 实现 ✓
- T5.2 service 中的 `mapper.toDto(inv)`、`memberships.create(...)`、`roles.assign(...)` 等是泛指,实际写时按现有 service 命名调整 ✓

---

## Total Estimate

- **P1**: 7 tasks × ~30min = 3-4 hrs(实际 1 天)
- **P2**: 11 tasks × ~1.5hrs = ~16 hrs(实际 3 天)
- **P3**: 10 tasks × ~1hr = ~10 hrs(实际 3 天)
- **P4**: 5 tasks × ~30min = ~3 hrs(实际 1 天)
- **P5**: 8 tasks × ~1hr = ~8 hrs(实际 2 天)
- **总计**: ~10 工作日

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-06-organization-restructuring.md`.

两个执行选项:

**1. Subagent-Driven (recommended)** — 我为每个 task 派发新的子 agent,task 间 review,快速迭代

**2. Inline Execution** — 在当前会话用 executing-plans 批量执行,带 checkpoint 暂停点供 review

选哪个?
