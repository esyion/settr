# 组织下发闭环实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打通组织下发闭环——ORG skill 创建/发布、RBAC 分发(policy+skill)、可见性统一、服务端聚合生效、管理端分发 UI、成员端自动生效。

**Architecture:** 后端沿 Spring Boot 三层(Controller→Service→ServiceImpl→Repository→Mapper)扩展 skill/policy 两个域;前端按 features 垂直切片扩展 `skills`/`policies`/`context`,共享 `DistributeDialog` 放 `src/components`;Tauri Rust 层零改动。

**Tech Stack:** Spring Boot 4.1/MyBatis-Plus/Flyway/H2(test)/JUnit5+Mockito;Next.js/React/zustand/shadcn/vitest;pnpm。

**Spec:** `docs/superpowers/specs/2026-09-08-org-distribution-design.md`(本计划从中论证,执行者须同读)

## Global Constraints

以下约束适用每个任务,摘自两份 AGENTS.md,逐条硬性执行:

- 后端分层:Controller 禁止直接调 Repository/Mapper;ServiceImpl 是业务唯一入口;Repository 封装 Mapper;复杂 SQL 放 XML 显式列字段,禁止 `select *`(`agents-plus-server/AGENTS.md` §一)
- Controller 入参必须 `@Valid`;所有 service 实现类实现 `ProxySelf`;构造器注入(`agents-plus-server/AGENTS.md` §一)
- **所有方法必须加 docstring/javadoc**;禁止兼容旧逻辑(开发期,直接改契约);禁止最小实现(`agents-plus-server/AGENTS.md` 核心原则 1-3)
- Entity 不直接作响应;DTO 与 Entity 分离;ID 跨边界一律字符串雪花(`agents-plus-server/AGENTS.md` §一.7;`agents-plus/AGENTS.md` §5)
- 权限不足一律 `ACCESS_DENIED`;业务异常走 `BusinessException + ErrorCode + ApiResponse`(`agents-plus-server/AGENTS.md` §三)
- 前端统一走 feature 的 `api.ts` gateway,组件内禁止散落 invoke/fetch(`agents-plus/AGENTS.md` §4.1)
- 单文件非必要 ≤300 行(`agents-plus/AGENTS.md` §4.1/4.2)
- 前端 ID 全 string,禁止 `parseInt`/`Number` 收窄(`agents-plus/AGENTS.md` §5)
- 前端五态覆盖:loading/success/empty/error/retry(`agents-plus/AGENTS.md` §6)
- 门禁:后端 `mvn clean test` + `mvn package -DskipTests`;前端 `pnpm build` + `pnpm vitest run`;Rust 侧本计划零改动
- 两个独立 git 仓库:后端命令在 `agents-plus-server/` 执行,前端在 `agents-plus/` 执行;Conventional Commits
- 本计划的 spec/plan 文档本身不提交 git(用户要求)

**测试基建事实**(写测试前必读):
- 后端测试 = 纯 JUnit5 + Mockito,按域分包(`src/test/java/com/krmeow/agentsplus/skill/`、`organization/`);`CurrentPrincipal(1L, "d", "s")` 三参构造;`UserThreadLocal.set(principal)` / `@AfterEach UserThreadLocal.clear()`
- `AgentsPlusServerApplicationTests` 以 `@ActiveProfiles("test")` 启动 H2(`jdbc:h2:mem:...;MODE=PostgreSQL`)+ Flyway → migration 错误会在该测试暴露
- 服务构造器(测试 setup 现状):
  - `new SkillServiceImpl(skillRepository, skillVersionRepository, skillSubscriptionRepository, membershipRepository, teamMembershipRepository, authorizationService, skillStorage)`
  - `new SkillDistributionServiceImpl(distributionRepository, skillRepository, membershipRepository, teamRepository, teamMembershipRepository, authorizationService)`
  - `new SkillSubscriptionServiceImpl(skillRepository, skillSubscriptionRepository, skillDistributionRepository, membershipRepository, teamMembershipRepository, authorizationService)`
  - `SkillVersionServiceImpl` 构造依赖:`skillRepository, skillVersionRepository, skillSubscriptionRepository, skillStorage, skillZipValidator, authorizationService, skillsProperties, objectMapper`
- 本计划 Task 2/3/4/5 会给部分构造器**新增依赖**,对应测试 setup 必须同步加 mock(任务内已写明)

---

## Phase A:后端(agents-plus-server)

### Task 1:V8 migration——skill RBAC 权限点与矩阵

**Files:**
- Create: `src/main/resources/db/migration/V8__skill_rbac_permissions.sql`

**Interfaces:**
- Produces: 权限码 `skill:manage`、`skill:distribute`(Task 2/4/5 的 `requirePermission` 依赖此码存在;H2 + 生产库由 Flyway 保证)

- [x] **Step 1:编写 migration(风格沿用 V2:31-43 的 insert...select)**

```sql
-- V8: 组织 skill 资产管理与分发权限点
-- 规格: agents-plus/docs/superpowers/specs/2026-09-08-org-distribution-design.md §5.1
insert into t_permission (id, perm_code, perm_name, perm_type, parent_id, sort_order, status, created_at, updated_at)
values (2200000000000000013, 'skill:manage', '管理组织 skill', 3, 0, 13, 1, now(), now()),
       (2200000000000000014, 'skill:distribute', '分发组织 skill', 3, 0, 14, 1, now(), now());

insert into t_role_permission (id, role_id, permission_id, created_at, updated_at)
select nextval('seq_role_permission'), r.id, p.id, now(), now()
from t_role r
         join t_permission p on true
where p.perm_code in ('skill:manage', 'skill:distribute')
  and (r.role_code in ('ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN')
    or (r.role_code = 'TEAM_ADMIN' and p.perm_code = 'skill:distribute'));
```

说明:ID `2200000000000000013/14` 紧接 V2 的 `...012`;OWNER/ADMIN 拿两点,TEAM_ADMIN 仅 `skill:distribute`;"TEAM_ADMIN 仅本 team"不在此表达,由 `hasPermission` 的 `ur.team_id` 行匹配在运行时裁决(UserRoleMapper.xml:60-64)。

- [x] **Step 2:运行启动测试验证 Flyway 可执行**

Run: `mvn test -Dtest=AgentsPlusServerApplicationTests`
Expected: PASS(H2 上建表/种子全部成功;SQL 语法错或 ID 冲突会 FAIL)

- [x] **Step 3:Commit**

```bash
git add src/main/resources/db/migration/V8__skill_rbac_permissions.sql
git commit -m "feat: add skill:manage and skill:distribute RBAC seed (V8)"
```

---

### Task 2:CreateSkillRequest 支持归属组织

**Files:**
- Modify: `src/main/java/com/krmeow/agentsplus/dto/SkillDtos.java:39-51`(CreateSkillRequest)
- Modify: `src/main/java/com/krmeow/agentsplus/service/impl/SkillServiceImpl.java`(create :55-90)
- Test: `src/test/java/com/krmeow/agentsplus/skill/SkillServiceTest.java`

**Interfaces:**
- Produces: `CreateSkillRequest(name, displayName, description, sourceType, sourceUrl, sourceRef, ownerScope: SkillOwnerScope /*nullable*/, orgId: String /*nullable*/)`;`SkillServiceImpl.isVisible(SkillEntity, CurrentPrincipal)` 将在 Task 3 加入同一类
- Consumes: `authorizationService.requirePermission(principal, orgId, null, null, "skill:manage")`;`membershipRepository.findActive(orgId, userId)`(已有方法)

- [x] **Step 1:写失败测试(追加到 SkillServiceTest,并在文件底部加 helper)**

```java
/**
 * 构造 org 归属请求的 helper。
 */
private CreateSkillRequest orgReq(String name, String orgId) {
    return new CreateSkillRequest(name, "Display", "Desc",
            SkillSourceType.LOCAL, null, null, SkillOwnerScope.ORG, orgId);
}

/**
 * 有 skill:manage 的管理员创建 org skill:归属 ORG + orgId,不写个人订阅。
 */
@Test
void createsOrgSkillWithManagePermission() {
    when(membershipRepository.findActive(10L, 1L)).thenReturn(new MembershipEntity());
    service.create(orgReq("org-skill", "10"));
    var captor = org.mockito.ArgumentMatchers.argThat(
            (SkillEntity e) -> e.getOwnerScope() == SkillOwnerScope.ORG
                    && Long.valueOf(10L).equals(e.getOrgId()));
    org.mockito.Mockito.verify(skillRepository).save(captor);
    org.mockito.Mockito.verify(skillSubscriptionRepository, org.mockito.Mockito.never())
            .save(org.mockito.ArgumentMatchers.any());
}

/**
 * ORG 归属缺 orgId:400。
 */
@Test
void rejectsOrgCreateWithoutOrgId() {
    var ex = org.junit.jupiter.api.Assertions.assertThrows(BusinessException.class,
            () -> service.create(orgReq("org-skill", null)));
    org.junit.jupiter.api.Assertions.assertEquals(ErrorCode.VALIDATION_ERROR, ex.getCode());
}

/**
 * ORG 归属但非本组织活跃成员:拒绝。
 */
@Test
void rejectsOrgCreateWhenNotActiveMember() {
    when(membershipRepository.findActive(10L, 1L)).thenReturn(null);
    org.junit.jupiter.api.Assertions.assertThrows(BusinessException.class,
            () -> service.create(orgReq("org-skill", "10")));
}
```

同时把既有 helper `req(String name)`(:72-74)的构造改为补两个 null:`new CreateSkillRequest(name, "Display", "Desc", SkillSourceType.LOCAL, null, null, null, null)`。

- [x] **Step 2:运行确认失败**

Run: `mvn test -Dtest=SkillServiceTest`
Expected: COMPILATION ERROR(CreateSkillRequest 尚无新参数)

- [x] **Step 3:改 DTO + create 实现**

`SkillDtos.java` CreateSkillRequest 追加两字段:

```java
    public record CreateSkillRequest(
            @NotBlank
            @Size(max = 128)
            @Pattern(regexp = "^[a-z0-9][a-z0-9-]{0,63}$", message = "skill 名称必须小写字母/数字/连字符,以字母或数字开头")
            String name,
            @Size(max = 256) String displayName,
            @Size(max = 4096) String description,
            @NotNull
            SkillSourceType sourceType,
            @Size(max = 2048) String sourceUrl,
            @Size(max = 2048) String sourceRef,
            @com.krmeow.agentsplus.common.enumsSkillOwnerScope注解不需要——直接:
            SkillOwnerScope ownerScope,
            @Size(max = 32) String orgId
    ) {
    }
```

(注意:文件头部已有 `import com.krmeow.agentsplus.common.enums.SkillOwnerScope;` 则直接用简单名;没有则补 import。)

`SkillServiceImpl.create` 重写归属段(替换 :72 `ownerScope(SkillOwnerScope.PERSONAL)` 所在 builder):

