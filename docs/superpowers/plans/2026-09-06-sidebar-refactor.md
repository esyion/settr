# 主应用侧边栏重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `src/features/app/components/app-sidebar.tsx` 重构为「顶 WorkspaceSwitcher / 中 NavMain / 底 UserMenu」三段式结构,完全对齐 `src/app/dashboard/page.tsx` demo 的视觉与组织模式;同时清理未被生产路由引用的 demo 文件。

**Architecture:** 三个新组件各管一段,AppSidebar 变为纯组合层。数据流向下:由 `(app)/layout.tsx` 把 `controller.state.{user, identity, busy}` 通过 props 注入;WorkspaceSwitcher / NavMain(激活态) 自行读取既有 Context(WorkspaceContext / Next pathname)。无新增 Context、无新增 hook。

**Tech Stack:** React 19 + Next.js 15 + shadcn/ui sidebar primitive(`@/components/ui/sidebar`) + Vitest + @testing-library/react。

---

## File Structure

**新建(`src/features/app/components/`):**
- `nav-main.tsx` — 中部导航组渲染器
- `user-menu.tsx` — 底部用户菜单(含设备信息)
- `workspace-switcher.tsx` — 顶部品牌 + scope 切换
- `nav-main.test.tsx`、`user-menu.test.tsx`、`workspace-switcher.test.tsx`、`app-sidebar.test.tsx` — 四个组件的 RTL 测试,均与组件同级

**修改:**
- `src/features/app/components/app-sidebar.tsx` — 重写为组合层
- `src/app/(app)/layout.tsx` — 给 AppSidebar 多传 `user / onLogout / busy` 三个 prop

**删除(均未被生产路由引用):**
- `src/app/dashboard/page.tsx`
- `src/components/app-sidebar.tsx`
- `src/components/nav-main.tsx`
- `src/components/nav-projects.tsx`
- `src/components/nav-user.tsx`
- `src/components/team-switcher.tsx`

**不动:**
- `src/components/ui/sidebar.tsx`
- `src/features/context/*`(WorkspaceSwitcher 仍从 `useWorkspaceContextValue()` 取状态)

---

## Task 1: 新建 NavMain 组件(导航组渲染器)

**Files:**
- Create: `src/features/app/components/nav-main.tsx`
- Create: `src/features/app/components/nav-main.test.tsx`

- [ ] **Step 1: 写失败测试**

在 `src/features/app/components/nav-main.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Cloud, Users } from "lucide-react";
import { NavMain, type NavMainGroup } from "@/features/app/components/nav-main";

describe("NavMain", () => {
  const groups: NavMainGroup[] = [
    {
      label: "工作区",
      items: [
        { href: "/overview", label: "概览", icon: Cloud },
        { href: "/devices", label: "设备", icon: Users },
      ],
    },
    {
      label: "组织",
      items: [
        { href: "/organization", label: "加入或创建组织", icon: Cloud },
      ],
    },
  ];

  it("renders every group label and item label", () => {
    render(<NavMain groups={groups} pathname="/" />);
    expect(screen.getByText("工作区")).toBeInTheDocument();
    expect(screen.getByText("组织")).toBeInTheDocument();
    expect(screen.getByText("概览")).toBeInTheDocument();
    expect(screen.getByText("设备")).toBeInTheDocument();
    expect(screen.getByText("加入或创建组织")).toBeInTheDocument();
  });

  it("marks the item whose href matches the current pathname as active", () => {
    render(<NavMain groups={groups} pathname="/devices" />);
    const devicesButton = screen.getByText("设备").closest("button, a");
    expect(devicesButton).toHaveAttribute("data-active", "true");
    const overviewButton = screen.getByText("概览").closest("button, a");
    expect(overviewButton).toHaveAttribute("data-active", "false");
  });

  it("marks an item active when pathname starts with the item href", () => {
    render(<NavMain groups={groups} pathname="/organization/teams" />);
    const orgButton = screen.getByText("加入或创建组织").closest("button, a");
    expect(orgButton).toHaveAttribute("data-active", "true");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd D:/workspace/agents-plus && pnpm test -- src/features/app/components/nav-main.test.tsx`
