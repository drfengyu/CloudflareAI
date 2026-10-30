"use server";

import { revalidatePath } from "next/cache";
import { claimTask } from "@/lib/tasks/tasks";
import { getTaskSettings } from "@/lib/settings";
import { requireUser } from "@/lib/usage/meter";

/** 领取一次性任务奖励。重复领取由 `uq_user_task` 挡下，服务端还会重算一次进度。 */
export async function claimTaskAction(input: {
  key: string;
}): Promise<{ success: boolean; message: string; reward: number | null }> {
  try {
    const userId = await requireUser();
    const settings = await getTaskSettings();
    const { reward, title } = await claimTask(userId, input.key, settings);

    revalidatePath("/tasks");
    revalidatePath("/wallet");
    return { success: true, message: `「${title}」已到账 ${reward.toFixed(2)} cr`, reward };
  } catch (err) {
    const message = err instanceof Error ? err.message : "领取失败";
    return {
      success: false,
      message: message === "Unauthorized" ? "请先登录" : message,
      reward: null,
    };
  }
}
