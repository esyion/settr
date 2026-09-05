"use client";

import { useState } from "react";
import { Edit, Plus, Trash2 } from "lucide-react";
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
 * 项目卡片：展示当前团队下的项目列表，
 * 项目可点击切换；提供创建项目表单与重命名/删除按钮。
 */
export function ProjectCard({ data }: { data: TeamsDataApi }) {
  const [name, setName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  if (!data.teamId) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>项目</CardTitle>
        <CardDescription>该团队下的项目列表</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {data.projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">该团队下还没有项目</p>
        ) : (
          <ul className="space-y-2">
            {data.projects.map((project) => (
              <li
                key={project.id}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                {renamingId === project.id ? (
                  <form
                    className="flex flex-1 items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void data.renameProject(project.id, renameValue);
                      setRenamingId(null);
                    }}
                  >
                    <Input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className="h-8"
                      autoFocus
                    />
                    <Button size="sm" type="submit">
                      保存
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      onClick={() => setRenamingId(null)}
                    >
                      取消
                    </Button>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      className={`flex-1 text-left ${
                        project.id === data.projectId ? "font-medium" : ""
                      }`}
                      onClick={() => data.setProjectId(project.id)}
                    >
                      {project.name}
                    </button>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={data.busy !== null}
                        onClick={() => {
                          setRenamingId(project.id);
                          setRenameValue(project.name);
                        }}
                      >
                        <Edit />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={data.busy !== null}
                        onClick={() => void data.deleteProject(project.id)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void data.createProject(name);
            setName("");
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="新建项目名称"
            disabled={data.busy !== null}
          />
          <Button type="submit" disabled={data.busy !== null || !name.trim()}>
            <Plus />
            创建
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}