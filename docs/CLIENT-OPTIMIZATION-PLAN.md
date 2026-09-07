# 客户端基础设置与优化清单

> 版本：1.0
> 日期：2026-09-07
> 状态：待实施
> 范围：`D:\workspace\settr`（Tauri 2 + Next.js 桌面客户端）

## 1. 背景

本文档汇总客户端当前存在的基础设置缺失与工程规范问题，共 13 项。每项均附源码或文档证据，标注当前状态、方案方向、涉及文件与验收标准，作为后续迭代实施依据。

优先级定义：

- **P0**：生产可用阻塞项，发布前必须完成。
- **P1**：用户可感知的体验与可配置性项。
- **P2**：安全加固、规范对齐与代码健康项。

## 2. 优先级总览

| 编号 | 优先级 | 主题 | 一句话描述 |
|------|--------|------|------------|
| 1 | P0 | 生产环境日志（Rust 侧） | eprintln 在 Release 下不可见，需 tauri-plugin-log 落盘 |
| 2 | P0 | 前端页面日志持久化 | console 输出无处存放，需转发到日志文件 |
| 3 | P0 | 后端地址运行时配置 | 编译时硬编码 + Rust 侧读不存在的环境变量 |
| 4 | P0 | 自动更新 | 发布门槛硬性要求，当前完全缺失 |
| 5 | P0 | 包管理器统一 | npm/pnpm 混用，锁文件双份并存 |
| 6 | P1 | 托盘关闭行为 | 硬编码关窗即藏托盘，不可配置 |
| 7 | P1 | 窗口位置/大小记忆 | 重启回到默认位置 |
| 8 | P1 | 主题切换 | next-themes 已安装未接线 |
| 9 | P1 | 开机自启动 | Phase 3 计划项，无实现 |
| 10 | P1 | 设置页功能扩展 | 设计文档 7 项设置，当前仅 1 项 |
| 11 | P2 | CSP unsafe-inline 收紧 | script-src 含 unsafe-inline |
| 12 | P2 | 用户数据目录 API | 硬编码 ~/.agents-plus，未用平台推荐 API |
| 13 | P2 | 设置页组件拆分 | 补齐功能后将超 300 行约束 |

---

## 3. P0 — 生产可用阻塞项

### 1. 生产环境日志（Rust 侧）

**问题**：全部错误输出使用 `eprintln!`，Release 模式下 `windows_subsystem = "windows"` 隐藏控制台，日志完全丢失，线上问题不可诊断。

**证据**：

- `src-tauri/src/lib.rs:25,28,39,50,58` — eprintln 调用（单实例/深链错误）
- `src-tauri/src/infrastructure/tray.rs:28,42,73` — eprintln 调用（托盘错误）
- `src-tauri/src/main.rs:2` — `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`
- `src-tauri/Cargo.toml:20-37` — 无 log 相关依赖
- `docs/PRODUCT-BLUEPRINT.md:233` — 发布门槛："日志不包含规则正文、密码、token、私钥和完整本地路径"
- `docs/AGENTS-SYNC-SYSTEM-DESIGN.md:476-486` — 日志字段建议（requestId/operation/syncState/revisionId/errorCode/durationMs/appVersion）与禁止记录清单

**方案方向**：

1. Cargo 添加 `tauri-plugin-log` 与 `log` crate。
2. `lib.rs` 注册插件，target 配置 `LogDir` + `Stdout`（开发期可见，生产落盘）。
3. 配置 `max_file_size`、`rotation_strategy(RotationStrategy::KeepAll)`、`level(Info)`。
4. 替换全部 `eprintln!` 为 `log::error!` / `log::warn!`。
5. capability `default.json` 添加 `log:default`。
6. 日志格式与脱敏规则遵循设计文档第 476-486 行约束。

生产日志落盘路径（Windows）：`%LOCALAPPDATA%\com.msi.agents-plus\logs`。

**涉及文件**：`src-tauri/Cargo.toml`、`src-tauri/src/lib.rs`、`src-tauri/src/infrastructure/tray.rs`、`src-tauri/capabilities/default.json`

