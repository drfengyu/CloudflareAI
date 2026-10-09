import { Sidebar } from "@/components/dashboard/sidebar";
import { AppHeader } from "@/components/dashboard/app-header";
import { auth, signOut } from "@/auth";
import { db } from "@/lib/db/d1-http";
import { options } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";

/** 站点名缓存 1 小时，避免每次导航都查 option 表。 */
const getCachedSiteName = unstable_cache(
  async () => {
    const siteRows = await db
      .select({ value: options.value })
      .from(options)
      .where(eq(options.key, "siteName"))
      .limit(1);
    return siteRows[0]?.value?.trim() || "Cloudflare AI";
  },
  ["site-name"],
  { revalidate: 3600 },
);

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  // role 已存在 JWT 中（auth.ts 的 jwt callback 首次登录时写入），直接从 session 读取，
  // 避免每次导航都查用户表。旧 token 可能没有 role，回退到 1（普通用户）。
  const userRole = session?.user?.role ?? 1;

  const siteName = await getCachedSiteName();

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar userRole={userRole} siteName={siteName} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          user={session?.user}
          signOutAction={signOutAction}
          userRole={userRole}
          siteName={siteName}
        />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
