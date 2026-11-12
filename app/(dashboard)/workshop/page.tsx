import { Coins, Gift, PawPrint, Sprout } from "lucide-react";
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
  gatherWeightSummary,
  WORKSHOP_LINES,
  workshopActivityKey,
  workshopActivityWindow,
  type WorkshopConfig,
} from "@/lib/workshop/config";
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

function rulesCard(config: WorkshopConfig, priceTickets: number) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">规则</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            采集一次花 <CouponCount kind="workshop" count={priceTickets} />（1 张 ={" "}
            {formatCredits(config.couponUnitCredits)} cr 券面），按 {gatherWeightSummary(config)}{" "}
            的权重得到 1~3 阶灵宠。
          </li>
          <li>
            <b>两只同阶合成一只高一阶</b>，合成不消耗活动券、不会失败；第 9 阶是每一条线的终点。
          </li>
          <li>
            任意一条线首次达到{" "}
            {config.milestones.map((item) => `${item.tier} 阶`).join(" / ")}，各领一次 tcr：
            {config.milestones.map((item) => ` ${item.tier} 阶 ${formatCredits(item.reward)} tcr`).join("，")}
            ；奖励 {config.rewardValidDays} 天内有效。
          </li>
          <li>每日最多采集 {config.dailyGathers} 次（北京时间自然日）；三条线共用次数。</li>
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
  const priceTickets = ticketsForCost(config.gatherCostCredits, config.couponUnitCredits);

  const [snapshot, granted]: [WorkshopSnapshot, Set<string>] = activityKey
    ? await Promise.all([
        getWorkshopSnapshot(userId, activityKey),
        listGrantedMilestones(userId, "workshop", activityKey),
      ])
    : [{ version: 0, state: { day: "", gathersToday: 0, items: {} } }, new Set<string>()];

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
        <PageHeader title="灵宠工坊" description="采集灵宠 · 同阶合成 · 冲刺九阶" />
        <PageBody className="space-y-4">
          <Notice title={notice.title} hint={notice.hint} />
          {couponCard}
          {rulesCard(config, priceTickets)}
        </PageBody>
      </>
    );
  }

  const ownTickets = coupon.tickets;

  return (
    <>
      <PageHeader title="灵宠工坊" description="采集灵宠 · 同阶合成 · 冲刺九阶" />
      <PageBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="flex flex-col gap-1 py-4">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Sprout className="h-3.5 w-3.5" /> 今日采集
              </p>
              <p className="text-xl font-semibold tabular-nums">
                {snapshot.state.gathersToday ?? 0} / {config.dailyGathers}
              </p>
              <p className="text-xs text-muted-foreground">每日 0 点重置</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-1 py-4">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Coins className="h-3.5 w-3.5" /> 单次采集
              </p>
              <p className="text-xl font-semibold">
                <CouponCount kind="workshop" count={priceTickets} iconClassName="h-4 w-4" />
              </p>
              <p className="text-xs text-muted-foreground">
                1 张 = {formatCredits(config.couponUnitCredits)} cr 券面
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-1 py-4">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <PawPrint className="h-3.5 w-3.5" /> 可用工坊券
              </p>
              <p className="text-xl font-semibold">
                <CouponCount kind="workshop" count={ownTickets} iconClassName="h-4 w-4" />
              </p>
              <p className="text-xs text-muted-foreground">采集只扣当期工坊券</p>
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
            <CardTitle className="text-base">三条养成线</CardTitle>
          </CardHeader>
          <CardContent>
            <WorkshopBoard
              initial={snapshot.state}
              version={snapshot.version}
              lines={WORKSHOP_LINES}
              dailyGathers={config.dailyGathers}
              gathersToday={snapshot.state.gathersToday ?? 0}
              priceTickets={priceTickets}
              couponTickets={ownTickets}
              milestones={config.milestones}
              grantedTiers={grantedTiers}
            />
          </CardContent>
        </Card>

        {couponCard}
        {rulesCard(config, priceTickets)}
      </PageBody>
    </>
  );
}