**验收标准**：

- Release 安装包运行后，`%LOCALAPPDATA%\com.msi.agents-plus\logs` 下有日志文件。
- 触发深链/托盘错误，日志文件出现对应 error 记录。
- 日志文件超过 max_file_size 后自动轮转，旧文件保留。
- 全仓库 grep 无 `eprintln!` 残留。
- 日志内容不包含 token、密码、文档正文、完整本地路径。

> 官方参考：<https://v2.tauri.app/plugin/logging/>

---

### 2. 前端页面日志持久化

**问题**：前端 WebView 中的 console 输出（错误、警告）无任何持久化。全前端仅 1 处 `console.warn`，出错后无处追溯。用户报告问题时前端侧无日志可查。

**证据**：

- `src/features/skills/components/pending-updates-badge.tsx:25` — 前端唯一 console 调用，刷新失败仅 `console.warn`
- `src/components/ui/sonner.tsx:10` — Toast 使用 `useTheme`，说明前端已有主题依赖但日志层面无收集机制
- tauri-plugin-log 本地源码 `commands.rs:12-18` — `log` command 接收前端日志参数（level/message/location/file/line/key_values）写入文件
- tauri-plugin-log 本地源码 `guest-js/index.ts:148-236` — 前端 API：`error/warn/info/debug/trace`
- tauri-plugin-log 本地源码 `lib.rs:37` — `WEBVIEW_TARGET = "webview"` 前端日志标记常量
- tauri-plugin-log 本地源码 `lib.rs:668-672` — 官方示例：`LogDir` target + filter `WEBVIEW_TARGET` 可将前端日志单独筛选/落盘
- 官方文档 forwardConsole 模式：<https://v2.tauri.app/plugin/logging/>

**方案方向**：

1. 前端安装 `@tauri-apps/plugin-log` npm 包。
2. 在应用入口（layout 或 providers 组件）实现 `forwardConsole` 模式：重写 `console.log/debug/info/warn/error`，在保留原行为的同时调用 plugin-log 对应前端 API（走 IPC 写入日志文件）。
3. 配合问题 1 的 `LogDir` target，前端日志与 Rust 日志写入同一日志目录；可用 `WEBVIEW_TARGET` filter 区分来源。
4. 未捕获的 Promise rejection 与全局错误（`window.onerror` / `unhandledrejection`）同步接入。
5. 前端日志遵循同一脱敏规则（禁止 token、正文、完整路径）。

**涉及文件**：`package.json`、`src/app/layout.tsx`（或新建 `src/lib/frontend-logger.ts` + providers）、`src/features/skills/components/pending-updates-badge.tsx`（改用统一 logger）

**验收标准**：

- 前端 `console.error`/`warn` 输出同步出现在日志文件中。
- 模拟 Promise rejection，日志文件出现对应记录。
- 前端日志条目可区分来源（webview vs rust）。
- 前端日志不包含敏感信息。

> 官方参考：<https://v2.tauri.app/plugin/logging/>（forwardConsole 代码示例）

---

### 3. 后端地址运行时配置

**问题**：前端 `API_BASE_URL` 编译时从 `NEXT_PUBLIC_API_BASE_URL` 读取，用户机器上此环境变量不存在，始终 fallback 到 `localhost:19999`。Rust 侧运行时读取同一不存在的环境变量，产线必然指向 localhost，无法连接真实后端。

**证据**：

- `src/lib/api-request.ts:10-12` — `API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:19999"`（编译时固化）
- `src-tauri/src/application/skill.rs:36-38` — `std::env::var("NEXT_PUBLIC_API_BASE_URL")` 运行时读取，用户机器不存在此变量，始终 fallback localhost
- `src-tauri/src/state.rs:7-9` — `AppState` 仅有 `api_base_url: String`，默认空
- `src/features/settings/components/settings.tsx:35` — 设置页文案写"后端地址和设备名只保存在本机"，但组件（15-25 行）只有设备重命名，无后端地址输入框
- `src-tauri/src/infrastructure/api.rs:33-34` — 已有 HTTPS 非 localhost 强制校验逻辑，可复用

