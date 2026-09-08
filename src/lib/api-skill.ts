import type { ApiPage, CreateSkillRequest, Skill, SkillVersion, UpdateSkillRequest } from "@/lib/contracts";
import { request } from "@/lib/api-request";
import { nativeApiUpload, type NativeApiUploadPart } from "@/lib/tauri";
import { loadSession } from "@/lib/session-store";
import { ApiClientError, getApiBaseUrl, parseEnvelope } from "@/lib/api-request";

/** Skill 分发关系(组织 → team/member)。 */
export interface SkillDistribution {
  id: string;
  skillId: string;
  organizationId: string;
  scopeType: "ORGANIZATION" | "TEAM" | "MEMBER";
  teamId: string | null;
  memberId: string | null;
  distributedByMemberId: string;
  withdrawn: boolean;
}

export interface DistributeSkillRequestBody {
  skillId: string;
  scopeType: "ORGANIZATION" | "TEAM" | "MEMBER";
  teamId?: string;
  memberId?: string;
}

/** 把浏览器 File 转为 IPC 可传输的字节数组 part。 */
async function fileToUploadPart(
  file: File,
  name: string,
  contentType?: string,
): Promise<NativeApiUploadPart> {
  const buffer = await file.arrayBuffer();
  const data = Array.from(new Uint8Array(buffer));
  return {
    name,
    filename: file.name,
    contentType: contentType ?? file.type ?? "application/octet-stream",
    data,
  };
}

/** 发布 skill 新版本(multipart)。 */
async function publishSkillVersionMultipart(
  skillId: string,
  file: File,
  meta: { version: string; changelog?: string }
): Promise<SkillVersion> {
  const session = await loadSession();
  if (!session) {
    throw new ApiClientError("登录会话不存在或无法恢复", 40100, 401, null, null);
  }
  const metaPart: NativeApiUploadPart = {
    name: "meta",
    contentType: "application/json",
    data: Array.from(new TextEncoder().encode(JSON.stringify(meta))),
  };
  const zipPart = await fileToUploadPart(file, "zip", "application/zip");
  const response = await nativeApiUpload({
    baseUrl: await getApiBaseUrl(),
    path: "/api/v1/skills/" + encodeURIComponent(skillId) + "/versions",
    parts: [zipPart, metaPart],
    accessToken: session.accessToken,
  });
  return parseEnvelope<SkillVersion>(response);
}

/** 导入请求可选携带的组织归属(组织空间导入时注入,规格 §6.2)。 */
export interface SkillOrgBinding {
  ownerScope: "ORG";
  orgId: string;
}

/** 上传 ZIP 导入 skill(multipart);binding 传入时附加组织归属表单字段。 */
async function importSkillZipMultipart(
  file: File,
  name: string,
  binding?: SkillOrgBinding,
): Promise<Skill> {
  const session = await loadSession();
  if (!session) {
    throw new ApiClientError("登录会话不存在或无法恢复", 40100, 401, null, null);
  }
  const textPart = (partName: string, value: string): NativeApiUploadPart => ({
    name: partName,
    contentType: "text/plain; charset=utf-8",
    data: Array.from(new TextEncoder().encode(value)),
  });
  const namePart = textPart("name", name);
  const zipPart = await fileToUploadPart(file, "zip", "application/zip");
  const parts: NativeApiUploadPart[] = [zipPart, namePart];
  if (binding) {
    parts.push(textPart("ownerScope", binding.ownerScope));
    parts.push(textPart("orgId", binding.orgId));
  }
  const response = await nativeApiUpload({
    baseUrl: await getApiBaseUrl(),
    path: "/api/v1/skills/import/zip",
    parts,
    accessToken: session.accessToken,
  });
  return parseEnvelope<Skill>(response);
}

