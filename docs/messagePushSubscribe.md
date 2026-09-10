# 通用通知机制——合规化重设计

按你的两个要求重做：**雪花 ID 唯一约束 + 通用机制** + 严格对照两个 `AGENTS.md`。

---

## 〇、与上一版的关键差异

| 维度 | 上一版 | 本版（你要的） |
| --- | --- | --- |
| 主键 | `BIGINT` 但没强调 | 强制雪花 ID，对齐 `PushConnectRequest.organization_id` 的 `is_snowflake_id` 校验（`agents-plus/src-tauri/src/commands/push.rs:128-138`） |
| 外键 | 散落 | 全部为 `BIGINT`，跨边界字符串化 |
| Category | 业务枚举 | 字符串常量 + 业务方注册渲染（**通知模块零业务知识**） |
| 业务耦合 | 通知模块知道"邀请" | 业务模块调用 `NotificationPublisher.publish(...)`，通知模块不感知 |
| Entity 软删 | 通知表也有 `deleted/deleted_at` | 不可变记录，**不**继承 `BaseEntity`，隐藏用 `archived_at` 时间戳 |
| Builder | `@Builder` | `@SuperBuilder`（`agents-plus-server/AGENTS.md` §五"子类用 @SuperBuilder 替代 @Builder"） |
| DB DEFAULT | `read_at/archived_at` 加了 DEFAULT | `updated_at`/可变字段不加（AGENTS.md §四"`updatedAt` 不加数据库 DEFAULT"） |
| 渲染入口 | 默认渲染硬编码 | `NotificationListItem` 接受 `render` prop，业务方注册 |
| 投递状态 | 三个独立字段 | 一个 `delivery_state` + `channel_state` JSONB（通用扩展） |

---

## 一、数据库（雪花 ID + 严格对齐 AGENTS.md）

### 1.1 `t_notification`（不可变记录）

> `agents-plus-server/AGENTS.md` §四："**不可变记录不继承 BaseEntity**（因为没有 update 语义）"——所以下面这张表**没有** `updated_at` / `deleted` / `deleted_at`。

```sql
-- V8__t_notification.sql
CREATE TABLE t_notification (
    id                  BIGINT       PRIMARY KEY,                -- 雪花 ID
    recipient_id        BIGINT       NOT NULL,                    -- 接收者 userId（雪花）
    organization_id BIGINT       NULL,                            -- 归属组织（雪花，系统级通知可空）
    category VARCHAR(64)  NOT NULL,                              -- 业务分类（字符串，由调用方决定）
    severity VARCHAR(16)  NOT NULL DEFAULT 'INFO',            -- INFO / WARNING / ERROR
    title               VARCHAR(200) NOT NULL,                    -- 渲染标题
    body                TEXT         NULL,                        -- 渲染正文（可空）
    payload_json JSONB        NOT NULL DEFAULT '{}',            -- 业务数据（业务方自定义 JSONB）
    deep_link           VARCHAR(512) NULL,                        -- 跳转目标（agentsplus://...）
    source_event_id VARCHAR(64)  NULL,                            -- 幂等键（业务方提供）
    delivery_state VARCHAR(32)  NOT NULL DEFAULT 'PENDING',  -- 投递状态
    channel_state JSONB        NOT NULL DEFAULT '{}',            -- 各渠道状态 {"realtime":"DELIVERED","email":"SENT"}
    created_at TIMESTAMPTZ  NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
    delivered_at TIMESTAMPTZ NULL,
    read_at             TIMESTAMPTZ NULL,
    archived_at         TIMESTAMPTZ NULL
);

-- 不可变：deleted/deleted_at 列刻意省略。隐藏走 archived_at，删除走物理 DELETE。

-- 索引
CREATE INDEX idx_t_notification_recipient_unread
    ON t_notification (recipient_id, created_at DESC)
    WHERE read_at IS NULL AND archived_at IS NULL;
CREATE INDEX idx_t_notification_recipient_recent
    ON t_notification (recipient_id, created_at DESC);
CREATE UNIQUE INDEX uq_t_notification_source
    ON t_notification (recipient_id, source_event_id)
    WHERE source_event_id IS NOT NULL;

-- 防御性外键（PostgreSQL 不会自动建，按需在迁移里加）
ALTER TABLE t_notification
    ADD CONSTRAINT fk_t_notification_recipient
        FOREIGN KEY (recipient_id) REFERENCES t_user (id);
ALTER TABLE t_notification
    ADD CONSTRAINT fk_t_notification_org
        FOREIGN KEY (organization_id) REFERENCES t_organization (id);
```

