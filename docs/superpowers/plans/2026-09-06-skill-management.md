# Skill 管理与分发 实施计划

> **修订说明**: 本计划初稿于设计文档定稿前编写,数据库类型、依赖组件与子任务边界与最新设计文档不一致。本版按 spec/2026-09-06-skill-management-design.md 重写。
>
> **范围拆分**: 本次实施聚焦 **agents-plus-server 后端**。客户端 (Tauri Rust + Next.js 前端) 由 agents-plus 团队按对等规范独立交付,不在本计划范围。客户端需要的 HTTP 契约在本计划中定义清楚,即可并行启动。

**Goal:** 在 agents-plus-server 中交付 Skill 集合服务端能力,包含元数据/版本/订阅三表、ZIP 二进制存储(MinIO)、4 路导入(本地/空 ZIP 上传/GitHub/skills.sh)、后台 worker 仅检测上游更新并写通知、个人空间首发(组织空间 API 预留)。

**Architecture:** 三表模型 `t_skills` / `t_skill_versions` / `t_skill_subscriptions` + MinIO 存 ZIP + `@Scheduled` worker 6h 轮询。worker 仅检测,不应用。客户端通过 REST 拉通知,手动触发下载 + 解压 + 分发流程(客户端职责)。

**Tech Stack(后端,严格对齐 AGENTS.md):**
- Spring Boot 4.1.1 / Java 17 / Spring MVC
- Spring Security 7 + OAuth2 Resource Server + JWT
- **PostgreSQL** + Flyway(`flyway-database-postgresql` 已存在,`flyway-core` 由 spring-boot-starter-flyway 引入)
- MyBatis-Plus Spring Boot 4 Starter + Lombok + Hutool
- MinIO Java SDK(对象存储)
- OkHttp(GitHub/skills.sh 上游拉取)

**前置参考:**
- 设计文档:`docs/superpowers/specs/2026-09-06-skill-management-design.md`
- cc-switch 参考:`D:\workspace\cc-switch\src-tauri\src\services\skill.rs`

---

## Phase 0: 基础设施

### Task 1: 添加 MinIO 与 OkHttp 依赖

**Files:**
- Modify: `D:/workspace/agents-plus-server/pom.xml`

**Step 1: 在 `<dependencies>` 内添加(按字母序插入)**

```xml
<dependency>
    <groupId>io.minio</groupId>
    <artifactId>minio</artifactId>
    <version>8.5.10</version>
</dependency>
<dependency>
    <groupId>com.squareup.okhttp3</groupId>
    <artifactId>okhttp</artifactId>
    <version>4.12.0</version>
</dependency>
```

**Step 2: 编译验证**

```bash
cd D:/workspace/agents-plus-server && mvn -q -DskipTests compile
```

Expected: BUILD SUCCESS

---

### Task 2: application.yml 添加 MinIO 与 skills 配置块

**Files:**
- Modify: `D:/workspace/agents-plus-server/src/main/resources/application.yaml`

**Step 1: 追加配置**

```yaml
minio:
  endpoint: ${MINIO_ENDPOINT:http://localhost:9000}
  access-key: ${MINIO_ACCESS_KEY:minioadmin}
  secret-key: ${MINIO_SECRET_KEY:minioadmin}
  bucket-skills: ${MINIO_BUCKET_SKILLS:agentsplus-skills}
  presigned-url-ttl-seconds: ${MINIO_PRESIGNED_URL_TTL:300}

skills:
  max-zip-bytes: 52428800          # 50 MB
  max-extract-bytes: 536870912     # 512 MB
  max-archive-entries: 10000
  max-file-bytes: 52428800         # 50 MB
  max-symlink-target-bytes: 4096   # 4 KB
  worker-poll-interval: PT6H       # ISO-8601 duration
  worker-enabled: ${SKILLS_WORKER_ENABLED:true}
  name-pattern: '^[a-z0-9][a-z0-9-]{0,63}$'
  max-source-url-length: 2048
  max-source-ref-length: 2048
  max-display-name-length: 256
  max-description-length: 4096
  max-changelog-length: 8192
```

---

## Phase 1: 数据模型与错误码

