# Agents Plus 前端路由重构设计

**日期:** 2026-09-06
**范围:** `D:/workspace/agents-plus`(Tauri 桌面应用前端)
**状态:** 已批准,待进入实现规划阶段

---

## 1. 背景与目标

当前 `src/app/page.tsx` 只渲染 `<ClientApp />`,完全没有使用 Next.js App Router 的文件路径路由能力。所有 5 个功能模块(概览/版本/设备/组织/设置)都套在 `ClientApp` 内,通过 `useState<Page>` 切换,侧边栏是手写的 `<button>` 列表,与 shadcn/ui 现有 `Sidebar` 组件重复实现。

本次重构的目标:

1. **用上 Next.js 文件路径路由** — 5 个模块各自对应真实 URL。
2. **遵循 `AGENTS.md` §8.1** — "公共组件必须优先组合 shadcn/ui 组件,禁止在业务组件中重复实现已有 shadcn/ui 组件"。
3. **遵循 `AGENTS.md` §4.1** — "禁止把所有逻辑集中在 App.tsx"。把单一大 `ClientApp` 拆分为按页面分层的 hooks。

非目标(显式不做):

- 不实现 nested 详情页(如 `/versions/[id]`),留待后续 spec。
- 不替换 zustand 为其它状态库。
- 不引入 React Query、Tanstack Query。
- 不写 Playwright e2e(Tauri 桌面应用,手工验证即可)。

---

## 2. 约束

| 约束 | 来源 |
|---|---|
| 静态导出 `output: "export"`,禁止 SSR / Server Actions / Route Handlers | `next.config.mjs` + `AGENTS.md §4.1` |
| 必须使用 TypeScript 严格模式,禁止新增 `any` | `AGENTS.md §8` |
| 业务组件优先组合 shadcn/ui,样式走 Tailwind 语义令牌 | `AGENTS.md §8.1` |
| 单文件代码行数非必要不要超过 300 行 | `AGENTS.md §4.1` |
| Tauri IPC 是前后端唯一跨边界通信方式 | `AGENTS.md §1` |
| 所有 ID 字段统一为 `string`,禁止 `number`/`bigint` | `AGENTS.md §5` |
| 错误必须覆盖 loading / success / empty / error / retry 五类状态 | `AGENTS.md §6` |

---

## 3. 路由结构

```
src/app/
├─ layout.tsx                       # 根布局 <html>/<body>/Toaster(保留)
├─ globals.css                      # 保留
├─ page.tsx                         # 始终 router.replace("/overview")
└─ (app)/
│  ├─ layout.tsx                    # 鉴权门 + SidebarProvider + Header
│  ├─ overview/page.tsx             # /overview
│  ├─ versions/page.tsx             # /versions
│  ├─ devices/page.tsx              # /devices
│  ├─ organization/page.tsx         # /organization
│  └─ settings/page.tsx             # /settings
└─ (public)/
   └─ auth/page.tsx                 # /auth,渲染 <AuthScreen />
```

**关键规则:**

- `app/page.tsx` 用 `useEffect + router.replace("/overview")`,不用 `redirect()`(避免静态导出下 throw 闪屏)。
- `(app)/layout.tsx` 是鉴权门,根据 Zustand store 状态决定渲染哪个分支。
- `(public)/auth/page.tsx` 渲染 `AuthScreen`,已登录用户访问时被重定向到 `/overview`。
- 不再有 `ClientApp` 单文件。

---

## 4. 状态架构

### 4.1 Zustand store

新增 `src/features/sync/sync-store.ts`,字段定义:

```ts
type SyncState = {
  status: SyncStatus;            // loading | signedOut | synced | ...
  identity: DeviceIdentity | null;
  user: User | null;
  desktop: boolean;
  devices: Device[];
  busy: BusyAction | null;
  notice: string | null;
  mergeDraft: MergeDraft | null;
  format: DocumentFormat;
  hydrated: boolean;
};
```

