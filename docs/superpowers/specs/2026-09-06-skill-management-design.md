# Skill 管理与分发 — 设计文档

| 字段 | 值 |
|---|---|
| 日期 | 2026-09-06 |
| 状态 | 已批准,待实施 |
| 关联项目 | agents-plus(桌面端)、agents-plus-server(后端) |
| 参考实现 | cc-switch(D:\workspace\cc-switch) |

---

## 1. 目标与范围

在 agents-plus 中引入 **Skill 集合** 的管理与分发能力,体验对标现有 AGENTS.md / CLAUDE.md 的"服务端权威 + 多设备同步",但承载对象从单文件变为**任意数量的 SKILL 集合**,并能分发到本地多个 AI harness(Claude Code、Codex、OpenCode 等)。

### 包含

- 服务端 skill 元数据、版本、订阅关系存储
- 服务端 ZIP 二进制存储(MinIO)
- 后台 worker 检测上游更新(仅检测,**不自动应用**)
- 客户端本地 SSOT、harness 分发(symlink/copy/auto)
- 4 路 skill 导入:本地创作 / GitHub / skills.sh / ZIP 拖拽
- 个人空间首发;组织空间分发 API 预留,实现等组织重构 P3

### 不包含(本期)

- skill 内 SKILL.md 的 diff/三方合并(内容是二进制 ZIP,不做内容级合并)
- 组织空间订阅的完整 UI(API 预留,UI 后置)
- skill 评分/标签/全文搜索(后续增量)

---

## 2. 关键决策摘要(从 brainstorming 收敛)

| 决策 | 选择 |
|---|---|
| SSOT 位置 | 服务端为权威,客户端拉取缓存 |
| Skill 单元 | ZIP 包(SKILL.md + 资源文件) |
| Harness 覆盖 | 全量(Claude/Codex/OpenCode/Gemini/GrokBuild/Hermes/Pi),ClaudeDesktop 与 OpenClaw 标记不支持 |
| 导入路径 | 本地创作上传 + GitHub 仓库导入 + skills.sh 公共注册表 + 本地 ZIP 拖拽(四路全做) |
| 启用矩阵 | **纯本地**,服务端不存"哪个 skill 在哪个 harness 启用"的事实 |
| 作用范围 | 个人空间首发 + 组织可分发(API 预留) |
| 更新机制 | 服务端后台 worker 周期轮询(6h),**仅检测不应用**,用户手动确认升级 |
| 数据模型 | Skill = 一类独立的一等资源(不复用 Document 表) |
| 表前缀 | `t_`,主键 BIGINT 雪花 ID,前端按 string 处理 |
| ZIP 存储 | MinIO(S3 兼容对象存储) |
| Name 唯一性 | 全平台全局唯一 |
| 客户端 SSOT | `~/.agents-plus/skills/` |
| 客户端状态 | `~/.agents-plus/skills-state.json`(JSON,非 JSONL) |
| ZIP 缓存 | `~/.agents-plus/cache/skills/<id>/<version>.zip` |
| 默认同步方式 | `auto`(cc-switch 同款) |
| Pi 冲突策略 | 已存在且内容不一致 → 弹"覆盖/保留"对话框,不自动覆盖 |
| 不可用 harness | 直接禁用 + UI 标红 |
| 安全阈值 | 沿用 cc-switch(10000 条目 / 512MB / 50MB 单文件 / 4KB symlink target) |
| 离线体验 | 显示"离线"横幅,新建/订阅禁用,已缓存 skill 可查看 |
| 部分同步失败 | UI 只在 skill 详情标红,关联上下文最清晰 |

---

