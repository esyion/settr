"use client";

import { useState } from "react";
import { Building2, Folder, FolderPlus, Network, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { OrganizationDataApi } from "@/features/organization/hooks/use-organization-data";

/**
 * 组织 / 团队 / 项目三级树形管理面板。
 * <p>
 * 顶层通过 shadcn Select 切换组织，再切换团队；项目列表在团队选定后展示。
 * 创建操作使用受控 Input + 按钮，每次只允许提交一个名字。
 */
export function OrganizationTreePanel({ data }: { data: OrganizationDataApi }) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-5" />
            组织
          </CardTitle>
          <CardDescription>选择当前操作的组织，并可创建新组织。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <OrganizationSelector data={data} />
          <CreateOrganizationForm data={data} />
        </CardContent>
      </Card>
      {data.organizationId && (
        <>
          <TeamCard data={data} />
          {data.teamId && <ProjectCard data={data} />}
        </>
      )}
    </div>
  );
}

function OrganizationSelector({ data }: { data: OrganizationDataApi }) {
  const value = data.organizationId || "__none__";
  return (
    <div className="flex flex-col gap-2">
      <Label>当前组织</Label>
      <Select
        value={value}
        onValueChange={(next) => data.setOrganizationId(next === "__none__" ? "" : next)}
      >
        <SelectTrigger className="w-full sm:w-72">
          <SelectValue placeholder="请选择组织" />
        </SelectTrigger>
        <SelectContent>
          {data.organizations.length === 0 ? (
            <SelectItem value="__none__" disabled>
              尚未创建任何组织
            </SelectItem>
          ) : (
            data.organizations.map((org) => (
              <SelectItem key={org.id} value={org.id}>
                {org.name}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

function CreateOrganizationForm({ data }: { data: OrganizationDataApi }) {
  const [name, setName] = useState("");
  const busy = data.busy === "创建组织";
  async function submit() {
    await data.createOrganization(name);
    setName("");
  }
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="org-create">创建新组织</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="org-create"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="组织名称"
          maxLength={120}
        />
        <Button onClick={() => void submit()} disabled={busy || !name.trim()}>
          <Plus />
          创建组织
        </Button>
      </div>
    </div>
  );
}

function TeamCard({ data }: { data: OrganizationDataApi }) {
  const [name, setName] = useState("");
  const busy = data.busy === "创建团队";
  async function submit() {
    await data.createTeam(name);
    setName("");
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Network className="size-5" />
          团队
        </CardTitle>
        <CardDescription>
          当前选中组织下的团队；选择团队后可继续管理项目和团队成员。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>当前团队</Label>
          <Select
            value={data.teamId || "__none__"}
            onValueChange={(next) => data.setTeamId(next === "__none__" ? "" : next)}
          >
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue placeholder="请选择团队" />
            </SelectTrigger>
            <SelectContent>
              {data.teams.length === 0 ? (
                <SelectItem value="__none__" disabled>
                  当前组织还没有团队
                </SelectItem>
              ) : (
                data.teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                    {team.defaultTeam ? "（默认）" : ""}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="team-create">创建新团队</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="team-create"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="团队名称"
              maxLength={120}
            />
            <Button
              onClick={() => void submit()}
              disabled={busy || !name.trim()}
            >
              <Plus />
              创建团队
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectCard({ data }: { data: OrganizationDataApi }) {
  const [name, setName] = useState("");
  const busy = data.busy === "创建项目";
  async function submit() {
    await data.createProject(name);
    setName("");
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Folder className="size-5" />
          项目
        </CardTitle>
        <CardDescription>当前团队下的项目列表，用于策略生效范围。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="project-create">创建新项目</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="project-create"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="项目名称"
              maxLength={120}
            />
            <Button
              onClick={() => void submit()}
              disabled={busy || !name.trim()}
            >
              <FolderPlus />
              创建项目
            </Button>
          </div>
        </div>
        {data.projects.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Folder />
              </EmptyMedia>
              <EmptyTitle>该项目下还没有项目</EmptyTitle>
              <EmptyDescription>
                使用上方输入框创建第一个项目。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y rounded-md border">
            {data.projects.map((project) => (
              <li
                key={project.id}
                className="flex items-center justify-between px-3 py-2 text-sm"
              >
                <span>{project.name}</span>
                <code className="font-mono text-xs text-muted-foreground">
                  {project.id}
                </code>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
