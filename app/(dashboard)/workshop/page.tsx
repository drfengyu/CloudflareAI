import { Coins, Gift, Map, PawPrint, Swords, Trophy } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageBody } from "@/components/dashboard/section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkshopBoard } from "@/components/workshop/board";
import { CouponCount } from "@/components/activity/coupon-badge";
import { CouponShop } from "@/components/activity/coupon-shop";
import { formatCredits } from "@/lib/billing/credits";
import { getActivityCouponView } from "@/lib/activity/coupons";
import { listGrantedMilestones } from "@/lib/activity/rewards";
import { ticketsForCost } from "@/lib/activity/ticket-math";
import { requireUser } from "@/lib/usage/meter";
import {
  WORKSHOP_LINES,
  workshopActivityKey,
  workshopActivityWindow,
  type WorkshopConfig,
} from "@/lib/workshop/config";
import { WORKSHOP_AREAS, WORKSHOP_GYMS } from "@/lib/workshop/battle";
import { emptyWorkshopState } from "@/lib/workshop/state";
import { getWorkshopConfig } from "@/lib/workshop/settings";
import { getWorkshopSnapshot, type WorkshopSnapshot } from "@/lib/workshop/store";

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

function rulesCard(config: WorkshopConfig, exploreTickets: number, gymTickets: number) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">规则</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            开局从焰尾狐 / 潮汐鲸 / 森语鹿里<b>三选一</b>，Lv.5 起步；属性克制为
            焰尾狐 → 森语鹿 → 潮汐鲸 → 焰尾狐（克制 ×1.5，被克 ×0.67）。
          </li>
          <li>
            <b>进图</b>一次花 <CouponCount kind="workshop" count={exploreTickets} />
            （1 张 = {formatCredits(config.couponUnitCredits)} cr 券面）：从营地出发，
            在高草丛、花丛里走动就会遇到野生灵宠，打赢给经验与随机补给，也可以直接扔球捕捉。
          </li>
          <li>
            一张图能走 {config.runMaxSteps} 步、最多遇 {config.runMaxEncounters} 只灵宠，
            走满就自动收兵；随时可以按「收兵离开」回营地。地图每次进图重新生成。
          </li>
          <li>
            <b>捕捉</b>：对手血量越低越好抓；队伍最多 3 只，仓库 60 只。战斗中可以换宠、用药水或逃跑，
            道馆战不能逃跑也不能扔球。
          </li>
          <li>
            <b>升级进化</b>：经验来自战斗，Lv.6 / 10 / 14 / … 自动进化到下一阶；
            两只同阶也可以直接<b>合成一只高一阶</b>（不花券，优先吃低等级的那两只）。
          </li>
          <li>
            <b>道馆</b>按徽章顺序挑战，花 <CouponCount kind="workshop" count={gymTickets} />；
            胜利得徽章并解锁更深区域，失败只损失这次次数。
          </li>
          <li>
            任意一条线首次达到{" "}
            {config.milestones.map((item) => `${item.tier} 阶`).join(" / ")}，各领一次 tcr：
            {config.milestones.map((item) => ` ${item.tier} 阶 ${formatCredits(item.reward)} tcr`).join("，")}
            ；奖励 {config.rewardValidDays} 天内有效。
          </li>
          <li>
            每日最多进图 {config.dailyExplores} 次、挑战道馆 {config.dailyGyms} 次（北京时间自然日）；
            每天还能免费休息一次，回满整队。
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}

