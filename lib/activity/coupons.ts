import { and, eq, gt, sql } from "drizzle-orm";
import { d1All, d1Run, db } from "@/lib/db/d1-http";
import {
  activityCoupons,
  couponPackPurchases,
  temporaryBalances,
  topups,
  users,
  type ActivityKind,
} from "@/lib/db/schema";
import { spendCredits, refundPermanentCredits } from "@/lib/billing/spend";
import { formatAmount } from "@/lib/billing/units";
import { cnStartOfToday } from "@/lib/date";
import { activityWindow, currentActivityKey } from "@/lib/lottery/prize-math";
import { getLotteryConfig } from "@/lib/lottery/config";
import { flipActivityKey, flipActivityWindow } from "@/lib/flip/config";
import { getFlipConfig } from "@/lib/flip/settings";
import { raidenActivityKey, raidenActivityWindow } from "@/lib/raiden/config";
import { getRaidenConfig } from "@/lib/raiden/settings";

/**
 * 活动券：一种玩法一种券，按活动轮次隔离。
 *
 * 限时活动只能凭券参加：按每个活动配置的券面单价（1 张 = X cr）用余额兑换，
 * 流入流水 type=15；玩法付费点只扣券、不再直接扣货币；券内抵扣不写 cr 流水，
 * 所以账本的支出总额仍然等于余额的真实减少。
 */

export type { ActivityKind };

/** 钱包流水 type=15：付出 cr 换活动券。 */
export const COUPON_TOPUP_TYPE = 15;

export interface ActivityMeta {
  kind: ActivityKind;
  label: string;
  short: string;
  href: string;
}

export const ACTIVITY_META: Record<ActivityKind, ActivityMeta> = {
  lottery: { kind: "lottery", label: "幸运转盘", short: "转盘券", href: "/lottery" },
  flip: { kind: "flip", label: "翻牌夺宝", short: "翻牌券", href: "/flip" },
  raiden: { kind: "raiden", label: "雷电行动", short: "雷电券", href: "/raiden" },
};

export const ACTIVITY_KINDS: ActivityKind[] = ["lottery", "flip", "raiden"];

/** 每期从池里按轮次确定一个名字：同一轮所有人看到同一张券，下一轮自然换名。 */
const COUPON_NAMES: Record<ActivityKind, string[]> = {
  lottery: ["星轨券", "月华券", "流萤券", "极光券", "焰羽券", "银河券"],
  flip: ["翻云券", "玲珑券", "探花券", "锦鲤券", "流光券", "叠翠券"],
  raiden: ["雷霆券", "疾风券", "破阵券", "闪电券", "龙吟券", "霜刃券"],
};

export type ActivityStatus = "disabled" | "pending" | "active" | "ended";

export function couponNameFor(kind: ActivityKind, activityKey: string | null): string {
  const pool = COUPON_NAMES[kind];
  if (!activityKey) return pool[0];
  // FNV-1a：只要轮次字符串不变，券名就稳定；不引入随机表，读侧无需落库。
  let hash = 2166136261;
  const source = `${kind}:${activityKey}`;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return pool[Math.abs(hash) % pool.length];
}

export interface CouponPack {
  key: "small" | "medium" | "large";
  name: string;
  priceCredits: number;
  /** 券面 / 实付，200% = 2 倍。 */
  ratio: number;
  /** 每北京自然日限购份数；null = 不限。 */
  dailyLimit: number | null;
  /** 累计限购份数；null = 不限。 */
  totalLimit: number | null;
}

/** 三档珍宝礼包；比例按需求固定为 200% / 500% / 1000%，倍率越高限购越紧。 */
export const COUPON_PACKS: CouponPack[] = [
  { key: "small", name: "小份珍宝", priceCredits: 10, ratio: 2, dailyLimit: null, totalLimit: null },
  { key: "medium", name: "中份珍宝", priceCredits: 50, ratio: 5, dailyLimit: 2, totalLimit: 20 },
  { key: "large", name: "大份珍宝", priceCredits: 100, ratio: 10, dailyLimit: 1, totalLimit: 10 },
];

