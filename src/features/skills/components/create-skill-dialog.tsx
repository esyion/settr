"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiClientError } from "@/lib/api-client";
import type { CreateSkillRequest } from "@/lib/contracts";
import { useOrgBinding } from "@/features/skills/hooks/use-org-binding";
import { toast } from "sonner";

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * 创建 skill 对话框。
 * 仅做元数据创建(不含 ZIP);ZIP 在详情页"发布版本"中上传。
 */
export function CreateSkillDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // 组织态自动绑定归属(规格 §6.2);个人态为 undefined,后端缺省 PERSONAL
  const orgBinding = useOrgBinding();

  const reset = () => {
    setName("");
    setDisplayName("");
    setDescription("");
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("请填写 skill 名称");
      return;
    }
    if (!NAME_PATTERN.test(name)) {
      toast.error("名称必须小写字母/数字/连字符,以字母或数字开头,最长 64 字符");
      return;
    }
    const req: CreateSkillRequest = {
      name: name.trim(),
      displayName: displayName.trim() || null,
      description: description.trim() || null,
      sourceType: "local",
      ...orgBinding,
    };
    setSubmitting(true);
    try {
      await api.createSkill(req);
      toast.success(`skill "${name}" 创建成功,请发布首个版本`);
      reset();
      onCreated();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建 skill</DialogTitle>
          <DialogDescription>先创建元数据,创建后到详情页上传 ZIP 发布首个版本。</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="skill-name">名称(全局唯一)</Label>
            <Input
              id="skill-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-skill"
              autoComplete="off"
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground">小写字母、数字或连字符,以字母或数字开头,最长 64 字符,如 my-skill</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="skill-display">显示名</Label>
            <Input
              id="skill-display"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="My Skill"
              disabled={submitting}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="skill-desc">描述</Label>
            <Textarea
              id="skill-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="可选:这个 skill 做什么"
              rows={3}
              disabled={submitting}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>取消</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="animate-spin" />}
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
