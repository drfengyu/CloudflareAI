"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/usage/meter";
import { checkRateLimit } from "@/lib/rate-limit";
import { getWorkshopConfig } from "@/lib/workshop/settings";
import {
  claimWorkshopMilestones,
  gatherWorkshop,
  mergeWorkshop,
  type WorkshopActionResult,
} from "@/lib/workshop/store";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

function fail(error: unknown, fallback: string): { success: false; error: string } {
  console.error("[workshop] action failed:", error);
  return { success: false, error: error instanceof Error ? error.message : fallback };
}

/** 采集一次：花一张券的票面，随机得到 1~3 阶灵宠。 */
export async function gatherWorkshopAction(
  lineKey: string,
): Promise<ActionResult<WorkshopActionResult>> {
  try {
    const userId = await requireUser();
    if (!(await checkRateLimit(`workshop-gather:${userId}`, { window: 60_000, limit: 60 }))) {
      return { success: false, error: "操作过于频繁，请稍后再试" };
    }
    const config = await getWorkshopConfig();
    const data = await gatherWorkshop(userId, String(lineKey ?? ""), config);
    revalidatePath("/workshop");
    revalidatePath("/wallet");
    return { success: true, data };
  } catch (error) {
    return fail(error, "采集失败");
  }
}

/** 合成两只同阶；不花券，只推进养成进度。 */
export async function mergeWorkshopAction(input: {
  lineKey: string;
  tier: number;
}): Promise<ActionResult<WorkshopActionResult>> {
  try {
    const userId = await requireUser();
    if (!(await checkRateLimit(`workshop-merge:${userId}`, { window: 60_000, limit: 90 }))) {
      return { success: false, error: "操作过于频繁，请稍后再试" };
    }
    const config = await getWorkshopConfig();
    const data = await mergeWorkshop(userId, String(input.lineKey ?? ""), input.tier, config);
    revalidatePath("/workshop");
    return { success: true, data };
  } catch (error) {
    return fail(error, "合成失败");
  }
}

/** 补领已达成但还没发出的里程碑。 */
export async function claimWorkshopMilestonesAction(): Promise<
  ActionResult<{ reward: number; tiers: number[] }>
> {
  try {
    const userId = await requireUser();
    const config = await getWorkshopConfig();
    const data = await claimWorkshopMilestones(userId, config);
    revalidatePath("/workshop");
    revalidatePath("/wallet");
    return { success: true, data: { reward: data.reward, tiers: data.tiers } };
  } catch (error) {
    return fail(error, "领取失败");
  }
}
