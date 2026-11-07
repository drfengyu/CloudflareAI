import { Coins, Gem, Layers, Trophy } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FlipBoard } from "@/components/flip/board";
import { FlipRoundList } from "@/components/flip/round-list";
import { formatCredits } from "@/lib/billing/credits";
import { getUserTotalBalance, requireUser } from "@/lib/usage/meter";
import { FLIP_CARD_COUNT, flipActivityKey, flipActivityWindow, flipExpectation } from "@/lib/flip/config";
import { getFlipConfig } from "@/lib/flip/settings";
import { countRoundsToday, findOpenRound, type PendingRound } from "@/lib/flip/store";
import { flipGlobalStats, flipSummary, listMyRounds, FLIP_ROUND_PAGE_SIZE, type FlipGlobalStats, type FlipRoundView, type FlipSummary } from "@/lib/flip/records";
import { getActivityCouponView } from "@/lib/activity/coupons";
import { CouponShop } from "@/components/activity/coupon-shop";

import { PageBody } from "@/components/dashboard/section";

export const dynamic = "force-dynamic";

const EMPTY_SUMMARY: FlipSummary = { rounds: 0, spent: 0, won: 0, best: 0, blanks: 0 };
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
  value: string;
  hint: string;
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
  const [config, balance, coupon] = await Promise.all([
    getFlipConfig(),
    getUserTotalBalance(userId),
    getActivityCouponView(userId, "flip"),
  ]);
  const windowInfo = flipActivityWindow(config);
  const activityKey = flipActivityKey(config);
  const expectation = flipExpectation(config);

  // 活动没开或还没开始时，一条 flip_round 查询都不发：这一轮没人能开局，读了也只有零值，
  // 白占 D1 的每日读额度。已经结束的轮次要读——用户回来对账看他赢了多少。
  const trackRounds = windowInfo.status === "active" || windowInfo.status === "ended";
  const idle: [PendingRound | null, number, FlipSummary, FlipRoundView[], FlipGlobalStats] = [
    null,
    0,
    EMPTY_SUMMARY,
    [],
    EMPTY_GLOBAL_STATS,
  ];
  const [pendingRound, roundsToday, summary, fetchedRounds, globalStats] = trackRounds
    ? await Promise.all([
        findOpenRound(userId),
        countRoundsToday(userId),
        flipSummary(userId, activityKey),
        listMyRounds(userId, activityKey, FLIP_ROUND_PAGE_SIZE + 1),
        flipGlobalStats(activityKey),
      ])
    : idle;

  // 多取的那一条只用来探测「还有下一页」，翻页本身走卡片内的局部刷新。
  const hasMoreRounds = fetchedRounds.length > FLIP_ROUND_PAGE_SIZE;
  const rounds = fetchedRounds.slice(0, FLIP_ROUND_PAGE_SIZE);

  const recordsCard = (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">我的牌局</CardTitle>
        <span className="text-xs text-muted-foreground">每页 {FLIP_ROUND_PAGE_SIZE} 局</span>
      </CardHeader>
      <CardContent>
        <FlipRoundList key={rounds[0]?.id ?? "empty"} rounds={rounds} hasNext={hasMoreRounds} />
      </CardContent>
    </Card>
  );

  const couponCard = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">活动券与珍宝礼包</CardTitle>
      </CardHeader>
      <CardContent>
        <CouponShop activities={[coupon]} />
      </CardContent>
    </Card>
  );

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
            {formatCredits(expectation.expectedPerRound)} cr，<b>不靠「抽多了才准」</b>。
          </li>
          <li>
            中奖 cr 进<b>临时余额</b>，有效期 {config.rewardValidDays} 天，到期未用自动作废；票价按「先花快过期的赠送额度、
            再花本金」的顺序扣。
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
          {couponCard}
          {trackRounds ? recordsCard : null}
          {rulesCard}
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader title="翻牌夺宝" description="12 张牌一桌 · 翻开一张就结算" />
      <PageBody className="space-y-4">
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
            value={`${formatCredits(summary.spent)} cr`}
            hint={`票价 ${formatCredits(config.roundPriceCredits)} cr / 局`}
          />
          <Stat
            icon={Gem}
            label="累计到手"
            value={`${formatCredits(summary.won)} cr`}
            hint={`其中 ${summary.blanks} 局翻到空牌`}
          />
          <Stat
            icon={Trophy}
            label="最好一张"
            value={`${formatCredits(summary.best)} cr`}
            hint={`${globalStats.players} 人参与 · 全站 ${globalStats.totalRounds} 局`}
          />
        </div>

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
              priceCredits={config.roundPriceCredits}
              cardCount={FLIP_CARD_COUNT}
              rewardValidDays={config.rewardValidDays}
              dailyRounds={config.dailyRounds}
              roundsLeft={Math.max(0, config.dailyRounds - roundsToday)}
              balanceCredits={balance.total}
              boardTotal={expectation.boardTotal}
              expectedPerRound={expectation.expectedPerRound}
              hitChancePercent={expectation.hitChancePercent}
              pendingRound={pendingRound}
            />
          </CardContent>
        </Card>

        {couponCard}
        {recordsCard}
        {rulesCard}
      </PageBody>
    </>
  );
}
