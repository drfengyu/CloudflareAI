import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/db/d1-http";
import { redemptions, users } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/usage/meter";
import { redirect } from "next/navigation";
import { RedemptionsTable } from "./redemptions-table";
import { GenerateCodesDialog } from "./generate-codes-dialog";
import { getCreditsPerUsd } from "@/lib/billing/credits";

export const dynamic = "force-dynamic";

export default async function AdminRedemptionsPage() {
  const currentUserId = await requireUser();

  // 检查权限
  const currentUser = await db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .limit(1);

  if (!currentUser[0] || currentUser[0].role < 10) {
    redirect("/dashboard");
  }

  // 获取所有兑换码
  const codes = await db
    .select()
    .from(redemptions)
    .orderBy(desc(redemptions.createdAt));

  // 获取所有使用者 ID
  const usedUserIds = codes
    .map((c) => c.usedUserId)
    .filter((id): id is string => id !== null);

  // 批量查询使用者信息
  const usedUsersMap = new Map<string, typeof users.$inferSelect>();
  if (usedUserIds.length > 0) {
    const usedUsers = await db
      .select()
      .from(users)
      .where(eq(users.id, usedUserIds[0])); // 先查第一个
    usedUsers.forEach((u) => usedUsersMap.set(u.id, u));

    // 查询剩余的（如果有多个不同用户）
    for (const userId of usedUserIds.slice(1)) {
      if (!usedUsersMap.has(userId)) {
        const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (u[0]) usedUsersMap.set(u[0].id, u[0]);
      }
    }
  }

  const data = codes.map((c) => {
    const usedUser = c.usedUserId ? usedUsersMap.get(c.usedUserId) : null;

    return {
      id: c.id,
      code: c.code,
      creditsAmount: c.quota,
      status: c.usedCount >= (c.maxUses || Infinity) ? 2 : c.expiresAt && new Date(c.expiresAt) < new Date() ? 3 : 1,
      usedBy: usedUser?.email || null,
      usedAt: c.redeemedAt ? new Date(c.redeemedAt) : null,
      createdAt: new Date(c.createdAt!),
    };
  });

  const ratio = await getCreditsPerUsd();

  return (
    <>
      <PageHeader
        title="兑换码管理"
        description="生成、查看、管理充值兑换码"
        action={<GenerateCodesDialog ratio={ratio} />}
      />
      <div className="space-y-4 p-8">
        <Card>
          <CardContent className="pt-5">
            <RedemptionsTable data={data} ratio={ratio} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
