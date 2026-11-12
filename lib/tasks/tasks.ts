import { and, eq, gte, inArray, isNotNull, lt, sql, type AnyColumn } from "drizzle-orm";
import { db, d1Run } from "@/lib/db/d1-http";
import {
  activityTaskClaims,
  chatMessages,
  chatSessions,
  checkins,
  flipRounds,
  lotteryDraws,
  messages,
  raidenRuns,
  topups,
  trialRuns,
  usageLogs,
} from "@/lib/db/schema";
import { cnDateString, cnStartOfToday, parseCnWallClock, shiftDateString } from "@/lib/date";
import type { getTaskSettings } from "@/lib/settings";
import { normalizeCurrencyText } from "@/lib/billing/units";
import {
  attachRewardMessage,
  claimStateOf,
  discardRewardClaim,
  listRewardClaims,
  reserveRewardClaim,
  type RewardClaimRow,
  type RewardClaimState,
} from "@/lib/rewards/claims";
import { sendMessage, type Attachment } from "@/lib/message/messages";

export type TaskSettings = Awaited<ReturnType<typeof getTaskSettings>>;
export type TaskPeriod = "daily" | "weekly";

/** 钱包流水里任务成就占用的 type（8=消费返利、10=充值赠送已被占用）。 */
export const TASK_TOPUP_TYPE = 9;

export const DAILY_TARGET = 100;
export const WEEKLY_TARGET = 300;

const DAY_MS = 24 * 60 * 60 * 1000;
const round2 = (v: number) => Math.round(v * 100) / 100;

export interface PeriodWindow {
  key: string;
  start: Date;
  end: Date;
  label: string;
}

/** 周任务按北京时间的周一起算；周期 key 用本周一的日期，跨周自然开新一轮。 */
export function weeklyStartDate(date: string): string {
  const wall = new Date(`${date}T00:00:00Z`);
  const dow = wall.getUTCDay();
  return shiftDateString(date, dow === 0 ? -6 : 1 - dow);
}

export function periodWindow(period: TaskPeriod): PeriodWindow {
  const today = cnDateString();
  if (period === "daily") {
    const start = cnStartOfToday();
    return {
      key: today,
      start,
      end: new Date(start.getTime() + DAY_MS),
      label: `${today} 当日`,
    };
  }
  const key = weeklyStartDate(today);
  const startMs = parseCnWallClock(key);
  if (startMs === null) throw new Error(`周起始日期非法：${key}`);
  return {
    key,
    start: new Date(startMs),
    end: new Date(startMs + 7 * DAY_MS),
    label: `${key} 起本周`,
  };
}

export interface TaskDef {
  key: string;
  title: string;
  hint: string;
  href: string;
  target: number;
  /** 手动领取后计入的活跃度。 */
  points: number;
  /** 现场读业务表：进度不落库，改任务口径不需要迁移历史数据。 */
  measure: (userId: string, w: PeriodWindow) => Promise<number>;
}

const countFrom = (rows: Array<{ n: number }>): number => Number(rows[0]?.n ?? 0);
const sumFrom = (rows: Array<{ n: number }>): number => Number(rows[0]?.n ?? 0);

const inWindow = (column: AnyColumn, w: PeriodWindow) => [
  gte(column, w.start),
  lt(column, w.end),
];

const chatPromptCount = async (userId: string, w: PeriodWindow) =>
  countFrom(
    await db
      .select({ n: sql<number>`count(*)` })
      .from(chatMessages)
      .innerJoin(chatSessions, eq(chatMessages.sessionId, chatSessions.id))
      .where(
        and(
          eq(chatSessions.userId, userId),
          eq(chatMessages.role, "user"),
          ...inWindow(chatMessages.createdAt, w),
        ),
      ),
  );

const apiSuccessCount = async (userId: string, w: PeriodWindow) =>
  countFrom(
    await db
      .select({ n: sql<number>`count(*)` })
      .from(usageLogs)
      .where(
        and(eq(usageLogs.userId, userId), eq(usageLogs.status, "ok"), ...inWindow(usageLogs.createdAt, w)),
      ),
  );

