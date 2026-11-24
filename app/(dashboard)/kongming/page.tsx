import type { Metadata } from "next";
import { auth } from "@/auth";
import KongmingGame from "@/components/kongming/kongming-game";
import { getActivityCouponView } from "@/lib/activity/coupons";
import { getKongmingActivityConfig } from "@/lib/kongming/activity-settings";

export const metadata: Metadata = {
  title: "诸葛孔明传 · 吞食天地２怀旧版",
  description: "按 Windows 桌面端全量复刻的《诸葛孔明传》，WASD 移动、J 确认、K 取消。",
};

export const dynamic = "force-dynamic";

export default async function KongmingPage() {
  const session = await auth();
  const userId = session?.user?.id;
  const [config, activity] = await Promise.all([
    getKongmingActivityConfig(),
    userId ? getActivityCouponView(userId, "kongming") : Promise.resolve(null),
  ]);

  return (
    <KongmingGame
      activity={activity}
      goldPerCoupon={config.goldPerCoupon}
      maxCouponsPerExchange={config.maxCouponsPerExchange}
      goldPerTcr={config.goldPerTcr}
      maxGoldPerTcrDaily={config.maxGoldPerTcrDaily}
      tcrValidDays={config.tcrValidDays}
    />
  );
}
