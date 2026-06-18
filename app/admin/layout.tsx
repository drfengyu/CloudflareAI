/**
 * Admin 后台独立布局（全宽，无 sidebar）
 * 路由组：所有 /admin/* 页面走此布局。
 */
import { auth, signOut } from "@/auth";
import { db } from "@/lib/db/d1-http";
import { users, options } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  let userRole = 1;
  let siteName = "Cloudflare AI";
  if (session?.user?.id) {
    const [userRow] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);
    userRole = userRow?.role ?? 1;
  }
  const [siteRow] = await db
    .select({ value: options.value })
    .from(options)
    .where(eq(options.key, "siteName"))
    .limit(1);
  if (siteRow?.value?.trim()) siteName = siteRow.value.trim();

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Minimal admin header — back to dashboard link */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b bg-card px-6">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="text-sm font-semibold hover:opacity-70">
            {siteName}
          </a>
          <span className="text-xs text-muted-foreground">/ 管理后台</span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/dashboard"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            返回主控台
          </a>
          <form action={signOutAction}>
            <button
              type="submit"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              退出登录
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto bg-background">{children}</main>
    </div>
  );
}
