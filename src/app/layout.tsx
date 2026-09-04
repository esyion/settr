import type { Metadata } from "next";
import "@git-diff-view/react/styles/diff-view-pure.css";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
export const metadata: Metadata = {
  title: "Agents Plus",
  description: "跨设备同步和管理 AGENTS.md 与 CLAUDE.md",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
