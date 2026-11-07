import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db, d1Run } from "@/lib/db/d1-http";
import {
  cashbackClaims,
  messages,
  rewardClaims,
  temporaryBalances,
  topups,
  users,
  type ActivityKind,
} from "@/lib/db/schema";
import { grantTickets } from "@/lib/lottery/store";
import { getLotteryConfig } from "@/lib/lottery/config";
import { grantCouponToRound } from "@/lib/activity/coupons";

export type MessageKind = "notice" | "reward" | "security";
export type AttachmentKind =
  | "credits"
  | "temp_credits"
  | "tickets"
  | "redemption"
  | "item"
  | "coupon";

/** 站内信在钱包流水里占用的类型（1–12 已被兑换码/管理员/签到/注册/充值/抽奖/邀请/返利/任务/赠额/雷电/翻牌占用）。 */
export const MESSAGE_TOPUP_TYPE = 13;

/** 已读满这么多天且没有待领附件的信会被 cron 清掉。 */
export const MESSAGE_RETENTION_DAYS = 3;

/** 收件箱每页条数，与其余活动记录列表一致。 */
export const MESSAGE_PAGE_SIZE = 10;

const DAY_MS = 24 * 60 * 60 * 1000;
const round2 = (v: number) => Math.round(v * 100) / 100;

export type Attachment =
  | {
      kind: "credits";
      credits: number;
      /** 领取时写入 topup 的类型；活动奖励用 8，缺省 13=站内信奖励。 */
      topupType?: number;
      /** 活动奖励发放记录 id，领取后回写 claimedAt。 */
      rewardClaimId?: string;
    }
  | {
      kind: "temp_credits";
      credits: number;
      validDays: number;
      /** 领取时写入 topup 的类型：8=消费返利 / 9=任务成就 / 10=充值赠送。 */
      topupType: number;
      /** 活动奖励发放记录 id，领取后回写 claimedAt。 */
      rewardClaimId?: string;
      /** 消费返利旧版按日结算字段；历史信仍可领取。 */
      cashbackDate?: string;
      consumedCredits?: number;
    }
  | { kind: "tickets"; count: number; rewardClaimId?: string }
  | { kind: "redemption"; code: string }
  | { kind: "item"; label: string }
  | {
      kind: "coupon";
      activityKind: ActivityKind;
      activityKey: string;
      couponName: string;
      credits: number;
      rewardClaimId?: string;
    };

export interface MessageDetail {
  id: string;
  kind: MessageKind;
  title: string;
  body: string;
  createdAt: Date | null;
  readAt: Date | null;
  claimedAt: Date | null;
  /** 发放人邮箱；系统自动发出为 null。 */
  sender: string | null;
  attachment: Attachment | null;
  /** 有附件但还没领。 */
  pendingClaim: boolean;
}

export interface MessagePreview {
  id: string;
  kind: MessageKind;
  title: string;
  /** 正文首行截断，列表里当简述用，不让管理员再填一栏。 */
  summary: string;
  createdAt: Date | null;
  readAt: Date | null;
  claimedAt: Date | null;
  attachmentKind: AttachmentKind | null;
  pendingClaim: boolean;
}

/** 列表简述：压掉换行与多余空白，取前 60 字。 */
export function summarize(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 60 ? `${flat.slice(0, 60)}…` : flat;
}

function parseAttachment(row: {
  attachmentKind: AttachmentKind | null;
  attachment: string | null;
}): Attachment | null {
  if (!row.attachmentKind || !row.attachment) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.attachment);
  } catch {
    return null;
  }
  const data = (parsed ?? {}) as Record<string, unknown>;
  switch (row.attachmentKind) {
    case "credits":
      return {
        kind: "credits",
        credits: Number(data.credits ?? 0),
        topupType: Number.isFinite(Number(data.topupType)) ? Number(data.topupType) : undefined,
        rewardClaimId: typeof data.rewardClaimId === "string" ? data.rewardClaimId : undefined,
      };
    case "temp_credits": {
      const consumed = Number(data.consumedCredits);
      return {
        kind: "temp_credits",
        credits: Number(data.credits ?? 0),
        validDays: Number(data.validDays ?? 0),
        topupType: Number(data.topupType ?? 0),
        rewardClaimId: typeof data.rewardClaimId === "string" ? data.rewardClaimId : undefined,
        cashbackDate: typeof data.cashbackDate === "string" ? data.cashbackDate : undefined,
        consumedCredits: Number.isFinite(consumed) ? consumed : undefined,
      };
    }
    case "tickets":
      return {
        kind: "tickets",
        count: Number(data.count ?? 0),
        rewardClaimId: typeof data.rewardClaimId === "string" ? data.rewardClaimId : undefined,
      };
    case "coupon": {
      const kind = String(data.activityKind ?? "");
      if (kind !== "lottery" && kind !== "flip" && kind !== "raiden") return null;
      return {
        kind: "coupon",
        activityKind: kind,
        activityKey: String(data.activityKey ?? ""),
        couponName: String(data.couponName ?? ""),
        credits: Number(data.credits ?? 0),
        rewardClaimId: typeof data.rewardClaimId === "string" ? data.rewardClaimId : undefined,
      };
    }
    case "redemption":
      return { kind: "redemption", code: String(data.code ?? "") };
    case "item":
      return { kind: "item", label: String(data.label ?? "") };
    default:
      return null;
  }
}

