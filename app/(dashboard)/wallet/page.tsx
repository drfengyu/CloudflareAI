import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pagination } from "@/components/dashboard/pagination";
import { requireUser } from "@/lib/usage/meter";
import { db } from "@/lib/db/d1-http";
import { users, topups, temporaryBalances, paymentOrders } from "@/lib/db/schema";
import { and, desc, eq, gt } from "drizzle-orm";
import { Wallet, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { RedeemCodeDialog } from "./redeem-code-dialog";
import { CheckinCalendarCard } from "./checkin-calendar-card";
import { RechargeOrdersCard } from "./recharge-orders-card";
import { TempBalancesCard, type SerializedTempBalance } from "./temp-balances-card";
import { formatCredits } from "@/lib/billing/credits";
import { calculateDisplayBalance } from "@/lib/billing/display-balance";
import { walletTopupWhere } from "@/lib/billing/grant-expiry";
import { getLinuxdoConfig } from "@/lib/payment/linuxdo";
import { PAY_ORDER_PAGE_SIZE, serializePayOrder } from "@/lib/payment/pay-order-view";
import { formatCnDate, cnDaysAgoStart } from "@/lib/date";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** 充值流水每页条数；多取一条用来判断是否还有下一页（省一次 COUNT）。 */
const TOPUP_PAGE_SIZE = 10;

export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string; orderNo?: string; page?: string }>;
}) {
  const userId = await requireUser();
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const now = new Date();

  // 充值流水只保留近三个月，更早的历史不再展示。
  const historyCutoff = cnDaysAgoStart(90);

  // 2026-10-17 性能：这些查询互不依赖（全都只按 userId 取数），原先是一条接一条 await，
  // 串行 5 次 D1 往返 ≈ 2 秒；并发成一波后只剩最慢那条的时间。取数口径一字未改。
  const [userRows, tempBalances, payOrders, linuxdoConfig, topupWhere] = await Promise.all([
    // 获取用户永久余额
    db
      .select({ balanceCredits: users.balanceCredits })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    // 获取未过期的临时余额（过期判定下沉到 SQL，不再把已失效的行读进内存）
    db
      .select()
      .from(temporaryBalances)
      .where(and(eq(temporaryBalances.userId, userId), gt(temporaryBalances.expiresAt, now)))
      .orderBy(temporaryBalances.expiresAt),
    // 在线充值订单（含回跳订单号置顶逻辑交给客户端组件；翻页也在卡片内局部刷新）
    // 这里不按 historyCutoff 裁剪：待支付/支付确认中的订单可以陈旧到任意久，而这张卡是
    // 用户唯一能自查并手动「查询」催单的地方，裁剪会把未到账订单从视野里抹掉。
    db
      .select()
      .from(paymentOrders)
      .where(eq(paymentOrders.userId, userId))
      .orderBy(desc(paymentOrders.createdAt))
      .limit(PAY_ORDER_PAGE_SIZE + 1),
    getLinuxdoConfig(),
    // 充值流水的可见性条件（含近三个月裁剪 + 发放到期过滤，活动流水整类排除）
    walletTopupWhere(userId, historyCutoff, now),
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

  // 签到奖励与兑换码发的是一次性临时余额，到期之后不再作为「可用余额来源」显示。
  // 过期判定已下沉进 SQL，LIMIT 取到的就是可见行；多取一条判断是否还有下一页。
  const recentTopups = await db
    .select()
    .from(topups)
    .where(topupWhere)
    .orderBy(desc(topups.createdAt))
    .limit(TOPUP_PAGE_SIZE + 1)
    .offset((page - 1) * TOPUP_PAGE_SIZE);
  const hasMoreTopups = recentTopups.length > TOPUP_PAGE_SIZE;
  const topupRecords = recentTopups.slice(0, TOPUP_PAGE_SIZE);

  const hasMorePayOrders = payOrders.length > PAY_ORDER_PAGE_SIZE;
  const serializedOrders = payOrders.slice(0, PAY_ORDER_PAGE_SIZE).map(serializePayOrder);

  const serializedTempBalances: SerializedTempBalance[] = displayTempBalances.map((tb) => ({
    id: tb.id,
    displayAmount: tb.displayAmount,
    usedForCompensation: tb.usedForCompensation,
    description: tb.description ?? null,
    expiresAtLabel: formatCnDate(tb.expiresAt),
  }));

  const justReturned = params.paid === "1";
  const highlightOrderNo = params.orderNo ?? undefined;

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
            <RedeemCodeDialog
              linuxdoEnabled={linuxdoConfig.enabled}
              linuxdoMin={linuxdoConfig.minCny}
              linuxdoMax={linuxdoConfig.maxCny}
            />
          </CardContent>
        </Card>

        {/* 签到日历 */}
        <CheckinCalendarCard />

        {/* 在线充值订单（回跳确认 + 轮询 + 卡片内翻页） */}
        <RechargeOrdersCard
          orders={serializedOrders}
          initialHasNext={hasMorePayOrders}
          highlightOrderNo={highlightOrderNo}
          justReturned={justReturned}
        />

        {/* 临时余额明细（卡片内本地分页） */}
        <TempBalancesCard balances={serializedTempBalances} />

        {/* 充值流水 */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">充值记录</CardTitle>
            <span className="text-xs text-muted-foreground">
              仅显示最近三个月 · 每页 {TOPUP_PAGE_SIZE} 条
            </span>
          </CardHeader>
          <CardContent>
            {topupRecords.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无充值记录</p>
            ) : (
              <div className="space-y-2">
                {topupRecords.map((record) => (
                  <div
                    key={record.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-card p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {record.type === 1
                          ? "兑换码充值"
                          : record.type === 2
                            ? "管理员充值"
                            : record.type === 3
                              ? "签到奖励"
                              : record.type === 5
                                ? "在线充值"
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
                      <p
                        className={cn(
                          "text-lg font-semibold",
                          record.amount >= 0 ? "text-success" : "text-destructive",
                        )}
                      >
                        {record.amount >= 0 ? "+" : ""}
                        {formatCredits(record.amount)} cr
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Pagination page={page} hasNext={hasMoreTopups} basePath="/wallet" />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