### Task 3: Flyway 迁移 - 三张表

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/resources/db/migration/V4__create_skill_tables.sql`

命名说明: V3 已被既有迁移占用 (`V3__rename_member_tables.sql`),新文件使用 V4。

**Step 1: 写入迁移文件**

```sql
-- t_skills
create table t_skills (
    id                     bigint primary key,
    name                   varchar(128) not null,
    display_name           varchar(256) null,
    description            text         null,
    source_type            varchar(32)  not null,
    source_url             text         null,
    source_ref             text         null,
    latest_version_id      bigint       null,
    owner_scope            varchar(16)  not null,
    owner_user_id          bigint       null,
    org_id                 bigint       null,
    created_by             bigint       not null,
    content_hash           varchar(64)  not null,
    latest_version         varchar(64)  null,
    has_update_available   boolean      not null default false,
    created_at             timestamptz  not null,
    updated_at             timestamptz  not null,
    deleted                boolean      not null default false,
    deleted_at             timestamptz  null,
    constraint ck_skills_source_type check (source_type in ('local','github','skills_sh','zip_upload')),
    constraint ck_skills_owner_scope check (owner_scope in ('personal','org'))
);
create unique index uq_skills_name_active on t_skills (name) where deleted = false;
create index idx_skills_owner_user on t_skills (owner_scope, owner_user_id) where deleted = false;
create index idx_skills_owner_org on t_skills (owner_scope, org_id) where deleted = false;
create index idx_skills_has_update on t_skills (has_update_available) where deleted = false;

-- t_skill_versions
create table t_skill_versions (
    id                 bigint primary key,
    skill_id           bigint       not null,
    version            varchar(64)  not null,
    minio_bucket       varchar(128) not null,
    minio_object_key   varchar(512) not null,
    size_bytes         bigint       not null,
    content_hash       varchar(64)  not null,
    changelog          text         null,
    source_meta        jsonb        null,
    published_by       bigint       not null,
    published_at       timestamptz  not null,
    created_at         timestamptz  not null,
    updated_at         timestamptz  not null,
    deleted            boolean      not null default false,
    deleted_at         timestamptz  null
);
create unique index uq_skill_versions_skill_version on t_skill_versions (skill_id, version) where deleted = false;
create index idx_skill_versions_skill_published on t_skill_versions (skill_id, published_at desc);

-- t_skill_subscriptions
create table t_skill_subscriptions (
    id              bigint primary key,
    user_id         bigint       not null,
    skill_id        bigint       not null,
    source          varchar(16)  not null,
    subscribed_at   timestamptz  not null,
    created_at      timestamptz  not null,
    updated_at      timestamptz  not null,
    deleted         boolean      not null default false,
    deleted_at      timestamptz  null,
    constraint ck_skill_subscriptions_source check (source in ('personal_create','org_subscribe','import'))
);
create unique index uq_skill_subscriptions_user_skill on t_skill_subscriptions (user_id, skill_id) where deleted = false;
create index idx_skill_subscriptions_user on t_skill_subscriptions (user_id);
```

---

### Task 4: ErrorCode 增加 skill 错误码

**Files:**
- Modify: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/common/error/ErrorCode.java`

**Step 1: 在枚举末尾追加**

```java
SKILL_NOT_FOUND(40450, "skill 不存在"),
SKILL_FORBIDDEN(40350, "无权访问该 skill"),
SKILL_NAME_INVALID(40050, "skill 名称格式不合法"),
SKILL_NAME_CONFLICT(40950, "skill 名称已被占用"),
SKILL_VERSION_EXISTS(40951, "同 skill 该 version 已存在"),
SKILL_SOURCE_FETCH_FAILED(50250, "上游 skill 拉取失败"),
SKILL_ZIP_INVALID(40051, "ZIP 包非法(缺 SKILL.md 或解压失败)"),
SKILL_ZIP_TOO_LARGE(41350, "ZIP 包超过大小限制"),
SKILL_ZIP_FILE_TOO_LARGE(41351, "ZIP 内单文件超过大小限制"),
SKILL_ZIP_UNSAFE_PATH(40052, "ZIP 含非法路径"),
SKILL_ZIP_UNSAFE_SYMLINK(40053, "ZIP 含非法符号链接"),
SKILL_VERSION_NOT_FOUND(40451, "skill 版本不存在"),
SKILL_DOWNLOAD_URL_UNAVAILABLE(50251, "skill 下载链接生成失败");
```

