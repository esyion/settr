"use client";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Toggle } from "@/components/ui/toggle";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { HARNESS_LIST } from "@/features/skills/skill-harness";
import { Button } from "@/components/ui/button";
import type { Skill } from "@/lib/contracts";
import { HARNESS_META, type HarnessKey, type HarnessIcon } from "@/features/skills/skill-harness";
import { ApiClientError } from "@/lib/api-client";

export function HarnessChip({
  active,
  label,
  count,
  onClick,
  Icon,
  tone = "",
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
  Icon: HarnessIcon;
  tone?: string;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      variant={active ? "default" : "outline"}
      size="sm"
      className={`h-7 rounded-full gap-1.5 px-3 text-xs ${tone}`}
    >
      <Icon className="size-3.5" />
      <span className="font-medium">{label}</span>
      <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px]">
        {count}
      </Badge>
    </Button>
  );
}


export function SkillRow({
  skill,
  enabledHarnesses,
  toggling,
  onToggleHarness,
  onOpen,
  onDelete,
}: {
  skill: Skill;
  enabledHarnesses: Set<string>;
  toggling: Record<string, boolean>;
  onToggleHarness: (harness: HarnessKey, enabled: boolean) => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const sourceTag = sourceTypeLabel(skill.sourceType);
  return (
    <li className="group flex items-start gap-4 px-4 py-3 transition-colors hover:bg-muted/50">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={onOpen}
            className="h-auto truncate p-0 text-base font-semibold text-foreground hover:text-primary"
          >
            {skill.displayName || skill.name}
          </Button>
          {sourceTag && (
            <Badge
              variant="secondary"
              className="h-4 px-1.5 font-mono text-[10px]"
            >
              {sourceTag}
            </Badge>
          )}
          {skill.hasUpdateAvailable && (
            <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
              有更新
            </Badge>
          )}
        </div>
        {skill.description && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {skill.description}
          </p>
        )}
        {skill.latestVersion && (
          <p className="mt-0.5 text-[10px] text-muted-foreground/70">
            v{skill.latestVersion}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <div className="flex items-center gap-1">
          {HARNESS_LIST.map((h) => {
            const meta = HARNESS_META[h];
            const enabled = enabledHarnesses.has(h);
            const key = `${skill.id}:${h}`;
            const busy = Boolean(toggling[key]);
            const Icon = meta.Icon;
            return (
              <Tooltip key={h}>
                <TooltipTrigger asChild>
                  <Toggle
                    type="button"
                    pressed={enabled}
                    onPressedChange={() => onToggleHarness(h, !enabled)}
                    disabled={busy}
                    aria-label={`${meta.label}: ${enabled ? "已启用" : "未启用"}`}
                    className={`h-7 gap-1 rounded-md border px-2 ${enabled ? meta.enabledClass : "border-transparent"} ${meta.tone}`}
                  >
                    {busy ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Icon className="size-3.5" />
                    )}
                    <span className="text-[10px] font-medium">{meta.label}</span>
                  </Toggle>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {meta.label}
                  {enabled ? " 已启用" : " 未启用"}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={onOpen}
                aria-label="编辑"
              >
                <Pencil />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">编辑</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={onDelete}
                aria-label="删除"
                className="text-destructive hover:text-destructive"
              >
                <Trash2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">删除</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </li>
  );
}


export function sourceTypeLabel(type: Skill["sourceType"]): string | null {
  switch (type) {
    case "local":
      return "本地";
    case "github":
      return "github";
    case "skills_sh":
      return "skills.sh";
    case "zip_upload":
      return "zip_upload";
    default:
      return null;
  }
}

export function readableError(err: unknown): string {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return "未知错误";
}
