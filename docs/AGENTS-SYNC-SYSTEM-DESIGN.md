# Agents Plus 系统设计方案

> 目标：让用户在多台电脑上共享同一份 `~/.agents/AGENTS.md`，并拥有安全、可追溯、可恢复的云端版本管理能力。
>
> 适用项目：Tauri 2 + Next.js + React + TypeScript + Tailwind CSS + shadcn/ui + Rust。

## 1. 产品定义

### 1.1 核心问题

每台电脑都可能存在一份本地 `~/.agents/AGENTS.md`。用户在公司电脑修改了规则，回家后还需要手工复制；多台设备同时修改时，又容易覆盖或丢失内容。

### 1.2 产品目标

- 以用户账号为边界，在云端保存一份可审计的 AGENTS.md 文档。
- 每台已授权电脑安装 Agents Plus 后，可以拉取和应用其他设备的最新版本。
- 本地修改可以上传为新版本，并保留完整历史、作者、设备和时间信息。
- 离线时仍可正常使用本地文件；恢复联网后自动补偿同步。
- 任何同步都不能静默覆盖用户未上传的本地修改。
- 针对 AGENTS.md 中可能包含敏感信息，提供风险提醒、备份和可选的端到端加密路线。

### 1.3 非目标（MVP 不做）

- 不同步整个 `~/.agents` 目录，只同步 `AGENTS.md`。
- 不执行 AGENTS.md 中的命令，不解析或评价规则内容。
- 不在 MVP 中做多人协作编辑器、评论、审批流和团队组织权限。
- 不把云端文档自动注入所有应用；只负责本地文件同步。

## 2. 总体架构

    ┌─────────────────────────────────────────────────────────┐
    │                    Agents Plus Desktop                   │
    │  Next.js 静态导出 UI                                               │
    │    └─ Feature API / 状态 / 用户交互                      │
    │         └─ Tauri Commands（IPC 边界）                   │
    │              └─ Application Use Cases                  │
    │                   ├─ SyncService                       │
    │                   ├─ VersionService                    │
    │                   ├─ ConflictService                   │
    │                   └─ DeviceService                     │
    │                        └─ Infrastructure                │
    │                             ├─ LocalFileAdapter          │
    │                             ├─ CloudApiAdapter           │
    │                             ├─ LocalStateStore           │
    │                             └─ SecureTokenStore          │
    └────────────────────────────┬────────────────────────────┘
                                 │ HTTPS / JSON API
                                 ▼
    ┌─────────────────────────────────────────────────────────┐
    │                       Cloud Backend                      │
    │ Auth │ Sync API │ Version API │ Device API │ Audit       │
    │                         │                               │
    │                    PostgreSQL                           │
    │       users / devices / documents / revisions           │
    └─────────────────────────────────────────────────────────┘

### 2.1 部署组件

#### 客户端

- Tauri 主进程：负责文件访问、系统路径、网络请求、凭据存储、文件监控和原子写入。
- Next.js 前端：通过 App Router 静态导出负责状态展示、登录、同步确认、版本浏览、冲突处理和设置；不使用 SSR、Server Actions 或 Route Handlers。
- 本地同步模块：作为 Rust 应用服务存在，不让组件直接读写 `~/.agents/AGENTS.md`。
- 可选自启动模块：MVP 先做“启动时检查”，后续再增加系统托盘和后台自启动。

#### 服务端

- Auth Service：账号注册、登录、刷新令牌、设备授权和撤销。
- Document Service：查询当前版本、提交新版本、读取历史版本。
- Sync Service：基于版本号或 ETag 做乐观并发控制，返回冲突信息。
- Audit Service：记录设备、版本、IP 摘要和操作类型；不记录明文内容到日志。
- PostgreSQL：保存文档元数据、版本内容和设备信息。AGENTS.md 体积通常较小，MVP 可直接存数据库；未来大文件再迁移对象存储。

## 3. 客户端分层设计

### 3.1 前端目录建议

    src/
    ├─ app/
    │  ├─ layout.tsx
    │  ├─ page.tsx
    │  ├─ globals.css
    │  └─ providers/
    ├─ features/
    │  ├─ auth/
    │  ├─ sync/
    │  ├─ versions/
    │  ├─ devices/
    │  └─ onboarding/
    ├─ components/
    │  └─ ui/                  # shadcn/ui 源码组件
    ├─ services/
    │  ├─ ipc.ts                 # 统一 invoke gateway
    │  ├─ apiClient.ts           # 前端不直接拼接 fetch
    │  └─ queryClient.ts
    ├─ stores/
    └─ lib/                    # cn() 与纯工具函数

