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
