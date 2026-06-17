import { Sidebar } from "@/components/dashboard/sidebar";
import { AppHeader } from "@/components/dashboard/app-header";
import { auth, signOut } from "@/auth";
import { db } from "@/lib/db/d1-http";
import { users, options } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  // Fetch user role to filter sidebar nav
  let userRole = 1;
  if (session?.user?.id) {
    const userRows = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);
    userRole = userRows[0]?.role ?? 1;
  }

  // Site name from options (admin-configurable), fall back to brand default
  const siteRows = await db
    .select({ value: options.value })
    .from(options)
    .where(eq(options.key, "siteName"))
    .limit(1);
  const siteName = siteRows[0]?.value?.trim() || "Cloudflare AI";

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar userRole={userRole} siteName={siteName} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader user={session?.user} signOutAction={signOutAction} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