**方案方向**：

1. 引入 `tauri-plugin-store`（或自研 `settings.json` 原子读写），持久化后端地址。
2. 设置页新增后端地址输入框，保存前做 URL 格式与 HTTPS 校验（复用 api.rs 校验规则）。
3. 应用启动时从持久化配置加载到 `AppState`，前端通过 IPC command 获取（替代编译时环境变量）。
4. Rust 侧 `SkillContext::from_global` 的 env fallback 改为读取 AppState 配置。
5. 提供默认值 `http://localhost:19999` 仅限开发环境。

**涉及文件**：`src-tauri/Cargo.toml`、`src-tauri/src/state.rs`、`src-tauri/src/application/skill.rs`、`src-tauri/src/commands/`（新增 settings command）、`src/features/settings/components/settings.tsx`、`src/lib/api-request.ts`、`src-tauri/capabilities/default.json`

**验收标准**：

- 设置页可输入并保存后端地址，重启后保持。
- 保存时对非法 URL / 非 HTTPS（非 localhost）输入给出明确错误。
- 登录、同步等请求实际使用配置的后端地址。
- `NEXT_PUBLIC_API_BASE_URL` 环境变量不再影响运行时行为。

> 官方参考：<https://v2.tauri.app/plugin/store/>

---

### 4. 自动更新

**问题**：`bundle.targets: "all"` 但无 updater 配置，Cargo 无 updater 依赖。发布门槛硬性要求"安装包完成签名并具备升级与回滚方案"，当前不满足。

**证据**：

- `src-tauri/tauri.conf.json:27-44` — bundle 配置无 `createUpdaterArtifacts`，plugins 仅 deep-link
- `src-tauri/Cargo.toml:20-37` — 无 tauri-plugin-updater 依赖
- `docs/PRODUCT-BLUEPRINT.md:232` — "Tauri 安装包完成签名并具备升级与回滚方案"
- `docs/AGENTS-SYNC-SYSTEM-DESIGN.md:551` — Phase 3："增加平台签名、自动更新和错误上报"

**方案方向**：

1. `tauri.conf.json`：`bundle.createUpdaterArtifacts: true`。
2. `plugins.updater`：配置 `pubkey` 与 `endpoints[]`（更新清单 JSON 托管地址）。
3. 签名私钥通过 CI 环境变量 `TAURI_SIGNING_PRIVATE_KEY` 注入（官方明确不支持 .env）。
4. Windows `installMode: "passive"`（官方推荐默认）。
5. Cargo 添加 `tauri-plugin-updater`，lib.rs 注册，capability 添加对应权限。
6. 设置页添加"检查更新"入口（可放 P1 迭代，配置先就位）。
7. 生产 endpoint 强制 HTTPS（插件默认强制）。

**涉及文件**：`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/src/lib.rs`、`src-tauri/capabilities/default.json`、CI 签名配置

**验收标准**：

- 构建产出包含 updater 签名文件（.sig）。
- 修改版本号发布新版后，旧版客户端能检测并完成更新。
- 签名私钥不出现在仓库与日志中。
- 回滚方案：保留上一版本安装包可手动覆盖安装。

> 官方参考：<https://v2.tauri.app/plugin/updater/>

---

### 5. 包管理器统一（pnpm）

**问题**：tauri.conf.json 的构建命令使用 npm，仓库同时存在 `package-lock.json` 与 `pnpm-lock.yaml`，依赖解析来源不确定；AGENTS.md 明确要求 pnpm。

**证据**：

- `src-tauri/tauri.conf.json:7` — `"beforeDevCommand": "npm run dev"`
- `src-tauri/tauri.conf.json:9` — `"beforeBuildCommand": "npm run build"`
- 仓库根目录同时存在 `package-lock.json` 与 `pnpm-lock.yaml`
- 项目 AGENTS.md 环境信息："node项目优先使用pnpm管理依赖"

**方案方向**：