---

## Phase 2: 实体与 Mapper

### Task 5: SkillEntity / SkillVersionEntity / SkillSubscriptionEntity

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/entity/SkillEntity.java`
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/entity/SkillVersionEntity.java`
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/entity/SkillSubscriptionEntity.java`

字段与 V4 迁移完全一致,使用:
- `@TableId(value = "id", type = IdType.ASSIGN_ID)`
- `@TableLogic` 标记 `deleted`
- `sourceMeta` 用 `JsonbTypeHandler`(参照 RevisionEntity.metadataJson)
- Lombok: `@Getter @Setter @Builder @NoArgsConstructor @AllArgsConstructor`
- 不使用 `@Data`,Entity 不承载业务逻辑

### Task 6: Mapper 接口与 XML

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/mapper/SkillMapper.java`
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/mapper/SkillVersionMapper.java`
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/mapper/SkillSubscriptionMapper.java`
- Create: `D:/workspace/agents-plus-server/src/main/resources/mapper/SkillMapper.xml`
- Create: `D:/workspace/agents-plus-server/src/main/resources/mapper/SkillVersionMapper.xml`
- Create: `D:/workspace/agents-plus-server/src/main/resources/mapper/SkillSubscriptionMapper.xml`

**Mapper 必备方法:**

```java
// SkillMapper
SkillEntity selectById(@Param("id") Long id);
SkillEntity selectByIdForUpdate(@Param("id") Long id);
SkillEntity selectByName(@Param("name") String name);
List<SkillEntity> selectVisible(@Param("userId") Long userId,
                                @Param("scope") String scope,
                                @Param("q") String q);
List<SkillEntity> selectPendingUpdateByUser(@Param("userId") Long userId);
List<SkillEntity> selectUpstreamPollable();
int insertSkill(SkillEntity entity);
int updateSkill(SkillEntity entity);
int updateHasUpdateAvailable(@Param("id") Long id,
                              @Param("flag") boolean flag,
                              @Param("latestVersion") String latestVersion,
                              @Param("latestVersionId") Long latestVersionId,
                              @Param("updatedAt") Instant updatedAt);

// SkillVersionMapper
SkillVersionEntity selectById(@Param("id") Long id);
SkillVersionEntity selectBySkillIdAndVersion(@Param("skillId") Long skillId,
                                             @Param("version") String version);
List<SkillVersionEntity> selectBySkillId(@Param("skillId") Long skillId);
int insertVersion(SkillVersionEntity entity);

// SkillSubscriptionMapper
SkillSubscriptionEntity selectActive(@Param("userId") Long userId,
                                     @Param("skillId") Long skillId);
List<SkillSubscriptionEntity> selectByUser(@Param("userId") Long userId);
List<SkillSubscriptionEntity> selectBySkill(@Param("skillId") Long skillId);
int insertSubscription(SkillSubscriptionEntity entity);
int softDeleteSubscription(@Param("id") Long id,
                           @Param("updatedAt") Instant updatedAt,
                           @Param("deletedAt") Instant deletedAt);
```

**selectVisible**(用于 `GET /api/v1/skills`)语义:
- scope=personal: `owner_scope='personal' AND (owner_user_id = #{userId} OR EXISTS 订阅表)`
- scope=org: `owner_scope='org' AND org_id = ?`
- q: `name ILIKE ? OR description ILIKE ?`

**XML 强制显式字段,禁用 `*`**。软删条件由 MyBatis-Plus `@TableLogic` 自动加 `deleted = false`。

---

## Phase 3: MinIO 客户端

### Task 7: MinIO 配置类

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/common/config/MinioProperties.java`
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/common/config/MinioConfig.java`

**MinioProperties** 用 `@ConfigurationProperties("minio")`,字段:endpoint, accessKey, secretKey, bucketSkills, presignedUrlTtlSeconds。

**MinioConfig** 注册 `MinioClient` Bean,启动时调用 `makeBucket(bucketSkills)` 幂等创建。

