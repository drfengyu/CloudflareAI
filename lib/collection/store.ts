import { and, eq } from "drizzle-orm";
import { d1Run, db } from "@/lib/db/d1-http";
import { collectionStates } from "@/lib/db/schema";
import { payWithCoupon, refundCouponPayment } from "@/lib/activity/coupons";
import {
  grantActivityMilestone,
  listGrantedMilestones,
} from "@/lib/activity/rewards";
import { cnDateString } from "@/lib/date";
import {
  CONSTELLATIONS,
  CONSTELLATION_SHARDS,
  CRAFT_SHARDS,
  MELT_SHARDS,
  STAR_BRIGHTNESS_NAMES,
  STAR_COLOR_META,
  TOPUP_TYPE_COLLECTION,
  collectionActivityKey,
  collectionActivityWindow,
  completedConstellations,
  isBrightness,
  isStarColor,
  nodeById,
  rollStarStone,
  type CollectionConfig,
  type StarColor,
} from "./config";
import {
  addStones,
  emptyCollectionState,
  normalizeCollectionState,
  placeStarStone,
  type CollectionState,
} from "./state";

/**
 * 星图共鸣的写入侧。
 *
 * 状态（星石库存 / 已点亮星位 / 星辉 / 当日观星数）整体存 JSON，写入用乐观锁版本号；
 * 观星先扣券，任何一步失败都退回。完成星座与每日共鸣先占 `activity_milestone` 唯一键再发 tcr。
 */

export class CollectionError extends Error {}

export type { CollectionState } from "./state";

export interface CollectionSnapshot {
  version: number;
  state: CollectionState;
}

export interface CollectionActionResult {
  state: CollectionState;
  version: number;
  milestoneReward: number;
  completedSets: string[];
}

export interface ObserveResult extends CollectionActionResult {
  color: StarColor;
  brightness: 1 | 2 | 3;
  colorName: string;
  brightnessName: string;
  owned: number;
}

export interface PlaceStarResult extends CollectionActionResult {
  nodeId: string;
  color: StarColor;
  brightness: 1 | 2 | 3;
  shardsGained: number;
}

export interface ResonanceResult extends CollectionActionResult {
  reward: number;
  constellations: string[];
}

function assertActiveWindow(config: CollectionConfig): string {
  const window = collectionActivityWindow(config);
  if (window.status === "disabled") throw new CollectionError("活动未开启");
  if (window.status === "pending") throw new CollectionError("活动尚未开始");
  if (window.status === "ended") throw new CollectionError("活动已结束");
  const key = collectionActivityKey(config);
  if (!key) throw new CollectionError("活动轮次无效");
  return key;
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readState(userId: string, activityKey: string): Promise<CollectionSnapshot> {
  const rows = await db
    .select({ version: collectionStates.version, state: collectionStates.state })
    .from(collectionStates)
    .where(
      and(eq(collectionStates.userId, userId), eq(collectionStates.activityKey, activityKey)),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return { version: 0, state: emptyCollectionState() };
  return { version: Number(row.version), state: normalizeCollectionState(safeParse(row.state)) };
}

async function ensureStateRow(userId: string, activityKey: string): Promise<void> {
  await d1Run(
    `INSERT OR IGNORE INTO collection_state (userId, activityKey, version, state, updatedAt)
     VALUES (?, ?, 0, ?, ?)`,
    [userId, activityKey, JSON.stringify(emptyCollectionState()), Date.now()],
  );
}

async function writeState(
  userId: string,
  activityKey: string,
  snapshot: CollectionSnapshot,
  next: CollectionState,
): Promise<CollectionSnapshot | null> {
  const { changes } = await d1Run(
    `UPDATE collection_state SET version = version + 1, state = ?, updatedAt = ?
      WHERE userId = ? AND activityKey = ? AND version = ?`,
    [JSON.stringify(next), Date.now(), userId, activityKey, snapshot.version],
  );
  if (changes !== 1) return null;
  return { version: snapshot.version + 1, state: next };
}

/** 乐观锁重试包装：apply 抛错即中止，冲突最多重试三次。 */
async function attemptWrite<T>(
  userId: string,
  activityKey: string,
  apply: (state: CollectionState) => { next: CollectionState; result: T },
): Promise<{ snapshot: CollectionSnapshot; result: T }> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const snapshot = await readState(userId, activityKey);
    const { next, result } = apply(snapshot.state);
    const written = await writeState(userId, activityKey, snapshot, next);
    if (written) return { snapshot: written, result };
  }
  throw new CollectionError("操作冲突，请刷新后重试");
}

