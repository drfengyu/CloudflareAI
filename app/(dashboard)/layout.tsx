import { Sidebar } from "@/components/dashboard/sidebar";
import { auth, signOut } from "@/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={session?.user} signOutAction={signOutAction} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
