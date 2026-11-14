import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/usage/meter";
import { getLotteryConfig } from "@/lib/lottery/config";
import {
  activityWindow,
  couponTicketsForReward,
  currentActivityKey,
  formatPermanentPrizeLabel,
  formatPrizeLabel,
  formatTicketLabel,
  innerSectorLayout,
  LUCKY_MISS_THRESHOLD,
  outerPrizeCredits,
  round2,
  type LotteryConfig,
} from "@/lib/lottery/prize-math";
import { countConsecutiveMisses, hasUsedFreeDrawToday } from "@/lib/lottery/store";
import {
  DRAW_RECORD_PAGE_SIZE,
  MY_RECORDS_LIMIT,
  listDrawRecords,
  listRecentBigWins,
  lotteryBalance,
} from "@/lib/lottery/records";
import { LotteryRecords } from "./lottery-records";
import { LotteryWheel, type WheelOuter, type WheelSector } from "./lottery-wheel";
import { getActivityCouponView } from "@/lib/activity/coupons";

import { PageBody } from "@/components/dashboard/section";

export const dynamic = "force-dynamic";

const toneOf = (value: number): WheelSector["tone"] =>
  value > 0 ? "positive" : value < 0 ? "negative" : "zero";

/**
 * 把配置翻成转盘视图：扇区角度、显示文案与公示概率三样同源，
 * 避免「画出来的格子大小」和「实际抽中的概率」不一致。
 *
 * 外圈一律换算成实际 cr；`multiplierBase = "batch"` 时同一格在单抽与 10 连抽下金额不同，
 * 两个口径都标出来（用户按哪个按钮抽，看到的就是哪个数）。
 */
function buildWheelViews(config: LotteryConfig): {
  innerSectors: WheelSector[];
  outerPrizes: WheelOuter[];
} {
  const chance = Math.min(100, Math.max(0, config.outerChancePercent));
  const outerWeightSum = config.outerPrizes.reduce((sum, p) => sum + p.weight, 0) || 1;

  const innerSectors: WheelSector[] = innerSectorLayout(config).map((sector) => {
    if (sector.kind === "entry") {
      return {
        kind: "entry",
        label: "外圈入口",
        tone: "entry",
        weight: round2(sector.weight),
        chance: round2(sector.weight),
      };
    }
    const prize = config.innerPrizes[sector.prizeIndex ?? 0];
    return {
      kind: "prize",
      label: formatPrizeLabel(prize.credits),
      tone: toneOf(prize.credits),
      weight: round2(sector.weight),
      chance: round2(sector.weight),
    };
  });

  const outerPrizes: WheelOuter[] = config.outerPrizes.map((p) => {
    // 环带内占比只决定「进了外圈之后」抽到哪格，真实概率还要乘进入外圈的概率。
    const share = (p.weight / outerWeightSum) * 100;
    const chanceOfSector = round2((share * chance) / 100);
    // 赠券档没有 cr，也不随抽数变化，和倍数档分两种文案与色调。
    if (p.kind === "tickets") {
      return {
        label: formatTicketLabel(couponTicketsForReward(config, p.tickets)),
        tone: "ticket" as const,
        weight: round2(share),
        chance: chanceOfSector,
      };
    }
    const single = outerPrizeCredits(config, p.multiplier, 1);
    const batch = outerPrizeCredits(config, p.multiplier, 10);
    // cr 档用绿色调，label 以 cr 结尾，与 tcr 奖品区分。
    const isPermanent = p.kind === "permanentCredits";
    return {
      label: isPermanent ? formatPermanentPrizeLabel(single) : formatPrizeLabel(single),
      ...(batch !== single ? { batchLabel: isPermanent ? formatPermanentPrizeLabel(batch) : formatPrizeLabel(batch) } : {}),
      tone: (isPermanent ? "permanent" : toneOf(p.multiplier)) as WheelOuter["tone"],
      weight: round2(share),
      chance: chanceOfSector,
    };
  });

  return { innerSectors, outerPrizes };
}

