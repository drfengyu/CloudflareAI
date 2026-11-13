import { and, eq } from "drizzle-orm";
import { d1Run, db } from "@/lib/db/d1-http";
import { workshopStates } from "@/lib/db/schema";
import { payWithCoupon, refundCouponPayment, type CouponPayment } from "@/lib/activity/coupons";
import { creditsForTickets, ticketsForCost } from "@/lib/activity/ticket-math";
import {
  grantActivityMilestone,
  listGrantedMilestones,
} from "@/lib/activity/rewards";
import { cnDateString } from "@/lib/date";
import {
  TOPUP_TYPE_WORKSHOP,
  WORKSHOP_LINES,
  WORKSHOP_TIER_COUNT,
  workshopActivityKey,
  workshopActivityWindow,
  workshopTierName,
  type WorkshopConfig,
} from "./config";
import {
  WORKSHOP_POTION_HEAL,
  WORKSHOP_PARTY_SIZE,
  WORKSHOP_STARTER_LEVEL,
  createPet,
  petDexKeys,
  petScore,
  petStats,
} from "./pets";
import {
  WORKSHOP_SHOP_BY_ID,
  WORKSHOP_SHOP_MAX_QTY,
  type WorkshopShopItemId,
} from "./shop";
import {
  areaByKey,
  createGymEncounter,
  endedWorkshopBattle,
  nextGym,
  resolveWorkshopBattle,
  type WorkshopBattleAction,
  type WorkshopBattleResult,
} from "./battle";
import {
  emptyWorkshopState,
  findPet,
  healAllParty,
  highestTier,
  normalizeWorkshopState,
  partyAlive,
  removePet,
  type WorkshopEncounter,
  type WorkshopState,
} from "./state";
import {
  newWorkshopRun,
  normalizeWorkshopRun,
  replayWorkshopWalk,
  sanitizeWalkPath,
  workshopRunField,
  workshopWalkLimits,
} from "./run";

/**
 * 灵宠工坊写入侧。
 *
 * 整份存档在 `workshop_state.state` JSON，写入用 `WHERE version = ?` 乐观锁：
 * 并发战斗/捕捉只有一个能推进，另一个收到「操作冲突」。
 * 探索与道馆先扣券再改状态，任何失败都会把券退回。
 */

export class WorkshopError extends Error {}

export type { WorkshopState } from "./state";

export interface WorkshopSnapshot {
  version: number;
  state: WorkshopState;
}

async function readState(userId: string, activityKey: string): Promise<WorkshopSnapshot> {
  const rows = await db
    .select({ version: workshopStates.version, state: workshopStates.state })
    .from(workshopStates)
    .where(and(eq(workshopStates.userId, userId), eq(workshopStates.activityKey, activityKey)))
    .limit(1);
  const row = rows[0];
  if (!row) return { version: 0, state: emptyWorkshopState() };
  const state = normalizeWorkshopState(safeParse(row.state));
  // run 的结构在 state.ts 里校过，这里再按真实的图夹一次坐标
  state.run = normalizeWorkshopRun(state.run);
  return { version: Number(row.version), state };
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** 确保状态行存在（version 从 0 起），后续 UPDATE 才有目标行。 */
async function ensureStateRow(userId: string, activityKey: string): Promise<void> {
  await d1Run(
    `INSERT OR IGNORE INTO workshop_state (userId, activityKey, version, state, updatedAt)
     VALUES (?, ?, 0, ?, ?)`,
    [userId, activityKey, JSON.stringify(emptyWorkshopState()), Date.now()],
  );
}

async function writeState(
  userId: string,
  activityKey: string,
  snapshot: WorkshopSnapshot,
  next: WorkshopState,
): Promise<WorkshopSnapshot | null> {
  const { changes } = await d1Run(
    `UPDATE workshop_state SET version = version + 1, state = ?, updatedAt = ?
      WHERE userId = ? AND activityKey = ? AND version = ?`,
    [JSON.stringify(next), Date.now(), userId, activityKey, snapshot.version],
  );
  if (changes !== 1) return null;
  return { version: snapshot.version + 1, state: next };
}

function assertActiveWindow(config: WorkshopConfig): string {
  const window = workshopActivityWindow(config);
  if (window.status === "disabled") throw new WorkshopError("活动未开启");
  if (window.status === "pending") throw new WorkshopError("活动尚未开始");
  if (window.status === "ended") throw new WorkshopError("活动已结束");
  const key = workshopActivityKey(config);
  if (!key) throw new WorkshopError("活动轮次无效");
  return key;
}

/** 读 → 应用 → CAS 写；只处理并发冲突，规则错误原样抛出。 */
async function attemptWrite<T>(
  userId: string,
  activityKey: string,
  apply: (state: WorkshopState) => { next: WorkshopState; result: T },
): Promise<{ snapshot: WorkshopSnapshot; result: T }> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const snapshot = await readState(userId, activityKey);
    const { next, result } = apply(snapshot.state);
    const written = await writeState(userId, activityKey, snapshot, next);
    if (written) return { snapshot: written, result };
  }
  throw new WorkshopError("操作冲突，请刷新后重试");
}

