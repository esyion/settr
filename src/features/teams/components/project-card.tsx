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
import type { TeamsDataApi } from "@/features/teams/types";

/**
 * 项目卡片：展示当前团队下的项目列表，
 * 项目可点击切换；提供创建项目表单。
 */
export function ProjectCard({ data }: { data: TeamsDataApi }) {
  const [name, setName] = useState("");

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
          <ul className="space-y-1">
            {data.projects.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted ${
                    project.id === data.projectId ? "bg-muted font-medium" : ""
                  }`}
                  onClick={() => data.setProjectId(project.id)}
                >
                  <span>{project.name}</span>
                  <code className="font-mono text-xs text-muted-foreground">
                    {project.id}
                  </code>
                </button>
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