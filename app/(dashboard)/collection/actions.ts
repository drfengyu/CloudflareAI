"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/usage/meter";
import { checkRateLimit } from "@/lib/rate-limit";
import { isBrightness, isStarColor } from "@/lib/collection/config";
import { getCollectionConfig } from "@/lib/collection/settings";
import {
  claimCollectionMilestones,
  claimCollectionResonance,
  craftStarStone,
  meltStarStone,
  observeSky,
  placeCollectionStar,
  type CollectionActionResult,
  type ObserveResult,
  type PlaceStarResult,
  type ResonanceResult,
} from "@/lib/collection/store";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

function fail(error: unknown, fallback: string): { success: false; error: string } {
  console.error("[collection] action failed:", error);
  return { success: false, error: error instanceof Error ? error.message : fallback };
}

/** 观星：扣一次券，抽一颗星石。 */
export async function observeSkyAction(): Promise<ActionResult<ObserveResult>> {
  try {
    const userId = await requireUser();
    if (!(await checkRateLimit(`collection-observe:${userId}`, { window: 60_000, limit: 60 }))) {
      return { success: false, error: "操作过于频繁，请稍后再试" };
    }
    const config = await getCollectionConfig();
    const data = await observeSky(userId, config);
    revalidatePath("/collection");
    revalidatePath("/wallet");
    return { success: true, data };
  } catch (error) {
    return fail(error, "观星失败");
  }
}

/** 把一颗星石嵌进星位。 */
export async function placeStarAction(input: {
  nodeId: string;
}): Promise<ActionResult<PlaceStarResult>> {
  try {
    const userId = await requireUser();
    if (!(await checkRateLimit(`collection-place:${userId}`, { window: 60_000, limit: 120 }))) {
      return { success: false, error: "操作过于频繁，请稍后再试" };
    }
    const config = await getCollectionConfig();
    const data = await placeCollectionStar(userId, String(input.nodeId ?? ""), config);
    revalidatePath("/collection");
    revalidatePath("/wallet");
    return { success: true, data };
  } catch (error) {
    return fail(error, "点亮失败");
  }
}

/** 熔炼一颗星石换星辉。 */
export async function meltStarAction(input: {
  color: string;
  brightness: number;
}): Promise<ActionResult<CollectionActionResult & { shardsGained: number }>> {
  try {
    const userId = await requireUser();
    if (!(await checkRateLimit(`collection-melt:${userId}`, { window: 60_000, limit: 60 }))) {
      return { success: false, error: "操作过于频繁，请稍后再试" };
    }
    if (!isStarColor(input.color) || !isBrightness(input.brightness)) {
      return { success: false, error: "星石颜色或亮度无效" };
    }
    const config = await getCollectionConfig();
    const data = await meltStarStone(userId, input.color, input.brightness, config);
    revalidatePath("/collection");
    return { success: true, data };
  } catch (error) {
    return fail(error, "熔炼失败");
  }
}

/** 用星辉定向凝出一颗星石。 */
export async function craftStarAction(input: {
  color: string;
  brightness: number;
}): Promise<ActionResult<CollectionActionResult & { shardsSpent: number }>> {
  try {
    const userId = await requireUser();
    if (!(await checkRateLimit(`collection-craft:${userId}`, { window: 60_000, limit: 60 }))) {
      return { success: false, error: "操作过于频繁，请稍后再试" };
    }
    if (!isStarColor(input.color) || !isBrightness(input.brightness)) {
      return { success: false, error: "星石颜色或亮度无效" };
    }
    const config = await getCollectionConfig();
    const data = await craftStarStone(userId, input.color, input.brightness, config);
    revalidatePath("/collection");
    return { success: true, data };
  } catch (error) {
    return fail(error, "凝星失败");
  }
}

/** 每日共鸣：按已点亮星座领一次 tcr。 */
export async function claimResonanceAction(): Promise<ActionResult<ResonanceResult>> {
  try {
    const userId = await requireUser();
    if (!(await checkRateLimit(`collection-resonance:${userId}`, { window: 60_000, limit: 10 }))) {
      return { success: false, error: "操作过于频繁，请稍后再试" };
    }
    const config = await getCollectionConfig();
    const data = await claimCollectionResonance(userId, config);
    revalidatePath("/collection");
    revalidatePath("/wallet");
    return { success: true, data };
  } catch (error) {
    return fail(error, "共鸣失败");
  }
}

/** 补领已完成但还没发出的星座奖励。 */
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
