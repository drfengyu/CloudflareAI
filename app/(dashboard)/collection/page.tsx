import { Coins, Gem, Sparkles, Telescope } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageBody } from "@/components/dashboard/section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollectionSky } from "@/components/collection/sky";
import { CouponCount } from "@/components/activity/coupon-badge";
import { CouponShop } from "@/components/activity/coupon-shop";
import { ActivityWindowBadge } from "@/components/activity/activity-window-badge";
import { formatCredits } from "@/lib/billing/credits";
import { getActivityCouponView } from "@/lib/activity/coupons";
import { listGrantedMilestones } from "@/lib/activity/rewards";
import { ticketsForCost } from "@/lib/activity/ticket-math";
import { cnDateString } from "@/lib/date";
import { requireUser } from "@/lib/usage/meter";
import {
  CONSTELLATIONS,
  collectionActivityKey,
  collectionActivityWindow,
  type CollectionConfig,
} from "@/lib/collection/config";
import { getCollectionConfig } from "@/lib/collection/settings";
import { getCollectionSnapshot } from "@/lib/collection/store";

export const dynamic = "force-dynamic";

const TOTAL_NODES = CONSTELLATIONS.reduce((sum, item) => sum + item.nodes.length, 0);

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

function rulesCard(config: CollectionConfig, priceTickets: number) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">规则</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            观星一次花 <CouponCount kind="collection" count={priceTickets} />（1 张 ={" "}
            {formatCredits(config.couponUnitCredits)} cr 券面），随机得到一颗星石：颜色等概率，
            亮度为微光 60% / 辉光 30% / 耀光 10%。
          </li>
          <li>
            每个星位标有颜色与最低亮度：嵌入同色且亮度不低于要求的星石即可点亮，优先消耗刚好够的那颗；
            相邻星位都亮会自动连成星线。
          </li>
          <li>
            多余星石可熔成星辉（微光 1 / 辉光 2 / 耀光 3），也能用星辉定向凝出指定颜色与亮度的星石
            （3 / 6 / 10 星辉）。
          </li>
          <li>
            一整张星座 9 颗全亮即完成：额外 +5 星辉，并发放一次性 tcr（
            {CONSTELLATIONS.map((item) => {
              const reward = config.setRewards.find((row) => row.set === item.key)?.reward ?? 0;
              return `${item.name} ${formatCredits(reward)}`;
            }).join("，")}
            ），奖励 {config.rewardValidDays} 天内有效。
          </li>
          <li>
            每日可对每座已完成的星座共鸣一次，每座领 {formatCredits(config.resonanceReward)} tcr；
            每日最多观星 {config.dailyObserves} 次（北京时间自然日），当期结束后进度不跨期保留。
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}

export default async function CollectionPage() {
  const userId = await requireUser();
  const [config, coupon] = await Promise.all([
    getCollectionConfig(),
    getActivityCouponView(userId, "collection"),
  ]);
  const windowInfo = collectionActivityWindow(config);
  const activityKey = collectionActivityKey(config);
  const priceTickets = ticketsForCost(config.observeCostCredits, config.couponUnitCredits);
  const today = cnDateString();

  const [snapshot, granted] = activityKey
    ? await Promise.all([
        getCollectionSnapshot(userId, activityKey),
        listGrantedMilestones(userId, "collection", activityKey),
      ])
    : [await getCollectionSnapshot(userId, null), new Set<string>()];

  const lit = new Set(snapshot.state.nodes);
  const completed = CONSTELLATIONS.filter((item) =>
    item.nodes.every((node) => lit.has(node.id)),
  ).length;
  const grantedSets = CONSTELLATIONS.filter((item) => granted.has(`set:${item.key}`)).map(
    (item) => item.key,
  );

  const couponCard = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">活动券与星图礼包</CardTitle>
      </CardHeader>
      <CardContent>
        <CouponShop activities={[coupon]} />
      </CardContent>
    </Card>
  );

  if (windowInfo.status !== "active") {
    const notice =
      windowInfo.status === "disabled"
        ? { title: "活动未开启", hint: "管理员在「系统设置 → 限时活动（星图共鸣）」中开启后会在这里显示。" }
        : windowInfo.status === "pending"
          ? { title: "活动尚未开始", hint: `开始时间（北京时间）：${config.startAt || "未设置"}。` }
          : { title: "活动已结束", hint: `结束时间（北京时间）：${config.endAt || "未设置"}。` };
    return (
      <>
        <PageHeader title="星图共鸣" description="观星得石 · 点亮星座 · 每日共鸣" />
        <PageBody className="space-y-4">
          <Notice title={notice.title} hint={notice.hint} />
          {couponCard}
          {rulesCard(config, priceTickets)}
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="星图共鸣"
        description="观星得石 · 点亮星座 · 每日共鸣"
        action={
          <ActivityWindowBadge
            win={windowInfo}
            tickets={coupon.tickets}
            couponName={coupon.couponName}
          />
        }
      />
      <PageBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            icon={Telescope}
            label="今日观星"
            value={`${snapshot.state.observesToday} / ${config.dailyObserves}`}
            hint="每日 0 点重置"
          />
          <Stat
            icon={Coins}
            label="单次观星"
            value={<CouponCount kind="collection" count={priceTickets} iconClassName="h-4 w-4" />}
            hint={`1 张 = ${formatCredits(config.couponUnitCredits)} cr 券面 · 可用 ${coupon.tickets} 张`}
          />
          <Stat
            icon={Sparkles}
            label="已点亮星位"
            value={`${lit.size} / ${TOTAL_NODES}`}
            hint={`已完成 ${completed} / ${CONSTELLATIONS.length} 座星座`}
          />
          <Stat
            icon={Gem}
            label="星辉"
            value={snapshot.state.shards}
            hint={`每座每天共鸣 ${formatCredits(config.resonanceReward)} tcr`}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">星图</CardTitle>
          </CardHeader>
          <CardContent>
            <CollectionSky
              initial={snapshot.state}
              constellations={CONSTELLATIONS}
              dailyObserves={config.dailyObserves}
              priceTickets={priceTickets}
              couponTickets={coupon.tickets}
              setRewards={config.setRewards}
              grantedSets={grantedSets}
              resonanceReward={config.resonanceReward}
              today={today}
            />
          </CardContent>
        </Card>

        {couponCard}
        {rulesCard(config, priceTickets)}
      </PageBody>
    </>
  );
}