## 3. 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     agents-plus 桌面端 (Tauri 2)                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Next.js 前端  (静态导出)                                  │  │
│  │  features/skills/{list, detail, editor, distribution}      │  │
│  │  zustand store + IPC invoke                               │  │
│  └──────────────────┬────────────────────────────────────────┘  │
│                     │  IPC (IpcResult envelope)                  │
│  ┌──────────────────▼────────────────────────────────────────┐  │
│  │  Rust 后端 (新增 skill feature)                             │  │
│  │  commands/skill.rs ←→ services/skill_dispatch.rs           │  │
│  │  local SSOT: ~/.agents-plus/skills/<name>/                 │  │
│  │  harness adapters: claude/codex/opencode/gemini/.../pi     │  │
│  │  local enable matrix: ~/.agents-plus/skills-state.json    │  │
│  └──────────────────┬────────────────────────────────────────┘  │
└────────────────────┼────────────────────────────────────────────┘
                     │ HTTPS (reqwest + rustls)
┌────────────────────▼────────────────────────────────────────────┐
│              agents-plus-server (新增 skills 模块)              │
│  REST API /api/v1/skills/...                                      │
│  tables: t_skills, t_skill_versions, t_skill_subscriptions       │
│  background worker: 周期拉取 GitHub/skills.sh 源                 │
│  storage: MinIO (ZIP BLOB, 不存 DB)                              │
└─────────────────────────────────────────────────────────────────┘
```

### 职责切分

| 层 | 责任 | 不做什么 |
|---|---|---|
| Server `skills` | 元数据、ZIP 存储、版本管理、上游轮询、订阅关系 | 不读本地文件系统、不分发到 harness |
| 客户端 IPC | 鉴权 + 调 server API + 写本地 SSOT + 分发 | 不存 ZIP(只缓存)、不查上游 |
| 客户端 `skill_dispatch` | 拉 ZIP → 解压到 SSOT → 按本地启用矩阵 symlink/copy 到各 harness | 不查上游(轮询在 server) |
| 客户端 `local enable matrix` | 哪个 skill 在哪个 harness 启用,纯本地状态 | 不上传 server |

---

## 4. 数据模型

所有表统一字段:

```
id              BIGINT PK                 # 雪花 ID,序列化时返回 string
deleted         TINYINT(1) @TableLogic
created_at      DATETIME(3)
updated_at      DATETIME(3)
deleted_at      DATETIME(3) NULL
```

### 4.1 `t_skills` — skill 元数据

| 列 | 类型 | 说明 |
|---|---|---|
| id | BIGINT PK | 雪花 |
| name | VARCHAR(128) | 短横线命名,**全平台全局唯一** |
| display_name | VARCHAR(256) NULL | 来自 SKILL.md frontmatter |
| description | TEXT NULL | 来自 frontmatter |
| source_type | VARCHAR(32) | local \| github \| skills_sh \| zip_upload |
| source_url | TEXT NULL | GitHub repo / skills.sh slug |
| source_ref | TEXT NULL | branch + 路径(JSON) |
| latest_version_id | BIGINT NULL FK → t_skill_versions.id | |
| owner_scope | VARCHAR(16) | personal \| org |
| owner_user_id | BIGINT NULL | personal 时填充 |
| org_id | BIGINT NULL | org 时填充 |
| created_by | BIGINT FK → users | |
| content_hash | CHAR(64) | latest ZIP 的 SHA-256 |
| has_update_available | TINYINT(1) | worker 检测到上游变化时置 true,用户升级后清零 |

索引:
- `UNIQUE (name)` — 全平台唯一
- `INDEX (owner_scope, owner_user_id)`
- `INDEX (owner_scope, org_id)`
- `INDEX (deleted, updated_at)` — 软删分页

### 4.2 `t_skill_versions` — 每次发布一个版本,ZIP 实体

| 列 | 类型 | 说明 |
|---|---|---|
| id | BIGINT PK | |
| skill_id | BIGINT FK → t_skills.id ON DELETE CASCADE | |
| version | VARCHAR(64) | semver 或上游 tag |
| minio_bucket | VARCHAR(128) | |
| minio_object_key | VARCHAR(512) | `<skill_id>/<version>.zip` |
| size_bytes | BIGINT | |
| content_hash | CHAR(64) | ZIP 的 SHA-256 |
| changelog | TEXT NULL | 上游 release notes 或自填 |
| source_meta | JSON NULL | 抓取时间/commit/tag |
| published_by | BIGINT FK → users | |
| published_at | DATETIME(3) | |

索引:
- `UNIQUE (skill_id, version)`
- `INDEX (skill_id, published_at DESC)`

ZIP 实体存 MinIO,**不进 DB**。

### 4.3 `t_skill_subscriptions` — 用户 ↔ skill 多对多

| 列 | 类型 | 说明 |
|---|---|---|
| id | BIGINT PK | |
| user_id | BIGINT FK → users | |
| skill_id | BIGINT FK → t_skills.id | |
| source | VARCHAR(16) | personal_create \| org_subscribe \| import |
| subscribed_at | DATETIME(3) | |

索引: `UNIQUE (user_id, skill_id)`

### 4.4 `t_notifications`(可选,跟现有通知机制集成)

复用 agents-plus-server 现有通知表,新增 `entity_type = "skill"` + `entity_id = t_skills.id`,无需新表。

---

## 5. 服务端 API

REST 命名空间 `/api/v1/skills`。所有 ID snowflake → JSON 序列化时返回 **string**。响应包 `{ ok, data, error? }` envelope(沿用 `IpcResult`)。ZIP 不走 API body — 返回 **MinIO 预签名下载 URL**(TTL 300s)。

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/v1/skills` | 列出当前用户可见的 skill(自创 + 订阅)。query: `?scope=PERSONAL\|ORG&org_id=&page=&size=&q=`(枚举大写,大小写敏感) |
| POST | `/api/v1/skills` | 创建 skill(personal)。body: `{name, display_name?, description?, source_type, source_url?, source_ref?}` |
| GET | `/api/v1/skills/{id}` | skill 详情(含 latest_version 摘要) |
| PATCH | `/api/v1/skills/{id}` | 更新元数据(仅 owner) |
| DELETE | `/api/v1/skills/{id}` | 软删(仅 owner,无订阅者时允许硬删) |
| GET | `/api/v1/skills/{id}/versions` | 版本列表,倒序 |
| POST | `/api/v1/skills/{id}/versions` | 发布新版本。`multipart/form-data`: zip + `version` + `changelog?` |
| GET | `/api/v1/skills/{id}/versions/{version}` | 版本详情 + 预签名下载 URL |
| POST | `/api/v1/skills/{id}/check-update` | 手动触发上游检查,异步返回 `task_id` |
| GET | `/api/v1/skills/{id}/check-update/{task_id}` | 轮询任务状态 |
| POST | `/api/v1/skills/import/github` | 从 GitHub 导入。body: `{repo, ref?, path?}` |
| POST | `/api/v1/skills/import/skills-sh` | 从 skills.sh 导入。body: `{slug}` |
| POST | `/api/v1/skills/import/zip` | 上传 ZIP(multipart),后端解析 SKILL.md frontmatter |
| GET | `/api/v1/skills/search` | 全平台搜索已发布 skill |
| POST | `/api/v1/skills/{id}/subscribe` | 订阅 |
| DELETE | `/api/v1/skills/{id}/subscribe` | 取消订阅 |
| GET | `/api/v1/skills/notifications` | 当前用户有新版本可升级的 skill 列表 |

