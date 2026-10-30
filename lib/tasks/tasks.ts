import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/d1-http";
import {
  cashbackClaims,
  chatMessages,
  chatSessions,
  checkins,
  inviteRecords,
  lotteryDraws,
  temporaryBalances,
  topups,
  usageLogs,
  userTasks,
} from "@/lib/db/schema";
import type { getTaskSettings } from "@/lib/settings";

export type TaskSettings = Awaited<ReturnType<typeof getTaskSettings>>;

/** 钱包流水里任务成就占用的 type（8=消费返利、10=充值赠送已被占用）。 */
export const TASK_TOPUP_TYPE = 9;

const DAY_MS = 24 * 60 * 60 * 1000;
const round2 = (v: number) => Math.round(v * 100) / 100;

const countFrom = (rows: Array<{ n: number }>): number => Number(rows[0]?.n ?? 0);

export interface TaskDef {
  key: string;
  title: string;
  hint: string;
  /** 达标需要的次数，界面按它折算进度。 */
  target: number;
  defaultReward: number;
  /** 引导用户去完成的入口。 */
  href: string;
  /** 现场读业务表：进度不落库，所以改任务口径不需要迁移历史数据。 */
  measure: (userId: string) => Promise<number>;
}

export const TASKS: TaskDef[] = [
  {
    key: "first_chat",
    title: "第一次站内对话",
    hint: "在「AI 对话」里发出第一条提问",
    target: 1,
    defaultReward: 5,
    href: "/chat",
    measure: async (userId) =>
      countFrom(
        await db
          .select({ n: sql<number>`count(*)` })
          .from(chatMessages)
          .innerJoin(chatSessions, eq(chatMessages.sessionId, chatSessions.id))
          .where(and(eq(chatSessions.userId, userId), eq(chatMessages.role, "user"))),
      ),
  },
  {
    key: "first_api",
    title: "跑通一次 API",
    hint: "用 API Key 从 OpenAI / Anthropic 兼容口成功调用一次",
    target: 1,
    defaultReward: 10,
    href: "/docs",
    measure: async (userId) =>
      countFrom(
        await db
          .select({ n: sql<number>`count(*)` })
          .from(usageLogs)
          .where(
            and(
              eq(usageLogs.userId, userId),
              eq(usageLogs.status, "ok"),
              inArray(usageLogs.channel, ["openai", "anthropic"]),
            ),
          ),
      ),
  },
  {
    key: "first_topup",
    title: "第一次充值",
    hint: "兑换码或在线支付到账一次",
    target: 1,
    defaultReward: 10,
    href: "/wallet",
    measure: async (userId) =>
      countFrom(
        await db
          .select({ n: sql<number>`count(*)` })
          .from(topups)
          .where(and(eq(topups.userId, userId), inArray(topups.type, [1, 5]))),
      ),
  },
  {
    key: "checkin_streak",
    title: "累计签到 7 天",
    hint: "每天签一次，攒满 7 天",
    target: 7,
    defaultReward: 15,
    href: "/dashboard",
    measure: async (userId) =>
      countFrom(
        await db
          .select({ n: sql<number>`count(*)` })
          .from(checkins)
          .where(eq(checkins.userId, userId)),
      ),
  },
  {
    key: "invite_first",
    title: "邀到第一位朋友",
    hint: "邀请链接注册成功的第 1 位好友",
    target: 1,
    defaultReward: 20,
    href: "/invite",
    measure: async (userId) =>
      countFrom(
        await db
          .select({ n: sql<number>`count(*)` })
          .from(inviteRecords)
          .where(eq(inviteRecords.inviterId, userId)),
      ),
  },
  {
    key: "lottery_first",
    title: "第一次转盘抽奖",
    hint: "在「限时活动」完成任意一次开奖",
    target: 1,
    defaultReward: 5,
    href: "/lottery",
    measure: async (userId) =>
      countFrom(
        await db
          .select({ n: sql<number>`count(*)` })
          .from(lotteryDraws)
          .where(eq(lotteryDraws.userId, userId)),
      ),
  },
  {
    key: "cashback_first",
    title: "领到第一笔消费返利",
    hint: "在「消费返利」领取任意一天的返利",
    target: 1,
    defaultReward: 5,
    href: "/cashback",
    measure: async (userId) =>
      countFrom(
        await db
          .select({ n: sql<number>`count(*)` })
          .from(cashbackClaims)
          .where(eq(cashbackClaims.userId, userId)),
      ),
  },
];

