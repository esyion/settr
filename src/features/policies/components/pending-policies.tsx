"use client";

import { useState } from "react";
import { CheckCircle2, FileText, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PolicyReviewRequest, PolicyType } from "@/lib/contracts";
import type { PoliciesDataApi } from "@/features/policies/types";

/**
 * 待审批政策列表。
 *
 * 点击「批准/拒绝」打开 AlertDialog,展示待批准的政策正文;
 * 拒绝必须填写原因(后台写入 review_comment),批准可选备注。
 */
export function PendingPoliciesCard({ data }: { data: PoliciesDataApi }) {
  const [reviewing, setReviewing] = useState<
    | { request: PolicyReviewRequest; decision: "APPROVED" | "REJECTED" }
    | null
  >(null);
  const [comment, setComment] = useState("");

  const close = () => {
    setReviewing(null);
    setComment("");
  };

  const handleConfirm = async () => {
    if (!reviewing) return;
    const { request, decision } = reviewing;
    const trimmed = comment.trim();
    if (decision === "REJECTED" && !trimmed) return; // 拒绝必须留理由
    close();
    await data.reviewPolicyChange(request.id, decision, trimmed || undefined);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>待审批政策</CardTitle>
        <CardDescription>
          点击条目查看正文后再批准或拒绝;拒绝必须填写原因。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.pendingPolicies.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无待审批政策</p>
        ) : (
          <ul className="space-y-2">
            {data.pendingPolicies.map((p) => (
              <li
                key={p.id}
                className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.message || "(无提交说明)"}</span>
                    {p.policyType && <PolicyTypeBadge type={p.policyType} />}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    状态：{p.status}
                    {p.content
                      ? ` · 草案长度 ${p.content.length} 字符`
                      : " · 正文未提供"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={data.busy !== null}
                    onClick={() =>
                      setReviewing({ request: p, decision: "REJECTED" })
                    }
                  >
                    <XCircle />
                    拒绝
                  </Button>
                  <Button
                    size="sm"
                    disabled={data.busy !== null}
                    onClick={() =>
                      setReviewing({ request: p, decision: "APPROVED" })
                    }
                  >
                    <CheckCircle2 />
                    批准
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <AlertDialog
        open={reviewing !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {reviewing?.decision === "APPROVED" ? (
                <>
                  <CheckCircle2 className="size-5 text-primary" />
                  批准政策变更
                </>
              ) : (
                <>
                  <XCircle className="size-5 text-destructive" />
                  拒绝政策变更
                </>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {reviewing?.request.policyType && (
                <span className="mr-2 inline-flex">
                  <PolicyTypeBadge type={reviewing.request.policyType} />
                </span>
              )}
              {reviewing?.request.message}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex max-h-80 flex-col gap-2 overflow-hidden">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <FileText className="size-3.5" />
              草案正文
            </div>
            <pre className="max-h-60 overflow-auto rounded-md border bg-muted/30 px-3 py-2 text-xs leading-relaxed">
              {reviewing?.request.content ?? "(后端未提供草案正文)"}
            </pre>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="policy-review-comment">
              {reviewing?.decision === "REJECTED"
                ? "拒绝原因（必填）"
                : "备注（可选）"}
            </Label>
            <Textarea
              id="policy-review-comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={
                reviewing?.decision === "REJECTED"
                  ? "说明拒绝的原因,便于提交者后续修改"
                  : "审批意见或备注"
              }
              rows={3}
              autoFocus
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={data.busy !== null}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              className={
                reviewing?.decision === "REJECTED"
                  ? "bg-destructive text-white hover:bg-destructive/90"
                  : undefined
              }
              disabled={
                data.busy !== null ||
                (reviewing?.decision === "REJECTED" && !comment.trim())
              }
              onClick={(e) => {
                e.preventDefault();
                void handleConfirm();
              }}
            >
              {data.busy === "审批政策" ? (
                <Loader2 className="animate-spin" />
              ) : reviewing?.decision === "APPROVED" ? (
                <CheckCircle2 />
              ) : (
                <XCircle />
              )}
              {reviewing?.decision === "APPROVED" ? "确认批准" : "确认拒绝"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function PolicyTypeBadge({ type }: { type: PolicyType }) {
  const label = type === "AGENT" ? "AGENTS.md" : "CLAUDE.md";
  return (
    <Badge variant="secondary" className="font-mono text-[10px]">
      {label}
    </Badge>
  );
}
