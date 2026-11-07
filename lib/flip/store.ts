import { and, asc, eq, gte, sql } from "drizzle-orm";
import { d1Run, db } from "@/lib/db/d1-http";
import { flipRounds, temporaryBalances, topups, type FlipRound } from "@/lib/db/schema";
import { payWithCoupon, refundCouponPayment } from "@/lib/activity/coupons";
import { cnStartOfToday } from "@/lib/date";
import {
  dealFlipBoard,
  FLIP_CARD_COUNT,
  flipActivityKey,
  flipActivityWindow,
  formatFlipReward,
  parseFlipBoard,
  round2,
  TOPUP_TYPE_FLIP,
  type FlipConfig,
} from "./config";

/**
 * 翻牌夺宝的写入侧原语。
 *
 * D1 走 REST、没有事务，所以这里的每一步都按「可以先占住、失败能原路退回」来写：
 * 牌桌在开局那一刻就洗好落库，翻开靠一条带 `status = 'open'` 条件的 UPDATE 占位，
 * 连点与并发重试只有一个能命中，另一次只会看到「这一局已经翻过了」。
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export class FlipError extends Error {}

function assertActiveWindow(config: FlipConfig): string {
  const window = flipActivityWindow(config);
  if (window.status === "disabled") throw new FlipError("活动未开启");
  if (window.status === "pending") throw new FlipError("活动尚未开始");
  if (window.status === "ended") throw new FlipError("活动已结束");
  const key = flipActivityKey(config);
  if (!key) throw new FlipError("活动轮次无效");
  return key;
}

/** 今日（北京时间）已开局次数。 */
export async function countRoundsToday(userId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(flipRounds)
    .where(and(eq(flipRounds.userId, userId), gte(flipRounds.createdAt, cnStartOfToday())));
  return Number(rows[0]?.n ?? 0);
}

export interface PendingRound {
  roundId: string;
  priceCredits: number;
  /** 本局在牌桌上的第几张（0 起），翻完才有值。 */
  position: number | null;
  createdAt: Date | null;
  /** true = 这是上一局没翻完的牌，本次没有再扣一次票价。 */
  reused: boolean;
}

/** 还没翻完的那局牌；用户中途关页面后靠它续上。 */
export async function findOpenRound(userId: string): Promise<PendingRound | null> {
  const rows = await db
    .select()
    .from(flipRounds)
    .where(and(eq(flipRounds.userId, userId), eq(flipRounds.status, "open")))
    .orderBy(asc(flipRounds.createdAt))
    .limit(1);
  const row = rows[0] as FlipRound | undefined;
  if (!row) return null;
  return {
    roundId: row.id,
    priceCredits: Number(row.priceCredits),
    position: row.position ?? null,
    createdAt: row.createdAt ?? null,
    reused: true,
  };
}

export type OpenedRound = PendingRound;

/**
 * 开一局：扣票价、洗牌桌、落库。
 *
 * 已经有没翻完的局时直接复用那一局、不再扣第二次钱——所以并发连点最坏结果是
 * 「两个请求都拿到同一局」或「多扣一次但多一局可玩」，不存在付一次钱翻两次牌。
 * 建局或记流水失败就退回扣款，不留下「花了钱没牌桌」的状态。
 */
export async function openRound(
  userId: string,
  config: FlipConfig,
  now = new Date(),
): Promise<OpenedRound> {
  const activityKey = assertActiveWindow(config);

  const existing = await findOpenRound(userId);
  if (existing) return existing;

  const roundsToday = await countRoundsToday(userId);
  if (roundsToday >= config.dailyRounds) {
    throw new FlipError(`今日开局次数已用完（${config.dailyRounds} 局），明天再来`);
  }

  const price = round2(config.roundPriceCredits);
  const paid = await payWithCoupon(userId, "flip", activityKey, price);
  if (!paid.ok) {
    throw new FlipError(`余额不足：开一局需要 ${price} cr`);
  }
  const payment = paid.payment;

  const roundId = crypto.randomUUID();
  try {
    await db.insert(flipRounds).values({
      id: roundId,
      userId,
      activityKey,
      status: "open",
      priceCredits: price,
      board: JSON.stringify(dealFlipBoard(config)),
      position: null,
      rewardCredits: null,
      createdAt: now,
      settledAt: null,
    });
    // 券是买券时已付过的 cr，流水只记本次真实现金支出，账本合计才和余额减少对得上。
    if (payment.creditPart > 0) {
      await db.insert(topups).values({
        id: crypto.randomUUID(),
        userId,
        amount: -payment.creditPart,
        type: TOPUP_TYPE_FLIP,
        description:
          payment.couponPart > 0
            ? `翻牌夺宝开局（${price} cr，活动券抵 ${payment.couponPart} cr）`
            : `翻牌夺宝开局（${price} cr）`,
        createdAt: now,
      });
    }
  } catch (error) {
    await db.delete(flipRounds).where(eq(flipRounds.id, roundId)).catch(() => undefined);
    await refundCouponPayment(userId, payment, `翻牌夺宝开局失败退回（${payment.creditPart} cr）`);
    throw error;
  }

  return { roundId, priceCredits: price, position: null, createdAt: now, reused: false };
}

