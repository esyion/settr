"use client";

import { AlertCircle, Building2, ScrollText, ShieldCheck, Users2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOrganizationData } from "@/features/organization/hooks/use-organization-data";
import { OrganizationTreePanel } from "@/features/organization/components/organization-tree-panel";
import { MembersPanel } from "@/features/organization/components/members-panel";
import { PolicyPanel } from "@/features/organization/components/policy-panel";
import { RolesPanel } from "@/features/organization/components/roles-panel";

/**
 * 组织管理页：组织 / 团队 / 项目 / 成员 / 规范 / 角色 六大子面板的统一入口。
 * <p>
 * 使用 shadcn Tabs 拆分功能区；数据全部走 useOrganizationData，避免跨面板状态分散。
 */
export function OrganizationManagement() {
  const data = useOrganizationData();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="工作区"
        title="组织与项目"
        description="管理组织、团队、项目、成员、规范与角色分配。"
      />
      {data.error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>操作失败</AlertTitle>
          <AlertDescription>{data.error}</AlertDescription>
        </Alert>
      )}
      <Tabs defaultValue="structure">
        <TabsList>
          <TabsTrigger value="structure">
            <Building2 className="size-4" />
            组织结构
          </TabsTrigger>
          <TabsTrigger value="members">
            <Users2 className="size-4" />
            成员
          </TabsTrigger>
          <TabsTrigger value="policy">
            <ScrollText className="size-4" />
            规范
          </TabsTrigger>
          <TabsTrigger value="roles">
            <ShieldCheck className="size-4" />
            角色
          </TabsTrigger>
        </TabsList>
        <TabsContent value="structure" className="mt-6">
          <OrganizationTreePanel data={data} />
        </TabsContent>
        <TabsContent value="members" className="mt-6">
          <MembersPanel data={data} />
        </TabsContent>
        <TabsContent value="policy" className="mt-6">
          <PolicyPanel data={data} />
        </TabsContent>
        <TabsContent value="roles" className="mt-6">
          <RolesPanel data={data} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
