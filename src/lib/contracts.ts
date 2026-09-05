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
    id: string;
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
    devices: Device[];
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
export interface OrganizationMember { id: string; organizationId: string; userId: string; status: string; }
export interface EffectivePolicy { versionId: string; content: string; sha256: string; sourceScope: string; }
export interface EffectivePolicies { agent: EffectivePolicy | null; claude: EffectivePolicy | null; }

export interface TeamMember { id: string; teamId: string; organizationMemberId: string; status: string; }

export interface PendingPolicyRequest { id: string; message: string; status: string; }
export interface PolicyVersion { id: string; documentId: string; versionNo: number; content: string; sha256: string; status: string; }
export interface PolicyDistribution { id: string; versionId: string; scopeType: string; teamId: string | null; projectId: string | null; memberId: string | null; withdrawn: boolean; }

export interface PolicyChange { id: string; policyDocumentId: string; status: string; contentHash: string; message: string; }

export interface RoleAssignment { id: string; memberId: string; roleId: string; teamId: string | null; projectId: string | null; }

export interface RoleResponse { id: string; code: string; name: string; scope: string; }
