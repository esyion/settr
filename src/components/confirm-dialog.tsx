"use client";

import { Loader2 } from "lucide-react";
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

/**
 * 通用确认对话框：替代原生 window.confirm，
 * 在 Tauri WebView 中表现一致且与全应用 shadcn 风格统一。
 *
 * 用法：
 *   const [open, setOpen] = useState(false);
 *   <ConfirmDialog
 *     open={open}
 *     busy={busy}
 *     title="删除团队「xxx」？"
 *     description="此操作不可恢复。"
 *     confirmLabel="删除"
 *     destructive
 *     onOpenChange={setOpen}
 *     onConfirm={async () => { await doDelete(); setOpen(false); }}
 *   />
 */
export function ConfirmDialog({
  open,
  busy = false,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  destructive = false,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  busy?: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 是否为破坏性操作；为 true 时按钮使用 destructive 样式 */
  destructive?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            className={
              destructive
                ? "bg-destructive text-white hover:bg-destructive/90"
                : undefined
            }
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              void onConfirm();
            }}
          >
            {busy ? <Loader2 className="animate-spin" /> : null}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