export interface CouponPackView extends CouponPack {
  boughtToday: number;
  boughtTotal: number;
}

interface PackUsage {
  today: number;
  total: number;
}

/** 限购按「用户 + 礼包」统计，不区分玩法：三个活动共用同一份额度。 */
async function readPackUsage(userId: string): Promise<Map<string, PackUsage>> {
  const rows = await d1All<{ packKey: string; total: number; today: number }>(
    `SELECT packKey,
            COUNT(*) AS total,
            SUM(CASE WHEN createdAt >= ? THEN 1 ELSE 0 END) AS today
       FROM coupon_pack_purchase
      WHERE userId = ?
      GROUP BY packKey`,
    [cnStartOfToday().getTime(), userId],
  ).catch(() => []);
  return new Map(
    rows.map((row) => [
      row.packKey,
      { today: Number(row.today ?? 0), total: Number(row.total ?? 0) },
    ]),
  );
}

function packViews(usage: Map<string, PackUsage>): CouponPackView[] {
  return COUPON_PACKS.map((pack) => ({
    ...pack,
    boughtToday: usage.get(pack.key)?.today ?? 0,
    boughtTotal: usage.get(pack.key)?.total ?? 0,
  }));
}

interface ResolvedActivity {
  kind: ActivityKind;
  label: string;
  href: string;
  status: ActivityStatus;
  activityKey: string | null;
  couponName: string;
  /** 1 张活动券 = 多少 cr；兑换与张数展示都按它折算。 */
  unitCredits: number;
}

async function resolveActivity(kind: ActivityKind): Promise<ResolvedActivity> {
  const meta = ACTIVITY_META[kind];
  let status: ActivityStatus;
  let activityKey: string | null;
  let unitCredits = 1;
  if (kind === "lottery") {
    const config = await getLotteryConfig();
    status = activityWindow(config).status;
    activityKey = currentActivityKey(config);
    unitCredits = config.couponUnitCredits;
  } else if (kind === "flip") {
    const config = await getFlipConfig();
    status = flipActivityWindow(config).status;
    activityKey = flipActivityKey(config);
    unitCredits = config.couponUnitCredits;
  } else {
    const config = await getRaidenConfig();
    status = raidenActivityWindow(config).status;
    activityKey = raidenActivityKey(config);
    unitCredits = config.couponUnitCredits;
  }
  return {
    ...meta,
    status,
    activityKey,
    couponName: couponNameFor(kind, activityKey),
    unitCredits,
  };
}

export async function resolveActivities(): Promise<ResolvedActivity[]> {
  return Promise.all(ACTIVITY_KINDS.map((kind) => resolveActivity(kind)));
}

export interface ActivityCouponView extends ResolvedActivity {
  credits: number;
  packs: CouponPackView[];
}

