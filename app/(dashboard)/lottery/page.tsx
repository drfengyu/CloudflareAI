import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { getUserTotalBalance, requireUser } from "@/lib/usage/meter";
import { getLotteryConfig } from "@/lib/lottery/config";
import {
  activityWindow,
  formatPrizeLabel,
  formatTicketLabel,
  innerSectorLayout,
  outerPrizeCredits,
  round2,
  type LotteryConfig,
} from "@/lib/lottery/prize-math";
import { countUnusedTickets } from "@/lib/lottery/store";
import {
  listDrawRecords,
  lotteryBalance,
  lotteryTicketTotals,
} from "@/lib/lottery/records";
import { LotteryRecords } from "./lottery-records";
import { LotteryWheel, type WheelOuter, type WheelSector } from "./lottery-wheel";

export const dynamic = "force-dynamic";

/** 活动记录一次拉多少条；超过这个数只在卡片尾部提示，不做分页。 */
const RECORD_LIMIT = 50;

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
        label: formatTicketLabel(p.tickets),
        tone: "ticket" as const,
        weight: round2(share),
        chance: chanceOfSector,
      };
    }
    const single = outerPrizeCredits(config, p.multiplier, 1);
    const batch = outerPrizeCredits(config, p.multiplier, 10);
    return {
      label: formatPrizeLabel(single),
      ...(batch !== single ? { batchLabel: formatPrizeLabel(batch) } : {}),
      tone: toneOf(p.multiplier),
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

  // 记录按整个活动期口径给（不加时间窗），活动结束后这段历史仍然要能翻出来看。
  const [tickets, myStats, myTickets, records, balance] = await Promise.all([
    countUnusedTickets(userId),
    lotteryBalance({ userId }),
    lotteryTicketTotals(undefined, userId),
    listDrawRecords({ userId, limit: RECORD_LIMIT }),
    getUserTotalBalance(userId),
  ]);

  const recordsCard = (
    <LotteryRecords
      balance={myStats}
      tickets={myTickets}
      records={records}
      ticketsLeft={tickets}
      recordLimit={RECORD_LIMIT}
    />
  );

  if (windowInfo.status !== "active") {
    const notice =
      windowInfo.status === "disabled"
        ? { title: "活动未开启", hint: "管理员在「系统设置 → 限时活动」中开启后会在这里显示。" }
        : windowInfo.status === "pending"
          ? { title: "活动尚未开始", hint: `开始时间（北京时间）：${config.startAt || "未设置"}。` }
          : {
              title: "活动已结束",
              hint: `结束时间（北京时间）：${config.endAt || "未设置"}。未使用的抽奖券已随活动作废。`,
            };
    return (
      <>
        <PageHeader title="限时活动" description="幸运转盘 · 抽奖券与累抽奖励" />
        <div className="space-y-6 p-8">
          <Notice title={notice.title} hint={notice.hint} />
          {recordsCard}
        </div>
      </>
    );
  }

  const { innerSectors, outerPrizes } = buildWheelViews(config);

  return (
    <>
      <PageHeader title="限时活动" description="幸运转盘 · 抽奖券与累抽奖励" />
      <div className="space-y-6 p-8">
        <LotteryWheel
          innerSectors={innerSectors}
          outerPrizes={outerPrizes}
          ticketPriceCredits={config.ticketPriceCredits}
          outerChancePercent={config.outerChancePercent}
          prizeValidDays={config.prizeValidDays}
          milestones={config.milestones}
          tickets={tickets}
          totalDraws={myStats.draws}
          totalCredits={balance.total}
          status={windowInfo.status}
          startAtMs={windowInfo.startMs}
          endAtMs={windowInfo.endMs}
        />
        {recordsCard}
      </div>
    </>
  );
}
