"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/usage/meter";
import { checkRateLimit } from "@/lib/rate-limit";
import { getTrialConfig } from "@/lib/trial/settings";
import {
  buyTrialItem,
  saveTrialRunProgress,
  startTrialRun,
  submitTrialRun,
  type ItemPurchaseResult,
  type StartedTrial,
  type TrialProgressResult,
  type TrialSettlement,
} from "@/lib/trial/store";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

function fail(error: unknown, fallback: string): { success: false; error: string } {
  console.error("[trial] action failed:", error);
  return { success: false, error: error instanceof Error ? error.message : fallback };
}

/** 出城：还没收兵的行军直接复用；出城不花券。 */
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

/** 自动存档：客户端每推进一步就整段回传指令；打完全图会在这一步自动收兵结算。 */
export async function autoSaveTrialAction(input: {
  runId: string;
  commands: unknown[];
}): Promise<ActionResult<TrialProgressResult>> {
  try {
    const userId = await requireUser();
    if (!(await checkRateLimit(`trial-save:${userId}`, { window: 60_000, limit: 80 }))) {
      return { success: false, error: "存档过于频繁，请稍后再试" };
    }
    const config = await getTrialConfig();
    const data = await saveTrialRunProgress({
      userId,
      runId: String(input.runId ?? ""),
      commands: Array.isArray(input.commands) ? input.commands : [],
      config,
    });
    revalidatePath("/trial");
    if (data.settled) revalidatePath("/wallet");
    return { success: true, data };
  } catch (error) {
    return fail(error, "自动存档失败");
  }
}

/** 城内买卖：铁匠铺 / 药铺 / 军需帐 / 客栈 / 训练场都用活动券，购买时实时扣券。 */
export async function buyTrialItemAction(input: {
  runId: string;
  itemId: string;
  purchaseId: string;
  cmdIndex: number;
  generalId?: string;
  targetLevel?: number;
  commands?: unknown[];
}): Promise<ActionResult<ItemPurchaseResult>> {
  try {
    const userId = await requireUser();
    if (!(await checkRateLimit(`trial-shop:${userId}`, { window: 60_000, limit: 40 }))) {
      return { success: false, error: "购买太频繁，请稍后再试" };
    }
    const config = await getTrialConfig();
    const data = await buyTrialItem({
      userId,
      runId: String(input.runId ?? ""),
      itemId: String(input.itemId ?? ""),
      purchaseId: String(input.purchaseId ?? ""),
      cmdIndex: Number(input.cmdIndex) || 0,
      generalId: typeof input.generalId === "string" ? input.generalId : undefined,
      targetLevel: Number(input.targetLevel) || undefined,
      commands: Array.isArray(input.commands) ? input.commands : [],
      config,
    });
    revalidatePath("/trial");
    return { success: true, data };
  } catch (error) {
    return fail(error, "购买失败");
  }
}