const apiSpend = async (userId: string, w: PeriodWindow) =>
  round2(
    sumFrom(
      await db
        .select({ n: sql<number>`COALESCE(SUM(${usageLogs.creditsUsed}), 0)` })
        .from(usageLogs)
        .where(and(eq(usageLogs.userId, userId), ...inWindow(usageLogs.createdAt, w))),
    ),
  );

const activityRuns = async (userId: string, w: PeriodWindow) => {
  const [draws, flips, runs, trials] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)` })
      .from(lotteryDraws)
      .where(and(eq(lotteryDraws.userId, userId), ...inWindow(lotteryDraws.createdAt, w))),
    db
      .select({ n: sql<number>`count(*)` })
      .from(flipRounds)
      .where(and(eq(flipRounds.userId, userId), ...inWindow(flipRounds.createdAt, w))),
    db
      .select({ n: sql<number>`count(*)` })
      .from(raidenRuns)
      .where(and(eq(raidenRuns.userId, userId), ...inWindow(raidenRuns.startedAt, w))),
    db
      .select({ n: sql<number>`count(*)` })
      .from(trialRuns)
      .where(and(eq(trialRuns.userId, userId), ...inWindow(trialRuns.startedAt, w))),
  ]);
  return countFrom(draws) + countFrom(flips) + countFrom(runs) + countFrom(trials);
};

const claimedRewardCount = async (userId: string, w: PeriodWindow) =>
  countFrom(
    await db
      .select({ n: sql<number>`count(*)` })
      .from(messages)
      .where(
        and(
          eq(messages.userId, userId),
          isNotNull(messages.attachmentKind),
          isNotNull(messages.claimedAt),
          ...inWindow(messages.claimedAt, w),
        ),
      ),
  );

const checkinDays = async (userId: string, w: PeriodWindow) =>
  countFrom(
    await db
      .select({ n: sql<number>`COUNT(DISTINCT ${checkins.checkinDate})` })
      .from(checkins)
      .where(and(eq(checkins.userId, userId), ...inWindow(checkins.createdAt, w))),
  );

const topupAmount = async (userId: string, w: PeriodWindow) =>
  round2(
    sumFrom(
      await db
        .select({ n: sql<number>`COALESCE(SUM(${topups.amount}), 0)` })
        .from(topups)
        .where(
          and(
            eq(topups.userId, userId),
            inArray(topups.type, [1, 5]),
            ...inWindow(topups.createdAt, w),
          ),
        ),
    ),
  );

export const DAILY_TASKS: TaskDef[] = [
  {
    key: "daily_checkin",
    title: "每日签到",
    hint: "今天签到一次",
    href: "/dashboard",
    target: 1,
    points: 10,
    measure: async (userId, w) =>
      countFrom(
        await db
          .select({ n: sql<number>`count(*)` })
          .from(checkins)
          .where(and(eq(checkins.userId, userId), ...inWindow(checkins.createdAt, w))),
      ),
  },
  {
    key: "daily_chat",
    title: "站内对话 3 次",
    hint: "在 AI 对话里发出 3 条提问",
    href: "/chat",
    target: 3,
    points: 15,
    measure: chatPromptCount,
  },
  {
    key: "daily_api",
    title: "API 成功调用 5 次",
    hint: "任意 API Key 成功调用 5 次",
    href: "/docs",
    target: 5,
    points: 20,
    measure: apiSuccessCount,
  },
  {
    key: "daily_spend",
    title: "消费满 50 tcr",
    hint: "今天累计消耗 50 tcr",
    href: "/wallet",
    target: 50,
    points: 20,
    measure: apiSpend,
  },
  {
    key: "daily_activity",
    title: "参与限时玩法",
    hint: "转盘 / 翻牌 / 雷电任意玩一局",
    href: "/cashback",
    target: 1,
    points: 15,
    measure: activityRuns,
  },
  {
    key: "daily_inbox",
    title: "领取站内信奖励",
    hint: "领取任意一封带奖励的站内信",
    href: "/messages",
    target: 1,
    points: 20,
    measure: claimedRewardCount,
  },
];

export const WEEKLY_TASKS: TaskDef[] = [
  {
    key: "weekly_checkin",
    title: "本周签到 5 天",
    hint: "一周内签到满 5 个自然日",
    href: "/dashboard",
    target: 5,
    points: 40,
    measure: checkinDays,
  },
  {
    key: "weekly_chat",
    title: "站内对话 20 次",
    hint: "本周累计发出 20 条提问",
    href: "/chat",
    target: 20,
    points: 40,
    measure: chatPromptCount,
  },
  {
    key: "weekly_api",
    title: "API 成功调用 50 次",
    hint: "本周累计成功调用 50 次",
    href: "/docs",
    target: 50,
    points: 50,
    measure: apiSuccessCount,
  },
  {
    key: "weekly_spend",
    title: "本周消费满 500 tcr",
    hint: "本周累计消耗 500 tcr",
    href: "/wallet",
    target: 500,
    points: 60,
    measure: apiSpend,
  },
  {
    key: "weekly_activity",
    title: "参与限时玩法 10 局",
    hint: "转盘 / 翻牌 / 雷电合计 10 局",
    href: "/cashback",
    target: 10,
    points: 50,
    measure: activityRuns,
  },
  {
    key: "weekly_topup",
    title: "本周充值到账 500 cr",
    hint: "在线充值或兑换码到账合计 500 cr",
    href: "/wallet",
    target: 500,
    points: 60,
    measure: topupAmount,
  },
];

export interface MilestoneDef {
  points: number;
  min: number;
  max: number;
}

/** 每 25 活跃度一档，额度逐档递增；周奖励显著更丰厚。 */
export const DAILY_MILESTONES: MilestoneDef[] = [
  { points: 25, min: 5, max: 15 },
  { points: 50, min: 10, max: 30 },
  { points: 75, min: 20, max: 50 },
  { points: 100, min: 40, max: 100 },
];

export const WEEKLY_MILESTONES: MilestoneDef[] = [
  { points: 50, min: 20, max: 50 },
  { points: 100, min: 40, max: 100 },
  { points: 150, min: 70, max: 160 },
  { points: 200, min: 110, max: 240 },
  { points: 250, min: 160, max: 340 },
  { points: 300, min: 240, max: 500 },
];

export interface MilestoneReward {
  kind: "temp_credits";
  credits: number;
  label: string;
}

/** 里程碑奖励只发 tcr，金额在区间内随机。 */
export function rollMilestoneReward(
  milestone: MilestoneDef,
  random: () => number = Math.random,
): MilestoneReward {
  const amount = round2(
    Math.min(
      milestone.max,
      Math.max(milestone.min, milestone.min + random() * (milestone.max - milestone.min)),
    ),
  );
  return {
    kind: "temp_credits",
    credits: amount,
    label: `${amount} tcr`,
  };
}

function milestoneKey(period: TaskPeriod, periodKey: string, points: number): string {
  return `${period}:${periodKey}:${points}`;
}

export interface TaskView {
  key: string;
  title: string;
  hint: string;
  href: string;
  target: number;
  progress: number;
  points: number;
  done: boolean;
  claimed: boolean;
  claimable: boolean;
  note: string;
}

export interface MilestoneView extends MilestoneDef {
  met: boolean;
  claimState: RewardClaimState;
  rewardLabel: string | null;
}

export interface TaskPeriodView {
  period: TaskPeriod;
  periodKey: string;
  periodLabel: string;
  target: number;
  points: number;
  tasks: TaskView[];
  milestones: MilestoneView[];
}

export interface TaskBoard {
  enabled: boolean;
  validDays: number;
  daily: TaskPeriodView;
  weekly: TaskPeriodView;
}

async function readPeriodClaims(
  userId: string,
  period: TaskPeriod,
  periodKey: string,
): Promise<Map<string, number>> {
  const rows = await db
    .select({ taskKey: activityTaskClaims.taskKey, points: activityTaskClaims.points })
    .from(activityTaskClaims)
    .where(
      and(
        eq(activityTaskClaims.userId, userId),
        eq(activityTaskClaims.periodKind, period),
        eq(activityTaskClaims.periodKey, periodKey),
      ),
    );
  return new Map(rows.map((row) => [row.taskKey, Number(row.points)]));
}

async function periodPoints(userId: string, period: TaskPeriod, periodKey: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COALESCE(SUM(${activityTaskClaims.points}), 0)` })
    .from(activityTaskClaims)
    .where(
      and(
        eq(activityTaskClaims.userId, userId),
        eq(activityTaskClaims.periodKind, period),
        eq(activityTaskClaims.periodKey, periodKey),
      ),
    );
  return Number(rows[0]?.n ?? 0);
}