前端以 Next.js Client Components 表达页面状态和用户意图，例如 `syncNow`、`applyRemoteRevision`；文件路径解析、版本比较和写入保护全部放到 Rust 端。

### 3.2 Rust 目录建议

    src-tauri/src/
    ├─ main.rs
    ├─ lib.rs
    ├─ commands/
    │  ├─ auth.rs
    │  ├─ sync.rs
    │  ├─ versions.rs
    │  ├─ devices.rs
    │  └─ mod.rs
    ├─ application/
    │  ├─ sync_service.rs
    │  ├─ version_service.rs
    │  ├─ conflict_service.rs
    │  ├─ device_service.rs
    │  └─ ports.rs
    ├─ domain/
    │  ├─ document.rs
    │  ├─ revision.rs
    │  ├─ device.rs
    │  ├─ sync_status.rs
    │  └─ errors.rs
    ├─ infrastructure/
    │  ├─ local_file.rs
    │  ├─ cloud_api.rs
    │  ├─ local_store.rs
    │  ├─ token_store.rs
    │  └─ file_watcher.rs
    ├─ dto/
    ├─ state.rs
    └─ shared/

### 3.3 关键应用服务

#### SyncService

负责完整同步流程：

1. 读取本地文件内容和本地 manifest。
2. 计算内容 hash，判断本地是否有未同步修改。
3. 请求云端当前版本。
4. 根据本地基线版本、云端版本和本地内容决定同步策略。
5. 必要时执行 diff3 合并或要求用户确认。
6. 安全写入本地文件或提交云端新版本。
7. 更新本地 manifest 和同步状态。

#### VersionService

- 拉取历史版本列表。
- 查询指定版本内容。
- 上传本地内容并附带父版本号。
- 恢复历史版本时先生成新的恢复版本，不直接删除历史记录。

#### ConflictService

- 使用 base、local、remote 三份内容进行三方合并。
- clean merge：自动生成合并结果，但仍在 UI 中提示用户。
- conflict merge：保存冲突文件，不覆盖主文件，等待用户处理。
- 不依赖云端合并，确保离线和本地可测试。

## 4. 本地文件与状态模型

### 4.1 文件位置

默认主文件：

- Windows：用户主目录下的 `.agents/AGENTS.md`
- macOS/Linux：用户主目录下的 `.agents/AGENTS.md`

不要硬编码盘符或绝对路径。统一使用 Rust 的 home directory API 解析用户目录，再拼接 `.agents/AGENTS.md`。

### 4.2 本地管理目录

建议在 `~/.agents/.agents-plus/` 保存同步元数据：

    .agents-plus/
    ├─ manifest.json       # 当前云端基线、hash、设备标识
    ├─ cache/              # 最近一次 remote/base 内容的本地缓存
    ├─ backups/            # 每次覆盖前的本地备份，按时间命名
    ├─ conflicts/          # 冲突副本，不覆盖主文件
    └─ logs/               # 脱敏后的本地诊断日志

示例 `manifest.json`：

    {
      "documentId": "doc_xxx",
      "deviceId": "dev_xxx",
      "baseRevisionId": "rev_12",
      "baseContentHash": "sha256:...",
      "lastAppliedRevisionId": "rev_12",
      "lastSyncedAt": "2026-08-22T08:00:00Z",
      "localContentHash": "sha256:...",
      "schemaVersion": 1
    }

### 4.3 写入安全

应用远程版本时必须：

1. 重新读取当前文件并计算 hash，不能信任上一次扫描结果。
2. 如果 hash 与 manifest 中的 localContentHash 不一致，说明用户在同步期间编辑过，必须中止覆盖并重新进入冲突流程。
3. 将旧文件复制到 backups/。
4. 写入同目录临时文件，使用 UTF-8 无 BOM。
5. flush/fsync 后再通过原子 rename 替换主文件。
6. 更新 manifest；失败时保留备份和临时文件，禁止丢失原内容。