Expected: FAIL with "Cannot find module '@/features/app/components/nav-main'" 或 "NavMain is not a function"。

- [ ] **Step 3: 实现 NavMain**

创建 `src/features/app/components/nav-main.tsx`:

```tsx
"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

/** 一个导航组:label + items。 */
export type NavMainGroup = {
  label: string;
  items: Array<{ href: string; label: string; icon: LucideIcon }>;
};

/** AppSidebar 的中部导航渲染器:支持多组,激活态由 pathname 推导。 */
export function NavMain({
  groups,
  pathname,
}: {
  groups: NavMainGroup[];
  pathname: string;
}) {
  return (
    <>
      {groups.map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                    >
                      <Link href={item.href}>
                        <Icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd D:/workspace/agents-plus && pnpm test -- src/features/app/components/nav-main.test.tsx`
Expected: PASS,3 个用例全过。

- [ ] **Step 5: 提交**

```bash
cd D:/workspace/agents-plus
git add src/features/app/components/nav-main.tsx src/features/app/components/nav-main.test.tsx
git commit -m "feat(sidebar): extract NavMain component with tests"
```

---

## Task 2: 新建 UserMenu 组件(底部用户菜单)

**Files:**
- Create: `src/features/app/components/user-menu.tsx`
- Create: `src/features/app/components/user-menu.test.tsx`

- [ ] **Step 1: 写失败测试**

在 `src/features/app/components/user-menu.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserMenu } from "@/features/app/components/user-menu";
import type { DeviceIdentity } from "@/lib/contracts";

const identity: DeviceIdentity = {
  deviceId: "d1",
  deviceName: "QING",
  platform: "windows",
  appVersion: "0.1.0",
};

describe("UserMenu", () => {
  it("renders trigger with email and device name as subtitle", () => {
    render(
      <UserMenu
        user={{ email: "qingbo.my@gmail.com", name: null, avatar: null }}
        identity={identity}
        onLogout={vi.fn()}
        busy={false}
      />,
    );
    expect(screen.getByText("qingbo.my")).toBeInTheDocument();
    expect(screen.getByText("QING")).toBeInTheDocument();
  });

  it("falls back subtitle to '未识别设备' when identity is null", () => {
    render(
      <UserMenu
        user={{ email: "qingbo.my@gmail.com", name: null, avatar: null }}
        identity={null}
        onLogout={vi.fn()}
        busy={false}
      />,
    );
    expect(screen.getByText("未识别设备")).toBeInTheDocument();
  });

  it("uses user.name when provided, otherwise email local part", () => {
    render(
      <UserMenu
        user={{ email: "qingbo.my@gmail.com", name: "Qingbo", avatar: null }}
        identity={identity}
        onLogout={vi.fn()}
        busy={false}
      />,
    );
    expect(screen.getByText("Qingbo")).toBeInTheDocument();
  });

  it("renders device info as disabled entry with 'platform · vX.X.X' format", async () => {
    const user = userEvent.setup();
    render(
      <UserMenu
        user={{ email: "qingbo.my@gmail.com", name: null, avatar: null }}
        identity={identity}
        onLogout={vi.fn()}
        busy={false}
      />,
    );
    await user.click(screen.getByText("qingbo.my"));
    const deviceEntry = screen.getByText("windows · v0.1.0");
    expect(deviceEntry).toBeInTheDocument();
    const item = deviceEntry.closest('[role="menuitem"], [aria-disabled]');
    expect(item).toHaveAttribute("aria-disabled", "true");
  });

  it("calls onLogout when logout button clicked", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    render(
      <UserMenu
        user={{ email: "qingbo.my@gmail.com", name: null, avatar: null }}
        identity={identity}
        onLogout={onLogout}
        busy={false}
      />,
    );
    await user.click(screen.getByText("qingbo.my"));
    await user.click(screen.getByText("退出登录"));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("disables logout button when busy is true", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    render(
      <UserMenu
        user={{ email: "qingbo.my@gmail.com", name: null, avatar: null }}
        identity={identity}
        onLogout={onLogout}
        busy={true}
      />,
    );
    await user.click(screen.getByText("qingbo.my"));
    expect(screen.getByText("退出登录").closest("button")).toBeDisabled();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd D:/workspace/agents-plus && pnpm test -- src/features/app/components/user-menu.test.tsx`