### Task 8: SkillStorage - MinIO 封装

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/service/SkillStorage.java`

**接口契约:**

```java
public interface SkillStorage {
    /** 上传 ZIP,返回 (bucket, objectKey, sizeBytes, sha256Hex)。 */
    StoredSkillZip upload(String skillName, String version, InputStream content, long sizeBytes) throws IOException;
    /** 生成预签名下载 URL(TTL 由配置决定)。 */
    String presignDownload(String bucket, String objectKey);
    /** 删除对象(用于硬删 skill)。 */
    void delete(String bucket, String objectKey);
}
```

`StoredSkillZip` 记录 (bucket, objectKey, sizeBytes, contentHash)。

**实现 `DefaultSkillStorage`**:
- objectKey = `{skillName}/{version}.zip`
- 上传时 Hutool `DigestUtil.sha256Hex` 二次校验与 V4 写入一致
- 失败抛 `BusinessException(SKILL_DOWNLOAD_URL_UNAVAILABLE / INTERNAL_ERROR)`
- 单元测试 `SkillStorageTest` 用 MinIO Testcontainers 不可行,直接对 `MinioClient` mock

---

## Phase 4: ZIP 校验

### Task 9: SkillZipValidator

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/service/SkillZipValidator.java`

**职责**: 校验上传的 ZIP 安全阈值。

**签名:**
```java
public void validate(InputStream zipStream, SkillsProperties props) throws IOException;
```

**强制规则:**
| 检查 | 阈值 | 错误码 |
|---|---|---|
| 含 SKILL.md | 必须存在顶层 | SKILL_ZIP_INVALID |
| 顶层目录数 | 1 | SKILL_ZIP_INVALID |
| 总条目数 | ≤ 10000 | SKILL_ZIP_TOO_LARGE |
| 解压后总字节 | ≤ 512MB | SKILL_ZIP_TOO_LARGE |
| 单文件 size | ≤ 50MB | SKILL_ZIP_FILE_TOO_LARGE |
| 路径穿越 | 无 `..` 与绝对路径 | SKILL_ZIP_UNSAFE_PATH |
| 符号链接 target | ≤ 4KB 且无 `..` | SKILL_ZIP_UNSAFE_SYMLINK |
| 压缩包大小 | ≤ 50MB | SKILL_ZIP_TOO_LARGE |

**测试** `SkillZipValidatorTest` 覆盖: 合法 ZIP / 缺 SKILL.md / 多顶层 / 10001 条目 / 含 ../ 路径 / 含 symlink target > 4KB / 单文件 > 50MB / 大小超限。

---

## Phase 5: DTO

### Task 10: SkillDtos

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/dto/SkillDtos.java`

**必备 record:**

| DTO | 用途 | 关键字段 |
|---|---|---|
| `CreateSkillRequest` | POST /skills | name(@Pattern), displayName, description, sourceType(@Pattern), sourceUrl, sourceRef |
| `UpdateSkillRequest` | PATCH /skills/{id} | displayName, description |
| `SkillResponse` | 列表/详情 | id(String), name, displayName, description, sourceType, sourceUrl, sourceRef, ownerScope, ownerUserId, orgId, latestVersionId, latestVersion, contentHash, hasUpdateAvailable, createdAt, updatedAt |
| `SkillVersionResponse` | 版本详情 | id(String), skillId(String), version, sizeBytes, contentHash, changelog, sourceMeta(JsonNode), publishedBy(String), publishedAt, downloadUrl |
| `CreateSkillVersionRequest` | multipart 元数据 | version, changelog |
| `SkillImportGithubRequest` | /import/github | repo(@NotBlank), ref, path |
| `SkillImportSkillsShRequest` | /import/skills-sh | slug(@NotBlank) |
| `SkillCheckUpdateResponse` | check-update 异步 | taskId, status(PENDING/RUNNING/DONE/FAILED) |

`@Pattern` 校验 name(在 `SkillsProperties.namePattern` 中配置)。所有 `@Valid` 由 Controller 加。

---

## Phase 6: Repository

### Task 11: SkillRepository / SkillVersionRepository / SkillSubscriptionRepository

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/repository/SkillRepository.java`
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/repository/SkillVersionRepository.java`
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/repository/SkillSubscriptionRepository.java`

