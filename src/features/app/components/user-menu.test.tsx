import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidebarProvider } from "@/components/ui/sidebar";
import { UserMenu } from "@/features/app/components/user-menu";
import type { DeviceIdentity } from "@/lib/contracts";

const identity: DeviceIdentity = {
  deviceId: "d1",
  deviceName: "QING",
  platform: "windows",
  appVersion: "0.1.0",
};

const renderInSidebar = (ui: React.ReactNode) =>
  render(<SidebarProvider>{ui}</SidebarProvider>);

describe("UserMenu", () => {
  it("renders trigger with email and device name as subtitle", () => {
    renderInSidebar(
      <UserMenu
        user={{ email: "qingbo.my@gmail.com", name: null, avatar: null }}
        identity={identity}
        onLogout={vi.fn()}
        busy={false}
      />,
    );
    expect(screen.getByText("qingbo.my")).toBeInTheDocument();
    expect(screen.getByText("QING")).toBeInTheDocument();
  });

  it("falls back subtitle to '未识别设备' when identity is null", () => {
    renderInSidebar(
      <UserMenu
        user={{ email: "qingbo.my@gmail.com", name: null, avatar: null }}
        identity={null}
        onLogout={vi.fn()}
        busy={false}
      />,
    );
    expect(screen.getByText("未识别设备")).toBeInTheDocument();
  });

  it("uses user.name when provided, otherwise email local part", () => {
    renderInSidebar(
      <UserMenu
        user={{ email: "qingbo.my@gmail.com", name: "Qingbo", avatar: null }}
        identity={identity}
        onLogout={vi.fn()}
        busy={false}
      />,
    );
    expect(screen.getByText("Qingbo")).toBeInTheDocument();
  });

  it("renders device info as disabled entry with 'platform · vX.X.X' format", async () => {
    const user = userEvent.setup();
    renderInSidebar(
      <UserMenu
        user={{ email: "qingbo.my@gmail.com", name: null, avatar: null }}
        identity={identity}
        onLogout={vi.fn()}
        busy={false}
      />,
    );
    await user.click(screen.getByText("qingbo.my"));
    const deviceEntry = screen.getByText("windows · v0.1.0");
    expect(deviceEntry).toBeInTheDocument();
    const item = deviceEntry.closest('[role="menuitem"], [aria-disabled]');
    expect(item).toHaveAttribute("aria-disabled", "true");
  });

  it("calls onLogout when logout button clicked", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    renderInSidebar(
      <UserMenu
        user={{ email: "qingbo.my@gmail.com", name: null, avatar: null }}
        identity={identity}
        onLogout={onLogout}
        busy={false}
      />,
    );
    await user.click(screen.getByText("qingbo.my"));
    await user.click(screen.getByText("退出登录"));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("disables logout button when busy is true", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    renderInSidebar(
      <UserMenu
        user={{ email: "qingbo.my@gmail.com", name: null, avatar: null }}
        identity={identity}
        onLogout={onLogout}
        busy={true}
      />,
    );
    await user.click(screen.getByText("qingbo.my"));
    const logoutItem = screen
      .getByText("退出登录")
      .closest('[role="menuitem"]');
    expect(logoutItem).toHaveAttribute("aria-disabled", "true");
  });
});