**关键约束**：

- `created_at` 列 `DEFAULT (now() AT TIME ZONE 'UTC')` —— AGENTS.md §四纵深防御"数据库列 DEFAULT"。
- `created_at` 同时**必须**在实体里显式 `@TableField(fill = FieldFill.INSERT)` —— AGENTS.md §四"strictInsertFill 必须依赖 @TableField(fill=...) 注解"。
- `delivered_at` / `read_at` / `archived_at` **不加 DEFAULT** —— 同 `updated_at` 原则，仅由应用层写。
- `payload_json` / `channel_state` 走 `JsonbTypeHandler`，对齐 AGENTS.md §四"PostgreSQL JSONB 使用专用 TypeHandler"。

### 1.2 `t_notification_preference`（可变，继承 BaseEntity）

```sql
-- V8__t_notification_preference.sql
CREATE TABLE t_notification_preference (
    user_id          BIGINT     PRIMARY KEY,                    -- 雪花 ID（与 t_user.id 对齐）
    channels_json JSONB     NOT NULL DEFAULT '{}',            -- {"email":true,"desktop":true}
    categories_json JSONB     NOT NULL DEFAULT '{}',            -- {"INVITATION":{"email":true,"desktop":true}}
    quiet_hours_start TIME  NULL,
    quiet_hours_end   TIME  NULL
    -- created_at / updated_at / deleted / deleted_at 由 BaseEntity + CommonMetaObjectHandler 兜底
);
```

> 可变记录：`updated_at` 由 `CommonMetaObjectHandler.updateFill` 兜底（应用层写），**数据库列不加 DEFAULT** —— AGENTS.md §四。
> `created_at` / `deleted` 数据库列加 DEFAULT（与 §四纵深防御一致），实体字段自动继承 BaseEntity 的注解。

---

## 二、实体（严格按 AGENTS.md 规则）

### 2.1 `NotificationEntity`（不可变，不继承 BaseEntity）

```java
// entity/NotificationEntity.java
/**
 * 通用通知记录（不可变，append-only）。
 *
 * <p>符合 {@code agents-plus-server/AGENTS.md} §四：不可变记录不继承 BaseEntity；
 * 隐藏走 archived_at，删除走物理 DELETE。
 * <p>{@code createdAt} 必须显式标注
 * {@code @TableField(fill = FieldFill.INSERT)}，
 * 否则 {@code CommonMetaObjectHandler.strictInsertFill} 不会注册该字段，
 * INSERT 会写 NULL 触发 NOT NULL 违反。
 */
@Getter
@Setter
@SuperBuilder                        // 子类化场景下保留 builder（虽然本类无父类，规范要求）
@NoArgsConstructor
@TableName(value = "t_notification", autoResultMap = true)
public class NotificationEntity {
    @TableId(value = "id", type = IdType.ASSIGN_ID)
    private Long id;
    private Long recipientId;
    private Long organizationId;
    private String category;
    private String severity;
    private String title;
    private String body;
    @TableField(value = "payload_json", jdbcType = JdbcType.OTHER, typeHandler = JsonbTypeHandler.class)
    private String payloadJson;
    private String deepLink;
    private String sourceEventId;
    private String deliveryState;
    @TableField(value = "channel_state", jdbcType = JdbcType.OTHER, typeHandler = JsonbTypeHandler.class)
    private String channelState;
    @TableField(value = "created_at", fill = FieldFill.INSERT)
    private Instant createdAt;
    private Instant deliveredAt;
    private Instant readAt;
    private Instant archivedAt;
}
```