**Repository 薄封装**,只暴露:
- `findById(Long)` → Optional
- `findByIdForUpdate(Long)` → 加行锁
- `findByName(String)` → Optional
- `pageVisible(userId, scope, q, page, size)` → IPage
- `findPendingUpdatesByUser(userId)` → List
- `findUpstreamPollable()` → List
- `save(SkillEntity)` → SkillEntity
- `update(SkillEntity)`
- `markHasUpdate(id, flag, latestVersion, latestVersionId)`

Subscription Repository:
- `findActive(userId, skillId)` → Optional
- `findByUser(userId)` → List
- `findBySkill(skillId)` → List
- `save(SkillSubscriptionEntity)`
- `softDelete(id)`

Version Repository:
- `findById(Long)` → Optional
- `findBySkillIdAndVersion(skillId, version)` → Optional
- `findBySkillId(skillId)` → List
- `save(SkillVersionEntity)`
- `latest(skillId)` → Optional(`orderBy published_at desc limit 1`)

---

## Phase 7: Service 层

### Task 12: SkillService + SkillServiceImpl

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/service/SkillService.java`
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/service/impl/SkillServiceImpl.java`

**SkillService 接口:**
```java
public interface SkillService {
    SkillResponse create(CreateSkillRequest req);
    SkillResponse get(String id);
    SkillResponse update(String id, UpdateSkillRequest req);
    void delete(String id);     // 软删,owner_scope=personal 且 无订阅者时硬删
    PageResponse<SkillResponse> list(String scope, String orgId, String q, long page, long size);
    List<SkillResponse> pendingUpdates();
    void markUpdateSeen(String id);   // 用户点过升级后清零
}
```

**SkillServiceImpl 关键点:**
- `@Transactional`,构造器注入(包含 `AuthorizationService`, `SkillRepository`, `AuditService`)
- 创建: `requireActiveDevice`, `SkillRepository.findByName` 已存在 → `SKILL_NAME_CONFLICT`, `namePattern` 校验, owner_scope 默认 personal, owner_user_id = currentUserId
- get: 不存在 / 不可见 → `SKILL_NOT_FOUND`; 仅 owner / 订阅者可见
- list: `scope=personal` 查自创 + 订阅; `scope=org` 需 org 成员(暂以接口预留,owner=org 时校验;组织重构 P3 接完整权限)
- update: 仅 owner 可改; 无订阅者 + personal + owner → 允许硬删,先调 SkillStorage.delete + SkillVersionRepository.findBySkillId + 批量删 MinIO 对象
- pendingUpdates: `has_update_available = true AND (owner OR subscribed)`

### Task 13: SkillVersionService + SkillVersionServiceImpl

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/service/SkillVersionService.java`
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/service/impl/SkillVersionServiceImpl.java`

**接口方法:**
```java
public interface SkillVersionService {
    List<SkillVersionResponse> list(String skillId);
    SkillVersionResponse get(String skillId, String version);
    SkillVersionResponse publish(String skillId, MultipartFile zip, CreateSkillVersionRequest meta);
}
```

**publish 关键流程:**
1. `requireActiveDevice` + `requireSkillOwner(skillId)`
2. `MultipartFile.getSize() > skills.maxZipBytes` → `SKILL_ZIP_TOO_LARGE`
3. `SkillZipValidator.validate(zipStream, props)`
4. `SkillRepository.findByIdForUpdate(skillId)` + 锁
5. `SkillVersionRepository.findBySkillIdAndVersion` 已存在 → `SKILL_VERSION_EXISTS`
6. `SkillStorage.upload(name, version, zipStream, size)` → StoredSkillZip
7. 写 `t_skill_versions`(含 sourceMeta `{"clientFilename":"...","clientSize":...}`)
8. `SkillRepository.update` 把 `latestVersionId`, `latestVersion`, `contentHash`, `hasUpdateAvailable=false`, `updatedAt=now` 写入 t_skills
9. 返回 `SkillVersionResponse` 含 `presignDownload` URL(TTL 300s)

### Task 14: SkillImportService + SkillImportServiceImpl

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/service/SkillImportService.java`
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/service/impl/SkillImportServiceImpl.java`