export interface WorkshopActionResult {
  state: WorkshopState;
  version: number;
  /** 本次新领到的里程碑 tcr 合计。 */
  milestoneReward: number;
  milestoneTiers: number[];
}

export interface WorkshopBattleActionResult extends WorkshopActionResult {
  battle: Omit<WorkshopBattleResult, "state">;
}

async function grantReachedMilestones(input: {
  userId: string;
  activityKey: string;
  config: WorkshopConfig;
  state: WorkshopState;
}): Promise<{ reward: number; tiers: number[] }> {
  const reached = highestTier(input.state);
  const granted = await listGrantedMilestones(input.userId, "workshop", input.activityKey);
  let reward = 0;
  const tiers: number[] = [];
  for (const milestone of input.config.milestones) {
    if (milestone.tier > reached) continue;
    if (milestone.reward <= 0) continue;
    const tierKey = `tier:${milestone.tier}`;
    if (granted.has(tierKey)) continue;
    const result = await grantActivityMilestone({
      userId: input.userId,
      kind: "workshop",
      activityKey: input.activityKey,
      tierKey,
      reward: milestone.reward,
      topupType: TOPUP_TYPE_WORKSHOP,
      description: `灵宠工坊达成 ${milestone.tier} 阶奖励`,
      validDays: input.config.rewardValidDays,
    });
    if (result.granted) {
      reward += result.reward;
      tiers.push(milestone.tier);
    }
  }
  return { reward, tiers };
}

/**
 * 战斗/合成已经落库之后才发里程碑：发奖失败只能记日志，不能把已经推进的存档报成失败。
 * 漏发的奖励留在页面的「补领」里，下一次进页面还能领。
 */
async function safeGrantReachedMilestones(input: {
  userId: string;
  activityKey: string;
  config: WorkshopConfig;
  state: WorkshopState;
}): Promise<{ reward: number; tiers: number[] }> {
  try {
    return await grantReachedMilestones(input);
  } catch (error) {
    console.error("[workshop] milestone grant failed:", error);
    return { reward: 0, tiers: [] };
  }
}

function withDex(state: WorkshopState, pets: { lineKey: string; tier: number }[]): string[] {
  const keys = new Set(state.dex);
  for (const pet of pets) {
    for (const key of petDexKeys(pet)) keys.add(key);
  }
  return [...keys].sort();
}

/**
 * 三选一：第一只灵宠 Lv.5，不花券。选定后本轮活动不能再换。
 * 旧存档迁移出来的玩家已经自带队伍，会直接跳过这一步。
 */
