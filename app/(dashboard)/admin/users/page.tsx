import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/db/d1-http";
import { users } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireUser, getUserTotalBalance } from "@/lib/usage/meter";
import { redirect } from "next/navigation";
import { UsersTable } from "./users-table";
import { getCreditsPerUsd } from "@/lib/billing/credits";

export const dynamic = "force-dynamic";

const roleLabels: Record<number, { label: string; tone: "success" | "muted" | "warning" }> = {
  1: { label: "普通用户", tone: "success" },
  10: { label: "管理员", tone: "muted" },
  100: { label: "超级管理员", tone: "warning" },
};

export default async function AdminUsersPage() {
  const currentUserId = await requireUser();

  // 检查当前用户权限
  const currentUser = await db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .limit(1);

  if (!currentUser[0] || currentUser[0].role < 10) {
    redirect("/dashboard");
  }

  // 获取所有用户
  const allUsers = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      balanceCredits: users.balanceCredits,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  // 获取每个用户的真实总余额（永久 + 临时）
  const usersWithBalance = await Promise.all(
    allUsers.map(async (u) => {
      const balance = await getUserTotalBalance(u.id);
      return {
        ...u,
        totalBalance: balance.total,
        permanentBalance: balance.permanent,
        temporaryBalance: balance.temporary,
        roleLabel: roleLabels[u.role || 1] || roleLabels[1],
      };
    })
  );

  const data = usersWithBalance;
  const ratio = await getCreditsPerUsd();

  return (
    <>
      <PageHeader
        title="用户管理"
        description="管理用户角色、余额、状态"
      />
      <div className="space-y-4 p-8">
        <Card>
          <CardContent className="pt-5">
            <UsersTable data={data} currentUserId={currentUserId} ratio={ratio} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