Expected: FAIL with "Cannot find module '@/features/app/components/user-menu'"。

- [ ] **Step 3: 实现 UserMenu**

创建 `src/features/app/components/user-menu.tsx`:

```tsx
"use client";

import { ChevronsUpDown, Laptop, LogOut } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { DeviceIdentity } from "@/lib/contracts";

/** UserMenu 的用户数据形状:与 controller.state.user 解耦,只取展示需要的字段。 */
export type UserMenuUser = {
  name?: string | null;
  email: string;
  avatar?: string | null;
};

/** AppSidebar 的底部用户菜单:对齐 shadcn NavUser,菜单项精简为「用户信息 + 设备信息 + 退出」。 */
export function UserMenu({
  user,
  identity,
  onLogout,
  busy,
}: {
  user: UserMenuUser | null;
  identity: DeviceIdentity | null;
  onLogout: () => void;
  busy: boolean;
}) {
  const { isMobile } = useSidebar();
  const displayName = user?.name || user?.email.split("@")[0] || "";
  const deviceSubtitle = identity?.deviceName || "未识别设备";
  const email = user?.email ?? "";
  const fallbackLetter = email.charAt(0).toUpperCase() || "?";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                {user?.avatar ? (
                  <AvatarImage src={user.avatar} alt={displayName} />
                ) : null}
                <AvatarFallback className="rounded-lg">
                  {fallbackLetter}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{displayName}</span>
                <span className="truncate text-xs">{deviceSubtitle}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  {user?.avatar ? (
                    <AvatarImage src={user.avatar} alt={displayName} />
                  ) : null}
                  <AvatarFallback className="rounded-lg">
                    {fallbackLetter}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{displayName}</span>
                  <span className="truncate text-xs">{email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              aria-disabled
              onSelect={(event) => event.preventDefault()}
              className="cursor-default focus:bg-transparent"
            >
              <Laptop />
              <span>当前设备</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {identity?.platform ?? "—"} · v{identity?.appVersion ?? "—"}
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onLogout} disabled={busy}>
              <LogOut />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd D:/workspace/agents-plus && pnpm test -- src/features/app/components/user-menu.test.tsx`
Expected: PASS,6 个用例全过。

- [ ] **Step 5: 提交**

```bash
cd D:/workspace/agents-plus
git add src/features/app/components/user-menu.tsx src/features/app/components/user-menu.test.tsx
git commit -m "feat(sidebar): extract UserMenu component with tests"
```

---

## Task 3: 新建 WorkspaceSwitcher 组件(顶部品牌 + scope 切换)

**Files:**
- Create: `src/features/app/components/workspace-switcher.tsx`
- Create: `src/features/app/components/workspace-switcher.test.tsx`

- [ ] **Step 1: 写失败测试**

