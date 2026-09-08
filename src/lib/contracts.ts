export type Platform = "windows" | "macos" | "linux";
export type DocumentFormat = "agentsMd" | "claudeMd";

export interface ApiResponse<T> {
    code: number;
    message: string;
    data: T;
    requestId: string;
    timestamp: string;
}
export interface ApiPage<T> {
    records: T[];
    page: number;
    pageSize: number;
    total: number;
    pages: number;
}
export interface ApiErrorDetails {
    currentRevisionId?: string;
    clientParentRevisionId?: string;
    expected?: string;
    [key: string]: unknown;
}
export interface DeviceIdentity {
    deviceId: string;
    deviceName: string;
    platform: Platform;
    appVersion: string;
}
export interface Device {
    deviceId: string;
    deviceName: string;
    platform: Platform;
    appVersion: string;
    lastSeenAt: string;
    createdAt: string;
    revokedAt: string | null;
}
export interface CurrentUser {
    userId: string;
    email: string;
    deviceId: string | null;
    sessionId: string | null;
}
export interface TokenResponse {
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresInSeconds: number;
    userId: string;
    deviceId: string;
    sessionId: string;
}
export interface AuthSession extends TokenResponse {
    accessTokenExpiresAt: number;
}
export interface PasswordResetResponse {
    message: string;
}
export interface Document {
    id: string;
    documentType: string;
    headRevisionId: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface RevisionSummary {
    id: string;
    documentId: string;
    parentRevisionId: string | null;
    deviceId: string;
    content: string | null;
    contentHash: string;
    message: string | null;
    restoredFromRevisionId: string | null;
    createdAt: string;
}
export interface Revision extends RevisionSummary {
    content: string;
}
export interface LocalManifest {
    schemaVersion: number;
    documentId: string | null;
    deviceId: string | null;
    baseRevisionId: string | null;
    baseContentHash: string | null;
    lastAppliedRevisionId: string | null;
    lastSyncedAt: string | null;
    localContentHash: string | null;
}
export interface LocalSnapshot {
    exists: boolean;
    displayPath: string;
    bytes: number;
    modifiedAtMs: number | null;
    content: string | null;
    contentHash: string | null;
    manifest: LocalManifest;
}
export type SyncStatus =
    | "loading"
    | "signedOut"
    | "localOnly"
    | "initialChoice"
    | "synced"
    | "localModified"
    | "remoteModified"
    | "conflict"
    | "offline"
    | "error";
export interface SyncState {
    status: SyncStatus;
    format: DocumentFormat;
    local: LocalSnapshot | null;
    identity: DeviceIdentity | null;
    user: CurrentUser | null;
    document: Document | null;
    head: Revision | null;
    base: Revision | null;
    devices: Device[] | null;
    revisions: ApiPage<RevisionSummary> | null;
    message: string | null;
    requestId: string | null;
    refreshedAt: string | null;
}
export interface ApplyRemoteDocumentRequest {
    format: DocumentFormat;
    content: string;
    expectedContentHash: string | null;
    manifest: LocalManifest;
}

export interface Organization { id: string; name: string; ownerUserId: string; }
export interface Team { id: string; organizationId: string; name: string; defaultTeam: boolean; }
export interface Project { id: string; organizationId: string; teamId: string; name: string; }
export interface Membership { id: string; organizationId: string; userId: string; status: string; }
export interface EffectivePolicy { versionId: string; content: string; sha256: string; sourceScope: string; }
export interface EffectivePolicies { agent: EffectivePolicy | null; claude: EffectivePolicy | null; }

export interface TeamMembership {
  id: string;
  teamId: string;
  organizationMemberId: string;
  status: string;
  joinedAt: string;
}

export interface PolicyReviewRequest { id: string; message: string; status: string; }
export interface PolicyVersion { id: string; documentId: string; versionNo: number; content: string; sha256: string; status: string; }
export interface PolicyDistribution { id: string; versionId: string; scopeType: string; teamId: string | null; projectId: string | null; memberId: string | null; withdrawn: boolean; }

export interface PolicyDraft { id: string; policyDocumentId: string; status: string; contentHash: string; message: string; }

export interface RoleAssignment { id: string; userId: string; roleId: string; organizationId: string; teamId: string | null; projectId: string | null; }

export interface Role { id: string; roleCode: string; roleName: string; description: string | null; scope: string; }

export type InvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED";

export interface Invitation {
  id: string;
  organizationId: string;
  email: string;
  roleId: string | null;
  teamIds: string[];
  token: string;
  expiresAt: string;
  status: InvitationStatus;
  createdAt: string;
}

/** Skill 来源类型。 */
export type SkillSourceType = "local" | "github" | "skills_sh" | "zip_upload";

/** Skill 范围(当前 MVP 仅 personal,org 预留)。 */
export type SkillScope = "personal" | "org";

/** Skill 出现在订阅列表里的原因:个人创建、组织分发、用户订阅或导入。 */
export type SkillSubscriptionSource =
  | "PERSONAL_CREATE"
  | "ORG_SUBSCRIBE"
  | "USER_SUBSCRIBE"
  | "IMPORT";

/** Skill 元数据(列表/详情共用)。 */
export interface Skill {
    id: string;
    name: string;
    displayName: string | null;
    description: string | null;
    sourceType: SkillSourceType;
    sourceUrl: string | null;
    sourceRef: string | null;
    ownerScope: SkillScope;
    ownerUserId: string | null;
    orgId: string | null;
    latestVersionId: string | null;
    latestVersion: string | null;
    contentHash: string;
    hasUpdateAvailable: boolean;
    /** 订阅来源;仅订阅列表接口返回,普通 skill 列表为 null。 */
    source?: SkillSubscriptionSource | null;
    createdAt: string;
    updatedAt: string;
}

/** 创建 skill 请求体。 */
export interface CreateSkillRequest {
    name: string;
    displayName?: string | null;
    description?: string | null;
    sourceType: SkillSourceType;
    sourceUrl?: string | null;
    sourceRef?: string | null;
}

/** 更新 skill 元数据请求体。 */
export interface UpdateSkillRequest {
    displayName?: string | null;
    description?: string | null;
}

/** Skill 版本。 */
export interface SkillVersion {
    id: string;
    skillId: string;
    version: string;
    sizeBytes: number;
    contentHash: string;
    changelog: string | null;
    sourceMeta: Record<string, unknown> | null;
    publishedBy: string;
    publishedAt: string;
    downloadUrl: string | null;
}
