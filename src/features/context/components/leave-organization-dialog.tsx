"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useWorkspaceStore } from "@/features/context/store";
import { ApiClientError } from "@/lib/api-client";
import { toast } from "sonner";
import type { Organization } from "@/lib/contracts";

/**
 * 把任意错误归一化为可向用户展示的中文提示；
 * 与 workspace store 中的同款实现保持一致，便于切换器就地展示。
 */
function readableError(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

/**
 * 退出组织确认弹窗的状态与操作 hook。
 *
 * 调用方维护一个 `leaving` 状态；当非 null 时弹窗打开，
 * confirm 后调用 store.leaveOrganization，成功后 toast 并关闭。
 * 退出当前激活组织时，store 已自动降级到个人空间。
 */
export function useLeaveOrganizationDialog() {
  const store = useWorkspaceStore();
  const [leaving, setLeaving] = useState<Organization | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    if (busy) return;
    setLeaving(null);
  };

  const confirm = async () => {
    if (!leaving) return;
    setBusy(true);
    try {
      await store.leaveOrganization(leaving.id);
      toast.success(`已退出组织 ${leaving.name}`);
      setLeaving(null);
    } catch (caught) {
      toast.error(readableError(caught, "退出组织失败"));
    } finally {
      setBusy(false);
    }
  };

  return { leaving, setLeaving, busy, close, confirm } as const;
}

/**
 * 退出组织确认弹窗 UI。调用方通过 {@link useLeaveOrganizationDialog}
 * 获取状态并传入 props。
 */
export function LeaveOrganizationDialog(props: {
  leaving: Organization | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const { leaving, busy, onClose, onConfirm } = props;
  return (
    <AlertDialog
      open={leaving !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent size="default">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <LogOut className="text-destructive" />
          </AlertDialogMedia>
          <AlertDialogTitle>退出 {leaving?.name ?? "组织"}？</AlertDialogTitle>
          <AlertDialogDescription>
            退出后将失去该组织的访问权限，包括团队、成员、Skills 与规范。
            若之后想重新加入，需要组织管理员再次发起邀请。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void onConfirm();
              }}
            >
              {busy ? "正在退出…" : "确认退出"}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

