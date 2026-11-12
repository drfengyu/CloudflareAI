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
  COLLECTION_SETS,
  collectionActivityKey,
  collectionActivityWindow,
  collectionItemKey,
  completedSets,
  findCollectionItem,
  isSetComplete,
  rollCollectionItem,
  TOPUP_TYPE_COLLECTION,
  type CollectionConfig,
} from "./config";

/**
 * 星匣图鉴的写入侧。
 *
 * 状态（已收集条目 / 星尘 / 当日开匣数）整体存 JSON，写入用乐观锁版本号；
 * 开匣先扣券，CAS 连续失败时退回。集齐奖励先占 `activity_milestone` 唯一键再发 tcr。
 */

export class CollectionError extends Error {}

export interface CollectionState {
  day: string;
  boxesToday: number;
  dust: number;
  /** 藏品键 `setKey/itemKey`。 */
  owned: string[];
}

export interface CollectionSnapshot {
  version: number;
  state: CollectionState;
}

function emptyState(day = cnDateString()): CollectionState {
  return { day, boxesToday: 0, dust: 0, owned: [] };
}

export function normalizeCollectionState(raw: unknown, day = cnDateString()): CollectionState {
  const base = emptyState(day);
  if (!raw || typeof raw !== "object") return base;
  const it = raw as Partial<CollectionState>;
  const sameDay = typeof it.day === "string" && it.day === day;
  const valid = new Set(COLLECTION_SETS.flatMap((set) => set.items.map((item) => collectionItemKey(set.key, item.key))));
  const owned = Array.isArray(it.owned) ? it.owned : [];
  base.owned = Array.from(
    new Set(owned.filter((key): key is string => typeof key === "string" && valid.has(key))),
  );
  base.dust = Math.max(0, Math.min(1_000_000, Math.trunc(Number(it.dust) || 0)));
  base.boxesToday = sameDay
    ? Math.max(0, Math.min(1_000_000, Math.trunc(Number(it.boxesToday) || 0)))
    : 0;
  return base;
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
  if (!row) return { version: 0, state: emptyState() };
  return { version: Number(row.version), state: normalizeCollectionState(safeParse(row.state)) };
}

