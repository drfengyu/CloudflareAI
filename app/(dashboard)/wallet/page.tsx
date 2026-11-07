import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/usage/meter";
import { db } from "@/lib/db/d1-http";
import { users, temporaryBalances, paymentOrders } from "@/lib/db/schema";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { Wallet, Clock } from "lucide-react";
import { RedeemCodeDialog } from "./redeem-code-dialog";
import { CheckinCalendarCard } from "./checkin-calendar-card";
import { RechargeOrdersCard } from "./recharge-orders-card";
import { TempBalancesCard, type SerializedTempBalance } from "./temp-balances-card";
import { RecentLedgerCard } from "./recent-ledger-card";
import { formatCredits } from "@/lib/billing/credits";
import { calculateDisplayBalance } from "@/lib/billing/display-balance";
import {
  ledgerNet,
  ledgerSettlement,
  listLedgerDays,
  listRecentLedgerEntries,
  recentWindow,
  sumLedgerDays,
} from "@/lib/billing/ledger";
import { getRechargeBonusSettings } from "@/lib/payment/bonus";
import { getLinuxdoConfig } from "@/lib/payment/linuxdo";
import { serializePayOrder } from "@/lib/payment/pay-order-view";
import { formatCnDate } from "@/lib/date";
import { PageBody, PageSection } from "@/components/dashboard/section";

export const dynamic = "force-dynamic";

/** 未到账订单是钱包唯一留下的订单视图，条数上限按这个兜住。 */
const PENDING_ORDER_LIMIT = 20;

/** 钱包只展示最近几笔收支，完整账目在 /ledger。 */
const RECENT_LEDGER_LIMIT = 8;

