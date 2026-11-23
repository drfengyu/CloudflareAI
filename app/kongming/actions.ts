"use server";

import { revalidatePath } from "next/cache";
import { getActivityCouponView, payWithCoupon } from "@/lib/activity/coupons";
import { getKongmingActivityConfig } from "@/lib/kongming/activity-settings";
import { requireUser } from "@/lib/usage/meter";

export interface KongmingGoldRedeemResult {
  success: boolean;
  message: string;
  /** 本次实际发放的游戏内「金」。 */
  gold?: number;
  /** 结算后剩余的当期活动券张数，界面直接刷新。 */
  remaining?: number;
}

/**
 * 把当期孔明券换成《诸葛孔明传》存档里的金。
 *
 * 券在服务端扣减（`payWithCoupon` 只动当期 `activity_coupon`），金由客户端
 * 写进 localStorage 存档；兑换比例与单次上限取自 `kongming_config`。
 */
export async function redeemKongmingGoldAction(input: {
  tickets: number;
}): Promise<KongmingGoldRedeemResult> {
  try {
    const userId = await requireUser();
    const config = await getKongmingActivityConfig();
    const activity = await getActivityCouponView(userId, "kongming");
    if (activity.status !== "active" || !activity.activityKey) {
      return { success: false, message: "孔明传活动未开启或不在活动期内" };
    }
    const tickets = Math.trunc(Number(input.tickets));
    if (!Number.isFinite(tickets) || tickets <= 0) {
      return { success: false, message: "请输入要兑换的整张数" };
    }
    if (tickets > config.maxCouponsPerExchange) {
      return {
        success: false,
        message: `单次最多兑换 ${config.maxCouponsPerExchange} 张`,
      };
    }

    const unit = activity.unitCredits > 0 ? activity.unitCredits : 1;
    const cost = Math.round(tickets * unit * 100) / 100;
    const paid = await payWithCoupon(userId, "kongming", activity.activityKey, cost, unit);
    if (!paid.ok) return { success: false, message: paid.reason };

    const gold = tickets * config.goldPerCoupon;
    revalidatePath("/kongming");
    return {
      success: true,
      message: `已用 ${tickets} 张${activity.couponName}换得 ${gold} 金`,
      gold,
      remaining: activity.tickets - tickets,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "兑换失败",
    };
  }
}
