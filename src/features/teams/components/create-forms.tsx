"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { useWorkspaceStore } from "@/features/context/store";
import { toast } from "sonner";

/**
 * 创建组织表单：在 teams feature 顶部使用，
 * 用户输入名称后调用 api.createOrganization。
 */
export function CreateOrganizationForm() {
  const setOrganization = useWorkspaceStore((s) => s.setOrganization);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>创建组织</CardTitle>
        <CardDescription>输入名称以新建一个组织</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const trimmed = name.trim();
            if (!trimmed || busy) return;
            setBusy(true);
            try {
              const org = await api.createOrganization(trimmed);
              setOrganization(org.id);
              toast.success(`已创建组织 ${org.name}`);
              setName("");
            } catch (caught) {
              const msg =
                caught instanceof Error ? caught.message : "创建组织失败";
              toast.error(msg);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="组织名称"
            disabled={busy}
          />
          <Button type="submit" disabled={busy || !name.trim()}>
            <Plus />
            创建并切换
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}