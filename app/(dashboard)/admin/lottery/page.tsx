import { PageHeader } from "@/components/dashboard/page-header";
import { LotteryReport } from "@/components/admin/lottery-report";
import { db } from "@/lib/db/d1-http";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/usage/meter";
import { redirect } from "next/navigation";
import { formatCredits } from "@/lib/billing/credits";
import { getLotteryConfig } from "@/lib/lottery/config";
import { activityWindow, returnRatePercent } from "@/lib/lottery/prize-math";
import {
  DRAW_RECORD_PAGE_SIZE,
  listDrawRecords,
  lotteryBalance,
  lotteryTicketTotals,
  lotteryUserRecords,
  rangeWindow,
} from "@/lib/lottery/records";

import { PageBody } from "@/components/dashboard/section";

export const dynamic = "force-dynamic";

const RANGE_VALUES = ["today", "7d", "30d", "all"];

export default async function AdminLotteryPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const currentUserId = await requireUser();
  const params = await searchParams;

  const currentUser = await db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .limit(1);

  if (!currentUser[0] || currentUser[0].role < 10) {
    redirect("/dashboard");
  }

  // `?range=` 只决定首屏窗口；之后切窗口与翻页都在卡片内局部刷新，不再改 URL。
  const rawRange = params.range ?? "all";
  const range = RANGE_VALUES.includes(rawRange) ? rawRange : "all";
  const win = rangeWindow(range);

  const [config, balance, perUser, records, ticketTotals] = await Promise.all([
    getLotteryConfig(),
    lotteryBalance({ win }),
    lotteryUserRecords(win),
    listDrawRecords({ win, limit: DRAW_RECORD_PAGE_SIZE }),
    lotteryTicketTotals(win),
  ]);

  const activity = activityWindow(config);
  const emailById = new Map(perUser.map((u) => [u.userId, u.email]));

  return (
    <>
      <PageHeader
        title="活动记录"
        description="幸运转盘 · 用户参与明细与站点收益"
      />

      <PageBody className="space-y-6">
        <LotteryReport
          range={range}
          activitySummary={
            activity.status === "disabled"
              ? "活动当前未开启"
              : `${activity.status === "active" ? "进行中" : activity.status === "pending" ? "未开始" : "已结束"} · ${config.startAt || "—"} ~ ${config.endAt || "—"} · 券价 ${formatCredits(config.ticketPriceCredits)} cr · 外圈 ${config.outerChancePercent}%`
          }
          rateHint={`${config.multiplierBase === "batch" ? "配置单抽口径" : "配置口径"} ${returnRatePercent(config)}%`}
          report={{
            balance,
            ticketTotals,
            perUser,
            detail: {
              rows: records.map((record) => ({
                ...record,
                email: emailById.get(record.userId) ?? null,
              })),
              totalRecords: balance.draws,
              totalPages: Math.max(1, Math.ceil(balance.draws / DRAW_RECORD_PAGE_SIZE)),
            },
          }}
        />
      </PageBody>
    </>
  );
}
