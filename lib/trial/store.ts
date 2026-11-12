import { and, desc, eq, inArray } from "drizzle-orm";
import { d1Run, db } from "@/lib/db/d1-http";
import { topups, trialRuns } from "@/lib/db/schema";
import {
  couponTicketBalance,
  payWithCoupon,
  refundCouponPayment,
} from "@/lib/activity/coupons";
import { grantTempCredits } from "@/lib/activity/rewards";
import { refundPermanentCredits, spendCredits } from "@/lib/billing/spend";
import { getTemporaryBalance } from "@/lib/billing/display-balance";
import {
  TOPUP_TYPE_TRIAL,
  trialActivityKey,
  trialActivityWindow,
  trialRewardFor,
  type TrialConfig,
} from "./config";
import { SAGA_CHAPTERS, SAGA_ITEM_BY_ID } from "./saga/data";
import {
  SAGA_GOLD_PACK_BY_ID,
  bankCreditsForGold,
} from "./saga/bank";
import {
  generateSagaRun,
  parseSagaRun,
  sanitizeSagaCommands,
  settleSagaRun,
  SAGA_MAX_PURCHASES,
} from "./saga/run";
import { initialTrialSave, normalizeTrialSave } from "./saga/state";
import {
  SAGA_MAX_COMMANDS,
  type SagaPurchase,
  type SagaRun,
  type SagaRunResult,
  type TrialSave,
} from "./saga/types";

/**
 * 每日试炼·三国讨逆传的写入侧：进入一章 = 一行 `trial_run`。
 *
 * 玩法是连续剧情：存档里的 `chapter` 指向当前所在城镇，只有走完当前剧情才推进。
 * 存档、节点、商店购买与战果都装在 `questions` 列的 SagaRun JSON 里：
 * 进入一处地方时生成节点并落库，收兵只上传编制/购物/战斗指令，服务端按种子确定性重放。
 * 上一处地方的 `endSave` 就是下一处地方的起点，跨城镇成长不需要新表。
 */

export class TrialError extends Error {}

function assertActiveWindow(config: TrialConfig): string {
  const window = trialActivityWindow(config);
  if (window.status === "disabled") throw new TrialError("活动未开启");
  if (window.status === "pending") throw new TrialError("活动尚未开始");
  if (window.status === "ended") throw new TrialError("活动已结束");
  const key = trialActivityKey(config);
  if (!key) throw new TrialError("活动轮次无效");
  return key;
}

/** 八处地方全部平定后主线走完，不再开新的行军。 */
export function campaignComplete(save: TrialSave): boolean {
  return save.stats.wins >= SAGA_CHAPTERS.length;
}

export interface TrialSaveState {
  save: TrialSave;
  sourceRunId: string | null;
}

/** 取最近一次已收兵行军留下的存档；没有可继承的存档就发初始三人组。 */
export async function loadTrialSave(
  userId: string,
  activityKey: string | null,
): Promise<TrialSaveState> {
  if (!activityKey) return { save: initialTrialSave(), sourceRunId: null };
  const rows = await db
    .select({ id: trialRuns.id, questions: trialRuns.questions })
    .from(trialRuns)
    .where(
      and(
        eq(trialRuns.userId, userId),
        eq(trialRuns.activityKey, activityKey),
        inArray(trialRuns.status, ["scored", "expired"]),
      ),
    )
    .orderBy(desc(trialRuns.startedAt))
    .limit(8);
  for (const row of rows) {
    const run = parseSagaRun(row.questions);
    if (run?.endSave) return { save: normalizeTrialSave(run.endSave), sourceRunId: row.id };
  }
  return { save: initialTrialSave(), sourceRunId: null };
}

export interface ActiveTrialRun {
  runId: string;
  run: SagaRun;
  save: TrialSave;
  startedAt: number;
}

