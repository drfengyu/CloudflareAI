"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/usage/meter";
import { checkRateLimit } from "@/lib/rate-limit";
import { getTrialConfig } from "@/lib/trial/settings";
import {
  buyTrialGold,
  buyTrialSupply,
  startTrialRun,
  submitTrialRun,
  type GoldPurchaseResult,
  type StartedTrial,
  type SupplyPurchaseResult,
  type TrialSettlement,
} from "@/lib/trial/store";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

function fail(error: unknown, fallback: string): { success: false; error: string } {
  console.error("[trial] action failed:", error);
  return { success: false, error: error instanceof Error ? error.message : fallback };
}

/** 出城：还没收兵的行军直接复用，不会重复扣券。 */
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
    return fail(error, "出城失败");
  }
}

/** 收兵：只上传编制/购物/战斗指令，服务端按种子重放并写入剧情进度。 */
export async function submitTrialAction(input: {
  runId: string;
  commands: unknown[];
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
      commands: Array.isArray(input.commands) ? input.commands : [],
      config,
    });
    revalidatePath("/trial");
    revalidatePath("/wallet");
    return { success: true, data };
  } catch (error) {
    return fail(error, "收兵失败");
  }
}

/** 行军军需：扣活动券，把购买记进这次行军。 */
export async function buyTrialSupplyAction(input: {
  runId: string;
  itemId: string;
  purchaseId: string;
  cmdIndex: number;
}): Promise<ActionResult<SupplyPurchaseResult>> {
  try {
    const userId = await requireUser();
    if (!(await checkRateLimit(`trial-shop:${userId}`, { window: 60_000, limit: 40 }))) {
      return { success: false, error: "购买太频繁，请稍后再试" };
    }
    const config = await getTrialConfig();
    const data = await buyTrialSupply({
      userId,
      runId: String(input.runId ?? ""),
      itemId: String(input.itemId ?? ""),
      purchaseId: String(input.purchaseId ?? ""),
      cmdIndex: Number(input.cmdIndex) || 0,
      config,
    });
    revalidatePath("/trial");
    return { success: true, data };
  } catch (error) {
    return fail(error, "购买失败");
  }
}

/** 钱庄换金：按出城时冻结的汇率扣 tcr，金币记进这次行军。 */
export async function buyTrialGoldAction(input: {
  runId: string;
  tcr: number;
  purchaseId: string;
  cmdIndex: number;
}): Promise<ActionResult<GoldPurchaseResult>> {
  try {
    const userId = await requireUser();
    if (!(await checkRateLimit(`trial-gold:${userId}`, { window: 60_000, limit: 20 }))) {
      return { success: false, error: "换金太频繁，请稍后再试" };
    }
    const config = await getTrialConfig();
    const data = await buyTrialGold({
      userId,
      runId: String(input.runId ?? ""),
      tcr: Number(input.tcr) || 0,
      purchaseId: String(input.purchaseId ?? ""),
      cmdIndex: Number(input.cmdIndex) || 0,
      config,
    });
    revalidatePath("/trial");
    revalidatePath("/wallet");
    return { success: true, data };
  } catch (error) {
    return fail(error, "换金失败");
  }
}
