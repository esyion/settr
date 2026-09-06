# 主应用侧边栏重构设计 Spec

**日期**:2026-09-06
**状态**:待用户审阅
**目标读者**:本项目的开发者(含本人)

---

## 1. 背景与动机

### 1.1 当前状态

`src/features/app/components/app-sidebar.tsx`(188 行)把品牌、ContextSwitcher、个人/组织两套导航分组、底部设备信息卡**全部内联**在一个文件里。结构问题:

- 单一文件承担四个 UI 职责,后续改样式 / 加菜单项都要碰同一个地方
- 没有复用 `src/components/ui/sidebar.tsx` 的 SidebarGroup / SidebarMenu 等高级原语,只用了 SidebarHeader/Content/Footer/Rail
- 顶部 logo 与 ContextSwitcher 是两个独立控件,占两行垂直空间,折叠态处理割裂

仓库里其实已经有一套 shadcn 演示版组件(`src/components/{app-sidebar,nav-main,nav-projects,nav-user,team-switcher}.tsx`),只是被 `src/app/dashboard/page.tsx` 这个 demo 路由引用,从未在生产路由中使用。本次借机对齐这套结构。

### 1.2 重构目标

按 `src/app/dashboard/page.tsx` 演示的「顶 Switcher / 中 NavMain / 底 NavUser」三段式结构,重构 `src/features/app/components/app-sidebar.tsx`,同时:

- 把 ContextSwitcher 合并进顶部 Switcher(单控件、双信息)
- 把内联导航抽到独立的 `NavMain`
- 把底部设备信息卡合并进 NavUser 下拉菜单
- 同步清理掉 demo 路由与未被生产引用的演示组件

### 1.3 不在本次范围

- SidebarProvider / Sidebar 等底层 primitive 的视觉调整(只复用,不动)
- `src/app/(app)/layout.tsx` 顶部 header 的面包屑 / StatusBadge / Logout 按钮(已经在位,不动)
- 同步控制器 / Context 状态的字段新增(只读取现有数据)
- 任何路由结构调整

---

## 2. 文件改动清单

### 2.1 新建文件(3 个,全部在 `src/features/app/components/`)

| 文件 | 职责 | 依赖 |
|---|---|---|
| `workspace-switcher.tsx` | 顶部品牌 + scope 切换控件(对齐 shadcn TeamSwitcher) | `useWorkspaceContextValue`, `next/navigation`, shadcn dropdown / avatar |
| `nav-main.tsx` | 中部导航组渲染器,接受 `groups + pathname`,渲染 SidebarGroup / SidebarMenu | shadcn sidebar primitive |
| `user-menu.tsx` | 底部用户菜单,含 avatar + 用户信息 + 设备信息 + 退出登录(对齐 shadcn NavUser) | `DeviceIdentity`, shadcn dropdown / avatar |

### 2.2 修改文件(2 个)

| 文件 | 改动 |
|---|---|
| `src/features/app/components/app-sidebar.tsx` | 重写:Header 用 WorkspaceSwitcher,Content 用 NavMain(两个 group),Footer 用 UserMenu;删除内联逻辑 |
| `src/app/(app)/layout.tsx` | 给 AppSidebar 多传 `user / onLogout / busy` 三个 prop(供 UserMenu 用);顶部 header 的 email 文本保留不动,避免 scope 蔓延 |

### 2.3 删除文件(6 个,全部为 demo 路由 + 仅被 demo 引用的演示组件)

| 文件 | 删除原因 |
|---|---|
| `src/app/dashboard/page.tsx` | demo 路由,用户确认不需要保留 |
| `src/components/app-sidebar.tsx` | 仅被 dashboard demo 引用 |
| `src/components/nav-main.tsx` | 仅被 demo app-sidebar 引用 |
| `src/components/nav-projects.tsx` | 仅被 demo app-sidebar 引用 |
| `src/components/nav-user.tsx` | 仅被 demo app-sidebar 引用 |
| `src/components/team-switcher.tsx` | 仅被 demo app-sidebar 引用 |

已 grep 验证:`(app)/` 路由组下零引用,dashboard 是唯一外部引用。

### 2.4 保留不动

- `src/components/ui/sidebar.tsx`(底层 primitive)
- `src/features/context/{workspace-context,components/context-switcher.tsx}`(ContextSwitcher 保留作为 ContextSwitcher,本 spec 不直接复用,但它仍是 WorkspaceSwitcher 的状态来源)
- 其他 `src/features/*`、`src/app/**` 全部页面

---

## 3. 组件设计

### 3.1 WorkspaceSwitcher

**职责**:合并品牌 + scope 切换,提供和 shadcn TeamSwitcher 一致的交互。

**Props**:无(从 Context 直接读取)。

**Context 依赖**:`useWorkspaceContextValue()` 拿 `scope / organizations / organizationId / organizationName / setOrganization / clearOrganization / loading`。

