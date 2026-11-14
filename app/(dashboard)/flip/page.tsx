import { Coins, Gem, Layers, Trophy } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FlipBoard } from "@/components/flip/board";
import { formatCredits } from "@/lib/billing/credits";
import { requireUser } from "@/lib/usage/meter";
import { FLIP_CARD_COUNT, flipActivityKey, flipActivityWindow, flipExpectation, flipRewardTickets } from "@/lib/flip/config";
import { getFlipConfig } from "@/lib/flip/settings";
import { countRoundsToday, findOpenRound, type PendingRound } from "@/lib/flip/store";
import { flipGlobalStats, flipSummary, type FlipGlobalStats, type FlipSummary } from "@/lib/flip/records";
import { getActivityCouponView } from "@/lib/activity/coupons";
import { couponTickets, ticketsForCost } from "@/lib/activity/ticket-math";
import { CouponCount } from "@/components/activity/coupon-badge";
import { ActivityWindowBadge } from "@/components/activity/activity-window-badge";

import { PageBody } from "@/components/dashboard/section";

export const dynamic = "force-dynamic";

const EMPTY_SUMMARY: FlipSummary = {
  rounds: 0,
  spent: 0,
  won: 0,
  wonTickets: 0,
  best: 0,
  bestTickets: 0,
  bestTicketCredits: 0,
  blanks: 0,
};
const EMPTY_GLOBAL_STATS: FlipGlobalStats = { totalRounds: 0, players: 0, paidOut: 0 };

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

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Coins;
  label: string;
  value: React.ReactNode;
  hint: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col justify-center gap-1 py-4">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </p>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export default async function FlipPage() {
  const userId = await requireUser();
  const [config, coupon] = await Promise.all([
    getFlipConfig(),
    getActivityCouponView(userId, "flip"),
  ]);
  const windowInfo = flipActivityWindow(config);
  const activityKey = flipActivityKey(config);
  const expectation = flipExpectation(config);
  const priceTickets = ticketsForCost(config.roundPriceCredits, config.couponUnitCredits);
  const boardCouponTickets = config.cardRewards.reduce(
    (sum, value) => sum + (flipRewardTickets(value, config.couponUnitCredits) ?? 0),
    0,
  );

  // 活动没开或还没开始时，一条 flip_round 查询都不发：这一轮没人能开局，读了也只有零值，
  // 白占 D1 的每日读额度。
  const trackRounds = windowInfo.status === "active" || windowInfo.status === "ended";
  const idle: [PendingRound | null, number, FlipSummary, FlipGlobalStats] = [
    null,
    0,
    EMPTY_SUMMARY,
    EMPTY_GLOBAL_STATS,
  ];
  const [pendingRound, roundsToday, summary, globalStats] = trackRounds
    ? await Promise.all([
        findOpenRound(userId),
        countRoundsToday(userId),
        flipSummary(userId, activityKey),
        flipGlobalStats(activityKey),
      ])
    : idle;

  // 「最好一张」按实发口径比较：券奖看 rewardTickets / 面值，tcr 奖看 rewardCredits，
  // 不能用 MAX(cr) 反推券张数——历史 tcr 奖可能恰好是券单价的整数倍。
  const bestIsTickets =
    summary.bestTickets > 0 && summary.bestTicketCredits >= summary.best;

  const rulesCard = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">规则</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            牌桌固定 {FLIP_CARD_COUNT} 张，奖项一一对应写死；开局时服务端洗牌决定它们落在哪个位置，
            <b>洗完就落库</b>，翻开之前这张牌是什么只有库里知道。
          </li>
          <li>
            每局只能翻一张，翻开即结算。因为每局都是独立的一副新牌，
            期望返还就是 {expectation.boardTotal} ÷ {FLIP_CARD_COUNT} ={" "}
            {formatCredits(expectation.expectedPerRound)} tcr，<b>不靠「抽多了才准」</b>。
          </li>
          <li>
            面值正好是券单价整数倍的奖项发<b>整张翻牌券</b>（
            <CouponCount kind="flip" count={1} /> = {formatCredits(config.couponUnitCredits)} cr 券面）；
            其余奖项发<b> tcr</b>，{config.rewardValidDays} 天内有效，到期未用自动作废。
            开局票价从当期活动券扣（每局 <CouponCount kind="flip" count={priceTickets} />），
            活动券按本玩法单价兑换（1 张 = {formatCredits(config.couponUnitCredits)} cr），不足需先兑换。
          </li>
          <li>中途关掉页面不算丢：没翻完的那局会留在牌桌上，回来接着翻，不会再扣一次票价。</li>
          <li>每日最多 {config.dailyRounds} 局（按北京时间自然日）。</li>
        </ul>
      </CardContent>
    </Card>
  );

  if (windowInfo.status !== "active") {
    const notice =
      windowInfo.status === "disabled"
        ? { title: "活动未开启", hint: "管理员在「系统设置 → 限时活动（翻牌夺宝）」中开启后会在这里显示。" }
        : windowInfo.status === "pending"
          ? { title: "活动尚未开始", hint: `开始时间（北京时间）：${config.startAt || "未设置"}。` }
          : { title: "活动已结束", hint: `结束时间（北京时间）：${config.endAt || "未设置"}。` };
    return (
      <>
        <PageHeader title="翻牌夺宝" description="12 张牌一桌 · 翻开一张就结算" />
        <PageBody className="space-y-4">
          <Notice title={notice.title} hint={notice.hint} />
          {rulesCard}
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="翻牌夺宝"
        description="12 张牌一桌 · 翻开一张就结算"
        action={
          <ActivityWindowBadge win={windowInfo} tickets={coupon.tickets} couponName={coupon.couponName} />
        }
      />
      <PageBody className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              牌桌
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {expectation.winningCards} 张有奖 · 中奖概率 {expectation.hitChancePercent}%
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FlipBoard
              priceTickets={priceTickets}
              cardCount={FLIP_CARD_COUNT}
              unitCredits={config.couponUnitCredits}
              boardCouponTickets={boardCouponTickets}
              rewardValidDays={config.rewardValidDays}
              dailyRounds={config.dailyRounds}
              roundsLeft={Math.max(0, config.dailyRounds - roundsToday)}
              coupon={coupon}
              boardTotal={expectation.boardTotal}
              expectedPerRound={expectation.expectedPerRound}
              hitChancePercent={expectation.hitChancePercent}
              pendingRound={pendingRound}
            />
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            icon={Layers}
            label="本活动开局"
            value={`${summary.rounds} 局`}
            hint={`今日已开 ${roundsToday} / ${config.dailyRounds} 局`}
          />
          <Stat
            icon={Coins}
            label="累计投入"
            value={<CouponCount kind="flip" count={couponTickets(summary.spent, config.couponUnitCredits)} iconClassName="h-4 w-4" />}
            hint={<span className="inline-flex items-center gap-1">票价 <CouponCount kind="flip" count={priceTickets} /> / 局</span>}
          />
          <Stat
            icon={Gem}
            label="累计到手"
            value={
              <span className="inline-flex flex-wrap items-center gap-1">
                {`${formatCredits(summary.won)} tcr`}
                {summary.wonTickets > 0 ? (
                  <>
                    <span className="text-muted-foreground">+</span>
                    <CouponCount kind="flip" count={summary.wonTickets} iconClassName="h-4 w-4" />
                  </>
                ) : null}
              </span>
            }
            hint={`其中 ${summary.blanks} 局翻到空牌`}
          />
          <Stat
            icon={Trophy}
            label="最好一张"
            value={
              bestIsTickets ? (
                <CouponCount kind="flip" count={summary.bestTickets} iconClassName="h-4 w-4" />
              ) : (
                `${formatCredits(summary.best)} tcr`
              )
            }
            hint={`${globalStats.players} 人参与 · 全站 ${globalStats.totalRounds} 局`}
          />
        </div>

        {rulesCard}
      </PageBody>
    </>
  );
}
