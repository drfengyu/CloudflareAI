"use server";

import { revalidatePath } from "next/cache";
import { claimCashback } from "@/lib/cashback/claims";
import { getCashbackSettings } from "@/lib/settings";
import { requireUser } from "@/lib/usage/meter";

/** 领取某个已结束自然日的消费返利。重复领取由 `uq_cashback_claim` 挡下。 */
export async function claimCashbackAction(input: {
  date: string;
}): Promise<{ success: boolean; message: string; reward: number | null }> {
  try {
    const userId = await requireUser();
    const settings = await getCashbackSettings();
    const { reward } = await claimCashback(userId, input.date, settings);

    revalidatePath("/cashback");
    revalidatePath("/wallet");
    return { success: true, message: `已领取 ${reward.toFixed(2)} cr`, reward };
  } catch (err) {
    const message = err instanceof Error ? err.message : "领取失败";
    return { success: false, message: message === "Unauthorized" ? "请先登录" : message, reward: null };
  }
}
