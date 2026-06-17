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
import { CheckinCalendarCard } from "./checkin-calendar-card";
import { formatCredits, creditsToUsd, getCreditsPerUsd } from "@/lib/billing/credits";
import { calculateDisplayBalance } from "@/lib/billing/display-balance";

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

  // 计算总余额：包含所有未过期的临时余额（不过滤小额）
  const allValidTempBalances = tempBalances.filter(
    (tb) => new Date(tb.expiresAt) > now
  );
  const temporaryTotal = allValidTempBalances.reduce((sum, tb) => sum + tb.amount, 0);

  // 计算显示用余额（负数补正）
  const displayBalance = calculateDisplayBalance(permanentBalance, temporaryTotal);

  // 临时余额明细显示逻辑：
  // 1. 如果永久余额为负，计算每条临时余额的"已用于补正"部分
  // 2. 只显示剩余可用额度 > 0 的临时余额
  let remainingDeficit = permanentBalance < 0 ? Math.abs(permanentBalance) : 0;
  const displayTempBalances = allValidTempBalances
    .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()) // 按过期时间排序
    .map((tb) => {
      if (remainingDeficit > 0) {
        // 这条临时余额需要用于补正
        const usedForCompensation = Math.min(tb.amount, remainingDeficit);
        remainingDeficit -= usedForCompensation;
        const availableAmount = tb.amount - usedForCompensation;
        return {
          ...tb,
          displayAmount: availableAmount,
          usedForCompensation,
        };
      }
      // 无需补正，全部可用
      return {
        ...tb,
        displayAmount: tb.amount,
        usedForCompensation: 0,
      };
    })
    .filter((tb) => tb.displayAmount >= 0.01); // 只显示剩余 >= 0.01 的

  const totalBalance = permanentBalance + temporaryTotal;
  const ratio = await getCreditsPerUsd();
  const balanceUsd = creditsToUsd(totalBalance, ratio).toFixed(2);

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
        {/* 签到日历 */}
        <CheckinCalendarCard />

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
                  <span>永久: {formatCredits(displayBalance.displayPermanent)} cr</span>
                  {(temporaryTotal > 0 || permanentBalance < 0) && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      临时: {formatCredits(displayBalance.displayTemporary)} cr
                    </span>
                  )}
                  {permanentBalance < 0 && temporaryTotal > 0 && (
                    <span className="text-amber-600 dark:text-amber-400">
                      (已用临时余额补正)
                    </span>
                  )}
                </div>
              </div>
            </div>
            <RedeemCodeDialog />
          </CardContent>
        </Card>

        {/* 临时余额明细 */}
        {displayTempBalances.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">临时余额明细</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {displayTempBalances.map((tb) => (
                  <div
                    key={tb.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-surface p-3"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {formatCredits(tb.displayAmount)} credits
                        {tb.usedForCompensation > 0 && (
                          <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                            ({formatCredits(tb.usedForCompensation)} 已用于补正)
                          </span>
                        )}
                      </p>
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
                        {record.type === 1
                          ? "兑换码充值"
                          : record.type === 2
                            ? "管理员充值"
                            : record.type === 3
                              ? "签到奖励"
                              : "其他充值"}
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
                        ≈ ${creditsToUsd(record.amount, ratio).toFixed(2)}
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
