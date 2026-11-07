import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  listRecentLedgerByDay,
  sumExpiredExpense,
  sumLedgerDays,
} from "@/lib/billing/ledger";
import { getRechargeBonusSettings } from "@/lib/payment/bonus";
import { getEpayConfig } from "@/lib/payment/epay";
import { getLinuxdoConfig } from "@/lib/payment/linuxdo";
import { serializePayOrder } from "@/lib/payment/pay-order-view";
import { formatCnDate } from "@/lib/date";
import { listActivityCoupons } from "@/lib/activity/coupons";
import { CouponShop } from "@/components/activity/coupon-shop";
import { PageBody, PageSection } from "@/components/dashboard/section";

export const dynamic = "force-dynamic";

/** 未到账订单是钱包唯一留下的订单视图，条数上限按这个兜住。 */
const PENDING_ORDER_LIMIT = 20;

export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string; orderNo?: string; recharge?: string }>;
}) {
  const userId = await requireUser();
  const params = await searchParams;
  const now = new Date();

  // 2026-10-17 性能：这些查询互不依赖（全都只按 userId 取数），原先是一条接一条 await，
  // 串行 5 次 D1 往返 ≈ 2 秒；并发成一波后只剩最慢那条的时间。
  const [userRows, tempBalances, pendingOrders, epayConfig, linuxdoConfig, bonusConfig, recentLedger, ledgerDays, expiredExpense, coupons] =
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
      getEpayConfig(),
      getLinuxdoConfig(),
      // 充值阶梯赠送：活动期内累计充值达标后在「限时返利」页手动领取
      getRechargeBonusSettings(),
      // 最近收支：近 5 天全部记录，与个人账本同一份口径（发放 + API 消费）
      listRecentLedgerByDay(userId),
      // 与账本页同一把尺子的全量天表：钱包要拿累计净收支和余额对账
      listLedgerDays(userId),
      // 过期作废的真实流水：钱包把发放和作废两头一起从展示里剔除
      sumExpiredExpense(userId),
      // 当期三种活动券余额与珍宝礼包：充值位同时是券礼包入口
      listActivityCoupons(userId),
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
  const ledgerTotals = sumLedgerDays(ledgerDays);
  const settlement = ledgerSettlement(totalBalance, ledgerTotals, expiredExpense);

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
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Wallet className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">总余额</p>
                    <p className="text-2xl font-semibold tabular-nums">
                      {formatCredits(totalBalance)} credits
                    </p>
                  </div>
                </div>
                <RedeemCodeDialog
                  defaultOpen={params.recharge === "1"}
                  canUseEpay={(userRows[0]?.role ?? 0) >= 10}
                  epayRate={epayConfig.rate}
                  epayMin={epayConfig.minCny}
                  epayMax={epayConfig.maxCny}
                  linuxdoEnabled={linuxdoConfig.enabled}
                  linuxdoRate={linuxdoConfig.rate}
                  linuxdoMin={linuxdoConfig.minCny}
                  linuxdoMax={linuxdoConfig.maxCny}
                  bonusTiers={bonusConfig.enabled ? bonusConfig.tiers : []}
                  bonusValidDays={bonusConfig.validDays}
                />
              </div>

              <div className="mt-4 space-y-1 rounded-lg border border-primary/20 bg-background/70 p-3 text-xs text-muted-foreground tabular-nums">
                <p className="flex flex-wrap items-center gap-x-3">
                  <span className="font-medium text-foreground">余额结算（不含过期作废）</span>
                  <span className="text-success">
                    有效入账 +{formatCredits(settlement.effectiveIncome)}
                  </span>
                  <span className="text-destructive">
                    累计支出 −{formatCredits(settlement.expense)}
                  </span>
                  <span className="font-medium text-foreground">
                    = 净额{" "}
                    {formatCredits(
                      ledgerNet({
                        income: settlement.effectiveIncome,
                        expense: settlement.expense,
                      }),
                    )}{" "}
                    cr
                  </span>
                  <span>
                    当前余额 {formatCredits(settlement.balance)} cr
                    {settlement.reconciled
                      ? ""
                      : `（相差 ${settlement.gap > 0 ? "+" : "−"}${formatCredits(Math.abs(settlement.gap))}）`}
                  </span>
                </p>
                <p>
                  {settlement.reconciled
                    ? "与当前余额一致。"
                    : settlement.gap > 0
                      ? `另有 ${formatCredits(settlement.gap)} cr 未入账。`
                      : `另有 ${formatCredits(-settlement.gap)} cr 支出未入账。`}
                  {settlement.expired >= 0.01 ? "过期作废不计入收支。" : ""}
                </p>
              </div>

              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                <p className="flex flex-wrap items-center gap-x-2">
                  <span className="font-medium text-foreground tabular-nums">
                    永久 {formatCredits(displayBalance.displayPermanent)} cr
                  </span>
                  <span>充值到账，不过期</span>
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
                <p>消费先扣临时，再扣永久。</p>
              </div>
            </CardContent>
          </Card>

          {/* 签到日历 */}
          <CheckinCalendarCard />

          {/* 活动券与珍宝礼包：充值位同时也是券礼包入口 */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">活动券与珍宝礼包</CardTitle>
              <span className="text-xs text-muted-foreground">当期有效 · 活动结束作废</span>
            </CardHeader>
            <CardContent>
              <CouponShop activities={coupons} />
            </CardContent>
          </Card>
        </PageSection>

        <PageSection title="收支与临时余额" subtitle="最近几笔收支变动、未到账订单与临时余额有效期">
          <div className="space-y-6">
            <RecentLedgerCard days={recentLedger} />

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