```java
    /**
     * 创建 skill:PERSONAL 归属当前用户并写 personal_create 订阅;ORG 归属请求体 orgId,
     * 要求 skill:manage 权限与活跃成员资格,不写个人订阅行(组织资产可见性走成员资格+分发)。
     */
    @Override
    public SkillResponse create(CreateSkillRequest request) {
        CurrentPrincipal principal = UserThreadLocal.currentUser();
        authorizationService.requireActiveDevice(principal);
        if (!namePattern().matcher(request.name()).matches()) {
            throw new BusinessException(ErrorCode.SKILL_NAME_INVALID);
        }
        if (skillRepository.findByName(request.name()).isPresent()) {
            throw new BusinessException(ErrorCode.SKILL_NAME_CONFLICT);
        }
        Instant now = Instant.now();
        SkillOwnerScope scope = request.ownerScope() == null ? SkillOwnerScope.PERSONAL : request.ownerScope();
        SkillEntity entity;
        if (scope == SkillOwnerScope.ORG) {
            Long orgId = parseSnowflake(request.orgId(), "orgId");
            authorizationService.requirePermission(principal, orgId, null, null, "skill:manage");
            if (membershipRepository.findActive(orgId, principal.userId()) == null) {
                throw new BusinessException(ErrorCode.ORGANIZATION_MEMBER_NOT_FOUND);
            }
            entity = SkillEntity.builder()
                    .name(request.name()).displayName(request.displayName())
                    .description(request.description()).sourceType(request.sourceType())
                    .sourceUrl(request.sourceUrl()).sourceRef(request.sourceRef())
                    .ownerScope(SkillOwnerScope.ORG).orgId(orgId)
                    .createdBy(principal.userId()).contentHash("")
                    .hasUpdateAvailable(false)
                    .build();
        } else {
            entity = SkillEntity.builder()
                    .name(request.name()).displayName(request.displayName())
                    .description(request.description()).sourceType(request.sourceType())
                    .sourceUrl(request.sourceUrl()).sourceRef(request.sourceRef())
                    .ownerScope(SkillOwnerScope.PERSONAL).ownerUserId(principal.userId())
                    .createdBy(principal.userId()).contentHash("")
                    .hasUpdateAvailable(false)
                    .build();
            skillSubscriptionRepository.save(SkillSubscriptionEntity.builder()
                    .userId(principal.userId()).skillId(entity.getId())
                    .source(SkillSubscriptionSource.PERSONAL_CREATE).subscribedAt(now)
                    .build());
        }
        skillRepository.save(entity);
        return toResponse(entity);
    }
```

并在 SkillServiceImpl 增加私有 helper(与 SkillDistributionServiceImpl.parseSnowflake 同实现,javadoc 必写):

```java
    /**
     * 解析雪花字符串 ID,空值或非数字抛 VALIDATION_ERROR。
     */
    private Long parseSnowflake(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, fieldName + " 不能为空");
        }
        try {
            return Long.parseLong(value.trim());
        } catch (NumberFormatException ex) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, fieldName + " 格式不合法");
        }
    }
```

同步修复**所有** CreateSkillRequest 构造调用点(编译器会全部指出;已知:`SkillServiceTest.req`、`SkillImportServiceImpl` 若构造该 record → 一律补 `null, null`,保持既有行为)。

- [x] **Step 4:运行确认通过**

Run: `mvn test -Dtest=SkillServiceTest`
Expected: PASS(新增 3 例 + 既有全绿)

- [x] **Step 5:Commit**

```bash
git add src/main/java/com/krmeow/agentsplus/dto/SkillDtos.java src/main/java/com/krmeow/agentsplus/service/impl/SkillServiceImpl.java src/test/java/com/krmeow/agentsplus/skill/SkillServiceTest.java
git commit -m "feat: allow creating org-scoped skills behind skill:manage"
```

---

### Task 3:可见性统一 + 订阅越权修复

**Files:**
- Modify: `src/main/java/com/krmeow/agentsplus/service/impl/SkillServiceImpl.java`(isVisibleTo :270-290 → isVisible)
- Modify: `src/main/java/com/krmeow/agentsplus/service/SkillService.java`(接口加 isVisible)
- Modify: `src/main/java/com/krmeow/agentsplus/service/impl/SkillVersionServiceImpl.java`(:153-160 requireVisibleSkill)
- Modify: `src/main/java/com/krmeow/agentsplus/service/impl/SkillSubscriptionServiceImpl.java`(subscribe)
- Test: `src/test/java/com/krmeow/agentsplus/skill/SkillSubscriptionServiceTest.java`、Create `src/test/java/com/krmeow/agentsplus/skill/SkillVersionServiceTest.java`

**Interfaces:**
- Produces: `boolean SkillService.isVisible(SkillEntity entity, CurrentPrincipal principal)`——Task 4 的 update/delete 与本任务 subscribe/requireVisibleSkill 共用
- Consumes: SkillServiceImpl 私有 `currentOrgContext(orgId)`(已存在)、`skillRepository.isOrgVisible(...)`(已存在)

- [x] **Step 1:写失败测试**

SkillSubscriptionServiceTest 追加(构造器 setup 同步加一行 `skillService = mock(SkillService.class);`,并把 `new SkillSubscriptionServiceImpl(...)` 末尾追传 `skillService`):

```java
/**
 * 无可见性的用户订阅 org skill:越权,拒绝。
 */
@Test
void rejectsSubscribeWhenSkillNotVisible() {
    var skill = sampleSkill(2L, 99L).toBuilder()
            .ownerScope(SkillOwnerScope.ORG).orgId(10L).build();
    when(skillRepository.findById(2L)).thenReturn(java.util.Optional.of(skill));
    when(skillService.isVisible(skill, principal)).thenReturn(false);
    var ex = org.junit.jupiter.api.Assertions.assertThrows(BusinessException.class,
            () -> service.subscribe("2"));
    org.junit.jupiter.api.Assertions.assertEquals(ErrorCode.SKILL_FORBIDDEN, ex.getCode());
}
```

新建 `SkillVersionServiceTest.java`(完整文件):

```java
package com.krmeow.agentsplus.skill;

import com.krmeow.agentsplus.common.context.CurrentPrincipal;
import com.krmeow.agentsplus.common.context.UserThreadLocal;
import com.krmeow.agentsplus.common.config.SkillsProperties;
import com.krmeow.agentsplus.common.enums.SkillOwnerScope;
import com.krmeow.agentsplus.common.error.BusinessException;
import com.krmeow.agentsplus.common.error.ErrorCode;
import com.krmeow.agentsplus.common.security.AuthorizationService;
import com.krmeow.agentsplus.entity.SkillEntity;
import com.krmeow.agentsplus.repository.SkillRepository;
import com.krmeow.agentsplus.repository.SkillSubscriptionRepository;
import com.krmeow.agentsplus.repository.SkillVersionRepository;
import com.krmeow.agentsplus.service.SkillService;
import com.krmeow.agentsplus.service.SkillStorage;
import com.krmeow.agentsplus.service.SkillZipValidator;
import com.krmeow.agentsplus.service.impl.SkillVersionServiceImpl;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Skill 版本服务单元测试:聚焦可见性判定(requireVisibleSkill → SkillService.isVisible)。
 */
class SkillVersionServiceTest {
    private SkillRepository skillRepository;
    private SkillVersionRepository versionRepository;
    private SkillService skillService;
    private SkillVersionServiceImpl service;
    private CurrentPrincipal principal;

    /**
     * 初始化 mock 与线程上下文。
     */
    @BeforeEach
    void setUp() {
        principal = new CurrentPrincipal(1L, "d", "s");
        skillRepository = mock(SkillRepository.class);
        versionRepository = mock(SkillVersionRepository.class);
        skillService = mock(SkillService.class);
        service = new SkillVersionServiceImpl(skillRepository, versionRepository,
                mock(SkillSubscriptionRepository.class), mock(SkillStorage.class),
                mock(SkillZipValidator.class), mock(AuthorizationService.class),
                mock(SkillsProperties.class), mock(tools.jackson.databind.ObjectMapper.class),
                skillService);
        UserThreadLocal.set(principal);
    }

    /**
     * 清理线程上下文。
     */
    @AfterEach
    void tearDown() {
        UserThreadLocal.clear();
    }

    /**
     * isVisible=true 时版本列表放行(组织分发命中成员场景)。
     */
    @Test
    void listVersionsAllowedWhenVisible() {
        var skill = orgSkill();
        when(skillRepository.findById(2L)).thenReturn(Optional.of(skill));
        when(skillService.isVisible(skill, principal)).thenReturn(true);
        when(versionRepository.findBySkillId(2L)).thenReturn(List.of());
        assertTrue(service.list("2").isEmpty());
    }

    /**
     * isVisible=false 时版本列表 403(修 F3 断链的回归用例)。
     */
    @Test
    void listVersionsDeniedWhenNotVisible() {
        var skill = orgSkill();
        when(skillRepository.findById(2L)).thenReturn(Optional.of(skill));
        when(skillService.isVisible(skill, principal)).thenReturn(false);
        var ex = assertThrows(BusinessException.class, () -> service.list("2"));
        assertEquals(ErrorCode.SKILL_FORBIDDEN, ex.getCode());
    }

    /**
     * 构造 ORG 归属 skill 样例。
     */
    private SkillEntity orgSkill() {
        return SkillEntity.builder().id(2L).name("alpha")
                .ownerScope(SkillOwnerScope.ORG).orgId(10L).build();
    }
}
```

(`SkillsProperties` 若无参构造可用可改 `new SkillsProperties()`,以编译器为准。)

- [x] **Step 2:运行确认失败**

Run: `mvn test -Dtest=SkillSubscriptionServiceTest,SkillVersionServiceTest`
Expected: COMPILATION ERROR(SkillService 无 isVisible;SkillVersionServiceImpl 构造器无第 9 参)

- [x] **Step 3:实现**

SkillService 接口加:

```java
    /**
     * 判定 skill 对当前主体可见:PERSONAL 为 owner 或显式订阅;ORG 为本组织活跃成员
     * 且(owner、显式订阅、组织分发命中三者其一)。版本读写、订阅入口统一走本判定。
     *
     * @param entity    skill 实体
     * @param principal 当前认证主体
     * @return true 表示可见
     */
    boolean isVisible(SkillEntity entity, CurrentPrincipal principal);
```

SkillServiceImpl:把 `isVisibleTo`(:270-290)重命名为 `isVisible` 并 `@Override`,逻辑保持(它已是目标语义);原内部调用点同步改名。`get`/`getByName` 的私有可见性检查若重复实现,一律收敛到 isVisible。

SkillVersionServiceImpl:构造器末尾新增 `SkillService skillService` 依赖;`requireVisibleSkill` 改为:

```java
    /**
     * 校验 skill 对当前主体可见,统一委托 SkillService.isVisible(修组织分发成员无法下载版本的断链)。
     *
     * @param skillId   skill ID
     * @param principal 当前认证主体
     */
    private void requireVisibleSkill(Long skillId, CurrentPrincipal principal) {
        SkillEntity entity = skillRepository.findById(skillId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SKILL_NOT_FOUND));
        if (!skillService.isVisible(entity, principal)) {
            throw new BusinessException(ErrorCode.SKILL_FORBIDDEN);
        }
    }
```

SkillSubscriptionServiceImpl:构造器末尾新增 `SkillService skillService`;`subscribe` 在 `requireActiveDevice` 之后插入:

```java
        if (!skillService.isVisible(skill, principal)) {
            throw new BusinessException(ErrorCode.SKILL_FORBIDDEN);
        }
```

(修越权洞:此前任何登录用户可订阅任意 skill 后借订阅关系拉取内容。)

- [x] **Step 4:全量编译并跑两个测试类**

Run: `mvn test -Dtest=SkillSubscriptionServiceTest,SkillVersionServiceTest,SkillServiceTest`
Expected: PASS(既有测试因构造器加参需同步补 mock —— 编译器指出后逐一添加,不加行为断言)

- [x] **Step 5:Commit**

```bash
git add -A src/main src/test
git commit -m "feat: unify skill visibility and block cross-tenant subscribe"
```

---

### Task 4:publish/update/delete 的 org 分支 + 活跃分发删除守卫

**Files:**
- Modify: `src/main/java/com/krmeow/agentsplus/common/error/ErrorCode.java`(:67 附近追加)
- Modify: `src/main/java/com/krmeow/agentsplus/service/impl/SkillVersionServiceImpl.java`(publish :97-160)
- Modify: `src/main/java/com/krmeow/agentsplus/service/impl/SkillServiceImpl.java`(update/delete)
- Test: `src/test/java/com/krmeow/agentsplus/skill/SkillVersionServiceTest.java`、`SkillServiceTest.java`

**Interfaces:**
- Consumes: `SkillService.isVisible`(Task 3)、`skill:distribute`/`skill:manage`(Task 1)
- Produces: `ErrorCode.SKILL_HAS_ACTIVE_DISTRIBUTION(40952)`;publish/update/delete 对 ORG skill 走 `skill:manage`

- [x] **Step 1:写失败测试**