export interface TaskView {
  key: string;
  title: string;
  hint: string;
  href: string;
  target: number;
  progress: number;
  reward: number;
  claimed: boolean;
  claimable: boolean;
  note: string;
}

/** 后台覆盖值优先，没覆盖或非法则回到代码默认额度。 */
export function rewardForTask(key: string, s: TaskSettings): number {
  const override = s.rewardOverrides[key];
  const raw = Number.isFinite(override) ? (override as number) : TASKS.find((t) => t.key === key)?.defaultReward;
  return round2(Math.max(0, raw ?? 0));
}

/**
 * 任务清单：一次读全部已领记录，再并发取每个任务的现场进度。
 * 进度不落库，用户做完什么当场就能看见，不存在「状态同步」这回事。
 */
export async function listTasks(userId: string, s: TaskSettings): Promise<TaskView[]> {
  const claimedRows = await db
    .select({ taskKey: userTasks.taskKey })
    .from(userTasks)
    .where(eq(userTasks.userId, userId));
  const claimed = new Set(claimedRows.map((r) => r.taskKey));

  const progress = await Promise.all(TASKS.map((t) => t.measure(userId)));

  return TASKS.map((task, i) => {
    const progressValue = progress[i];
    const done = progressValue >= task.target;
    const reward = rewardForTask(task.key, s);
    const view = {
      key: task.key,
      title: task.title,
      hint: task.hint,
      href: task.href,
      target: task.target,
      progress: progressValue,
      reward,
      claimed: claimed.has(task.key),
    };
    if (view.claimed) return { ...view, claimable: false, note: "已领取" };
    if (!s.enabled) return { ...view, claimable: false, note: "活动未开启" };
    if (reward <= 0) return { ...view, claimable: false, note: "奖励已设为 0" };
    if (!done) {
      return { ...view, claimable: false, note: `还差 ${Math.max(0, task.target - progressValue)} 次` };
    }
    return { ...view, claimable: true, note: "" };
  });
}

/**
 * 领取任务奖励。与消费返利同一套防重放写法：先插 `user_task` 占住唯一索引，
 * 发钱失败再删掉这条占位——反过来先发光，连点两次就真发两份。
 */
export async function claimTask(
  userId: string,
  key: string,
  s: TaskSettings,
): Promise<{ title: string; reward: number }> {
  const task = TASKS.find((t) => t.key === key);
  if (!task) throw new Error("任务不存在");
  if (!s.enabled) throw new Error("任务活动未开启");

  const reward = rewardForTask(key, s);
  if (reward <= 0) throw new Error("该任务当前奖励为 0");

  const already = await db
    .select({ id: userTasks.id })
    .from(userTasks)
    .where(and(eq(userTasks.userId, userId), eq(userTasks.taskKey, key)))
    .limit(1);
  if (already.length > 0) throw new Error("该任务奖励已领取");

  const progress = await task.measure(userId);
  if (progress < task.target) throw new Error(`还没完成：需要 ${task.target} 次，当前 ${progress} 次`);

  const now = new Date();
  const claimId = crypto.randomUUID();
  await db.insert(userTasks).values({
    id: claimId,
    userId,
    taskKey: key,
    rewardCredits: reward,
    createdAt: now,
  });

  const expiresAt = new Date(now.getTime() + s.validDays * DAY_MS);
  try {
    await db.insert(temporaryBalances).values({
      id: crypto.randomUUID(),
      userId,
      amount: reward,
      expiresAt,
      description: `任务奖励 ${reward.toFixed(2)} cr（${task.title}，有效期 ${s.validDays} 天）`,
      createdAt: now,
    });
    await db.insert(topups).values({
      id: crypto.randomUUID(),
      userId,
      amount: reward,
      type: TASK_TOPUP_TYPE,
      description: `任务奖励 ${reward.toFixed(2)} cr（${task.title}，有效期至 ${expiresAt.toLocaleDateString("zh-CN")}）`,
      createdAt: now,
    });
  } catch (err) {
    await db.delete(userTasks).where(eq(userTasks.id, claimId)).catch(() => undefined);
    throw err;
  }

  return { title: task.title, reward };
}

/** 已领取的任务数与累计额度，用于页头两个数字。 */
export async function taskSummary(userId: string): Promise<{ claimed: number; credits: number }> {
  const rows = await db
    .select({ rewardCredits: userTasks.rewardCredits })
    .from(userTasks)
    .where(eq(userTasks.userId, userId));
  return {
    claimed: rows.length,
    credits: round2(rows.reduce((sum, r) => sum + r.rewardCredits, 0)),
  };
}
