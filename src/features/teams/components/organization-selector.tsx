"use client";

import { Edit, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { TeamsDataApi } from "@/features/teams/types";

/**
 * 组织选择器：展示当前组织，并支持重命名/删除。
 * 重命名与删除按钮带确认，避免误操作。
 */
export function OrganizationSelector({ data }: { data: TeamsDataApi }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle>当前组织</CardTitle>
        <CardDescription>
          切换或创建组织以管理其下的团队与项目。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {data.organizationId ? (
          <>
            {editing ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void data.renameOrganization(name);
                  setEditing(false);
                }}
              >
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="新组织名称"
                  autoFocus
                />
                <Button type="submit" disabled={data.busy !== null || !name.trim()}>
                  保存
                </Button>
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => setEditing(false)}
                >
                  取消
                </Button>
              </form>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-sm">
                  组织 ID:{" "}
                  <code className="font-mono">{data.organizationId}</code>
                </p>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={data.busy !== null}
                    onClick={() => {
                      setEditing(true);
                      setName("");
                    }}
                  >
                    <Edit />
                    重命名
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={data.busy !== null}
                    onClick={() => void data.deleteOrganization()}
                  >
                    <Trash2 />
                    删除
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            请通过侧边栏的上下文切换器选择一个组织。
          </p>
        )}
      </CardContent>
    </Card>
  );
}