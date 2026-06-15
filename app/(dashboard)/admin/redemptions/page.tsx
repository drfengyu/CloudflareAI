import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/db/d1-http";
import { redemptions, users } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/usage/meter";
import { redirect } from "next/navigation";
import { RedemptionsTable } from "./redemptions-table";
import { GenerateCodesDialog } from "./generate-codes-dialog";

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

  const data = codes.map((c) => ({
    id: c.id,
    code: c.code,
    creditsAmount: c.quota,
    status: c.usedCount >= (c.maxUses || Infinity) ? 2 : c.expiresAt && new Date(c.expiresAt) < new Date() ? 3 : 1,
    usedBy: null, // redemption 表没有 usedBy 字段，需要关联 topup 表查询
    usedAt: null,
    createdAt: new Date(c.createdAt!),
  }));

  return (
    <>
      <PageHeader
        title="兑换码管理"
        description="生成、查看、管理充值兑换码"
        action={<GenerateCodesDialog />}
      />
      <div className="space-y-4 p-8">
        <Card>
          <CardContent className="pt-5">
            <RedemptionsTable data={data} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