1. 删除 `package-lock.json`。
2. `tauri.conf.json` 两处命令改为 `pnpm dev` / `pnpm build`。
3. 确认 package.json 无 `packageManager` 字段冲突（如有则声明 pnpm）。

**涉及文件**：`src-tauri/tauri.conf.json`、`package-lock.json`（删除）

**验收标准**：

- 仓库仅存在 `pnpm-lock.yaml`。
- `pnpm tauri dev` / `pnpm tauri build` 正常执行，无 npm 调用。

---

## 4. P1 — 体验与可配置性

### 6. 托盘关闭行为可配置

**问题**：关闭窗口无条件 `prevent_close()` + `hide()` 到托盘，用户无法选择"直接退出"，只能通过托盘右键退出。行为硬编码不可配置。

**证据**：

- `src-tauri/src/infrastructure/tray.rs:69-75` — `WindowEvent::CloseRequested` 中 `api.prevent_close()` + `window_to_hide.hide()`
- 托盘菜单仅有"显示窗口"与"退出"两项（tray.rs:11-14）

**方案方向**：

1. 依赖问题 3 的本地设置存储，增加"关闭时最小化到托盘"开关（默认开，保持现有行为）。
2. `setup_close_to_tray` 启动时读取配置，决定是否拦截关闭事件。
3. 运行中修改设置时更新行为（或简化为重启生效，需明确 UI 提示）。

**涉及文件**：`src-tauri/src/infrastructure/tray.rs`、设置持久化模块、设置页组件

**验收标准**：

- 开关开启时：点关闭按钮 → 隐藏到托盘。
- 开关关闭时：点关闭按钮 → 应用退出。
- 设置重启后保持。

---

### 7. 窗口位置与大小记忆

**问题**：窗口仅有固定初始尺寸（1180x760），重启后回到默认位置，用户调整后的窗口状态丢失。

**证据**：

- `src-tauri/tauri.conf.json:14-21` — 窗口配置仅 title/width/height/minWidth/minHeight
- `src-tauri/Cargo.toml:20-37` — 无 window-state 插件依赖

**方案方向**：

1. Cargo 添加 `tauri-plugin-window-state`。
2. lib.rs 注册插件（默认即可记住位置/大小/最大化状态）。
3. capability 添加 `window-state:default`。

**涉及文件**：`src-tauri/Cargo.toml`、`src-tauri/src/lib.rs`、`src-tauri/capabilities/default.json`

**验收标准**：

- 调整窗口位置/大小后退出，重启恢复上次状态。
- 最大化状态重启后恢复。

> 官方参考：<https://v2.tauri.app/plugin/window-state/>

---

### 8. 主题切换（暗色模式接线）

**问题**：`next-themes` 已在 package.json 依赖中，但根布局无 ThemeProvider 包裹，暗色模式完全不生效；sonner 组件调用 `useTheme` 拿不到 Provider 上下文。

**证据**：

- `package.json` dependencies — `next-themes: ^0.4.6`（已安装）
- `src/app/layout.tsx:9-19` — `<html lang="zh-CN">` 直接包裹 children，无 ThemeProvider
- `src/components/ui/sonner.tsx:10` — `useTheme()` 调用依赖 Provider 存在
- `src/app/globals.css:4,116` — 已定义 `.dark` class 样式变量（样式层就绪）

**方案方向**：

1. 新建 `src/components/theme-provider.tsx`，用 `next-themes` 的 `ThemeProvider` 包裹（`attribute="class"`、`defaultTheme="system"`、`enableSystem`）。
2. `layout.tsx` 的 `<html>` 添加 `suppressHydrationWarning`。
3. 设置页（问题 10）新增"外观"设置项：亮色 / 暗色 / 跟随系统。

**涉及文件**：`src/app/layout.tsx`、`src/components/theme-provider.tsx`（新建）、设置页组件

**验收标准**：

- 切换暗色后 UI 全局生效，刷新保持。
- "跟随系统"模式下跟随 OS 设置。
- sonner Toast 颜色跟随主题。

> 官方参考：<https://ui.shadcn.com/docs/dark-mode/next>

---