## 5. 同步状态机

    LOCAL_ONLY
       │ 登录并首次扫描
       ▼
    NEEDS_INITIAL_CHOICE ──上传──► SYNCED
       │                           ▲
       └────────下载───────────────┘

    SYNCED ──本地变更──► LOCAL_MODIFIED
       │                       │
       │ 拉取远端               │ 上传
       ▼                       ▼
    REMOTE_MODIFIED ───────► SYNCED
       │
       ├─本地未变更：安全下载
       ├─三方合并成功：等待确认或自动提交
       └─三方合并失败：CONFLICT

    任意状态 ──网络失败──► OFFLINE（保留上一次状态，恢复网络后重试）

状态定义：

- LOCAL_ONLY：本机有文件，但云端没有文档。
- NEEDS_INITIAL_CHOICE：首次绑定，必须由用户明确选择上传或下载。
- SYNCED：本地 hash 与已知云端版本一致。
- LOCAL_MODIFIED：本地相对基线发生修改。
- REMOTE_MODIFIED：云端相对基线发生修改。
- CONFLICT：本地和云端都发生修改且无法安全自动合并。
- OFFLINE：网络不可用，不能据此判断文件是否冲突。

## 6. 版本控制与冲突策略

### 6.1 乐观并发控制

所有提交必须携带 `parentRevisionId`：

    POST /v1/documents/{documentId}/revisions
    {
      "parentRevisionId": "rev_12",
      "content": "...",
      "contentHash": "sha256:...",
      "message": "Update Rust command rules",
      "clientMutationId": "mut_xxx"
    }

服务端规则：

- parentRevisionId 等于当前 head：创建新版本。
- parentRevisionId 不是当前 head：返回 409 REVISION_CONFLICT，不覆盖任何版本。
- clientMutationId 用于幂等，网络重试不得产生重复版本。
- 同一内容 hash 已是 head 时，返回已有版本，不重复写入。

### 6.2 三方合并

- base：本设备上一次确认同步的版本。
- local：当前本地 AGENTS.md。
- remote：云端最新版本。

合并优先级：

1. 只有 local 改变：上传 local。
2. 只有 remote 改变：下载 remote。
3. 两边改变但修改区间不重叠：生成 merged 内容，显示“已自动合并”，用户确认后写入并上传。
4. 两边修改同一区域：进入冲突页，显示并排 diff，用户选择保留本地、远端或手工编辑。

冲突文件命名建议：

- `AGENTS.md.local`
- `AGENTS.md.remote`
- `AGENTS.md.base`
- `AGENTS.md.conflicted`

不要在用户未确认时覆盖主 `AGENTS.md`。

### 6.3 版本页面能力

- 时间线：版本号、时间、设备名、变更摘要。
- 查看任意版本全文和 unified diff。
- 从任意版本创建新的“恢复版本”。
- 标记版本：当前、稳定、备份。
- 删除策略：MVP 不允许物理删除，只支持隐藏或归档，避免误删后无法恢复。

## 7. 云端数据模型

### users

- id
- email / login_provider
- created_at / updated_at
- status

### devices

- id
- user_id
- name（如“公司 Windows”）
- platform / app_version
- last_seen_at
- created_at / revoked_at
- public_key（为端到端加密预留）

### documents

- id
- user_id
- type = `agents_md`
- head_revision_id
- created_at / updated_at

### revisions

- id
- document_id
- parent_revision_id
- device_id
- content
- content_hash
- message
- created_at
- metadata_json（客户端版本、操作系统等非敏感元数据）

### sync_events

- id
- user_id / device_id / document_id
- event_type（pull、push、conflict、restore、revoke）
- revision_id
- created_at
- metadata_json

约束：

- document.user_id 与 revision.document_id 的所属关系必须由服务端事务保证。
- revision 的 parent_revision_id 必须属于同一 document。
- content_hash 使用 SHA-256；服务端再次计算并校验，不能只相信客户端传值。
- 所有时间统一保存 UTC，客户端按本地时区显示。

## 8. API 草案

### 认证和设备

- `POST /v1/auth/login`
- `POST /v1/auth/refresh`
- `GET /v1/devices`
- `POST /v1/devices`
- `DELETE /v1/devices/{deviceId}`

### 文档与同步

- `GET /v1/documents/agents-md`：获取 head、ETag 和文档摘要。
- `GET /v1/documents/{documentId}/revisions`：分页获取版本列表。
- `GET /v1/revisions/{revisionId}`：获取指定版本内容。
- `POST /v1/documents/{documentId}/revisions`：基于 parentRevisionId 提交版本。
- `POST /v1/documents/{documentId}/restore`：从历史版本创建恢复版本。