export async function chooseWorkshopStarter(
  userId: string,
  lineKey: string,
  config: WorkshopConfig,
): Promise<WorkshopActionResult> {
  const activityKey = assertActiveWindow(config);
  const line = WORKSHOP_LINES.find((item) => item.key === lineKey);
  if (!line) throw new WorkshopError("没有这条养成线");

  await ensureStateRow(userId, activityKey);
  const { snapshot } = await attemptWrite(userId, activityKey, (state) => {
    if (state.starter || state.party.length > 0) throw new WorkshopError("已经选过初始灵宠了");
    const pet = createPet({
      lineKey: line.key,
      tier: 1,
      level: WORKSHOP_STARTER_LEVEL,
    });
    return {
      next: {
        ...state,
        starter: line.key,
        party: [pet],
        activePetId: pet.id,
        dex: withDex(state, [pet]),
      },
      result: null,
    };
  });

  return {
    state: snapshot.state,
    version: snapshot.version,
    milestoneReward: 0,
    milestoneTiers: [],
  };
}

function actionResult(snapshot: WorkshopSnapshot): WorkshopActionResult {
  return {
    state: snapshot.state,
    version: snapshot.version,
    milestoneReward: 0,
    milestoneTiers: [],
  };
}

/** 进图：扣一张探索票，按区域 + 种子生成冒险地图，主角从营地出发。 */
export async function enterWorkshopField(
  userId: string,
  areaKey: string,
  config: WorkshopConfig,
): Promise<WorkshopActionResult> {
  const activityKey = assertActiveWindow(config);
  await ensureStateRow(userId, activityKey);
  const paid = await payWithCoupon(
    userId,
    "workshop",
    activityKey,
    config.exploreCostCredits,
    config.couponUnitCredits,
  );
  if (!paid.ok) throw new WorkshopError(paid.reason);

  let outcome: { snapshot: WorkshopSnapshot };
  try {
    outcome = await attemptWrite(userId, activityKey, (state) => {
      if (!state.starter) throw new WorkshopError("先选一只初始灵宠再出发");
      if (state.encounter) throw new WorkshopError("上一场战斗还没结束");
      if (state.run) throw new WorkshopError("你已经在地图里了，先回营地结束这趟探险");
      if (!partyAlive(state)) throw new WorkshopError("队伍需要先休息或用点药水");
      if (state.entersToday >= config.dailyExplores) {
        throw new WorkshopError(`今日进图次数已用完（${config.dailyExplores} 次），明天再来`);
      }
      const area = areaByKey(areaKey);
      if (!area) throw new WorkshopError("这片区域不存在");
      if (state.badges < area.unlockBadges) {
        throw new WorkshopError(`需要 ${area.unlockBadges} 枚徽章才能进入${area.name}`);
      }
      const run = newWorkshopRun({
        areaKey: area.key,
        seed: (Math.random() * 0x1_0000_0000) >>> 0,
      });
      return {
        next: {
          ...state,
          day: cnDateString(),
          entersToday: state.entersToday + 1,
          run,
        },
        result: null,
      };
    });
  } catch (error) {
    await refundCouponPayment(paid.payment);
    throw error;
  }

  return actionResult(outcome.snapshot);
}

export interface WorkshopWalkActionResult extends WorkshopActionResult {
  walk: {
    kind: "ok" | "encounter" | "capped";
    /** 服务端认定的光标位置，客户端拿它校正主角。 */
    tx: number;
    ty: number;
    steps: number;
    encounters: number;
    /** 本次请求里服务端实际处理掉的路径步数（撞墙的步不计）。 */
    consumed: number;
    /** 撞了哪道上限；capped 之外为 null。 */
    reason: "steps" | "encounters" | null;
    encounter: WorkshopEncounter | null;
  };
}

/** 走位：客户端上传游程路径，服务端逐格重放，撞到草丛就摇遇敌。 */
export async function walkWorkshopField(
  userId: string,
  rawPath: unknown,
  config: WorkshopConfig,
): Promise<WorkshopWalkActionResult> {
  const activityKey = assertActiveWindow(config);
  const limits = workshopWalkLimits(config);
  const path = sanitizeWalkPath(rawPath, limits.maxPathSteps);
  const { snapshot, result } = await attemptWrite(userId, activityKey, (state) => {
    if (!state.run) throw new WorkshopError("这趟探险已经收兵，重新进图吧");
    if (state.encounter) throw new WorkshopError("上一场战斗还没结束");
    const outcome = replayWorkshopWalk(state.run, path, limits);
    return {
      next: {
        ...state,
        // 走到上限就地收兵；遇敌则冻结光标，等这场打完接着走
        run: outcome.kind === "capped" ? null : outcome.run,
        encounter: outcome.kind === "encounter" ? outcome.encounter : state.encounter,
      },
      result: outcome,
    };
  });

  return {
    ...actionResult(snapshot),
    walk: {
      kind: result.kind,
      tx: result.run.tx,
      ty: result.run.ty,
      steps: result.run.steps,
      encounters: result.run.encounters,
      consumed: result.consumed,
      reason: result.kind === "capped" ? result.reason : null,
      encounter: result.kind === "encounter" ? result.encounter : null,
    },
  };
}