SkillVersionServiceTest 追加:

```java
    /**
     * 管理员(skill:manage 放行)可为 org skill 发布版本。
     */
    @Test
    void publishOrgSkillAsAdminAllowed() {
        var skill = orgSkill();
        when(skillRepository.findByIdForUpdate(2L)).thenReturn(skill);
        when(skillVersionRepository.findBySkillIdAndVersion(2L, "1.0.0"))
                .thenReturn(java.util.Optional.empty());
        when(skillVersionRepository.save(org.mockito.ArgumentMatchers.any()))
                .thenAnswer(inv -> inv.getArgument(0));
        var zip = new com.krmeow.agentsplus.service.skillimport.InMemoryMultipartFile(
                "zip", "a.zip", "application/zip",
                java.util.zip.ZipEntry 简化——见下方说明);
    }
```

ZIP 逐字节构造过重;**实际写法**:publish 的 ZIP 校验与 MinIO 全部 mock 隔离——`skillZipValidator.validateAndRead(any(), anyLong(), any())` 返回 `new byte[]{1}`,`skillStorage.upload(any(), any(), any(), anyLong())` 返回 `new SkillStorage.StoredSkillZip("bucket", "key", 1L, "hash")`(record 形状以接口为准,执行时打开 `SkillStorage.java` 对齐)。完整测试:

```java
    /**
     * 管理员可为 org skill 发布版本(走 skill:manage 分支)。
     */
    @Test
    void publishOrgSkillAsAdminAllowed() throws Exception {
        var skill = orgSkill();
        when(skillRepository.findByIdForUpdate(2L)).thenReturn(skill);
        when(versionRepository.findBySkillIdAndVersion(2L, "1.0.0"))
                .thenReturn(java.util.Optional.empty());
        when(zipValidator.validateAndRead(org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.anyLong(), org.mockito.ArgumentMatchers.any()))
                .thenReturn(new byte[]{1});
        when(storage.upload(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyLong()))
                .thenReturn(new SkillStorage.StoredSkillZip("b", "k", 1L, "h"));
        when(versionRepository.save(org.mockito.ArgumentMatchers.any()))
                .thenAnswer(inv -> inv.getArgument(0));
        var resp = service.publish("2", zipFile(), new com.krmeow.agentsplus.dto.SkillDtos
                .CreateSkillVersionRequest("1.0.0", null));
        org.junit.jupiter.api.Assertions.assertEquals("1.0.0", resp.version());
        org.mockito.Mockito.verify(storage).presignDownload("b", "k");
    }

    /**
     * 无 skill:manage 的用户给 org skill 发版:拒绝。
     */
    @Test
    void publishOrgSkillWithoutManageDenied() throws Exception {
        var skill = orgSkill();
        when(skillRepository.findByIdForUpdate(2L)).thenReturn(skill);
        org.mockito.Mockito.doThrow(new BusinessException(ErrorCode.ACCESS_DENIED))
                .when(authorizationService).requirePermission(org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.eq(10L), org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq("skill:manage"));
        org.junit.jupiter.api.Assertions.assertThrows(BusinessException.class,
                () -> service.publish("2", zipFile(), new com.krmeow.agentsplus.dto.SkillDtos
                        .CreateSkillVersionRequest("1.0.0", null)));
    }

    /**
     * 构造非空 MultipartFile。
     */
    private org.springframework.web.multipart.MultipartFile zipFile() {
        return new com.krmeow.agentsplus.service.skillimport.InMemoryMultipartFile(
                "zip", "a.zip", "application/zip", new byte[]{1});
    }
```

setup 增加字段:`storage = mock(SkillStorage.class); zipValidator = mock(SkillZipValidator.class); authorizationService = mock(AuthorizationService.class);` 并传入构造器。

SkillServiceTest 追加(构造器加 `distributionRepository = mock(SkillDistributionRepository.class);` 传参):

```java
    /**
     * 存在活跃分发的 org skill 禁止删除。
     */
    @Test
    void deleteOrgSkillWithActiveDistributionBlocked() {
        var skill = SkillEntity.builder().id(2L).name("alpha")
                .ownerScope(SkillOwnerScope.ORG).orgId(10L).ownerUserId(1L).build();
        when(skillRepository.findById(2L)).thenReturn(java.util.Optional.of(skill));
        when(distributionRepository.findBySkill(2L))
                .thenReturn(java.util.List.of(new SkillDistributionEntity()));
        var ex = org.junit.jupiter.api.Assertions.assertThrows(BusinessException.class,
                () -> service.delete("2"));
        org.junit.jupiter.api.Assertions.assertEquals(
                ErrorCode.SKILL_HAS_ACTIVE_DISTRIBUTION, ex.getCode());
    }
```

- [x] **Step 2:运行确认失败**

Run: `mvn test -Dtest=SkillVersionServiceTest,SkillServiceTest`
Expected: FAIL(`SKILL_HAS_ACTIVE_DISTRIBUTION` 不存在;publish 走旧 owner 分支抛 403)

- [x] **Step 3:实现**

ErrorCode 追加:

```java
    SKILL_HAS_ACTIVE_DISTRIBUTION(40952, "skill 存在活跃分发,请先撤回"),
```

SkillVersionServiceImpl.publish 把 `:117-120` 的硬校验替换为双分支:

```java
        if (com.krmeow.agentsplus.common.enums.SkillOwnerScope.ORG.equals(skill.getOwnerScope())) {
            // 组织资产:skill:manage 决定发布权
            authorizationService.requirePermission(principal, skill.getOrgId(), null, null, "skill:manage");
        } else if (!skill.getOwnerUserId().equals(principal.userId())
                || !com.krmeow.agentsplus.common.enums.SkillOwnerScope.PERSONAL.equals(skill.getOwnerScope())) {
            throw new BusinessException(ErrorCode.SKILL_FORBIDDEN);
        }
```

SkillServiceImpl.update 与 delete 开头同样加双分支(org → `requirePermission(..., "skill:manage")`;personal → 仅 owner);delete 在双分支后再加守卫:

```java
        if (com.krmeow.agentsplus.common.enums.SkillOwnerScope.ORG.equals(entity.getOwnerScope())
                && !distributionRepository.findBySkill(entity.getId()).isEmpty()) {
            throw new BusinessException(ErrorCode.SKILL_HAS_ACTIVE_DISTRIBUTION);
        }
```

构造器新增 `SkillDistributionRepository distributionRepository` 依赖(`selectBySkill` 已过滤 `withdrawn=false and deleted=false`,命中即活跃)。

- [x] **Step 4:运行确认通过**

Run: `mvn test -Dtest=SkillVersionServiceTest,SkillServiceTest`
Expected: PASS

- [x] **Step 5:Commit**

```bash
git add -A src/main src/test
git commit -m "feat: org skill publish/update/delete behind skill:manage with distribution guard"
```

---

### Task 5:Skill 分发接入 RBAC(分发/撤回/列表三处权限上下文)

**Files:**
- Modify: `src/main/java/com/krmeow/agentsplus/service/impl/SkillDistributionServiceImpl.java`
- Test: `src/test/java/com/krmeow/agentsplus/skill/SkillDistributionServiceTest.java`

**Interfaces:**
- Consumes: `userRoleRepository.hasPermission(userId, organizationId, teamId, projectId, permissionCode)`(UserRoleRepository 已有,boolean 语义);`teamMembershipRepository.findTeamIdsByUserAndOrganization(userId, orgId)`(已有)
- Produces: distribute/withdraw/list 的行为契约——TEAM_ADMIN 仅可分发/撤回/查看本 team 分发;ORG/MEMBER scope 仅 org 级角色

- [x] **Step 1:写失败测试**

setup 增加 `userRoleRepository = mock(UserRoleRepository.class);` 传入构造器(第 7 参)。追加:

```java
    /**
     * TEAM_ADMIN(本 team 权限行)可分发到本 team。
     */
    @Test
    void teamAdminDistributesOwnTeam() {
        when(userRoleRepository.hasPermission(1L, 10L, 100L, null, "skill:distribute")).thenReturn(true);
        stubOrgSkill(); // helper: org skill id=2, orgId=10
        when(teamRepository.findById(100L)).thenReturn(team(100L, 10L));
        var resp = service.distribute(10L, "2", SkillDistributionScope.TEAM, "100", null);
        org.junit.jupiter.api.Assertions.assertEquals(SkillDistributionScope.TEAM,
                resp.scopeType());
    }

    /**
     * TEAM_ADMIN 对其他 team 无权限行:拒绝。
     */
    @Test
    void teamAdminDistributesOtherTeamDenied() {
        when(userRoleRepository.hasPermission(1L, 10L, 200L, null, "skill:distribute")).thenReturn(false);
        stubOrgSkill();
        var ex = org.junit.jupiter.api.Assertions.assertThrows(BusinessException.class,
                () -> service.distribute(10L, "2", SkillDistributionScope.TEAM, "200", null));
        org.junit.jupiter.api.Assertions.assertEquals(ErrorCode.ACCESS_DENIED, ex.getCode());
    }

    /**
     * 仅本 team 权限行的 TEAM_ADMIN 分发 ORGANIZATION 作用域(teamId=null 走 org 级行):拒绝。
     */
    @Test
    void teamAdminDistributesOrgScopeDenied() {
        when(userRoleRepository.hasPermission(1L, 10L, null, null, "skill:distribute")).thenReturn(false);
        stubOrgSkill();
        org.junit.jupiter.api.Assertions.assertThrows(BusinessException.class,
                () -> service.distribute(10L, "2", SkillDistributionScope.ORGANIZATION, null, null));
    }

    /**
     * 撤回以分发记录自身 scope/teamId 为权限上下文:TEAM_ADMIN 可撤本 team 分发。
     */
    @Test
    void teamAdminWithdrawsOwnTeamDistribution() {
        var dist = SkillDistributionEntity.builder().id(7L).skillId(2L).organizationId(10L)
                .scopeType(SkillDistributionScope.TEAM).teamId(100L).withdrawn(false).build();
        when(distributionRepository.findByOrganization(10L)).thenReturn(java.util.List.of(dist));
        when(userRoleRepository.hasPermission(1L, 10L, 100L, null, "skill:distribute")).thenReturn(true);
        when(distributionRepository.markWithdrawn(7L)).thenReturn(1);
        service.withdraw(10L, "7");
        org.mockito.Mockito.verify(distributionRepository).markWithdrawn(7L);
    }

    /**
     * 非 org 级角色的分发列表只含本 team 的 TEAM 分发。
     */
    @Test
    void listFilteredForTeamAdmin() {
        when(userRoleRepository.hasPermission(1L, 10L, null, null, "skill:distribute")).thenReturn(false);
        when(membershipRepository.findActive(10L, 1L)).thenReturn(new MembershipEntity());
        when(teamMembershipRepository.findTeamIdsByUserAndOrganization(1L, 10L)).thenReturn(java.util.List.of(100L));
        var own = SkillDistributionEntity.builder().id(1L).skillId(2L).organizationId(10L)
                .scopeType(SkillDistributionScope.TEAM).teamId(100L).withdrawn(false).build();
        var other = SkillDistributionEntity.builder().id(2L).skillId(3L).organizationId(10L)
                .scopeType(SkillDistributionScope.TEAM).teamId(200L).withdrawn(false).build();
        var orgWide = SkillDistributionEntity.builder().id(3L).skillId(4L).organizationId(10L)
                .scopeType(SkillDistributionScope.ORGANIZATION).withdrawn(false).build();
        when(distributionRepository.findByOrganization(10L))
                .thenReturn(java.util.List.of(own, other, orgWide));
        var result = service.listDistributions(10L);
        org.junit.jupiter.api.Assertions.assertEquals(1, result.size());
        org.junit.jupiter.api.Assertions.assertEquals(1L, Long.parseLong(result.get(0).id()));
    }
```

helper(文件内已有 sampleOrgSkill,可复用):