function buildTaskViews(
  defs: TaskDef[],
  progress: number[],
  claimed: Map<string, number>,
  enabled: boolean,
): TaskView[] {
  return defs.map((task, index) => {
    const value = progress[index];
    const done = value >= task.target;
    const isClaimed = claimed.has(task.key);
    const base = {
      key: task.key,
      title: task.title,
      hint: task.hint,
      href: task.href,
      target: task.target,
      progress: value,
      points: task.points,
      done,
      claimed: isClaimed,
    };
    if (isClaimed) return { ...base, claimable: false, note: "已领取" };
    if (!enabled) return { ...base, claimable: false, note: "活动未开启" };
    if (!done) {
      return {
        ...base,
        claimable: false,
        note: `还差 ${round2(Math.max(0, task.target - value))}`,
      };
    }
    return { ...base, claimable: true, note: "" };
  });
}

function milestoneViews(
  period: TaskPeriod,
  periodKey: string,
  defs: MilestoneDef[],
  points: number,
  claims: Map<string, RewardClaimRow>,
  sentLabels: Map<string, string>,
): MilestoneView[] {
  return defs.map((milestone) => {
    const key = milestoneKey(period, periodKey, milestone.points);
    const claim = claims.get(key);
    const justSent = sentLabels.get(key);
    return {
      ...milestone,
      met: points >= milestone.points,
      claimState: claim ? claimStateOf(claim) : justSent ? "sent" : "none",
      rewardLabel: normalizeCurrencyText(claim?.rewardLabel ?? justSent),
    };
  });
}