### 权限

- 自创 skill:仅 owner 可改/删/发版
- 订阅:任何登录用户可订阅"公开 + 已发布"的 skill
- 组织空间:需 `org_id` 成员资格(MVP 先只做 personal,接口预留 `?org_id=` 参数)

### 错误码

- `SKILL_NAME_CONFLICT` 全局 name 冲突
- `SKILL_ZIP_TOO_LARGE` >50MB
- `SKILL_ZIP_INVALID` 缺 SKILL.md 或解压失败
- `SKILL_VERSION_EXISTS` 同 skill 同 version 已存在
- `SKILL_SOURCE_FETCH_FAILED` GitHub/skills.sh 拉取失败
- `SKILL_NOT_FOUND` / `SKILL_FORBIDDEN`

---

## 6. 后台 Worker

- Spring `@Scheduled`(或同类),默认每 **6 小时** 跑一次
- 遍历 `t_skills` 中 `deleted = 0 AND source_type IN ('github', 'skills_sh') AND deleted_at IS NULL`
- 按 `source_url + source_ref` 拉上游 tag/release/commit
- 对比 `latest_version_id.version` 与上游;有变化 →
  - 写通知(`entity_type='skill'`,`entity_id=t_skills.id`)
  - 置 `has_update_available = true`
- 个人创作 + ZIP 上传的 skill **不参与**轮询

