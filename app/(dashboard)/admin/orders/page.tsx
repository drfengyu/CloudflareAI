import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db/d1-http";
import { users } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireUser } from "@/lib/usage/meter";
import { redirect } from "next/navigation";
import { listAllOrders } from "@/lib/payment/order";
import { AdminOrdersTable, type AdminOrderRow } from "./orders-table";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const currentUserId = await requireUser();
  const params = await searchParams;

  // 检查权限
  const currentUser = await db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .limit(1);

  if (!currentUser[0] || currentUser[0].role < 10) {
    redirect("/dashboard");
  }

  // 状态筛选（0 待支付 / 1 确认中 / 2 已到账 / 3 已关闭 / 9 异常）
  const statusFilter = params.status !== undefined ? Number(params.status) : undefined;
  const validStatus = [0, 1, 2, 3, 9].includes(statusFilter ?? -1) ? statusFilter : undefined;

  const orders = await listAllOrders(validStatus, 200);

  // leftJoin 有 bug：改用两次查询手动映射用户邮箱
  const userIds = [...new Set(orders.map((o) => o.userId))];
  const userRows = userIds.length
    ? await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(inArray(users.id, userIds))
    : [];
  const emailMap = new Map(userRows.map((u) => [u.id, u.email]));

  const rows: AdminOrderRow[] = orders.map((o) => ({
    id: o.id,
    orderNo: o.orderNo,
    userEmail: emailMap.get(o.userId) ?? o.userId.slice(0, 8),
    amountCny: o.amountCny,
    credits: o.credits,
    status: o.status,
    channel: o.channel ?? null,
    tradeNo: o.tradeNo ?? null,
    paidAt: o.paidAt ? new Date(o.paidAt).toISOString() : null,
    createdAt: new Date(o.createdAt!).toISOString(),
  }));

  const statusTabs: { value?: number; label: string }[] = [
    { value: undefined, label: "全部" },
    { value: 0, label: "待支付" },
    { value: 2, label: "已到账" },
    { value: 3, label: "已关闭" },
    { value: 9, label: "异常" },
  ];

  return (
    <>
      <PageHeader title="订单管理" description="在线充值订单 · 对账与补发" />

      <div className="space-y-6 p-8">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">充值订单</CardTitle>
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              {statusTabs.map((tab) => (
                <a
                  key={tab.label}
                  href={tab.value === undefined ? "/admin/orders" : `/admin/orders?status=${tab.value}`}
                  className={
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
                    (statusFilter === tab.value
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {tab.label}
                </a>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <AdminOrdersTable orders={rows} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