/** 收兵回营：不扣券，这趟探险的步数与遇敌额度一起作废。 */
export async function leaveWorkshopField(
  userId: string,
  config: WorkshopConfig,
): Promise<WorkshopActionResult> {
  const activityKey = assertActiveWindow(config);
  const { snapshot } = await attemptWrite(userId, activityKey, (state) => {
    if (!state.run) throw new WorkshopError("已经不在地图里了");
    if (state.encounter) throw new WorkshopError("战斗还没结束，先撤退或打完");
    return { next: { ...state, run: null }, result: null };
  });
  return actionResult(snapshot);
}

/** 道馆：按徽章数顺序挑战，胜利得徽章与补给，失败不扣额外东西。 */
export async function challengeWorkshopGym(
  userId: string,
  config: WorkshopConfig,
): Promise<WorkshopActionResult> {
  const activityKey = assertActiveWindow(config);
  await ensureStateRow(userId, activityKey);
  const paid = await payWithCoupon(
    userId,
    "workshop",
    activityKey,
    config.gymCostCredits,
    config.couponUnitCredits,
  );
  if (!paid.ok) throw new WorkshopError(paid.reason);

  let outcome: { snapshot: WorkshopSnapshot };
  try {
    outcome = await attemptWrite(userId, activityKey, (state) => {
      if (!state.starter) throw new WorkshopError("先选一只初始灵宠再挑战");
      if (state.encounter) throw new WorkshopError("上一场战斗还没结束");
      if (!partyAlive(state)) throw new WorkshopError("队伍需要先休息或用点药水");
      if (state.gymsToday >= config.dailyGyms) {
        throw new WorkshopError(`今日道馆挑战次数已用完（${config.dailyGyms} 次），明天再来`);
      }
      // 在地图里就得真走到道馆门口；券照扣，位置由服务端的光标说了算
      if (state.run) {
        const field = workshopRunField(state.run);
        const dx = Math.abs(state.run.tx - field.gym.tx);
        const dy = Math.abs(state.run.ty - field.gym.ty);
        if (dx > 1 || dy > 1) throw new WorkshopError("先走到地图另一头的道馆门口");
      }
      const gym = nextGym(state.badges);
      if (!gym) throw new WorkshopError("三枚徽章已经集齐，去星陨高地继续探索吧");
      const encounter = createGymEncounter(gym.stage);
      if (!encounter) throw new WorkshopError("道馆暂时没有开门");
      return {
        next: {
          ...state,
          day: cnDateString(),
          gymsToday: state.gymsToday + 1,
          encounter,
        },
        result: null,
      };
    });
  } catch (error) {
    await refundCouponPayment(paid.payment);
    throw error;
  }

  return {
    state: outcome.snapshot.state,
    version: outcome.snapshot.version,
    milestoneReward: 0,
    milestoneTiers: [],
  };
}

