"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/usage/meter";
import { checkRateLimit } from "@/lib/rate-limit";
import { getFlipConfig } from "@/lib/flip/settings";
import { flipCard, openRound, type FlipOutcome, type OpenedRound } from "@/lib/flip/store";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

function fail(error: unknown, fallback: string): { success: false; error: string } {
  console.error("[flip] action failed:", error);
  return { success: false, error: error instanceof Error ? error.message : fallback };
}

/** 开一局：扣票价并洗出牌桌。已经握着没翻完的牌时复用那一局，不会再扣一次。 */
export async function openFlipRound(): Promise<ActionResult<OpenedRound>> {
  try {
    const userId = await requireUser();
    if (!(await checkRateLimit(`flip-open:${userId}`, { window: 60_000, limit: 20 }))) {
      return { success: false, error: "操作过于频繁，请稍后再试" };
    }
    const config = await getFlipConfig();
    const data = await openRound(userId, config);
    revalidatePath("/flip");
    revalidatePath("/wallet");
    return { success: true, data };
  } catch (error) {
    return fail(error, "开局失败");
  }
}

/**
 * 翻开一张牌。
 *
 * 返回的 `board` 是本局洗好的牌桌，只在翻开之后才离开服务端；
 * 牌桌在开局那一刻就已写死，客户端在此之前拿不到任何未揭晓的信息。
 */
export async function revealFlipCard(input: {
  roundId: string;
  position: number;
}): Promise<ActionResult<FlipOutcome>> {
  try {
    const userId = await requireUser();
    if (!(await checkRateLimit(`flip-reveal:${userId}`, { window: 60_000, limit: 30 }))) {
      return { success: false, error: "操作过于频繁，请稍后再试" };
    }
    const config = await getFlipConfig();
    const data = await flipCard(userId, String(input.roundId ?? ""), input.position, config);
    revalidatePath("/flip");
    revalidatePath("/wallet");
    return { success: true, data };
  } catch (error) {
    return fail(error, "翻牌失败");
  }
}