**接口方法:**
```java
public interface SkillImportService {
    SkillResponse importFromGithub(SkillImportGithubRequest req);
    SkillResponse importFromSkillsSh(SkillImportSkillsShRequest req);
    SkillResponse importFromZip(MultipartFile zip, String name) throws IOException;
}
```

**OkHttp 客户端** (单例注入 `OkHttpClient`, TTL 30s, max 3 retries with exponential backoff):

**importFromGithub**:
1. `https://api.github.com/repos/{owner}/{repo}/releases/latest` 或指定 tag
2. 取 zipball_url → 下载到临时文件
3. 解析 `SKILL.md` frontmatter 取 name / displayName / description
4. 复用 `SkillService.create` + `SkillVersionService.publish`
5. 任一步失败 → `SKILL_SOURCE_FETCH_FAILED`

**importFromSkillsSh**:
1. `https://skills.sh/{slug}` HTML 抓取 → 解析 GitHub repo 链接
2. 退化为 `importFromGithub`
3. 当前实现抛 `SKILL_SOURCE_FETCH_FAILED` 留 TODO(附录 B 已声明)

**importFromZip**:
1. `SkillZipValidator.validate`
2. 解析 SKILL.md frontmatter
3. 调 `SkillService.create`(`source_type = zip_upload`) + `SkillVersionService.publish`

### Task 15: SkillSubscriptionService + SkillSubscriptionServiceImpl

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/service/SkillSubscriptionService.java`
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/service/impl/SkillSubscriptionServiceImpl.java`

**接口方法:**
```java
public interface SkillSubscriptionService {
    void subscribe(String skillId);  // 写 personal_create / import
    void unsubscribe(String skillId); // 仅本人订阅可取消
    List<SkillResponse> mySubscriptions();
}
```

---

## Phase 8: Controller 层

### Task 16: SkillController / SkillVersionController / SkillImportController / SkillSubscriptionController

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/controller/SkillController.java`
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/controller/SkillVersionController.java`
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/controller/SkillImportController.java`
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/controller/SkillSubscriptionController.java`

**统一前置:** 全部接口已默认 `authenticated`(`SecurityFilterChain` 现有配置)。

**路由映射(spec 5):**

| 方法 | 路径 | Controller 方法 |
|---|---|---|
| GET | `/api/v1/skills?scope=&org_id=&q=&page=&size=` | `SkillController.list` |
| POST | `/api/v1/skills` | `SkillController.create` |
| GET | `/api/v1/skills/{id}` | `SkillController.get` |
| PATCH | `/api/v1/skills/{id}` | `SkillController.update` |
| DELETE | `/api/v1/skills/{id}` | `SkillController.delete` |
| GET | `/api/v1/skills/{id}/versions` | `SkillVersionController.list` |
| POST | `/api/v1/skills/{id}/versions` (multipart) | `SkillVersionController.publish` |
| GET | `/api/v1/skills/{id}/versions/{version}` | `SkillVersionController.get` |
| POST | `/api/v1/skills/{id}/check-update` | `SkillController.checkUpdate` |
| GET | `/api/v1/skills/{id}/check-update/{taskId}` | `SkillController.checkUpdateStatus` |
| POST | `/api/v1/skills/import/github` | `SkillImportController.fromGithub` |
| POST | `/api/v1/skills/import/skills-sh` | `SkillImportController.fromSkillsSh` |
| POST | `/api/v1/skills/import/zip` (multipart) | `SkillImportController.fromZip` |
| GET | `/api/v1/skills/search?q=` | `SkillController.search` |
| POST | `/api/v1/skills/{id}/subscribe` | `SkillSubscriptionController.subscribe` |
| DELETE | `/api/v1/skills/{id}/subscribe` | `SkillSubscriptionController.unsubscribe` |
| GET | `/api/v1/skills/notifications` | `SkillSubscriptionController.notifications` |
| GET | `/api/v1/skills/pending-updates` | `SkillSubscriptionController.pendingUpdates` |
| POST | `/api/v1/skills/{id}/seen` | `SkillSubscriptionController.markSeen` |

所有 `@PathVariable` 用 String 接收雪花 ID,在 Service 内做 `Long.parseLong`。