`SyncStatus`、`BusyAction`、`Device`、`User`、`MergeDraft`、`DocumentFormat` 等类型继续从 `src/lib/contracts.ts` 引入,不重复定义。

### 4.2 拆分 hooks

| Hook | 文件 | 返回 |
|---|---|---|
| `useSyncStore` | `sync-store.ts` | Zustand selector hook |
| `useSyncActions` | `sync-actions.ts` | `{ loginCompleted, logout, refresh, selectFormat }` |
| `useOverviewActions` | `use-overview-actions.ts` | `{ upload, apply, startMerge, resolveMerge, setMergeDraft, busy, notice }` |
| `useVersionsActions` | `use-versions-actions.ts` | `{ restore, busy, notice }` |
| `useDevicesActions` | `use-devices-actions.ts` | `{ rename, revoke, busy, notice }` |
| `useSettingsActions` | `use-settings-actions.ts` | `{ rename, logout, busy, notice }` |

`busy` 与 `notice` 由 `sync-actions` 写入 store,各页面 hook 通过 `useSyncStore(s => s.busy)` 选择性订阅,避免不相关 re-render。

### 4.3 鉴权流程

```
AuthFormPanel.onAuthenticated()
  ↓
useSyncStore.getState().loginCompleted()
  ↓
zustand: status → 'synced',user 写入
  ↓
(public)/auth/page.tsx 订阅 status,变化时 router.replace('/overview')
  ↓
(app)/overview/page.tsx 渲染 Overview
```

### 4.4 hydration

删除 `useSyncExternalStore(() => () => undefined, () => true, () => false)` hack,改用 store 中的 `hydrated: boolean` 字段,在 `useEffect(() => setHasHydrated(true), [])` 中翻转。`(app)/layout.tsx` 在 `!hydrated` 时渲染 `<HydratingState />`。

---

## 5. 布局与侧边栏

### 5.1 `(app)/layout.tsx` 渲染决策表

| 状态 | 渲染 |
|---|---|
| `!hydrated` | `<HydratingState />` |
| `!desktop` | `<DesktopRequiredState />` |
| `status === 'signedOut'` | `router.replace('/auth')` |
| `status === 'loading'` | `<LoadingState />` |
| `status === 'error' \|\| status === 'offline'` | `<StartupState message={...} onRetry={refresh} />` |
| 其它(`synced`/`localOnly`/`localModified`/`remoteModified`/`conflict`/`initialChoice`) | 主框架 |

### 5.2 shadcn Sidebar 组合

`(app)/layout.tsx` 渲染:

```tsx
<SidebarProvider>
  <AppSidebar />
  <SidebarInset>
    <AppHeader />
    <main className="p-6">{children}</main>
  </SidebarInset>
</SidebarProvider>
```

**`AppSidebar`:**

- `<Sidebar>` + `<SidebarHeader>`(Logo + 文档路径 + 应用名)
- `<SidebarContent>` > `<SidebarGroup>` > `<SidebarMenu>`
  - 5 个 `<SidebarMenuItem>` 各含 `<SidebarMenuButton asChild><Link href={nav.href}>...</Link></SidebarMenuButton>`
  - 用 shadcn `usePathname` 判断 active
- `<SidebarFooter>` 放当前设备 `<Card>`

**`AppHeader`:** 移动端 `<SidebarTrigger />` + 同步状态 `<Badge variant={...}>` + 邮箱 + 退出 `<Button variant="outline" size="sm">`

**导航配置集中:**

```ts
// src/features/app/nav-config.ts
export const NAV_ITEMS = [
  { href: '/overview',     label: '概览',     icon: Cloud },
  { href: '/versions',     label: '版本历史', icon: FileClock },
  { href: '/devices',      label: '设备',     icon: Smartphone },
  { href: '/organization', label: '组织',     icon: Users },
  { href: '/settings',     label: '设置',     icon: SettingsIcon },
] as const;
```