### 2.2 `NotificationPreferenceEntity`（可变，继承 BaseEntity）

```java
// entity/NotificationPreferenceEntity.java
/**
 * 通知偏好（可变记录）。
 *
 * <p>符合 {@code agents-plus-server/AGENTS.md} §四：继承 BaseEntity 获取
 * {@code createdAt / updatedAt / deleted / deletedAt} 字段及其自动填充。
 * <p>子类不再声明 4 个公共字段；用 {@code @SuperBuilder} 保证父类字段方法可用。
 */
@Getter
@Setter
@SuperBuilder
@NoArgsConstructor
@TableName(value = "t_notification_preference", autoResultMap = true)
public class NotificationPreferenceEntity extends BaseEntity {
    @TableId(value = "user_id", type = IdType.ASSIGN_ID)
    private Long userId;
    @TableField(value = "channels_json", jdbcType = JdbcType.OTHER, typeHandler = JsonbTypeHandler.class)
    private String channelsJson;
    @TableField(value = "categories_json", jdbcType = JdbcType.OTHER, typeHandler = JsonbTypeHandler.class)
    private String categoriesJson;
    private LocalTime quietHoursStart;
    private LocalTime quietHoursEnd;
}
```

---

## 三、服务端分层（按 `agents-plus-server/AGENTS.md` §三）

### 3.1 目录结构

```
common/notification/                            ← 模块对外暴露的"通用契约"
├─ NotificationPublisher.java                   ← 业务模块的唯一入口（薄封装 ApplicationEventPublisher）
├─ NotificationEnqueueEvent.java                ← Spring 事件载荷
├─ NotificationCategoryConstants.java           ← Category 字符串常量（按业务方注册，无业务耦合）
└─ NotificationSeverityConstants.java

controller/
└─ NotificationController.java                  ← /api/v1/users/me/notifications, /preference

dto/                                            ← AGENTS.md §七 DTO 分离
├─ NotificationDto.java                         ← 输出 record
├─ NotificationCountDto.java
├─ NotificationListQuery.java
├─ NotificationMarkReadRequest.java
├─ NotificationPreferenceDto.java
└─ NotificationPreferenceUpdateRequest.java

entity/
├─ NotificationEntity.java                      ← 不可变
└─ NotificationPreferenceEntity.java            ← 可变，继承 BaseEntity

mapper/                                         ← MyBatis-Plus BaseMapper
├─ NotificationMapper.java
└─ NotificationPreferenceMapper.java

repository/                                     ← 薄包装 Mapper
├─ NotificationRepository.java
└─ NotificationPreferenceRepository.java

service/
├─ NotificationService.java
├─ NotificationPreferenceService.java
└─ NotificationChannelDispatcher.java            ← 多通道路由

service/impl/
├─ NotificationServiceImpl.java
├─ NotificationPreferenceServiceImpl.java
└─ NotificationChannelDispatcherImpl.java

listener/
└─ NotificationEnqueueListener.java             ← 订阅 NotificationEnqueueEvent，事务后异步
```

### 3.2 通用入口：`NotificationPublisher`

```java
// common/notification/NotificationPublisher.java
/**
 * 通用通知发布器。业务模块通过本入口发布通知，
 * 通知模块不感知任何业务方存在 —— 业务标题/正文/分类/上下文由调用方决定。
 *
 * <p>事务语义：事件在调用方事务内发布；listener 通过
 * {@code @TransactionalEventListener(AFTER_COMMIT)} 在事务提交后消费，
 * 失败不回滚上游事务（参考 {@code PasswordResetNotifier}）。
 *
 * @param category    业务分类字符串（建议从 {@link NotificationCategoryConstants} 取）
 * @param severity    INFO / WARNING / ERROR
 * @param recipientId 接收者 userId（雪花 ID，未注册用户传 null 走纯邮件兜底）
 * @param orgId       归属组织（系统级通知传 null）
 * @param title       渲染标题（≤200 字符，由调用方本地化）
 * @param body        渲染正文（≤4k 字符，可空）
 * @param payload     业务 JSONB（深链 token、参数等）
 * @param deepLink    跳转目标（如 {@code agentsplus://accept-invite?token=...}）
 * @param sourceEventId 幂等键（业务方提供，确保重试安全）
 */
public interface NotificationPublisher {
    void publish(
        String category,
        String severity,
        Long recipientId,
        Long organizationId,
        String title,
        String body,
        Map<String, Object> payload,
        String deepLink,
        String sourceEventId
    );
}
```

