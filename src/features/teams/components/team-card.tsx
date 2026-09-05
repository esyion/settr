"use client";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import type { TeamsDataApi } from "@/features/teams/types";

/**
 * 团队卡片：展示当前组织下的团队列表，
 * 提供创建表单与团队切换。
 * 每个团队行支持重命名与删除（带确认）。
 */
export function TeamCard({ data }: { data: TeamsDataApi }) {
  const [name, setName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

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
          <ul className="space-y-2">
            {data.teams.map((team) => (
              <li
                key={team.id}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                {renamingId === team.id ? (
                  <form
                    className="flex flex-1 items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void data.renameTeam(team.id, renameValue);
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
                        team.id === data.teamId ? "font-medium" : ""
                      }`}
                      onClick={() => data.setTeamId(team.id)}
                    >
                      {team.name}
                    </button>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={data.busy !== null}
                        onClick={() => {
                          setRenamingId(team.id);
                          setRenameValue(team.name);
                        }}
                      >
                        <Edit />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={data.busy !== null}
                        onClick={() => void data.deleteTeam(team.id)}
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