**Worker 只检测不应用**。客户端定期拉 `/skills/notifications`,UI 弹 Badge,用户点"升级"才走下载 → 解压 → 重分发流程。

---

## 7. 客户端架构

### Tauri commands(`src-tauri/src/commands/skill.rs`)

```rust
// 拉取/管理
list_skills(scope: SkillScope, org_id?: String) -> Vec<SkillSummary>
get_skill(id: String) -> SkillDetail
create_skill(input: CreateSkillInput) -> String
publish_version(skill_id: String, version: String, zip_path: String, changelog?: String) -> SkillVersion
import_from_github(input: GitHubImportInput) -> String
import_from_skills_sh(slug: String) -> String
import_from_zip(zip_path: String, name: String) -> String
search_skills(query: String) -> Vec<SkillSummary>
delete_skill(id: String) -> ()

// 订阅
subscribe_skill(id: String) -> ()
unsubscribe_skill(id: String) -> ()

// 更新检测
list_pending_updates() -> Vec<PendingUpdate>
trigger_check_update(skill_id: String) -> String

// 本地分发(纯本地)
install_to_local(skill_id: String, version: String) -> ()
dispatch_to_harness(skill_id: String, harness: HarnessId, method: SyncMethod) -> ()
set_harness_enabled(skill_id: String, harness: HarnessId, enabled: bool) -> ()
set_sync_method(method: SyncMethod) -> ()
set_harness_override(harness: HarnessId, path: String?) -> ()
scan_local_state() -> LocalSkillState
```

### 模块结构(`src-tauri/src/services/`)

```
skill_dispatch.rs            # 协调入口
├── skill_repo.rs            # 调 server API,reqwest
├── skill_storage.rs         # ZIP 缓存 ~/.agents-plus/cache/
├── skill_extractor.rs       # 解压到 SSOT,带安全校验
├── skill_dispatcher.rs      # SSOT → harness 分发(核心)
├── harness_registry.rs      # HarnessId → 路径映射
└── skill_state.rs           # 读写 skills-state.json
```

### Harness 注册表(`harness_registry.rs`)

```rust
pub struct HarnessAdapter {
    pub id: HarnessId,
    pub skills_dir: fn() -> PathBuf,
    pub supported: bool,
    pub special_handling: SpecialHandling,
}

pub static REGISTRY: &[HarnessAdapter] = &[
    HarnessAdapter { id: Claude,        skills_dir: || home().join(".claude/skills"),          supported: true,  special: None },
    HarnessAdapter { id: Codex,         skills_dir: || home().join(".codex/skills"),           supported: true,  special: None },
    HarnessAdapter { id: OpenCode,      skills_dir: || home().join(".config/opencode/skills"), supported: true,  special: None },
    HarnessAdapter { id: Gemini,        skills_dir: || home().join(".gemini/skills"),          supported: true,  special: None },
    HarnessAdapter { id: GrokBuild,     skills_dir: || home().join(".grok/skills"),            supported: true,  special: None },
    HarnessAdapter { id: Hermes,        skills_dir: hermes_config::skills_dir,                  supported: true,  special: None },
    HarnessAdapter { id: Pi,            skills_dir: pi_config::skills_dir,                     supported: true,  special: Some(ExistsAsActive) },
    HarnessAdapter { id: ClaudeDesktop, ..., supported: false, ... },
    HarnessAdapter { id: OpenClaw,     ..., supported: false, ... },
];
```

加新 harness = 加一行 + 在 `HarnessId` enum 加一个 variant。

### 分发核心(`skill_dispatcher.rs`)

`dispatch(skill_id, harness, method)`:

