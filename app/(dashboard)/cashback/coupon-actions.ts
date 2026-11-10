"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/usage/meter";
import {
  ACTIVITY_KINDS,
  buyCouponPack,
  exchangeCoupon,
  type ActivityKind,
} from "@/lib/activity/coupons";
import { checkRateLimit } from "@/lib/rate-limit";
import { formatAmount, formatTickets } from "@/lib/billing/units";

export type CouponActionResult = { success: true; message: string } | { success: false; message: string };

function parseKind(raw: string): ActivityKind {
  if (!ACTIVITY_KINDS.includes(raw as ActivityKind)) throw new Error("活动类型不正确");
  return raw as ActivityKind;
}

function revalidateCouponPaths() {
  revalidatePath("/cashback");
  revalidatePath("/wallet");
  revalidatePath("/lottery");
  revalidatePath("/flip");
  revalidatePath("/raiden");
}

/** 按活动配置的券单价（1 张 = X cr）整张兑换当期活动券，先临时余额再永久余额。 */
export async function exchangeCouponAction(input: {
  kind: string;
  amount: string;
}): Promise<CouponActionResult> {
  try {
    const userId = await requireUser();
    const kind = parseKind(input.kind);
    if (!(await checkRateLimit(`coupon-exchange:${userId}`, { window: 60_000, limit: 10 }))) {
      return { success: false, message: "操作过于频繁，请稍后再试" };
    }
    const amount = Number(input.amount);
    const result = await exchangeCoupon(userId, kind, amount);
    revalidateCouponPaths();
    return {
      success: true,
      message: `已兑换 ${result.couponName} ${result.tickets} 张`,
    };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "兑换失败" };
  }
}

/** 珍宝礼包：花 cr 买当期活动券，同样先临时余额再永久余额。 */
export async function buyCouponPackAction(input: {
  kind: string;
  pack: string;
}): Promise<CouponActionResult> {
  try {
    const userId = await requireUser();
    const kind = parseKind(input.kind);
    if (!(await checkRateLimit(`coupon-pack:${userId}`, { window: 60_000, limit: 10 }))) {
      return { success: false, message: "操作过于频繁，请稍后再试" };
    }
    const result = await buyCouponPack(userId, kind, input.pack);
    revalidateCouponPaths();
    const bonusParts: string[] = [];
    if (result.bonusTickets > 0) bonusParts.push(`含赠 ${result.bonusTickets} 张`);
    if (result.tempCredits > 0) {
      bonusParts.push(`赠 ${formatAmount(result.tempCredits)} tcr（${result.tempValidDays} 天）`);
    }
    const bonusText = bonusParts.length > 0 ? `，${bonusParts.join("、")}` : "";
    return {
      success: true,
      message: `已购买礼包：${result.couponName} +${formatTickets(result.tickets)} 张${bonusText}，实付 ${formatAmount(result.price)} cr`,
    };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "购买失败" };
  }
}
