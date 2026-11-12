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
  rollGatherTier,
  TOPUP_TYPE_WORKSHOP,
  WORKSHOP_LINES,
  WORKSHOP_TIER_COUNT,
  workshopActivityKey,
  workshopActivityWindow,
  workshopTierName,
  type WorkshopConfig,
} from "./config";

/**
 * 灵宠工坊的写入侧。
 *
 * 状态整体存 JSON，写入用 `WHERE version = ?` 的乐观锁：并发采集/合成只有一个能推进，
 * 另一个收到「操作冲突」。采集先扣券再改状态，CAS 全部失败时把券退回。
 */

export class WorkshopError extends Error {}

export interface WorkshopState {
  /** 北京日期；换天后 `gathersToday` 归零。 */
  day: string;
  gathersToday: number;
  /** 每条养成线 9 个阶位的数量。 */
  items: Record<string, number[]>;
}

export interface WorkshopSnapshot {
  version: number;
  state: WorkshopState;
}

function emptyState(day = cnDateString()): WorkshopState {
  return {
    day,
    gathersToday: 0,
    items: Object.fromEntries(WORKSHOP_LINES.map((line) => [line.key, Array(WORKSHOP_TIER_COUNT).fill(0)])),
  };
}

/** 脏 JSON 兜回可用状态：补齐缺失的线、截断超长数组、换天重置每日次数。 */
export function normalizeWorkshopState(raw: unknown, day = cnDateString()): WorkshopState {
  const base = emptyState(day);
  if (!raw || typeof raw !== "object") return base;
  const it = raw as Partial<WorkshopState>;
  const sameDay = typeof it.day === "string" && it.day === day;
  const items = (it.items && typeof it.items === "object" ? it.items : {}) as Record<string, unknown>;
  for (const line of WORKSHOP_LINES) {
    const counts = Array.isArray(items[line.key]) ? (items[line.key] as unknown[]) : [];
    base.items[line.key] = Array.from({ length: WORKSHOP_TIER_COUNT }, (_, index) => {
      const n = Math.trunc(Number(counts[index]));
      return Number.isFinite(n) && n > 0 ? Math.min(99_999, n) : 0;
    });
  }
  base.gathersToday = sameDay
    ? Math.max(0, Math.min(1_000_000, Math.trunc(Number(it.gathersToday) || 0)))
    : 0;
  return base;
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

async function readState(userId: string, activityKey: string): Promise<WorkshopSnapshot> {
  const rows = await db
    .select({ version: workshopStates.version, state: workshopStates.state })
    .from(workshopStates)
    .where(and(eq(workshopStates.userId, userId), eq(workshopStates.activityKey, activityKey)))
    .limit(1);
  const row = rows[0];
  if (!row) return { version: 0, state: emptyState() };
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
  const now = Date.now();
  await d1Run(
    `INSERT OR IGNORE INTO workshop_state (userId, activityKey, version, state, updatedAt)
     VALUES (?, ?, 0, ?, ?)`,
    [userId, activityKey, JSON.stringify(emptyState()), now],
  );
}

/** 带乐观锁的写入；成功后返回新状态，冲突返回 null。 */
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

/** 达到的最高阶（跨三条线），用于判断里程碑。 */
export function highestTier(state: WorkshopState): number {
  let max = 0;
  for (const line of WORKSHOP_LINES) {
    const counts = state.items[line.key] ?? [];
    counts.forEach((count, index) => {
      if (count > 0) max = Math.max(max, index + 1);
    });
  }
  return max;
}

export interface WorkshopActionResult {
  state: WorkshopState;
  version: number;
  /** 本次新领到的里程碑 tcr 合计。 */
  milestoneReward: number;
  milestoneTiers: number[];
  /** 采集结果（合成时为空）。 */
  gathered?: { lineKey: string; tier: number; name: string };
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
 * 采集：扣一张券的票面，随机得到 1~3 阶灵宠。
 * 状态写入冲突（并发操作）时重试整轮；三次都失败就把券退回。
 */
export async function gatherWorkshop(
  userId: string,
  lineKey: string,
  config: WorkshopConfig,
): Promise<WorkshopActionResult> {
  const activityKey = assertActiveWindow(config);
  const line = WORKSHOP_LINES.find((item) => item.key === lineKey);
  if (!line) throw new WorkshopError("养成线不存在");

  await ensureStateRow(userId, activityKey);
  const paid = await payWithCoupon(
    userId,
    "workshop",
    activityKey,
    config.gatherCostCredits,
    config.couponUnitCredits,
  );
  if (!paid.ok) throw new WorkshopError(paid.reason);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let snapshot: WorkshopSnapshot;
    try {
      snapshot = await readState(userId, activityKey);
    } catch (error) {
      // 读不到状态时还没有写库，券可以安全退回。
      await refundCouponPayment(paid.payment);
      throw error;
    }
    if (snapshot.state.gathersToday >= config.dailyGathers) {
      await refundCouponPayment(paid.payment);
      throw new WorkshopError(`今日采集次数已用完（${config.dailyGathers} 次），明天再来`);
    }
    const tier = rollGatherTier(config.gatherWeights);
    const next: WorkshopState = {
      ...snapshot.state,
      day: cnDateString(),
      gathersToday: snapshot.state.gathersToday + 1,
      items: {
        ...snapshot.state.items,
        [line.key]: snapshot.state.items[line.key].map((count, index) =>
          index === tier - 1 ? count + 1 : count,
        ),
      },
    };
    const written = await writeState(userId, activityKey, snapshot, next);
    if (!written) continue;

    const milestone = await grantReachedMilestones({
      userId,
      activityKey,
      config,
      state: written.state,
    });
    return {
      state: written.state,
      version: written.version,
      milestoneReward: milestone.reward,
      milestoneTiers: milestone.tiers,
      gathered: {
        lineKey: line.key,
        tier,
        name: workshopTierName(line.key, tier),
      },
    };
  }

  await refundCouponPayment(paid.payment);
  throw new WorkshopError("操作冲突，请刷新后重试");
}

/**
 * 合成：两只同阶换一只高一阶（确定性的，不消耗活动券）。
 * 第 9 阶是终点，不能继续合成。
 */
export async function mergeWorkshop(
  userId: string,
  lineKey: string,
  tier: number,
  config: WorkshopConfig,
): Promise<WorkshopActionResult> {
  const activityKey = assertActiveWindow(config);
  const line = WORKSHOP_LINES.find((item) => item.key === lineKey);
  if (!line) throw new WorkshopError("养成线不存在");
  const sourceTier = Math.trunc(Number(tier));
  if (!Number.isInteger(sourceTier) || sourceTier < 1 || sourceTier >= WORKSHOP_TIER_COUNT) {
    throw new WorkshopError("只有 1~8 阶可以合成");
  }

  await ensureStateRow(userId, activityKey);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const snapshot = await readState(userId, activityKey);
    const counts = snapshot.state.items[line.key];
    if ((counts[sourceTier - 1] ?? 0) < 2) {
      throw new WorkshopError(`两只同阶${workshopTierName(line.key, sourceTier)}才能合成`);
    }
    const nextItems = counts.slice();
    nextItems[sourceTier - 1] -= 2;
    nextItems[sourceTier] += 1;
    const next: WorkshopState = {
      ...snapshot.state,
      items: { ...snapshot.state.items, [line.key]: nextItems },
    };
    const written = await writeState(userId, activityKey, snapshot, next);
    if (!written) continue;

    const milestone = await grantReachedMilestones({
      userId,
      activityKey,
      config,
      state: written.state,
    });
    return {
      state: written.state,
      version: written.version,
      milestoneReward: milestone.reward,
      milestoneTiers: milestone.tiers,
    };
  }
  throw new WorkshopError("操作冲突，请刷新后重试");
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
  if (!activityKey) return { version: 0, state: emptyState() };
  return readState(userId, activityKey);
}