/** 战斗回合：伤害、捕捉、掉落、经验都由服务端结算。 */
export async function battleWorkshop(
  userId: string,
  action: WorkshopBattleAction,
  config: WorkshopConfig,
): Promise<WorkshopBattleActionResult> {
  const activityKey = assertActiveWindow(config);
  await ensureStateRow(userId, activityKey);
  const { snapshot, result } = await attemptWrite(userId, activityKey, (state) => {
    // 前端还停在战斗页，服务端却已经没有这场遭遇了：回 ended 让它退出，别把玩家锁在战斗界面
    if (!state.encounter) {
      return { next: state, result: endedWorkshopBattle(state) };
    }
    const resolved = resolveWorkshopBattle(state, action);
    return { next: resolved.state, result: resolved };
  });

  const milestone = await safeGrantReachedMilestones({
    userId,
    activityKey,
    config,
    state: snapshot.state,
  });
  const battle: Omit<WorkshopBattleResult, "state"> = {
    events: result.events,
    status: result.status,
    expGained: result.expGained,
    levelUps: result.levelUps,
    evolved: result.evolved,
    captured: result.captured,
    drops: result.drops,
  };
  return {
    state: snapshot.state,
    version: snapshot.version,
    milestoneReward: milestone.reward,
    milestoneTiers: milestone.tiers,
    battle,
  };
}

export interface WorkshopRestResult extends WorkshopActionResult {
  healed: number;
  /** 这次休息实际花掉的 cr；免费休息为 0。 */
  paidCredits: number;
}

/** 休息：每日首次免费（全灭时紧急休整也免费）；用完后按后台券价付费回满整队。 */
export async function restWorkshopParty(
  userId: string,
  config: WorkshopConfig,
): Promise<WorkshopRestResult> {
  const activityKey = assertActiveWindow(config);
  const today = cnDateString();
  const checkRestable = (state: WorkshopState): { free: boolean } => {
    if (state.encounter) throw new WorkshopError("战斗中不能休息");
    if (state.run) throw new WorkshopError("野外不安营，先走回营地再休息");
    if (!state.party.some((pet) => pet.hp < petStats(pet.tier, pet.level).maxHp)) {
      throw new WorkshopError("队伍状态很好，不需要休息");
    }
    // 全灭（含改版前卡死的旧存档）不受每日一次限制，否则没有药水就只能一直躺着
    const downed = state.party.length > 0 && !state.party.some((pet) => pet.hp > 0);
    return { free: downed || state.restDay !== today };
  };

  await ensureStateRow(userId, activityKey);
  const before = await readState(userId, activityKey);
  const { free } = checkRestable(before.state);

  let payment: CouponPayment | null = null;
  if (!free) {
    const paid = await payWithCoupon(
      userId,
      "workshop",
      activityKey,
      config.restCostCredits,
      config.couponUnitCredits,
    );
    if (!paid.ok) {
      const tickets = ticketsForCost(config.restCostCredits, config.couponUnitCredits);
      throw new WorkshopError(`${paid.reason}（付费休息需要 ${tickets} 张工坊券）`);
    }
    payment = paid.payment;
  }

  let outcome: { snapshot: WorkshopSnapshot; result: number };
  try {
    outcome = await attemptWrite(userId, activityKey, (state) => {
      const info = checkRestable(state);
      // 预读时是免费，写的时候免费次数已经被别的页面用掉了：宁可失败也不偷偷扣券。
      if (free && !info.free) throw new WorkshopError("今天已经休息过了");
      const next: WorkshopState = { ...state, restDay: today };
      const healed = healAllParty(next);
      return { next, result: healed };
    });
  } catch (error) {
    if (payment) await refundCouponPayment(payment);
    throw error;
  }

  return {
    ...actionResult(outcome.snapshot),
    healed: outcome.result,
    paidCredits: payment ? creditsForTickets(payment.tickets, config.couponUnitCredits) : 0,
  };
}

export interface WorkshopShopResult extends WorkshopActionResult {
  /** 这次花掉的金币。 */
  spent: number;
  bought: { ball: number; potion: number };
}

