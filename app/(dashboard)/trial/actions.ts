"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/usage/meter";
import { checkRateLimit } from "@/lib/rate-limit";
import { getTrialConfig } from "@/lib/trial/settings";
import {
  startTrialRun,
  submitTrialRun,
  type StartedTrial,
  type TrialSettlement,
} from "@/lib/trial/store";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

function fail(error: unknown, fallback: string): { success: false; error: string } {
  console.error("[trial] action failed:", error);
  return { success: false, error: error instanceof Error ? error.message : fallback };
}

/** 开始一局：没交卷的旧局直接复用，不会重复扣券。 */
export async function startTrialAction(): Promise<ActionResult<StartedTrial>> {
  try {
    const userId = await requireUser();
    if (!(await checkRateLimit(`trial-start:${userId}`, { window: 60_000, limit: 10 }))) {
      return { success: false, error: "操作过于频繁，请稍后再试" };
    }
    const config = await getTrialConfig();
    const data = await startTrialRun(userId, config);
    revalidatePath("/trial");
    return { success: true, data };
  } catch (error) {
    return fail(error, "开始试炼失败");
  }
}

/** 交卷：只上传动作序列，服务端按同一套规则重算战果。 */
export async function submitTrialAction(input: {
  runId: string;
  actions: unknown[];
}): Promise<ActionResult<TrialSettlement>> {
  try {
    const userId = await requireUser();
    if (!(await checkRateLimit(`trial-submit:${userId}`, { window: 60_000, limit: 20 }))) {
      return { success: false, error: "操作过于频繁，请稍后再试" };
    }
    const config = await getTrialConfig();
    const data = await submitTrialRun({
      userId,
      runId: String(input.runId ?? ""),
      actions: Array.isArray(input.actions) ? input.actions : [],
      config,
    });
    revalidatePath("/trial");
    revalidatePath("/wallet");
    return { success: true, data };
  } catch (error) {
    return fail(error, "交卷失败");
  }
}
