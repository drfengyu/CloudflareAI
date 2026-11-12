import { and, eq } from "drizzle-orm";
import { d1Run, db } from "@/lib/db/d1-http";
import { workshopStates } from "@/lib/db/schema";
import { payWithCoupon, refundCouponPayment } from "@/lib/activity/coupons";
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
  areaByKey,
  createGymEncounter,
  createWildEncounter,
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
  type WorkshopState,
} from "./state";

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
  return {
    version: Number(row.version),
    state: normalizeWorkshopState(safeParse(row.state)),
  };
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

/** 探索：扣一张探索票，按区域刷一只野生灵宠并进入战斗。 */
export async function exploreWorkshop(
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
      if (!partyAlive(state)) throw new WorkshopError("队伍需要先休息或用点药水");
      if (state.exploresToday >= config.dailyExplores) {
        throw new WorkshopError(`今日探索次数已用完（${config.dailyExplores} 次），明天再来`);
      }
      const area = areaByKey(areaKey);
      if (!area) throw new WorkshopError("这片区域不存在");
      if (state.badges < area.unlockBadges) {
        throw new WorkshopError(`需要 ${area.unlockBadges} 枚徽章才能进入${area.name}`);
      }
      const encounter = createWildEncounter(area.key);
      if (!encounter) throw new WorkshopError("这片区域暂时没有灵宠");
      return {
        next: {
          ...state,
          day: cnDateString(),
          exploresToday: state.exploresToday + 1,
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
  const { snapshot, result } = await attemptWrite(userId, activityKey, (state) => {
    const resolved = resolveWorkshopBattle(state, action);
    return { next: resolved.state, result: resolved };
  });

  const milestone = await grantReachedMilestones({
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

/** 免费休息：每天一次，回满整队。 */
export async function restWorkshopParty(
  userId: string,
  config: WorkshopConfig,
): Promise<WorkshopActionResult & { healed: number }> {
  const activityKey = assertActiveWindow(config);
  const today = cnDateString();
  const { snapshot, result } = await attemptWrite(userId, activityKey, (state) => {
    if (state.encounter) throw new WorkshopError("战斗中不能休息");
    if (state.restDay === today) throw new WorkshopError("今天已经休息过了");
    if (!state.party.some((pet) => pet.hp < petStats(pet.tier, pet.level).maxHp)) {
      throw new WorkshopError("队伍状态很好，不需要休息");
    }
    const next: WorkshopState = { ...state, restDay: today };
    const healed = healAllParty(next);
    return { next, result: healed };
  });

  return {
    state: snapshot.state,
    version: snapshot.version,
    milestoneReward: 0,
    milestoneTiers: [],
    healed: result,
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

  const milestone = await grantReachedMilestones({
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