/** 还没收兵的一次行军；活动结束后也允许回来接着走剧情。 */
export async function findActiveTrialRun(
  userId: string,
  activityKey: string | null,
): Promise<ActiveTrialRun | null> {
  if (!activityKey) return null;
  const rows = await db
    .select({ id: trialRuns.id, questions: trialRuns.questions, startedAt: trialRuns.startedAt })
    .from(trialRuns)
    .where(
      and(
        eq(trialRuns.userId, userId),
        eq(trialRuns.activityKey, activityKey),
        eq(trialRuns.status, "active"),
      ),
    )
    .orderBy(desc(trialRuns.startedAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const run = parseSagaRun(row.questions);
  if (!run) return null;
  const startedAt = new Date(row.startedAt).getTime();
  return {
    runId: row.id,
    run,
    save: run.startSave,
    startedAt,
  };
}

export interface StartedTrial extends ActiveTrialRun {
  priceCredits: number;
}

function newSeed(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0];
}

/**
 * 从当前城镇出城：校验活动与剧情进度 → 扣券 → 生成这一路的节点落库。
 *
 * 已经有一次行军没收兵时直接复用，不再扣第二次券；旧版（v5 及更早）的数据
 * 就地换成新存档与新路线，同样不再扣券。主线走完后不再开新行军。
 */
export async function startTrialRun(userId: string, config: TrialConfig): Promise<StartedTrial> {
  const activityKey = assertActiveWindow(config);
  const existing = await findActiveTrialRun(userId, activityKey);
  if (existing) {
    return {
      ...existing,
      priceCredits: config.runPriceCredits,
    };
  }

  const { save } = await loadTrialSave(userId, activityKey);
  if (campaignComplete(save)) {
    throw new TrialError("讨逆之路已经走完，全剧终");
  }

  const stale = await db
    .select({ id: trialRuns.id })
    .from(trialRuns)
    .where(
      and(
        eq(trialRuns.userId, userId),
        eq(trialRuns.activityKey, activityKey),
        eq(trialRuns.status, "active"),
      ),
    )
    .orderBy(desc(trialRuns.startedAt))
    .limit(1);

  const now = Date.now();
  const buildRun = () =>
    generateSagaRun({
      activityKey,
      save,
      nodeCount: config.questionCount,
      seed: newSeed(),
    });

  if (stale[0]) {
    // 旧版本对局（文字题 / 横版动作）解析失败会走到这里：换新地图重开，不重复扣券。
    const run = buildRun();
    await d1Run(
      `UPDATE trial_run SET questions = ?, questionCount = ?, correct = 0, durationMs = 0, startedAt = ?
        WHERE id = ? AND userId = ? AND status = 'active'`,
      [JSON.stringify(run), run.nodes.length, new Date(now), stale[0].id, userId],
    );
    return {
      runId: stale[0].id,
      run,
      save: run.startSave,
      startedAt: now,
      priceCredits: config.runPriceCredits,
    };
  }

  const paid = await payWithCoupon(
    userId,
    "trial",
    activityKey,
    config.runPriceCredits,
    config.couponUnitCredits,
  );
  if (!paid.ok) throw new TrialError(paid.reason);

  const run = buildRun();
  const runId = crypto.randomUUID();
  try {
    await db.insert(trialRuns).values({
      id: runId,
      userId,
      activityKey,
      status: "active",
      questions: JSON.stringify(run),
      questionCount: run.nodes.length,
      startedAt: new Date(now),
    });
  } catch (error) {
    await db.delete(trialRuns).where(eq(trialRuns.id, runId)).catch(() => undefined);
    await refundCouponPayment(paid.payment);
    throw error;
  }

  return {
    runId,
    run,
    save: run.startSave,
    startedAt: now,
    priceCredits: config.runPriceCredits,
  };
}

export interface TrialSettlement {
  /** true = 这次行军之前已经收过兵（重试），没有重复发奖。 */
  already: boolean;
  cleared: number;
  total: number;
  /** 本次到账的 tcr 合计 = 通关奖励 + 钱庄存金。 */
  reward: number;
  /** 其中平定此处的通关奖励。 */
  clearReward: number;
  /** 收兵时存进钱庄、已经折成 tcr 的金币。 */
  bankGold: number;
  /** 钱庄存金换到的 tcr。 */
  bankTcr: number;
  durationMs: number;
  victory: boolean;
  result: SagaRunResult | null;
}

function settlementFromStored(run: SagaRun, cleared: number, total: number): TrialSettlement {
  const result = run.result ?? null;
  const bankGold = result?.bankedGold ?? 0;
  return {
    already: true,
    cleared,
    total,
    reward: 0,
    clearReward: 0,
    bankGold,
    bankTcr: bankCreditsForGold(bankGold),
    durationMs: 0,
    victory: result?.victory ?? cleared >= total,
    result,
  };
}

/**
 * 收兵：先条件更新占住这次行军，再发奖；发奖失败把状态改回 active 让用户能重试。
 * tcr 只在平定此处（攻克全章、推进剧情）时发放，且主线走完后不再重复发。
 */
export async function submitTrialRun(input: {
  userId: string;
  runId: string;
  commands: unknown[];
  config: TrialConfig;
}): Promise<TrialSettlement> {
  const activityKey = trialActivityKey(input.config);
  if (!activityKey) throw new TrialError("活动轮次无效");

  const rows = await db
    .select()
    .from(trialRuns)
    .where(and(eq(trialRuns.id, input.runId), eq(trialRuns.userId, input.userId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new TrialError("行军不存在");
  if (row.activityKey !== activityKey) throw new TrialError("这次行军不属于当前活动");
  const run = parseSagaRun(row.questions);
  if (!run) throw new TrialError("行军数据异常，请重新出发");

  if (row.status !== "active") {
    const stored = settlementFromStored(run, Number(row.correct), Number(row.questionCount));
    const total = Number(row.rewardCredits ?? 0);
    return {
      ...stored,
      reward: total,
      clearReward: Math.max(0, Math.round((total - stored.bankTcr) * 100) / 100),
      durationMs: Number(row.durationMs ?? 0),
    };
  }

  const now = Date.now();
  const startedAt = new Date(row.startedAt).getTime();
  const durationMs = Math.max(0, now - startedAt);
  const commands = sanitizeSagaCommands(input.commands.slice(0, SAGA_MAX_COMMANDS));
  const settled = settleSagaRun(run, commands);
  const cleared = settled.cleared;
  const clearReward =
    settled.victory && run.startSave.stats.wins < SAGA_CHAPTERS.length
      ? trialRewardFor(input.config, cleared)
      : 0;
  const bankGold = settled.result.bankedGold;
  const bankTcr = bankCreditsForGold(bankGold);
  const reward = Math.round((clearReward + bankTcr) * 100) / 100;
  const status = "scored";
  const storedRun: SagaRun = { ...run, endSave: settled.endSave, result: settled.result };

  const claimed = await d1Run(
    `UPDATE trial_run SET status = ?, correct = ?, durationMs = ?, rewardCredits = ?, questions = ?, submittedAt = ?
      WHERE id = ? AND userId = ? AND status = 'active'`,
    [
      status,
      cleared,
      durationMs,
      reward,
      JSON.stringify(storedRun),
      now,
      input.runId,
      input.userId,
    ],
  );
  if (claimed.changes !== 1) {
    const latest = await db
      .select({
        status: trialRuns.status,
        correct: trialRuns.correct,
        questionCount: trialRuns.questionCount,
        rewardCredits: trialRuns.rewardCredits,
        durationMs: trialRuns.durationMs,
        questions: trialRuns.questions,
      })
      .from(trialRuns)
      .where(eq(trialRuns.id, input.runId))
      .limit(1);
    const stored = latest[0];
    const latestRun = parseSagaRun(stored?.questions);
    const fallback = latestRun
      ? settlementFromStored(
          latestRun,
          Number(stored?.correct ?? 0),
          Number(stored?.questionCount ?? run.nodes.length),
        )
      : {
          already: true,
          cleared: 0,
          total: run.nodes.length,
          reward: 0,
          clearReward: 0,
          bankGold: 0,
          bankTcr: 0,
          durationMs: 0,
          victory: false,
          result: null,
        };
    const totalReward = Number(stored?.rewardCredits ?? 0);
    return {
      ...fallback,
      reward: totalReward,
      // 合计里先扣掉钱庄那部分，剩下的才是通关奖励；旧数据没有 bankTcr，正好全额算通关。
      clearReward: Math.max(0, Math.round((totalReward - fallback.bankTcr) * 100) / 100),
      durationMs: Number(stored?.durationMs ?? 0),
    };
  }

  if (reward > 0) {
    try {
      const parts: string[] = [];
      if (clearReward > 0) parts.push(`平定${settled.result.chapterName || "此地"}奖励`);
      if (bankTcr > 0) parts.push(`钱庄存金 ${bankGold} 金`);
      await grantTempCredits({
        userId: input.userId,
        amount: reward,
        topupType: TOPUP_TYPE_TRIAL,
        description: `三国讨逆传 ${parts.join(" + ")}`,
        validDays: input.config.rewardValidDays,
      });
    } catch (error) {
      await d1Run(
        "UPDATE trial_run SET status = 'active', submittedAt = NULL WHERE id = ? AND status = ?",
        [input.runId, status],
      ).catch(() => undefined);
      throw error;
    }
  }

  return {
    already: false,
    cleared,
    total: run.nodes.length,
    reward,
    clearReward,
    bankGold,
    bankTcr,
    durationMs,
    victory: settled.victory,
    result: settled.result,
  };
}

export interface SupplyPurchaseResult {
  purchases: SagaPurchase[];
  /** 买完这一笔后，本活动还剩多少张券。 */
  tickets: number;
}

const PURCHASE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * 行军军需：真实扣活动券，把购买记录追加进行军 JSON。
 *
 * 用「整段 JSON 相等」做乐观锁：并发下单只有一单能写进去，另一单退款；
 * 同一个 purchaseId 重复提交直接返回当前购买列表，不会二次扣费。
 */
export async function buyTrialSupply(input: {
  userId: string;
  runId: string;
  itemId: string;
  purchaseId: string;
  cmdIndex: number;
  config: TrialConfig;
}): Promise<SupplyPurchaseResult> {
  const activityKey = assertActiveWindow(input.config);
  const purchaseId = String(input.purchaseId ?? "");
  if (!PURCHASE_ID_PATTERN.test(purchaseId)) throw new TrialError("购买凭据无效");
  const item = SAGA_ITEM_BY_ID.get(String(input.itemId ?? ""));
  if (!item || item.kind !== "supply" || !item.priceTickets) throw new TrialError("该商品不在军需商店");

  const rows = await db
    .select({
      id: trialRuns.id,
      status: trialRuns.status,
      questions: trialRuns.questions,
      activityKey: trialRuns.activityKey,
    })
    .from(trialRuns)
    .where(and(eq(trialRuns.id, input.runId), eq(trialRuns.userId, input.userId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new TrialError("行军不存在");
  if (row.activityKey !== activityKey) throw new TrialError("这次行军不属于当前活动");
  if (row.status !== "active") throw new TrialError("这次行军已经结束");
  const run = parseSagaRun(row.questions);
  if (!run) throw new TrialError("行军数据异常，请重新出发");

  if (run.purchases.some((purchase) => purchase.id === purchaseId)) {
    return {
      purchases: run.purchases,
      tickets: await couponTicketBalance(input.userId, "trial", activityKey, input.config.couponUnitCredits),
    };
  }
  if (run.purchases.length >= SAGA_MAX_PURCHASES) throw new TrialError("这次行军买得够多了");
  const passive = item.supply !== "heal" && item.supply !== "revive";
  if (passive && run.purchases.some((purchase) => purchase.itemId === item.id)) {
    throw new TrialError(`${item.name}每次行军只能生效一份`);
  }

  const cmdIndex = Math.max(0, Math.min(SAGA_MAX_COMMANDS, Math.trunc(Number(input.cmdIndex) || 0)));
  const cost = item.priceTickets * input.config.couponUnitCredits;
  const paid = await payWithCoupon(
    input.userId,
    "trial",
    activityKey,
    cost,
    input.config.couponUnitCredits,
  );
  if (!paid.ok) throw new TrialError(paid.reason);

  const next: SagaRun = {
    ...run,
    purchases: [
      ...run.purchases,
      {
        id: purchaseId,
        itemId: item.id,
        tickets: item.priceTickets,
        at: Date.now(),
        cmdIndex,
      },
    ],
    shopSeq: run.shopSeq + 1,
  };
  const updated = await d1Run(
    `UPDATE trial_run SET questions = ?
      WHERE id = ? AND userId = ? AND status = 'active' AND questions = ?`,
    [JSON.stringify(next), input.runId, input.userId, row.questions],
  );
  if (updated.changes !== 1) {
    await refundCouponPayment(paid.payment);
    throw new TrialError("行军状态已变化，请刷新页面后重试");
  }

  return {
    purchases: next.purchases,
    tickets: await couponTicketBalance(input.userId, "trial", activityKey, input.config.couponUnitCredits),
  };
}

export interface GoldPurchaseResult {
  purchases: SagaPurchase[];
  /** 换完这一笔后还剩多少 tcr（未过期的临时余额）。 */
  tcr: number;
}

/**
 * 钱庄换金：只扣未过期的 tcr，按固定档位把金币追加进行军 JSON。
 *
 * 金币不是服务端余额，不能只扣钱不落账：购买记录本身就是发金凭据，
 * 收兵重放时从 cmdIndex 起加进存档。并发 CAS 失败会把 tcr 按永久 cr 退回
 * （与买券失败的回滚同口径，钱不会凭空消失）。
 */
export async function buyTrialGold(input: {
  userId: string;
  runId: string;
  packId: string;
  purchaseId: string;
  cmdIndex: number;
  config: TrialConfig;
}): Promise<GoldPurchaseResult> {
  const activityKey = assertActiveWindow(input.config);
  const purchaseId = String(input.purchaseId ?? "");
  if (!PURCHASE_ID_PATTERN.test(purchaseId)) throw new TrialError("购买凭据无效");
  const pack = SAGA_GOLD_PACK_BY_ID.get(String(input.packId ?? ""));
  if (!pack) throw new TrialError("该档金币不在钱庄");

  const rows = await db
    .select({
      id: trialRuns.id,
      status: trialRuns.status,
      questions: trialRuns.questions,
      activityKey: trialRuns.activityKey,
    })
    .from(trialRuns)
    .where(and(eq(trialRuns.id, input.runId), eq(trialRuns.userId, input.userId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new TrialError("行军不存在");
  if (row.activityKey !== activityKey) throw new TrialError("这次行军不属于当前活动");
  if (row.status !== "active") throw new TrialError("这次行军已经结束");
  const run = parseSagaRun(row.questions);
  if (!run) throw new TrialError("行军数据异常，请重新出发");

  if (run.purchases.some((purchase) => purchase.id === purchaseId)) {
    return { purchases: run.purchases, tcr: await getTemporaryBalance(input.userId) };
  }
  if (run.purchases.length >= SAGA_MAX_PURCHASES) throw new TrialError("这次行军买得够多了");

  const paid = await spendCredits(input.userId, pack.tcr, { temporaryOnly: true });
  if (!paid.ok) throw new TrialError(`${paid.reason}：换 ${pack.gold} 金需要 ${pack.tcr} tcr`);

  const topupId = crypto.randomUUID();
  try {
    await db.insert(topups).values({
      id: topupId,
      userId: input.userId,
      amount: -pack.tcr,
      type: TOPUP_TYPE_TRIAL,
      description: `三国讨逆传 钱庄换金（${pack.tcr} tcr → ${pack.gold} 金）`,
      createdAt: new Date(),
    });
  } catch (error) {
    await refundPermanentCredits(input.userId, pack.tcr, "钱庄换金记账失败回滚");
    throw error;
  }

  const cmdIndex = Math.max(0, Math.min(SAGA_MAX_COMMANDS, Math.trunc(Number(input.cmdIndex) || 0)));
  const next: SagaRun = {
    ...run,
    purchases: [
      ...run.purchases,
      { id: purchaseId, itemId: pack.id, tickets: 0, at: Date.now(), cmdIndex },
    ],
    shopSeq: run.shopSeq + 1,
  };
  const updated = await d1Run(
    `UPDATE trial_run SET questions = ?
      WHERE id = ? AND userId = ? AND status = 'active' AND questions = ?`,
    [JSON.stringify(next), input.runId, input.userId, row.questions],
  );
  if (updated.changes !== 1) {
    await d1Run("DELETE FROM topup WHERE id = ?", [topupId]).catch(() => undefined);
    await refundPermanentCredits(input.userId, pack.tcr, "钱庄换金冲突回滚");
    throw new TrialError("行军状态已变化，请刷新页面后重试");
  }

  return { purchases: next.purchases, tcr: await getTemporaryBalance(input.userId) };
}

export interface TrialHistoryRow {
  id: string;
  /** 攻克的节点数（沿用旧列名）。 */
  correct: number;
  /** 这趟行军的总节点数。 */
  questionCount: number;
  reward: number;
  startedAt: Date;
  status: string;
}

/** 本活动最近的行军记录（含仍在进行的）。 */
export async function listTrialRuns(
  userId: string,
  activityKey: string | null,
  limit = 10,
): Promise<TrialHistoryRow[]> {
  if (!activityKey) return [];
  const rows = await db
    .select({
      id: trialRuns.id,
      correct: trialRuns.correct,
      questionCount: trialRuns.questionCount,
      rewardCredits: trialRuns.rewardCredits,
      startedAt: trialRuns.startedAt,
      status: trialRuns.status,
    })
    .from(trialRuns)
    .where(and(eq(trialRuns.userId, userId), eq(trialRuns.activityKey, activityKey)))
    .orderBy(desc(trialRuns.startedAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    correct: Number(row.correct),
    questionCount: Number(row.questionCount),
    reward: Number(row.rewardCredits),
    startedAt: new Date(row.startedAt),
    status: row.status,
  }));
}