/** 工坊商店：用活动内金币买精灵球 / 药水，战斗中不可用。 */
export async function buyWorkshopShopItem(
  userId: string,
  itemId: string,
  quantity: number,
  config: WorkshopConfig,
): Promise<WorkshopShopResult> {
  const activityKey = assertActiveWindow(config);
  const item = WORKSHOP_SHOP_BY_ID.get(String(itemId ?? "") as WorkshopShopItemId);
  if (!item) throw new WorkshopError("商店里没有这件补给");
  const qty = Math.trunc(Number(quantity) || 0);
  if (qty < 1 || qty > WORKSHOP_SHOP_MAX_QTY) {
    throw new WorkshopError(`一次只能买 1~${WORKSHOP_SHOP_MAX_QTY} 个`);
  }
  const cost = item.price * qty;
  await ensureStateRow(userId, activityKey);
  const { snapshot } = await attemptWrite(userId, activityKey, (state) => {
    if (state.encounter) throw new WorkshopError("战斗中不能逛商店，打完再来");
    if (state.gold < cost) {
      throw new WorkshopError(`金币不够：${qty} 个${item.name}要 ${cost} 金，现在只有 ${state.gold} 金`);
    }
    return {
      next: {
        ...state,
        gold: state.gold - cost,
        items:
          item.id === "ball"
            ? { ...state.items, ball: state.items.ball + qty }
            : { ...state.items, potion: state.items.potion + qty },
      },
      result: null,
    };
  });

  return {
    ...actionResult(snapshot),
    spent: cost,
    bought: { ball: item.id === "ball" ? qty : 0, potion: item.id === "potion" ? qty : 0 },
  };
}

/** 战斗外使用药水：只能对队伍里的灵宠用。 */
export async function drinkWorkshopPotion(
  userId: string,
  petId: string,
  config: WorkshopConfig,
): Promise<WorkshopActionResult & { healed: number }> {
  const activityKey = assertActiveWindow(config);
  const { snapshot, result } = await attemptWrite(userId, activityKey, (state) => {
    if (state.encounter) throw new WorkshopError("战斗中请用战斗面板里的药水按钮");
    if (state.items.potion <= 0) throw new WorkshopError("药水用完了");
    const found = findPet(state, petId);
    if (!found || found.where !== "party") throw new WorkshopError("只能给队伍里的灵宠用药水");
    const maxHp = petStats(found.pet.tier, found.pet.level).maxHp;
    if (found.pet.hp >= maxHp) throw new WorkshopError("它已经是满血了");
    const healed = Math.min(maxHp, found.pet.hp + WORKSHOP_POTION_HEAL);
    const amount = healed - found.pet.hp;
    return {
      next: {
        ...state,
        items: { ...state.items, potion: state.items.potion - 1 },
        party: state.party.map((pet) => (pet.id === petId ? { ...pet, hp: healed } : pet)),
      },
      result: amount,
    };
  });

  return {
    state: snapshot.state,
    version: snapshot.version,
    milestoneReward: 0,
    milestoneTiers: [],
    healed: result,
  };
}

/** 战斗外换出战灵宠。 */
export async function setWorkshopActivePet(
  userId: string,
  petId: string,
  config: WorkshopConfig,
): Promise<WorkshopActionResult> {
  const activityKey = assertActiveWindow(config);
  const { snapshot } = await attemptWrite(userId, activityKey, (state) => {
    if (state.encounter) throw new WorkshopError("战斗中用「换宠」指令");
    const target = state.party.find((pet) => pet.id === petId);
    if (!target) throw new WorkshopError("这只灵宠不在队伍里");
    if (target.hp <= 0) throw new WorkshopError("它已经倒下了，先休息或用药水");
    return { next: { ...state, activePetId: petId }, result: null };
  });

  return {
    state: snapshot.state,
    version: snapshot.version,
    milestoneReward: 0,
    milestoneTiers: [],
  };
}

/** 队伍 ↔ 仓库移动；队伍至少留一只。 */
export async function moveWorkshopPet(
  userId: string,
  petId: string,
  target: "party" | "box",
  config: WorkshopConfig,
): Promise<WorkshopActionResult> {
  const activityKey = assertActiveWindow(config);
  const { snapshot } = await attemptWrite(userId, activityKey, (state) => {
    if (state.encounter) throw new WorkshopError("战斗中不能整理队伍");
    const found = findPet(state, petId);
    if (!found) throw new WorkshopError("找不到这只灵宠");
    if (found.where === target) throw new WorkshopError("它已经在那里了");
    if (target === "party" && state.party.length >= WORKSHOP_PARTY_SIZE) {
      throw new WorkshopError(`队伍最多 ${WORKSHOP_PARTY_SIZE} 只，先换下一只`);
    }
    if (target === "box" && state.party.length <= 1) {
      throw new WorkshopError("队伍至少要留一只灵宠");
    }
    removePet(state, petId);
    if (target === "party") {
      state.party.push(found.pet);
      state.activePetId = state.activePetId ?? found.pet.id;
    } else {
      state.box.push(found.pet);
    }
    return { next: state, result: null };
  });

  return {
    state: snapshot.state,
    version: snapshot.version,
    milestoneReward: 0,
    milestoneTiers: [],
  };
}