function attachmentJson(attachment: Attachment): string {
  switch (attachment.kind) {
    case "credits":
      return JSON.stringify({
        credits: attachment.credits,
        topupType: attachment.topupType,
        rewardClaimId: attachment.rewardClaimId,
      });
    case "temp_credits":
      return JSON.stringify({
        credits: attachment.credits,
        validDays: attachment.validDays,
        topupType: attachment.topupType,
        rewardClaimId: attachment.rewardClaimId,
        cashbackDate: attachment.cashbackDate,
        consumedCredits: attachment.consumedCredits,
      });
    case "tickets":
      return JSON.stringify({ count: attachment.count, rewardClaimId: attachment.rewardClaimId });
    case "coupon":
      return JSON.stringify({
        activityKind: attachment.activityKind,
        activityKey: attachment.activityKey,
        couponName: attachment.couponName,
        credits: attachment.credits,
        rewardClaimId: attachment.rewardClaimId,
      });
    case "redemption":
      return JSON.stringify({ code: attachment.code });
    case "item":
      return JSON.stringify({ label: attachment.label });
  }
}

/**
 * 校验附件数值。返回 null 表示合法，否则返回给用户/管理员看的错因。
 *
 * 这里挡住的是「附件金额填成 0 / 负数 / NaN」——这类值一旦入库，领取时会真的往余额里
 * 加一个 NaN 或做无意义的扣减，比发错钱更难收拾。
 */
export function validateAttachment(attachment: Attachment): string | null {
  const claimId = "rewardClaimId" in attachment ? attachment.rewardClaimId : undefined;
  const badClaimId =
    claimId !== undefined && (typeof claimId !== "string" || claimId.trim().length < 8);
  if (badClaimId) return "活动奖励发放记录 id 不合法";

  switch (attachment.kind) {
    case "credits":
      if (!Number.isFinite(attachment.credits) || attachment.credits <= 0) {
        return "赠送 cr 必须是大于 0 的数字";
      }
      if (attachment.credits > 100_000) return "单封信赠送 cr 上限 100000";
      if (
        attachment.topupType !== undefined &&
        ![8, 9, 10, MESSAGE_TOPUP_TYPE].includes(attachment.topupType)
      ) {
        return "永久货币奖励的流水类型必须是 8 / 9 / 10 / 13";
      }
      return null;
    case "temp_credits":
      if (!Number.isFinite(attachment.credits) || attachment.credits <= 0) {
        return "赠送 cr 必须是大于 0 的数字";
      }
      if (attachment.credits > 100_000) return "单封信赠送 cr 上限 100000";
      if (
        !Number.isInteger(attachment.validDays) ||
        attachment.validDays < 1 ||
        attachment.validDays > 365
      ) {
        return "临时余额有效期需在 1 ~ 365 天之间";
      }
      if (![8, 9, 10].includes(attachment.topupType)) {
        return "临时余额奖励的流水类型必须是 8 / 9 / 10";
      }
      if (attachment.cashbackDate && !/^\d{4}-\d{2}-\d{2}$/.test(attachment.cashbackDate)) {
        return "返利日期格式应为 YYYY-MM-DD";
      }
      if (!attachment.rewardClaimId || attachment.rewardClaimId.trim().length < 8) {
        return "缺少活动奖励发放记录 id";
      }
      return null;
    case "tickets":
      if (!Number.isInteger(attachment.count) || attachment.count <= 0) {
        return "抽奖券数量必须是正整数";
      }
      if (attachment.count > 100) return "单封信赠券上限 100 张";
      return null;
    case "coupon":
      if (!Number.isFinite(attachment.credits) || attachment.credits <= 0) {
        return "活动券面额必须是大于 0 的数字";
      }
      if (attachment.credits > 100_000) return "单封信活动券上限 100000";
      if (!attachment.activityKey.trim()) return "活动券缺少活动轮次";
      if (!attachment.couponName.trim()) return "活动券缺少券名";
      if (!attachment.rewardClaimId) return "缺少活动奖励发放记录 id";
      return null;
    case "redemption":
      return attachment.code.trim().length >= 4 ? null : "兑换码至少 4 个字符";
    case "item":
      return attachment.label.trim().length > 0 ? null : "物品名不能为空";
    default:
      return "未知的附件类型";
  }
}

