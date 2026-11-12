"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/usage/meter";
import { checkRateLimit } from "@/lib/rate-limit";
import { getCollectionConfig } from "@/lib/collection/settings";
import {
  claimCollectionMilestones,
  openCollectionBox,
  redeemCollectionItem,
  type CollectionActionResult,
  type OpenBoxResult,
} from "@/lib/collection/store";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

function fail(error: unknown, fallback: string): { success: false; error: string } {
  console.error("[collection] action failed:", error);
  return { success: false, error: error instanceof Error ? error.message : fallback };
}

/** 开一个星匣：扣一张券的票面，重复藏品折算星尘。 */
export async function openCollectionBoxAction(): Promise<ActionResult<OpenBoxResult>> {
  try {
    const userId = await requireUser();
    if (!(await checkRateLimit(`collection-open:${userId}`, { window: 60_000, limit: 60 }))) {
      return { success: false, error: "操作过于频繁，请稍后再试" };
    }
    const config = await getCollectionConfig();
    const data = await openCollectionBox(userId, config);
    revalidatePath("/collection");
    revalidatePath("/wallet");
    return { success: true, data };
  } catch (error) {
    return fail(error, "开匣失败");
  }
}

/** 星尘定向兑换一件未收集的藏品。 */
export async function redeemCollectionAction(input: {
  setId: string;
  itemKey: string;
}): Promise<ActionResult<CollectionActionResult & { setKey: string; itemKey: string }>> {
  try {
    const userId = await requireUser();
    if (!(await checkRateLimit(`collection-redeem:${userId}`, { window: 60_000, limit: 30 }))) {
      return { success: false, error: "操作过于频繁，请稍后再试" };
    }
    const config = await getCollectionConfig();
    const data = await redeemCollectionItem(
      userId,
      String(input.setId ?? ""),
      String(input.itemKey ?? ""),
      config,
    );
    revalidatePath("/collection");
    return { success: true, data };
  } catch (error) {
    return fail(error, "兑换失败");
  }
}

/** 补领已集齐但还没发出的星匣奖励。 */
export async function claimCollectionMilestonesAction(): Promise<
  ActionResult<{ reward: number; sets: string[] }>
> {
  try {
    const userId = await requireUser();
    const config = await getCollectionConfig();
    const data = await claimCollectionMilestones(userId, config);
    revalidatePath("/collection");
    revalidatePath("/wallet");
    return { success: true, data: { reward: data.reward, sets: data.sets } };
  } catch (error) {
    return fail(error, "领取失败");
  }
}
