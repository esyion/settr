/**
 * 工作区上下文模块的桶式导出。
 */
export { ContextSwitcher } from "./components/context-switcher";
export {
  useWorkspaceContextValue,
  WorkspaceContext,
} from "./workspace-context";
export {
  useWorkspaceContext,
  type WorkspaceContextApi,
} from "./hooks/use-workspace-context";
export { useWorkspaceStore, type WorkspaceScope } from "./store";