function Notice({ title, hint }: { title: string; hint: string }) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <p className="text-base font-medium">{title}</p>
        <p className="mt-2 text-sm text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export default async function LotteryPage() {
  const userId = await requireUser();
  const config = await getLotteryConfig();
  const windowInfo = activityWindow(config);
  const activityKey = currentActivityKey(config);

  // 记录按当前活动轮次过滤，页面只展示当期数据。
  // countConsecutiveMisses 按当前活动轮次过滤，新活动保底重置。
  // currentStats = 当前活动战绩（新活动重计），myStats = 全部活动累计（转盘「累计抽奖」）。
  // 首屏只出第一页，后续翻页走卡片内的局部刷新（listMyActivityRecords）。
  const [myStats, currentStats, records, freeDrawUsed, consecutiveMisses, bigWins, coupon] =
    await Promise.all([
      lotteryBalance({ userId }),
      activityKey ? lotteryBalance({ userId, activityKey }) : Promise.resolve(null),
      listDrawRecords({ userId, limit: DRAW_RECORD_PAGE_SIZE, activityKey }),
      hasUsedFreeDrawToday(userId),
      countConsecutiveMisses(userId, 30, activityKey),
      listRecentBigWins({ thresholdCredits: 500, thresholdTickets: 3, hours: 24, limit: 20 }),
      getActivityCouponView(userId, "lottery"),
    ]);

  // 当期口径的开奖总数即累计统计行的 draws；用户侧只展示最新 MY_RECORDS_LIMIT 条，更早的不再翻页。
  const recordTotal = Math.min((activityKey ? currentStats?.draws : myStats.draws) ?? 0, MY_RECORDS_LIMIT);
  const recordTotalPages = Math.max(1, Math.ceil(recordTotal / DRAW_RECORD_PAGE_SIZE));

  const recordsCard = (
    <LotteryRecords
      key={records[0]?.id ?? "empty"}
      balance={currentStats}
      records={records}
      totalPages={recordTotalPages}
      totalRecords={recordTotal}
      pageSize={DRAW_RECORD_PAGE_SIZE}
      activityLabel={activityKey ?? "历史活动"}
    />
  );

  if (windowInfo.status !== "active") {
    const notice =
      windowInfo.status === "disabled"
        ? { title: "活动未开启", hint: "管理员在「系统设置 → 限时活动（幸运转盘）」中开启后会在这里显示。" }
        : windowInfo.status === "pending"
          ? { title: "活动尚未开始", hint: `开始时间（北京时间）：${config.startAt || "未设置"}。` }
          : {
              title: "活动已结束",
              hint: `结束时间（北京时间）：${config.endAt || "未设置"}。本期未用完的活动券保留在券包里，本轮活动重新开启后仍可使用。`,
            };
    return (
      <>
        <PageHeader title="幸运转盘" description="活动券与累抽奖励" />
        <PageBody className="space-y-6">
          <Notice title={notice.title} hint={notice.hint} />
          {recordsCard}
        </PageBody>
      </>
    );
  }

  const { innerSectors, outerPrizes } = buildWheelViews(config);

  return (
    <>
      <PageHeader title="幸运转盘" description="活动券与累抽奖励" />
      <PageBody className="space-y-6">
        <LotteryWheel
          innerSectors={innerSectors}
          outerPrizes={outerPrizes}
          ticketPriceCredits={config.ticketPriceCredits}
          outerChancePercent={config.outerChancePercent}
          prizeValidDays={config.prizeValidDays}
          milestones={config.milestones}
          totalDraws={myStats.draws}
          coupon={coupon}
          couponUnitCredits={coupon.unitCredits}
          status={windowInfo.status}
          startAtMs={windowInfo.startMs}
          endAtMs={windowInfo.endMs}
          freeDrawAvailable={!freeDrawUsed}
          consecutiveMisses={consecutiveMisses}
          luckyThreshold={LUCKY_MISS_THRESHOLD}
          bigWins={bigWins}
        />
        {recordsCard}
      </PageBody>
    </>
  );
}
