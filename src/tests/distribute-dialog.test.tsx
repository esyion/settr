import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DistributeDialog } from "./distribute-dialog";

const teams = [{ id: "100", name: "平台组" }];
const members = [{ id: "5", label: "张三" }];

/**
 * 渲染打开状态的分发对话框,返回 onSubmit spy。
 */
function renderDialog(onSubmit = vi.fn()) {
  render(
    <DistributeDialog
      open
      title="分发测试"
      busy={false}
      teams={teams}
      members={members}
      onSubmit={onSubmit}
      onOpenChange={() => {}}
    />,
  );
  return onSubmit;
}

describe("DistributeDialog", () => {
  it("ORGANIZATION scope 直接提交,不带目标字段", () => {
    const onSubmit = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "分发" }));
    expect(onSubmit).toHaveBeenCalledWith({ scopeType: "ORGANIZATION" });
  });

  it("TEAM scope 携带所选 teamId", () => {
    const onSubmit = renderDialog();
    fireEvent.change(screen.getByLabelText("分发范围"), { target: { value: "TEAM" } });
    fireEvent.change(screen.getByLabelText("目标团队"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "分发" }));
    expect(onSubmit).toHaveBeenCalledWith({ scopeType: "TEAM", teamId: "100" });
  });

  it("MEMBER scope 携带所选 memberId", () => {
    const onSubmit = renderDialog();
    fireEvent.change(screen.getByLabelText("分发范围"), { target: { value: "MEMBER" } });
    fireEvent.change(screen.getByLabelText("目标成员"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "分发" }));
    expect(onSubmit).toHaveBeenCalledWith({ scopeType: "MEMBER", memberId: "5" });
  });

  it("TEAM scope 未选目标时提交禁用", () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText("分发范围"), { target: { value: "TEAM" } });
    const submit = screen.getByRole("button", { name: "分发" });
    expect(submit).toHaveProperty("disabled", true);
  });

  it("busy 时提交禁用", () => {
    render(
      <DistributeDialog
        open
        title="分发测试"
        busy
        teams={teams}
        members={members}
        onSubmit={vi.fn()}
        onOpenChange={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "分发" })).toHaveProperty("disabled", true);
  });
});
