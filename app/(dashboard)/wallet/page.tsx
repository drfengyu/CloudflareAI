import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/usage/meter";
import { db } from "@/lib/db/d1-http";
import { users, topups, temporaryBalances } from "@/lib/db/schema";
import { desc, eq, gt, sum } from "drizzle-orm";
import { Wallet, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { RedeemCodeDialog } from "./redeem-code-dialog";
import { formatCredits } from "@/lib/billing/credits";

export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const userId = await requireUser();

  // 获取用户永久余额
  const userRows = await db
    .select({ balanceCredits: users.balanceCredits })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const permanentBalance = userRows[0]?.balanceCredits || 0;

  // 获取未过期的临时余额
  const now = new Date();
  const tempBalances = await db
    .select()
    .from(temporaryBalances)
    .where(eq(temporaryBalances.userId, userId))
    .orderBy(temporaryBalances.expiresAt);

  // 过滤未过期的
  const validTempBalances = tempBalances.filter(
    (tb) => new Date(tb.expiresAt) > now
  );
  const temporaryTotal = validTempBalances.reduce((sum, tb) => sum + tb.amount, 0);

  const totalBalance = permanentBalance + temporaryTotal;
  const balanceUsd = totalBalance.toFixed(2);

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
                <p className="text-sm text-muted-foreground">总余额</p>
                <p className="text-2xl font-semibold">{formatCredits(totalBalance)} credits</p>
                <p className="text-xs text-muted-foreground">≈ ${balanceUsd} USD</p>
                <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                  <span>永久: {formatCredits(permanentBalance)} cr</span>
                  {temporaryTotal > 0 && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      临时: {formatCredits(temporaryTotal)} cr
                    </span>
                  )}
                </div>
              </div>
            </div>
            <RedeemCodeDialog />
          </CardContent>
        </Card>

        {/* 临时余额明细 */}
        {validTempBalances.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">临时余额明细</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {validTempBalances.map((tb) => (
                  <div
                    key={tb.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-surface p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{formatCredits(tb.amount)} credits</p>
                      <p className="text-xs text-muted-foreground">{tb.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">
                        过期时间
                      </p>
                      <p className="text-sm">
                        {new Date(tb.expiresAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

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
                        +{formatCredits(record.amount)} cr
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ≈ ${record.amount.toFixed(2)}
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