在 `src/features/app/components/workspace-switcher.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkspaceSwitcher } from "@/features/app/components/workspace-switcher";
import { WorkspaceContext } from "@/features/context/workspace-context";
import type { WorkspaceContextApi } from "@/features/context/hooks/use-workspace-context";
import type { Organization } from "@/lib/contracts";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (...args: unknown[]) => toastSuccess(...args) },
}));

const organizations: Organization[] = [
  { id: "org-1", name: "Acme Inc", ownerUserId: "u-1" },
  { id: "org-2", name: "Evil Corp", ownerUserId: "u-1" },
];

function renderWithContext(
  ctx: Partial<WorkspaceContextApi>,
  ui: React.ReactNode,
) {
  const fullCtx: WorkspaceContextApi = {
    scope: ctx.scope ?? "personal",
    organizationId: ctx.organizationId ?? null,
    organizationName: ctx.organizationName ?? null,
    organizations: ctx.organizations ?? [],
    loading: ctx.loading ?? false,
    error: ctx.error ?? null,
    setOrganization: ctx.setOrganization ?? vi.fn(),
    clearOrganization: ctx.clearOrganization ?? vi.fn(),
    refresh: ctx.refresh ?? vi.fn(),
  };
  return render(
    <WorkspaceContext.Provider value={fullCtx}>{ui}</WorkspaceContext.Provider>,
  );
}

describe("WorkspaceSwitcher", () => {
  beforeEach(() => {
    push.mockClear();
    toastSuccess.mockClear();
  });

  it("shows '个人空间' when scope is personal", () => {
    renderWithContext({ scope: "personal" }, <WorkspaceSwitcher />);
    expect(screen.getByText("个人空间")).toBeInTheDocument();
  });

  it("shows the organization name when scope is organization", () => {
    renderWithContext(
      { scope: "organization", organizationId: "org-1", organizationName: "Acme Inc" },
      <WorkspaceSwitcher />,
    );
    expect(screen.getByText("Acme Inc")).toBeInTheDocument();
  });

  it("clicking an org item calls setOrganization and toasts", async () => {
    const user = userEvent.setup();
    const setOrganization = vi.fn();
    renderWithContext(
      { scope: "personal", organizations, setOrganization },
      <WorkspaceSwitcher />,
    );
    await user.click(screen.getByText("个人空间"));
    await user.click(screen.getByText("Acme Inc"));
    expect(setOrganization).toHaveBeenCalledWith("org-1");
    expect(toastSuccess).toHaveBeenCalledWith("已切换到 Acme Inc");
  });

  it("clicking '个人空间' calls clearOrganization", async () => {
    const user = userEvent.setup();
    const clearOrganization = vi.fn();
    renderWithContext(
      { scope: "organization", organizationId: "org-1", organizationName: "Acme Inc", clearOrganization },
      <WorkspaceSwitcher />,
    );
    await user.click(screen.getByText("Acme Inc"));
    await user.click(screen.getByText("个人空间"));
    expect(clearOrganization).toHaveBeenCalledTimes(1);
  });

  it("clicking '进入组织管理' navigates to /organization", async () => {
    const user = userEvent.setup();
    renderWithContext({ scope: "personal" }, <WorkspaceSwitcher />);
    await user.click(screen.getByText("个人空间"));
    await user.click(screen.getByText("进入组织管理"));
    expect(push).toHaveBeenCalledWith("/organization");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd D:/workspace/agents-plus && pnpm test -- src/features/app/components/workspace-switcher.test.tsx`
Expected: FAIL with "Cannot find module '@/features/app/components/workspace-switcher'"。

- [ ] **Step 3: 实现 WorkspaceSwitcher**

创建 `src/features/app/components/workspace-switcher.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { Building2, ChevronsUpDown, Cloud, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useWorkspaceContextValue } from "@/features/context/workspace-context";
import { toast } from "sonner";

/** AppSidebar 顶部的品牌 + scope 切换控件:对齐 shadcn TeamSwitcher。 */
export function WorkspaceSwitcher() {
  const ctx = useWorkspaceContextValue();
  const router = useRouter();
  const { isMobile } = useSidebar();

  const isOrg = ctx.scope === "organization";
  const title = isOrg
    ? ctx.organizationName || "选择组织"
    : "个人空间";
  const subtitle = isOrg ? "团队空间" : "桌面 · 已同步";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              disabled={ctx.loading}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Cloud className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-medium">{title}</span>
                <span className="truncate text-xs">{subtitle}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              切换工作区
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => {
                ctx.clearOrganization();
                toast.success("已切换到个人空间");
              }}
              className="flex items-center gap-2"
            >
              <User className="size-4" />
              <span>个人空间</span>
              {!isOrg && (
                <span className="ml-auto text-xs text-muted-foreground">
                  当前
                </span>
              )}
            </DropdownMenuItem>
            {ctx.organizations.length > 0 ? (
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
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => router.push("/organization")}
              className="flex items-center gap-2"
            >
              <Building2 className="size-4" />
              进入组织管理
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd D:/workspace/agents-plus && pnpm test -- src/features/app/components/workspace-switcher.test.tsx`
Expected: PASS,5 个用例全过。