1. 读 `skills-state.json` → 若 `enabled_harnesses` 不含目标,return `Ok(NotEnabled)`
2. `source = ~/.agents-plus/skills/<name>/`,验证含 `SKILL.md`,否则 `InvalidSource`
3. `dest = harness.skills_dir() + <name>/`
4. **Pi 特殊**:目标已存在 → hash 比对,不一致则弹"覆盖/保留"对话框,等待用户选择
5. 按 method 写:
   - `Symlink`: `symlink_dir(source, dest)`,Windows 失败 → fallback copy + warning
   - `Copy`: `replace_dest_with_copy(source, dest)`(tmp → rename 原子)
   - `Auto`: 目标已存在 → copy;否则先 symlink,失败 fallback copy
6. 更新 `last_synced_at` + `last_synced_version`
7. 返回 `Dispatched { method: used_method, dest }`

### 手动更新确认流程

```
[Worker 每 6h]
  拉上游 → 发现新 version → 写通知 + has_update_available=true

[客户端启动 / 后台心跳]
  GET /api/v1/skills/notifications → 列出"有可用更新"
  UI 弹 Badge + "N 个 skill 有更新"

[用户在 UI 点某个 skill 的 "查看更新"]
  → 显示旧/新 version + changelog
  → 点 "升级"
  → 前端 invoke("install_to_local", id, new_version)
       → reqwest 拉 MinIO 预签名 URL
       → 解压覆盖 SSOT(原子:解压到 tmp → rename)
       → 重新跑 dispatch_to_harness(对所有 enabled_harnesses)
       → DELETE /api/v1/skills/{id}/notifications/{version}

[用户不点]
  → 通知一直在,不影响现有 SSOT
```

---

## 8. 客户端本地状态

### `~/.agents-plus/skills-state.json`

```json
{
  "version": 1,
  "skills": {
    "<skill_id>": {
      "enabled_harnesses": ["claude", "codex"],
      "sync_method": "auto",
      "last_synced_version": "1.2.0",
      "last_synced_at": "2026-09-06T...",
      "last_install_error": null
    }
  },
  "harness_overrides": {
    "opencode": "/custom/path/opencode/skills"
  },
  "global_sync_method": "auto"
}
```

字段含义:
- `enabled_harnesses` — 该 skill 启用到哪些 harness(纯本地)
- `sync_method` — 单 skill override;缺省用 `global_sync_method`
- `last_synced_version` — 当前 harness 副本对应的 version
- `last_install_error` — 上次 install 失败原因,UI 标红用

### `~/.agents-plus/skills/` — SSOT

每个 skill 一个子目录,内含解压后的 SKILL.md + 资源文件。子目录名 = skill.name。

### `~/.agents-plus/cache/skills/<id>/<version>.zip`

ZIP 缓存,文件名带 content_hash 去重。

---

## 9. 安全与失败处理

### ZIP 解压前校验(`skill_extractor.rs`)

| 检查 | 阈值 | 失败处理 |
|---|---|---|
| 含 SKILL.md | 必须 | SKILL_ZIP_INVALID |
| 顶层目录数 | 1 | SKILL_ZIP_INVALID |
| 总条目数 | ≤ 10000 | SKILL_ZIP_TOO_LARGE |
| 解压后总字节 | ≤ 512 MB | SKILL_ZIP_TOO_LARGE |
| 单文件大小 | ≤ 50 MB | SKILL_ZIP_FILE_TOO_LARGE |
| 路径合法性 | 无 `..`、无绝对路径、无符号链接条目 | SKILL_ZIP_UNSAFE_PATH |
| symlink target | ≤ 4 KB | SKILL_ZIP_UNSAFE_SYMLINK |

### 路径穿越防护

- `name` 严格 `^[a-z0-9][a-z0-9-]{0,63}$`,不合法 SKILL_NAME_INVALID
- `ZipArchive::by_index()` → `entry.enclosed_name()` 必须以 SSOT 目录为前缀
- 写 harness 目标前 `canonicalize()` 校验在 skills_dir 之下

### 并发与原子性

