"use client";

import { useEffect, useState } from "react";
import { Mail, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { membershipsApi } from "@/features/memberships/api";
import { useWorkspaceStore } from "@/features/context/store";
import { formatTime } from "@/lib/format";
import type { Invitation } from "@/lib/contracts";

/**
 * 待处理邀请列表：挂载时拉取当前组织的所有邀请，
 * 支持撤销(状态置为 REVOKED)。
 */
export function PendingInvitations() {
  const organizationId = useWorkspaceStore((s) => s.organizationId);
  const [items, setItems] = useState<Invitation[]>([]);

  useEffect(() => {
    if (!organizationId) {
      void Promise.resolve().then(() => setItems([]));
      return;
    }
    let cancelled = false;
    membershipsApi
      .listInvitations(organizationId)
      .then((list) => {
        // 兜底过滤 PENDING:后端应只返回待处理邀请,前端再保险一次避免脏数据误导管理员。
        if (!cancelled) setItems(list.filter((inv) => inv.status === "PENDING"));
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  async function revoke(id: string) {
    if (!organizationId) return;
    try {
      await membershipsApi.revokeInvitation(organizationId, id);
      setItems((cur) =>
        cur.map((i) => (i.id === id ? { ...i, status: "REVOKED" } : i)),
      );
      toast.success("已撤销邀请");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "撤销失败");
    }
  }

  if (!organizationId) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="size-5" />
          待处理邀请
        </CardTitle>
        <CardDescription>已发送但尚未被接受的邀请。</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无邀请</p>
        ) : (
          <ul className="space-y-2">
            {items.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatTime(inv.createdAt)} 发送 · 过期{" "}
                    {formatTime(inv.expiresAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void revoke(inv.id)}
                  >
                    <Trash2 />
                    撤销
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