**关键设计**：

- **业务模块只调这个接口**，通知模块对业务零知识。
- 业务方决定 Category 字符串（建议从 `NotificationCategoryConstants` 取，**仅作命名建议，不强制枚举**）。
- 通知模块不知道"邀请"存在 —— 业务方传什么就存什么。
- 业务模块不直接 import 通知模块的 Entity/Repository。

### 3.3 业务方接入示例（Invitation）

```java
// service/impl/InvitationServiceImpl.java（节选）
@RequiredArgsConstructor
public class InvitationServiceImpl implements InvitationService, ProxySelf<InvitationService> {
    // ... 现有依赖 ...
    private final NotificationPublisher notifications;
    private final UserRepository users;

    @Override
    @Transactional
    public InvitationDto create(Long organizationId, CreateInvitationRequest request) {
        // ... 现有逻辑：去重、生成 token、保存邀请 ...
        invitations.save(inv);

        // 通用通知 —— 业务方决定标题/正文/分类/上下文，通知模块零业务知识
        Long inviteeUserId = users.findIdByEmailIgnoreCase(request.email()).orElse(null);
        String deepLink = invitationProperties.urlScheme() + "://"
            + invitationProperties.urlHost() + "?token=" + rawToken;
        Map<String, Object> payload = Map.of(
            "invitationId", inv.getId(),
            "organizationId", organizationId,
            "email", request.email()
        );
        notifications.publish(
            "INVITATION",                // 业务方定义 category
            "INFO",
            inviteeUserId,                // 未注册 → null → 走邮件兜底
            organizationId,
            "组织邀请",
            "您被邀请加入 " + organizationName,
            payload,
            deepLink,
            rawToken                      // 幂等键 = 邀请 token
        );
        return toDto(inv, rawToken);
    }
}
```

### 3.4 `NotificationEnqueueListener`（事务后异步，仿 `PasswordResetNotifier`）

```java
// listener/NotificationEnqueueListener.java
/**
 * 通知入站监听器。订阅 {@link NotificationEnqueueEvent}，在调用方事务提交后
 * 异步落库 + 路由到各通道。
 *
 * <p>幂等性：{@code source_event_id} + {@code recipient_id} 唯一约束保证
 * 重试安全；listener 重入只会触发一条入库路径。
 *
 * <p>失败隔离：邮件发送失败不影响实时通道；通道失败不影响入库。
 * 失败原因写入 {@code channel_state} JSONB 便于事后追溯。
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class NotificationEnqueueListener {
    private final NotificationRepository notifications;
    private final NotificationChannelDispatcher dispatcher;
    private final ObjectMapper objectMapper;

    @TransactionalEventListener(AFTER_COMMIT)
    public void onEnqueue(NotificationEnqueueEvent event) {
        // 1. 落库（已通过 publisher 在事务内 save，这里读取已落库条目）
        NotificationEntity entity = notifications.findById(event.notificationId())
            .orElseThrow(() -> new IllegalStateException("通知记录不存在: " + event.notificationId()));

        // 2. 路由到各通道（实时 + 邮件兜底）
        ChannelResult result = dispatcher.deliver(entity);

        // 3. 落投递结果
        entity.setDeliveryState(result.overallState());
        entity.setChannelState(objectMapper.writeValueAsString(result.channelStates()));
        if (result.deliveredAt() != null) {
            entity.setDeliveredAt(result.deliveredAt());
        }
        notifications.updateById(entity);
    }
}
```

---

