import { Coins, Library, PackageOpen, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageBody } from "@/components/dashboard/section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollectionAlbum } from "@/components/collection/album";
import { CouponCount } from "@/components/activity/coupon-badge";
import { CouponShop } from "@/components/activity/coupon-shop";
import { formatCredits } from "@/lib/billing/credits";
import { getActivityCouponView } from "@/lib/activity/coupons";
import { listGrantedMilestones } from "@/lib/activity/rewards";
import { ticketsForCost } from "@/lib/activity/ticket-math";
import { requireUser } from "@/lib/usage/meter";
import {
  COLLECTION_SETS,
  collectionActivityKey,
  collectionActivityWindow,
  type CollectionConfig,
} from "@/lib/collection/config";
import { getCollectionConfig } from "@/lib/collection/settings";
import { getCollectionSnapshot, type CollectionSnapshot } from "@/lib/collection/store";

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

function rulesCard(config: CollectionConfig, priceTickets: number) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">规则</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            开一次星匣花 <CouponCount kind="collection" count={priceTickets} />（1 张 ={" "}
            {formatCredits(config.couponUnitCredits)} cr 券面），先等概率抽三个星匣之一，再按权重抽其中一件藏品。
          </li>
          <li>
            抽到重复藏品折算 {config.duplicateDust} 星尘；{config.dustPerItem} 星尘可定向兑换任意未收集的藏品，
            不会抽到已收录的那件。
          </li>
          <li>
            集齐一个星匣发一次 tcr：
            {COLLECTION_SETS.map((set) => {
              const reward = config.setRewards.find((item) => item.set === set.key)?.reward ?? 0;
              return ` ${set.name} ${formatCredits(reward)} tcr`;
            }).join("，")}
            ；奖励 {config.rewardValidDays} 天内有效。
          </li>
          <li>每日最多开 {config.dailyBoxes} 次（北京时间自然日）；当期结束后未集齐的进度不跨期保留。</li>
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
  const priceTickets = ticketsForCost(config.openCostCredits, config.couponUnitCredits);

  const [snapshot, granted]: [CollectionSnapshot, Set<string>] = activityKey
    ? await Promise.all([
        getCollectionSnapshot(userId, activityKey),
        listGrantedMilestones(userId, "collection", activityKey),
      ])
    : [{ version: 0, state: { day: "", boxesToday: 0, dust: 0, owned: [] } }, new Set<string>()];

  const grantedSets = COLLECTION_SETS.filter((set) => granted.has(`set:${set.key}`)).map(
    (set) => set.key,
  );
  const ownedCount = snapshot.state.owned.length;

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
        ? { title: "活动未开启", hint: "管理员在「系统设置 → 限时活动（星匣图鉴）」中开启后会在这里显示。" }
        : windowInfo.status === "pending"
          ? { title: "活动尚未开始", hint: `开始时间（北京时间）：${config.startAt || "未设置"}。` }
          : { title: "活动已结束", hint: `结束时间（北京时间）：${config.endAt || "未设置"}。` };
    return (
      <>
        <PageHeader title="星匣图鉴" description="开匣收集 · 星尘补缺 · 集齐整册" />
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
      <PageHeader title="星匣图鉴" description="开匣收集 · 星尘补缺 · 集齐整册" />
      <PageBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            icon={PackageOpen}
            label="今日开匣"
            value={`${snapshot.state.boxesToday} / ${config.dailyBoxes}`}
            hint="每日 0 点重置"
          />
          <Stat
            icon={Coins}
            label="单次开匣"
            value={<CouponCount kind="collection" count={priceTickets} iconClassName="h-4 w-4" />}
            hint={`1 张 = ${formatCredits(config.couponUnitCredits)} cr 券面`}
          />
          <Stat
            icon={Library}
            label="已收录藏品"
            value={`${ownedCount} / ${COLLECTION_SETS.reduce((sum, set) => sum + set.items.length, 0)}`}
            hint={`星尘 ${snapshot.state.dust} · 可定向补缺`}
          />
          <Stat
            icon={Sparkles}
            label="可用星匣券"
            value={<CouponCount kind="collection" count={coupon.tickets} iconClassName="h-4 w-4" />}
            hint="开匣只扣当期星匣券"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">图鉴</CardTitle>
          </CardHeader>
          <CardContent>
            <CollectionAlbum
              initial={snapshot.state}
              sets={COLLECTION_SETS}
              dailyBoxes={config.dailyBoxes}
              priceTickets={priceTickets}
              couponTickets={coupon.tickets}
              dustPerItem={config.dustPerItem}
              duplicateDust={config.duplicateDust}
              setRewards={config.setRewards}
              grantedSets={grantedSets}
            />
          </CardContent>
        </Card>

        {couponCard}
        {rulesCard(config, priceTickets)}
      </PageBody>
    </>
  );
}