```java
    /**
     * stub 一个 ORG 归属 skill(id=2, orgId=10)。
     */
    private void stubOrgSkill() {
        when(skillRepository.findById(2L)).thenReturn(java.util.Optional.of(
                sampleOrgSkill(2L)));
    }
```

- [x] **Step 2:运行确认失败**

Run: `mvn test -Dtest=SkillDistributionServiceTest`
Expected: FAIL/编译错(构造器无第 7 参;行为仍是"活跃成员即可")

- [x] **Step 3:实现**

构造器追加 `UserRoleRepository userRoleRepository`(第 7 依赖)。三处改造:

distribute(把 `requireActiveMember(organizationId, principal.userId());` 删除,switch 解析 **之后**、目标存在性校验之前插入):

```java
        // 权限上下文 = 目标 team(TEAM scope);ORG/MEMBER scope 用 null 走 org 级角色行
        authorizationService.requirePermission(principal, organizationId, teamLongId, null, "skill:distribute");
```

注意顺序调整:先解析 `teamLongId/memberLongId`(原 switch 保留解析与"scope=TEAM 必传 teamId"校验),再权限,再 team/member 归属校验。

withdraw(在 `requireActiveMember` 位置替换;**权限在幂等返回之前**,防未授权探测):

```java
        CurrentPrincipal principal = UserThreadLocal.currentUser();
        authorizationService.requireActiveDevice(principal);
        SkillDistributionEntity e = distributionRepository.findByOrganization(organizationId).stream()
                .filter(d -> longId.equals(d.getId()))
                .findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.SKILL_NOT_FOUND,
                        "分发记录不存在或不属于本组织"));
        // 权限上下文 = 分发记录自身的作用域(TEAM_ADMIN 只能撤自己 team 的)
        authorizationService.requirePermission(principal, organizationId,
                e.getScopeType() == SkillDistributionScope.TEAM ? e.getTeamId() : null,
                null, "skill:distribute");
        if (Boolean.TRUE.equals(e.getWithdrawn())) {
            return; // 幂等
        }
        int rows = distributionRepository.markWithdrawn(longId);
        if (rows == 0) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "撤回未影响任何行");
        }
```

listDistributions(替换 `requireActiveMember`):

```java
        CurrentPrincipal principal = UserThreadLocal.currentUser();
        authorizationService.requireActiveDevice(principal);
        List<SkillDistributionEntity> all = distributionRepository.findByOrganization(organizationId);
        if (userRoleRepository.hasPermission(principal.userId(), organizationId, null, null, "skill:distribute")) {
            return all.stream().map(SkillDistributionResponse::from).toList();
        }
        MembershipEntity member = membershipRepository.findActive(organizationId, principal.userId());
        if (member == null) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED, "不是本组织成员");
        }
        List<Long> myTeamIds = teamMembershipRepository
                .findTeamIdsByUserAndOrganization(principal.userId(), organizationId);
        return all.stream()
                .filter(d -> d.getScopeType() == SkillDistributionScope.TEAM
                        && myTeamIds.contains(d.getTeamId()))
                .map(SkillDistributionResponse::from)
                .toList();
```

私有 `requireActiveMember` 方法被全部移除后若无引用则删除。

- [x] **Step 4:运行确认通过**

Run: `mvn test -Dtest=SkillDistributionServiceTest`
Expected: PASS

- [x] **Step 5:Commit**

```bash
git add -A src/main src/test
git commit -m "feat: enforce skill:distribute RBAC with per-operation scope context"
```

---

### Task 6:聚合生效接口(删除 teamId/projectId 参数)

**Files:**
- Modify: `src/main/resources/mapper/PolicyDocumentVersionMapper.xml:33-63`
- Modify: `src/main/java/com/krmeow/agentsplus/mapper/PolicyDocumentVersionMapper.java`
- Modify: `src/main/java/com/krmeow/agentsplus/repository/PolicyDocumentVersionRepository.java`(findEffective)
- Modify: `src/main/java/com/krmeow/agentsplus/service/PolicyService.java` + `service/impl/PolicyServiceImpl.java:179-192`
- Modify: `src/main/java/com/krmeow/agentsplus/controller/PolicyController.java:57-60`
- Test: Create `src/test/java/com/krmeow/agentsplus/organization/PolicyEffectiveAggregationTest.java`

**Interfaces:**
- Produces: `PolicyService.effective(Long organizationId)`(单参);`PolicyDocumentVersionRepository.findEffective(Long organizationId, Long memberId, List<Long> teamIds, PolicyType policyType)`
- Consumes: `membershipRepository.findActive(orgId, userId)`、`teamMembershipRepository.findTeamIdsByUserAndOrganization(userId, orgId)`

- [x] **Step 1:写失败测试**

```java
package com.krmeow.agentsplus.organization;

import com.krmeow.agentsplus.common.context.CurrentPrincipal;
import com.krmeow.agentsplus.common.context.UserThreadLocal;
import com.krmeow.agentsplus.common.enums.PolicyType;
import com.krmeow.agentsplus.common.error.BusinessException;
import com.krmeow.agentsplus.common.error.ErrorCode;
import com.krmeow.agentsplus.common.security.AuthorizationService;
import com.krmeow.agentsplus.entity.MembershipEntity;
import com.krmeow.agentsplus.repository.MembershipRepository;
import com.krmeow.agentsplus.repository.PolicyDocumentRepository;
import com.krmeow.agentsplus.repository.PolicyDocumentVersionRepository;
import com.krmeow.agentsplus.repository.PolicyDistributionRepository;
import com.krmeow.agentsplus.repository.PolicyReviewRequestRepository;
import com.krmeow.agentsplus.repository.ProjectRepository;
import com.krmeow.agentsplus.repository.TeamMembershipRepository;
import com.krmeow.agentsplus.repository.TeamRepository;
import com.krmeow.agentsplus.service.impl.PolicyServiceImpl;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 聚合生效解析单元测试:服务端从当前用户解析 member/team,客户端不传团队参数。
 */
class PolicyEffectiveAggregationTest {
    private MembershipRepository members;
    private TeamMembershipRepository teamMemberships;
    private PolicyDocumentVersionRepository versions;
    private PolicyServiceImpl service;

    /**
     * 初始化 mock 与线程上下文。
     */
    @BeforeEach
    void setUp() {
        members = mock(MembershipRepository.class);
        teamMemberships = mock(TeamMembershipRepository.class);
        versions = mock(PolicyDocumentVersionRepository.class);
        service = new PolicyServiceImpl(mock(PolicyDocumentRepository.class),
                mock(PolicyReviewRequestRepository.class), members,
                mock(AuthorizationService.class), versions,
                mock(PolicyDistributionRepository.class), mock(TeamRepository.class),
                mock(ProjectRepository.class));
        UserThreadLocal.set(new CurrentPrincipal(1L, "d", "s"));
    }

    /**
     * 清理线程上下文。
     */
    @AfterEach
    void tearDown() {
        UserThreadLocal.clear();
    }

    /**
     * 服务端解析 memberId 与 teamIds 并下推给 SQL;agent/claude 各解析一条。
     */
    @Test
    void resolvesMemberAndTeamsServerSide() {
        var member = new MembershipEntity();
        member.setId(5L);
        when(members.findActive(10L, 1L)).thenReturn(member);
        when(teamMemberships.findTeamIdsByUserAndOrganization(1L, 10L)).thenReturn(List.of(100L, 101L));
        service.effective(10L);
        org.mockito.Mockito.verify(versions).findEffective(10L, 5L, List.of(100L, 101L), PolicyType.AGENT);
        org.mockito.Mockito.verify(versions).findEffective(10L, 5L, List.of(100L, 101L), PolicyType.CLAUDE);
    }

    /**
     * 非活跃成员:40413。
     */
    @Test
    void rejectsNonMember() {
        when(members.findActive(10L, 1L)).thenReturn(null);
        var ex = assertThrows(BusinessException.class, () -> service.effective(10L));
        assertEquals(ErrorCode.ORGANIZATION_MEMBER_NOT_FOUND, ex.getCode());
    }
}
```

- [x] **Step 2:运行确认失败**

Run: `mvn test -Dtest=PolicyEffectiveAggregationTest`
Expected: COMPILATION ERROR(effective 无单参签名;findEffective 无四参签名)

- [x] **Step 3:实现**

PolicyService 接口:`EffectivePolicyResponse effective(Long organizationId);`(删旧三参签名)。PolicyController(:57-60):

```java
    /**
     * Resolves final effective policies for the current member (server-side aggregation).
     */
    @GetMapping("/effective")
    public ApiResponse<EffectivePolicyResponse> effective(@PathVariable Long organizationId) {
        return ApiResponse.success(service.effective(organizationId));
    }
```

PolicyServiceImpl.effective 重写(注入 `TeamMembershipRepository teamMemberships` 新依赖,构造器追加;`teams`/`projects` 依赖在 distribute 校验仍用,保留):

```java
    /**
     * 按作用域优先级解析 AGENT 与 CLAUDE 最终生效内容:服务端从当前用户解析
     * membership 与团队列表后下推 SQL,客户端不传团队参数(规格 §5.5)。
     */
    @Override
    @Transactional(readOnly = true)
    public EffectivePolicyResponse effective(Long organizationId) {
        var principal = UserThreadLocal.currentUser();
        authorizationService.requirePermission(principal, organizationId, null, null, "policy:read");
        MembershipEntity member = members.findActive(organizationId, principal.userId());
        if (member == null) throw new BusinessException(ErrorCode.ORGANIZATION_MEMBER_NOT_FOUND);
        List<Long> teamIds = teamMemberships.findTeamIdsByUserAndOrganization(principal.userId(), organizationId);
        var agent = versions.findEffective(organizationId, member.getId(), teamIds, PolicyType.AGENT);
        var claude = versions.findEffective(organizationId, member.getId(), teamIds, PolicyType.CLAUDE);
        return new EffectivePolicyResponse(toContent(agent), toContent(claude));
    }
```

Repository + Mapper 接口同步改签名(mapper 方法参数加 `@Param("organizationId")/@Param("memberId")/@Param("teamIds")/@Param("policyType")`)。

XML `selectEffective` 整体替换(PROJECT 分支移除——本期恒空,禁死代码):

```xml
    <select id="selectEffective" resultType="com.krmeow.agentsplus.entity.PolicyDocumentVersionEntity">
        select v.id,
               v.policy_document_id,
               v.version_no,
               v.content,
               v.content_hash,
               v.status,
               v.created_by_member_id,
               v.created_at
        from t_policy_document_version v
                 join t_policy_document d on d.id = v.policy_document_id
                 join t_policy_distribution x on x.policy_version_id = v.id
        where d.organization_id = #{organizationId}
          and d.policy_type = #{policyType}
          and x.organization_id = #{organizationId}
          and x.withdrawn = false
          and x.deleted = false
          and v.status = 'ACTIVE'
          and (
            (x.scope_type = 'MEMBER' and x.member_id = #{memberId})
            <if test="teamIds != null and !teamIds.isEmpty()">
            or (x.scope_type = 'TEAM' and x.team_id in
                <foreach collection="teamIds" item="t" open="(" close=")" separator=",">
                    #{t}
                </foreach>
            )
            </if>
            or x.scope_type = 'ORGANIZATION'
            )
        order by case x.scope_type
                     when 'MEMBER' then 4
                     when 'TEAM' then 2
                     else 1
                     end desc limit 1
    </select>
```

同步修复旧签名调用点(编译器指出;`PolicyServiceImplTest` 若测旧 effective 则按新签名改写 mock)。

- [x] **Step 4:运行确认通过**

Run: `mvn test -Dtest=PolicyEffectiveAggregationTest,PolicyServiceImplTest`
Expected: PASS

- [x] **Step 5:Commit**

```bash
git add -A src/main src/test
git commit -m "feat: server-side aggregation for effective policy resolution"
```

---

### Task 7:my-permissions 接口

