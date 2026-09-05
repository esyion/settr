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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TeamsDataApi } from "@/features/teams/types";

/**
 * 团队卡片：展示当前组织下的团队列表，
 * 提供创建表单与团队切换。
 */
export function TeamCard({ data }: { data: TeamsDataApi }) {
  const [name, setName] = useState("");

  if (!data.organizationId) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>团队</CardTitle>
        <CardDescription>组织下的团队列表</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {data.teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">该组织下还没有团队</p>
        ) : (
          <Select value={data.teamId} onValueChange={data.setTeamId}>
            <SelectTrigger>
              <SelectValue placeholder="选择团队" />
            </SelectTrigger>
            <SelectContent>
              {data.teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void data.createTeam(name);
            setName("");
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="新建团队名称"
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