## 四、实时通道（复用现有 SSE）

### 4.1 服务端：扩 `PushRegistry` 维度

按 AGENTS.md §七 DTO 分离、`agents-plus-server/AGENTS.md` §三 ServiceImpl 承载流程：

- **`PushRegistry`**：注册维度从 `(organizationId, sessionId)` 扩为 `(subjectType, subjectId, sessionId)`，其中 `subjectType ∈ {USER, ORG}`。
- **新增 `/api/v1/users/me/stream` 端点**：仿 `PushStreamController.java`，鉴权用 `PermissionCode.USER_SELF`（或新增专用权限码）。
- **`PushService.EVENT_NOTIFY = "notify"`**：新增广播事件名（与 `EVENT_ORG_CHANGE = "org-change"` 并列）。

### 4.2 Rust：扩 IPC

按 `agents-plus/AGENTS.md` §4.x 分层，新增 command 仅做边界校验：

```rust
// commands/push.rs（新增）
/**
 * 用户维度的实时通道订阅（登录态有效期内常驻）。
 *
 * <p>接收来自 server 的 {@code notify} SSE 事件并投递给 webview：
 * {@code push://notify} 事件载荷见 {@link PushNotifyPayload}。
 *
 * @param request 连接参数（baseUrl / accessToken）
 * @param state   全局应用状态
 * @param app     应用句柄
 * @return 受理状态
 */
#[tauri::command]
pub async fn push_subscribe_user(
    request: PushSubscribeUserRequest,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<PushStatusDto, String> { /* ... 仿 push_connect ... */ }
```

```rust
// dto/push.rs（新增）
/** push_subscribe_user 命令的请求参数 */
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushSubscribeUserRequest {
    pub base_url: String,
    pub access_token: String,
}

/** 发给 webview 的 notify 事件载荷（push://notify） */
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushNotifyPayload {
    pub notification_id: String,        // 雪花 ID 字符串
    pub category: String,                // 业务分类
    pub title: String,
    pub body: Option<String>,
    pub deep_link: Option<String>,
    pub received_at: String,            // ISO
}
```

### 4.3 前端：扩 `services/push.ts`

按 `agents-plus/AGENTS.md` §4.1 服务/IPC gateway 集中收口：

```ts
// services/push.ts（新增）
export const PUSH_NOTIFY_EVENT = "push://notify";

export interface PushNotifyPayload {
  notificationId: string;
  category: string;
  title: string;
  body: string | null;
  deepLink: string | null;
  receivedAt: string;
}

/**
 * 订阅用户维度的实时通知通道（登录态有效期内常驻）。
 */
export async function pushSubscribeUser(input: { baseUrl: string; accessToken: string }):
  Promise<PushStatusResult> { /* invoke push_subscribe_user */ }

/**
 * 取消订阅用户维度的实时通知通道。
 */
export async function pushUnsubscribeUser(): Promise<PushStatusResult> {
  return invokeNative<PushStatusResult>("push_unsubscribe_user");
}

/**
 * 订阅 push://notify 事件。
 */
export async function onPushNotify(
  handler: (payload: PushNotifyPayload) => void,
): Promise<UnlistenFn> {
  return listen<PushNotifyPayload>(PUSH_NOTIFY_EVENT, (event) => handler(event.payload));
}
```

---

## 五、客户端通用化（按 `agents-plus/AGENTS.md` §3 features 切片）

### 5.1 `features/notifications/` 目录

```
features/notifications/
├─ components/
│   ├─ NotificationBell.tsx              ← 顶栏铃铛 + 红点徽标（≤300 行）
│   ├─ NotificationList.tsx              ← 列表骨架（不带业务渲染）
│   ├─ NotificationListItem.tsx          ← 单条（默认 + render prop 注入业务渲染）
│   ├─ NotificationEmpty.tsx
│   └─ NotificationPreferences.tsx        ← 偏好开关面板
├─ hooks/
│   ├─ use-notifications.ts              ← 数据源（list / count / read / archive）
│   ├─ use-notification-stream.ts        ← 订阅 push://notify
│   ├─ use-notification-preference.ts    ← 偏好读写
│   └─ use-notification-renderer.ts      ← 渲染器注册中心
├─ renderers/
│   ├─ default-renderer.tsx              ← 默认渲染（通用）
│   └─ invitation-renderer.tsx           ← 邀请专用渲染（业务方注册，可选）
├─ store/
│   └─ notification-store.ts             ← zustand
├─ api.ts                                ← IPC gateway
├─ types.ts                              ← NotificationDto 等契约
└─ index.ts                              ← 对外：NotificationBell / useNotifications / useNotificationStream
```