async function grantSetMilestones(input: {
  userId: string;
  activityKey: string;
  config: CollectionConfig;
  state: CollectionState;
}): Promise<{ reward: number; sets: string[] }> {
  const done = completedConstellations(new Set(input.state.nodes));
  if (done.length === 0) return { reward: 0, sets: [] };
  const granted = await listGrantedMilestones(input.userId, "collection", input.activityKey);
  let reward = 0;
  const sets: string[] = [];
  for (const setKey of done) {
    const row = input.config.setRewards.find((item) => item.set === setKey);
    if (!row || row.reward <= 0) continue;
    const tierKey = `set:${setKey}`;
    if (granted.has(tierKey)) continue;
    const meta = CONSTELLATIONS.find((set) => set.key === setKey);
    const result = await grantActivityMilestone({
      userId: input.userId,
      kind: "collection",
      activityKey: input.activityKey,
      tierKey,
      reward: row.reward,
      topupType: TOPUP_TYPE_COLLECTION,
      description: `星图共鸣完成「${meta?.name ?? setKey}」奖励`,
      validDays: input.config.rewardValidDays,
    });
    if (result.granted) {
      reward += result.reward;
      sets.push(setKey);
    }
  }
  return { reward, sets };
}

/**
 * 观星：扣一次券，抽一颗星石放进库存。
 * 每日次数用完或连续冲突时退回券。
 */
export async function observeSky(
  userId: string,
  config: CollectionConfig,
): Promise<ObserveResult> {
  const activityKey = assertActiveWindow(config);
  await ensureStateRow(userId, activityKey);
  const paid = await payWithCoupon(
    userId,
    "collection",
    activityKey,
    config.observeCostCredits,
    config.couponUnitCredits,
  );
  if (!paid.ok) throw new CollectionError(paid.reason);

  try {
    const { snapshot, result } = await attemptWrite(userId, activityKey, (state) => {
      if (state.observesToday >= config.dailyObserves) {
        throw new CollectionError(`今日观星次数已用完（${config.dailyObserves} 次），明天再来`);
      }
      const stone = rollStarStone();
      addStones(state, stone.color, stone.brightness, 1);
      state.day = cnDateString();
      state.observesToday += 1;
      return {
        next: state,
        result: { stone, owned: state.observesToday },
      };
    });
    const { stone, owned } = result;
    return {
      state: snapshot.state,
      version: snapshot.version,
      milestoneReward: 0,
      completedSets: [],
      color: stone.color,
      brightness: stone.brightness,
      colorName: STAR_COLOR_META[stone.color].name,
      brightnessName: STAR_BRIGHTNESS_NAMES[stone.brightness],
      owned,
    };
  } catch (error) {
    await refundCouponPayment(paid.payment);
    throw error;
  }
}

/** 把星石嵌进星位；点亮整张星座时额外给星辉并结算完成奖励。 */
export async function placeCollectionStar(
  userId: string,
  nodeId: string,
  config: CollectionConfig,
): Promise<PlaceStarResult> {
  const activityKey = assertActiveWindow(config);
  await ensureStateRow(userId, activityKey);

  const { snapshot, result } = await attemptWrite(userId, activityKey, (state) => {
    const before = new Set(completedConstellations(new Set(state.nodes)));
    const placed = placeStarStone(state, nodeId);
    if (!placed.ok) throw new CollectionError(placed.reason);
    const node = nodeById(nodeId);
    if (!node) throw new CollectionError("星位不存在");
    const newly = completedConstellations(new Set(state.nodes)).filter((key) => !before.has(key));
    const shardsGained = newly.length * CONSTELLATION_SHARDS;
    if (shardsGained > 0) state.shards = Math.min(1_000_000, state.shards + shardsGained);
    return {
      next: state,
      result: { nodeId: node.id, brightness: placed.brightness, color: node.color, newly },
    };
  });

  const milestone = await grantSetMilestones({
    userId,
    activityKey,
    config,
    state: snapshot.state,
  });
  return {
    state: snapshot.state,
    version: snapshot.version,
    milestoneReward: milestone.reward,
    completedSets: milestone.sets,
    nodeId: result.nodeId,
    color: result.color,
    brightness: result.brightness,
    shardsGained: result.newly.length * CONSTELLATION_SHARDS,
  };
}

