import { and, eq, gt, sql } from "drizzle-orm";
import { d1Run, db } from "@/lib/db/d1-http";
import {
  activityCoupons,
  temporaryBalances,
  topups,
  users,
  type ActivityKind,
} from "@/lib/db/schema";
import { spendCredits, refundPermanentCredits } from "@/lib/billing/spend";
import { activityWindow, currentActivityKey } from "@/lib/lottery/prize-math";
import { getLotteryConfig } from "@/lib/lottery/config";
import { flipActivityKey, flipActivityWindow } from "@/lib/flip/config";
import { getFlipConfig } from "@/lib/flip/settings";
import { raidenActivityKey, raidenActivityWindow } from "@/lib/raiden/config";
import { getRaidenConfig } from "@/lib/raiden/settings";

/**
 * 活动券：一种玩法一种券，按活动轮次隔离。
 *
 * 券是「已预付的 credits」：兑换或买礼包时从余额扣 cr（流水 type=15），
 * 之后在对应玩法的付费点先抵扣券、再扣临时/永久余额；券内抵扣不再写 cr 流水，
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
}

/** 三档珍宝礼包；比例按需求固定为 200% / 500% / 1000%。 */
export const COUPON_PACKS: CouponPack[] = [
  { key: "small", name: "小份珍宝", priceCredits: 10, ratio: 2 },
  { key: "medium", name: "中份珍宝", priceCredits: 50, ratio: 5 },
  { key: "large", name: "大份珍宝", priceCredits: 100, ratio: 10 },
];

interface ResolvedActivity {
  kind: ActivityKind;
  label: string;
  href: string;
  status: ActivityStatus;
  activityKey: string | null;
  couponName: string;
}

async function resolveActivity(kind: ActivityKind): Promise<ResolvedActivity> {
  const meta = ACTIVITY_META[kind];
  let status: ActivityStatus;
  let activityKey: string | null;
  if (kind === "lottery") {
    const config = await getLotteryConfig();
    status = activityWindow(config).status;
    activityKey = currentActivityKey(config);
  } else if (kind === "flip") {
    const config = await getFlipConfig();
    status = flipActivityWindow(config).status;
    activityKey = flipActivityKey(config);
  } else {
    const config = await getRaidenConfig();
    status = raidenActivityWindow(config).status;
    activityKey = raidenActivityKey(config);
  }
  return {
    ...meta,
    status,
    activityKey,
    couponName: couponNameFor(kind, activityKey),
  };
}

export async function resolveActivities(): Promise<ResolvedActivity[]> {
  return Promise.all(ACTIVITY_KINDS.map((kind) => resolveActivity(kind)));
}