- [ ] **Step 5: 提交**

```bash
cd D:/workspace/agents-plus
git add src/features/app/components/workspace-switcher.tsx src/features/app/components/workspace-switcher.test.tsx
git commit -m "feat(sidebar): extract WorkspaceSwitcher component with tests"
```

---

## Task 4: 重写 AppSidebar 为组合层

**Files:**
- Modify: `src/features/app/components/app-sidebar.tsx`(完全重写)
- Create: `src/features/app/components/app-sidebar.test.tsx`

- [ ] **Step 1: 写失败测试**

在 `src/features/app/components/app-sidebar.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppSidebar } from "@/features/app/components/app-sidebar";
import { WorkspaceContext } from "@/features/context/workspace-context";
import type { WorkspaceContextApi } from "@/features/context/hooks/use-workspace-context";
import type { DeviceIdentity } from "@/lib/contracts";

vi.mock("@/features/app/components/workspace-switcher", () => ({
  WorkspaceSwitcher: () => <div data-testid="workspace-switcher" />,
}));
vi.mock("@/features/app/components/user-menu", () => ({
  UserMenu: () => <div data-testid="user-menu" />,
}));

const identity: DeviceIdentity = {
  deviceId: "d1",
  deviceName: "QING",
  platform: "windows",
  appVersion: "0.1.0",
};

function renderWithContext(ctx: Partial<WorkspaceContextApi>) {
  const fullCtx: WorkspaceContextApi = {
    scope: ctx.scope ?? "personal",
    organizationId: ctx.organizationId ?? null,
    organizationName: ctx.organizationName ?? null,
    organizations: ctx.organizations ?? [],
    loading: ctx.loading ?? false,
    error: ctx.error ?? null,
    setOrganization: ctx.setOrganization ?? vi.fn(),
    clearOrganization: ctx.clearOrganization ?? vi.fn(),
    refresh: ctx.refresh ?? vi.fn(),
  };
  return render(
    <WorkspaceContext.Provider value={fullCtx}>
      <AppSidebar
        identity={identity}
        format="standard"
        user={{ email: "qingbo.my@gmail.com", name: null, avatar: null }}
        onLogout={vi.fn()}
        busy={false}
      />
    </WorkspaceContext.Provider>,
  );
}

describe("AppSidebar", () => {
  it("renders WorkspaceSwitcher, NavMain and UserMenu when scope is personal", () => {
    renderWithContext({ scope: "personal" });
    expect(screen.getByTestId("workspace-switcher")).toBeInTheDocument();
    expect(screen.getByTestId("user-menu")).toBeInTheDocument();
    // 工作区 + 组织 两个 group label 都应可见
    expect(screen.getByText("工作区")).toBeInTheDocument();
    expect(screen.getByText("组织")).toBeInTheDocument();
  });

  it("renders only 组织空间 group when scope is organization", () => {
    renderWithContext({
      scope: "organization",
      organizationId: "org-1",
      organizationName: "Acme Inc",
    });
    expect(screen.getByText("组织空间")).toBeInTheDocument();
    expect(screen.queryByText("工作区")).not.toBeInTheDocument();
    expect(screen.queryByText("组织")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd D:/workspace/agents-plus && pnpm test -- src/features/app/components/app-sidebar.test.tsx`
Expected: FAIL — 当前 `app-sidebar.tsx` 没有 `user / onLogout / busy` props,TS 编译会失败或运行时行为对不上。

- [ ] **Step 3: 重写 AppSidebar**

完全替换 `src/features/app/components/app-sidebar.tsx`:

```tsx
"use client";

import { usePathname } from "next/navigation";
import {
  Building2,
  Cloud,
  FileClock,
  FolderTree,
  ScrollText,
  Settings as SettingsIcon,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { NavMain, type NavMainGroup } from "@/features/app/components/nav-main";
import { UserMenu, type UserMenuUser } from "@/features/app/components/user-menu";
import { WorkspaceSwitcher } from "@/features/app/components/workspace-switcher";
import { useWorkspaceContextValue } from "@/features/context/workspace-context";
import { getDocumentFormatConfig } from "@/lib/document-formats";
import type { DeviceIdentity, DocumentFormat } from "@/lib/contracts";

/** 个人空间下的导航组:工作区(概览/版本/设备/设置)+ 组织(加入或创建)。 */
const PERSONAL_GROUPS: NavMainGroup[] = [
  {
    label: "工作区",
    items: [
      { href: "/overview", label: "概览", icon: Cloud },
      { href: "/versions", label: "版本历史", icon: FileClock },
      { href: "/devices", label: "设备", icon: Users },
      { href: "/settings", label: "设置", icon: SettingsIcon },
    ],
  },
  {
    label: "组织",
    items: [{ href: "/organization", label: "加入或创建组织", icon: Building2 }],
  },
];

/** 组织空间下的导航组:组织概览 / 团队与项目 / 成员 / 规范 / 角色。 */
const ORGANIZATION_GROUPS: NavMainGroup[] = [
  {
    label: "组织空间",
    items: [
      { href: "/organization", label: "组织概览", icon: Building2 },
      { href: "/organization/teams", label: "团队与项目", icon: FolderTree },
      { href: "/organization/memberships", label: "成员", icon: UserPlus },
      { href: "/organization/policies", label: "规范", icon: ScrollText },
      { href: "/organization/roles", label: "角色", icon: ShieldCheck },
    ],
  },
];

/**
 * 主应用侧边栏的组合层:Header = WorkspaceSwitcher,Content = NavMain,Footer = UserMenu。
 * 全部数据由 props 注入,自身只读 usePathname 和 useWorkspaceContextValue 用于路由高亮和分组切换。
 */
export function AppSidebar({
  identity,
  format,
  user,
  onLogout,
  busy,
}: {
  identity: DeviceIdentity | null;
  format: DocumentFormat;
  user: UserMenuUser | null;
  onLogout: () => void;
  busy: boolean;
}) {
  const pathname = usePathname();
  const ctx = useWorkspaceContextValue();
  // format 暂时未直接消费,但保留 prop 以避免 layout 端重复改签名
  void getDocumentFormatConfig(format);
  const isOrg = ctx.scope === "organization";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <WorkspaceSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMain
          groups={isOrg ? ORGANIZATION_GROUPS : PERSONAL_GROUPS}
          pathname={pathname}
        />
      </SidebarContent>
      <SidebarFooter>
        <UserMenu
          user={user}
          identity={identity}
          onLogout={onLogout}
          busy={busy}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd D:/workspace/agents-plus && pnpm test -- src/features/app/components/app-sidebar.test.tsx`
Expected: PASS,2 个用例全过。

- [ ] **Step 5: 提交**

```bash
cd D:/workspace/agents-plus
git add src/features/app/components/app-sidebar.tsx src/features/app/components/app-sidebar.test.tsx
git commit -m "refactor(sidebar): rewrite AppSidebar as composition layer"
```

---

## Task 5: 更新 (app)/layout.tsx 传递新 props

**Files:**
- Modify: `src/app/(app)/layout.tsx`(仅修改 `<AppSidebar>` 调用行)

- [ ] **Step 1: 定位当前 AppSidebar 调用行**

打开 `src/app/(app)/layout.tsx`,找到这段(在 `AppLayoutShell` 内):

```tsx
<AppSidebar
  identity={controller.state.identity}
  format={controller.state.format}
/>
```

- [ ] **Step 2: 改为传 user / onLogout / busy**

替换为:

```tsx
<AppSidebar
  identity={controller.state.identity}
  format={controller.state.format}
  user={controller.state.user}
  onLogout={() => void controller.logout()}
  busy={controller.busy === "logout"}
/>
```

- [ ] **Step 3: 跑 TS 类型检查 + 现有测试**

Run: `cd D:/workspace/agents-plus && pnpm tsc --noEmit && pnpm test`
Expected: TS 无报错,所有测试通过(包括上一步新加的 4 个测试文件)。

- [ ] **Step 4: 提交**

```bash
cd D:/workspace/agents-plus
git add src/app/(app)/layout.tsx
git commit -m "feat(sidebar): pass user / onLogout / busy from layout"
```

