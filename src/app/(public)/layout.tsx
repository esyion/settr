/**
 * 公开路由组根布局：无侧边栏、居中容器，
 * 用于接受邀请等无需登录的页面。
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      {children}
    </main>
  );
}