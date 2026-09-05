# Skill 管理与分发 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 agents-plus 中交付 Skill 集合的服务端存储、客户端本地 SSOT + 多 harness 分发能力,与 AGENTS.md / CLAUDE.md 走同一套同步模型。

**Architecture:** 服务端 `t_skills` / `t_skill_versions` / `t_skill_subscriptions` 三表 + MinIO 存 ZIP + 后台 worker 检测上游更新;客户端本地 SSOT `~/.agents-plus/skills/` + `skills-state.json` 启用矩阵 + Tauri IPC + 多 harness adapter(symlink / copy / auto)。worker 只检测不应用,用户手动确认升级。

**Tech Stack:**
- 后端: Spring Boot + MyBatis-Plus(Lombok、`@TableLogic`、`@TableId(ASSIGN_ID)` 雪花)+ Flyway + MinIO Java SDK + OkHttp(GitHub/skills.sh 拉取)
- 客户端 Rust: Tauri 2 + `zip` + `reqwest` + `serde_json` + `tokio::sync::RwLock` + `windows-sys`(已存在)
- 客户端前端: Next.js 16 + React 19 + zustand(persist)+ Tailwind 4 + shadcn/ui

**前置参考:**
- 设计文档:`docs/superpowers/specs/2026-09-06-skill-management-design.md`
- cc-switch 参考:`D:\workspace\cc-switch\src-tauri\src\services\skill.rs`

---

## Phase 0: 基础设施

### Task 1: 后端添加 MinIO 与 Flyway 依赖

**Files:**
- Modify: `D:/workspace/agents-plus-server/pom.xml`

- [ ] **Step 1: 在 pom.xml 添加 MinIO 与 Flyway 依赖**

在 `<dependencies>` 内添加(位置按字母序插入):

```xml
<dependency>
    <groupId>io.minio</groupId>
    <artifactId>minio</artifactId>
    <version>8.5.10</version>
</dependency>
<dependency>
    <groupId>org.flywaydb</groupId>
    <artifactId>flyway-core</artifactId>
</dependency>
<dependency>
    <groupId>org.flywaydb</groupId>
    <artifactId>flyway-mysql</artifactId>
</dependency>
<dependency>
    <groupId>com.squareup.okhttp3</groupId>
    <artifactId>okhttp</artifactId>
    <version>4.12.0</version>
</dependency>
```

- [ ] **Step 2: 编译验证**

Run: `cd D:/workspace/agents-plus-server && mvn -q -DskipTests compile`
Expected: BUILD SUCCESS

- [ ] **Step 3: 提交**

```bash
cd D:/workspace/agents-plus-server && \
git add pom.xml && \
git commit -m "build(server): add MinIO, Flyway, OkHttp dependencies for skills feature"
```

---

### Task 2: 后端配置 MinIO 与 skills 业务配置

**Files:**
- Modify: `D:/workspace/agents-plus-server/src/main/resources/application.yml`

- [ ] **Step 1: 添加 MinIO 与 skills 配置块**

在 application.yml 末尾追加:

```yaml
minio:
  endpoint: ${MINIO_ENDPOINT:http://localhost:9000}
  access-key: ${MINIO_ACCESS_KEY:minioadmin}
  secret-key: ${MINIO_SECRET_KEY:minioadmin}
  bucket-skills: agentsplus-skills
  presigned-url-ttl-seconds: 300

skills:
  max-zip-bytes: 52428800          # 50 MB
  max-extract-bytes: 536870912     # 512 MB
  max-archive-entries: 10000
  max-file-bytes: 52428800         # 50 MB
  max-symlink-target-bytes: 4096   # 4 KB
  worker-poll-interval: PT6H       # ISO-8601 duration
  worker-enabled: true
```

- [ ] **Step 2: 提交**

```bash
cd D:/workspace/agents-plus-server && \
git add src/main/resources/application.yml && \
git commit -m "feat(server): add MinIO and skills config properties"
```

---

### Task 3: 客户端添加 zip 依赖

**Files:**
- Modify: `D:/workspace/agents-plus/src-tauri/Cargo.toml`

- [ ] **Step 1: 在 [dependencies] 添加 zip 与 walkdir**

```toml
zip = { version = "2.2", default-features = false, features = ["deflate"] }
walkdir = "2.5"
```

`serde_json` 已存在,确认版本 ≥ 1.0。

- [ ] **Step 2: 编译验证**

Run: `cd D:/workspace/agents-plus/src-tauri && cargo check`
Expected: Finished `dev` profile

- [ ] **Step 3: 提交**

```bash
cd D:/workspace/agents-plus && \
git add src-tauri/Cargo.toml src-tauri/Cargo.lock && \
git commit -m "build(client): add zip and walkdir for skill extraction"
```

---

## Phase 1: 后端数据模型

### Task 4: 创建 t_skills 实体

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/entity/SkillEntity.java`

- [ ] **Step 1: 写实体**

```java
package com.krmeow.agentsplus.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("t_skills")
public class SkillEntity {
    @TableId(value = "id", type = IdType.ASSIGN_ID)
    private Long id;
    private String name;
    private String displayName;
    private String description;
    private String sourceType;
    private String sourceUrl;
    private String sourceRef;
    private Long latestVersionId;
    private String ownerScope;
    private Long ownerUserId;
    private Long orgId;
    private Long createdBy;
    private String contentHash;
    private Boolean hasUpdateAvailable;
    @TableLogic
    private Boolean deleted;
    private Instant createdAt;
    private Instant updatedAt;
    private Instant deletedAt;
}
```

- [ ] **Step 2: 编译**

Run: `cd D:/workspace/agents-plus-server && mvn -q -DskipTests compile`
Expected: BUILD SUCCESS

- [ ] **Step 3: 提交**

```bash
cd D:/workspace/agents-plus-server && \
git add src/main/java/com/krmeow/agentsplus/entity/SkillEntity.java && \
git commit -m "feat(server): add SkillEntity for t_skills"
```

---

### Task 5: 创建 t_skill_versions 实体

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/entity/SkillVersionEntity.java`

- [ ] **Step 1: 写实体**

```java
package com.krmeow.agentsplus.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("t_skill_versions")
public class SkillVersionEntity {
    @TableId(value = "id", type = IdType.ASSIGN_ID)
    private Long id;
    private Long skillId;
    private String version;
    private String minioBucket;
    private String minioObjectKey;
    private Long sizeBytes;
    private String contentHash;
    private String changelog;
    private String sourceMeta;
    private Long publishedBy;
    private Instant publishedAt;
    @TableLogic
    private Boolean deleted;
    private Instant createdAt;
    private Instant updatedAt;
    private Instant deletedAt;
}
```

- [ ] **Step 2: 编译 + 提交**

```bash
cd D:/workspace/agents-plus-server && \
mvn -q -DskipTests compile && \
git add src/main/java/com/krmeow/agentsplus/entity/SkillVersionEntity.java && \
git commit -m "feat(server): add SkillVersionEntity for t_skill_versions"
```

---

### Task 6: 创建 t_skill_subscriptions 实体

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/entity/SkillSubscriptionEntity.java`

- [ ] **Step 1: 写实体**

```java
package com.krmeow.agentsplus.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("t_skill_subscriptions")
public class SkillSubscriptionEntity {
    @TableId(value = "id", type = IdType.ASSIGN_ID)
    private Long id;
    private Long userId;
    private Long skillId;
    private String source;
    private Instant subscribedAt;
    @TableLogic
    private Boolean deleted;
    private Instant createdAt;
    private Instant updatedAt;
    private Instant deletedAt;
}
```

- [ ] **Step 2: 编译 + 提交**

```bash
cd D:/workspace/agents-plus-server && \
mvn -q -DskipTests compile && \
git add src/main/java/com/krmeow/agentsplus/entity/SkillSubscriptionEntity.java && \
git commit -m "feat(server): add SkillSubscriptionEntity"
```

---

### Task 7: Mapper 接口

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/mapper/SkillMapper.java`
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/mapper/SkillVersionMapper.java`
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/mapper/SkillSubscriptionMapper.java`

- [ ] **Step 1: 三个 Mapper**

```java
// SkillMapper.java
package com.krmeow.agentsplus.mapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.krmeow.agentsplus.entity.SkillEntity;
import org.apache.ibatis.annotations.Mapper;
@Mapper
public interface SkillMapper extends BaseMapper<SkillEntity> {}
```

```java
// SkillVersionMapper.java
package com.krmeow.agentsplus.mapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.krmeow.agentsplus.entity.SkillVersionEntity;
import org.apache.ibatis.annotations.Mapper;
@Mapper
public interface SkillVersionMapper extends BaseMapper<SkillVersionEntity> {}
```

```java
// SkillSubscriptionMapper.java
package com.krmeow.agentsplus.mapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.krmeow.agentsplus.entity.SkillSubscriptionEntity;
import org.apache.ibatis.annotations.Mapper;
@Mapper
public interface SkillSubscriptionMapper extends BaseMapper<SkillSubscriptionEntity> {}
```

- [ ] **Step 2: 编译 + 提交**

```bash
cd D:/workspace/agents-plus-server && \
mvn -q -DskipTests compile && \
git add src/main/java/com/krmeow/agentsplus/mapper/SkillMapper.java \
        src/main/java/com/krmeow/agentsplus/mapper/SkillVersionMapper.java \
        src/main/java/com/krmeow/agentsplus/mapper/SkillSubscriptionMapper.java && \
git commit -m "feat(server): add SkillMapper / SkillVersionMapper / SkillSubscriptionMapper"
```

---

