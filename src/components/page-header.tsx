import type { ReactNode } from "react";

/**
 * 工作区页面通用页头：在 (app) 路由组的各页面复用，统一样式与文案层级。
 * <p>
 * 顶部展示小标签 (eyebrow)、主标题和可选的描述文案；右侧通过 actions 插槽承载按钮组。
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <p className="text-sm font-medium text-primary">{eyebrow}</p>
        )}
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