export interface CurrencySnapshot {
  permanent: number;
  temporary: number;
  coupons: ActivityCouponView[];
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

async function readCouponRows(
  userId: string,
  keys: { kind: ActivityKind; activityKey: string | null }[],
): Promise<Map<string, number>> {
  const wanted = new Set(
    keys
      .filter((item): item is { kind: ActivityKind; activityKey: string } => Boolean(item.activityKey))
      .map((item) => `${item.kind}|${item.activityKey}`),
  );
  if (wanted.size === 0) return new Map();
  // 一个用户的券行最多 3 条，直接按用户取回再筛，避免 D1 对复合表达式 IN 的解析坑。
  const rows = await db
    .select({
      activityKind: activityCoupons.activityKind,
      activityKey: activityCoupons.activityKey,
      credits: activityCoupons.credits,
    })
    .from(activityCoupons)
    .where(eq(activityCoupons.userId, userId))
    .catch(() => []);
  return new Map(
    rows
      .filter((row) => wanted.has(`${row.activityKind}|${row.activityKey}`))
      .map((row) => [`${row.activityKind}|${row.activityKey}`, Number(row.credits)]),
  );
}

/**
 * 一次取齐三种券的余额；活动轮次未配置时余额按 0 展示。
 * `resolveActivities` 需要读三份活动配置，与余额查询并发。
 */
export async function listActivityCoupons(userId: string): Promise<ActivityCouponView[]> {
  const activities = await resolveActivities();
  const [balances, usage] = await Promise.all([
    readCouponRows(
      userId,
      activities.map((item) => ({ kind: item.kind, activityKey: item.activityKey })),
    ),
    readPackUsage(userId),
  ]);
  return activities.map((item) => ({
    ...item,
    credits: item.activityKey ? round2(balances.get(`${item.kind}|${item.activityKey}`) ?? 0) : 0,
    packs: packViews(usage),
  }));
}

/** 顶栏货币条的数据：永久余额、未过期临时余额、三种活动券。 */
export async function getCurrencySnapshot(userId: string): Promise<CurrencySnapshot> {
  const now = new Date();
  const [userRows, tempRows, coupons] = await Promise.all([
    db
      .select({ balanceCredits: users.balanceCredits })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({ total: sql<number>`COALESCE(SUM(${temporaryBalances.amount}), 0)` })
      .from(temporaryBalances)
      .where(
        and(eq(temporaryBalances.userId, userId), gt(temporaryBalances.expiresAt, now)),
      ),
    listActivityCoupons(userId),
  ]);
  return {
    permanent: round2(Number(userRows[0]?.balanceCredits ?? 0)),
    temporary: round2(Number(tempRows[0]?.total ?? 0)),
    coupons,
  };
}

export async function getActivityCouponView(
  userId: string,
  kind: ActivityKind,
): Promise<ActivityCouponView> {
  const activity = await resolveActivity(kind);
  const [balances, usage] = await Promise.all([
    activity.activityKey
      ? readCouponRows(userId, [{ kind, activityKey: activity.activityKey }])
      : Promise.resolve(new Map<string, number>()),
    readPackUsage(userId),
  ]);
  return {
    ...activity,
    credits: activity.activityKey
      ? round2(balances.get(`${kind}|${activity.activityKey}`) ?? 0)
      : 0,
    packs: packViews(usage),
  };
}

function assertActive(activity: ResolvedActivity): string {
  if (activity.status === "disabled") throw new Error(`${activity.label}未开启`);
  if (activity.status === "pending") throw new Error(`${activity.label}尚未开始`);
  if (activity.status === "ended") throw new Error(`${activity.label}已结束`);
  if (!activity.activityKey) throw new Error(`${activity.label}轮次无效`);
  return activity.activityKey;
}

async function addCouponCredits(
  userId: string,
  kind: ActivityKind,
  activityKey: string,
  couponName: string,
  amount: number,
): Promise<void> {
  const now = Date.now();
  await d1Run(
    `INSERT INTO activity_coupon
       (id, userId, activityKind, activityKey, couponName, credits, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(userId, activityKind, activityKey) DO UPDATE SET
       credits = activity_coupon.credits + excluded.credits,
       couponName = excluded.couponName,
       updatedAt = excluded.updatedAt`,
    [crypto.randomUUID(), userId, kind, activityKey, couponName, round2(amount), now, now],
  );
}

/**
 * 兑换活动券：按「1 张 = 该活动配置的券面单价」整张兑换，
 * 付款先花临时余额再花永久余额；券面按 cr 1:1 抵扣玩法费用。
 */
export async function exchangeCoupon(
  userId: string,
  kind: ActivityKind,
  rawTickets: number,
): Promise<{ credits: number; tickets: number; couponName: string }> {
  const tickets = Number(rawTickets);
  if (!Number.isInteger(tickets) || tickets < 1 || tickets > 100_000) {
    throw new Error("兑换张数需为 1 ~ 100000 的整数");
  }
  const activity = await resolveActivity(kind);
  const activityKey = assertActive(activity);
  const amount = round2(tickets * activity.unitCredits);

  const spend = await spendCredits(userId, amount);
  if (!spend.ok) {
    throw new Error(`${spend.reason}：兑换 ${tickets} 张需要 ${formatAmount(amount)} cr`);
  }

  try {
    await addCouponCredits(userId, kind, activityKey, activity.couponName, amount);
    await db.insert(topups).values({
      id: crypto.randomUUID(),
      userId,
      amount: -amount,
      type: COUPON_TOPUP_TYPE,
      description: `兑换${activity.couponName} ${tickets} 张（${formatAmount(amount)} cr，${activity.label}）`,
      createdAt: new Date(),
    });
  } catch (err) {
    await refundPermanentCredits(
      userId,
      amount,
      `兑换${activity.couponName}失败退回（${formatAmount(amount)} cr）`,
    ).catch(() => undefined);
    throw err;
  }

  return { credits: amount, tickets, couponName: activity.couponName };
}

/** 珍宝礼包：花 cr 买券面，200% / 500% / 1000% 三档；倍率越高限购越紧。 */
export async function buyCouponPack(
  userId: string,
  kind: ActivityKind,
  packKey: string,
): Promise<{ credits: number; price: number; couponName: string }> {
  const pack = COUPON_PACKS.find((item) => item.key === packKey);
  if (!pack) throw new Error("礼包不存在");
  const activity = await resolveActivity(kind);
  const activityKey = assertActive(activity);

  const usage = await readPackUsage(userId);
  const used = usage.get(pack.key) ?? { today: 0, total: 0 };
  if (pack.dailyLimit !== null && used.today >= pack.dailyLimit) {
    throw new Error(`${pack.name}今日限购 ${pack.dailyLimit} 份，今天已买满，明天再来`);
  }
  if (pack.totalLimit !== null && used.total >= pack.totalLimit) {
    throw new Error(`${pack.name}累计限购 ${pack.totalLimit} 份，已达上限`);
  }

  const spend = await spendCredits(userId, pack.priceCredits);
  if (!spend.ok) throw new Error(`${spend.reason}：礼包需要 ${pack.priceCredits} cr`);

  const credits = round2(pack.priceCredits * pack.ratio);
  const purchaseId = crypto.randomUUID();
  const now = new Date();
  let recorded = false;
  try {
    // 单条语句里复查两份计数再插入：并发下第二单会在这里被挡下，不会突破限购。
    const { changes } = await d1Run(
      `INSERT INTO coupon_pack_purchase
         (id, userId, packKey, activityKind, activityKey, priceCredits, couponCredits, createdAt)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?
       WHERE (SELECT COUNT(*) FROM coupon_pack_purchase WHERE userId = ? AND packKey = ?) < ?
         AND (SELECT COUNT(*) FROM coupon_pack_purchase
               WHERE userId = ? AND packKey = ? AND createdAt >= ?) < ?`,
      [
        purchaseId,
        userId,
        pack.key,
        kind,
        activityKey,
        pack.priceCredits,
        credits,
        now.getTime(),
        userId,
        pack.key,
        pack.totalLimit ?? 1_000_000_000,
        userId,
        pack.key,
        cnStartOfToday().getTime(),
        pack.dailyLimit ?? 1_000_000_000,
      ],
    );
    if (changes !== 1) throw new Error(`${pack.name}已到限购上限`);
    recorded = true;

    await addCouponCredits(userId, kind, activityKey, activity.couponName, credits);
    await db.insert(topups).values({
      id: crypto.randomUUID(),
      userId,
      amount: -pack.priceCredits,
      type: COUPON_TOPUP_TYPE,
      description: `购买${pack.name}（${activity.couponName} ${credits} cr，${activity.label}）`,
      createdAt: now,
    });
  } catch (err) {
    if (recorded) {
      await db
        .delete(couponPackPurchases)
        .where(eq(couponPackPurchases.id, purchaseId))
        .catch(() => undefined);
    }
    await refundPermanentCredits(
      userId,
      pack.priceCredits,
      `购买${pack.name}失败退回（${pack.priceCredits} cr）`,
    ).catch(() => undefined);
    throw err;
  }

  return { credits, price: pack.priceCredits, couponName: activity.couponName };
}

export interface CouponPayment {
  couponId: string | null;
  couponPart: number;
}

/**
 * 玩法付费点的统一扣款：只扣当期活动券，不再接受货币直付。
 * 券的扣减用条件 UPDATE 原子占位；券不足直接失败，由调用方提示先兑换。
 */
export async function payWithCoupon(
  userId: string,
  kind: ActivityKind,
  activityKey: string,
  rawAmount: number,
): Promise<{ ok: true; payment: CouponPayment } | { ok: false; reason: string }> {
  const amount = round2(Number(rawAmount));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: true, payment: { couponId: null, couponPart: 0 } };
  }

  const rows = await db
    .select({ id: activityCoupons.id, credits: activityCoupons.credits })
    .from(activityCoupons)
    .where(
      and(
        eq(activityCoupons.userId, userId),
        eq(activityCoupons.activityKind, kind),
        eq(activityCoupons.activityKey, activityKey),
      ),
    )
    .limit(1);

  const available = rows[0] ? round2(Number(rows[0].credits)) : 0;
  if (!rows[0] || available < amount) {
    return {
      ok: false,
      reason: `活动券不足：本次需要 ${formatAmount(amount)} cr 券面，当前可用 ${formatAmount(available)} cr，请先兑换`,
    };
  }

  const { changes } = await d1Run(
    "UPDATE activity_coupon SET credits = credits - ?, updatedAt = ? WHERE id = ? AND credits >= ?",
    [amount, Date.now(), rows[0].id, amount],
  );
  if (changes !== 1) {
    return {
      ok: false,
      reason: `活动券不足：本次需要 ${formatAmount(amount)} cr 券面，请先兑换`,
    };
  }

  return { ok: true, payment: { couponId: rows[0].id, couponPart: amount } };
}