async function ensureStateRow(userId: string, activityKey: string): Promise<void> {
  await d1Run(
    `INSERT OR IGNORE INTO collection_state (userId, activityKey, version, state, updatedAt)
     VALUES (?, ?, 0, ?, ?)`,
    [userId, activityKey, JSON.stringify(emptyState()), Date.now()],
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

async function grantSetMilestones(input: {
  userId: string;
  activityKey: string;
  config: CollectionConfig;
  state: CollectionState;
}): Promise<{ reward: number; sets: string[] }> {
  const done = completedSets(new Set(input.state.owned));
  if (done.length === 0) return { reward: 0, sets: [] };
  const granted = await listGrantedMilestones(input.userId, "collection", input.activityKey);
  let reward = 0;
  const sets: string[] = [];
  for (const setKey of done) {
    const row = input.config.setRewards.find((item) => item.set === setKey);
    if (!row || row.reward <= 0) continue;
    const tierKey = `set:${setKey}`;
    if (granted.has(tierKey)) continue;
    const meta = COLLECTION_SETS.find((set) => set.key === setKey);
    const result = await grantActivityMilestone({
      userId: input.userId,
      kind: "collection",
      activityKey: input.activityKey,
      tierKey,
      reward: row.reward,
      topupType: TOPUP_TYPE_COLLECTION,
      description: `星匣图鉴集齐「${meta?.name ?? setKey}」奖励`,
      validDays: input.config.rewardValidDays,
    });
    if (result.granted) {
      reward += result.reward;
      sets.push(setKey);
    }
  }
  return { reward, sets };
}

export interface CollectionActionResult {
  state: CollectionState;
  version: number;
  milestoneReward: number;
  completedSets: string[];
}

export interface OpenBoxResult extends CollectionActionResult {
  setKey: string;
  itemKey: string;
  itemName: string;
  setName: string;
  isNew: boolean;
  dustGained: number;
}

/**
 * 开匣：扣一张券的票面，抽一件藏品；重复的折算星尘。
 * 并发写冲突时重试整轮，三次都失败退回券。
 */
export async function openCollectionBox(
  userId: string,
  config: CollectionConfig,
): Promise<OpenBoxResult> {
  const activityKey = assertActiveWindow(config);
  await ensureStateRow(userId, activityKey);
  const paid = await payWithCoupon(
    userId,
    "collection",
    activityKey,
    config.openCostCredits,
    config.couponUnitCredits,
  );
  if (!paid.ok) throw new CollectionError(paid.reason);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let snapshot: CollectionSnapshot;
    try {
      snapshot = await readState(userId, activityKey);
    } catch (error) {
      // 读不到状态时还没有写库，券可以安全退回。
      await refundCouponPayment(paid.payment);
      throw error;
    }
    if (snapshot.state.boxesToday >= config.dailyBoxes) {
      await refundCouponPayment(paid.payment);
      throw new CollectionError(`今日开匣次数已用完（${config.dailyBoxes} 次），明天再来`);
    }
    const rolled = rollCollectionItem();
    const key = collectionItemKey(rolled.setKey, rolled.itemKey);
    const owned = new Set(snapshot.state.owned);
    const isNew = !owned.has(key);
    const dustGained = isNew ? 0 : config.duplicateDust;
    if (isNew) owned.add(key);

    const next: CollectionState = {
      ...snapshot.state,
      day: cnDateString(),
      boxesToday: snapshot.state.boxesToday + 1,
      dust: Math.min(1_000_000, snapshot.state.dust + dustGained),
      owned: Array.from(owned),
    };
    const written = await writeState(userId, activityKey, snapshot, next);
    if (!written) continue;

    const milestone = await grantSetMilestones({
      userId,
      activityKey,
      config,
      state: written.state,
    });
    const meta = findCollectionItem(rolled.setKey, rolled.itemKey)!;
    return {
      state: written.state,
      version: written.version,
      milestoneReward: milestone.reward,
      completedSets: milestone.sets,
      setKey: rolled.setKey,
      itemKey: rolled.itemKey,
      itemName: meta.item.name,
      setName: meta.set.name,
      isNew,
      dustGained,
    };
  }

  await refundCouponPayment(paid.payment);
  throw new CollectionError("操作冲突，请刷新后重试");
}

/** 星尘定向兑换：只换未收集的藏品，价格按配置的星尘数。 */
export async function redeemCollectionItem(
  userId: string,
  setId: string,
  itemKey: string,
  config: CollectionConfig,
): Promise<CollectionActionResult & { setKey: string; itemKey: string }> {
  const activityKey = assertActiveWindow(config);
  const meta = findCollectionItem(setId, itemKey);
  if (!meta) throw new CollectionError("藏品不存在");

  await ensureStateRow(userId, activityKey);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const snapshot = await readState(userId, activityKey);
    const key = collectionItemKey(setId, itemKey);
    const owned = new Set(snapshot.state.owned);
    if (owned.has(key)) throw new CollectionError("这件藏品已经收集过了");
    if (snapshot.state.dust < config.dustPerItem) {
      throw new CollectionError(`星尘不足：兑换需要 ${config.dustPerItem}，当前 ${snapshot.state.dust}`);
    }
    if (isSetComplete(owned, setId)) throw new CollectionError("这个星匣已经集齐了");
    owned.add(key);
    const next: CollectionState = {
      ...snapshot.state,
      dust: snapshot.state.dust - config.dustPerItem,
      owned: Array.from(owned),
    };
    const written = await writeState(userId, activityKey, snapshot, next);
    if (!written) continue;

    const milestone = await grantSetMilestones({
      userId,
      activityKey,
      config,
      state: written.state,
    });
    return {
      state: written.state,
      version: written.version,
      milestoneReward: milestone.reward,
      completedSets: milestone.sets,
      setKey: setId,
      itemKey,
    };
  }
  throw new CollectionError("操作冲突，请刷新后重试");
}

/** 补领已集齐但还没发过的星匣奖励。 */
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
  if (!activityKey) return { version: 0, state: emptyState() };
  return readState(userId, activityKey);
}