### 5.2 通用契约（`types.ts`）

按 `agents-plus/AGENTS.md` §3"前后端传输使用稳定 DTO"：

```ts
// features/notifications/types.ts

/**
 * 通用通知 DTO（与后端 NotificationDto 字段一一对应，camelCase）。
 *
 * <p>字段稳定性：新增字段必须向后兼容；删除字段要走 deprecation 周期。
 * <p>安全：列表接口已过滤敏感字段（如邀请原始 token），调用方不应尝试
 * 从 {@link payload} 拿 token 调用 accept 接口；跳转走 {@link deepLink}。
 */
export interface NotificationDto {
  id: string;                            // 雪花 ID 字符串
  recipientId: string;
  organizationId: string | null;
  category: string;                      // 业务分类字符串
  severity: "INFO" | "WARNING" | "ERROR";
  title: string;
  body: string | null;
  payload: Record<string, unknown>;      // 业务 JSONB（已过滤敏感字段）
  deepLink: string | null;
  deliveryState: "PENDING" | "DELIVERED" | "READ";
  read: boolean;                         // 派生字段
  createdAt: string;                     // ISO
  readAt: string | null;
}

/**
 * 通知偏好 DTO。
 */
export interface NotificationPreferenceDto {
  channels: Record<"email" | "desktop", boolean>;
  categories: Record<string, Record<"email" | "desktop", boolean>>;
  quietHoursStart: string | null;        // "HH:mm"
  quietHoursEnd: string | null;
}
```

### 5.3 通用 ListItem + 渲染器注册中心（核心通用化）

```tsx
// components/NotificationListItem.tsx
import type { NotificationDto } from "../types";
import { renderNotification } from "../hooks/use-notification-renderer";

/**
 * 通用单条通知渲染：先查注册中心，命中业务专用渲染器；
 * 未命中走默认渲染（标题 + 正文 + 时间 + 未读圆点）。
 */
export function NotificationListItem({
  notification,
  onClick,
}: {
  notification: NotificationDto;
  onClick?: (n: NotificationDto) => void;
}) {
  const Custom = renderNotification(notification.category);
  if (Custom) return <Custom notification={notification} onClick={onClick} />;
  return <DefaultRow notification={notification} onClick={onClick} />;
}
```

```ts
// hooks/use-notification-renderer.ts
import type { NotificationDto } from "../types";
import type { ComponentType } from "react";

type RendererProps = {
  notification: NotificationDto;
  onClick?: (n: NotificationDto) => void;
};

const registry = new Map<string, ComponentType<RendererProps>>();

/**
 * 业务方注册自定义渲染器（在 features 初始化时一次性调用）。
 */
export function registerNotificationRenderer(
  category: string,
  Component: ComponentType<RendererProps>,
): void {
  registry.set(category, Component);
}

/**
 * 取已注册的渲染器；未注册返回 null，调用方走默认渲染。
 */
export function renderNotification(category: string): ComponentType<RendererProps> | null {
  return registry.get(category) ?? null;
}
```

**业务方接入（Invitation 模块注册自定义渲染）**：