/** 建局/开局失败时把券退回原处；退回失败只记日志，券不会凭空消失。 */
export async function refundCouponPayment(payment: CouponPayment): Promise<void> {
  if (payment.couponId && payment.couponPart > 0) {
    await d1Run(
      "UPDATE activity_coupon SET credits = credits + ?, updatedAt = ? WHERE id = ?",
      [payment.couponPart, Date.now(), payment.couponId],
    ).catch((err) => console.error("[refundCouponPayment] 券退回失败:", err));
  }
}

/** 奖励发放到券：按当前轮次入账，轮次无效时由调用方降级成 cr。 */
export async function grantCoupon(
  userId: string,
  kind: ActivityKind,
  rawAmount: number,
): Promise<{ activityKey: string; couponName: string; credits: number }> {
  const amount = round2(Number(rawAmount));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("券面金额必须大于 0");
  const activity = await resolveActivity(kind);
  const activityKey = assertActive(activity);
  await addCouponCredits(userId, kind, activityKey, activity.couponName, amount);
  return { activityKey, couponName: activity.couponName, credits: amount };
}

/**
 * 站内信领取时按发放瞬间锁定的轮次与券名入账。
 * 活动在「发放 → 领取」之间结束也照发：券落在旧轮次，界面不再展示，等同当期作废。
 */
export async function grantCouponToRound(
  userId: string,
  kind: ActivityKind,
  activityKey: string,
  couponName: string,
  rawAmount: number,
): Promise<void> {
  const amount = round2(Number(rawAmount));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("券面金额必须大于 0");
  if (!activityKey.trim() || !couponName.trim()) throw new Error("活动券轮次或券名缺失");
  await addCouponCredits(userId, kind, activityKey, couponName, amount);
}