/**
 * 合成：两只同阶换一只高一阶（不花券）。
 *
 * 优先消耗等级最低的两只，避免误吃主力；新灵宠等级取两者较高值、满血，
 * 作为「等级进化」之外的加速路线。
 */
export async function mergeWorkshop(
  userId: string,
  lineKey: string,
  tier: number,
  config: WorkshopConfig,
): Promise<WorkshopActionResult & { merged: { name: string; tier: number } }> {
  const activityKey = assertActiveWindow(config);
  const line = WORKSHOP_LINES.find((item) => item.key === lineKey);
  if (!line) throw new WorkshopError("养成线不存在");
  const sourceTier = Math.trunc(Number(tier));
  if (!Number.isInteger(sourceTier) || sourceTier < 1 || sourceTier >= WORKSHOP_TIER_COUNT) {
    throw new WorkshopError("只有 1~8 阶可以合成");
  }

  const { snapshot, result } = await attemptWrite(userId, activityKey, (state) => {
    if (state.encounter) throw new WorkshopError("战斗中不能合成，打完再合");
    const candidates = [...state.party, ...state.box]
      .filter((pet) => pet.lineKey === line.key && pet.tier === sourceTier)
      .sort((a, b) => a.level - b.level || a.exp - b.exp || petScore(a) - petScore(b));
    if (candidates.length < 2) {
      throw new WorkshopError(`两只${workshopTierName(line.key, sourceTier)}才能合成`);
    }
    const [first, second] = candidates;
    const firstInParty = state.party.some((pet) => pet.id === first.id);
    const secondInParty = state.party.some((pet) => pet.id === second.id);
    removePet(state, first.id);
    removePet(state, second.id);

    const merged = createPet({
      lineKey: line.key,
      tier: sourceTier + 1,
      level: Math.max(first.level, second.level),
    });
    if (firstInParty || secondInParty) {
      state.party.push(merged);
      if (!state.activePetId) state.activePetId = merged.id;
    } else {
      state.box.push(merged);
    }
    state.dex = withDex(state, [merged]);
    return {
      next: state,
      result: { name: workshopTierName(line.key, sourceTier + 1), tier: sourceTier + 1 },
    };
  });

  const milestone = await safeGrantReachedMilestones({
    userId,
    activityKey,
    config,
    state: snapshot.state,
  });
  return {
    state: snapshot.state,
    version: snapshot.version,
    milestoneReward: milestone.reward,
    milestoneTiers: milestone.tiers,
    merged: result,
  };
}

/** 领取本活动已达成但还没发过的里程碑（页面上的「补领」用）。 */
export async function claimWorkshopMilestones(
  userId: string,
  config: WorkshopConfig,
): Promise<{ reward: number; tiers: number[]; state: WorkshopState; version: number }> {
  const activityKey = assertActiveWindow(config);
  const snapshot = await readState(userId, activityKey);
  const milestone = await grantReachedMilestones({
    userId,
    activityKey,
    config,
    state: snapshot.state,
  });
  return {
    reward: milestone.reward,
    tiers: milestone.tiers,
    state: snapshot.state,
    version: snapshot.version,
  };
}

/** 页面读取：不建行、不写库。 */
export async function getWorkshopSnapshot(
  userId: string,
  activityKey: string | null,
): Promise<WorkshopSnapshot> {
  if (!activityKey) return { version: 0, state: emptyWorkshopState() };
  return readState(userId, activityKey);
}
