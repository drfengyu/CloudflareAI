"use server";

import { revalidatePath } from "next/cache";
import { issueCashbackReward } from "@/lib/cashback/claims";
import { issueRechargeTierReward } from "@/lib/rewards/claims";
import { getCashbackSettings } from "@/lib/settings";
import { requireUser } from "@/lib/usage/meter";

function failureMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : "发放失败";
  return message === "Unauthorized" ? "请先登录" : message;
}

function revalidateRewardPages() {
  revalidatePath("/cashback");
  revalidatePath("/messages");
}

/** 把某一档充值奖励发到站内信；资格由服务端按累计实付重新校验。 */
export async function sendRechargeTierRewardAction(input: {
  tierKey: string;
}): Promise<{ success: boolean; message: string; reward: number | null }> {
  try {
    const userId = await requireUser();
    const result = await issueRechargeTierReward(userId, input.tierKey);
    revalidateRewardPages();
    return {
      success: true,
      message: `${result.reward.toFixed(2)} cr 已发放到站内信，请前往领取`,
      reward: result.reward,
    };
  } catch (err) {
    return { success: false, message: failureMessage(err), reward: null };
  }
}

/** 把某一天的消费返利发到站内信；重复点击由 reward_claim 唯一索引挡下。 */
export async function sendCashbackRewardAction(input: {
  date: string;
}): Promise<{ success: boolean; message: string; reward: number | null }> {
  try {
    const userId = await requireUser();
    const settings = await getCashbackSettings();
    const result = await issueCashbackReward(userId, input.date, settings);
    revalidateRewardPages();
    return {
      success: true,
      message: `${result.reward.toFixed(2)} cr 已发放到站内信，请前往领取`,
      reward: result.reward,
    };
  } catch (err) {
    return { success: false, message: failureMessage(err), reward: null };
  }
}