统一错误结构：

    {
      "code": "REVISION_CONFLICT",
      "message": "Remote revision is newer than the local base.",
      "requestId": "req_xxx",
      "details": {
        "currentRevisionId": "rev_13",
        "clientParentRevisionId": "rev_12"
      }
    }

## 9. 登录与设备绑定流程

### 首次使用

1. 安装应用并启动。
2. 应用读取本地 AGENTS.md，不上传，先显示文件存在、大小、修改时间和敏感信息风险提示。
3. 用户登录或注册。
4. 为设备命名，例如“公司电脑”或“家里电脑”。
5. 若云端不存在文档：选择“上传本地文件”。
6. 若云端已有文档：选择“下载云端版本”“保留本地并生成新版本”或“打开合并”。
7. 完成后显示当前版本、上次同步时间和设备列表。

### 常规使用

- 启动时检查一次。
- 用户可点击“立即同步”。
- 文件变更后防抖 1-2 秒重新计算 hash，并将状态标记为“有本地修改”，默认不自动上传，避免保存过程产生大量版本。
- 用户点击“上传”或开启自动同步后，才提交新版本。
- 云端有更新时显示通知和 diff 摘要；是否自动应用由设置决定。

## 10. UI 信息架构

### 导航

- 概览
- 版本历史
- 设备
- 设置

### 概览页

核心是“当前状态”而不是复杂图表：

- 当前本地文件状态：已同步 / 有本地修改 / 有云端更新 / 存在冲突 / 离线。
- 当前版本：v12、修改时间、来源设备。
- 主操作：立即同步、上传本地版本、应用云端版本、查看冲突。
- 最近活动：最近 5 次同步和版本变更。
- 设备摘要：已连接设备数量、最后在线时间。

### 版本历史页

- 左侧按时间排列版本列表。
- 右侧显示版本内容或 diff。
- 提供“恢复此版本”，恢复动作明确创建新版本。
- 支持按设备、时间、变更说明过滤。

### 冲突页

- 顶部说明：当前文件不会被覆盖。
- 三栏视图：Base、Local、Remote；可切换 unified diff。
- 操作：保留本地、采用远端、编辑合并结果、暂不处理。
- 合并完成后先预览，再写入主文件并提交版本。

### 设备页

- 设备名称、平台、最后同步时间、当前版本。
- 重命名设备。
- 撤销设备：撤销后该设备 token 立即失效，不能继续拉取或上传。

### 设置页

- 启动时检查：默认开启。
- 自动上传本地修改：默认关闭，MVP 建议手动确认。
- 自动应用云端更新：默认关闭。
- 冲突文件保留天数。
- 登录、退出、删除本地缓存。
- 导出个人数据和删除云端账号。

### 视觉基线

已生成 UI 设计系统：`design-system/agents-plus/MASTER.md`。

建议方向：技术型深色工作台，主色 slate，成功/同步使用绿色，冲突使用琥珀或红色；使用 Lucide 等统一 SVG 图标，不使用 emoji 作为按钮图标。状态不能只通过颜色表达，必须同时有文本和图标。

## 11. 安全与隐私设计

### 11.1 必须做

- 全链路 TLS；访问令牌使用系统安全存储，不写入 localStorage 和明文配置文件。
- 服务端密码只保存强哈希，登录支持短期 access token + 可轮换 refresh token。
- 文档内容数据库加密存储，日志只记录 hash、版本 ID、设备 ID 和错误码，不记录正文。
- 上传前做本地敏感信息扫描：API key、token、private key、密码、`-----BEGIN ... PRIVATE KEY-----` 等模式提示用户。
- 默认不自动上传，首次上传必须用户确认。
- 设备撤销、退出登录和删除账号必须可用且有二次确认。
- 所有远程文件应用前创建备份；失败可恢复。

### 11.2 P1：端到端加密

AGENTS.md 可能包含内部路径、组织规范、服务地址甚至误提交的密钥。推荐后续提供“个人加密库”模式：

- 密码或恢复短语只在客户端派生加密密钥。
- 云端只保存密文、版本元数据和不可逆 hash。
- 新设备通过恢复短语或设备间授权加入密钥圈。
- 忘记恢复材料时，服务端无法恢复正文；UI 必须在开启前明确提示。

