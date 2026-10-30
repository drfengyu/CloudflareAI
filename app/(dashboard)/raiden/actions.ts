"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/usage/meter";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRaidenConfig } from "@/lib/raiden/settings";
import {
  completeStage,
  endRun,
  reviveRun,
  startRun,
  type ReviveResult,
  type StageSettlement,
  type StartedRun,
} from "@/lib/raiden/store";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

function fail(error: unknown, fallback: string): { success: false; error: string } {
  console.error("[raiden] action failed:", error);
  return { success: false, error: error instanceof Error ? error.message : fallback };
}

/** 出击：买装备、开一局，返回本局初始数值。 */
export async function startRaidenRun(rawLoadout: unknown): Promise<ActionResult<StartedRun>> {
  try {
    const userId = await requireUser();
    if (!(await checkRateLimit(`raiden-start:${userId}`, { window: 60_000, limit: 6 }))) {
      return { success: false, error: "操作过于频繁，请稍后再试" };
    }
    const config = await getRaidenConfig();
    const data = await startRun(userId, rawLoadout, config);
    revalidatePath("/raiden");
    revalidatePath("/wallet");
    return { success: true, data };
  } catch (error) {
    return fail(error, "出击失败");
  }
}

/**
 * 通关结算。`durationMs` 只用于记录；服务端按自己的 `lastSettleAt` 判断真实用时，
 * 客户端传什么都不会让一关在 30 秒内结算成功。
 */
export async function settleRaidenStage(input: {
  runId: string;
  stageNo: number;
  score: number;
  durationMs: number;
  loot: number;
}): Promise<ActionResult<StageSettlement>> {
  try {
    const userId = await requireUser();
    if (!(await checkRateLimit(`raiden-settle:${userId}`, { window: 60_000, limit: 12 }))) {
      return { success: false, error: "操作过于频繁，请稍后再试" };
    }
    const config = await getRaidenConfig();
    const data = await completeStage({
      userId,
      runId: String(input.runId ?? ""),
      stageNo: Number(input.stageNo),
      score: Number(input.score),
      durationMs: Number(input.durationMs),
      loot: Number(input.loot),
      config,
    });
    revalidatePath("/raiden");
    revalidatePath("/wallet");
    return { success: true, data };
  } catch (error) {
    return fail(error, "结算失败");
  }
}

/** 阵亡后付费复活。 */
export async function reviveRaidenRun(runId: string): Promise<ActionResult<ReviveResult>> {
  try {
    const userId = await requireUser();
    if (!(await checkRateLimit(`raiden-revive:${userId}`, { window: 60_000, limit: 6 }))) {
      return { success: false, error: "操作过于频繁，请稍后再试" };
    }
    const config = await getRaidenConfig();
    const data = await reviveRun(userId, String(runId ?? ""), config);
    revalidatePath("/raiden");
    revalidatePath("/wallet");
    return { success: true, data };
  } catch (error) {
    return fail(error, "复活失败");
  }
}

/** 结束本局（阵亡不复活 / 主动退出），未通关的分数与奖励一概不结算。 */
export async function endRaidenRun(
  runId: string,
  status: "failed" | "abandoned",
): Promise<ActionResult<{ ended: boolean }>> {
  try {
    const userId = await requireUser();
    if (!(await checkRateLimit(`raiden-end:${userId}`, { window: 60_000, limit: 20 }))) {
      return { success: false, error: "操作过于频繁，请稍后再试" };
    }
    const ended = await endRun(userId, String(runId ?? ""), status === "abandoned" ? "abandoned" : "failed");
    if (ended) revalidatePath("/raiden");
    return { success: true, data: { ended } };
  } catch (error) {
    return fail(error, "结束对局失败");
  }
}
