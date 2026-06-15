import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/usage/meter";
import { db } from "@/lib/db/d1-http";
import { users, topups } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { Wallet, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const userId = await requireUser();

  // 获取用户余额
  const userRows = await db
    .select({ balanceCredits: users.balanceCredits })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const balance = userRows[0]?.balanceCredits || 0;
  const balanceUsd = (balance / 500000).toFixed(2);

  // 获取充值流水
  const topupRecords = await db
    .select()
    .from(topups)
    .where(eq(topups.userId, userId))
    .orderBy(desc(topups.createdAt))
    .limit(20);

  return (
    <>
      <PageHeader
        title="我的钱包"
        description="余额、充值、流水记录"
      />

      <div className="space-y-6 p-8">
        {/* 余额卡片 */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-center justify-between pt-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white">
                <Wallet className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">当前余额</p>
                <p className="text-2xl font-semibold">{balance.toLocaleString()} credits</p>
                <p className="text-xs text-muted-foreground">≈ ${balanceUsd} USD</p>
              </div>
            </div>
            <Button>
              <Plus className="h-4 w-4" />
              充值
            </Button>
          </CardContent>
        </Card>

        {/* 充值流水 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">充值记录</CardTitle>
          </CardHeader>
          <CardContent>
            {topupRecords.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无充值记录</p>
            ) : (
              <div className="space-y-2">
                {topupRecords.map((record) => (
                  <div
                    key={record.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-surface p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {record.type === 1 ? "兑换码充值" : record.type === 2 ? "管理员充值" : "其他充值"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(record.createdAt!), {
                          addSuffix: true,
                          locale: zhCN,
                        })}
                      </p>
                      {record.description && (
                        <p className="text-xs text-muted-foreground">{record.description}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-success">
                        +{record.amount.toLocaleString()} cr
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ≈ ${(record.amount / 500000).toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