**状态徽章 variant / label 提取:**

```ts
// src/features/sync/status-badge.ts
export const statusVariant = (s: SyncStatus): BadgeProps['variant'] => /* ... */;
export const statusLabel   = (s: SyncStatus): string => /* ... */;
```

(从 `ClientApp` 现成的 `statusLabel` / `statusVariant` 函数搬过来,逻辑不变。)

### 5.3 StartupState 拆分

当前 `src/features/app/components/startup-state.tsx` 包含 `DesktopRequiredState`、`LoadingState`、`StartupState` 三个组件。重构后拆为独立文件:

```
src/features/app/components/
├─ hydrating-state.tsx
├─ loading-state.tsx
├─ startup-state.tsx            # error/offline
└─ desktop-required-state.tsx
```

---

## 6. `(public)/auth` 与深链重置密码

`(public)/auth/page.tsx`:

- 已登录 → `router.replace('/overview')`
- 未登录 → 渲染 `<AuthScreen identity={...} onAuthenticated={...} />`
- `AuthScreen` 内部的 `useEffect` 保留 `readCurrentDeepLink` 与 `listenResetDeepLink` 调用,不修改 `AuthScreen` 组件本身
- `AuthScreen` 只在 `(public)/auth` 挂载(即已签出状态),所以深链重置密码只在用户未登录时生效;已登录用户收到的重置邮件引导其手动退出后再点链接,这是与现状一致的预期行为

---

## 7. 文件变更清单

### 7.1 新增文件

```
src/app/(app)/layout.tsx
src/app/(app)/overview/page.tsx
src/app/(app)/versions/page.tsx
src/app/(app)/devices/page.tsx
src/app/(app)/organization/page.tsx
src/app/(app)/settings/page.tsx
src/app/(public)/layout.tsx
src/app/(public)/auth/page.tsx

src/features/app/nav-config.ts
src/features/app/app-sidebar.tsx
src/features/app/app-header.tsx
src/features/app/components/hydrating-state.tsx
src/features/app/components/loading-state.tsx
src/features/app/components/desktop-required-state.tsx
src/features/app/components/startup-state.tsx        # 拆出来

src/features/sync/sync-store.ts
src/features/sync/sync-actions.ts
src/features/sync/use-overview-actions.ts
src/features/sync/use-versions-actions.ts
src/features/sync/use-devices-actions.ts
src/features/sync/use-settings-actions.ts
src/features/sync/status-badge.ts
```

### 7.2 修改文件

```
src/app/page.tsx                       # 改为 router.replace('/overview')
src/features/sync/use-sync-controller.ts # Phase B 期间作为 facade,最终删除
```

### 7.3 删除文件

```
src/features/app/components/client-app.tsx
src/features/sync/use-sync-controller.ts
```

---

## 8. 迁移阶段

| Phase | 内容 | 验收 |
|---|---|---|
| **A** 抽出 Zustand store | 新建 store + actions,`use-sync-controller` 内部改为读 store + 调 actions,签名不变 | `npm run build` 通过,所有调用点零修改 |
| **B** 拆分 page-level hooks | 新建 4 个 page hooks,`use-sync-controller` 改为 facade | 各 hook 单元测试通过 |
| **C** 落地路由 | 新建 `(app)/layout.tsx` + 5 个 `page.tsx` + `(public)/auth/page.tsx` | 5 个 URL 可访问,鉴权门工作 |
| **D** 删除 ClientApp | 删除 `client-app.tsx` + `use-sync-controller.ts` | 无悬挂引用,`npm run build` 通过 |
| **E** shadcn Sidebar 化 | 重写 `AppSidebar`/`AppHeader` 用 shadcn 组件 | 折叠、移动端 Sheet、深链菜单全部工作 |
| **F** 测试 & 清理 | `npm run test`、`npm run lint`、Tauri `cargo check`、手工验证 | 见 §9 DoD 全部勾选 |