/** 发一封站内信；`sentBy` 是管理员 userId，系统自动发出时留空。 */
export async function sendMessage(input: {
  userId: string;
  kind: MessageKind;
  title: string;
  body: string;
  attachment?: Attachment | null;
  sentBy?: string | null;
}): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(messages).values({
    id,
    userId: input.userId,
    kind: input.kind,
    title: input.title.slice(0, 120),
    body: input.body,
    attachmentKind: input.attachment?.kind ?? null,
    attachment: input.attachment ? attachmentJson(input.attachment) : null,
    sentBy: input.sentBy ?? null,
    createdAt: new Date(),
  });
  return id;
}

export type InboxFilter = "all" | "unread" | "claimable";

function filterClause(filter: InboxFilter) {
  if (filter === "unread") return isNull(messages.readAt);
  if (filter === "claimable") {
    return and(isNotNull(messages.attachmentKind), isNull(messages.claimedAt));
  }
  return undefined;
}

/** 收件箱分页（倒序）。返回行 + 该筛选下的总数，供卡片内翻页显示页数。 */
export async function listMessages(
  userId: string,
  filter: InboxFilter,
  page: number,
): Promise<{ rows: MessagePreview[]; total: number }> {
  const where = and(eq(messages.userId, userId), filterClause(filter));
  const safePage = Math.max(1, Math.trunc(page) || 1);

  const [rows, counted] = await Promise.all([
    db
      .select({
        id: messages.id,
        kind: messages.kind,
        title: messages.title,
        body: messages.body,
        createdAt: messages.createdAt,
        readAt: messages.readAt,
        claimedAt: messages.claimedAt,
        attachmentKind: messages.attachmentKind,
      })
      .from(messages)
      .where(where)
      .orderBy(desc(messages.createdAt))
      .limit(MESSAGE_PAGE_SIZE)
      .offset((safePage - 1) * MESSAGE_PAGE_SIZE),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(messages)
      .where(where),
  ]);

  return {
    rows: rows.map((row) => ({
      id: row.id,
      kind: row.kind as MessageKind,
      title: row.title,
      summary: summarize(row.body),
      createdAt: row.createdAt,
      readAt: row.readAt,
      claimedAt: row.claimedAt,
      attachmentKind: row.attachmentKind as AttachmentKind | null,
      pendingClaim: !!row.attachmentKind && !row.claimedAt,
    })),
    total: Number(counted[0]?.count ?? 0),
  };
}

export async function countUnread(userId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(messages)
    .where(and(eq(messages.userId, userId), isNull(messages.readAt)));
  return Number(rows[0]?.count ?? 0);
}

/** 顶栏铃铛：最近几封，顺带把未读数的判断材料带出去。 */
export async function listRecentMessages(userId: string, limit = 5): Promise<MessagePreview[]> {
  const rows = await db
    .select({
      id: messages.id,
      kind: messages.kind,
      title: messages.title,
      body: messages.body,
      createdAt: messages.createdAt,
      readAt: messages.readAt,
      claimedAt: messages.claimedAt,
      attachmentKind: messages.attachmentKind,
    })
    .from(messages)
    .where(eq(messages.userId, userId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as MessageKind,
    title: row.title,
    summary: summarize(row.body),
    createdAt: row.createdAt,
    readAt: row.readAt,
    claimedAt: row.claimedAt,
    attachmentKind: row.attachmentKind as AttachmentKind | null,
    pendingClaim: !!row.attachmentKind && !row.claimedAt,
  }));
}