**Files:**
- Create: `src/main/java/com/krmeow/agentsplus/dto/TeamPermissionRow.java`、`src/main/java/com/krmeow/agentsplus/dto/MyPermissionsResponse.java`
- Modify: `src/main/resources/mapper/UserRoleMapper.xml`(追加两个 select)、`src/main/java/com/krmeow/agentsplus/mapper/UserRoleMapper.java`、`src/main/java/com/krmeow/agentsplus/repository/UserRoleRepository.java`
- Create: `src/main/java/com/krmeow/agentsplus/service/MyPermissionService.java`、`service/impl/MyPermissionServiceImpl.java`、`controller/MyPermissionController.java`
- Test: Create `src/test/java/com/krmeow/agentsplus/organization/MyPermissionServiceTest.java`

**Interfaces:**
- Produces: `GET /api/v1/organizations/{organizationId}/my-permissions` → `ApiResponse<MyPermissionsResponse>`;`MyPermissionsResponse(List<String> orgLevel, List<TeamPermissions> teamLevel)`、`TeamPermissions(String teamId, List<String> permissions)`。前端 Task 8 依赖此响应形状(camelCase)

- [x] **Step 1:写失败测试**

```java
package com.krmeow.agentsplus.organization;

import com.krmeow.agentsplus.common.context.CurrentPrincipal;
import com.krmeow.agentsplus.common.context.UserThreadLocal;
import com.krmeow.agentsplus.common.error.BusinessException;
import com.krmeow.agentsplus.common.error.ErrorCode;
import com.krmeow.agentsplus.dto.MyPermissionsResponse;
import com.krmeow.agentsplus.dto.TeamPermissionRow;
import com.krmeow.agentsplus.repository.MembershipRepository;
import com.krmeow.agentsplus.repository.UserRoleRepository;
import com.krmeow.agentsplus.service.impl.MyPermissionServiceImpl;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * my-permissions 服务单元测试。
 */
class MyPermissionServiceTest {
    private UserRoleRepository userRoles;
    private MembershipRepository members;
    private MyPermissionServiceImpl service;

    /**
     * 初始化 mock 与线程上下文。
     */
    @BeforeEach
    void setUp() {
        userRoles = mock(UserRoleRepository.class);
        members = mock(MembershipRepository.class);
        service = new MyPermissionServiceImpl(userRoles, members);
        UserThreadLocal.set(new CurrentPrincipal(1L, "d", "s"));
    }

    /**
     * 清理线程上下文。
     */
    @AfterEach
    void tearDown() {
        UserThreadLocal.clear();
    }

    /**
     * 汇总 org 级权限码并按 teamId 分组 team 级权限。
     */
    @Test
    void groupsTeamPermissions() {
        when(members.findActive(10L, 1L)).thenReturn(new MembershipEntity());
        when(userRoles.selectOrgPermissionCodes(1L, 10L)).thenReturn(List.of("policy:distribute"));
        when(userRoles.selectTeamPermissionRows(1L, 10L)).thenReturn(List.of(
                new TeamPermissionRow(100L, "skill:distribute"),
                new TeamPermissionRow(100L, "team:manage"),
                new TeamPermissionRow(200L, "skill:distribute")));
        MyPermissionsResponse resp = service.myPermissions(10L);
        assertEquals(List.of("policy:distribute"), resp.orgLevel());
        assertEquals(2, resp.teamLevel().size());
        assertEquals("100", resp.teamLevel().get(0).teamId());
        assertEquals(List.of("skill:distribute", "team:manage"), resp.teamLevel().get(0).permissions());
    }

    /**
     * 非活跃成员:40413。
     */
    @Test
    void rejectsNonMember() {
        when(members.findActive(10L, 1L)).thenReturn(null);
        var ex = assertThrows(BusinessException.class, () -> service.myPermissions(10L));
        assertEquals(ErrorCode.ORGANIZATION_MEMBER_NOT_FOUND, ex.getCode());
    }
}
```

- [x] **Step 2:运行确认失败**

Run: `mvn test -Dtest=MyPermissionServiceTest`
Expected: COMPILATION ERROR(类不存在)

- [x] **Step 3:实现**

`TeamPermissionRow.java`(POJO,MyBatis 需 setter/字段映射,不用 record):

```java
package com.krmeow.agentsplus.dto;

/**
 * 用户在团队上的权限行(SQL 查询结果行,teamId + permCode)。
 */
public class TeamPermissionRow {
    private Long teamId;
    private String permCode;

    public TeamPermissionRow() {
    }

    public TeamPermissionRow(Long teamId, String permCode) {
        this.teamId = teamId;
        this.permCode = permCode;
    }

    public Long getTeamId() { return teamId; }

    public void setTeamId(Long teamId) { this.teamId = teamId; }

    public String getPermCode() { return permCode; }

    public void setPermCode(String permCode) { this.permCode = permCode; }
}
```

`MyPermissionsResponse.java`:

```java
package com.krmeow.agentsplus.dto;

import java.util.List;

/**
 * 当前用户在组织内的权限汇总响应。
 *
 * @param orgLevel  组织级权限码(team/project 均为空的角色行)
 * @param teamLevel 团队级权限分组
 */
public record MyPermissionsResponse(List<String> orgLevel, List<TeamPermissions> teamLevel) {

    /**
     * 单个团队的权限分组。
     */
    public record TeamPermissions(String teamId, List<String> permissions) {
    }
}
```

UserRoleMapper.xml 追加(join 结构与 hasPermission 同构,UserRoleMapper.xml:44-65):

```xml
    <select id="selectOrgPermissionCodes" resultType="string">
        select distinct p.perm_code
        from t_user_role ur
                 join t_membership om on om.organization_id = ur.organization_id
            and om.user_id = ur.user_id
            and om.status = 'ACTIVE'
            and om.deleted = false
                 join t_role_permission rp on rp.role_id = ur.role_id
            and rp.deleted = false
                 join t_permission p on p.id = rp.permission_id
            and p.deleted = false
            and p.status = 1
        where ur.user_id = #{userId}
          and ur.organization_id = #{organizationId}
          and ur.deleted = false
          and ur.team_id is null
          and ur.project_id is null
    </select>

    <select id="selectTeamPermissionRows" resultType="com.krmeow.agentsplus.dto.TeamPermissionRow">
        select ur.team_id   as teamId,
               p.perm_code  as permCode
        from t_user_role ur
                 join t_membership om on om.organization_id = ur.organization_id
            and om.user_id = ur.user_id
            and om.status = 'ACTIVE'
            and om.deleted = false
                 join t_role_permission rp on rp.role_id = ur.role_id
            and rp.deleted = false
                 join t_permission p on p.id = rp.permission_id
            and p.deleted = false
            and p.status = 1
        where ur.user_id = #{userId}
          and ur.organization_id = #{organizationId}
          and ur.deleted = false
          and ur.team_id is not null
          and ur.project_id is null
        order by ur.team_id
    </select>
```

UserRoleMapper.java 接口加两方法(`@Param("userId")/@Param("organizationId")`);UserRoleRepository 加:

```java
    /**
     * 查询用户在组织级(无 team/project 限定)拥有的权限码。
     */
    public java.util.List<String> selectOrgPermissionCodes(Long userId, Long organizationId) {
        return mapper.selectOrgPermissionCodes(userId, organizationId);
    }

    /**
     * 查询用户在团队级拥有的权限行(teamId + permCode)。
     */
    public java.util.List<TeamPermissionRow> selectTeamPermissionRows(Long userId, Long organizationId) {
        return mapper.selectTeamPermissionRows(userId, organizationId);
    }
```

(注意 Repository import dto 包是既有惯例的例外,如团队反对可移到 mapper 返回 entity 层——默认按上述实现。)

`MyPermissionService` + Impl:

```java
package com.krmeow.agentsplus.service;

import com.krmeow.agentsplus.dto.MyPermissionsResponse;

/**
 * 当前用户组织内权限查询用例。
 */
public interface MyPermissionService {

    /**
     * 汇总当前用户在指定组织的权限码(org 级 + team 级分组)。
     *
     * @param organizationId 组织 ID
     * @return 权限汇总响应
     */
    MyPermissionsResponse myPermissions(Long organizationId);
}
```

```java
package com.krmeow.agentsplus.service.impl;

import com.krmeow.agentsplus.common.context.UserThreadLocal;
import com.krmeow.agentsplus.common.error.BusinessException;
import com.krmeow.agentsplus.common.error.ErrorCode;
import com.krmeow.agentsplus.dto.MyPermissionsResponse;
import com.krmeow.agentsplus.dto.TeamPermissionRow;
import com.krmeow.agentsplus.entity.MembershipEntity;
import com.krmeow.agentsplus.repository.MembershipRepository;
import com.krmeow.agentsplus.repository.UserRoleRepository;
import com.krmeow.agentsplus.service.MyPermissionService;
import com.krmeow.agentsplus.service.ProxySelf;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 当前用户权限汇总服务实现。
 */
@Service
@RequiredArgsConstructor
public class MyPermissionServiceImpl implements MyPermissionService, ProxySelf<MyPermissionService> {
    private final UserRoleRepository userRoles;
    private final MembershipRepository members;

    /**
     * {@inheritDoc}
     */
    @Override
    @Transactional(readOnly = true)
    public MyPermissionsResponse myPermissions(Long organizationId) {
        var principal = UserThreadLocal.currentUser();
        MembershipEntity member = members.findActive(organizationId, principal.userId());
        if (member == null) throw new BusinessException(ErrorCode.ORGANIZATION_MEMBER_NOT_FOUND);
        List<String> orgLevel = userRoles.selectOrgPermissionCodes(principal.userId(), organizationId);
        Map<Long, List<String>> byTeam = new LinkedHashMap<>();
        for (TeamPermissionRow row : userRoles.selectTeamPermissionRows(principal.userId(), organizationId)) {
            byTeam.computeIfAbsent(row.getTeamId(), k -> new ArrayList<>()).add(row.getPermCode());
        }
        List<MyPermissionsResponse.TeamPermissions> teamLevel = byTeam.entrySet().stream()
                .map(e -> new MyPermissionsResponse.TeamPermissions(String.valueOf(e.getKey()), e.getValue()))
                .toList();
        return new MyPermissionsResponse(orgLevel, teamLevel);
    }
}
```

`MyPermissionController.java`:

```java
package com.krmeow.agentsplus.controller;

import com.krmeow.agentsplus.common.api.ApiResponse;
import com.krmeow.agentsplus.dto.MyPermissionsResponse;
import com.krmeow.agentsplus.service.MyPermissionService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 当前用户组织内权限查询接口。
 */
@RestController
@RequestMapping("/api/v1/organizations/{organizationId}/my-permissions")
public class MyPermissionController {
    private final MyPermissionService service;

    /**
     * Creates controller.
     */
    public MyPermissionController(MyPermissionService service) {
        this.service = service;
    }

    /**
     * Returns current user's permission summary in the organization.
     */
    @GetMapping
    public ApiResponse<MyPermissionsResponse> myPermissions(@PathVariable Long organizationId) {
        return ApiResponse.success(service.myPermissions(organizationId));
    }
}
```

- [x] **Step 4:运行确认通过 + 全包回归**

Run: `mvn test -Dtest=MyPermissionServiceTest` 然后全量 `mvn test`
Expected: PASS(全量兜底:Policy/Skill 各测试类受本阶段构造器变更影响应已在前面步骤消解)

- [x] **Step 5:后端整体验证 + Commit**

Run: `mvn clean test && mvn package -DskipTests`
Expected: 全绿

```bash
git add -A src
git commit -m "feat: add my-permissions endpoint for permission-driven UI"
```

---

## Phase B:前端(agents-plus)

### Task 8:lib API 层 + workspace store 权限状态

**Files:**
- Modify: `src/lib/api-policy.ts`(getEffectivePolicies 定义处:参数收敛;新增 distributePolicyVersion)
- Create: `src/lib/api-permission.ts`
- Modify: `src/features/context/store.ts`
- Test: Create `src/features/context/store.test.ts`

