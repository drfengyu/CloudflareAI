import { AppHeader } from "@/components/dashboard/app-header";
import { ModuleNav } from "@/components/dashboard/module-nav";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { auth, signOut } from "@/auth";
import { db } from "@/lib/db/d1-http";
import { options } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import {
  countUnread,
  listRecentMessages,
  type MessagePreview,
} from "@/lib/message/messages";

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
  const userId = session?.user?.id;
  // 铃铛要的是「几封没读 + 最近几封」，两条都是走索引的小查询，并发发出去，不串行等。
  const [unreadCount, recentMessages] = userId
    ? await Promise.all([
        countUnread(userId).catch(() => 0),
        listRecentMessages(userId, 5).catch(() => []),
      ])
    : [0, [] as MessagePreview[]];

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <AppHeader
        user={session?.user}
        signOutAction={signOutAction}
        siteName={siteName}
        unreadCount={unreadCount}
        recentMessages={recentMessages}
      />
      {/* 桌面端顶部模块导航取代了原来的左侧栏 */}
      <ModuleNav userRole={userRole} />
      {/* 窄屏下底部标签栏会盖住内容，给 main 留出它的高度 */}
      <main className="flex-1 overflow-y-auto pb-14 md:pb-0">{children}</main>
      <MobileNav userRole={userRole} siteName={siteName} />
    </div>
  );
}