/** 打开某一封：首次打开顺手标记已读（已读是 3 天后清理的起算点）。 */
export async function readMessage(userId: string, id: string): Promise<MessageDetail | null> {
  // 不用 leftJoin：drizzle-orm 0.45.2 的 leftJoin 会串列（见 docs/fixes/2026-06-25-drizzle-leftjoin-bug.md），
  // 发放人邮箱单独查一次。
  const rows = await db
    .select({
      id: messages.id,
      kind: messages.kind,
      title: messages.title,
      body: messages.body,
      createdAt: messages.createdAt,
      readAt: messages.readAt,
      claimedAt: messages.claimedAt,
      attachmentKind: messages.attachmentKind,
      attachment: messages.attachment,
      sentBy: messages.sentBy,
    })
    .from(messages)
    .where(and(eq(messages.id, id), eq(messages.userId, userId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  if (!row.readAt) {
    await d1Run(`UPDATE message SET readAt = ? WHERE id = ? AND userId = ?`, [
      Date.now(),
      id,
      userId,
    ]);
  }

  const senders = row.sentBy
    ? await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, row.sentBy))
        .limit(1)
    : [];

  const attachment = parseAttachment(row);
  // 兑换码与自定义凭证在领取前不给内容，否则不点领取也能把码抄走。
  const revealed =
    attachment && !row.claimedAt && (attachment.kind === "redemption" || attachment.kind === "item")
      ? attachment.kind === "redemption"
        ? { kind: "redemption" as const, code: "" }
        : { kind: "item" as const, label: "" }
      : attachment;

  return {
    id: row.id,
    kind: row.kind as MessageKind,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt,
    readAt: row.readAt,
    claimedAt: row.claimedAt,
    sender: senders[0]?.email ?? null,
    attachment: revealed,
    pendingClaim: !!row.attachmentKind && !row.claimedAt,
  };
}

/**
 * 回写活动奖励的领取状态。失败不影响已经发出的钱：活动页还有站内信 claimedAt 兜底，
 * 下一次读 `listRewardClaims` 会把信的领取时间合进来。
 */
async function markRewardClaimed(
  claimId: string | undefined,
  userId: string,
  now: Date,
): Promise<void> {
  if (!claimId) return;
  await db
    .update(rewardClaims)
    .set({ claimedAt: now })
    .where(
      and(
        eq(rewardClaims.id, claimId),
        eq(rewardClaims.userId, userId),
        isNull(rewardClaims.claimedAt),
      ),
    )
    .catch((err) => console.error("[claimMessage] 回写活动奖励状态失败:", err));
}

/**
 * 领取附件。
 *
 * 先用一条条件 UPDATE 抢占领取位（`claimedAt IS NULL` 才写得上），`changes` 不是 1 就说明
 * 这一封已经被另一次点击领走了 —— 双击/重放不会重复发钱。发放失败再把 claimedAt 置回 NULL，
 * 否则信会被永久标成已领而用户什么也没拿到。
 */
export async function claimMessage(
  userId: string,
  id: string,
): Promise<{ attachment: Attachment; note: string }> {
  const nowMs = Date.now();
  const { changes } = await d1Run(
    `UPDATE message SET claimedAt = ?, readAt = COALESCE(readAt, ?)
     WHERE id = ? AND userId = ? AND claimedAt IS NULL AND attachmentKind IS NOT NULL`,
    [nowMs, nowMs, id, userId],
  );
  if (changes !== 1) {
    throw new Error("这封信不存在、没有附件，或已经领取过了");
  }

  const rows = await db
    .select({
      attachmentKind: messages.attachmentKind,
      attachment: messages.attachment,
      title: messages.title,
    })
    .from(messages)
    .where(and(eq(messages.id, id), eq(messages.userId, userId)))
    .limit(1);
  const row = rows[0];
  const attachment = row ? parseAttachment(row) : null;
  if (!row?.attachmentKind || !attachment) {
    await d1Run(`UPDATE message SET claimedAt = NULL WHERE id = ?`, [id]);
    throw new Error("附件内容异常，已退回未领取，请联系管理员");
  }

  let insertedCashbackClaimId: string | null = null;
  try {
    switch (attachment.kind) {
      case "credits": {
        const amount = round2(attachment.credits);
        await db
          .update(users)
          .set({ balanceCredits: sql`${users.balanceCredits} + ${amount}` })
          .where(eq(users.id, userId));
        await db.insert(topups).values({
          userId,
          amount,
          type: attachment.topupType ?? MESSAGE_TOPUP_TYPE,
          description: `站内信奖励：${row.title}`.slice(0, 200),
          createdAt: new Date(),
        });
        await markRewardClaimed(attachment.rewardClaimId, userId, new Date(nowMs));
        return { attachment: { ...attachment, credits: amount }, note: `${amount} cr 已到账` };
      }
      case "temp_credits": {
        const amount = round2(attachment.credits);
        const now = new Date(nowMs);
        const description = `站内信奖励：${row.title}`.slice(0, 200);
        if (attachment.cashbackDate) {
          // 先占住返利历史行：重复领取会在唯一索引上失败，钱不会发第二遍。
          insertedCashbackClaimId = crypto.randomUUID();
          await db.insert(cashbackClaims).values({
            id: insertedCashbackClaimId,
            userId,
            periodDate: attachment.cashbackDate,
            consumedCredits: round2(attachment.consumedCredits ?? 0),
            rewardCredits: amount,
            createdAt: now,
          });
        }
        await db.insert(temporaryBalances).values({
          id: crypto.randomUUID(),
          userId,
          amount,
          expiresAt: new Date(nowMs + attachment.validDays * DAY_MS),
          description,
          createdAt: now,
        });
        await db.insert(topups).values({
          userId,
          amount,
          type: attachment.topupType,
          description,
          createdAt: now,
        });
        // 回写发放状态失败不能影响已发出的钱；活动页还有站内信 claimedAt 兜底。
        await markRewardClaimed(attachment.rewardClaimId, userId, now);
        return {
          attachment: { ...attachment, credits: amount },
          note: `${amount} cr 已到账（临时余额，${attachment.validDays} 天内有效）`,
        };
      }
      case "tickets": {
        // 券只有转盘这一种：翻牌夺宝是按 cr 计价的局，没有券可发。
        const config = await getLotteryConfig();
        await grantTickets(userId, attachment.count, {
          source: "gift",
          priceCredits: 0,
          activityKey: config.startAt || null,
        });
        await markRewardClaimed(attachment.rewardClaimId, userId, new Date(nowMs));
        return { attachment, note: `${attachment.count} 张抽奖券已入账` };
      }
      case "coupon": {
        const amount = round2(attachment.credits);
        await grantCouponToRound(
          userId,
          attachment.activityKind,
          attachment.activityKey,
          attachment.couponName,
          amount,
        );
        await markRewardClaimed(attachment.rewardClaimId, userId, new Date(nowMs));
        return {
          attachment: { ...attachment, credits: amount },
          note: `${attachment.couponName} ${amount} cr 已入账（当期活动结束后作废）`,
        };
      }
      case "redemption":
        return { attachment, note: "兑换码已解锁，去钱包页输入即可兑换" };
      case "item":
        return { attachment, note: "已领取" };
      default:
        throw new Error("未知的附件类型");
    }
  } catch (err) {
    if (insertedCashbackClaimId) {
      await db
        .delete(cashbackClaims)
        .where(eq(cashbackClaims.id, insertedCashbackClaimId))
        .catch(() => undefined);
    }
    await d1Run(`UPDATE message SET claimedAt = NULL WHERE id = ?`, [id]);
    throw err;
  }
}

/** 用户主动删除（与 cron 清理同一张表，删除只按 id + userId 双条件，挡不住越权就白做）。 */
export async function deleteMessage(userId: string, id: string): Promise<boolean> {
  // 待领取的附件不能手删：否则用户点一下删除就把奖励吞了，活动页还会显示「已发放」。
  const { changes } = await d1Run(
    `DELETE FROM message
     WHERE id = ? AND userId = ?
       AND (claimedAt IS NOT NULL OR attachmentKind IS NULL)`,
    [id, userId],
  );
  if (changes > 0) return true;

  const rows = await db
    .select({ attachmentKind: messages.attachmentKind, claimedAt: messages.claimedAt })
    .from(messages)
    .where(and(eq(messages.id, id), eq(messages.userId, userId)))
    .limit(1);
  if (rows[0]?.attachmentKind && !rows[0].claimedAt) {
    throw new Error("附件还没领取，领取后才能删除这封信");
  }
  return false;
}

/**
 * 清理「已读满 N 天」的信。
 *
 * 带附件但还没领的**不删**：用户读过却没来得及领，删掉就等于把奖励吞了，
 * 这类信一直留到领取或用户手删。
 */
export async function purgeExpiredMessages(nowMs = Date.now()): Promise<number> {
  const cutoff = new Date(nowMs - MESSAGE_RETENTION_DAYS * DAY_MS);
  const { changes } = await d1Run(
    `DELETE FROM message
     WHERE readAt IS NOT NULL AND readAt < ?
       AND (claimedAt IS NOT NULL OR attachmentKind IS NULL)`,
    [cutoff.getTime()],
  );
  return changes;
}