**Interfaces:**
- Produces: `api.distributePolicyVersion(orgId, input)`;`listMyPermissions(orgId): Promise<MyPermissions>`;store 字段 `myPermissions: MyPermissions | null` 与 helper `selectHasPermission(state, code, teamId?)`;`useOrgPolicySync`(Task 9)与 `DistributeDialog`(Task 10-11、14)依赖以上签名
- Consumes: `request<T>(path, options)`(`lib/api-request.ts:183`)

- [x] **Step 1:写失败测试(store.test.ts)**

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceStore } from "./store";
import { listMyPermissions } from "@/lib/api-permission";

vi.mock("@/lib/api-permission", () => ({ listMyPermissions: vi.fn() }));

describe("workspace store permissions", () => {
  beforeEach(() => {
    vi.mocked(listMyPermissions).mockReset();
    useWorkspaceStore.setState({ scope: "personal", organizationId: null, myPermissions: null });
  });

  it("进入组织时拉取权限,成功后写入", async () => {
    vi.mocked(listMyPermissions).mockResolvedValue({
      orgLevel: ["skill:distribute"],
      teamLevel: [{ teamId: "100", permissions: ["skill:distribute"] }],
    });
    useWorkspaceStore.getState().enterOrganization({ id: "10", name: "Org" } as never);
    await vi.waitFor(() => {
      expect(useWorkspaceStore.getState().myPermissions?.orgLevel).toEqual(["skill:distribute"]);
    });
  });

  it("拉取失败降级为 null,不阻塞切换", async () => {
    vi.mocked(listMyPermissions).mockRejectedValue(new Error("403"));
    useWorkspaceStore.getState().enterOrganization({ id: "10", name: "Org" } as never);
    await vi.waitFor(() => {
      expect(useWorkspaceStore.getState().myPermissions).toBeNull();
    });
  });

  it("selectHasPermission:org 级命中,或 team 级命中", () => {
    useWorkspaceStore.setState({
      myPermissions: { orgLevel: [], teamLevel: [{ teamId: "100", permissions: ["skill:distribute"] }] },
    });
    const s = useWorkspaceStore.getState();
    expect(s.hasPermission("policy:distribute", undefined)).toBe(false);
    expect(s.hasPermission("skill:distribute", "100")).toBe(true);
    expect(s.hasPermission("skill:distribute", "200")).toBe(false);
  });
});
```

注意:`enterOrganization` 的真实入参形状以 `store.ts` 现状为准(执行时打开文件对齐;测试按现状传组织对象)。`hasPermission` 若实现为 store 内方法,第三测试改为 `s.hasPermission(...)`;若实现为导出纯函数 `selectHasPermission(state, code, teamId)`,改为函数调用——**二选一,实现与测试一致即可**。

- [x] **Step 2:运行确认失败**

Run: `pnpm vitest run src/features/context/store.test.ts`
Expected: FAIL(字段/方法不存在)

- [x] **Step 3:实现**

`src/lib/api-permission.ts`:

```ts
import { request } from "@/lib/api-request";

/** 单个团队的权限分组。 */
export interface TeamPermissions {
  teamId: string;
  permissions: string[];
}

/** 当前用户在组织内的权限汇总。 */
export interface MyPermissions {
  orgLevel: string[];
  teamLevel: TeamPermissions[];
}

/**
 * 拉取当前用户在指定组织的权限码汇总(权限驱动 UI 的唯一数据源)。
 */
export function listMyPermissions(organizationId: string): Promise<MyPermissions> {
  return request<MyPermissions>(
    "/api/v1/organizations/" + encodeURIComponent(organizationId) + "/my-permissions"
  );
}
```

`src/lib/api-policy.ts`:

```ts
  /** 获取当前成员的生效规范(服务端聚合,不传团队参数——规格 §6.5)。 */
  getEffectivePolicies: (organizationId: string) =>
    request<import("@/lib/contracts").EffectivePolicies>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/policies/effective"
    ),
  /** 分发已审核通过的规范版本。 */
  distributePolicyVersion: (
    organizationId: string,
    input: {
      versionId: string;
      scopeType: "ORGANIZATION" | "TEAM" | "MEMBER";
      teamId?: string;
      memberId?: string;
    },
  ) =>
    request<import("@/lib/contracts").PolicyDistribution>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/policies/distributions",
      { method: "POST", body: input },
    ),
```

(替换原 `getEffectivePolicies` 三参定义;`EffectivePolicies` 类型名以 `lib/contracts.ts` 现状为准。)

`src/features/context/store.ts`:

```ts
import { listMyPermissions, type MyPermissions } from "@/lib/api-permission";
// WorkspaceState 增加字段与方法:
//   myPermissions: MyPermissions | null;
//   hasPermission: (code: string, teamId?: string) => boolean;
// enterOrganization 成功 set 组织后:
        void get().refreshMyPermissions(org.id);
// exitOrganization 中:
        set({ myPermissions: null });
// 新增:
  refreshMyPermissions: async (orgId: string) => {
    try {
      const my = await listMyPermissions(orgId);
      // 仅当仍停留在该组织时写入,防止竞态
      if (get().organizationId === orgId) set({ myPermissions: my });
    } catch {
      set({ myPermissions: null });
    }
  },
  hasPermission: (code, teamId) => {
    const my = get().myPermissions;
    if (!my) return false;
    if (my.orgLevel.includes(code)) return true;
    if (teamId) return my.teamLevel.some((t) => t.teamId === teamId && t.permissions.includes(code));
    return false;
  },
```

- [x] **Step 4:运行确认通过**

Run: `pnpm vitest run src/features/context/store.test.ts`
Expected: PASS

- [x] **Step 5:Commit**

```bash
git add src/lib/api-permission.ts src/lib/api-policy.ts src/features/context
git commit -m "feat: permission-driven workspace store and distribute API wrappers"
```

---

### Task 9:成员端生效链签名收敛

**Files:**
- Modify: `src/features/policies/api.ts:42-43`
- Modify: `src/features/policies/hooks/use-org-policy-sync.ts:12-15,44-45`
- Modify: `src/features/policies/hooks/use-policies-data.ts:52`
- Test: Modify `src/features/policies/hooks/use-policies-data.test.tsx`

**Interfaces:**
- Consumes: `api.getEffectivePolicies(organizationId)`(Task 8 新签名)

- [x] **Step 1:更新失败测试**

use-policies-data.test.tsx 中对 `getEffectivePolicies` 的 mock 改为单参:

```tsx
getEffectivePolicies: vi.fn().mockResolvedValue({ agent: null, claude: null }),
```

并新增断言(任一既有"加载成功"用例内):

```tsx
expect(policiesApi.getEffectivePolicies).toHaveBeenCalledWith("org-1");
```

(`"org-1"` 换成该测试文件已用的 organizationId 常量。)

- [x] **Step 2:运行确认失败**

Run: `pnpm vitest run src/features/policies`
Expected: FAIL(调用仍传 "0","0")

- [x] **Step 3:实现**

`features/policies/api.ts`:

```ts
  getEffectivePolicies: (orgId: string) =>
    api.getEffectivePolicies(orgId),
```

`use-org-policy-sync.ts`:删除 `NO_SCOPE_ID` 常量(:15)与"effective 接口对 team/project 的默认值"注释块(:11-15),调用改:

```ts
        const effective = await policiesApi.getEffectivePolicies(organizationId);
```

`use-policies-data.ts:52`:

```ts
          policiesApi.getEffectivePolicies(organizationId),
```

- [x] **Step 4:运行确认通过**

Run: `pnpm vitest run src/features/policies`
Expected: PASS

- [x] **Step 5:Commit**

```bash
git add src/features/policies
git commit -m "refactor: effective policies resolved server-side, drop client scope params"
```

---

### Task 10:DistributeDialog 共享组件

**Files:**
- Create: `src/components/distribute-dialog.tsx`
- Test: Create `src/components/distribute-dialog.test.tsx`

**Interfaces:**
- Produces: `DistributeDialog`(props 见下);Task 11(policy)与 Task 14(skill)消费
- Consumes: shadcn `@/components/ui/dialog`;不引新依赖;下拉用原生 `<select>`(样式 Tailwind 语义令牌)

- [x] **Step 1:写失败测试**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DistributeDialog } from "./distribute-dialog";

const teams = [{ id: "100", name: "平台组" }];
const members = [{ id: "5", label: "张三" }];

function renderDialog(onSubmit = vi.fn()) {
  render(
    <DistributeDialog
      open
      title="分发测试"
      busy={false}
      teams={teams}
      members={members}
      onSubmit={onSubmit}
      onOpenChange={() => {}}
    />,
  );
  return onSubmit;
}

describe("DistributeDialog", () => {
  it("ORGANIZATION scope 直接提交,不带目标字段", () => {
    const onSubmit = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "分发" }));
    expect(onSubmit).toHaveBeenCalledWith({ scopeType: "ORGANIZATION" });
  });

  it("TEAM scope 携带所选 teamId", () => {
    const onSubmit = renderDialog();
    fireEvent.change(screen.getByLabelText("分发范围"), { target: { value: "TEAM" } });
    fireEvent.change(screen.getByLabelText("目标团队"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "分发" }));
    expect(onSubmit).toHaveBeenCalledWith({ scopeType: "TEAM", teamId: "100" });
  });

  it("MEMBER scope 携带所选 memberId", () => {
    const onSubmit = renderDialog();
    fireEvent.change(screen.getByLabelText("分发范围"), { target: { value: "MEMBER" } });
    fireEvent.change(screen.getByLabelText("目标成员"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "分发" }));
    expect(onSubmit).toHaveBeenCalledWith({ scopeType: "MEMBER", memberId: "5" });
  });
});
```

- [x] **Step 2:运行确认失败**

Run: `pnpm vitest run src/components/distribute-dialog.test.tsx`
Expected: FAIL(组件不存在)

- [x] **Step 3:实现组件(≤120 行)**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** 分发作用域(与后端枚举 ORGANIZATION/TEAM/MEMBER 对齐;policy 的 PROJECT 本期不接)。 */
export type DistributeScope = "ORGANIZATION" | "TEAM" | "MEMBER";

/** 提交载荷:scope 决定可选字段。 */
export interface DistributeSubmitInput {
  scopeType: DistributeScope;
  teamId?: string;
  memberId?: string;
}

export interface DistributeDialogProps {
  open: boolean;
  title: string;
  busy: boolean;
  teams: { id: string; name: string }[];
  members: { id: string; label: string }[];
  onSubmit: (input: DistributeSubmitInput) => void;
  onOpenChange: (open: boolean) => void;
}

/**
 * 通用分发对话框:选择作用域(ORG/TEAM/MEMBER)与目标后回调提交。
 * 目标数据由调用方注入(policy/skill 两个入口共用),本组件不发请求。
 */