async function ensureMilestoneRewards(
  userId: string,
  period: TaskPeriod,
  periodKey: string,
  points: number,
  settings: TaskSettings,
  claims: Map<string, RewardClaimRow>,
): Promise<Map<string, string>> {
  const sent = new Map<string, string>();
  if (!settings.enabled) return sent;
  const defs = period === "daily" ? DAILY_MILESTONES : WEEKLY_MILESTONES;

  for (const milestone of defs) {
    if (points < milestone.points) continue;
    const key = milestoneKey(period, periodKey, milestone.points);
    if (claims.has(key)) continue;

    const reward = rollMilestoneReward(milestone);
    let reserved: { id: string; fresh: boolean };
    try {
      reserved = await reserveRewardClaim({
        userId,
        activityKind: "activity",
        tierKey: key,
        rewardCredits: reward.credits,
        validDays: settings.validDays,
        topupType: TASK_TOPUP_TYPE,
        rewardKind: reward.kind,
        rewardLabel: reward.label,
      });
    } catch (err) {
      console.error("[tasks] 活跃度里程碑占位失败:", err);
      continue;
    }
    if (!reserved.fresh) continue;

    const attachment: Attachment = {
      kind: "temp_credits",
      credits: reward.credits,
      validDays: settings.validDays,
      topupType: TASK_TOPUP_TYPE,
      rewardClaimId: reserved.id,
    };

    try {
      const messageId = await sendMessage({
        userId,
        kind: "reward",
        title: `${period === "daily" ? "每日" : "每周"}活跃度 ${milestone.points} 达成`,
        body: [
          `你在${period === "daily" ? "今日" : "本周"}已达到 ${milestone.points} 活跃度。`,
          `随机奖励：${reward.label}，已发放到站内信，请前往领取。`,
          `领取后以 tcr 到账，${settings.validDays} 天内有效。`,
        ].join("\n"),
        attachment,
      });
      await attachRewardMessage(reserved.id, messageId);
      sent.set(key, reward.label);
    } catch (err) {
      await discardRewardClaim(reserved.id);
      console.error("[tasks] 活跃度里程碑发信失败:", err);
    }
  }

  return sent;
}

