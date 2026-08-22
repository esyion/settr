import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Agents Plus", description: "跨设备同步和管理 ~/.agents/AGENTS.md" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-CN"><body>{children}</body></html>; }