/** 熔炼一颗星石换星辉。 */
export async function meltStarStone(
  userId: string,
  color: StarColor,
  brightness: 1 | 2 | 3,
  config: CollectionConfig,
): Promise<CollectionActionResult & { shardsGained: number }> {
  const activityKey = assertActiveWindow(config);
  if (!isStarColor(color) || !isBrightness(brightness)) {
    throw new CollectionError("星石颜色或亮度无效");
  }
  const { snapshot } = await attemptWrite(userId, activityKey, (state) => {
    if ((state.stones[color]?.[brightness - 1] ?? 0) <= 0) {
      throw new CollectionError("这颗星石已经用完了");
    }
    state.stones[color][brightness - 1] -= 1;
    state.shards = Math.min(1_000_000, state.shards + MELT_SHARDS[brightness]);
    return { next: state, result: null };
  });
  return {
    state: snapshot.state,
    version: snapshot.version,
    milestoneReward: 0,
    completedSets: [],
    shardsGained: MELT_SHARDS[brightness],
  };
}

/** 用星辉定向凝出一颗指定颜色 / 亮度的星石。 */
export async function craftStarStone(
  userId: string,
  color: StarColor,
  brightness: 1 | 2 | 3,
  config: CollectionConfig,
): Promise<CollectionActionResult & { shardsSpent: number }> {
  const activityKey = assertActiveWindow(config);
  if (!isStarColor(color) || !isBrightness(brightness)) {
    throw new CollectionError("星石颜色或亮度无效");
  }
  const cost = CRAFT_SHARDS[brightness];
  const { snapshot } = await attemptWrite(userId, activityKey, (state) => {
    if (state.shards < cost) {
      throw new CollectionError(`星辉不足：凝星需要 ${cost}，当前 ${state.shards}`);
    }
    state.shards -= cost;
    addStones(state, color, brightness, 1);
    return { next: state, result: null };
  });
  return {
    state: snapshot.state,
    version: snapshot.version,
    milestoneReward: 0,
    completedSets: [],
    shardsSpent: cost,
  };
}

/**
 * 每日共鸣：每完成一张星座，按配置领一份 tcr。
 * 每天只能领一次，按 `resonance:<日期>` 占里程碑唯一键防止重复发放。
 */
export async function claimCollectionResonance(
  userId: string,
  config: CollectionConfig,
): Promise<ResonanceResult> {
  const activityKey = assertActiveWindow(config);
  const today = cnDateString();
  const { snapshot, result } = await attemptWrite(userId, activityKey, (state) => {
    if (state.resonanceDay === today) {
      throw new CollectionError("今天已经共鸣过了，明天再来");
    }
    const done = completedConstellations(new Set(state.nodes));
    if (done.length === 0) throw new CollectionError("还没有点亮的星座，先把星位连起来");
    state.resonanceDay = today;
    return { next: state, result: done };
  });

  let reward = 0;
  if (config.resonanceReward > 0) {
    const granted = await listGrantedMilestones(userId, "collection", activityKey);
    if (!granted.has(`resonance:${today}`)) {
      const grantedResult = await grantActivityMilestone({
        userId,
        kind: "collection",
        activityKey,
        tierKey: `resonance:${today}`,
        reward: Math.round(config.resonanceReward * result.length * 100) / 100,
        topupType: TOPUP_TYPE_COLLECTION,
        description: `星图共鸣 · ${result.length} 座星座 · ${today}`,
        validDays: config.rewardValidDays,
      });
      reward = grantedResult.granted ? grantedResult.reward : 0;
    }
  }

  return {
    state: snapshot.state,
    version: snapshot.version,
    milestoneReward: reward,
    completedSets: [],
    reward,
    constellations: result,
  };
}

/** 补领已完成但还没发出的星座奖励。 */
export async function claimCollectionMilestones(
  userId: string,
  config: CollectionConfig,
): Promise<{ reward: number; sets: string[]; state: CollectionState; version: number }> {
  const activityKey = assertActiveWindow(config);
  const snapshot = await readState(userId, activityKey);
  const milestone = await grantSetMilestones({
    userId,
    activityKey,
    config,
    state: snapshot.state,
  });
  return {
    reward: milestone.reward,
    sets: milestone.sets,
    state: snapshot.state,
    version: snapshot.version,
  };
}

export async function getCollectionSnapshot(
  userId: string,
  activityKey: string | null,
): Promise<CollectionSnapshot> {
  if (!activityKey) return { version: 0, state: emptyCollectionState() };
  return readState(userId, activityKey);
}
