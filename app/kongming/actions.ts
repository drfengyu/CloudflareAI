"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, sql } from "drizzle-orm";
import { exchangeCoupon, getActivityCouponView, payWithCoupon } from "@/lib/activity/coupons";
import { grantTempCredits } from "@/lib/activity/rewards";
import { db } from "@/lib/db/d1-http";
import { topups } from "@/lib/db/schema";
import { cnStartOfToday } from "@/lib/date";
import {
  KONGMING_TCR_TOPUP_TYPE,
  type KongmingActivityConfig,
} from "@/lib/kongming/activity-config";
import { getKongmingActivityConfig } from "@/lib/kongming/activity-settings";
import { requireUser } from "@/lib/usage/meter";

export interface KongmingCouponBuyResult {
  success: boolean;
  message: string;
  /** 本次到账张数。 */
  tickets?: number;
  /** 结算后的可用整张数；用于游戏内面板即时刷新。 */
  remainingTickets?: number;
  couponName?: string;
}

/**
 * 券房 NPC 购买当期孔明券：按活动券面单价走 `exchangeCoupon`，先扣 tcr 再扣 cr。
 * 与活动页 [`buyCouponPack`] 不同，这里只做整张直购，不读取礼包倍率。
 */
export async function buyKongmingCouponsAction(input: {
  tickets: number;
}): Promise<KongmingCouponBuyResult> {
  try {
    const userId = await requireUser();
    const config = await getKongmingActivityConfig();
    const activity = await getActivityCouponView(userId, "kongming");
    const tickets = Math.trunc(Number(input.tickets));
    if (!Number.isFinite(tickets) || tickets <= 0) {
      return { success: false, message: "请输入要购买的整张数" };
    }
    if (tickets > config.maxCouponsPerExchange) {
      return {
        success: false,
        message: `单次最多购买 ${config.maxCouponsPerExchange} 张`,
      };
    }
    const result = await exchangeCoupon(userId, "kongming", tickets);
    revalidatePath("/kongming");
    return {
      success: true,
      message: `已购入 ${tickets} 张${result.couponName}`,
      tickets,
      remainingTickets: activity.tickets + tickets,
      couponName: result.couponName,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "购券失败",
    };
  }
}

export interface KongmingTcrExchangeResult {
  success: boolean;
  message: string;
  /** 实际从游戏存档扣除的金；按整 tcr 抹零。 */
  gold?: number;
  /** 本次到账的 tcr，有效期内可抵 cr。 */
  tcr?: number;
  /** 今日还可用多少金换 tcr。 */
  remainingGold?: number;
}

/**
 * 券房 NPC 军资换 tcr：游戏币在浏览器存档里，服务端无法核验真实余额，
 * 因此按每日上限封顶，超限直接拒绝；档位必须命中后台 `goldTcrOffers`。
 * 客户端只有在服务端成功后才会扣存档金，避免「扣了金没到账」。
 */
export async function exchangeKongmingGoldForTcrAction(input: {
  offerIndex: number;
}): Promise<KongmingTcrExchangeResult> {
  try {
    const userId = await requireUser();
    const config: KongmingActivityConfig = await getKongmingActivityConfig();
    const activity = await getActivityCouponView(userId, "kongming");
    if (activity.status !== "active") {
      return { success: false, message: "孔明传活动未开启或不在活动期内" };
    }
    const offer = config.goldTcrOffers[Math.trunc(Number(input.offerIndex))];
    if (!offer) return { success: false, message: "商品档位不存在，请刷新页面" };
    const gold = offer.gold;
    const tcr = offer.tcr;
    if (!Number.isFinite(gold) || gold <= 0 || tcr <= 0) {
      return { success: false, message: "商品档位无效，请刷新页面" };
    }
    const rate = Math.max(1, config.goldPerTcr);
    const daily = Math.max(0, config.maxGoldPerTcrDaily);

    const rows = await db
      .select({ total: sql<number>`COALESCE(SUM(${topups.amount}), 0)` })
      .from(topups)
      .where(
        and(
          eq(topups.userId, userId),
          eq(topups.type, KONGMING_TCR_TOPUP_TYPE),
          gte(topups.createdAt, cnStartOfToday()),
        ),
      )
      .catch(() => []);
    const usedTcr = Number(rows[0]?.total ?? 0);
    const usedGold = Math.round(usedTcr * rate);
    const remainingGold = Math.max(0, daily - usedGold);
    if (gold > remainingGold) {
      return {
        success: false,
        message: `今日军资兑换上限 ${daily} 金，还剩 ${remainingGold} 金`,
        remainingGold,
      };
    }

    await grantTempCredits({
      userId,
      amount: tcr,
      topupType: KONGMING_TCR_TOPUP_TYPE,
      description: `诸葛孔明传军资兑换：${gold} 金 → ${tcr} tcr`,
      validDays: config.tcrValidDays,
    });
    revalidatePath("/kongming");
    return {
      success: true,
      message: `已用 ${gold} 金换得 ${tcr} tcr（${config.tcrValidDays} 天内有效）`,
      gold,
      tcr,
      remainingGold: Math.max(0, remainingGold - gold),
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "兑换失败",
    };
  }
}

export interface KongmingGoldRedeemResult {
  success: boolean;
  message: string;
  /** 本次实际发放的游戏内「金」。 */
  gold?: number;
  /** 本次扣掉的当期活动券张数。 */
  tickets?: number;
  /** 结算后剩余的当期活动券张数，界面直接刷新。 */
  remaining?: number;
}

/**
 * 把当期孔明券换成《诸葛孔明传》存档里的金。
 *
 * 券在服务端扣减（`payWithCoupon` 只动当期 `activity_coupon`），金由客户端
 * 写进 localStorage 存档。档位必须命中后台 `couponGoldOffers`，客户端不能
 * 自带价格。
 */
export async function redeemKongmingGoldAction(input: {
  offerIndex: number;
}): Promise<KongmingGoldRedeemResult> {
  try {
    const userId = await requireUser();
    const config = await getKongmingActivityConfig();
    const activity = await getActivityCouponView(userId, "kongming");
    if (activity.status !== "active" || !activity.activityKey) {
      return { success: false, message: "孔明传活动未开启或不在活动期内" };
    }
    const offer = config.couponGoldOffers[Math.trunc(Number(input.offerIndex))];
    if (!offer) return { success: false, message: "商品档位不存在，请刷新页面" };
    const tickets = offer.tickets;
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

    revalidatePath("/kongming");
    return {
      success: true,
      message: `已用 ${tickets} 张${activity.couponName}换得 ${offer.gold} 金`,
      gold: offer.gold,
      tickets,
      remaining: activity.tickets - tickets,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "兑换失败",
    };
  }
}