export interface FlipOutcome {
  roundId: string;
  /** 翻开的是牌桌第几张（0 起）。 */
  position: number;
  /** 本张牌的实发 cr，0 = 空牌。 */
  reward: number;
  priceCredits: number;
  /** 结算后揭晓的整副牌桌；翻开之前它不会离开服务端。 */
  board: number[];
  rewardValidDays: number;
}

function normalizePosition(raw: unknown): number {
  const position = Math.trunc(Number(raw));
  if (!Number.isInteger(position) || position < 0 || position >= FLIP_CARD_COUNT) {
    throw new FlipError("这张牌不在牌桌上");
  }
  return position;
}

/**
 * 翻开一张牌：先占住这一局（条件 UPDATE），再发奖。
 *
 * 顺序不能反——发奖在前，连点就能把同一张牌兑两次。发奖失败会把这局退回未翻状态，
 * 用户可以直接再点一次那张牌，不用重新付票价。
 */
export async function flipCard(
  userId: string,
  roundId: string,
  rawPosition: unknown,
  config: FlipConfig,
  now = new Date(),
): Promise<FlipOutcome> {
  const activityKey = assertActiveWindow(config);
  const position = normalizePosition(rawPosition);

  const rows = await db
    .select()
    .from(flipRounds)
    .where(and(eq(flipRounds.id, roundId), eq(flipRounds.userId, userId)))
    .limit(1);
  const round = rows[0] as FlipRound | undefined;
  if (!round) throw new FlipError("牌局不存在");
  if (round.status !== "open") throw new FlipError("这一局已经翻过了，开新的一局吧");
  if (round.activityKey !== activityKey) throw new FlipError("这局牌不属于当前活动");

  const board = parseFlipBoard(round.board);
  const reward = round2(board[position] ?? 0);
  const priceCredits = Number(round.priceCredits);

  const claimed = await d1Run(
    "UPDATE flip_round SET status = 'settled', position = ?, rewardCredits = ?, settledAt = ? " +
      "WHERE id = ? AND userId = ? AND status = 'open'",
    [position, reward, now.getTime(), roundId, userId],
  );
  if (claimed.changes !== 1) throw new FlipError("这一局已经翻过了，开新的一局吧");

  if (reward > 0) {
    const expiresAt = new Date(now.getTime() + config.rewardValidDays * DAY_MS);
    const cardLabel = `第 ${position + 1} 张`;
    try {
      await Promise.all([
        db.insert(temporaryBalances).values({
          id: crypto.randomUUID(),
          userId,
          amount: reward,
          expiresAt,
          description: `翻牌夺宝 ${cardLabel}中奖 ${formatFlipReward(reward)}（有效期 ${config.rewardValidDays} 天）`,
          createdAt: now,
        }),
        db.insert(topups).values({
          id: crypto.randomUUID(),
          userId,
          amount: reward,
          type: TOPUP_TYPE_FLIP,
          description: `翻牌夺宝 ${cardLabel}${formatFlipReward(reward)}`,
          createdAt: now,
        }),
      ]);
    } catch (error) {
      // 退回未翻状态：奖励没发出去，这局不该算完，用户重点那张牌即可。
      await d1Run(
        "UPDATE flip_round SET status = 'open', position = NULL, rewardCredits = NULL, settledAt = NULL WHERE id = ?",
        [roundId],
      ).catch(() => undefined);
      throw error;
    }
  }

  return { roundId, position, reward, priceCredits, board, rewardValidDays: config.rewardValidDays };
}