/** Skill 相关 API 方法集合(由 api-client 合入主 api 对象)。 */
export const skillApi = {
  listSkillDistributions: (organizationId: string) =>
    request<SkillDistribution[]>(
      "/api/v1/organizations/" + encodeURIComponent(organizationId) + "/skill-distributions"
    ),
  distributeSkill: (
    organizationId: string,
    body: DistributeSkillRequestBody
  ) =>
    request<SkillDistribution>(
      "/api/v1/organizations/" + encodeURIComponent(organizationId) + "/skill-distributions",
      { method: "POST", body }
    ),
  withdrawSkillDistribution: (organizationId: string, distributionId: string) =>
    request<void>(
      "/api/v1/organizations/" +
        encodeURIComponent(organizationId) +
        "/skill-distributions/" +
        encodeURIComponent(distributionId),
      { method: "DELETE" }
    ),

  listSkills: (params?: { scope?: "personal" | "org"; orgId?: string; q?: string; page?: number; size?: number }) => {
    const query = new URLSearchParams();
    if (params?.scope) query.set("scope", params.scope);
    if (params?.orgId) query.set("org_id", params.orgId);
    if (params?.q) query.set("q", params.q);
    if (params?.page) query.set("page", String(params.page));
    if (params?.size) query.set("size", String(params.size));
    const qs = query.toString();
    return request<ApiPage<Skill>>("/api/v1/skills" + (qs ? "?" + qs : ""));
  },
  getSkill: (id: string) =>
    request<Skill>("/api/v1/skills/" + encodeURIComponent(id)),
  createSkill: (input: CreateSkillRequest) =>
    request<Skill>("/api/v1/skills", { method: "POST", body: input }),
  updateSkill: (id: string, input: UpdateSkillRequest) =>
    request<Skill>("/api/v1/skills/" + encodeURIComponent(id), { method: "PATCH", body: input }),
  deleteSkill: (id: string) =>
    request<void>("/api/v1/skills/" + encodeURIComponent(id), { method: "DELETE" }),

  listSkillVersions: (skillId: string) =>
    request<SkillVersion[]>("/api/v1/skills/" + encodeURIComponent(skillId) + "/versions"),
  getSkillVersion: (skillId: string, version: string) =>
    request<SkillVersion>(
      "/api/v1/skills/" + encodeURIComponent(skillId) + "/versions/" + encodeURIComponent(version)
    ),
  publishSkillVersion: (skillId: string, file: File, meta: { version: string; changelog?: string }) =>
    publishSkillVersionMultipart(skillId, file, meta),

  importSkillFromGithub: (input: {
    repo: string;
    ref?: string;
    path?: string;
    ownerScope?: "ORG";
    orgId?: string;
  }) =>
    request<Skill>("/api/v1/skills/import/github", { method: "POST", body: input }),
  importSkillFromSkillsSh: (input: { slug: string; ownerScope?: "ORG"; orgId?: string }) =>
    request<Skill>("/api/v1/skills/import/skills-sh", { method: "POST", body: input }),
  importSkillFromZip: (file: File, name: string, binding?: SkillOrgBinding) =>
    importSkillZipMultipart(file, name, binding),

  listSkillSubscriptions: () =>
    request<Skill[]>("/api/v1/skills/subscriptions"),
  listSkillPendingUpdates: () =>
    request<Skill[]>("/api/v1/skills/pending-updates"),
  listSkillNotifications: () =>
    request<Skill[]>("/api/v1/skills/notifications"),
  subscribeSkill: (id: string) =>
    request<void>("/api/v1/skills/" + encodeURIComponent(id) + "/subscribe", { method: "POST" }),
  unsubscribeSkill: (id: string) =>
    request<void>("/api/v1/skills/" + encodeURIComponent(id) + "/subscribe", { method: "DELETE" }),
  markSkillSeen: (id: string) =>
    request<void>("/api/v1/skills/" + encodeURIComponent(id) + "/seen", { method: "POST" }),
  triggerSkillCheckUpdate: (id: string) =>
    request<Skill>("/api/v1/skills/" + encodeURIComponent(id) + "/check-update", { method: "POST" }),
};