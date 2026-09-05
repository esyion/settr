"use client";

import { useState } from "react";
import { CheckCircle2, FileText, Send, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { shortHash } from "@/lib/format";
import type { OrganizationDataApi } from "@/features/organization/hooks/use-organization-data";

type PolicyType = "AGENT" | "CLAUDE";

/**
 * 规范管理面板：提交新规范申请、审批待处理申请、查看历史版本和最终生效版本。
 */
export function PolicyPanel({ data }: { data: OrganizationDataApi }) {
  return (
    <div className="flex flex-col gap-6">
      <SubmitPolicyCard data={data} />
      <PendingPoliciesCard data={data} />
      <EffectivePolicyCard data={data} />
      <HistoryCard data={data} />
    </div>
  );
}

function SubmitPolicyCard({ data }: { data: OrganizationDataApi }) {
  const [type, setType] = useState<PolicyType>("AGENT");
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");
  const busy = data.busy === "提交规范申请";

  async function submit() {
    if (!data.organizationId) return;
    if (!content.trim() || !message.trim()) return;
    await data.submitPolicyChange({ policyType: type, content, message });
    setContent("");
    setMessage("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>提交规范申请</CardTitle>
        <CardDescription>
          选择要更新的规范类型，填入正文与修改说明；提交后会进入待审核列表。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>规范类型</Label>
          <Tabs
            value={type}
            onValueChange={(value) => setType(value as PolicyType)}
            className="w-fit"
          >
            <TabsList>
              <TabsTrigger value="AGENT">AGENT.md</TabsTrigger>
              <TabsTrigger value="CLAUDE">CLAUDE.md</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="policy-content">规范正文</Label>
          <Textarea
            id="policy-content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="粘贴或撰写新的规范内容"
            className="min-h-[200px] font-mono text-xs"
            disabled={!data.organizationId}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="policy-message">修改说明</Label>
          <Input
            id="policy-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="本次修改的目的和影响"
            maxLength={500}
            disabled={!data.organizationId}
          />
        </div>
        <div className="flex justify-end">
          <Button
            onClick={() => void submit()}
            disabled={
              busy || !data.organizationId || !content.trim() || !message.trim()
            }
          >
            <Send />
            提交申请
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PendingPoliciesCard({ data }: { data: OrganizationDataApi }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>待审核申请</CardTitle>
        <CardDescription>
          批准或拒绝团队成员提交的规范变更；通过后会生成新版本。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.pendingPolicies.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileText />
              </EmptyMedia>
              <EmptyTitle>暂无待审核申请</EmptyTitle>
              <EmptyDescription>
                团队成员提交新规范后会出现在这里。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.pendingPolicies.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.message}</p>
                  <p className="text-xs text-muted-foreground">
                    申请 ID：{item.id} · 状态 {item.status}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => void data.reviewPolicyChange(item.id, "APPROVED")}
                    disabled={
                      data.busy === "审核规范申请" && Boolean(data.busy)
                    }
                  >
                    <CheckCircle2 />
                    通过
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void data.reviewPolicyChange(item.id, "REJECTED")}
                    disabled={
                      data.busy === "审核规范申请" && Boolean(data.busy)
                    }
                  >
                    <XCircle />
                    拒绝
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function EffectivePolicyCard({ data }: { data: OrganizationDataApi }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>最终生效版本</CardTitle>
        <CardDescription>
          当前选中组织 / 团队 / 项目下的生效规范及其来源。
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <EffectiveCard label="AGENT.md" policy={data.effectivePolicies?.agent ?? null} />
        <EffectiveCard
          label="CLAUDE.md"
          policy={data.effectivePolicies?.claude ?? null}
        />
      </CardContent>
    </Card>
  );
}

function EffectiveCard({
  label,
  policy,
}: {
  label: string;
  policy: { versionId: string; sourceScope: string; sha256: string } | null;
}) {
  if (!policy) {
    return (
      <Alert>
        <FileText />
        <AlertTitle>{label}</AlertTitle>
        <AlertDescription>暂无生效版本</AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert>
      <FileText />
      <AlertTitle className="flex items-center gap-2">
        {label}
        <Badge variant="outline">{policy.sourceScope}</Badge>
      </AlertTitle>
      <AlertDescription className="font-mono text-xs">
        SHA-256 {shortHash(policy.sha256)} · version {policy.versionId}
      </AlertDescription>
    </Alert>
  );
}

function HistoryCard({ data }: { data: OrganizationDataApi }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>版本历史</CardTitle>
        <CardDescription>
          按类型加载最近的历史版本，便于追溯规范演化。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void data.loadPolicyHistory("AGENT")}
            disabled={!data.organizationId || data.busy === "加载版本历史"}
          >
            加载 AGENT 历史
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void data.loadPolicyHistory("CLAUDE")}
            disabled={!data.organizationId || data.busy === "加载版本历史"}
          >
            加载 CLAUDE 历史
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          已加载 {data.policyVersions.length} 个历史版本
        </p>
        {data.policyVersions.length > 0 && (
          <ul className="flex flex-col gap-1">
            {data.policyVersions.map((version) => (
              <li
                key={version.id}
                className="flex flex-wrap items-center gap-3 rounded-md bg-muted px-3 py-2 text-xs"
              >
                <span className="font-medium">v{version.versionNo}</span>
                <Badge variant="outline">{version.status}</Badge>
                <code className="font-mono text-muted-foreground">
                  {shortHash(version.sha256)}
                </code>
                <span className="text-muted-foreground">{version.id}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
