import type { Metadata } from "next";
import "@git-diff-view/react/styles/diff-view-pure.css";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "./providers";
import { DeepLinkRouter } from "@/features/app/components/deep-link-router";
export const metadata: Metadata = {
  title: "Agents Plus",
  description: "跨设备同步和管理 AGENTS.md 与 CLAUDE.md",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <Providers>
          <DeepLinkRouter />
          {children}
        </Providers>
        <Toaster />
      </body>
    </html>
  );
}