### Task 8: Flyway 迁移脚本

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/resources/db/migration/V20260906_01__create_t_skills.sql`
- Create: `D:/workspace/agents-plus-server/src/main/resources/db/migration/V20260906_02__create_t_skill_versions.sql`
- Create: `D:/workspace/agents-plus-server/src/main/resources/db/migration/V20260906_03__create_t_skill_subscriptions.sql`

- [ ] **Step 1: t_skills DDL**

```sql
CREATE TABLE t_skills (
    id BIGINT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    display_name VARCHAR(256) NULL,
    description TEXT NULL,
    source_type VARCHAR(32) NOT NULL,
    source_url TEXT NULL,
    source_ref TEXT NULL,
    latest_version_id BIGINT NULL,
    owner_scope VARCHAR(16) NOT NULL,
    owner_user_id BIGINT NULL,
    org_id BIGINT NULL,
    created_by BIGINT NOT NULL,
    content_hash CHAR(64) NULL,
    has_update_available TINYINT(1) NOT NULL DEFAULT 0,
    deleted TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    deleted_at DATETIME(3) NULL,
    UNIQUE KEY uk_skills_name (name),
    KEY idx_skills_owner_personal (owner_scope, owner_user_id),
    KEY idx_skills_owner_org (owner_scope, org_id),
    KEY idx_skills_list (deleted, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- [ ] **Step 2: t_skill_versions DDL**

```sql
CREATE TABLE t_skill_versions (
    id BIGINT PRIMARY KEY,
    skill_id BIGINT NOT NULL,
    version VARCHAR(64) NOT NULL,
    minio_bucket VARCHAR(128) NOT NULL,
    minio_object_key VARCHAR(512) NOT NULL,
    size_bytes BIGINT NOT NULL,
    content_hash CHAR(64) NOT NULL,
    changelog TEXT NULL,
    source_meta TEXT NULL,
    published_by BIGINT NOT NULL,
    published_at DATETIME(3) NOT NULL,
    deleted TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    deleted_at DATETIME(3) NULL,
    UNIQUE KEY uk_skill_versions (skill_id, version),
    KEY idx_skill_versions_list (skill_id, published_at),
    CONSTRAINT fk_skill_versions_skill FOREIGN KEY (skill_id) REFERENCES t_skills(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- [ ] **Step 3: t_skill_subscriptions DDL**

```sql
CREATE TABLE t_skill_subscriptions (
    id BIGINT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    skill_id BIGINT NOT NULL,
    source VARCHAR(16) NOT NULL,
    subscribed_at DATETIME(3) NOT NULL,
    deleted TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    deleted_at DATETIME(3) NULL,
    UNIQUE KEY uk_subscriptions (user_id, skill_id),
    CONSTRAINT fk_subscriptions_skill FOREIGN KEY (skill_id) REFERENCES t_skills(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- [ ] **Step 4: 启动验证 Flyway 生效**

Run: `cd D:/workspace/agents-plus-server && mvn -q spring-boot:run` 持续 ~10 秒后 Ctrl-C
Expected: 日志含 `Successfully applied 3 migrations`

- [ ] **Step 5: 提交**

```bash
cd D:/workspace/agents-plus-server && \
git add src/main/resources/db/migration/ && \
git commit -m "feat(server): Flyway migrations for t_skills / t_skill_versions / t_skill_subscriptions"
```

---

## Phase 2: 后端 Skill CRUD

### Task 9: DTO 与响应壳

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/dto/SkillDtos.java`

- [ ] **Step 1: 写 DTO**

```java
package com.krmeow.agentsplus.dto;

import java.time.Instant;
import java.util.List;

public class SkillDtos {

    public record SkillSummary(
            String id,
            String name,
            String displayName,
            String description,
            String sourceType,
            String latestVersion,
            Boolean hasUpdateAvailable,
            Instant updatedAt) {}

    public record SkillDetail(
            String id,
            String name,
            String displayName,
            String description,
            String sourceType,
            String sourceUrl,
            String sourceRef,
            String ownerScope,
            String ownerUserId,
            String orgId,
            String latestVersionId,
            String latestVersion,
            String contentHash,
            Boolean hasUpdateAvailable,
            Instant createdAt,
            Instant updatedAt) {}

    public record CreateSkillRequest(
            String name,
            String displayName,
            String description,
            String sourceType,
            String sourceUrl,
            String sourceRef) {}

    public record UpdateSkillRequest(
            String displayName,
            String description) {}

    public record SkillVersionSummary(
            String id,
            String version,
            Long sizeBytes,
            String contentHash,
            String changelog,
            Instant publishedAt) {}

    public record SkillVersionDetail(
            String id,
            String skillId,
            String version,
            Long sizeBytes,
            String contentHash,
            String changelog,
            String downloadUrl,
            Instant downloadUrlExpiresAt,
            Instant publishedAt) {}

    public record PublishVersionRequest(
            String version,
            String changelog) {}

    public record PendingUpdate(
            String skillId,
            String skillName,
            String currentVersion,
            String newVersion,
            String changelog) {}
}
```

- [ ] **Step 2: 编译 + 提交**

```bash
cd D:/workspace/agents-plus-server && \
mvn -q -DskipTests compile && \
git add src/main/java/com/krmeow/agentsplus/dto/SkillDtos.java && \
git commit -m "feat(server): add SkillDtos records"
```

---

### Task 10: SkillService + Repository

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/repository/SkillRepository.java`
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/service/SkillService.java`

- [ ] **Step 1: Repository(瘦封装 Mapper + 常用查询)**

```java
package com.krmeow.agentsplus.repository;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.krmeow.agentsplus.entity.SkillEntity;
import com.krmeow.agentsplus.mapper.SkillMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
@RequiredArgsConstructor
public class SkillRepository {
    private final SkillMapper skillMapper;

    public void insert(SkillEntity entity) {
        skillMapper.insert(entity);
    }

    public Optional<SkillEntity> findById(Long id) {
        return Optional.ofNullable(skillMapper.selectById(id));
    }

    public Optional<SkillEntity> findByName(String name) {
        return Optional.ofNullable(skillMapper.selectOne(
                new QueryWrapper<SkillEntity>().eq("name", name)));
    }

    public List<SkillEntity> listVisible(Long userId, Long orgId, String query, int page, int size) {
        QueryWrapper<SkillEntity> qw = new QueryWrapper<>();
        qw.eq("deleted", 0);
        if (orgId != null) {
            qw.eq("org_id", orgId).eq("owner_scope", "org");
        } else {
            qw.and(w -> w.eq("owner_scope", "personal").eq("owner_user_id", userId));
        }
        if (query != null && !query.isBlank()) {
            qw.like("name", query);
        }
        qw.orderByDesc("updated_at");
        qw.last("LIMIT " + size + " OFFSET " + (page * size));
        return skillMapper.selectList(qw);
    }

    public void updateById(SkillEntity entity) {
        skillMapper.updateById(entity);
    }

    public void softDelete(Long id) {
        SkillEntity patch = SkillEntity.builder().id(id).deleted(true).build();
        skillMapper.updateById(patch);
    }
}
```

- [ ] **Step 2: SkillService(实现 create/list/get/update/delete 业务规则)**

```java
package com.krmeow.agentsplus.service;

import com.krmeow.agentsplus.dto.SkillDtos.CreateSkillRequest;
import com.krmeow.agentsplus.dto.SkillDtos.SkillDetail;
import com.krmeow.agentsplus.dto.SkillDtos.SkillSummary;
import com.krmeow.agentsplus.dto.SkillDtos.UpdateSkillRequest;
import com.krmeow.agentsplus.entity.SkillEntity;
import com.krmeow.agentsplus.entity.SkillVersionEntity;
import com.krmeow.agentsplus.mapper.SkillVersionMapper;
import com.krmeow.agentsplus.repository.SkillRepository;
import com.krmeow.agentsplus.common.ApiException;
import com.krmeow.agentsplus.common.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SkillService {

    private static final Pattern NAME_PATTERN = Pattern.compile("^[a-z0-9][a-z0-9-]{0,63}$");

    private final SkillRepository skillRepository;
    private final SkillVersionMapper skillVersionMapper;

    public String create(Long userId, CreateSkillRequest req) {
        if (req.name() == null || !NAME_PATTERN.matcher(req.name()).matches()) {
            throw new ApiException(ErrorCode.SKILL_NAME_INVALID);
        }
        if (skillRepository.findByName(req.name()).isPresent()) {
            throw new ApiException(ErrorCode.SKILL_NAME_CONFLICT);
        }
        SkillEntity entity = SkillEntity.builder()
                .name(req.name())
                .displayName(req.displayName())
                .description(req.description())
                .sourceType(req.sourceType() == null ? "local" : req.sourceType())
                .sourceUrl(req.sourceUrl())
                .sourceRef(req.sourceRef())
                .ownerScope("personal")
                .ownerUserId(userId)
                .createdBy(userId)
                .hasUpdateAvailable(false)
                .build();
        skillRepository.insert(entity);
        return String.valueOf(entity.getId());
    }

    public List<SkillSummary> list(Long userId, Long orgId, String query, int page, int size) {
        return skillRepository.listVisible(userId, orgId, query, page, size).stream()
                .map(this::toSummary)
                .collect(Collectors.toList());
    }

    public SkillDetail get(Long userId, Long orgId, Long id) {
        SkillEntity entity = skillRepository.findById(id)
                .orElseThrow(() -> new ApiException(ErrorCode.SKILL_NOT_FOUND));
        ensureVisible(entity, userId, orgId);
        return toDetail(entity);
    }

    public void update(Long userId, Long orgId, Long id, UpdateSkillRequest req) {
        SkillEntity entity = skillRepository.findById(id)
                .orElseThrow(() -> new ApiException(ErrorCode.SKILL_NOT_FOUND));
        ensureOwner(entity, userId, orgId);
        entity.setDisplayName(req.displayName());
        entity.setDescription(req.description());
        entity.setUpdatedAt(Instant.now());
        skillRepository.updateById(entity);
    }

    public void delete(Long userId, Long orgId, Long id) {
        SkillEntity entity = skillRepository.findById(id)
                .orElseThrow(() -> new ApiException(ErrorCode.SKILL_NOT_FOUND));
        ensureOwner(entity, userId, orgId);
        entity.setDeleted(true);
        entity.setUpdatedAt(Instant.now());
        skillRepository.updateById(entity);
    }

    private SkillSummary toSummary(SkillEntity e) {
        String latestVersion = null;
        if (e.getLatestVersionId() != null) {
            latestVersion = skillVersionMapper.selectById(e.getLatestVersionId())
                    .map(SkillVersionEntity::getVersion).orElse(null);
        }
        return new SkillSummary(
                String.valueOf(e.getId()),
                e.getName(),
                e.getDisplayName(),
                e.getDescription(),
                e.getSourceType(),
                latestVersion,
                e.getHasUpdateAvailable(),
                e.getUpdatedAt());
    }

    private SkillDetail toDetail(SkillEntity e) {
        String latestVersion = null;
        if (e.getLatestVersionId() != null) {
            latestVersion = skillVersionMapper.selectById(e.getLatestVersionId())
                    .map(SkillVersionEntity::getVersion).orElse(null);
        }
        return new SkillDetail(
                String.valueOf(e.getId()),
                e.getName(),
                e.getDisplayName(),
                e.getDescription(),
                e.getSourceType(),
                e.getSourceUrl(),
                e.getSourceRef(),
                e.getOwnerScope(),
                e.getOwnerUserId() == null ? null : String.valueOf(e.getOwnerUserId()),
                e.getOrgId() == null ? null : String.valueOf(e.getOrgId()),
                e.getLatestVersionId() == null ? null : String.valueOf(e.getLatestVersionId()),
                latestVersion,
                e.getContentHash(),
                e.getHasUpdateAvailable(),
                e.getCreatedAt(),
                e.getUpdatedAt());
    }

    private void ensureVisible(SkillEntity e, Long userId, Long orgId) {
        if ("personal".equals(e.getOwnerScope()) && userId.equals(e.getOwnerUserId())) return;
        if ("org".equals(e.getOwnerScope()) && orgId != null && orgId.equals(e.getOrgId())) return;
        throw new ApiException(ErrorCode.SKILL_FORBIDDEN);
    }

    private void ensureOwner(SkillEntity e, Long userId, Long orgId) {
        if ("personal".equals(e.getOwnerScope()) && userId.equals(e.getOwnerUserId())) return;
        if ("org".equals(e.getOwnerScope()) && orgId != null && orgId.equals(e.getOrgId())) return;
        throw new ApiException(ErrorCode.SKILL_FORBIDDEN);
    }
}
```

- [ ] **Step 3: 编译 + 提交**

```bash
cd D:/workspace/agents-plus-server && \
mvn -q -DskipTests compile && \
git add src/main/java/com/krmeow/agentsplus/repository/SkillRepository.java \
        src/main/java/com/krmeow/agentsplus/service/SkillService.java && \
git commit -m "feat(server): add SkillRepository and SkillService with CRUD"
```

---

### Task 11: ErrorCode 与 ApiException

**Files:**
- Modify: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/common/ErrorCode.java`

- [ ] **Step 1: 追加 skill 错误码**

在 ErrorCode 枚举末尾添加:

```java
SKILL_NAME_INVALID(40060, "skill 名称不合法"),
SKILL_NAME_CONFLICT(40061, "skill 名称已被占用"),
SKILL_ZIP_TOO_LARGE(40062, "skill ZIP 过大"),
SKILL_ZIP_INVALID(40063, "skill ZIP 不合法(缺 SKILL.md 或解压失败)"),
SKILL_ZIP_FILE_TOO_LARGE(40064, "skill ZIP 单文件过大"),
SKILL_ZIP_UNSAFE_PATH(40065, "skill ZIP 含不安全路径"),
SKILL_ZIP_UNSAFE_SYMLINK(40066, "skill ZIP 含不安全符号链接"),
SKILL_VERSION_EXISTS(40067, "skill 版本已存在"),
SKILL_SOURCE_FETCH_FAILED(40068, "skill 上游源拉取失败"),
SKILL_NOT_FOUND(40069, "skill 不存在"),
SKILL_FORBIDDEN(40070, "skill 访问被拒绝");
```

- [ ] **Step 2: 编译 + 提交**

```bash
cd D:/workspace/agents-plus-server && \
mvn -q -DskipTests compile && \
git add src/main/java/com/krmeow/agentsplus/common/ErrorCode.java && \
git commit -m "feat(server): add skill error codes"
```

---

### Task 12: SkillController

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/controller/SkillController.java`

- [ ] **Step 1: 写 Controller**

```java
package com.krmeow.agentsplus.controller;

import com.krmeow.agentsplus.dto.SkillDtos.CreateSkillRequest;
import com.krmeow.agentsplus.dto.SkillDtos.SkillDetail;
import com.krmeow.agentsplus.dto.SkillDtos.SkillSummary;
import com.krmeow.agentsplus.dto.SkillDtos.UpdateSkillRequest;
import com.krmeow.agentsplus.service.SkillService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/skills")
@RequiredArgsConstructor
public class SkillController {

    private final SkillService skillService;

    @GetMapping
    public List<SkillSummary> list(
            @RequestAttribute("userId") Long userId,
            @RequestParam(required = false) Long orgId,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return skillService.list(userId, orgId, q, page, size);
    }

    @PostMapping
    public String create(
            @RequestAttribute("userId") Long userId,
            @RequestBody CreateSkillRequest req) {
        return skillService.create(userId, req);
    }

    @GetMapping("/{id}")
    public SkillDetail get(
            @RequestAttribute("userId") Long userId,
            @RequestParam(required = false) Long orgId,
            @PathVariable Long id) {
        return skillService.get(userId, orgId, id);
    }

    @PatchMapping("/{id}")
    public void update(
            @RequestAttribute("userId") Long userId,
            @RequestParam(required = false) Long orgId,
            @PathVariable Long id,
            @RequestBody UpdateSkillRequest req) {
        skillService.update(userId, orgId, id, req);
    }

    @DeleteMapping("/{id}")
    public void delete(
            @RequestAttribute("userId") Long userId,
            @RequestParam(required = false) Long orgId,
            @PathVariable Long id) {
        skillService.delete(userId, orgId, id);
    }
}
```

- [ ] **Step 2: 编译 + 提交**

```bash
cd D:/workspace/agents-plus-server && \
mvn -q -DskipTests compile && \
git add src/main/java/com/krmeow/agentsplus/controller/SkillController.java && \
git commit -m "feat(server): add SkillController REST endpoints"
```

---

## Phase 3: 后端版本 + MinIO

### Task 13: MinIO 客户端 Bean

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/infrastructure/MinioClientConfig.java`

- [ ] **Step 1: 写配置类**

```java
package com.krmeow.agentsplus.infrastructure;

import io.minio.MinioClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MinioClientConfig {

    @Bean
    public MinioClient minioClient(
            @Value("${minio.endpoint}") String endpoint,
            @Value("${minio.access-key}") String accessKey,
            @Value("${minio.secret-key}") String secretKey) {
        return MinioClient.builder()
                .endpoint(endpoint)
                .credentials(accessKey, secretKey)
                .build();
    }
}
```

(若项目已有 `infrastructure/` 包,放那;否则创建该包。)

- [ ] **Step 2: 编译 + 提交**

```bash
cd D:/workspace/agents-plus-server && \
mvn -q -DskipTests compile && \
git add src/main/java/com/krmeow/agentsplus/infrastructure/MinioClientConfig.java && \
git commit -m "feat(server): add MinioClient bean"
```

---

### Task 14: SkillStorage(MinIO 包装)

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/service/SkillStorage.java`

- [ ] **Step 1: 写存储服务**

```java
package com.krmeow.agentsplus.service;

import io.minio.GetPresignedObjectUrlArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.http.Method;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.time.Duration;

@Service
@RequiredArgsConstructor
public class SkillStorage {

    private final MinioClient minioClient;

    @Value("${minio.bucket-skills}")
    private String bucket;

    @Value("${minio.presigned-url-ttl-seconds}")
    private long presignedTtlSeconds;

    public String upload(String objectKey, InputStream stream, long sizeBytes, String contentType) throws Exception {
        minioClient.putObject(PutObjectArgs.builder()
                .bucket(bucket)
                .object(objectKey)
                .stream(stream, sizeBytes, -1)
                .contentType(contentType)
                .build());
        return objectKey;
    }

    public String presignedDownloadUrl(String objectKey, Duration ttl) throws Exception {
        return minioClient.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                .method(Method.GET)
                .bucket(bucket)
                .object(objectKey)
                .expiry((int) ttl.toSeconds())
                .build());
    }

    public long presignedTtlSeconds() {
        return presignedTtlSeconds;
    }

    public String bucket() {
        return bucket;
    }

    public void delete(String objectKey) throws Exception {
        minioClient.removeObject(RemoveObjectArgs.builder()
                .bucket(bucket)
                .object(objectKey)
                .build());
    }
}
```

- [ ] **Step 2: 编译 + 提交**

```bash
cd D:/workspace/agents-plus-server && \
mvn -q -DskipTests compile && \
git add src/main/java/com/krmeow/agentsplus/service/SkillStorage.java && \
git commit -m "feat(server): add SkillStorage wrapping MinIO"
```

---

### Task 15: SkillVersionService

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/service/SkillVersionService.java`

- [ ] **Step 1: 写版本服务**

```java
package com.krmeow.agentsplus.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.krmeow.agentsplus.common.ApiException;
import com.krmeow.agentsplus.common.ErrorCode;
import com.krmeow.agentsplus.dto.SkillDtos.PublishVersionRequest;
import com.krmeow.agentsplus.dto.SkillDtos.SkillVersionDetail;
import com.krmeow.agentsplus.dto.SkillDtos.SkillVersionSummary;
import com.krmeow.agentsplus.entity.SkillEntity;
import com.krmeow.agentsplus.entity.SkillVersionEntity;
import com.krmeow.agentsplus.mapper.SkillVersionMapper;
import com.krmeow.agentsplus.repository.SkillRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SkillVersionService {

    private final SkillRepository skillRepository;
    private final SkillVersionMapper skillVersionMapper;
    private final SkillStorage skillStorage;

    @Value("${skills.max-zip-bytes}")
    private long maxZipBytes;

    @Transactional
    public String publish(Long userId, Long skillId, String version, String changelog, MultipartFile zip) throws Exception {
        SkillEntity skill = skillRepository.findById(skillId)
                .orElseThrow(() -> new ApiException(ErrorCode.SKILL_NOT_FOUND));
        if (!userId.equals(skill.getCreatedBy())) {
            throw new ApiException(ErrorCode.SKILL_FORBIDDEN);
        }
        if (zip.getSize() > maxZipBytes) {
            throw new ApiException(ErrorCode.SKILL_ZIP_TOO_LARGE);
        }
        if (skillVersionMapper.selectCount(new QueryWrapper<SkillVersionEntity>()
                .eq("skill_id", skillId).eq("version", version).eq("deleted", 0)) > 0) {
            throw new ApiException(ErrorCode.SKILL_VERSION_EXISTS);
        }

        String objectKey = skillId + "/" + version + ".zip";
        String contentHash;
        try (InputStream in = zip.getInputStream()) {
            contentHash = sha256AndUpload(in, objectKey, zip.getSize());
        }

        SkillVersionEntity entity = SkillVersionEntity.builder()
                .skillId(skillId)
                .version(version)
                .minioBucket(skillStorage.bucket())
                .minioObjectKey(objectKey)
                .sizeBytes(zip.getSize())
                .contentHash(contentHash)
                .changelog(changelog)
                .publishedBy(userId)
                .publishedAt(Instant.now())
                .build();
        skillVersionMapper.insert(entity);

        skill.setLatestVersionId(entity.getId());
        skill.setContentHash(contentHash);
        skill.setHasUpdateAvailable(false);
        skill.setUpdatedAt(Instant.now());
        skillRepository.updateById(skill);

        return String.valueOf(entity.getId());
    }

    public List<SkillVersionSummary> list(Long skillId) {
        return skillVersionMapper.selectList(new QueryWrapper<SkillVersionEntity>()
                        .eq("skill_id", skillId).eq("deleted", 0).orderByDesc("published_at"))
                .stream()
                .map(e -> new SkillVersionSummary(
                        String.valueOf(e.getId()),
                        e.getVersion(),
                        e.getSizeBytes(),
                        e.getContentHash(),
                        e.getChangelog(),
                        e.getPublishedAt()))
                .collect(Collectors.toList());
    }

    public SkillVersionDetail get(Long skillId, String version) throws Exception {
        SkillVersionEntity entity = skillVersionMapper.selectOne(new QueryWrapper<SkillVersionEntity>()
                .eq("skill_id", skillId).eq("version", version).eq("deleted", 0));
        if (entity == null) throw new ApiException(ErrorCode.SKILL_NOT_FOUND);
        String url = skillStorage.presignedDownloadUrl(
                entity.getMinioObjectKey(),
                Duration.ofSeconds(skillStorage.presignedTtlSeconds()));
        Instant expiresAt = Instant.now().plusSeconds(skillStorage.presignedTtlSeconds());
        return new SkillVersionDetail(
                String.valueOf(entity.getId()),
                String.valueOf(entity.getSkillId()),
                entity.getVersion(),
                entity.getSizeBytes(),
                entity.getContentHash(),
                entity.getChangelog(),
                url,
                expiresAt,
                entity.getPublishedAt());
    }

    private String sha256AndUpload(InputStream in, String objectKey, long size) throws Exception {
        // 计算 SHA-256 同时缓存到临时 buffer(限制大小由前端 max-zip-bytes 控制)
        byte[] buffer = in.readNBytes((int) size);
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] hash = md.digest(buffer);
        String hex = HexFormat.of().formatHex(hash);
        try (InputStream re = new java.io.ByteArrayInputStream(buffer)) {
            skillStorage.upload(objectKey, re, size, "application/zip");
        }
        return hex;
    }
}
```

- [ ] **Step 2: 编译 + 提交**

```bash
cd D:/workspace/agents-plus-server && \
mvn -q -DskipTests compile && \
git add src/main/java/com/krmeow/agentsplus/service/SkillVersionService.java && \
git commit -m "feat(server): add SkillVersionService with publish + presigned URL"
```

---

### Task 16: SkillVersionController(multipart)

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/controller/SkillVersionController.java`

- [ ] **Step 1: 写 Controller**

```java
package com.krmeow.agentsplus.controller;

import com.krmeow.agentsplus.dto.SkillDtos.SkillVersionDetail;
import com.krmeow.agentsplus.dto.SkillDtos.SkillVersionSummary;
import com.krmeow.agentsplus.service.SkillVersionService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/v1/skills/{skillId}/versions")
@RequiredArgsConstructor
public class SkillVersionController {

    private final SkillVersionService skillVersionService;

    @GetMapping
    public List<SkillVersionSummary> list(@PathVariable Long skillId) {
        return skillVersionService.list(skillId);
    }

    @PostMapping(consumes = "multipart/form-data")
    public String publish(
            @RequestAttribute("userId") Long userId,
            @PathVariable Long skillId,
            @RequestParam("version") String version,
            @RequestParam(value = "changelog", required = false) String changelog,
            @RequestParam("zip") MultipartFile zip) throws Exception {
        return skillVersionService.publish(userId, skillId, version, changelog, zip);
    }

    @GetMapping("/{version}")
    public SkillVersionDetail get(@PathVariable Long skillId, @PathVariable String version) throws Exception {
        return skillVersionService.get(skillId, version);
    }
}
```

- [ ] **Step 2: 编译 + 提交**

```bash
cd D:/workspace/agents-plus-server && \
mvn -q -DskipTests compile && \
git add src/main/java/com/krmeow/agentsplus/controller/SkillVersionController.java && \
git commit -m "feat(server): add SkillVersionController with multipart upload"
```

---

## Phase 4: 后端导入(最小骨架,MVP 留扩展)

### Task 17: SkillImportService + Controller

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/service/SkillImportService.java`
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/controller/SkillImportController.java`

- [ ] **Step 1: ImportService(GitHub / skills.sh / zip 三路径的入口)**

```java
package com.krmeow.agentsplus.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.krmeow.agentsplus.common.ApiException;
import com.krmeow.agentsplus.common.ErrorCode;
import com.krmeow.agentsplus.entity.SkillEntity;
import com.krmeow.agentsplus.repository.SkillRepository;
import lombok.RequiredArgsConstructor;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@Service
@RequiredArgsConstructor
public class SkillImportService {

    private final SkillRepository skillRepository;
    private final SkillVersionService skillVersionService;
    private final SkillStorage skillStorage;
    private final OkHttpClient http = new OkHttpClient();
    private final ObjectMapper json = new ObjectMapper();

    @Transactional
    public String importFromGithub(Long userId, String repo, String ref, String path) throws Exception {
        // 下载 zip
        String url = String.format("https://api.github.com/repos/%s/zipball/%s",
                repo, ref == null ? "HEAD" : ref);
        byte[] bytes = downloadBytes(url);
        try (ZipInputStream zin = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            ZipEntry first = zin.getNextEntry();
            if (first == null) throw new ApiException(ErrorCode.SKILL_ZIP_INVALID);
            String[] parts = first.getName().split("/");
            String name = sanitizeName(parts[0]);
            // 把 zip 重新打包成 MultipartFile-like 内存对象传给 publishVersion
            // 这里偷懒:直接把 bytes 包装成 MockMultipartFile
            org.springframework.mock.web.MockMultipartFile file =
                    new org.springframework.mock.web.MockMultipartFile(
                            "zip", name + ".zip", "application/zip", bytes);
            // 从 first 解析 SKILL.md frontmatter (略,后续 Task 19 补)
            String skillId = createSkillForImport(userId, name, "github", repo, ref);
            skillVersionService.publish(userId, Long.valueOf(skillId), firstVersionTag(ref), null, file);
            return skillId;
        }
    }

    @Transactional
    public String importFromSkillsSh(Long userId, String slug) throws Exception {
        // skills.sh 公开 API 形态简化为 slug → GitHub repo 转发
        String html = new String(downloadBytes("https://skills.sh/" + slug), StandardCharsets.UTF_8);
        // 简化:从 html 抽取 github.com/owner/repo(留给 Task 19 完善)
        throw new ApiException(ErrorCode.SKILL_SOURCE_FETCH_FAILED);
    }

    @Transactional
    public String importFromZip(Long userId, MultipartFile zip) throws Exception {
        try (ZipInputStream zin = new ZipInputStream(zip.getInputStream())) {
            ZipEntry first = zin.getNextEntry();
            if (first == null) throw new ApiException(ErrorCode.SKILL_ZIP_INVALID);
            String[] parts = first.getName().split("/");
            String name = sanitizeName(parts[0]);
            org.springframework.mock.web.MockMultipartFile file =
                    new org.springframework.mock.web.MockMultipartFile(
                            "zip", name + ".zip", "application/zip", zip.getBytes());
            String skillId = createSkillForImport(userId, name, "zip_upload", null, null);
            skillVersionService.publish(userId, Long.valueOf(skillId), "0.1.0", null, file);
            return skillId;
        }
    }

    private String createSkillForImport(Long userId, String name, String sourceType, String sourceUrl, String sourceRef) {
        if (skillRepository.findByName(name).isPresent()) {
            throw new ApiException(ErrorCode.SKILL_NAME_CONFLICT);
        }
        SkillEntity entity = SkillEntity.builder()
                .name(name)
                .sourceType(sourceType)
                .sourceUrl(sourceUrl)
                .sourceRef(sourceRef)
                .ownerScope("personal")
                .ownerUserId(userId)
                .createdBy(userId)
                .hasUpdateAvailable(false)
                .build();
        skillRepository.insert(entity);
        return String.valueOf(entity.getId());
    }

    private byte[] downloadBytes(String url) throws IOException {
        try (Response resp = http.newCall(new Request.Builder().url(url).build()).execute()) {
            if (!resp.isSuccessful()) throw new ApiException(ErrorCode.SKILL_SOURCE_FETCH_FAILED);
            return resp.body().bytes();
        }
    }

    private String sanitizeName(String raw) {
        String lower = raw.toLowerCase().replaceAll("[^a-z0-9-]+", "-");
        if (lower.length() > 64) lower = lower.substring(0, 64);
        return lower;
    }

    private String firstVersionTag(String ref) {
        return ref == null ? "0.1.0" : ref;
    }
}
```

- [ ] **Step 2: ImportController**

```java
package com.krmeow.agentsplus.controller;

import com.krmeow.agentsplus.service.SkillImportService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/skills/import")
@RequiredArgsConstructor
public class SkillImportController {

    private final SkillImportService skillImportService;

    @PostMapping("/github")
    public String github(
            @RequestAttribute("userId") Long userId,
            @RequestParam("repo") String repo,
            @RequestParam(value = "ref", required = false) String ref,
            @RequestParam(value = "path", required = false) String path) throws Exception {
        return skillImportService.importFromGithub(userId, repo, ref, path);
    }

    @PostMapping("/skills-sh")
    public String skillsSh(
            @RequestAttribute("userId") Long userId,
            @RequestParam("slug") String slug) throws Exception {
        return skillImportService.importFromSkillsSh(userId, slug);
    }

    @PostMapping(value = "/zip", consumes = "multipart/form-data")
    public String zip(
            @RequestAttribute("userId") Long userId,
            @RequestParam("zip") MultipartFile zip) throws Exception {
        return skillImportService.importFromZip(userId, zip);
    }
}
```

- [ ] **Step 3: 编译 + 提交**

```bash
cd D:/workspace/agents-plus-server && \
mvn -q -DskipTests compile && \
git add src/main/java/com/krmeow/agentsplus/service/SkillImportService.java \
        src/main/java/com/krmeow/agentsplus/controller/SkillImportController.java && \
git commit -m "feat(server): add SkillImportService + Controller (MVP skeleton)"
```

> **Task 19 / 后续迭代** 将完善 frontmatter 解析、skills.sh HTML 解析、subscribed 通知等。

---

## Phase 5: 后端订阅 + Worker

### Task 18: SkillSubscriptionService + Controller

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/service/SkillSubscriptionService.java`
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/controller/SkillSubscriptionController.java`

- [ ] **Step 1: Service**

```java
package com.krmeow.agentsplus.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.krmeow.agentsplus.common.ApiException;
import com.krmeow.agentsplus.common.ErrorCode;
import com.krmeow.agentsplus.entity.SkillEntity;
import com.krmeow.agentsplus.entity.SkillSubscriptionEntity;
import com.krmeow.agentsplus.mapper.SkillSubscriptionMapper;
import com.krmeow.agentsplus.repository.SkillRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;

@Service
@RequiredArgsConstructor
public class SkillSubscriptionService {

    private final SkillSubscriptionMapper subscriptionMapper;
    private final SkillRepository skillRepository;

    public void subscribe(Long userId, Long skillId, String source) {
        SkillEntity skill = skillRepository.findById(skillId)
                .orElseThrow(() -> new ApiException(ErrorCode.SKILL_NOT_FOUND));
        if (subscriptionMapper.selectCount(new QueryWrapper<SkillSubscriptionEntity>()
                .eq("user_id", userId).eq("skill_id", skillId).eq("deleted", 0)) > 0) {
            return;
        }
        SkillSubscriptionEntity entity = SkillSubscriptionEntity.builder()
                .userId(userId)
                .skillId(skillId)
                .source(source == null ? "import" : source)
                .subscribedAt(Instant.now())
                .build();
        subscriptionMapper.insert(entity);
    }

    public void unsubscribe(Long userId, Long skillId) {
        SkillSubscriptionEntity existing = subscriptionMapper.selectOne(
                new QueryWrapper<SkillSubscriptionEntity>()
                        .eq("user_id", userId).eq("skill_id", skillId).eq("deleted", 0));
        if (existing == null) return;
        existing.setDeleted(true);
        existing.setUpdatedAt(Instant.now());
        subscriptionMapper.updateById(existing);
    }

    public List<Long> listSkillIdsByUser(Long userId) {
        return subscriptionMapper.selectList(new QueryWrapper<SkillSubscriptionEntity>()
                        .eq("user_id", userId).eq("deleted", 0))
                .stream().map(SkillSubscriptionEntity::getSkillId).toList();
    }
}
```

- [ ] **Step 2: Controller**

```java
package com.krmeow.agentsplus.controller;

import com.krmeow.agentsplus.service.SkillSubscriptionService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/skills/{skillId}/subscribe")
@RequiredArgsConstructor
public class SkillSubscriptionController {

    private final SkillSubscriptionService subscriptionService;

    @PostMapping
    public void subscribe(
            @RequestAttribute("userId") Long userId,
            @PathVariable Long skillId,
            @RequestParam(value = "source", required = false) String source) {
        subscriptionService.subscribe(userId, skillId, source);
    }

    @DeleteMapping
    public void unsubscribe(
            @RequestAttribute("userId") Long userId,
            @PathVariable Long skillId) {
        subscriptionService.unsubscribe(userId, skillId);
    }
}
```

- [ ] **Step 3: 编译 + 提交**

```bash
cd D:/workspace/agents-plus-server && \
mvn -q -DskipTests compile && \
git add src/main/java/com/krmeow/agentsplus/service/SkillSubscriptionService.java \
        src/main/java/com/krmeow/agentsplus/controller/SkillSubscriptionController.java && \
git commit -m "feat(server): add SkillSubscriptionService + Controller"
```

---

### Task 19: SkillUpdateWorker(只检测不应用)

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/service/SkillUpdateWorker.java`

- [ ] **Step 1: Worker**

```java
package com.krmeow.agentsplus.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.krmeow.agentsplus.entity.SkillEntity;
import com.krmeow.agentsplus.entity.SkillVersionEntity;
import com.krmeow.agentsplus.mapper.SkillVersionMapper;
import com.krmeow.agentsplus.repository.SkillRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
public class SkillUpdateWorker {

    private final SkillRepository skillRepository;
    private final SkillVersionMapper skillVersionMapper;
    private final OkHttpClient http = new OkHttpClient();
    private final ObjectMapper json = new ObjectMapper();

    @Value("${skills.worker-enabled:true}")
    private boolean enabled;

    @Scheduled(fixedDelayString = "${skills.worker-poll-interval:PT6H}", initialDelay = 60_000)
    public void poll() {
        if (!enabled) return;
        List<SkillEntity> skills = skillRepository.listVisible(null, null, null, 0, 1000);
        for (SkillEntity skill : skills) {
            if (!"github".equals(skill.getSourceType()) && !"skills_sh".equals(skill.getSourceType())) continue;
            try {
                checkOne(skill);
            } catch (Exception e) {
                log.warn("Skill update check failed for {}: {}", skill.getName(), e.getMessage());
            }
        }
    }

    private void checkOne(SkillEntity skill) throws Exception {
        String latest = latestVersionOnUpstream(skill);
        if (latest == null) return;
        String current = null;
        if (skill.getLatestVersionId() != null) {
            SkillVersionEntity v = skillVersionMapper.selectById(skill.getLatestVersionId());
            if (v != null) current = v.getVersion();
        }
        if (latest.equals(current)) return;
        skill.setHasUpdateAvailable(true);
        skill.setUpdatedAt(Instant.now());
        skillRepository.updateById(skill);
        log.info("Skill update detected: {} -> {}", skill.getName(), latest);
    }

    private String latestVersionOnUpstream(SkillEntity skill) throws Exception {
        if ("github".equals(skill.getSourceType())) {
            String url = "https://api.github.com/repos/" + skill.getSourceUrl()
                    + "/releases/latest";
            try (Response resp = http.newCall(new Request.Builder().url(url).build()).execute()) {
                if (!resp.isSuccessful()) return null;
                JsonNode node = json.readTree(resp.body().byteStream());
                JsonNode tag = node.get("tag_name");
                return tag == null ? null : tag.asText();
            }
        }
        // skills_sh 解析留给后续
        return null;
    }
}
```

- [ ] **Step 2: 在 Application 类启用 Scheduling**

打开 `AgentsPlusServerApplication.java`,在类上加 `@EnableScheduling`(若没有)。

- [ ] **Step 3: 编译 + 提交**

```bash
cd D:/workspace/agents-plus-server && \
mvn -q -DskipTests compile && \
git add src/main/java/com/krmeow/agentsplus/service/SkillUpdateWorker.java \
        src/main/java/com/krmeow/agentsplus/AgentsPlusServerApplication.java && \
git commit -m "feat(server): add SkillUpdateWorker (detect-only)"
```

---

### Task 20: 通知端点

**Files:**
- Create: `D:/workspace/agents-plus-server/src/main/java/com/krmeow/agentsplus/controller/SkillNotificationController.java`

- [ ] **Step 1: Controller(列出当前用户有新版本的 skill)**

```java
package com.krmeow.agentsplus.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.krmeow.agentsplus.dto.SkillDtos.PendingUpdate;
import com.krmeow.agentsplus.entity.SkillEntity;
import com.krmeow.agentsplus.entity.SkillSubscriptionEntity;
import com.krmeow.agentsplus.entity.SkillVersionEntity;
import com.krmeow.agentsplus.mapper.SkillSubscriptionMapper;
import com.krmeow.agentsplus.mapper.SkillVersionMapper;
import com.krmeow.agentsplus.repository.SkillRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/v1/skills/notifications")
@RequiredArgsConstructor
public class SkillNotificationController {

    private final SkillRepository skillRepository;
    private final SkillSubscriptionMapper subscriptionMapper;
    private final SkillVersionMapper skillVersionMapper;

    @GetMapping
    public List<PendingUpdate> list(@RequestAttribute("userId") Long userId) {
        List<PendingUpdate> result = new ArrayList<>();
        List<SkillSubscriptionEntity> subs = subscriptionMapper.selectList(
                new QueryWrapper<SkillSubscriptionEntity>()
                        .eq("user_id", userId).eq("deleted", 0));
        for (SkillSubscriptionEntity sub : subs) {
            SkillEntity skill = skillRepository.findById(sub.getSkillId()).orElse(null);
            if (skill == null || !Boolean.TRUE.equals(skill.getHasUpdateAvailable())) continue;
            SkillVersionEntity current = skill.getLatestVersionId() == null
                    ? null
                    : skillVersionMapper.selectById(skill.getLatestVersionId());
            // 简化:具体 new_version 由客户端拉 detail 后取,不重复查上游
            result.add(new PendingUpdate(
                    String.valueOf(skill.getId()),
                    skill.getName(),
                    current == null ? null : current.getVersion(),
                    null,
                    null));
        }
        return result;
    }
}
```

- [ ] **Step 2: 编译 + 提交**

```bash
cd D:/workspace/agents-plus-server && \
mvn -q -DskipTests compile && \
git add src/main/java/com/krmeow/agentsplus/controller/SkillNotificationController.java && \
git commit -m "feat(server): add SkillNotificationController"
```

---

## Phase 6: 客户端基础模块

### Task 21: Skill 模块目录骨架与 IPC 占位

**Files:**
- Create: `D:/workspace/agents-plus/src-tauri/src/services/mod.rs`
- Create: `D:/workspace/agents-plus/src-tauri/src/services/skill/mod.rs`
- Modify: `D:/workspace/agents-plus/src-tauri/src/lib.rs`

- [ ] **Step 1: services/mod.rs**

```rust
pub mod skill;
```

- [ ] **Step 2: services/skill/mod.rs(占位)**

```rust
//! Skill feature: 服务端 skill 的本地 SSOT、harness 分发与状态管理。

pub mod harness_registry;
pub mod skill_dispatch;
pub mod skill_dispatcher;
pub mod skill_extractor;
pub mod skill_name;
pub mod skill_repo;
pub mod skill_state;
pub mod skill_storage;

pub use harness_registry::{HarnessAdapter, HarnessId, REGISTRY};
pub use skill_dispatch::SkillDispatchService;
pub use skill_state::{LocalSkillState, SkillStateEntry, SyncMethod};
```

- [ ] **Step 3: lib.rs 注册 skill 模块 + commands(占位)**

在 `lib.rs` 顶部 `mod` 区追加:

```rust
pub mod services;
```

在 `tauri::generate_handler!` 列表末尾追加(commands/skill.rs 写完后替换):

```rust
// 暂留空,等 Task 32 注册 commands
```

- [ ] **Step 4: 编译**

Run: `cd D:/workspace/agents-plus/src-tauri && cargo check`
Expected: 报错"找不到 commands/skill.rs"(预期,下一阶段补)

- [ ] **Step 5: 提交**

```bash
cd D:/workspace/agents-plus && \
git add src-tauri/src/services/ src-tauri/src/lib.rs && \
git commit -m "feat(client): scaffold skill services module skeleton"
```

---

### Task 22: HarnessId 与 HarnessAdapter 注册表(TDD)

**Files:**
- Create: `D:/workspace/agents-plus/src-tauri/src/services/skill/harness_registry.rs`
- Create: `D:/workspace/agents-plus/src-tauri/src/services/skill/harness_registry_test.rs`

- [ ] **Step 1: 先写测试**

```rust
// harness_registry_test.rs
use crate::services::skill::harness_registry::*;

#[test]
fn claude_skills_dir_under_home() {
    let adapter = REGISTRY.iter().find(|a| a.id == HarnessId::Claude).unwrap();
    let dir = (adapter.skills_dir)();
    assert!(dir.ends_with(".claude/skills") || dir.ends_with(".claude\\skills"));
    assert!(adapter.supported);
}

#[test]
fn codex_and_opencode_supported() {
    for id in [HarnessId::Codex, HarnessId::OpenCode, HarnessId::Gemini, HarnessId::GrokBuild, HarnessId::Hermes, HarnessId::Pi] {
        let a = REGISTRY.iter().find(|a| a.id == id).unwrap();
        assert!(a.supported, "{:?} should be supported", id);
    }
}

#[test]
fn claude_desktop_and_openclaw_unsupported() {
    for id in [HarnessId::ClaudeDesktop, HarnessId::OpenClaw] {
        let a = REGISTRY.iter().find(|a| a.id == id).unwrap();
        assert!(!a.supported, "{:?} should be unsupported", id);
    }
}

#[test]
fn pi_has_special_handling() {
    let pi = REGISTRY.iter().find(|a| a.id == HarnessId::Pi).unwrap();
    assert!(matches!(pi.special_handling, Some(SpecialHandling::ExistsAsActive)));
}
```

- [ ] **Step 2: 写最小实现以使测试通过**

```rust
// harness_registry.rs
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum HarnessId {
    Claude,
    ClaudeDesktop,
    Codex,
    Gemini,
    GrokBuild,
    OpenCode,
    OpenClaw,
    Hermes,
    Pi,
}

#[derive(Debug, Clone, Copy)]
pub enum SpecialHandling {
    ExistsAsActive,
}

pub struct HarnessAdapter {
    pub id: HarnessId,
    pub skills_dir: fn() -> PathBuf,
    pub supported: bool,
    pub special_handling: Option<SpecialHandling>,
}

fn home() -> PathBuf {
    dirs::home_dir().expect("home dir unavailable")
}

pub static REGISTRY: &[HarnessAdapter] = &[
    HarnessAdapter {
        id: HarnessId::Claude,
        skills_dir: || home().join(".claude").join("skills"),
        supported: true,
        special_handling: None,
    },
    HarnessAdapter {
        id: HarnessId::ClaudeDesktop,
        skills_dir: || home().join(".claude-desktop").join("skills"),
        supported: false,
        special_handling: None,
    },
    HarnessAdapter {
        id: HarnessId::Codex,
        skills_dir: || home().join(".codex").join("skills"),
        supported: true,
        special_handling: None,
    },
    HarnessAdapter {
        id: HarnessId::Gemini,
        skills_dir: || home().join(".gemini").join("skills"),
        supported: true,
        special_handling: None,
    },
    HarnessAdapter {
        id: HarnessId::GrokBuild,
        skills_dir: || home().join(".grok").join("skills"),
        supported: true,
        special_handling: None,
    },
    HarnessAdapter {
        id: HarnessId::OpenCode,
        skills_dir: || home().join(".config").join("opencode").join("skills"),
        supported: true,
        special_handling: None,
    },
    HarnessAdapter {
        id: HarnessId::OpenClaw,
        skills_dir: || home().join(".openclaw").join("skills"),
        supported: false,
        special_handling: None,
    },
    HarnessAdapter {
        id: HarnessId::Hermes,
        skills_dir: || home().join(".hermes").join("skills"),
        supported: true,
        special_handling: None,
    },
    HarnessAdapter {
        id: HarnessId::Pi,
        skills_dir: || home().join(".pi").join("agent").join("skills"),
        supported: true,
        special_handling: Some(SpecialHandling::ExistsAsActive),
    },
];

pub fn get_adapter(id: HarnessId) -> Option<&'static HarnessAdapter> {
    REGISTRY.iter().find(|a| a.id == id)
}
```

> 需要 `dirs` crate。若未在 Cargo.toml,添加 `dirs = "5"` 到 `[dependencies]`。

- [ ] **Step 3: 运行测试**

Run: `cd D:/workspace/agents-plus/src-tauri && cargo test --lib services::skill::harness_registry`
Expected: 4 passed

- [ ] **Step 4: 提交**

```bash
cd D:/workspace/agents-plus && \
git add src-tauri/src/services/skill/harness_registry.rs \
        src-tauri/src/services/skill/harness_registry_test.rs \
        src-tauri/Cargo.toml src-tauri/Cargo.lock && \
git commit -m "feat(client): harness_registry with full cc-switch harness set"
```

---

### Task 23: skill_name 校验(TDD)

**Files:**
- Create: `D:/workspace/agents-plus/src-tauri/src/services/skill/skill_name.rs`
- Create: `D:/workspace/agents-plus/src-tauri/src/services/skill/skill_name_test.rs`

- [ ] **Step 1: 测试**

```rust
use crate::services::skill::skill_name::validate_skill_name;

#[test]
fn accepts_lowercase_with_dash() {
    assert!(validate_skill_name("my-skill").is_ok());
    assert!(validate_skill_name("a").is_ok());
    assert!(validate_skill_name("a-b-c-1").is_ok());
}

#[test]
fn rejects_empty_or_too_long() {
    assert!(validate_skill_name("").is_err());
    let s = "a".repeat(65);
    assert!(validate_skill_name(&s).is_err());
}

#[test]
fn rejects_uppercase_or_underscore() {
    assert!(validate_skill_name("My-Skill").is_err());
    assert!(validate_skill_name("my_skill").is_err());
    assert!(validate_skill_name("my skill").is_err());
    assert!(validate_skill_name("-leading").is_err());
    assert!(validate_skill_name("trailing-").is_err());
}
```

- [ ] **Step 2: 实现**

```rust
// skill_name.rs
use once_cell::sync::Lazy;
use regex::Regex;

static NAME_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^[a-z0-9][a-z0-9-]{0,63}$").unwrap()
});

#[derive(Debug, thiserror::Error)]
pub enum SkillNameError {
    #[error("skill name must match ^[a-z0-9][a-z0-9-]{{0,63}}$ and start with lowercase letter or digit")]
    Invalid,
}

pub fn validate_skill_name(name: &str) -> Result<(), SkillNameError> {
    if NAME_REGEX.is_match(name) {
        Ok(())
    } else {
        Err(SkillNameError::Invalid)
    }
}
```

需要 `regex` + `once_cell` + `thiserror`。若未在 Cargo.toml:

```toml
regex = "1.10"
once_cell = "1.19"
thiserror = "1.0"
```

- [ ] **Step 3: 运行 + 提交**

```bash
cd D:/workspace/agents-plus/src-tauri && cargo test --lib services::skill::skill_name && \
cd D:/workspace/agents-plus && \
git add src-tauri/src/services/skill/skill_name.rs \
        src-tauri/src/services/skill/skill_name_test.rs \
        src-tauri/Cargo.toml src-tauri/Cargo.lock && \
git commit -m "feat(client): skill_name validation per spec"
```

---

### Task 24: skill_state JSON 读写(TDD)

**Files:**
- Create: `D:/workspace/agents-plus/src-tauri/src/services/skill/skill_state.rs`
- Create: `D:/workspace/agents-plus/src-tauri/src/services/skill/skill_state_test.rs`

- [ ] **Step 1: 测试**

```rust
use crate::services::skill::skill_state::*;
use std::collections::HashMap;
use tempfile::tempdir;

#[tokio::test]
async fn missing_file_returns_default() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("state.json");
    let store = SkillStateStore::new(path);
    let state = store.read().await.unwrap();
    assert_eq!(state.version, 1);
    assert!(state.skills.is_empty());
}

#[tokio::test]
async fn write_and_read_roundtrip() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("state.json");
    let store = SkillStateStore::new(path);

    let mut skills = HashMap::new();
    skills.insert("42".to_string(), SkillStateEntry {
        enabled_harnesses: vec!["claude".into(), "codex".into()],
        sync_method: None,
        last_synced_version: Some("1.0.0".into()),
        last_synced_at: None,
        last_install_error: None,
    });
    let new = LocalSkillState {
        version: 1,
        skills,
        harness_overrides: HashMap::new(),
        global_sync_method: SyncMethod::Auto,
    };
    store.write(&new).await.unwrap();

    let read = store.read().await.unwrap();
    assert_eq!(read.skills.get("42").unwrap().last_synced_version.as_deref(), Some("1.0.0"));
}
```

> 需要 `tempfile` dev-dependency。

- [ ] **Step 2: 实现**

```rust
// skill_state.rs
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use thiserror::Error;
use tokio::sync::RwLock;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SyncMethod {
    Auto,
    Symlink,
    Copy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillStateEntry {
    pub enabled_harnesses: Vec<String>,
    #[serde(default)]
    pub sync_method: Option<SyncMethod>,
    #[serde(default)]
    pub last_synced_version: Option<String>,
    #[serde(default)]
    pub last_synced_at: Option<String>,
    #[serde(default)]
    pub last_install_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalSkillState {
    pub version: u32,
    #[serde(default)]
    pub skills: HashMap<String, SkillStateEntry>,
    #[serde(default)]
    pub harness_overrides: HashMap<String, String>,
    #[serde(default = "default_sync_method")]
    pub global_sync_method: SyncMethod,
}

fn default_sync_method() -> SyncMethod { SyncMethod::Auto }

impl Default for LocalSkillState {
    fn default() -> Self {
        Self {
            version: 1,
            skills: HashMap::new(),
            harness_overrides: HashMap::new(),
            global_sync_method: SyncMethod::Auto,
        }
    }
}

#[derive(Debug, Error)]
pub enum SkillStateError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
}

pub struct SkillStateStore {
    path: PathBuf,
    lock: RwLock<()>,
}

impl SkillStateStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path, lock: RwLock::new(()), }
    }

    pub async fn read(&self) -> Result<LocalSkillState, SkillStateError> {
        let _g = self.lock.read().await;
        if !self.path.exists() {
            return Ok(LocalSkillState::default());
        }
        let bytes = tokio::fs::read(&self.path).await?;
        let state: LocalSkillState = serde_json::from_slice(&bytes)?;
        Ok(state)
    }

    pub async fn write(&self, state: &LocalSkillState) -> Result<(), SkillStateError> {
        let _g = self.lock.write().await;
        if let Some(parent) = self.path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        let bytes = serde_json::to_vec_pretty(state)?;
        // tmp + rename 原子
        let tmp = self.path.with_extension("json.tmp");
        tokio::fs::write(&tmp, &bytes).await?;
        tokio::fs::rename(&tmp, &self.path).await?;
        Ok(())
    }
}
```

需要 `tokio = { version = "1", features = ["sync", "fs", "rt-multi-thread"] }`。

- [ ] **Step 3: 运行测试 + 提交**

```bash
cd D:/workspace/agents-plus/src-tauri && cargo test --lib services::skill::skill_state && \
cd D:/workspace/agents-plus && \
git add src-tauri/src/services/skill/skill_state.rs \
        src-tauri/src/services/skill/skill_state_test.rs \
        src-tauri/Cargo.toml src-tauri/Cargo.lock && \
git commit -m "feat(client): skill_state JSON store with RwLock"
```

---

## Phase 7: 客户端 ZIP 解压器

### Task 25: skill_extractor 安全校验(TDD + 集成)

**Files:**
- Create: `D:/workspace/agents-plus/src-tauri/src/services/skill/skill_extractor.rs`
- Create: `D:/workspace/agents-plus/src-tauri/src/services/skill/skill_extractor_test.rs`
- Create: `D:/workspace/agents-plus/src-tauri/tests/fixtures/build_fixtures.rs`(可选辅助)
- Create fixtures:
  - `D:/workspace/agents-plus/src-tauri/tests/fixtures/skills/valid-basic.zip`
  - `D:/workspace/agents-plus/src-tauri/tests/fixtures/skills/missing-skill-md.zip`
  - `D:/workspace/agents-plus/src-tauri/tests/fixtures/skills/unsafe-path.zip`

- [ ] **Step 1: 生成 fixtures(用 build script 或一次性 Python 脚本)**

创建 `D:/workspace/agents-plus/src-tauri/tests/fixtures/build_fixtures.py`:

```python
import io, os, zipfile, pathlib

ROOT = pathlib.Path(__file__).parent / "skills"
ROOT.mkdir(parents=True, exist_ok=True)

def basic():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("my-skill/SKILL.md", "---\nname: my-skill\ndescription: test\n---\n# body\n")
    (ROOT / "valid-basic.zip").write_bytes(buf.getvalue())

def missing():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("my-skill/README.md", "no skill md here")
    (ROOT / "missing-skill-md.zip").write_bytes(buf.getvalue())

def unsafe():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("../escaped.txt", "bad")
        z.writestr("my-skill/SKILL.md", "---\nname: my-skill\n---\n# ok\n")
    (ROOT / "unsafe-path.zip").write_bytes(buf.getvalue())

basic(); missing(); unsafe()
print("fixtures built")
```

Run: `cd D:/workspace/agents-plus/src-tauri && python tests/fixtures/build_fixtures.py`
Expected: fixtures built

- [ ] **Step 2: 集成测试(顶层)**

```rust
// skill_extractor_test.rs (放在 src-tauri/src/services/skill/ 下作单元测试)
use crate::services::skill::skill_extractor::*;

#[test]
fn extract_valid_basic() {
    let tmp = tempfile::tempdir().unwrap();
    let bytes = std::fs::read("../../tests/fixtures/skills/valid-basic.zip").unwrap();
    extract(&bytes, tmp.path()).unwrap();
    assert!(tmp.path().join("my-skill/SKILL.md").exists());
}

#[test]
fn reject_missing_skill_md() {
    let tmp = tempfile::tempdir().unwrap();
    let bytes = std::fs::read("../../tests/fixtures/skills/missing-skill-md.zip").unwrap();
    let err = extract(&bytes, tmp.path()).unwrap_err();
    assert!(matches!(err, ExtractError::SkillMdMissing));
}

#[test]
fn reject_unsafe_path() {
    let tmp = tempfile::tempdir().unwrap();
    let bytes = std::fs::read("../../tests/fixtures/skills/unsafe-path.zip").unwrap();
    let err = extract(&bytes, tmp.path()).unwrap_err();
    assert!(matches!(err, ExtractError::UnsafePath));
}
```

- [ ] **Step 3: 实现**

```rust
// skill_extractor.rs
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use thiserror::Error;
use zip::ZipArchive;

pub const MAX_ARCHIVE_ENTRIES: usize = 10_000;
pub const MAX_TOTAL_BYTES: u64 = 512 * 1024 * 1024;
pub const MAX_FILE_BYTES: u64 = 50 * 1024 * 1024;
pub const MAX_SYMLINK_TARGET_BYTES: usize = 4096;

#[derive(Debug, Error)]
pub enum ExtractError {
    #[error("SKILL.md missing in archive")]
    SkillMdMissing,
    #[error("archive top-level must be a single directory")]
    MultiTopLevel,
    #[error("archive exceeds entry count limit")]
    TooManyEntries,
    #[error("archive exceeds total size limit")]
    TooLarge,
    #[error("entry exceeds single file size limit")]
    FileTooLarge,
    #[error("entry contains unsafe path")]
    UnsafePath,
    #[error("entry contains unsafe symlink target")]
    UnsafeSymlink,
    #[error("io error: {0}")]
    Io(#[from] io::Error),
    #[error("zip error: {0}")]
    Zip(#[from] zip::result::ZipError),
}

pub fn extract(zip_bytes: &[u8], dest_root: &Path) -> Result<(), ExtractError> {
    let mut archive = ZipArchive::new(io::Cursor::new(zip_bytes))?;
    let len = archive.len();
    if len > MAX_ARCHIVE_ENTRIES {
        return Err(ExtractError::TooManyEntries);
    }

    fs::create_dir_all(dest_root)?;
    let mut total: u64 = 0;
    let mut top_levels = std::collections::HashSet::new();
    let mut found_skill_md = false;

    for i in 0..len {
        let mut entry = archive.by_index(i)?;
        let raw_name = entry.name().to_string();

        // 路径校验
        let safe_name = match entry.enclosed_name() {
            Some(p) => p.to_string_lossy().into_owned(),
            None => return Err(ExtractError::UnsafePath),
        };
        if safe_name.contains("..") || safe_name.starts_with('/') {
            return Err(ExtractError::UnsafePath);
        }
        let first_segment = safe_name.split('/').next().unwrap_or("");
        if !first_segment.is_empty() {
            top_levels.insert(first_segment.to_string());
        }

        if safe_name.ends_with("SKILL.md") {
            found_skill_md = true;
        }

        // symlink 检查
        if entry.is_symlink() {
            let target_len = entry.extra_data_field().map(|d| d.len()).unwrap_or(0);
            if target_len > MAX_SYMLINK_TARGET_BYTES {
                return Err(ExtractError::UnsafeSymlink);
            }
        }

        let outpath = dest_root.join(&safe_name);
        if entry.is_dir() {
            fs::create_dir_all(&outpath)?;
            continue;
        }

        let size = entry.size();
        if size > MAX_FILE_BYTES {
            return Err(ExtractError::FileTooLarge);
        }
        total += size;
        if total > MAX_TOTAL_BYTES {
            return Err(ExtractError::TooLarge);
        }

        if let Some(p) = outpath.parent() {
            fs::create_dir_all(p)?;
        }
        let mut out = File::create(&outpath)?;
        io::copy(&mut entry, &mut out)?;
    }

    if top_levels.len() != 1 {
        return Err(ExtractError::MultiTopLevel);
    }
    if !found_skill_md {
        return Err(ExtractError::SkillMdMissing);
    }
    Ok(())
}
```

- [ ] **Step 4: 运行测试**

Run: `cd D:/workspace/agents-plus/src-tauri && cargo test --lib services::skill::skill_extractor`
Expected: 3 passed

- [ ] **Step 5: 提交**

```bash
cd D:/workspace/agents-plus && \
git add src-tauri/src/services/skill/skill_extractor.rs \
        src-tauri/src/services/skill/skill_extractor_test.rs \
        src-tauri/tests/fixtures/ && \
git commit -m "feat(client): skill_extractor with safety thresholds per spec"
```

---

## Phase 8: 客户端分发器

### Task 26: skill_dispatcher 核心(TDD)

**Files:**
- Create: `D:/workspace/agents-plus/src-tauri/src/services/skill/skill_dispatcher.rs`
- Create: `D:/workspace/agents-plus/src-tauri/src/services/skill/skill_dispatcher_test.rs`

- [ ] **Step 1: 测试**

```rust
use crate::services::skill::harness_registry::HarnessId;
use crate::services::skill::skill_dispatcher::*;
use std::fs;
use tempfile::tempdir;

fn make_skill_src(root: &std::path::Path) {
    fs::create_dir_all(root.join("my-skill")).unwrap();
    fs::write(root.join("my-skill/SKILL.md"), "---\nname: my-skill\n---\n# body\n").unwrap();
}

#[test]
fn copy_method_copies_into_target() {
    let src_root = tempdir().unwrap();
    let dest_root = tempdir().unwrap();
    make_skill_src(src_root.path());
    let outcome = dispatch(
        DispatchRequest {
            skill_name: "my-skill",
            source_root: src_root.path().to_path_buf(),
            target_root: dest_root.path().to_path_buf(),
            harness: HarnessId::Claude,
            method: SyncMethod::Copy,
            force: false,
            target_exists: false,
        },
    ).unwrap();
    assert!(matches!(outcome.method_used, MethodUsed::Copy));
    assert!(dest_root.path().join("my-skill/SKILL.md").exists());
}

#[test]
fn symlink_method_creates_link() {
    let src_root = tempdir().unwrap();
    let dest_root = tempdir().unwrap();
    make_skill_src(src_root.path());
    let outcome = dispatch(DispatchRequest {
        skill_name: "my-skill",
        source_root: src_root.path().to_path_buf(),
        target_root: dest_root.path().to_path_buf(),
        harness: HarnessId::Claude,
        method: SyncMethod::Symlink,
        force: false,
        target_exists: false,
    }).unwrap();
    // Windows 上 symlink 可能 fallback
    assert!(dest_root.path().join("my-skill/SKILL.md").exists());
    let _ = outcome;
}

#[test]
fn auto_with_existing_target_uses_copy() {
    let src_root = tempdir().unwrap();
    let dest_root = tempdir().unwrap();
    make_skill_src(src_root.path());
    fs::create_dir_all(dest_root.path().join("my-skill")).unwrap();
    fs::write(dest_root.path().join("my-skill/old.txt"), "old").unwrap();
    let outcome = dispatch(DispatchRequest {
        skill_name: "my-skill",
        source_root: src_root.path().to_path_buf(),
        target_root: dest_root.path().to_path_buf(),
        harness: HarnessId::Claude,
        method: SyncMethod::Auto,
        force: false,
        target_exists: true,
    }).unwrap();
    assert!(matches!(outcome.method_used, MethodUsed::Copy));
    // 旧文件被替换为新 SKILL.md
    assert!(dest_root.path().join("my-skill/SKILL.md").exists());
    assert!(!dest_root.path().join("my-skill/old.txt").exists());
}

#[test]
fn unsupported_harness_is_noop() {
    let src_root = tempdir().unwrap();
    let dest_root = tempdir().unwrap();
    make_skill_src(src_root.path());
    let outcome = dispatch(DispatchRequest {
        skill_name: "my-skill",
        source_root: src_root.path().to_path_buf(),
        target_root: dest_root.path().to_path_buf(),
        harness: HarnessId::ClaudeDesktop,
        method: SyncMethod::Auto,
        force: false,
        target_exists: false,
    }).unwrap();
    assert!(matches!(outcome.method_used, MethodUsed::Noop));
}
```

- [ ] **Step 2: 实现**

```rust
// skill_dispatcher.rs
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;
use crate::services::skill::harness_registry::{get_adapter, HarnessId};
use crate::services::skill::skill_state::SyncMethod;

#[derive(Debug, Error)]
pub enum DispatchError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    /// Pi 等 "exists=active" 的 harness:目标已存在且内容与 source 不一致,
    /// 需要 UI 弹"覆盖/保留"对话框,由用户决定后才可继续。
    #[error("pi target exists with different content; user must confirm")]
    PiTargetMismatch,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MethodUsed {
    Copy,
    Symlink,
    Noop,
    Replaced,
}

pub struct DispatchRequest<'a> {
    pub skill_name: &'a str,
    pub source_root: PathBuf,
    pub target_root: PathBuf,
    pub harness: HarnessId,
    pub method: SyncMethod,
    pub force: bool,
    pub target_exists: bool,
}

pub struct DispatchOutcome {
    pub method_used: MethodUsed,
    pub dest: PathBuf,
}

pub fn dispatch(req: DispatchRequest<'_>) -> Result<DispatchOutcome, DispatchError> {
    let adapter = get_adapter(req.harness).expect("harness id missing");
    if !adapter.supported {
        return Ok(DispatchOutcome {
            method_used: MethodUsed::Noop,
            dest: req.target_root.join(req.skill_name),
        });
    }

    let source = req.source_root.join(req.skill_name);
    if !source.join("SKILL.md").exists() {
        return Ok(DispatchOutcome {
            method_used: MethodUsed::Noop,
            dest: req.target_root.join(req.skill_name),
        });
    }

    let dest = req.target_root.join(req.skill_name);

    // Pi "ExistsAsActive":目标已存在且内容与 source 不一致 → 强制 UI 弹"覆盖/保留"
    if req.target_exists && matches!(adapter.special_handling, Some(SpecialHandling::ExistsAsActive)) {
        let src_hash = hash_dir(&source).unwrap_or_default();
        let dst_hash = hash_dir(&dest).unwrap_or_default();
        if src_hash != dst_hash && !req.force {
            return Err(DispatchError::PiTargetMismatch);
        }
    }

    let chosen = match (req.method, req.target_exists) {
        (_, true) => MethodUsed::Copy, // 已存在永远用 copy(原子)
        (SyncMethod::Copy, _) => MethodUsed::Copy,
        (SyncMethod::Symlink, _) => MethodUsed::Symlink,
        (SyncMethod::Auto, false) => MethodUsed::Symlink,
    };

    let final_method = match chosen {
        MethodUsed::Symlink => match create_symlink(&source, &dest) {
            Ok(_) => MethodUsed::Symlink,
            Err(_) => {
                copy_dir_recursive(&source, &dest)?;
                MethodUsed::Copy
            }
        },
        MethodUsed::Copy => {
            copy_dir_recursive(&source, &dest)?;
            MethodUsed::Copy
        }
        MethodUsed::Noop => MethodUsed::Noop,
        MethodUsed::Replaced => unreachable!(),
    };

    Ok(DispatchOutcome { method_used: final_method, dest })
}

fn create_symlink(src: &Path, dest: &Path) -> std::io::Result<()> {
    #[cfg(unix)] {
        std::os::unix::fs::symlink(src, dest)
    }
    #[cfg(windows)] {
        std::os::windows::fs::symlink_dir(src, dest)
    }
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> std::io::Result<()> {
    if dest.exists() {
        if dest.is_dir() { fs::remove_dir_all(dest)?; } else { fs::remove_file(dest)?; }
    }
    fs::create_dir_all(dest)?;
    for entry in walkdir::WalkDir::new(src) {
        let entry = entry?;
        let rel = entry.path().strip_prefix(src).unwrap();
        let target = dest.join(rel);
        if entry.file_type().is_dir() {
            fs::create_dir_all(&target)?;
        } else if entry.file_type().is_symlink() {
            // 简化:复制 symlink 内容为普通文件
            let bytes = fs::read(entry.path())?;
            fs::write(&target, bytes)?;
        } else {
            if let Some(p) = target.parent() { fs::create_dir_all(p)?; }
            fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}
```

- [ ] **Step 3: 运行测试**

Run: `cd D:/workspace/agents-plus/src-tauri && cargo test --lib services::skill::skill_dispatcher`
Expected: 4 passed

- [ ] **Step 4: 提交**

```bash
cd D:/workspace/agents-plus && \
git add src-tauri/src/services/skill/skill_dispatcher.rs \
        src-tauri/src/services/skill/skill_dispatcher_test.rs && \
git commit -m "feat(client): skill_dispatcher with auto/symlink/copy per spec"
```

---

## Phase 9: 客户端 HTTP 层 + ZIP 缓存

### Task 27: skill_repo(HTTP 客户端)

**Files:**
- Create: `D:/workspace/agents-plus/src-tauri/src/services/skill/skill_repo.rs`

- [ ] **Step 1: 实现**

```rust
// skill_repo.rs
use serde::{Deserialize, Serialize};
use std::path::Path;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum RepoError {
    #[error("http: {0}")]
    Http(#[from] reqwest::Error),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("server returned non-2xx: {0}")]
    Server(u16),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSummary {
    pub id: String,
    pub name: String,
    pub display_name: Option<String>,
    pub description: Option<String>,
    pub source_type: String,
    pub latest_version: Option<String>,
    pub has_update_available: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillVersionDetail {
    pub id: String,
    pub skill_id: String,
    pub version: String,
    pub size_bytes: i64,
    pub content_hash: String,
    pub changelog: Option<String>,
    pub download_url: String,
    pub download_url_expires_at: String,
    pub published_at: String,
}

pub struct SkillRepo {
    base_url: String,
    access_token: String,
    client: reqwest::Client,
}

impl SkillRepo {
    pub fn new(base_url: impl Into<String>, access_token: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            access_token: access_token.into(),
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .unwrap(),
        }
    }

    pub async fn list_skills(&self, scope: &str) -> Result<Vec<SkillSummary>, RepoError> {
        let url = format!("{}/api/v1/skills?scope={}", self.base_url, scope);
        let resp = self.client.get(&url).bearer_auth(&self.access_token).send().await?;
        if !resp.status().is_success() { return Err(RepoError::Server(resp.status().as_u16())); }
        Ok(resp.json().await?)
    }

    pub async fn get_version(&self, skill_id: &str, version: &str) -> Result<SkillVersionDetail, RepoError> {
        let url = format!("{}/api/v1/skills/{}/versions/{}", self.base_url, skill_id, version);
        let resp = self.client.get(&url).bearer_auth(&self.access_token).send().await?;
        if !resp.status().is_success() { return Err(RepoError::Server(resp.status().as_u16())); }
        Ok(resp.json().await?)
    }

    pub async fn download_zip(&self, url: &str, dest: &Path) -> Result<(), RepoError> {
        let resp = self.client.get(url).send().await?;
        if !resp.status().is_success() { return Err(RepoError::Server(resp.status().as_u16())); }
        if let Some(parent) = dest.parent() { tokio::fs::create_dir_all(parent).await?; }
        let bytes = resp.bytes().await?;
        tokio::fs::write(dest, &bytes).await?;
        Ok(())
    }
}
```

- [ ] **Step 2: 编译 + 提交**

```bash
cd D:/workspace/agents-plus/src-tauri && cargo check && \
cd D:/workspace/agents-plus && \
git add src-tauri/src/services/skill/skill_repo.rs && \
git commit -m "feat(client): skill_repo HTTP client"
```

---

### Task 28: skill_storage(ZIP 缓存,dedup by hash)

**Files:**
- Create: `D:/workspace/agents-plus/src-tauri/src/services/skill/skill_storage.rs`

- [ ] **Step 1: 实现**

```rust
// skill_storage.rs
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum CacheError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
}

pub struct SkillCache {
    root: PathBuf,
}

impl SkillCache {
    pub fn new(root: PathBuf) -> Self { Self { root } }

    pub fn path_for(&self, skill_id: &str, version: &str, content_hash: &str) -> PathBuf {
        self.root.join(skill_id).join(format!("{}-{}.zip", version, &content_hash[..12]))
    }

    pub fn is_cached(&self, path: &Path) -> bool {
        path.exists()
    }

    pub fn ensure_parent(&self, path: &Path) -> Result<(), CacheError> {
        if let Some(p) = path.parent() { std::fs::create_dir_all(p)?; }
        Ok(())
    }
}
```

- [ ] **Step 2: 编译 + 提交**

```bash
cd D:/workspace/agents-plus/src-tauri && cargo check && \
cd D:/workspace/agents-plus && \
git add src-tauri/src/services/skill/skill_storage.rs && \
git commit -m "feat(client): skill_storage ZIP cache"
```

---

### Task 29: skill_dispatch 协调服务

**Files:**
- Create: `D:/workspace/agents-plus/src-tauri/src/services/skill/skill_dispatch.rs`

- [ ] **Step 1: 实现**

```rust
// skill_dispatch.rs
use std::path::PathBuf;
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::RwLock;

use crate::services::skill::harness_registry::{get_adapter, HarnessId, REGISTRY};
use crate::services::skill::skill_dispatcher::{self, DispatchRequest};
use crate::services::skill::skill_extractor;
use crate::services::skill::skill_repo::{SkillRepo, SkillVersionDetail};
use crate::services::skill::skill_state::{LocalSkillState, SkillStateEntry, SkillStateStore, SyncMethod};
use crate::services::skill::skill_storage::SkillCache;

#[derive(Debug, Error)]
pub enum DispatchServiceError {
    #[error("repo: {0}")]
    Repo(#[from] crate::services::skill::skill_repo::RepoError),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("dispatch: {0}")]
    Dispatch(#[from] skill_dispatcher::DispatchError),
    #[error("cache: {0}")]
    Cache(#[from] crate::services::skill::skill_storage::CacheError),
    #[error("skill version not found")]
    VersionMissing,
}

pub struct SkillDispatchService {
    pub repo: SkillRepo,
    pub cache: SkillCache,
    pub ssot_root: PathBuf,
    pub state: SkillStateStore,
    pub per_skill_locks: Arc<RwLock<std::collections::HashMap<String, Arc<tokio::sync::Mutex<()>>>>>,
}

impl SkillDispatchService {
    pub fn new(repo: SkillRepo, cache_root: PathBuf, ssot_root: PathBuf, state_path: PathBuf) -> Self {
        Self {
            repo,
            cache: SkillCache::new(cache_root),
            ssot_root,
            state: SkillStateStore::new(state_path),
            per_skill_locks: Arc::new(RwLock::new(std::collections::HashMap::new())),
        }
    }

    async fn lock_for(&self, skill_id: &str) -> Arc<tokio::sync::Mutex<()>> {
        let mut g = self.per_skill_locks.write().await;
        g.entry(skill_id.to_string())
            .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
            .clone()
    }

    pub async fn install_to_local(&self, skill_id: &str, skill_name: &str, version: &str) -> Result<(), DispatchServiceError> {
        let _lk = self.lock_for(skill_id).lock().await;

        let detail = self.repo.get_version(skill_id, version).await?;
        let cache_path = self.cache.path_for(skill_id, &detail.version, &detail.content_hash);
        if !self.cache.is_cached(&cache_path) {
            self.cache.ensure_parent(&cache_path)?;
            self.repo.download_zip(&detail.download_url, &cache_path).await?;
        }
        let bytes = tokio::fs::read(&cache_path).await?;

        let tmp = self.ssot_root.join(format!(".{}.tmp-{}", skill_name, uuid::Uuid::new_v4().simple()));
        tokio::fs::create_dir_all(&tmp).await?;
        skill_extractor::extract(&bytes, &tmp)?;
        // 验证通过,原子 rename
        let final_dir = self.ssot_root.join(skill_name);
        if final_dir.exists() {
            tokio::fs::remove_dir_all(&final_dir).await?;
        }
        tokio::fs::rename(&tmp, &final_dir).await?;

        // 重分发到所有 enabled_harnesses
        self.dispatch_all_harnesses(skill_id).await?;
        Ok(())
    }

    pub async fn dispatch_all_harnesses(&self, skill_id: &str) -> Result<(), DispatchServiceError> {
        let state = self.state.read().await?;
        let Some(entry) = state.skills.get(skill_id).cloned() else { return Ok(()); };
        let skill_name = state.skills.get(skill_id)
            .and_then(|_| self.resolve_skill_name(skill_id))
            .unwrap_or_default();
        let source = self.ssot_root.join(&skill_name);
        for harness_name in &entry.enabled_harnesses {
            let harness = parse_harness(harness_name);
            let Some(adapter) = get_adapter(harness) else { continue; };
            let target_root = state.harness_overrides.get(harness_name)
                .cloned()
                .map(PathBuf::from)
                .unwrap_or_else(|| (adapter.skills_dir)());
            let method = entry.sync_method.unwrap_or(state.global_sync_method);
            let dest = target_root.join(&skill_name);
            let target_exists = dest.exists();
            let outcome = skill_dispatcher::dispatch(DispatchRequest {
                skill_name: &skill_name,
                source_root: source.clone(),
                target_root: target_root.clone(),
                harness,
                method,
                force: false,
                target_exists,
            })?;
            log::info!("dispatched {:?} -> {:?} ({:?})", skill_id, outcome.dest, outcome.method_used);
        }
        Ok(())
    }

    fn resolve_skill_name(&self, _skill_id: &str) -> Option<String> {
        // MVP: 通过 ls ssot_root 取唯一子目录;后续通过 state 索引
        let entries = std::fs::read_dir(&self.ssot_root).ok()?;
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if name.starts_with('.') { continue; }
            return Some(name);
        }
        None
    }
}

fn parse_harness(s: &str) -> HarnessId {
    use HarnessId::*;
    match s {
        "claude" => Claude,
        "codex" => Codex,
        "opencode" => OpenCode,
        "gemini" => Gemini,
        "grokbuild" => GrokBuild,
        "hermes" => Hermes,
        "pi" => Pi,
        "claude-desktop" => ClaudeDesktop,
        "openclaw" => OpenClaw,
        _ => Claude,
    }
}
```

需要 `log`, `uuid`(feature v4)。

- [ ] **Step 2: 编译 + 提交**

```bash
cd D:/workspace/agents-plus/src-tauri && cargo check && \
cd D:/workspace/agents-plus && \
git add src-tauri/src/services/skill/skill_dispatch.rs && \
git commit -m "feat(client): skill_dispatch orchestrator with cache + per-skill lock"
```

---

## Phase 10: 客户端 IPC commands

### Task 30: commands/skill.rs

**Files:**
- Create: `D:/workspace/agents-plus/src-tauri/src/commands/skill.rs`

- [ ] **Step 1: 实现**

```rust
// commands/skill.rs
use crate::services::skill::harness_registry::HarnessId;
use crate::services::skill::skill_dispatch::SkillDispatchService;
use crate::services::skill::skill_repo::{SkillRepo, SkillSummary};
use crate::services::skill::skill_state::SyncMethod;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;

pub struct SkillState {
    pub service: Arc<tokio::sync::Mutex<Option<SkillDispatchService>>>,
}

#[tauri::command]
pub async fn list_skills(
    state: tauri::State<'_, SkillState>,
    scope: String,
    access_token: String,
    base_url: String,
) -> Result<Vec<SkillSummary>, String> {
    let repo = SkillRepo::new(base_url, access_token);
    repo.list_skills(&scope).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn install_to_local(
    state: tauri::State<'_, SkillState>,
    skill_id: String,
    skill_name: String,
    version: String,
) -> Result<(), String> {
    let svc = { state.service.lock().await.clone() };
    let svc = svc.ok_or_else(|| "skill service not initialized".to_string())?;
    svc.install_to_local(&skill_id, &skill_name, &version)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_harness_enabled(
    state: tauri::State<'_, SkillState>,
    skill_id: String,
    harness: String,
    enabled: bool,
) -> Result<(), String> {
    let svc = { state.service.lock().await.clone() };
    let svc = svc.ok_or_else(|| "skill service not initialized".to_string())?;
    let mut s = svc.state.read().await.map_err(|e| e.to_string())?;
    let entry = s.skills.entry(skill_id.clone()).or_insert_with(|| {
        crate::services::skill::skill_state::SkillStateEntry {
            enabled_harnesses: vec![],
            sync_method: None,
            last_synced_version: None,
            last_synced_at: None,
            last_install_error: None,
        }
    });
    if enabled && !entry.enabled_harnesses.contains(&harness) {
        entry.enabled_harnesses.push(harness.clone());
    } else if !enabled {
        entry.enabled_harnesses.retain(|h| h != &harness);
    }
    svc.state.write(&s).await.map_err(|e| e.to_string())?;
    drop(s);
    svc.dispatch_all_harnesses(&skill_id).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn scan_local_state(
    state: tauri::State<'_, SkillState>,
) -> Result<crate::services::skill::skill_state::LocalSkillState, String> {
    let svc = { state.service.lock().await.clone() };
    let svc = svc.ok_or_else(|| "skill service not initialized".to_string())?;
    svc.state.read().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_sync_method(
    state: tauri::State<'_, SkillState>,
    method: SyncMethod,
) -> Result<(), String> {
    let svc = { state.service.lock().await.clone() };
    let svc = svc.ok_or_else(|| "skill service not initialized".to_string())?;
    let mut s = svc.state.read().await.map_err(|e| e.to_string())?.clone();
    s.global_sync_method = method;
    svc.state.write(&s).await.map_err(|e| e.to_string())
}
```

- [ ] **Step 2: 编译 + 提交**

```bash
cd D:/workspace/agents-plus/src-tauri && cargo check && \
cd D:/workspace/agents-plus && \
git add src-tauri/src/commands/skill.rs && \
git commit -m "feat(client): skill IPC commands skeleton"
```

---

### Task 31: lib.rs 注册 commands + SkillState 初始化

**Files:**
- Modify: `D:/workspace/agents-plus/src-tauri/src/lib.rs`

- [ ] **Step 1: 注册 commands**

在 `tauri::generate_handler!` 列表里追加:

```rust
commands::skill::list_skills,
commands::skill::install_to_local,
commands::skill::set_harness_enabled,
commands::skill::scan_local_state,
commands::skill::set_sync_method,
```

在 `setup` 闭包里初始化 SkillState(取 home 目录、cache 路径、ssot 路径):

```rust
.setup(|app| {
    let home = dirs::home_dir().expect("home dir");
    let cache_root = home.join(".agents-plus").join("cache").join("skills");
    let ssot_root = home.join(".agents-plus").join("skills");
    let state_path = home.join(".agents-plus").join("skills-state.json");
    // access_token/base_url 从 session 读;MVP 留空,前端透传
    let repo = crate::services::skill::skill_repo::SkillRepo::new(
        std::env::var("API_BASE_URL").unwrap_or_else(|_| "http://localhost:19999".into()),
        String::new(),
    );
    let svc = crate::services::skill::skill_dispatch::SkillDispatchService::new(
        repo, cache_root, ssot_root, state_path,
    );
    app.manage(crate::commands::skill::SkillState {
        service: Arc::new(tokio::sync::Mutex::new(Some(svc))),
    });
    Ok(())
})
```

需要 `dirs` 已加;`Arc` 已在 prelude。

- [ ] **Step 2: 编译**

Run: `cd D:/workspace/agents-plus/src-tauri && cargo check`
Expected: Finished

- [ ] **Step 3: 提交**

```bash
cd D:/workspace/agents-plus && \
git add src-tauri/src/lib.rs && \
git commit -m "feat(client): wire skill commands and bootstrap SkillDispatchService"
```

---

## Phase 11: 前端契约 + API 包装

### Task 32: 前端 skill 类型契约

**Files:**
- Modify: `D:/workspace/agents-plus/src/lib/contracts.ts`

- [ ] **Step 1: 在文件末尾追加**

```typescript
// === Skills ===
export interface SkillSummary {
  id: string;
  name: string;
  displayName: string | null;
  description: string | null;
  sourceType: string;
  latestVersion: string | null;
  hasUpdateAvailable: boolean | null;
}

export interface SkillVersionDetail {
  id: string;
  skillId: string;
  version: string;
  sizeBytes: number;
  contentHash: string;
  changelog: string | null;
  downloadUrl: string;
  downloadUrlExpiresAt: string;
  publishedAt: string;
}

export interface PendingSkillUpdate {
  skillId: string;
  skillName: string;
  currentVersion: string | null;
  newVersion: string | null;
  changelog: string | null;
}

export type SyncMethod = "auto" | "symlink" | "copy";

export type HarnessId =
  | "claude"
  | "codex"
  | "opencode"
  | "gemini"
  | "grokbuild"
  | "hermes"
  | "pi"
  | "claude-desktop"
  | "openclaw";
```

- [ ] **Step 2: 编译 + 提交**

```bash
cd D:/workspace/agents-plus && \
pnpm tsc --noEmit && \
git add src/lib/contracts.ts && \
git commit -m "feat(frontend): skill types in contracts"
```

---

### Task 33: 前端 skills API 包装

**Files:**
- Create: `D:/workspace/agents-plus/src/features/skills/api.ts`

- [ ] **Step 1: 实现**

```typescript
import { invoke } from "@/lib/tauri";
import type {
  SkillSummary,
  PendingSkillUpdate,
  SyncMethod,
  HarnessId,
} from "@/lib/contracts";

export const skillsApi = {
  list(scope: "personal" | "org"): Promise<SkillSummary[]> {
    return invoke("list_skills", { scope });
  },
  installToLocal(skillId: string, skillName: string, version: string): Promise<void> {
    return invoke("install_to_local", { skillId, skillName, version });
  },
  setHarnessEnabled(skillId: string, harness: HarnessId, enabled: boolean): Promise<void> {
    return invoke("set_harness_enabled", { skillId, harness, enabled });
  },
  scanLocalState(): Promise<unknown> {
    return invoke("scan_local_state");
  },
  setSyncMethod(method: SyncMethod): Promise<void> {
    return invoke("set_sync_method", { method });
  },
};
```

- [ ] **Step 2: 编译 + 提交**

```bash
cd D:/workspace/agents-plus && \
pnpm tsc --noEmit && \
git add src/features/skills/api.ts && \
git commit -m "feat(frontend): skills api wrapper"
```

---

## Phase 12: 前端 UI

### Task 34: zustand skill store

**Files:**
- Create: `D:/workspace/agents-plus/src/features/skills/store.ts`

- [ ] **Step 1: 实现**

```typescript
"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { skillsApi } from "./api";
import type { HarnessId, SkillSummary, SyncMethod } from "@/lib/contracts";

interface SkillStoreState {
  skills: SkillSummary[];
  enabledHarnesses: Record<string, HarnessId[]>;
  syncMethod: SyncMethod;
  pendingUpdatesCount: number;
  loading: boolean;
  error: string | null;

  refresh: (scope: "personal" | "org") => Promise<void>;
  setHarnessEnabled: (skillId: string, harness: HarnessId, enabled: boolean) => Promise<void>;
  setSyncMethod: (method: SyncMethod) => Promise<void>;
}

export const useSkillStore = create<SkillStoreState>()(
  persist(
    (set, get) => ({
      skills: [],
      enabledHarnesses: {},
      syncMethod: "auto",
      pendingUpdatesCount: 0,
      loading: false,
      error: null,

      refresh: async (scope) => {
        set({ loading: true, error: null });
        try {
          const skills = await skillsApi.list(scope);
          set({ skills, loading: false });
        } catch (e) {
          set({ error: (e as Error).message, loading: false });
        }
      },
      setHarnessEnabled: async (skillId, harness, enabled) => {
        const next = { ...get().enabledHarnesses };
        const list = new Set(next[skillId] ?? []);
        if (enabled) list.add(harness); else list.delete(harness);
        next[skillId] = Array.from(list);
        set({ enabledHarnesses: next });
        await skillsApi.setHarnessEnabled(skillId, harness, enabled);
      },
      setSyncMethod: async (method) => {
        set({ syncMethod: method });
        await skillsApi.setSyncMethod(method);
      },
    }),
    {
      name: "skills-store",
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
```

- [ ] **Step 2: 编译 + 提交**

```bash
cd D:/workspace/agents-plus && \
pnpm tsc --noEmit && \
git add src/features/skills/store.ts && \
git commit -m "feat(frontend): skills zustand store with session persist"
```

---

### Task 35: Skill 列表页 + Sidebar 入口

**Files:**
- Create: `D:/workspace/agents-plus/src/features/skills/components/SkillList.tsx`
- Create: `D:/workspace/agents-plus/src/features/skills/index.ts`
- Modify: `D:/workspace/agents-plus/src/app/(app)/skills/page.tsx`(新建)
- Modify: `D:/workspace/agents-plus/src/features/app/components/app-sidebar.tsx`(追加菜单项)

- [ ] **Step 1: SkillList 组件**

```tsx
"use client";
import { useEffect } from "react";
import { useSkillStore } from "../store";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function SkillList() {
  const { skills, loading, error, refresh } = useSkillStore();
  useEffect(() => { void refresh("personal"); }, [refresh]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">加载中…</div>;
  if (error) return <div className="p-6 text-sm text-destructive">{error}</div>;

  return (
    <div className="grid gap-4 p-6">
      {skills.length === 0 && <div className="text-sm text-muted-foreground">暂无 skill,可以从右上角导入或新建。</div>}
      {skills.map((s) => (
        <Card key={s.id} className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-base font-medium">{s.displayName ?? s.name}</div>
              <div className="text-xs text-muted-foreground">{s.name}</div>
              {s.description && <div className="mt-2 text-sm">{s.description}</div>}
            </div>
            <div className="flex gap-2">
              <Badge variant="outline">{s.sourceType}</Badge>
              {s.latestVersion && <Badge>{s.latestVersion}</Badge>}
              {s.hasUpdateAvailable && <Badge variant="destructive">有更新</Badge>}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: index.ts**

```typescript
export { SkillList } from "./components/SkillList";
export { useSkillStore } from "./store";
```

- [ ] **Step 3: 路由页面**

```tsx
// src/app/(app)/skills/page.tsx
import { SkillList } from "@/features/skills";
export default function SkillsPage() {
  return (
    <main className="flex-1 p-0">
      <SkillList />
    </main>
  );
}
```

- [ ] **Step 4: Sidebar 菜单项**

在 `app-sidebar.tsx` 的菜单数组里追加:

```typescript
{ title: "Skills", href: "/skills", icon: Sparkles },
```

(若 `Sparkles` 不在已有 icon 集,从 `lucide-react` 引入。)

- [ ] **Step 5: 编译 + 提交**

```bash
cd D:/workspace/agents-plus && \
pnpm tsc --noEmit && \
git add src/features/skills/ src/app/(app)/skills/ \
        src/features/app/components/app-sidebar.tsx && \
git commit -m "feat(frontend): skill list page and sidebar entry"
```

---

### Task 36: Harness 分发面板 + 离线横幅 + 更新 Badge

**Files:**
- Create: `D:/workspace/agents-plus/src/features/skills/components/HarnessDistribution.tsx`
- Create: `D:/workspace/agents-plus/src/features/skills/components/PendingUpdatesBadge.tsx`
- Create: `D:/workspace/agents-plus/src/features/skills/components/OfflineBanner.tsx`
- Modify: `D:/workspace/agents-plus/src/features/skills/index.ts`

- [ ] **Step 1: HarnessDistribution**

```tsx
"use client";
import { useSkillStore } from "../store";
import type { HarnessId } from "@/lib/contracts";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";

const HARNESSES: { id: HarnessId; label: string }[] = [
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "opencode", label: "OpenCode" },
  { id: "gemini", label: "Gemini" },
  { id: "grokbuild", label: "GrokBuild" },
  { id: "hermes", label: "Hermes" },
  { id: "pi", label: "Pi" },
];

export function HarnessDistribution({ skillId }: { skillId: string }) {
  const { enabledHarnesses, setHarnessEnabled } = useSkillStore();
  const current = new Set(enabledHarnesses[skillId] ?? []);
  return (
    <Card className="p-4">
      <div className="text-sm font-medium mb-2">分发到 Harness</div>
      <div className="grid grid-cols-2 gap-2">
        {HARNESSES.map((h) => (
          <label key={h.id} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={current.has(h.id)}
              onCheckedChange={(v) => void setHarnessEnabled(skillId, h.id, Boolean(v))}
            />
            {h.label}
          </label>
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: PendingUpdatesBadge + OfflineBanner**

```tsx
// PendingUpdatesBadge.tsx
"use client";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { skillsApi } from "../api";

export function PendingUpdatesBadge() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const list = await skillsApi.list("personal");
        if (!cancel) setCount(list.filter((s) => s.hasUpdateAvailable).length);
      } catch { /* offline */ }
    })();
    return () => { cancel = true; };
  }, []);
  if (count === 0) return null;
  return <Badge variant="destructive">{count} 个更新</Badge>;
}
```

```tsx
// OfflineBanner.tsx
"use client";
import { useEffect, useState } from "react";

export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  if (online) return null;
  return (
    <div className="bg-yellow-100 dark:bg-yellow-900 text-yellow-900 dark:text-yellow-100 text-sm px-4 py-2">
      当前离线,新建/订阅不可用;已缓存的 skill 仍可查看。
    </div>
  );
}
```

- [ ] **Step 3: 在 index.ts 导出**

```typescript
export { HarnessDistribution } from "./components/HarnessDistribution";
export { PendingUpdatesBadge } from "./components/PendingUpdatesBadge";
export { OfflineBanner } from "./components/OfflineBanner";
```

- [ ] **Step 4: 编译 + 提交**

```bash
cd D:/workspace/agents-plus && \
pnpm tsc --noEmit && \
git add src/features/skills/ && \
git commit -m "feat(frontend): harness distribution panel + offline banner + update badge"
```

---

## Phase 13: 端到端验证

### Task 37: 手动 E2E 剧本

**Files:**
- Create: `D:/workspace/agents-plus/docs/superpowers/e2e/2026-09-06-skill-management.md`

- [ ] **Step 1: 写剧本并提交**

```markdown
# Skill 管理 E2E 验证剧本

## 前置
- 启动后端:`cd D:/workspace/agents-plus-server && mvn spring-boot:run`
- 启动客户端:`cd D:/workspace/agents-plus && pnpm tauri dev`
- 登录一个测试账号

## 剧本

### P1 — 创建并分发 skill
- [ ] 侧边栏点 "Skills",列表空
- [ ] 准备本地 skill 目录 `~/tmp-skill/SKILL.md`(内容:`---\nname: tmp-skill\n---\n# tmp`)
- [ ] 打包成 zip,调用 import_from_zip(后端 API 或 UI 占位)
- [ ] 列表出现 `tmp-skill`,displayName 与 description 从 frontmatter 解析
- [ ] 打开详情,勾选 Claude harness
- [ ] 验证 `~/.claude/skills/tmp-skill/SKILL.md` 存在

### P2 — 跨设备/重启一致
- [ ] 完全退出应用,重启
- [ ] Skills 列表仍显示 `tmp-skill`
- [ ] Claude harness 仍启用

### P3 — 升级流程
- [ ] 修改本地 zip 后重新 publish 新版本
- [ ] UI 弹 "有更新" badge
- [ ] 点升级,SSOT 中 SKILL.md 内容更新,harness 副本也更新

### P4 — 不点升级
- [ ] 又一次 publish 新版本
- [ ] badge 出现,但不点升级
- [ ] SSOT 仍是旧版本

### P5 — 离线
- [ ] 关网络,启动应用
- [ ] "离线"横幅显示
- [ ] 已缓存 skill 可查看
- [ ] 启网络,横幅消失

### P6 — 删除
- [ ] 删除 skill
- [ ] SSOT 清理,所有 harness 副本清理
```

- [ ] **Step 2: 提交**

```bash
cd D:/workspace/agents-plus && \
git add docs/superpowers/e2e/ && \
git commit -m "docs(e2e): skill management end-to-end checklist"
```

---

## 附录 A: 文件结构总览

```
agents-plus-server/
├── pom.xml                                          # +minio, +flyway, +okhttp
├── src/main/resources/
│   ├── application.yml                              # +minio, +skills
│   └── db/migration/
│       ├── V20260906_01__create_t_skills.sql
│       ├── V20260906_02__create_t_skill_versions.sql
│       └── V20260906_03__create_t_skill_subscriptions.sql
└── src/main/java/com/krmeow/agentsplus/
    ├── common/ErrorCode.java                        # +11 skill codes
    ├── controller/
    │   ├── SkillController.java
    │   ├── SkillVersionController.java
    │   ├── SkillImportController.java
    │   ├── SkillSubscriptionController.java
    │   └── SkillNotificationController.java
    ├── dto/SkillDtos.java
    ├── entity/
    │   ├── SkillEntity.java
    │   ├── SkillVersionEntity.java
    │   └── SkillSubscriptionEntity.java
    ├── infrastructure/MinioClientConfig.java
    ├── mapper/
    │   ├── SkillMapper.java
    │   ├── SkillVersionMapper.java
    │   └── SkillSubscriptionMapper.java
    ├── repository/SkillRepository.java
    └── service/
        ├── SkillService.java
        ├── SkillVersionService.java
        ├── SkillImportService.java
        ├── SkillStorage.java
        ├── SkillSubscriptionService.java
        └── SkillUpdateWorker.java

agents-plus/
├── src-tauri/Cargo.toml                              # +zip, +walkdir, +dirs, +regex, +once_cell, +thiserror
├── src-tauri/src/
│   ├── lib.rs                                        # +commands/skill 注册 + SkillState 初始化
│   ├── commands/skill.rs
│   └── services/skill/
│       ├── mod.rs
│       ├── harness_registry.rs (+ _test.rs)
│       ├── skill_name.rs (+ _test.rs)
│       ├── skill_state.rs (+ _test.rs)
│       ├── skill_extractor.rs (+ _test.rs)
│       ├── skill_dispatcher.rs (+ _test.rs)
│       ├── skill_repo.rs
│       ├── skill_storage.rs
│       └── skill_dispatch.rs
└── src/
    ├── lib/contracts.ts                              # +skill types
    ├── app/(app)/skills/page.tsx                     # new
    └── features/skills/
        ├── index.ts
        ├── api.ts
        ├── store.ts
        └── components/
            ├── SkillList.tsx
            ├── HarnessDistribution.tsx
            ├── PendingUpdatesBadge.tsx
            └── OfflineBanner.tsx
```

---

## 附录 B: 已知遗留 / 后续 Task

| 项 | 说明 |
|---|---|
| Task 19 内的 skills.sh HTML 解析 | 当前抛 SKILL_SOURCE_FETCH_FAILED,后续增量 |
| Task 15/17 的 frontmatter 解析(SKILL.md → display_name/description) | 当前直接落盘,服务端 list 时不解析,后续增量 |
| Worker 写 t_notifications 表 | 当前仅置 `has_update_available=true`,通知端点读它 |
| 组织空间订阅 UI | API 预留,UI 等组织重构 P3 |
| skill 评分/标签/搜索 | 后续 |
| harness override settings UI | 当前仅 JSON,UI 后置 |
| E2E 自动化 | 当前手动剧本,Playwright/Tauri-driver 后续 |