### 9. 开机自启动

**问题**：无自启动能力。设计文档 Phase 3 明确列出"可选自启动"。

**证据**：

- `src-tauri/Cargo.toml:20-37` — 无 autostart 依赖
- `docs/AGENTS-SYNC-SYSTEM-DESIGN.md:548` — Phase 3："文件监控、防抖、托盘菜单和可选自启动"

**方案方向**：

1. Cargo 添加 `tauri-plugin-autostart`。
2. lib.rs 注册插件（`MacosLauncher::LaunchAgent`）。
3. capability 添加 `autostart:allow-enable` / `allow-disable` / `allow-is-enabled`。
4. 设置页新增"开机自启动"开关，调用 `enable()/disable()/isEnabled()`。

**涉及文件**：`src-tauri/Cargo.toml`、`src-tauri/src/lib.rs`、`src-tauri/capabilities/default.json`、设置页组件

**验收标准**：

- 开关开启后重启系统，应用随系统启动。
- 开关关闭后不再自启动。
- 开关状态跨重启保持（与系统注册状态一致）。

> 官方参考：<https://v2.tauri.app/plugin/autostart/>

---

### 10. 设置页功能扩展

**问题**：设计文档设置页要求 7 项功能，当前仅实现设备重命名与退出登录，其余全部缺失。

**证据**（设计文档 `docs/AGENTS-SYNC-SYSTEM-DESIGN.md:436-443` 对照当前实现）：

| 设计文档要求 | 当前状态 |
|---|---|
| 启动时检查（默认开启） | 未实现 |
| 自动上传本地修改（默认关闭） | 未实现 |
| 自动应用云端更新（默认关闭） | 未实现 |
| 冲突文件保留天数 | 未实现 |
| 登录、退出、删除本地缓存 | 仅退出登录 |
| 导出个人数据 | 未实现 |
| 删除云端账号 | 未实现 |
| （问题 3）后端地址 | 无输入框，仅文案提及 |

另：问题 8 主题、问题 9 自启动、问题 6 托盘行为开关也归属设置页。

**方案方向**：

1. 按功能分组：通用（主题/语言）、同步行为（启动检查/自动上传/自动应用/冲突保留天数）、连接（后端地址/设备名）、账户与数据（登录/退出/缓存清理/导出/删号）、外观与启动（自启动/托盘行为）。
2. 每个开关项持久化到本地设置存储（同问题 3 基础设施）。
3. 删除本地缓存需二次确认弹窗。
4. 导出数据与删除云端账号涉及后端接口，按 IPC 契约规范新增 command 与 DTO。

**涉及文件**：`src/features/settings/`（components/hooks/api）、`src-tauri/src/commands/`、`src-tauri/src/dto/`、设置存储模块

**验收标准**：

- 设置页覆盖设计文档全部条目。
- 每个设置项有明确默认值且跨重启保持。
- 删除缓存/导出/删号有确认流程，操作结果有成功/失败反馈。

---

## 5. P2 — 安全加固与代码健康

### 11. CSP unsafe-inline 收紧

**问题**：`script-src 'self' 'unsafe-inline'` 允许内联脚本，削弱 CSP 对 XSS 的防护。

**证据**：

- `src-tauri/tauri.conf.json:24` — `script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'`

**方案方向**：

1. 分析静态导出产物中是否存在内联 `<script>`（Next.js 静态导出通常有 hydration 脚本内联）。
2. 如可消除（改用外部脚本加载），移除 `script-src` 的 unsafe-inline。
3. `style-src` 的 unsafe-inline 因 Tailwind 运行时注入通常需保留，单独评估。
4. 若暂无法消除，记录已知妥协原因，纳入安全评审跟踪。

**涉及文件**：`src-tauri/tauri.conf.json`

**验收标准**：

- CSP 配置与实际产物一致（无冗余放行）。
- 如保留 unsafe-inline，有明确记录的原因说明。

---

### 12. 用户数据目录 API 规范化