| 资源 | 锁 | 粒度 |
|---|---|---|
| `skills-state.json` | RwLock | 整个文件 |
| SSOT 中每个 `<skill_name>/` | Mutex | per-skill,按 name 哈希分桶 |
| MinIO 上传 | 客户端内部 | |
| `cache/` | 不用锁 | 文件名含 content_hash 去重 |

**写文件统一走 `replace_dest_with_copy`**:`<dest>.tmp-<pid>-<nonce>` → 递归 copy → `fs::rename` 原子替换。

### 网络失败

| 场景 | 行为 |
|---|---|
| reqwest 超时(>30s) | 指数退避重试 3 次(1s/4s/16s),最终失败 → NETWORK_ERROR + Toast |
| 预签名 URL 过期 | 重拉一次新 URL |
| 服务端 5xx | 重试 |
| 服务端 4xx | 不重试 |
| 离线启动 | "离线"横幅 + 已缓存 skill 可查看,新建/订阅禁用 |

### 部分同步恢复

`install_to_local` 全程事务化:
1. 解压到 `~/.agents-plus/skills/<name>.tmp-<nonce>/`
2. 校验 SKILL.md
3. 原子 rename 到 `<name>/`
4. 触发 `dispatch_to_harness` 对每个 enabled harness

任何一步失败 → 清理 tmp + 标记 `last_install_error`,**已成功的 harness 不回滚**。下次重试从失败点继续。

### 凭据 / 鉴权

- 复用现有 `auth` 模块的 token 存储(Windows keyring)
- 服务端 401 → IPC 层统一拦截 → refresh,失败则重新登录
- API 调用统一通过 `commands/network.rs::api_request`

---

## 10. 测试策略

### 层级

| 层级 | 范围 | 工具 |
|---|---|---|
| 单元 | Rust 模块逻辑 | cargo test |
| 集成 | Rust + 临时 fs + mock HTTP | cargo test + wiremock + tempfile |
| 服务端 | skills API + worker + DB | JUnit + Testcontainers(MySQL) |
| E2E | 手工跑剧本 | 手动 checklist |

### Rust 单元测试

```
harness_registry.rs
  ✓ 每个 HarnessAdapter.skills_dir() 解析路径正确
  ✓ unsupported harness 返回 supported=false
  ✓ Pi special_handling 标记存在

skill_extractor.rs
  ✓ 缺 SKILL.md → SKILL_ZIP_INVALID
  ✓ 多顶层目录 → SKILL_ZIP_INVALID
  ✓ 条目数 >10000 → SKILL_ZIP_TOO_LARGE
  ✓ 解压字节 >512MB → SKILL_ZIP_TOO_LARGE
  ✓ 单文件 >50MB → SKILL_ZIP_FILE_TOO_LARGE
  ✓ 含 ../ 路径 → SKILL_ZIP_UNSAFE_PATH
  ✓ 含符号链接条目 → SKILL_ZIP_UNSAFE_SYMLINK

skill_dispatcher.rs
  ✓ enabled_harnesses 不含目标 → Ok(NotEnabled),无副作用
  ✓ SSOT 缺 SKILL.md → InvalidSource
  ✓ Pi 目标已存在且 hash 不一致 → 触发 PromptUser
  ✓ Auto + 目标不存在 → 先 symlink,失败 fallback copy
  ✓ Auto + 目标已存在 → copy
  ✓ Copy → tmp + rename 原子
  ✓ Symlink Windows 失败 → fallback copy
  ✓ 写失败时 last_install_error 被记录

skill_state.rs
  ✓ 读不存在文件 → 返回默认 state(非 panic)
  ✓ 并发写用 RwLock,无死锁
  ✓ JSON schema 校验

skill_name.rs
  ✓ 合法 name 通过
  ✓ 大写 / 含 _ / 太长 / 空 → SKILL_NAME_INVALID
```

### Rust 集成测试

