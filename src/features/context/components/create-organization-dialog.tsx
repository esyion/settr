"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiClientError, api } from "@/lib/api-client";
import { useWorkspaceStore } from "@/features/context/store";
import { toast } from "sonner";

/**
 * 把任意错误归一化为可向用户展示的中文提示；
 * 与 LeaveOrganizationDialog 保持同一份文案，便于切换器就地展示。
 */
function readableError(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

/**
 * 创建组织对话框：作为 WorkspaceSwitcher 的「创建新组织」菜单触发入口，
 * 替代原先的 /organization 落地页卡片。创建成功后自动切到新组织并刷新 store。
 */
export function CreateOrganizationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const setOrganization = useWorkspaceStore((s) => s.setOrganization);
  const refresh = useWorkspaceStore((s) => s.refresh);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const trimmed = name.trim();

  /**
   * 关闭对话框：busy 时拒绝关闭，避免用户中途取消导致请求与 UI 不一致；
   * 关闭后清空输入，下次打开看到的是干净表单。
   */
  const close = (next: boolean) => {
    if (busy && !next) return;
    onOpenChange(next);
    if (!next) {
      setName("");
    }
  };

  /**
   * 提交创建：trim 后空字符串直接拒绝；成功后必须 refresh 再 setOrganization，
   * 否则新组织不在已缓存列表中，setOrganization 会静默 no-op，scope 留在 personal。
   */
  const submit = async () => {
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const org = await api.createOrganization(trimmed);
      await refresh();
      setOrganization(org.id);
      toast.success(`已创建组织 ${org.name}`);
      close(false);
    } catch (caught) {
      toast.error(readableError(caught, "创建组织失败"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>创建组织</DialogTitle>
          <DialogDescription>
            组织是团队与项目的容器。创建后即可邀请成员、配置角色与规范。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="create-organization-name">组织名称</Label>
          <Input
            id="create-organization-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如:Acme Inc"
            disabled={busy}
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Enter" && trimmed && !busy) {
                event.preventDefault();
                void submit();
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => close(false)}
            disabled={busy}
          >
            取消
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !trimmed}
          >
            <Plus />
            创建并切换
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