---

## Phase 9: 后台 Worker

### Task 17: SkillUpdateWorker

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/service/SkillUpdateWorker.java`

**关键点:**
- `@Component`
- `@Scheduled(fixedDelayString = "${skills.worker-poll-interval}")`
- `@ConditionalOnProperty(name = "skills.worker-enabled", havingValue = "true", matchIfMissing = true)`
- 开启 `@EnableScheduling`(`@SpringBootApplication` 加注解或单独 `@Configuration`)

**run() 流程:**
1. `SkillRepository.findUpstreamPollable()` 拿 source_type IN ('github','skills_sh') 的 skill
2. 对每个 skill 解析 sourceUrl/sourceRef(简单 JSON)
3. 调 GitHub `/repos/{owner}/{repo}/tags` 拿最新 tag → 与 `latestVersion` 比对
4. 有变化 → `SkillRepository.markHasUpdate(id, true, newTag, null)`(version_id 留 null 待 publish 时写入)
5. source_type=local/zip_upload → 跳过(已在 SQL 里过滤)

异常: 单 skill 失败 → log + continue,不让一次失败中断整轮询。

### Task 18: 启用 @EnableScheduling

**Files:**
- Modify: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/AgentsPlusServerApplication.java`

加 `@EnableScheduling`.

---

## Phase 10: 测试

### Task 19: Service 单元测试

**Files:**
- Create: `D:/workspace/agents-plus-server/src/test/java/com/krmeow/agentsplus/skill/SkillServiceTest.java`
- Create: `D:/workspace/agents-plus-server/src/test/java/com/krmeow/agentsplus/skill/SkillVersionServiceTest.java`
- Create: `D:/workspace/agents-plus-server/src/test/java/com/krmeow/agentsplus/skill/SkillZipValidatorTest.java`
- Create: `D:/workspace/agents-plus-server/src/test/java/com/krmeow/agentsplus/skill/SkillSubscriptionServiceTest.java`
- Create: `D:/workspace/agents-plus-server/src/test/java/com/krmeow/agentsplus/skill/SkillUpdateWorkerTest.java`

**SkillServiceTest 覆盖:**
- create 成功 → 返回 id(string)、owner_user_id=current
- create 重名 → SKILL_NAME_CONFLICT
- get 不可见 → SKILL_NOT_FOUND
- delete owner + 无订阅者 → 软删 / 物理删
- list scope=personal → 仅自创 + 订阅

**SkillVersionServiceTest 覆盖:**
- publish 正常 → SkillVersionResponse 含 presignedUrl
- publish 超 50MB → SKILL_ZIP_TOO_LARGE
- publish 缺 SKILL.md → SKILL_ZIP_INVALID
- publish 同 version → SKILL_VERSION_EXISTS

**SkillZipValidatorTest 覆盖:** 合法 / 缺 SKILL.md / 多顶层 / 10001 条目 / 含 ../ / 含 symlink >4KB / 单文件 >50MB

**SkillSubscriptionServiceTest 覆盖:**
- 订阅成功 → 写入
- 取消 → 软删
- 取消他人订阅 → SKILL_FORBIDDEN

**SkillUpdateWorkerTest 覆盖:**
- source_type=github + tag 变化 → markHasUpdate(true, tag)
- source_type=github + tag 未变 → 不写
- source_type=local/zip_upload → 不调用 upstreamFetch

---

### Task 20: Controller 集成测试

**Files:**
- Create: `D:/workspace/agents-plus-server/src/test/java/com/krmeow/agentsplus/skill/SkillControllerTest.java`
- Create: `D:/workspace/agents-plus-server/src/test/java/com/krmeow/agentsplus/skill/SkillImportControllerTest.java`
- Create: `D:/workspace/agents-plus-server/src/test/java/com/krmeow/agentsplus/skill/SkillSubscriptionControllerTest.java`

使用 `@SpringBootTest(webEnvironment = MOCK)` + `MockMvc` + `@MockBean` 替换 SkillStorage 和 OkHttp。