export default async function WorkshopPage() {
  const userId = await requireUser();
  const [config, coupon] = await Promise.all([
    getWorkshopConfig(),
    getActivityCouponView(userId, "workshop"),
  ]);
  const windowInfo = workshopActivityWindow(config);
  const activityKey = workshopActivityKey(config);
  const exploreTickets = ticketsForCost(config.exploreCostCredits, config.couponUnitCredits);
  const gymTickets = ticketsForCost(config.gymCostCredits, config.couponUnitCredits);

  const [snapshot, granted]: [WorkshopSnapshot, Set<string>] = activityKey
    ? await Promise.all([
        getWorkshopSnapshot(userId, activityKey),
        listGrantedMilestones(userId, "workshop", activityKey),
      ])
    : [{ version: 0, state: emptyWorkshopState() }, new Set<string>()];

  const grantedTiers = config.milestones
    .filter((item) => granted.has(`tier:${item.tier}`))
    .map((item) => item.tier);

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

  if (windowInfo.status !== "active") {
    const notice =
      windowInfo.status === "disabled"
        ? { title: "活动未开启", hint: "管理员在「系统设置 → 限时活动（灵宠工坊）」中开启后会在这里显示。" }
        : windowInfo.status === "pending"
          ? { title: "活动尚未开始", hint: `开始时间（北京时间）：${config.startAt || "未设置"}。` }
          : { title: "活动已结束", hint: `结束时间（北京时间）：${config.endAt || "未设置"}。` };
    return (
      <>
        <PageHeader title="灵宠工坊" description="三选一 · 进图捕捉 · 道馆徽章" />
        <PageBody className="space-y-4">
          <Notice title={notice.title} hint={notice.hint} />
          {couponCard}
          {rulesCard(config, exploreTickets, gymTickets)}
        </PageBody>
      </>
    );
  }

  const ownTickets = coupon.tickets;

  return (
    <>
      <PageHeader title="灵宠工坊" description="三选一 · 进图捕捉 · 道馆徽章" />
      <PageBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardContent className="flex flex-col gap-1 py-4">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Map className="h-3.5 w-3.5" /> 今日进图
              </p>
              <p className="text-xl font-semibold tabular-nums">
                {snapshot.state.entersToday} / {config.dailyExplores}
              </p>
              <p className="text-xs text-muted-foreground">每日 0 点重置</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-1 py-4">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Swords className="h-3.5 w-3.5" /> 今日道馆
              </p>
              <p className="text-xl font-semibold tabular-nums">
                {snapshot.state.gymsToday ?? 0} / {config.dailyGyms}
              </p>
              <p className="text-xs text-muted-foreground">
                单次 <CouponCount kind="workshop" count={gymTickets} />
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-1 py-4">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Trophy className="h-3.5 w-3.5" /> 徽章
              </p>
              <p className="text-xl font-semibold tabular-nums">{snapshot.state.badges ?? 0} / 3</p>
              <p className="text-xs text-muted-foreground">三枚徽章解锁星陨高地</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-1 py-4">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Coins className="h-3.5 w-3.5" /> 可用工坊券
              </p>
              <p className="text-xl font-semibold">
                <CouponCount kind="workshop" count={ownTickets} iconClassName="h-4 w-4" />
              </p>
              <p className="text-xs text-muted-foreground">
                进图 <CouponCount kind="workshop" count={exploreTickets} /> / 次
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-1 py-4">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Gift className="h-3.5 w-3.5" /> 里程碑
              </p>
              <p className="text-xl font-semibold tabular-nums">
                {grantedTiers.length} / {config.milestones.length}
              </p>
              <p className="text-xs text-muted-foreground">任意一条线达到指定阶即可领取</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PawPrint className="h-4 w-4" /> 冒险与养成
            </CardTitle>
          </CardHeader>
          <CardContent>
            <WorkshopBoard
              initial={snapshot.state}
              version={snapshot.version}
              lines={WORKSHOP_LINES}
              areas={WORKSHOP_AREAS}
              gyms={WORKSHOP_GYMS}
              milestones={config.milestones}
              grantedTiers={grantedTiers}
              dailyExplores={config.dailyExplores}
              dailyGyms={config.dailyGyms}
              runLimits={{ maxSteps: config.runMaxSteps, maxEncounters: config.runMaxEncounters }}
              exploreTickets={exploreTickets}
              gymTickets={gymTickets}
              couponTickets={ownTickets}
            />
          </CardContent>
        </Card>

        {couponCard}
        {rulesCard(config, exploreTickets, gymTickets)}
      </PageBody>
    </>
  );
}