async function buildPeriodView(
  userId: string,
  period: TaskPeriod,
  defs: TaskDef[],
  target: number,
  settings: TaskSettings,
  rewardClaims: Map<string, RewardClaimRow>,
): Promise<TaskPeriodView> {
  const window = periodWindow(period);
  const [claimed, initialPoints, progress] = await Promise.all([
    readPeriodClaims(userId, period, window.key),
    periodPoints(userId, period, window.key),
    Promise.all(defs.map((task) => task.measure(userId, window))),
  ]);

  const sentLabels = await ensureMilestoneRewards(
    userId,
    period,
    window.key,
    initialPoints,
    settings,
    rewardClaims,
  );

  return {
    period,
    periodKey: window.key,
    periodLabel: window.label,
    target,
    points: initialPoints,
    tasks: buildTaskViews(defs, progress, claimed, settings.enabled),
    milestones: milestoneViews(
      period,
      window.key,
      period === "daily" ? DAILY_MILESTONES : WEEKLY_MILESTONES,
      initialPoints,
      rewardClaims,
      sentLabels,
    ),
  };
}

/** 一次读两个周期的任务与活跃度；达到里程碑时顺手补发站内信（唯一索引挡重复）。 */
export async function listTaskBoard(userId: string, settings: TaskSettings): Promise<TaskBoard> {
  const rewardClaims = await listRewardClaims(userId, "activity");
  const [daily, weekly] = await Promise.all([
    buildPeriodView(userId, "daily", DAILY_TASKS, DAILY_TARGET, settings, rewardClaims),
    buildPeriodView(userId, "weekly", WEEKLY_TASKS, WEEKLY_TARGET, settings, rewardClaims),
  ]);
  return { enabled: settings.enabled, validDays: settings.validDays, daily, weekly };
}

export interface ClaimTaskResult {
  title: string;
  points: number;
  activityPoints: number;
  milestones: string[];
}

/**
 * 手动领取任务：只加活跃度，不直接发钱；活跃度跨过里程碑后由
 * `ensureMilestoneRewards` 自动发站内信。唯一索引挡住双击与并发。
 */
export async function claimTask(
  userId: string,
  period: TaskPeriod,
  key: string,
  settings: TaskSettings,
): Promise<ClaimTaskResult> {
  if (!settings.enabled) throw new Error("任务活动未开启");
  const defs = period === "daily" ? DAILY_TASKS : WEEKLY_TASKS;
  const task = defs.find((item) => item.key === key);
  if (!task) throw new Error("任务不存在");

  const window = periodWindow(period);
  const claimed = await readPeriodClaims(userId, period, window.key);
  if (claimed.has(key)) throw new Error("该任务本期已领取");

  const progress = await task.measure(userId, window);
  if (progress < task.target) {
    throw new Error(`还没完成：需要 ${round2(task.target)}，当前 ${round2(progress)}`);
  }

  const { changes } = await d1Run(
    `INSERT OR IGNORE INTO activity_task_claim
       (id, userId, periodKind, periodKey, taskKey, points, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), userId, period, window.key, key, task.points, Date.now()],
  );
  if (changes !== 1) throw new Error("该任务本期已领取");

  const points = await periodPoints(userId, period, window.key);
  const rewardClaims = await listRewardClaims(userId, "activity");
  const sent = await ensureMilestoneRewards(
    userId,
    period,
    window.key,
    points,
    settings,
    rewardClaims,
  );

  return {
    title: task.title,
    points: task.points,
    activityPoints: points,
    milestones: [...sent.values()],
  };
}