**问题**：用户数据目录硬编码 `~/.agents-plus`，通过 `USERPROFILE`/`HOME` 环境变量获取主目录，未使用 Tauri 推荐目录 API，不符合 AGENTS.md 第 10 节要求。

**证据**：

- `src-tauri/src/infrastructure/local_paths.rs:8` — `const APP_DIR: &str = ".agents-plus";`
- `src-tauri/src/infrastructure/local_paths.rs:14-18` — `env::var_os("USERPROFILE").or_else(|| env::var_os("HOME"))`
- 项目 AGENTS.md 第 10 节 — "用户数据目录必须使用 Tauri 或平台推荐目录 API，不硬编码操作系统路径"

**方案方向**：

1. 改用 `app.path().data_dir()`（Tauri 2 PathResolver）获取平台推荐数据目录。
2. 存量数据迁移：首次启动检测旧目录 `~/.agents-plus` 存在则迁移内容到新目录，迁移后保留旧目录或提示。
3. 迁移逻辑需幂等且可回滚。

**涉及文件**：`src-tauri/src/infrastructure/local_paths.rs`、调用该模块的 command/application 层

**验收标准**：

- 新安装用户数据写入平台推荐目录。
- 旧版本升级用户数据自动迁移，无丢失。
- 迁移逻辑有单元测试覆盖（存在/不存在/部分迁移场景）。

---

### 13. 设置页组件拆分

**问题**：当前 `settings.tsx` 仅 80 行。按问题 3、6、8、9、10 补齐后预计超过 300 行，违反 AGENTS.md 单文件行数约束。

**证据**：

- `src/features/settings/components/settings.tsx` — 当前 80 行，仅设备重命名+退出登录
- 项目 AGENTS.md 第 4.1 节 — "单文件代码行数非必要不要超过 300 行"

**方案方向**：

1. 实施问题 10 时按分组拆子组件：`general-settings.tsx`、`sync-settings.tsx`、`connection-settings.tsx`、`account-settings.tsx`、`appearance-settings.tsx`。
2. 父组件 `settings.tsx` 只做布局与 tab/分组切换。
3. 设置读写逻辑下沉到 `hooks/use-settings.ts` + `api.ts` gateway。

**涉及文件**：`src/features/settings/components/`（多文件）、`src/features/settings/hooks/`

**验收标准**：

- 每个文件不超过 300 行。
- 组件职责单一，设置项分组清晰。

---

## 6. 实施顺序建议

```
批次一（P0，日志与配置基础设施）
  5 → 1 → 2 → 3 → 4
  先统一 pnpm 消除构建变量，
  再铺日志基建（Rust + 前端），
  再做后端地址配置（设置存储基础设施在此建立，供后续项复用），
  最后接自动更新。

批次二（P1，设置页与体验）
  3 的存储基础上 → 10（设置页框架）→ 6 / 7 / 8 / 9（逐项接入）

批次三（P2，加固）
  13（随批次二自然完成）→ 11 → 12
```

依赖关系：

- 问题 2（前端日志）依赖问题 1（plugin-log 引入）。
- 问题 3（设置存储）是问题 6、8、9、10 的基础设施前置。
- 问题 10（设置页框架）是问题 6、8、9 的 UI 载体。
- 问题 13（拆分）随问题 10 实施同步完成。

## 7. 统一验收清单

全部完成后逐项核对：

- [ ] Release 包日志落盘，前后端日志均可追溯
- [ ] 后端地址可在设置页配置且产线生效
- [ ] updater 签名与端点配置就位，升级/回滚演练通过
- [ ] 仅 pnpm-lock.yaml，tauri 命令走 pnpm
- [ ] 托盘行为可配置
- [ ] 窗口状态跨重启保持
- [ ] 亮/暗/系统主题生效
- [ ] 自启动可开关且状态一致
- [ ] 设置页覆盖设计文档全部条目
- [ ] CSP 无冗余放行或留有记录
- [ ] 用户数据目录使用平台 API，旧数据迁移无损
- [ ] 所有改动文件不超过 300 行
- [ ] `pnpm build`、`cargo fmt --check`、`cargo clippy -D warnings`、`cargo test` 全绿