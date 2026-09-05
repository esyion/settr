import { redirect } from "next/navigation";

/**
 * 应用根路径：未登录时会由 (app) 布局拦截到 /login；
 * 已登录用户直接落到概览页，保持 Tauri 启动后看到的第一屏是同步状态。
 */
export default function HomePage(): never {
  redirect("/overview");
}