---

## Task 6: 删除 demo 路由与未引用演示组件

**Files:**
- Delete: `src/app/dashboard/page.tsx`
- Delete: `src/components/app-sidebar.tsx`
- Delete: `src/components/nav-main.tsx`
- Delete: `src/components/nav-projects.tsx`
- Delete: `src/components/nav-user.tsx`
- Delete: `src/components/team-switcher.tsx`

- [ ] **Step 1: 二次 grep 确认零外部引用**

Run:
```bash
cd D:/workspace/agents-plus && grep -rE "from\s+[\"']@/components/(app-sidebar|nav-main|nav-projects|nav-user|team-switcher)[\"']" src/ || echo "NO_REFS"
```
Expected: `NO_REFS`(没有匹配)。

- [ ] **Step 2: 删除 6 个文件**

```bash
cd D:/workspace/agents-plus
rm src/app/dashboard/page.tsx
rm src/components/app-sidebar.tsx
rm src/components/nav-main.tsx
rm src/components/nav-projects.tsx
rm src/components/nav-user.tsx
rm src/components/team-switcher.tsx
```

- [ ] **Step 3: 跑完整检查 + 测试**

Run: `cd D:/workspace/agents-plus && pnpm tsc --noEmit && pnpm test`
Expected: TS 无报错,所有测试通过。

- [ ] **Step 4: 提交**

```bash
cd D:/workspace/agents-plus
git add -u src/app/dashboard src/components/app-sidebar.tsx src/components/nav-main.tsx src/components/nav-projects.tsx src/components/nav-user.tsx src/components/team-switcher.tsx
git commit -m "chore(sidebar): remove dashboard demo and unused shadcn demo components"
```

---

## Task 7: 全量验证(本地)

- [ ] **Step 1: 跑 lint**

Run: `cd D:/workspace/agents-plus && pnpm lint`
Expected: 无 error。

- [ ] **Step 2: 跑全量测试**

Run: `cd D:/workspace/agents-plus && pnpm test`
Expected: 全过,包含本次新增的 4 个测试文件(共 16 个用例)。

- [ ] **Step 3: TS 类型检查**

Run: `cd D:/workspace/agents-plus && pnpm tsc --noEmit`
Expected: 无错误。

- [ ] **Step 4: 启动桌面端冒烟测试**

Run: `cd D:/workspace/agents-plus && pnpm tauri dev`
然后在 Tauri 窗口里:
- 侧边栏顶 WorkspaceSwitcher 默认显示 "个人空间",点开 dropdown 能看到「个人空间」+「进入组织管理」
- 导航组的「设备」点进去,Sidebar 折叠按钮(Header 的 SidebarTrigger)可折叠,折叠态只剩 logo 方块和头像方块
- 底部 UserMenu 点开能看到当前设备条目文字为 `windows · v0.1.0`,退出登录按钮点击可触发 logout

如有视觉问题,在本任务下追加修复,作为同一 commit 提交。

- [ ] **Step 5: 提交任何冒烟测试中的修复(若有)**

```bash
cd D:/workspace/agents-plus
git add -A
git commit -m "fix(sidebar): smoke-test fixes" # 仅在有改动时执行
```

---

## Self-Review Checklist(执行前)

- [ ] Spec §3.1 WorkspaceSwitcher → Task 3
- [ ] Spec §3.2 NavMain → Task 1
- [ ] Spec §3.3 UserMenu → Task 2
- [ ] Spec §3.4 AppSidebar 重组 → Task 4
- [ ] Spec §2.2 `(app)/layout.tsx` 新增 props → Task 5
- [ ] Spec §2.3 删除 demo 文件 → Task 6
- [ ] Spec §5 测试覆盖(每个组件都至少一个行为测试)→ Task 1/2/3/4
- [ ] 无 placeholder:每个 code block 都是完整可粘贴代码
- [ ] 类型一致:`UserMenuUser` 在 Task 2 定义,Task 4 通过 `@/features/app/components/user-menu` re-import,命名一致
- [ ] 类型一致:`NavMainGroup` 在 Task 1 定义并 `export`,Task 4 复用,命名一致
