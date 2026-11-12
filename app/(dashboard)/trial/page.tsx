import { Coins, Swords, Timer, Trophy } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageBody } from "@/components/dashboard/section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrialGame } from "@/components/trial/game";
import { CouponCount } from "@/components/activity/coupon-badge";
import { CouponShop } from "@/components/activity/coupon-shop";
import { formatCredits } from "@/lib/billing/credits";
import { getActivityCouponView } from "@/lib/activity/coupons";
import { ticketsForCost } from "@/lib/activity/ticket-math";
import { requireUser } from "@/lib/usage/meter";
import {
  trialActivityKey,
  trialActivityWindow,
  trialRewardFor,
} from "@/lib/trial/config";
import { getTrialConfig } from "@/lib/trial/settings";
import {
  countTrialRunsToday,
  findActiveTrialRun,
  listTrialRuns,
  type ActiveTrialRun,
  type TrialHistoryRow,
} from "@/lib/trial/store";

export const dynamic = "force-dynamic";

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

export default async function TrialPage() {
  const userId = await requireUser();
  const [config, coupon] = await Promise.all([
    getTrialConfig(),
    getActivityCouponView(userId, "trial"),
  ]);
  const windowInfo = trialActivityWindow(config);
  const activityKey = trialActivityKey(config);
  const priceTickets = ticketsForCost(config.runPriceCredits, config.couponUnitCredits);

  const track = windowInfo.status === "active" || windowInfo.status === "ended";
  const [activeRun, runsToday, history]: [ActiveTrialRun | null, number, TrialHistoryRow[]] = track
    ? await Promise.all([
        findActiveTrialRun(userId, activityKey, config),
        countTrialRunsToday(userId),
        listTrialRuns(userId, activityKey, 8),
      ])
    : [null, 0, []];

  const best = history.reduce((max, row) => Math.max(max, row.correct), 0);

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
            每局 {config.questionCount} 层浮游城，限时 {config.timeLimitSeconds} 秒；每层先在两扇野区门里探路
            （战斗 / 精英 / 宝箱 / 营地），再挑战层主，击败才上楼。
          </li>
          <li>
            剑技是「线性攻击 / 水平弧斩 / 切换防守 / 星屑飞溅」，后两招有冷却；连续进攻累积连击加伤，
            受伤或防守会清空连击。击杀获得经验，升级提升生命上限并回复 10。
            宝箱与精英掉装备（可叠加），层主残血进入狂暴；地图与种子存在服务端，<b>交卷只上交动作序列</b>。
          </li>
          <li>
            单局票价 <CouponCount kind="trial" count={priceTickets} />（1 张 ={" "}
            {formatCredits(config.couponUnitCredits)} cr 券面），只扣试炼券；券不足先兑换。
          </li>
          <li>
            通关层数对应奖励：
            {config.tiers
              .map((tier) => ` ${tier.correct} 层 ${formatCredits(trialRewardFor(config, tier.correct))} tcr`)
              .join("，")}
            ；奖励 tcr {config.rewardValidDays} 天内有效。
          </li>
          <li>
            每日最多 {config.dailyRuns} 局（北京时间自然日）。中途关掉页面不算失败，回来接着打同一局；
            超时按 0 层结算，不返还券。
          </li>
        </ul>
      </CardContent>
    </Card>
  );

  const historyCard = (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">最近挑战</CardTitle>
        <span className="text-xs text-muted-foreground">最好成绩 {best} 层</span>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">本活动还没有挑战记录。</p>
        ) : (
          <div className="space-y-1">
            {history.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span className="text-muted-foreground">
                  {new Date(row.startedAt).toLocaleString("zh-CN", { hour12: false })}
                </span>
                <span className="flex items-center gap-3 tabular-nums">
                  <span>
                    {row.status === "expired" ? "超时" : `通关 ${row.correct}/${row.questionCount} 层`}
                  </span>
                  <span className={row.reward > 0 ? "font-medium text-success" : "text-muted-foreground"}>
                    {row.reward > 0 ? `+${formatCredits(row.reward)} tcr` : "无奖励"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (windowInfo.status !== "active") {
    const notice =
      windowInfo.status === "disabled"
        ? { title: "活动未开启", hint: "管理员在「系统设置 → 限时活动（每日试炼）」中开启后会在这里显示。" }
        : windowInfo.status === "pending"
          ? { title: "活动尚未开始", hint: `开始时间（北京时间）：${config.startAt || "未设置"}。` }
          : { title: "活动已结束", hint: `结束时间（北京时间）：${config.endAt || "未设置"}。` };
    return (
      <>
        <PageHeader title="每日试炼" description={`${config.questionCount} 层浮游城 · 越深 tcr 越多`} />
        <PageBody className="space-y-4">
          <Notice title={notice.title} hint={notice.hint} />
          {couponCard}
          {track ? historyCard : null}
          {rulesCard}
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader title="每日试炼" description={`${config.questionCount} 层浮游城 · 越深 tcr 越多`} />
      <PageBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            icon={Swords}
            label="今日进度"
            value={`${runsToday} / ${config.dailyRuns} 局`}
            hint={activeRun ? "有一局还没交卷" : "每日 0 点重置"}
          />
          <Stat
            icon={Timer}
            label="单局限时"
            value={`${config.timeLimitSeconds} 秒`}
            hint={`共 ${config.questionCount} 层，每层都有层主`}
          />
          <Stat
            icon={Coins}
            label="单局票价"
            value={<CouponCount kind="trial" count={priceTickets} iconClassName="h-4 w-4" />}
            hint={`1 张 = ${formatCredits(config.couponUnitCredits)} cr 券面`}
          />
          <Stat
            icon={Trophy}
            label="可用活动券"
            value={<CouponCount kind="trial" count={coupon.tickets} iconClassName="h-4 w-4" />}
            hint={`通关 ${config.questionCount} 层得 ${formatCredits(trialRewardFor(config, config.questionCount))} tcr`}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">开始试炼</CardTitle>
          </CardHeader>
          <CardContent>
            <TrialGame
              initialRun={activeRun}
              runsToday={runsToday}
              dailyRuns={config.dailyRuns}
              floorCount={config.questionCount}
              timeLimitSeconds={config.timeLimitSeconds}
              priceTickets={priceTickets}
              couponTickets={coupon.tickets}
              unitCredits={config.couponUnitCredits}
              rewardValidDays={config.rewardValidDays}
              maxReward={trialRewardFor(config, config.questionCount)}
            />
          </CardContent>
        </Card>

        {couponCard}
        {historyCard}
        {rulesCard}
      </PageBody>
    </>
  );
}