**SkillControllerTest 覆盖:**
- POST /skills 创建成功 → 返回 snowflake string id
- POST /skills 重名 → SKILL_NAME_CONFLICT
- GET /skills?scope=personal 仅列自创 + 订阅
- DELETE 软删 → 列表不可见
- POST /skills/{id}/versions multipart → Service 接收 ZIP + meta
- 上传 >50MB → SKILL_ZIP_TOO_LARGE

**SkillImportControllerTest 覆盖:**
- POST /skills/import/github → Mock GitHub 拉取 → 成功
- POST /skills/import/github 失败 → SKILL_SOURCE_FETCH_FAILED

**SkillSubscriptionControllerTest 覆盖:**
- POST /subscribe → 200
- DELETE /subscribe → 200
- 401 缺失 token → AUTH_UNAUTHORIZED

### Task 21: 配置 application-test.yaml

修改 `src/test/resources/application-test.yaml`,加入:

```yaml
minio:
  endpoint: http://localhost:0
  access-key: test
  secret-key: test
  bucket-skills: agentsplus-skills-test
  presigned-url-ttl-seconds: 60
skills:
  max-zip-bytes: 52428800
  max-extract-bytes: 536870912
  max-archive-entries: 10000
  max-file-bytes: 52428800
  max-symlink-target-bytes: 4096
  worker-enabled: false
  worker-poll-interval: PT6H
```

---

## Phase 11: 集成验证

### Task 22: mvn clean test 与 mvn package

**Step 1:** `cd D:/workspace/agents-plus-server && mvn clean test` → BUILD SUCCESS
**Step 2:** `mvn package -DskipTests` → BUILD SUCCESS
**Step 3:** 修复任何编译/测试失败直至全部通过

---

## 附录 A: 文件结构总览

```
agents-plus-server/
├── pom.xml                                          # +minio, +okhttp
├── src/main/resources/
│   ├── application.yaml                              # +minio, +skills
│   └── db/migration/
│       └── V4__create_skill_tables.sql              # 3 张表
└── src/main/java/com/krmeow/agentsplus/
    ├── AgentsPlusServerApplication.java              # +@EnableScheduling
    ├── common/config/
    │   ├── MinioProperties.java
    │   ├── MinioConfig.java
    │   └── SkillsProperties.java
    ├── common/error/ErrorCode.java                  # +14 skill codes
    ├── controller/
    │   ├── SkillController.java
    │   ├── SkillVersionController.java
    │   ├── SkillImportController.java
    │   └── SkillSubscriptionController.java
    ├── dto/SkillDtos.java
    ├── entity/
    │   ├── SkillEntity.java
    │   ├── SkillVersionEntity.java
    │   └── SkillSubscriptionEntity.java
    ├── mapper/
    │   ├── SkillMapper.java
    │   ├── SkillVersionMapper.java
    │   └── SkillSubscriptionMapper.java
    ├── repository/
    │   ├── SkillRepository.java
    │   ├── SkillVersionRepository.java
    │   └── SkillSubscriptionRepository.java
    ├── service/
    │   ├── SkillService.java
    │   ├── SkillVersionService.java
    │   ├── SkillImportService.java
    │   ├── SkillSubscriptionService.java
    │   ├── SkillStorage.java
    │   ├── SkillZipValidator.java
    │   └── SkillUpdateWorker.java
    └── service/impl/
        ├── SkillServiceImpl.java
        ├── SkillVersionServiceImpl.java
        ├── SkillImportServiceImpl.java
        └── SkillSubscriptionServiceImpl.java
```

---

## 附录 B: 已知遗留 / 后续

| 项 | 说明 |
|---|---|
| `skills.sh` HTML 解析 | 当前抛 `SKILL_SOURCE_FETCH_FAILED`,后续增量 |
| SKILL.md frontmatter 在 `t_skills` 解析 | 当前 `importFromZip` 解析 frontmatter,简单 create 时不解析,后续统一 |
| Worker 写 `t_notifications` 表 | 当前仅置 `has_update_available=true`,通知端点读它 |
| 组织空间订阅完整 API | 接口预留 `?org_id=` 参数,MVP 不实现订阅,后端先合 |
| skill 评分 / 标签 / 全文搜索 | 后续 |
| harness override settings UI | 客户端 |
| E2E 自动化 | 手动 checklist |