**Trigger 形态**(`SidebarMenuButton size="lg"`):
- 左侧 8×8 圆角方块:`bg-primary` 背景,内嵌 `Cloud` 图标(`text-primary-foreground`)
- 主标题:`ctx.scope === "organization" ? (ctx.organizationName || "选择组织") : "个人空间"`
- 副标题:`ctx.scope === "organization" ? "团队空间" : "桌面 · 已同步"`(本期硬编码,后续接 sync state)
- 右侧 `ChevronsUpDown`
- 折叠态:整条隐藏,只剩 logo 方块(`group-data-[collapsible=icon]:hidden` 包文字部分)

**Dropdown 内容**(`align="start"` + `side={isMobile ? "bottom" : "right"}`):
1. `DropdownMenuLabel` "切换工作区"
2. 「个人空间」条目(`User` 图标 + 文本)→ `clearOrganization()` + `toast.success("已切换到个人空间")`,当前 scope 时右侧显示 "当前" 角标
3. 如果 `organizations.length > 0`:分隔线 + `DropdownMenuLabel text-xs text-muted-foreground` "我的组织" + 每个 org 一条(`Building2` 图标 + 名称)→ `setOrganization(id)` + toast;当前 org 右侧显示 "当前"
4. 分隔线 + 「进入组织管理」条目(`Building2`)→ `router.push("/organization")`

### 3.2 NavMain

**职责**:渲染中部导航分组,支持多个 group(工作区 / 组织 / 组织空间)。

**Props**:
```ts
{
  groups: Array<{
    label: string;
    items: Array<{ href: string; label: string; icon: LucideIcon }>;
  }>;
  pathname: string;
}
```

**实现要点**:
- 不复用 shadcn 演示版 `nav-main.tsx`(虽然名字相同,但它是 demo 组件,本次会被删除)
- 用 `SidebarGroup` + `SidebarGroupLabel` + `SidebarMenu` + `SidebarMenuItem` + `SidebarMenuButton(asChild, isActive, tooltip)`
- 每个 item:`isActive = pathname === href || pathname.startsWith(href + "/")`
- 链接用 `next/link` 的 `<Link href>`,不是 `<a>`
- 不使用 Collapsible / SidebarMenuSub(导航项不带子菜单)

**AppSidebar 调用的两种形态**:
- personal scope:`groups = [{ label: "工作区", items: 4 个 }, { label: "组织", items: [加入或创建组织] }]`
- organization scope:`groups = [{ label: "组织空间", items: 5 个 }]`

### 3.3 UserMenu

**职责**:底部用户菜单,触发器显示头像+邮箱,下拉含用户信息、设备信息、退出登录。

**Props**:
```ts
{
  user: { name?: string | null; email: string; avatar?: string | null } | null;
  identity: DeviceIdentity | null;
  onLogout: () => void;
  busy: boolean;
}
```

**Trigger 形态**(`SidebarMenuButton size="lg"` + DropdownMenu):
- 头像:`<Avatar>` 优先 `user.avatar`,否则 `AvatarFallback` 用 email 首字母
- 主标题:`user.name || user.email.split("@")[0]`
- 副标题:`identity?.deviceName || "未识别设备"`
- 右侧 `ChevronsUpDown`
- 折叠态:整条隐藏,只剩头像方块

**Dropdown 内容**(`min-w-56` + `side={isMobile ? "bottom" : "right"}`):
1. 用户信息 header:`DropdownMenuLabel p-0 font-normal` 包 avatar + name + email 两行
2. `DropdownMenuSeparator`
3. 设备信息条目:`DropdownMenuGroup` 内一个 `DropdownMenuItem` 用 `aria-disabled + cursor-default`,左侧 `Laptop` 图标 + "当前设备" 文本,右侧灰色文字 `${platform} · v${appVersion}`,不可点击
4. `DropdownMenuSeparator`
5. 退出登录条目:`LogOut` 图标 + "退出登录",`onClick={onLogout}`、`disabled={busy}`

### 3.4 AppSidebar 重组后形态

`AppSidebar` 改为完全受控:数据由 props 注入,内部不再直接访问 `controller`。`format` prop 保留是为了不破坏现有签名,本期未使用,但不删避免后续 PR 再动。