```ts
// features/invitations/renderers/invitation-renderer.tsx
import { registerNotificationRenderer } from "@/features/notifications";

registerNotificationRenderer("INVITATION", function InvitationNotification({
  notification, onClick,
}) {
  return (
    <button onClick={() => onClick?.(notification)} className="...">
      <Mail className="size-4 text-primary" />
      <div>
        <div className="font-medium">{notification.title}</div>
        <div className="text-xs text-muted-foreground">{notification.body}</div>
      </div>
      {/* 点击跳转深链 —— 不在通知模块写死 */}
      <Button onClick={() => notification.deepLink && openDeepLink(notification.deepLink)}>
        查看
      </Button>
    </button>
  );
});
```

### 5.4 通用 IPC gateway（`api.ts`）

```ts
// features/notifications/api.ts
import { api, type ApiClientError } from "@/lib/api-client";
import type { NotificationDto, NotificationPreferenceDto } from "./types";

/** 通用通知 API gateway —— 所有调用经此收口，避免散落 invoke。 */
export const notificationsApi = {
  /** 拉取通知列表（分页 + 未读/已读/归档过滤） */
  list: (query: {
    cursor?: string;
    limit?: number;
    filter?: "all" | "unread" | "archived";
  }) =>
    api.request<{ items: NotificationDto[]; nextCursor: string | null }>(
      "/api/v1/users/me/notifications" + buildQueryString(query),
    ),

  /** 未读数（顶栏徽标） */
  countUnread: () =>
    api.request<{ unread: number }>("/api/v1/users/me/notifications/count"),

  /** 标记已读 */
  markRead: (id: string) =>
    api.request<void>(
      `/api/v1/users/me/notifications/${encodeURIComponent(id)}/read`,
      { method: "POST" },
    ),

  /** 批量已读 */
  markAllRead: () =>
    api.request<{ updated: number }>(
      "/api/v1/users/me/notifications/read-all",
      { method: "POST" },
    ),

  /** 归档 */
  archive: (id: string) =>
    api.request<void>(
      `/api/v1/users/me/notifications/${encodeURIComponent(id)}/archive`,
      { method: "POST" },
    ),

  /** 偏好读取 */
  getPreference: () =>
    api.request<NotificationPreferenceDto>(
      "/api/v1/users/me/notifications/preference",
    ),

  /** 偏好更新 */
  updatePreference: (input: NotificationPreferenceDto) =>
    api.request<NotificationPreferenceDto>(
      "/api/v1/users/me/notifications/preference",
      { method: "PUT", body: input },
    ),
};
```

### 5.5 顶栏 Bell + 系统通知联动（按现有 `pending-updates-badge.tsx` 模式）

```tsx
// components/NotificationBell.tsx
import { useEffect } from "react";
import { Bell } from "lucide-react";
import { Popover, ... } from "@/components/ui/popover";
import { useNotifications } from "../hooks/use-notifications";
import { useNotificationStream } from "../hooks/use-notification-stream";
import { isTauriRuntime } from "@/lib/tauri";
import { sendSystemNotification } from "@/services/notification";

/**
 * 顶栏通用通知铃铛：
 * <ul>
 *   <li>挂载时拉取未读数 + 首屏列表；</li>
 *   <li>订阅 push://notify 实时刷新；</li>
 *   <li>窗口不在前台时弹 OS 系统通知（复用 tauri-plugin-notification）。</li>
 * </ul>
 */
export function NotificationBell() {
  const { items, unreadCount, reload, markRead } = useNotifications();
  const { streamConnected } = useNotificationStream({
    onIncoming: async (payload) => {
      await reload();
      if (typeof document !== "undefined" && document.hidden) {
        await sendSystemNotification(payload.title, payload.body ?? undefined);
      }
    },
  });

  return (
    <Popover>
      <PopoverTrigger>
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span className="... red dot ...">{unreadCount}</span>
        )}
      </PopoverTrigger>
      <PopoverContent>
        <NotificationList items={items} onItemClick={markRead} />
      </PopoverContent>
    </Popover>
  );
}
```

### 5.6 capabilities

按 `agents-plus/AGENTS.md` §4.x"最小权限"：`notification:default` 已经在 `agents-plus/src-tauri/capabilities/default.json:14`，**新增 IPC 命令要在 capability 里加白名单**。