export function DistributeDialog(props: DistributeDialogProps) {
  const [scope, setScope] = useState<DistributeScope>("ORGANIZATION");
  const [teamId, setTeamId] = useState("");
  const [memberId, setMemberId] = useState("");

  const canSubmit =
    !props.busy &&
    (scope === "ORGANIZATION" ||
      (scope === "TEAM" && teamId !== "") ||
      (scope === "MEMBER" && memberId !== ""));

  const handleSubmit = () => {
    if (!canSubmit) return;
    props.onSubmit(
      scope === "TEAM"
        ? { scopeType: scope, teamId }
        : scope === "MEMBER"
          ? { scopeType: scope, memberId }
          : { scopeType: scope },
    );
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>选择分发范围与目标对象。</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            分发范围
            <select
              aria-label="分发范围"
              className="rounded-md border bg-background p-2"
              value={scope}
              onChange={(e) => setScope(e.target.value as DistributeScope)}
            >
              <option value="ORGANIZATION">整个组织</option>
              {props.teams.length > 0 && <option value="TEAM">团队</option>}
              {props.members.length > 0 && <option value="MEMBER">单个成员</option>}
            </select>
          </label>
          {scope === "TEAM" && (
            <label className="flex flex-col gap-1 text-sm">
              目标团队
              <select
                aria-label="目标团队"
                className="rounded-md border bg-background p-2"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
              >
                <option value="">请选择团队</option>
                {props.teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
          )}
          {scope === "MEMBER" && (
            <label className="flex flex-col gap-1 text-sm">
              目标成员
              <select
                aria-label="目标成员"
                className="rounded-md border bg-background p-2"
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
              >
                <option value="">请选择成员</option>
                {props.members.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>取消</Button>
          <Button disabled={!canSubmit} onClick={handleSubmit}>分发</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [x] **Step 4:运行确认通过**

Run: `pnpm vitest run src/components/distribute-dialog.test.tsx`
Expected: PASS

- [x] **Step 5:Commit**

```bash
git add src/components/distribute-dialog.tsx src/components/distribute-dialog.test.tsx
git commit -m "feat: shared distribute dialog for policy and skill distribution"
```

---

### Task 11:Policy 分发入口(HistoryCard)

**Files:**
- Modify: `src/features/policies/api.ts`(policiesApi 加 distributePolicyVersion 透传)
- Modify: `src/features/policies/hooks/use-policies-data.ts`(加 distributePolicyVersion action + dialog 数据)
- Modify: `src/features/policies/components/history-panel.tsx`
- Test: Modify `src/features/policies/hooks/use-policies-data.test.tsx`

**Interfaces:**
- Consumes: `api.distributePolicyVersion`(Task 8)、`DistributeDialog`(Task 10)、`useWorkspaceStore().hasPermission("policy:distribute")`(Task 8)、`teamsApi.listTeams`/`api.listMemberships`(既有)
- Produces: `PoliciesDataApi` 新增字段 `canDistributePolicy: boolean` 与方法 `distributePolicyVersion(input: {versionId: string; scopeType: "ORGANIZATION"|"TEAM"|"MEMBER"; teamId?: string; memberId?: string}): Promise<void>`;HistoryCard 渲染依赖

- [x] **Step 1:写失败测试(use-policies-data.test.tsx 追加)**

```tsx
it("distributePolicyVersion 提交后刷新分发列表", async () => {
  // Arrange:沿用该文件既有的 renderPoliciesData helper 与 mock 管道
  vi.mocked(api.distributePolicyVersion).mockResolvedValue({} as never);
  const { result } = renderPoliciesData();
  await act(() => result.current.distributePolicyVersion({
    versionId: "v1", scopeType: "TEAM", teamId: "100",
  }));
  expect(api.distributePolicyVersion).toHaveBeenCalledWith("org-1", {
    versionId: "v1", scopeType: "TEAM", teamId: "100",
  });
  expect(api.listPolicyDistributions).toHaveBeenCalled(); // 刷新
});
```

(命名对齐该测试文件既有 helper;若 helper 暴露方式不同,以现状改写,断言不变。)

- [x] **Step 2:运行确认失败**

Run: `pnpm vitest run src/features/policies/hooks/use-policies-data.test.tsx`
Expected: FAIL(action 不存在)

- [x] **Step 3:实现**

`features/policies/api.ts` policiesApi 追加:

```ts
  distributePolicyVersion: (
    orgId: string,
    input: { versionId: string; scopeType: "ORGANIZATION" | "TEAM" | "MEMBER"; teamId?: string; memberId?: string },
  ) => api.distributePolicyVersion(orgId, input),
```

`use-policies-data.ts` 追加 action(与既有 withdrawDistribution :118 同风格,含 busy 保护;成功后重新拉取 distributions 与两个 history):

```ts
  const distributePolicyVersion = useCallback(
    async (input: { versionId: string; scopeType: "ORGANIZATION" | "TEAM" | "MEMBER"; teamId?: string; memberId?: string }) => {
      if (!organizationId) return;
      setBusy("distribute");
      try {
        await policiesApi.distributePolicyVersion(organizationId, input);
        toast.success("已分发");
        await reload(); // 复用本 hook 既有首屏加载函数;若无独立 reload 函数则把 useEffect 的加载体抽为 useCallback reload
      } catch (caught) {
        toast.error(readableError(caught, "分发失败"));
        throw caught;
      } finally {
        setBusy(null);
      }
    },
    [organizationId],
  );
```

并在返回对象与 `PoliciesDataApi` 类型(`features/policies/types.ts`)中同步暴露;`canDistributePolicy` 来自 `useWorkspaceStore((s) => s.hasPermission)("policy:distribute")`(hook 顶部取)。

`history-panel.tsx`:每行(status 为 `"APPROVED"` 才显示——后端只允许分发 APPROVED 版本,ACTIVE 已被引用会 40414):

```tsx
{data.canDistributePolicy && v.status === "APPROVED" && (
  <Button size="sm" variant="outline" disabled={data.busy !== null}
    onClick={() => props.onRequestDistribute?.(v)}>
    分发
  </Button>
)}
```

对话框编排放 `history-panel.tsx` 内部(teams/members 列表由组件加载: `teamsApi.listTeams(orgId)` + `api.listMemberships(orgId)`,打开时拉取),提交调用 `data.distributePolicyVersion`。若 HistoryCard 超 300 行,把"分发对话框编排"抽为 `features/policies/components/distribute-policy-dialog.tsx`。

- [x] **Step 4:运行确认通过**

Run: `pnpm vitest run src/features/policies`
Expected: PASS

- [x] **Step 5:Commit**

```bash
git add src/features/policies
git commit -m "feat: distribute approved policy versions from history panel"
```

---

### Task 12:组织 Skills 页面 + 侧边栏入口

**Files:**
- Modify: `src/features/app/components/app-sidebar.tsx:52-56`(org 导航数组)
- Create: `src/features/skills/hooks/use-org-skills.ts`
- Create: `src/app/(app)/organization/skills/page.tsx`
- Modify: `src/features/skills/components/skill-list.tsx`(最小扩展:可选 items/onRefresh props)
- Test: Create `src/features/skills/hooks/use-org-skills.test.ts`

**Interfaces:**
- Produces: `useOrgSkills(orgId): { skills, loading, error, refresh }`;`SkillList` 新增可选 props `items?: Skill[]`、`onRefreshOverride?: () => void | Promise<void>`(传入时列表数据与刷新走 override,未传行为不变——个人页零感知);org 页路由 `/organization/skills`
- Consumes: `api.listSkills({ scope: "org", orgId, size: 100 })`(lib/api-skill.ts:119 已封装);`SkillList` 既有渲染/harness toggle

- [x] **Step 1:写失败测试(use-org-skills.test.ts)**

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useOrgSkills } from "./use-org-skills";
import { api } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  api: { listSkills: vi.fn() },
}));

describe("useOrgSkills", () => {
  beforeEach(() => vi.mocked(api.listSkills).mockReset());

  it("以 scope=org 拉取组织 skill 列表", async () => {
    vi.mocked(api.listSkills).mockResolvedValue({
      records: [{ id: "2", name: "alpha" }],
      total: 1,
    } as never);
    const { result } = renderHook(() => useOrgSkills("10"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.listSkills).toHaveBeenCalledWith({ scope: "org", orgId: "10", size: 100 });
    expect(result.current.skills).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it("orgId 为空时不请求", async () => {
    renderHook(() => useOrgSkills(null));
    expect(api.listSkills).not.toHaveBeenCalled();
  });

  it("请求失败写 error(retry 态)", async () => {
    vi.mocked(api.listSkills).mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useOrgSkills("10"));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    vi.mocked(api.listSkills).mockResolvedValue({ records: [], total: 0 } as never);
    await result.current.refresh();
    await waitFor(() => expect(result.current.error).toBeNull());
  });
});
```

- [x] **Step 2:运行确认失败**

Run: `pnpm vitest run src/features/skills/hooks/use-org-skills.test.ts`
Expected: FAIL(模块不存在)

- [x] **Step 3:实现**

`use-org-skills.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { Skill } from "@/lib/contracts";

/**
 * 组织空间 skill 列表数据源:GET /skills?scope=org&org_id。
 * 五态:loading / error 供页面渲染 retry;orgId 变化自动重拉。
 */
export function useOrgSkills(orgId: string | null) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const page = await api.listSkills({ scope: "org", orgId, size: 100 });
      setSkills(page.records);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { skills, loading, error, refresh };
}
```

`skill-list.tsx` 最小扩展(签名处):

```tsx
export function SkillList(props: {
  /** 传入时覆盖 store 数据(组织态数据源)。 */
  items?: Skill[];
  /** 传入时覆盖刷新动作(组织态用 useOrgSkills.refresh)。 */
  onRefreshOverride?: () => void | Promise<void>;
}) {
```

组件内两处接线:

```tsx
  const skills = props.items ?? useSkillStore((s) => s.skillList);
```

(注意:React hooks 不能条件调用——保留原 `const storeSkills = useSkillStore(...)` 行,再用 `const skills = props.items ?? storeSkills;`。)

refresh 内 `await api.listSkillSubscriptions()` 改为:

```tsx
      if (props.onRefreshOverride) {
        await props.onRefreshOverride();
      } else {
        const result = await api.listSkillSubscriptions();
        setSkillList(result);
      }
```

(本地 state `localState` 读取逻辑两态共用,保留。)

`app-sidebar.tsx` org 数组(:52-56)追加:

```tsx
      { href: "/organization/skills", label: "Skills", icon: Package },
```

(`Package` 图标顶部 import 已存在——个人导航 :36 使用同一图标;若无则补 `import { Package } from "lucide-react"`。)

`app/(app)/organization/skills/page.tsx`:

```tsx
"use client";

import { PageHeader } from "@/components/page-header";
import { SkillList } from "@/features/skills/components/skill-list";
import { useOrgSkills } from "@/features/skills/hooks/use-org-skills";
import { useWorkspaceStore } from "@/features/context/store";

/**
 * 组织空间 skill 管理页:数据源为组织可见 skill,创建/导入/发布与个人态共用组件。
 */
export default function OrganizationSkillsPage() {
  const organizationId = useWorkspaceStore((s) => s.organizationId);
  const org = useOrgSkills(organizationId);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="组织"
        title="Skills"
        description="组织空间的 skill 资产管理与分发。"
      />
      {org.error ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-destructive">{org.error}</p>
          <button className="text-sm underline" onClick={() => void org.refresh()}>重试</button>
        </div>
      ) : (
        <SkillList items={org.skills} onRefreshOverride={org.refresh} />
      )}
    </div>
  );
}
```

(org 态创建/导入/发布按钮与分发入口在 Task 13/14 接入同一页面。)

- [x] **Step 4:运行确认通过 + 构建门禁**

Run: `pnpm vitest run src/features/skills && pnpm build`
Expected: PASS / build 成功

- [x] **Step 5:Commit**

```bash
git add src/features/app/components/app-sidebar.tsx src/features/skills src/app/\(app\)/organization/skills
git commit -m "feat: org-space skills page wired to org skill listing"
```

---

### Task 13:创建/导入对话框 org 归属绑定

**Files:**
- Modify: `src/lib/contracts.ts`(CreateSkillRequest 类型)
- Modify: `src/features/skills/components/create-skill-dialog.tsx`
- Modify: `src/features/skills/components/import-skill-dialog.tsx`
- Test: Create `src/features/skills/components/create-skill-dialog.test.tsx`

**Interfaces:**
- Consumes: `useWorkspaceStore`(`scope`/`organizationId`);`api.createSkill`/`api.importSkillFromGithub`/`api.importSkillFromSkillsSh`/`api.importSkillFromZip`(既有,请求体加字段)
- Produces: org 态下创建/导入请求体携带 `ownerScope: "ORG", orgId: <当前组织>`;personal 态不带字段(后端缺省 PERSONAL)

- [x] **Step 1:写失败测试**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreateSkillDialog } from "./create-skill-dialog";
import { useWorkspaceStore } from "@/features/context/store";
import { api } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({ api: { createSkill: vi.fn().mockResolvedValue({ id: "1" }) } }));
vi.mock("@/features/context/store", () => ({
  useWorkspaceStore: vi.fn(),
}));

describe("CreateSkillDialog org binding", () => {
  it("组织态提交携带 ownerScope=ORG 与 orgId", async () => {
    vi.mocked(useWorkspaceStore).mockImplementation(((selector: (s: unknown) => unknown) =>
      selector({ scope: "organization", organizationId: "10" })) as never);
    render(<CreateSkillDialog open onOpenChange={() => {}} onCreated={() => {}} />);
    fireEvent.change(screen.getByLabelText("skill 名称"), { target: { value: "alpha" } });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));
    await waitFor(() =>
      expect(api.createSkill).toHaveBeenCalledWith(
        expect.objectContaining({ ownerScope: "ORG", orgId: "10" }),
      ),
    );
  });

  it("个人态提交不带归属字段", async () => {
    vi.mocked(useWorkspaceStore).mockImplementation(((selector: (s: unknown) => unknown) =>
      selector({ scope: "personal", organizationId: null })) as never);
    render(<CreateSkillDialog open onOpenChange={() => {}} onCreated={() => {}} />);
    fireEvent.change(screen.getByLabelText("skill 名称"), { target: { value: "beta" } });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));
    await waitFor(() => {
      const body = vi.mocked(api.createSkill).mock.calls[0][0] as Record<string, unknown>;
      expect(body.ownerScope).toBeUndefined();
    });
  });
});
```

(表单控件的 label 文案以组件现状为准,断言核心是请求体形状;执行时若 `CreateSkillDialog` props 名不同,按现状对齐。)

- [x] **Step 2:运行确认失败**

Run: `pnpm vitest run src/features/skills/components/create-skill-dialog.test.tsx`
Expected: FAIL(请求体无 ownerScope)

- [x] **Step 3:实现**

`lib/contracts.ts` 的 CreateSkillRequest 类型追加可选字段:

```ts
export interface CreateSkillRequest {
  // ...既有字段保持
  ownerScope?: "PERSONAL" | "ORG";
  orgId?: string;
}
```

`create-skill-dialog.tsx` 提交处(读 store):

```tsx
const scope = useWorkspaceStore((s) => s.scope);
const organizationId = useWorkspaceStore((s) => s.organizationId);
// 构建 body 时:
const orgBinding = scope === "organization" && organizationId
  ? { ownerScope: "ORG" as const, orgId: organizationId }
  : {};
await api.createSkill({ ...baseBody, ...orgBinding });
```

`import-skill-dialog.tsx` 同样处理(三个导入入口的 body 都追加 `...orgBinding`)。

`publish-version-dialog.tsx` **无需改请求体**(后端按 skill 归属鉴权),但 org 态下仅 `hasPermission("skill:manage")` 时渲染发布入口——该显隐在 Task 14 统一接线。

- [x] **Step 4:运行确认通过**

Run: `pnpm vitest run src/features/skills`
Expected: PASS

- [x] **Step 5:Commit**

```bash
git add src/lib/contracts.ts src/features/skills/components
git commit -m "feat: bind skill create/import to active organization"
```

---

### Task 14:org 页分发入口 + 分发记录卡片

**Files:**
- Create: `src/features/skills/components/org-distribution-card.tsx`
- Modify: `src/features/skills/components/skill-list.tsx`(org 态行内"分发"动作)
- Modify: `src/app/(app)/organization/skills/page.tsx`(编排卡片 + 权限显隐)
- Test: Create `src/features/skills/components/org-distribution-card.test.tsx`

**Interfaces:**
- Consumes: `DistributeDialog`(Task 10)、`api.listSkillDistributions(orgId)`/`api.distributeSkill(orgId, body)`/`api.withdrawSkillDistribution(orgId, id)`(lib/api-skill.ts:86-100)、`useWorkspaceStore().hasPermission("skill:distribute")`、`teamsApi.listTeams`、`api.listMemberships`
- Produces: `<OrgDistributionCard orgId canWithdraw />`(列表+撤回,五态);org 页 skill 行"分发"按钮(`skill:distribute` 显隐)

- [x] **Step 1:写失败测试**

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { OrgDistributionCard } from "./org-distribution-card";
import { api } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  api: {
    listSkillDistributions: vi.fn(),
    withdrawSkillDistribution: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("OrgDistributionCard", () => {
  beforeEach(() => vi.mocked(api.listSkillDistributions).mockReset());

  it("空列表渲染空态", async () => {
    vi.mocked(api.listSkillDistributions).mockResolvedValue([]);
    render(<OrgDistributionCard orgId="10" canWithdraw />);
    await waitFor(() => expect(screen.getByText("暂无分发")).toBeInTheDocument());
  });

  it("撤回成功后刷新列表", async () => {
    vi.mocked(api.listSkillDistributions).mockResolvedValue([
      { id: "7", skillId: "2", scopeType: "TEAM", teamId: "100", memberId: null, withdrawn: false, distributedByMemberId: "1" },
    ]);
    render(<OrgDistributionCard orgId="10" canWithdraw />);
    await waitFor(() => expect(screen.getByRole("button", { name: /撤回/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /撤回/ }));
    await waitFor(() => expect(api.withdrawSkillDistribution).toHaveBeenCalledWith("10", "7"));
    await waitFor(() => expect(api.listSkillDistributions).toHaveBeenCalledTimes(2));
  });

  it("canWithdraw=false 时不渲染撤回按钮", async () => {
    vi.mocked(api.listSkillDistributions).mockResolvedValue([
      { id: "7", skillId: "2", scopeType: "ORGANIZATION", teamId: null, memberId: null, withdrawn: false, distributedByMemberId: "1" },
    ]);
    render(<OrgDistributionCard orgId="10" canWithdraw={false} />);
    await waitFor(() => expect(screen.getByText(/TEAM|ORGANIZATION|已撤回|分发/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /撤回/ })).toBeNull();
  });
});
```

- [x] **Step 2:运行确认失败**

Run: `pnpm vitest run src/features/skills/components/org-distribution-card.test.tsx`
Expected: FAIL(组件不存在)

- [x] **Step 3:实现卡片(五态;≤150 行)**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import type { SkillDistribution } from "@/lib/api-skill";

export interface OrgDistributionCardProps {
  orgId: string;
  /** 是否显示撤回动作(由 skill:distribute 权限决定)。 */
  canWithdraw: boolean;
}

/**
 * 组织 skill 分发记录卡片:列出活跃分发并支持撤回。
 * 五态覆盖:loading/success/empty/error/retry。
 */
export function OrgDistributionCard({ orgId, canWithdraw }: OrgDistributionCardProps) {
  const [items, setItems] = useState<SkillDistribution[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await api.listSkillDistributions(orgId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleWithdraw = async (id: string) => {
    setWithdrawing(id);
    try {
      await api.withdrawSkillDistribution(orgId, id);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setWithdrawing(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>组织分发</CardTitle>
        <CardDescription>已分发到组织/团队/成员的 skill 与撤回操作</CardDescription>
      </CardHeader>
      <CardContent>
        {loading && <p className="text-sm text-muted-foreground">加载中…</p>}
        {!loading && error && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-destructive">{error}</p>
            <button className="text-sm underline" onClick={() => void refresh()}>重试</button>
          </div>
        )}
        {!loading && !error && items.length === 0 && (
          <p className="text-sm text-muted-foreground">暂无分发</p>
        )}
        {!loading && !error && items.length > 0 && (
          <ul className="space-y-2">
            {items.map((d) => (
              <li key={d.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                <div>
                  <p className="font-medium">{d.scopeType}</p>
                  <p className="text-xs text-muted-foreground">skill {d.skillId}</p>
                </div>
                {canWithdraw && !d.withdrawn && (
                  <Button size="sm" variant="ghost" disabled={withdrawing !== null}
                    onClick={() => void handleWithdraw(d.id)}>
                    <Trash2 /> 撤回
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

org 页(`organization/skills/page.tsx`)编排:

```tsx
  const hasDistribute = useWorkspaceStore((s) => s.hasPermission)("skill:distribute");
  // 页面骨架中 SkillList 之上加:
  <OrgDistributionCard orgId={organizationId ?? ""} canWithdraw={hasDistribute} />
```

skill 行"分发"动作:`skill-list.tsx` 在 `props.items !== undefined`(即组织态)且 `hasPermission("skill:distribute")` 时,行操作区渲染"分发"按钮 → 打开 `DistributeDialog`(teams/members 由 skill-list 打开对话框时拉取 `teamsApi.listSkills` 同款模式:`teamsApi.listTeams(orgId)` + `api.listMemberships(orgId)`),提交:

```tsx
await api.distributeSkill(organizationId, {
  skillId: skill.id,
  scopeType: input.scopeType,
  teamId: input.teamId ?? null,
  memberId: input.memberId ?? null,
});
```

提交成功 toast + `onRefreshOverride?.()` 刷新;`DistributeSkillRequestBody` 字段名以 `lib/api-skill.ts:19` 为准(skillId/scopeType/teamId/memberId)。

- [x] **Step 4:运行确认通过 + 门禁**

Run: `pnpm vitest run && pnpm build`
Expected: 全部 PASS / build 成功

- [x] **Step 5:Commit**

```bash
git add src/features/skills src/app/\(app\)/organization/skills
git commit -m "feat: skill distribution entry points in org space"
```

---

### Task 15:全量门禁 + 端到端手工验证

**Files:** 无新增;两仓验证

- [x] **Step 1:后端门禁**

Run(agents-plus-server): `mvn clean test && mvn package -DskipTests`
Expected: 全绿

- [x] **Step 2:前端门禁**

Run(agents-plus): `pnpm vitest run && pnpm build`
Expected: 全绿(若团队规范要求 `npm run build`,二者等价)

- [ ] **Step 3:两服务联调启动**

Run: 后端 `mvn spring-boot:run`(local profile);前端 `pnpm dev` + Tauri 壳(`pnpm tauri dev`,命令以 package.json scripts 为准)

- [ ] **Step 4:执行 spec §8.3 端到端剧本**

1. A(owner)登录 → 组织空间 Skills → 创建 org skill → 发布版本 → 行内"分发"→ TEAM → 选 team T
2. B(TEAM_ADMIN of T)登录 → 侧边栏出现"Skills" → 列表可见该 skill → toggle 安装 → 确认 `~/.claude/skills/<name>` 出现(symlink 或 copy)
3. A 规范页 → 提交 AGENTS.md 变更 → 审核 → History 行"分发"→ TEAM T
4. B 5 分钟内检查 `~/AGENTS.md`:托管块出现且个人区不变;撤回后托管块移除
5. B 尝试订阅未分发的 org skill → 403(越权修复验证)

Expected: 全部符合;任一失败回到对应 Task 修复后重跑

- [ ] **Step 5:收尾 Commit(如门禁期间有修正)**

```bash
git add -A && git commit -m "fix: address findings from end-to-end verification"
```

---

## 任务依赖图

```
Task 1 (V8 RBAC)
  └→ Task 2 (org skill 创建) ─→ Task 3 (可见性统一) ─→ Task 4 (org 发布/删除守卫)
                                          └→ Task 5 (分发 RBAC)
Task 6 (聚合生效) 独立,可与 2-5 并行
Task 7 (my-permissions) 依赖 Task 1
Phase B: Task 8 ← Task 1-7 全部完成后联调;8 → 9 → 10 → 11 / 12 → 13 → 14(10 与 12 可并行) → 15
```

## Self-Review 记录

- **Spec 覆盖**:F1→Task 2/12/13;F2→Task 5;F3→Task 3;F4→Task 6/9;F5→Task 10/11/14;my-permissions→Task 7/8;D5/D6→Task 5/4;验收剧本→Task 15。无遗漏
- **占位符扫描**:全计划无 TBD/TODO/伪码;个别标注"以现状对齐"处(如测试 helper 命名、props 名)属既有代码事实核对,非占位
- **类型一致性**:`isVisible(SkillEntity, CurrentPrincipal)` 在 Task 3 定义、Task 4 消费;`findEffective(orgId, memberId, teamIds, policyType)` 在 Task 6 前后端一致;`MyPermissions` 形状 Task 7(后端)与 Task 8(前端)字段名一一对应(orgLevel/teamLevel/teamId/permissions)
