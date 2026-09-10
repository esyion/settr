import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Cloud, FolderTree, Users } from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { NavMain, type NavMainGroup } from "@/features/app/components/nav-main";

/** SidebarMenuButton 依赖 SidebarProvider（useSidebar + TooltipProvider）。 */
function renderNav(groups: NavMainGroup[], pathname: string) {
  return render(
    <SidebarProvider>
      <NavMain groups={groups} pathname={pathname} />
    </SidebarProvider>,
  );
}

describe("NavMain", () => {
  const groups: NavMainGroup[] = [
    {
      label: "工作区",
      items: [
        { href: "/overview", label: "概览", icon: Cloud },
        { href: "/devices", label: "设备", icon: Users },
      ],
    },
    {
      label: "组织空间",
      items: [
        { href: "/organization/teams", label: "团队与项目", icon: FolderTree },
      ],
    },
  ];

  it("renders every group label and item label", () => {
    renderNav(groups, "/");
    expect(screen.getByText("工作区")).toBeInTheDocument();
    expect(screen.getByText("组织空间")).toBeInTheDocument();
    expect(screen.getByText("概览")).toBeInTheDocument();
    expect(screen.getByText("设备")).toBeInTheDocument();
    expect(screen.getByText("团队与项目")).toBeInTheDocument();
  });

  it("marks the item whose href matches the current pathname as active", () => {
    renderNav(groups, "/devices");
    const devicesButton = screen.getByText("设备").closest("button, a");
    expect(devicesButton).toHaveAttribute("data-active", "true");
    const overviewButton = screen.getByText("概览").closest("button, a");
    expect(overviewButton).toHaveAttribute("data-active", "false");
  });

  it("marks an item active when pathname starts with the item href", () => {
    renderNav(groups, "/organization/teams/abc");
    const teamsButton = screen.getByText("团队与项目").closest("button, a");
    expect(teamsButton).toHaveAttribute("data-active", "true");
  });
});