export interface ActivityCouponView extends ResolvedActivity {
  credits: number;
  packs: CouponPack[];
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
  const balances = await readCouponRows(
    userId,
    activities.map((item) => ({ kind: item.kind, activityKey: item.activityKey })),
  );
  return activities.map((item) => ({
    ...item,
    credits: item.activityKey ? round2(balances.get(`${item.kind}|${item.activityKey}`) ?? 0) : 0,
    packs: COUPON_PACKS,
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
  const balances = activity.activityKey
    ? await readCouponRows(userId, [{ kind, activityKey: activity.activityKey }])
    : new Map<string, number>();
  return {
    ...activity,
    credits: activity.activityKey
      ? round2(balances.get(`${kind}|${activity.activityKey}`) ?? 0)
      : 0,
    packs: COUPON_PACKS,
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

/** 兑换活动券：先花临时余额再花永久余额，1:1 换券面。 */
export async function exchangeCoupon(
  userId: string,
  kind: ActivityKind,
  rawAmount: number,
): Promise<{ credits: number; couponName: string }> {
  const amount = round2(Number(rawAmount));
  if (!Number.isFinite(amount) || amount < 1 || amount > 100_000) {
    throw new Error("兑换数量需在 1 ~ 100000 之间");
  }
  const activity = await resolveActivity(kind);
  const activityKey = assertActive(activity);

  const spend = await spendCredits(userId, amount);
  if (!spend.ok) throw new Error(`${spend.reason}：兑换需要 ${amount} cr`);

  try {
    await addCouponCredits(userId, kind, activityKey, activity.couponName, amount);
    await db.insert(topups).values({
      id: crypto.randomUUID(),
      userId,
      amount: -amount,
      type: COUPON_TOPUP_TYPE,
      description: `兑换${activity.couponName} ${amount} cr（${activity.label}）`,
      createdAt: new Date(),
    });
  } catch (err) {
    await refundPermanentCredits(userId, amount, `兑换${activity.couponName}失败退回（${amount} cr）`).catch(
      () => undefined,
    );
    throw err;
  }

  return { credits: amount, couponName: activity.couponName };
}

/** 珍宝礼包：花 cr 买券面，200% / 500% / 1000% 三档。 */
export async function buyCouponPack(
  userId: string,
  kind: ActivityKind,
  packKey: string,
): Promise<{ credits: number; price: number; couponName: string }> {
  const pack = COUPON_PACKS.find((item) => item.key === packKey);
  if (!pack) throw new Error("礼包不存在");
  const activity = await resolveActivity(kind);
  const activityKey = assertActive(activity);

  const spend = await spendCredits(userId, pack.priceCredits);
  if (!spend.ok) throw new Error(`${spend.reason}：礼包需要 ${pack.priceCredits} cr`);

  const credits = round2(pack.priceCredits * pack.ratio);
  try {
    await addCouponCredits(userId, kind, activityKey, activity.couponName, credits);
    await db.insert(topups).values({
      id: crypto.randomUUID(),
      userId,
      amount: -pack.priceCredits,
      type: COUPON_TOPUP_TYPE,
      description: `购买${pack.name}（${activity.couponName} ${credits} cr，${activity.label}）`,
      createdAt: new Date(),
    });
  } catch (err) {
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
  creditPart: number;
}

/**
 * 玩法付费点的统一扣款：先抵扣当期活动券，再扣临时/永久余额。
 * 券的扣减用条件 UPDATE 占位，余额扣失败会把券原样加回去。
 */
export async function payWithCoupon(
  userId: string,
  kind: ActivityKind,
  activityKey: string,
  rawAmount: number,
): Promise<{ ok: true; payment: CouponPayment } | { ok: false; reason: string }> {
  const amount = round2(Number(rawAmount));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: true, payment: { couponId: null, couponPart: 0, creditPart: 0 } };
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

  let couponId: string | null = null;
  let couponPart = 0;
  if (rows[0]) {
    const available = round2(Number(rows[0].credits));
    const take = Math.min(available, amount);
    if (take > 0) {
      const { changes } = await d1Run(
        "UPDATE activity_coupon SET credits = credits - ?, updatedAt = ? WHERE id = ? AND credits >= ?",
        [take, Date.now(), rows[0].id, take],
      );
      if (changes === 1) {
        couponId = rows[0].id;
        couponPart = take;
      }
    }
  }

  const creditPart = round2(amount - couponPart);
  if (creditPart > 0) {
    const spend = await spendCredits(userId, creditPart);
    if (!spend.ok) {
      if (couponId) {
        await d1Run(
          "UPDATE activity_coupon SET credits = credits + ?, updatedAt = ? WHERE id = ?",
          [couponPart, Date.now(), couponId],
        ).catch(() => undefined);
      }
      return { ok: false, reason: spend.reason };
    }
  }

  return { ok: true, payment: { couponId, couponPart, creditPart } };
}

/** 建局/开局失败时把券和现金各退回原处；券退回失败只记日志，钱不会凭空消失。 */
export async function refundCouponPayment(
  userId: string,
  payment: CouponPayment,
  description: string,
): Promise<void> {
  if (payment.couponId && payment.couponPart > 0) {
    await d1Run(
      "UPDATE activity_coupon SET credits = credits + ?, updatedAt = ? WHERE id = ?",
      [payment.couponPart, Date.now(), payment.couponId],
    ).catch((err) => console.error("[refundCouponPayment] 券退回失败:", err));
  }
  if (payment.creditPart > 0) {
    await refundPermanentCredits(userId, payment.creditPart, description).catch(() => undefined);
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
