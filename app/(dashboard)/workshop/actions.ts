"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/usage/meter";
import { checkRateLimit } from "@/lib/rate-limit";
import { getWorkshopConfig } from "@/lib/workshop/settings";
import type { WorkshopBattleAction } from "@/lib/workshop/battle";
import type { WorkshopWalkPath } from "@/lib/workshop/run";
import {
  battleWorkshop,
  buyWorkshopShopItem,
  challengeWorkshopGym,
  chooseWorkshopStarter,
  claimWorkshopMilestones,
  enterWorkshopField,
  leaveWorkshopField,
  mergeWorkshop,
  moveWorkshopPet,
  restWorkshopParty,
  setWorkshopActivePet,
  drinkWorkshopPotion,
  walkWorkshopField,
  type WorkshopActionResult,
  type WorkshopBattleActionResult,
  type WorkshopRestResult,
  type WorkshopShopResult,
  type WorkshopWalkActionResult,
} from "@/lib/workshop/store";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

function fail(error: unknown, fallback: string): { success: false; error: string } {
  console.error("[workshop] action failed:", error);
  return { success: false, error: error instanceof Error ? error.message : fallback };
}

function normalizeBattleAction(raw: unknown): WorkshopBattleAction {
  const it = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  switch (it.kind) {
    case "move":
      if (it.moveId === "tackle" || it.moveId === "signature") {
        return { kind: "move", moveId: it.moveId };
      }
      break;
    case "switch":
      if (typeof it.petId === "string" && it.petId.trim()) {
        return { kind: "switch", petId: it.petId.trim() };
      }
      break;
    case "guard":
    case "ball":
    case "potion":
    case "run":
      return { kind: it.kind };
  }
  throw new Error("无效的战斗操作");
}

/** 三选一：领一只 Lv.5 初始灵宠。 */
export async function chooseWorkshopStarterAction(
  lineKey: string,
): Promise<ActionResult<WorkshopActionResult>> {
  try {
    const userId = await requireUser();
    const config = await getWorkshopConfig();
    const data = await chooseWorkshopStarter(userId, String(lineKey ?? ""), config);
    revalidatePath("/workshop");
    return { success: true, data };
  } catch (error) {
    return fail(error, "选择初始灵宠失败");
  }
}

/** 进图：扣券生成一张冒险地图，从营地出发。 */
export async function enterWorkshopFieldAction(
  areaKey: string,
): Promise<ActionResult<WorkshopActionResult>> {
  try {
    const userId = await requireUser();
    if (!(await checkRateLimit(`workshop-enter:${userId}`, { window: 60_000, limit: 30 }))) {
      return { success: false, error: "操作过于频繁，请稍后再试" };
    }
    const config = await getWorkshopConfig();
    const data = await enterWorkshopField(userId, String(areaKey ?? ""), config);
    revalidatePath("/workshop");
    revalidatePath("/wallet");
    return { success: true, data };
  } catch (error) {
    return fail(error, "进图失败");
  }
}

/** 走位：上传游程路径，服务端重放并回报权威光标。 */
export async function walkWorkshopFieldAction(
  path: WorkshopWalkPath,
): Promise<ActionResult<WorkshopWalkActionResult>> {
  try {
    const userId = await requireUser();
    if (!(await checkRateLimit(`workshop-walk:${userId}`, { window: 60_000, limit: 240 }))) {
      return { success: false, error: "操作过于频繁，请稍后再试" };
    }
    const config = await getWorkshopConfig();
    const data = await walkWorkshopField(userId, path, config);
    // 只在真的遇敌或收兵时才让 Next 重跑整页：普通走位每秒都在发
    if (data.walk.kind !== "ok") revalidatePath("/workshop");
    return { success: true, data };
  } catch (error) {
    return fail(error, "行走失败");
  }
}

/** 收兵回营。 */
export async function leaveWorkshopFieldAction(): Promise<ActionResult<WorkshopActionResult>> {
  try {
    const userId = await requireUser();
    if (!(await checkRateLimit(`workshop-leave:${userId}`, { window: 60_000, limit: 30 }))) {
      return { success: false, error: "操作过于频繁，请稍后再试" };
    }
    const config = await getWorkshopConfig();
    const data = await leaveWorkshopField(userId, config);
    revalidatePath("/workshop");
    return { success: true, data };
  } catch (error) {
    return fail(error, "结束探险失败");
  }
}