MVP 可以先采用服务端加密 + 敏感扫描，但产品文案不能声称“端到端加密”。

## 12. 可观测性与故障处理

客户端日志字段建议：

- requestId
- operation
- syncState
- revisionId
- errorCode
- durationMs
- appVersion

禁止记录：正文、token、密码、完整本地路径、IP 以外的敏感信息。

常见故障行为：

| 场景 | 产品行为 |
|---|---|
| 无网络 | 进入离线状态，保留本地文件，提供重试 |
| token 过期 | 静默刷新；刷新失败则要求重新登录 |
| 云端版本更新 | 显示远端摘要，按设置决定下载或等待确认 |
| 本地文件被外部修改 | 重新计算 hash，禁止基于旧快照覆盖 |
| 上传版本冲突 | 返回 409，自动拉取 remote 并进入合并流程 |
| 写入失败 | 保留备份和临时文件，提示权限或磁盘空间问题 |
| 设备被撤销 | 停止同步，清除本地云端 token，保留本地文件 |

## 13. MVP 范围与验收标准

### MVP 功能

- 邮箱或 OAuth 登录。
- 当前设备注册、命名和撤销。
- 首次绑定时上传或下载二选一。
- 手动拉取、手动上传。
- 启动时检查同步状态。
- 云端版本列表和版本内容查看。
- 本地覆盖前自动备份。
- 基于 revision ID 的并发检测。
- 冲突时保存 local、remote、base 副本，不静默覆盖。
- 敏感信息风险提示。

### 验收标准

- 在两台设备分别修改文件，双方均能看到最新版本。
- 两台设备基于同一版本同时上传时，后提交者不会覆盖先提交者，必须收到冲突反馈。
- 无网络修改文件，恢复网络后可继续同步。
- 下载远端版本失败或进程中断时，本地原文件仍可恢复。
- 恢复旧版本后，历史记录仍完整，并出现新的恢复版本。
- 撤销设备后，该设备不能继续拉取和提交。
- 应用日志和服务端日志不包含 AGENTS.md 正文。
- 安装包在 Windows、macOS、Linux 上都使用平台正确的用户目录，不硬编码路径。

## 14. 实施路线

### Phase 0：本地同步内核

- 抽象 LocalFileAdapter、ManifestStore、BackupStore。
- 实现 hash、原子写入、备份、启动扫描和状态机。
- 不接云端，先用 fake remote 做单元测试。

### Phase 1：账号、设备和云端 head

- 实现登录、refresh token、设备注册和撤销。
- 实现 users、devices、documents、revisions 表。
- 实现 GET head、POST revision 和 409 冲突。

### Phase 2：版本历史和冲突处理

- 接入 diff3 合并。
- 完成版本时间线、diff 查看和恢复版本。
- 完成冲突副本和手工合并流程。

### Phase 3：自动化与安全增强

- 文件监控、防抖、托盘菜单和可选自启动。
- 敏感信息扫描规则和忽略提示。
- 端到端加密、恢复短语和设备间授权。
- 增加平台签名、自动更新和错误上报。

## 15. 推荐的第一批 IPC Command

- `get_local_status`
- `read_local_document`
- `start_login`
- `get_session`
- `register_device`
- `sync_now`
- `upload_local_revision`
- `apply_remote_revision`
- `get_merge_preview`
- `resolve_conflict`
- `list_revisions`
- `get_revision_content`
- `restore_revision`
- `list_devices`
- `revoke_device`
- `get_app_settings`
- `update_app_settings`

这些 command 只作为 IPC 边界适配器；实际逻辑必须落在 application、domain 和 infrastructure 层。

## 16. 关键决策摘要

1. **云端保存版本链，而不是只保存一个最新文件**：支持审计、恢复和冲突检测。
2. **使用乐观并发控制，而不是最后写入覆盖**：避免多设备丢数据。
3. **使用本地 manifest 记录同步基线**：三方合并必须知道 base。
4. **远程应用采用原子写入和自动备份**：保证桌面端中断时可恢复。
5. **MVP 默认手动确认**：先保证安全，再增加自动同步策略。
6. **敏感内容按高风险配置处理**：服务端加密是最低要求，端到端加密是 P1。
7. **Tauri 负责系统能力，Next.js 静态前端负责交互**：跨层访问统一通过 IPC 和 gateway。