```jsonc
// capabilities/default.json（追加）
{
  "permissions": [
    // ... 现有 ...
    "push:allow-push-subscribe-user",
    "push:allow-push-unsubscribe-user"
  ]
}
```

---

## 六、安全 / 日志 / 限流（按 `agents-plus-server/AGENTS.md` §六）

| 项 | 处理 |
| --- | --- |
| 鉴权 | `AuthorizationService.requireSelf(principal.userId, notification.recipientId)` —— 任何人不能读写他人通知 |
| 限流 | `/users/me/notifications` 接 `RateLimitProperties`（`application.yaml:43-47`），建议 `NOTIFICATION_REQUESTS_PER_WINDOW=120` |
| 内容校验 | `title` ≤200、`body` ≤4k、`payload` ≤16k（对齐 `SYNC_MAX_METADATA_BYTES`）、`deep_link` ≤512 |
| 日志 | 不打印 `payload_json`、不打印原始 `deep_link` token（参考 `PasswordResetNotifier.java`） |
| XSS | 前端 shadcn Text 渲染，不接 HTML；`deep_link` 走 `parseDeepLink` 严格白名单（已有 `agents-plus/src/lib/deep-link.ts:108-110`） |
| 隐私 | **列表接口不返回 payload 中包含原始 token 的字段**；后端 `NotificationDto.from()` 过滤敏感字段 |
| 雪花 ID | 跨边界字符串化（与现有 `is_snowflake_id` 校验一致，路径：`agents-plus/src-tauri/src/commands/push.rs:128-138`） |

---

## 七、落地清单（按 AGENTS.md 拆分 PR）

1. **DB 迁移**：`V8__t_notification.sql` + `V8__t_notification_preference.sql`
2. **Entity**：`NotificationEntity`（不可变，不继承 BaseEntity）、`NotificationPreferenceEntity`（继承 BaseEntity，@SuperBuilder）
3. **Mapper**：`NotificationMapper extends BaseMapper<NotificationEntity>`、`NotificationPreferenceMapper extends BaseMapper<NotificationPreferenceEntity>`
4. **Repository**：薄包装（AGENTS.md §四"Mapper 使用 BaseMapper"）
5. **DTO**：`NotificationDto`（record，独立于 Entity）、`NotificationPreferenceDto` 等
6. **通用契约**：`common/notification/NotificationPublisher`、`NotificationEnqueueEvent`、`NotificationCategoryConstants`
7. **Service**：`NotificationService`、`NotificationPreferenceService`、`NotificationChannelDispatcher`
8. **Listener**：`NotificationEnqueueListener`（`@TransactionalEventListener(AFTER_COMMIT)`，仿 `PasswordResetNotifier`）
9. **Controller**：`NotificationController`（list / count / read / archive / preference）
10. **实时通道**：服务端 `UserChannelRegistry` + `/users/me/stream` 端点 + `PushService.EVENT_NOTIFY`
11. **Rust**：DTO（`PushNotifyPayload`、`PushSubscribeUserRequest`）+ commands（`push_subscribe_user` / `push_unsubscribe_user`）
12. **前端 features 切片**：`features/notifications/` 全套（types / api / store / hooks / components / renderers）
13. **前端 IPC gateway**：扩 `services/push.ts`（`pushSubscribeUser` / `onPushNotify`）
14. **Tauri capability**：扩 `capabilities/default.json` 白名单
15. **业务接入示范**：`InvitationServiceImpl.create` 改为 `notifications.publish(...)`（替换原 try/catch 邮件）
16. **测试**：单测（幂等、状态机、偏好生效、鉴权）+ 端到端（邀请 → 通知 → 接受）

---

## 八、需要你定的最后几个决策

1. **业务接入优先级**：先做INVITATION
2. **投递通道默认值**：只做实时 + 系统通知  
3. **偏好默认值**：`channels_enabled = {email: true, desktop: true}` 合适
4. **归档清理周期**：不归档，不清理，必须用户点击后已读
5. **是否扩 `OrgChangeType` 加 `NOTIFICATION`**：严格保持通知与组织内容变更正交  
