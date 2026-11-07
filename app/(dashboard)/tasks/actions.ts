"use server";

import { revalidatePath } from "next/cache";
import { claimTask, type TaskPeriod } from "@/lib/tasks/tasks";
import { getTaskSettings } from "@/lib/settings";
import { requireUser } from "@/lib/usage/meter";

/** 领取任务活跃度。重复领取由 `uq_activity_task_claim` 挡下，服务端还会重算一次进度。 */
export async function claimTaskAction(input: {
  period: TaskPeriod;
  key: string;
}): Promise<{ success: boolean; message: string; points: number | null }> {
  try {
    if (input.period !== "daily" && input.period !== "weekly") {
      throw new Error("任务周期不正确");
    }
    const userId = await requireUser();
    const settings = await getTaskSettings();
    const result = await claimTask(userId, input.period, input.key, settings);

    revalidatePath("/tasks");
    revalidatePath("/messages");
    const milestoneText =
      result.milestones.length > 0
        ? `，里程碑奖励 ${result.milestones.join("、")} 已发站内信`
        : "";
    return {
      success: true,
      message: `「${result.title}」+${result.points} 活跃度，本期共 ${result.activityPoints}${milestoneText}`,
      points: result.points,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "领取失败";
    return {
      success: false,
      message: message === "Unauthorized" ? "请先登录" : message,
      points: null,
    };
  }
}