/** 战斗回合：服务端结算伤害/捕捉/掉落。 */
export async function workshopBattleAction(
  input: WorkshopBattleAction,
): Promise<ActionResult<WorkshopBattleActionResult>> {
  try {
    const userId = await requireUser();
    if (!(await checkRateLimit(`workshop-battle:${userId}`, { window: 60_000, limit: 180 }))) {
      return { success: false, error: "操作过于频繁，请稍后再试" };
    }
    const config = await getWorkshopConfig();
    const data = await battleWorkshop(userId, normalizeBattleAction(input), config);
    revalidatePath("/workshop");
    return { success: true, data };
  } catch (error) {
    return fail(error, "战斗结算失败");
  }
}

/** 挑战当前顺序的下一个道馆。 */
export async function challengeWorkshopGymAction(): Promise<ActionResult<WorkshopActionResult>> {
  try {
    const userId = await requireUser();
    if (!(await checkRateLimit(`workshop-gym:${userId}`, { window: 60_000, limit: 30 }))) {
      return { success: false, error: "操作过于频繁，请稍后再试" };
    }
    const config = await getWorkshopConfig();
    const data = await challengeWorkshopGym(userId, config);
    revalidatePath("/workshop");
    revalidatePath("/wallet");
    return { success: true, data };
  } catch (error) {
    return fail(error, "挑战道馆失败");
  }
}

/** 休息：每天首次免费，之后按券价付费。 */
export async function restWorkshopPartyAction(): Promise<ActionResult<WorkshopRestResult>> {
  try {
    const userId = await requireUser();
    const config = await getWorkshopConfig();
    const data = await restWorkshopParty(userId, config);
    revalidatePath("/workshop");
    revalidatePath("/wallet");
    return { success: true, data };
  } catch (error) {
    return fail(error, "休息失败");
  }
}

/** 工坊商店：用金币买精灵球 / 药水。 */
export async function buyWorkshopShopItemAction(input: {
  itemId: string;
  quantity: number;
}): Promise<ActionResult<WorkshopShopResult>> {
  try {
    const userId = await requireUser();
    if (!(await checkRateLimit(`workshop-shop:${userId}`, { window: 60_000, limit: 60 }))) {
      return { success: false, error: "买得太频繁，请稍后再试" };
    }
    const config = await getWorkshopConfig();
    const data = await buyWorkshopShopItem(
      userId,
      String(input?.itemId ?? ""),
      Number(input?.quantity) || 0,
      config,
    );
    revalidatePath("/workshop");
    return { success: true, data };
  } catch (error) {
    return fail(error, "购买失败");
  }
}

/** 战斗外给队伍灵宠用药水。 */
export async function drinkWorkshopPotionAction(
  petId: string,
): Promise<ActionResult<WorkshopActionResult & { healed: number }>> {
  try {
    const userId = await requireUser();
    const config = await getWorkshopConfig();
    const data = await drinkWorkshopPotion(userId, String(petId ?? ""), config);
    revalidatePath("/workshop");
    return { success: true, data };
  } catch (error) {
    return fail(error, "用药失败");
  }
}

/** 战斗外更换出战灵宠。 */
export async function setWorkshopActivePetAction(
  petId: string,
): Promise<ActionResult<WorkshopActionResult>> {
  try {
    const userId = await requireUser();
    const config = await getWorkshopConfig();
    const data = await setWorkshopActivePet(userId, String(petId ?? ""), config);
    revalidatePath("/workshop");
    return { success: true, data };
  } catch (error) {
    return fail(error, "更换出战灵宠失败");
  }
}

/** 队伍 ↔ 仓库。 */
export async function moveWorkshopPetAction(input: {
  petId: string;
  target: "party" | "box";
}): Promise<ActionResult<WorkshopActionResult>> {
  try {
    const userId = await requireUser();
    const config = await getWorkshopConfig();
    const target = input?.target === "box" ? "box" : "party";
    const data = await moveWorkshopPet(userId, String(input?.petId ?? ""), target, config);
    revalidatePath("/workshop");
    return { success: true, data };
  } catch (error) {
    return fail(error, "整理灵宠失败");
  }
}

/** 两只同阶合成一只高一阶。 */
export async function mergeWorkshopAction(input: {
  lineKey: string;
  tier: number;
}): Promise<ActionResult<WorkshopActionResult & { merged: { name: string; tier: number } }>> {
  try {
    const userId = await requireUser();
    if (!(await checkRateLimit(`workshop-merge:${userId}`, { window: 60_000, limit: 90 }))) {
      return { success: false, error: "操作过于频繁，请稍后再试" };
    }
    const config = await getWorkshopConfig();
    const data = await mergeWorkshop(userId, String(input?.lineKey ?? ""), input?.tier, config);
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