```tsx
type AppSidebarProps = {
  identity: DeviceIdentity | null;
  format: DocumentFormat;
  user: { name?: string | null; email: string; avatar?: string | null } | null;
  onLogout: () => void;
  busy: boolean;
};

const PERSONAL_GROUPS: NavMainGroup[] = [
  {
    label: "工作区",
    items: [
      { href: "/overview",  label: "概览",     icon: Cloud },
      { href: "/versions",  label: "版本历史", icon: FileClock },
      { href: "/devices",   label: "设备",     icon: Users },
      { href: "/settings",  label: "设置",     icon: SettingsIcon },
    ],
  },
  {
    label: "组织",
    items: [
      { href: "/organization", label: "加入或创建组织", icon: Building2 },
    ],
  },
];

const ORGANIZATION_GROUPS: NavMainGroup[] = [
  {
    label: "组织空间",
    items: [
      { href: "/organization",              label: "组织概览",   icon: Building2 },
      { href: "/organization/teams",        label: "团队与项目", icon: FolderTree },
      { href: "/organization/memberships",  label: "成员",       icon: UserPlus },
      { href: "/organization/policies",     label: "规范",       icon: ScrollText },
      { href: "/organization/roles",        label: "角色",       icon: ShieldCheck },
    ],
  },
];

export function AppSidebar(props: AppSidebarProps) {
  const pathname = usePathname();
  const ctx = useWorkspaceContextValue();
  const isOrg = ctx.scope === "organization";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <WorkspaceSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMain groups={isOrg ? ORGANIZATION_GROUPS : PERSONAL_GROUPS} pathname={pathname} />
      </SidebarContent>
      <SidebarFooter>
        <UserMenu
          user={props.user}
          identity={props.identity}
          onLogout={props.onLogout}
          busy={props.busy}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
```

`(app)/layout.tsx` 调用:
```tsx
<AppSidebar
  identity={controller.state.identity}
  format={controller.state.format}
  user={controller.state.user}
  onLogout={() => void controller.logout()}
  busy={controller.busy === "logout"}
/>
```

---

## 4. 数据流

```
SyncController (useSyncControllerInstance)
    └── controller.state.{user, identity, format, busy}
        │
        ▼
AppLayoutShell (in (app)/layout.tsx)
    │
    ▼ AppSidebar props
    ├── identity, format, user ──┐
    ├── onLogout ─────────────────┤
    ├── busy ─────────────────────┤
                                  │
    AppSidebar                    │
    ├── useWorkspaceContextValue()│  ← WorkspaceSwitcher / NavMain(groups)
    ├── usePathname()             │  ← NavMain(激活态)
    │
    ├── WorkspaceSwitcher          │ ← useWorkspaceContextValue() + router
    ├── NavMain(groups, pathname)  │
    └── UserMenu(user, identity,   │
                 onLogout, busy)   │
```

无新增 context / hook,纯 props 下行 + 既有 Context 读取。

---

## 5. 测试

为三个新组件各加一组 RTL 测试,放在 `src/features/app/components/__tests__/` 下:

| 组件 | 测试用例 |
|---|---|
| WorkspaceSwitcher | (a) 默认渲染 trigger 显示 "个人空间";(b) scope=organization 时显示 org 名;(c) 点 dropdown 中某 org 触发 setOrganization 并 toast;(d) 「进入组织管理」点击跳 `/organization` |
| NavMain | (a) 传两组 mock data 渲染两个 SidebarGroup + label;(b) pathname="/devices" 时「设备」按钮 `data-active=true`,「设置」为 false;(c) item 数量与 label 完全匹配 |
| UserMenu | (a) trigger 显示 user.email 副标题 = identity.deviceName;(b) dropdown 设备条目文本格式 `${platform} · v${appVersion}`;(c) busy=true 时退出按钮 disabled;(d) 点击退出调用 onLogout |

AppSidebar 本身加一个最小 mount 测试:`isOrg=false/true` 各一个用例,断言渲染了 WorkspaceSwitcher / NavMain / UserMenu 三个 child(用 `screen.getByRole` 或文本查询,不依赖具体 DOM 结构)。

mock 策略:
- `next/navigation` 的 `useRouter` → `vi.mock`
- `useWorkspaceContextValue` → `vi.mock` 返回固定 ctx 对象
- `sonner` toast → `vi.mock` 不实际调用

---

## 6. 风险与回滚

| 风险 | 缓解 |
|---|---|
| 删除 demo 文件后,任何未发现的引用导致构建失败 | 删除前再 grep 一次 `from.*["'].*(app-sidebar|nav-main|nav-user|nav-projects|team-switcher)["']` 全仓库范围 |
| 折叠态视觉与原版差异 | 折叠态仅显示 logo 方块 / 头像方块,通过 `group-data-[collapsible=icon]:hidden` 控制,行为与 TeamSwitcher 一致 |
| `(app)/layout.tsx` 顶部 header 的 email 与新 UserMenu 副标题重复 | 本 spec 暂保留顶部 header email,后续单独 PR 处理 |
| ContextSwitcher 成为 dead code | 暂保留 `src/features/context/components/context-switcher.tsx`(workspace context 的数据源是同一个,组件本身可能在别处复用);本期不动 |

回滚:本次改动只涉及删除 demo 文件 + 替换 AppSidebar 的三个 child。回滚即 revert commit。