每完成一个 Phase,跑一次 `npm run build` 验证;失败立即修复,不积累技术债。

---

## 9. 完成标准(DoD)

1. ✅ `npm run build` 通过,产出 `out/`(静态导出)
2. ✅ `npm run lint` 通过
3. ✅ `npm run test` 通过(Vitest 单测 + hook 测试 + 组件集成测试)
4. ✅ `src/features/app/components/client-app.tsx` 已删除
5. ✅ `src/features/sync/use-sync-controller.ts` 已删除
6. ✅ 5 个 `(app)/*` 路由 + `(public)/auth` 路由可访问
7. ✅ 所有页面用 shadcn 组件组合,无新增自定义布局组件
8. ✅ 鉴权门在 `(app)/layout.tsx` 集中处理
9. ✅ 深链重置密码可工作
10. ✅ 退出按钮 → `/auth` → 重登 → `/overview` 全流程通
11. ✅ 手工跑 Tauri 桌面:`npm run tauri dev`,登录、5 tab 切换、深链重置、退出全通过

---

## 10. 测试策略

| 层 | 工具 | 覆盖 |
|---|---|---|
| Store 单元测试 | Vitest | `sync-store` setter、selectors、reset 行为 |
| Hook 单元测试 | Vitest + `@testing-library/react` | `useOverviewActions` 等调用 IPC 时入参正确、状态变化正确 |
| 组件集成测试 | Vitest + `@testing-library/react` + `next/navigation` mock | 5 个 page.tsx 渲染对应 feature 组件 |
| 构建验证 | `npm run build` | 静态导出成功 |
| Tauri 端到端 | `npm run tauri dev` | 登录、tab 切换、退出、深链重置 |

**新增依赖(写入 `package.json`):**

- `vitest`
- `@testing-library/react`
- `@testing-library/jest-dom`
- `jsdom`
- `@vitest/coverage-v8`(可选)

**新增脚本(写入 `package.json`):**

- `"test": "vitest run"`
- `"test:watch": "vitest"`
- `"test:coverage": "vitest run --coverage"`

---

## 11. 风险与回滚

| 风险 | 缓解 |
|---|---|
| 鉴权门放 `(app)/layout.tsx`,未登录访问 `(app)/*` 时跳转 /auth,可能闪烁 | `hydrated` 阶段先渲染 `<HydratingState />`,鉴权判断在 hydration 后才执行,避免水合前误判 |
| Zustand store 跨页共享,`busy` 字段被并发动作覆盖 | `busy` 语义保持与 `ClientApp` 一致:代表"当前正在执行的单一动作",UI 在 `busy != null` 时禁用相关按钮,保证动作串行;`setBusy(null)` 由 action 自身在 finally 中调用 |
| shadcn Sidebar 用 `document.cookie` 持久化,Tauri WebView 中 cookie 行为可能与浏览器略有差异 | 桌面端 cookie 仅用于折叠状态,失败回退到内存 state,不影响功能 |
| 拆分 hook 后,某些 `controller.refresh()` 的副作用顺序与原版不一致 | Phase B 期间 `use-sync-controller` 作为 facade 保留所有调用顺序,逐步替换 |
| 重构期间 `npm run build` 反复失败 | 每个 Phase 结束跑一次 build,失败立即修,不堆积 |

---

## 12. 显式不做(YAGNI)

- 不实现 nested 详情页(`/versions/[id]`)
- 不替换 zustand 为 jotai/valtio
- 不引入 React Query / Tanstack Query
- 不写 Playwright e2e(Tauri 桌面,手工验证)
- 不改 IPC 契约(后端 `settr-server` 零变更)
- 不动 `src/features/<feature>/components/*` 业务组件源码(只调整调用方式)

---

## 13. 后续(留待下一个 spec)

- nested 详情页(如版本 diff 详情、设备详情)
- 主题切换(dark mode 当前依赖系统,需 UI 切换入口)
- 国际化(当前界面硬编码中文)