```
fixtures/skills/
  ├── valid-basic.zip
  ├── missing-skill-md.zip
  ├── zip-bomb-flat.zip        # 10001 个空文件
  ├── zip-bomb-deep.zip        # 解压后 600MB
  ├── unsafe-path.zip          # 含 ../etc/passwd
  └── unsafe-symlink.zip

tests/dispatch_round_trip.rs
  ✓ install_to_local(valid-basic) → SSOT 含 SKILL.md
  ✓ dispatch_to_harness(Claude, auto) → ~/.claude/skills/<name>/SKILL.md 存在
  ✓ uninstall → SSOT 和所有 harness 副本清理
  ✓ Pi 场景:目标已存在且不同内容 → 触发 PromptUser

tests/cache_dedup.rs
  ✓ install_to_local 两次同 version → cache 命中,网络 0 次

tests/offline_recovery.rs
  ✓ mock 500 → 重试 3 次后报错,UI Toast
  ✓ mock 超时 → 同上
  ✓ 离线启动 → 仍能列出已缓存 skill
```

### 服务端测试

```
SkillControllerTest
  ✓ POST /skills 创建成功,返回 snowflake string id
  ✓ POST /skills 重名 → SKILL_NAME_CONFLICT
  ✓ GET /skills?scope=personal 只列当前用户
  ✓ DELETE 软删 → 列表查询不可见
  ✓ POST /skills/{id}/versions multipart → MinIO 有对象 + DB 有版本
  ✓ 上传 >50MB → SKILL_ZIP_TOO_LARGE
  ✓ 非法 ZIP → SKILL_ZIP_INVALID

SkillVersionControllerTest
  ✓ GET 返回预签名 URL

SkillImportTest
  ✓ import/github → mock GitHub API → 创建 skill
  ✓ import/github 失败 → SKILL_SOURCE_FETCH_FAILED

SkillWorkerTest
  ✓ 检测到上游 tag 变化 → 写通知
  ✓ 未变化 → 不写
  ✓ source_type=local/zip_upload → 不参与轮询

SkillSubscriptionTest
  ✓ 订阅 → 写入
  ✓ 取消订阅 → 软删
  ✓ 用户只能取消自己的订阅
```

### E2E 剧本(checklist)

```
□ 全新安装 → 创建 personal skill(上传 ZIP)→ Claude harness 启用 → Claude Code 能用
□ 订阅组织发布的 skill → 拉到本地 → Codex 启用 → Codex 能识别
□ 修改 SKILL.md 并 publish 新版本 → 通知出现 → 点"升级" → Claude harness 副本同步
□ 不点"升级" → 通知一直在,SSOT 和 harness 不变
□ 删除 skill → 所有 harness 副本清理 → SSOT 清理
□ 关闭网络 → 启动 → "离线"横幅 → 仍能查看已缓存 skill
□ 重启网络 → 横幅消失 → 新建/订阅恢复
```

### 覆盖率目标

- Rust skill 相关 ≥ 85%(dispatcher / extractor 必须 100%)
- 服务端 skills 模块 ≥ 80%
- E2E 100% 通过才能合并

---

## 11. 不在本期范围

- skill 内 SKILL.md 的 diff / 三方合并(ZIP 二进制)
- 组织空间订阅完整 UI(API 预留)
- skill 评分 / 标签 / 全文搜索
- skill 公开 marketplace / 评分 / 评论
- 客户端 skill 编辑器(只做"选本地目录打包上传",不做内嵌 markdown 编辑器)

---

## 12. 风险与缓解

| 风险 | 缓解 |
|---|---|
| ZIP 体积不可控膨胀 MinIO 成本 | 服务端 50MB 单 ZIP 上限 + 512MB 解压上限;配额策略后续增量 |
| worker 频繁轮询触发 GitHub 限流 | 6h 间隔 + 失败退避 + 按 skill 错峰 |
| 客户端分发到 harness 时误覆盖用户已有内容 | Pi 走"覆盖/保留"对话框,其他 harness 用原子 rename 不破坏 dest |
| 离线启动看到旧数据误以为丢数据 | 横幅明确"离线"状态 + 各 skill 显示"上次同步于 X" |
| name 全局唯一可能造成无法命名(常见名被占) | 服务端校验时给出明确冲突提示 + 推荐改名的建议列表 |
| 与组织重构 P3 的耦合 | 接口预留 `org_id` 参数,MVP 不实现订阅 UI,后端可独立先合 |