export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string; orderNo?: string }>;
}) {
  const userId = await requireUser();
  const params = await searchParams;
  const now = new Date();

  // 2026-10-17 性能：这些查询互不依赖（全都只按 userId 取数），原先是一条接一条 await，
  // 串行 5 次 D1 往返 ≈ 2 秒；并发成一波后只剩最慢那条的时间。
  const [userRows, tempBalances, pendingOrders, linuxdoConfig, bonusConfig, recentLedger, ledgerDays] =
    await Promise.all([
      // 永久余额与角色（角色决定充值弹窗里能不能看到易支付）
      db
        .select({ balanceCredits: users.balanceCredits, role: users.role })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1),
      // 获取未过期的临时余额（过期判定下沉到 SQL，不再把已失效的行读进内存）
      db
        .select()
        .from(temporaryBalances)
        .where(and(eq(temporaryBalances.userId, userId), gt(temporaryBalances.expiresAt, now)))
        .orderBy(temporaryBalances.expiresAt),
      // 只留未到账的订单：这是用户唯一能自查、手动「查询」催单的地方，裁剪会把它们抹掉。
      // 已到账与已关闭的历史不在钱包铺开——到账那一笔在个人账本按天汇总里看得到。
      db
        .select()
        .from(paymentOrders)
        .where(and(eq(paymentOrders.userId, userId), inArray(paymentOrders.status, [0, 1])))
        .orderBy(desc(paymentOrders.createdAt))
        .limit(PENDING_ORDER_LIMIT),
      getLinuxdoConfig(),
      // 充值阶梯赠送：只在充值弹窗里预告「本单额外赠送」，实际发放由订单结算路径负责
      getRechargeBonusSettings(),
      // 最近几笔收支：与个人账本同一份口径（发放 + API 消费），只扫最近 90 天
      listRecentLedgerEntries(userId, RECENT_LEDGER_LIMIT, recentWindow()),
      // 与账本页同一把尺子的全量天表：钱包要拿累计净收支和余额对账
      listLedgerDays(userId),
    ]);

  const permanentBalance = userRows[0]?.balanceCredits || 0;

  // 计算总余额：包含所有未过期的临时余额（不过滤小额）
  // JS 侧再判一次是兜底：异常值在 SQL 里可能被宽松比较放行，宁可少显示也不虚增余额。
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
  const displayTempBalances: Array<
    (typeof allValidTempBalances)[number] & {
      displayAmount: number;
      usedForCompensation: number;
    }
  > = [];
  for (const tb of allValidTempBalances.sort(
    (a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime(), // 按过期时间排序
  )) {
    // 永久余额为负时，靠前的临时余额先用于补正
    const usedForCompensation =
      remainingDeficit > 0 ? Math.min(tb.amount, remainingDeficit) : 0;
    remainingDeficit -= usedForCompensation;
    const displayAmount = tb.amount - usedForCompensation;
    if (displayAmount >= 0.01) {
      displayTempBalances.push({ ...tb, displayAmount, usedForCompensation });
    }
  }

  const totalBalance = permanentBalance + temporaryTotal;
  const compensated = Math.min(Math.max(0, -permanentBalance), temporaryTotal);
  const earliestExpiry = displayTempBalances[0]
    ? formatCnDate(displayTempBalances[0].expiresAt)
    : null;

  const serializedTempBalances: SerializedTempBalance[] = displayTempBalances.map((tb) => ({
    id: tb.id,
    displayAmount: tb.displayAmount,
    usedForCompensation: tb.usedForCompensation,
    description: tb.description ?? null,
    expiresAtLabel: formatCnDate(tb.expiresAt),
  }));

  const serializedOrders = pendingOrders.map(serializePayOrder);
  const recentTotals = sumLedgerDays(recentLedger);
  const ledgerTotals = sumLedgerDays(ledgerDays);
  const settlement = ledgerSettlement(totalBalance, ledgerTotals);

  const justReturned = params.paid === "1";
  const highlightOrderNo = params.orderNo ?? undefined;

  return (
    <>
      <PageHeader
        title="我的钱包"
        description="余额、充值与最近收支"
      />

      <PageBody className="pt-2">
        <PageSection title="余额与签到" subtitle="永久与临时余额构成，签到和兑换码发放的额度" className="border-t-0 pt-0">
          {/* 余额卡片 */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Wallet className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">总余额</p>
                    <p className="text-2xl font-semibold tabular-nums">
                      {formatCredits(totalBalance)} credits
                    </p>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <p className="flex flex-wrap items-center gap-x-2">
                        <span className="font-medium text-foreground tabular-nums">
                          永久 {formatCredits(displayBalance.displayPermanent)} cr
                        </span>
                        <span>充值到账与管理员调整，不过期</span>
                      </p>
                      {(temporaryTotal > 0 || permanentBalance < 0) && (
                        <p className="flex flex-wrap items-center gap-x-2">
                          <span className="flex items-center gap-1 font-medium text-foreground tabular-nums">
                            <Clock className="h-3 w-3" />
                            临时 {formatCredits(displayBalance.displayTemporary)} cr
                          </span>
                          <span>
                            {earliestExpiry
                              ? `签到、赠送与返利，最早 ${earliestExpiry} 到期`
                              : "签到、赠送与返利，到期作废"}
                          </span>
                        </p>
                      )}
                      {compensated > 0 && (
                        <p className="text-amber-600 dark:text-amber-400">
                          永久余额实为 −{formatCredits(Math.abs(permanentBalance))} cr，已用{" "}
                          {formatCredits(compensated)} cr 临时余额抵扣；上方两项是抵扣后的可用额度
                        </p>
                      )}
                      <p>总余额 = 永久 + 未过期临时；消费先扣临时、再扣永久</p>
                    </div>
                  </div>
                </div>
                <RedeemCodeDialog
                  canUseEpay={(userRows[0]?.role ?? 0) >= 10}
                  linuxdoEnabled={linuxdoConfig.enabled}
                  linuxdoMin={linuxdoConfig.minCny}
                  linuxdoMax={linuxdoConfig.maxCny}
                  bonusTiers={bonusConfig.enabled ? bonusConfig.tiers : []}
                  bonusValidDays={bonusConfig.validDays}
                />
              </div>

              <div className="mt-4 space-y-1 rounded-lg border border-border bg-background/60 p-3 text-xs text-muted-foreground tabular-nums">
                <p className="flex flex-wrap items-center gap-x-3">
                  <span className="font-medium text-foreground">当前余额结算</span>
                  <span className="text-success">
                    有效入账 +{formatCredits(settlement.effectiveIncome)}
                  </span>
                  <span className="text-destructive">
                    累计支出 −{formatCredits(settlement.expense)}
                  </span>
                  <span className="font-medium text-foreground">
                    = {formatCredits(settlement.balance)} cr
                  </span>
                </p>
                <p>
                  {settlement.expired >= 0.01
                    ? "已剔除过期作废的临时余额（发放记了收入、到期没有流水）；完整流水见个人账本。"
                    : "按账本流水结算，与当前余额一致；完整流水见个人账本。"}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 签到日历 */}
          <CheckinCalendarCard />
        </PageSection>

        <PageSection title="收支与临时余额" subtitle="最近几笔收支变动、未到账订单与临时余额有效期">
          <div className="space-y-6">
            <RecentLedgerCard
              entries={recentLedger}
              totals={recentTotals}
              net={ledgerNet(recentTotals)}
              limit={RECENT_LEDGER_LIMIT}
            />

            {/* 未到账订单（回跳确认 + 轮询催单） */}
            <RechargeOrdersCard
              orders={serializedOrders}
              highlightOrderNo={highlightOrderNo}
              justReturned={justReturned}
            />

            {/* 临时余额明细（卡片内本地分页） */}
            <TempBalancesCard balances={serializedTempBalances} />
          </div>
        </PageSection>
      </PageBody>
    </>
  );
}
