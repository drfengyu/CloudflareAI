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
import { formatAmount, formatTickets } from "@/lib/billing/units";
import { cnStartOfToday } from "@/lib/date";
import { activityWindow, currentActivityKey } from "@/lib/lottery/prize-math";
import { getLotteryConfig } from "@/lib/lottery/config";
import { flipActivityKey, flipActivityWindow } from "@/lib/flip/config";
import { getFlipConfig } from "@/lib/flip/settings";
import { raidenActivityKey, raidenActivityWindow } from "@/lib/raiden/config";
import { getRaidenConfig } from "@/lib/raiden/settings";
import { trialActivityKey, trialActivityWindow } from "@/lib/trial/config";
import { getTrialConfig } from "@/lib/trial/settings";
import { workshopActivityKey, workshopActivityWindow } from "@/lib/workshop/config";
import { getWorkshopConfig } from "@/lib/workshop/settings";
import { collectionActivityKey, collectionActivityWindow } from "@/lib/collection/config";
import { getCollectionConfig } from "@/lib/collection/settings";
import { getCouponPackConfig, type CouponPackConfig } from "./pack-config";
import { packGrant } from "./pack-grant";
import { couponTickets, creditsForTickets, ticketsForCost } from "./ticket-math";

export { packGrant } from "./pack-grant";

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

/** 钱包流水 type=16：礼包附赠的临时余额，与活动券兑换区分开。 */
export const PACK_BONUS_TOPUP_TYPE = 16;

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
  trial: { kind: "trial", label: "每日试炼", short: "试炼券", href: "/trial" },
  workshop: { kind: "workshop", label: "灵宠工坊", short: "工坊券", href: "/workshop" },
  collection: { kind: "collection", label: "星匣图鉴", short: "星匣券", href: "/collection" },
};

/** 当前上线的三个玩法：活动中心、顶栏默认只展示它们。 */
export const LIVE_ACTIVITY_KINDS: ActivityKind[] = ["trial", "workshop", "collection"];

/** 保留可玩的经典玩法：入口收在活动中心的「经典玩法」里。 */
export const LEGACY_ACTIVITY_KINDS: ActivityKind[] = ["lottery", "flip", "raiden"];

export const ACTIVITY_KINDS: ActivityKind[] = [...LIVE_ACTIVITY_KINDS, ...LEGACY_ACTIVITY_KINDS];

/** 每期从池里按轮次确定一个名字：同一轮所有人看到同一张券，下一轮自然换名。 */
const COUPON_NAMES: Record<ActivityKind, string[]> = {
  lottery: ["星轨券", "月华券", "流萤券", "极光券", "焰羽券", "银河券"],
  flip: ["翻云券", "玲珑券", "探花券", "锦鲤券", "流光券", "叠翠券"],
  raiden: ["雷霆券", "疾风券", "破阵券", "闪电券", "龙吟券", "霜刃券"],
  trial: ["试金券", "晨星券", "破晓券", "砺心券", "明镜券", "启程券"],
  workshop: ["育灵券", "萌宠券", "藤蔓券", "绒尾券", "灵犀券", "匠心券"],
  collection: ["星匣券", "藏星券", "拾光券", "图鉴券", "银河匣券", "寻踪券"],
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
  key: string;
  name: string;
  /** 每份含的整数活动券张数；旧配置为 null，按旧实付价折算。 */
  tickets: number | null;
  /** 旧版实付 cr，仅在 tickets 为 null 时参与折算。 */
  priceCredits: number;
  /** 倍率百分比：张数 × 单价 相对实付的倍数，200 = 200%。 */
  ratioPercent: number;
  /** 每北京自然日限购份数；null = 不限。 */
  dailyLimit: number | null;
  /** 累计限购份数；null = 不限。 */
  totalLimit: number | null;
  /** 每份附赠的活动券张数。 */
  bonusTickets: number;
  /** 每份附赠的临时余额 tcr；0 = 不送。 */
  tempCredits: number;
  /** 赠送临时余额的有效天数。 */
  tempValidDays: number;
}

/** 管理端配置直接决定礼包身份与内容，档位数量不固定。 */
export function buildCouponPacks(config: CouponPackConfig): CouponPack[] {
  return config.packs.map((setting) => ({
    key: setting.key,
    name: setting.name,
    tickets: setting.tickets,
    priceCredits: setting.priceCredits,
    ratioPercent: setting.ratioPercent,
    dailyLimit: setting.dailyLimit > 0 ? setting.dailyLimit : null,
    totalLimit: setting.totalLimit > 0 ? setting.totalLimit : null,
    bonusTickets: setting.bonusTickets,
    tempCredits: setting.tempCredits,
    tempValidDays: setting.tempValidDays,
  }));
}

export interface CouponPackView extends CouponPack {
  boughtToday: number;
  boughtTotal: number;
  /** 该活动口径下的实付 cr：张数 × 单价 × 100 ÷ 倍率。 */
  price: number;
  /** 倍率档的当期活动券张数（不含赠券）。 */
  ratioTickets: number;
  /** 到账合计张数：倍率档 + 赠券。 */
  totalTickets: number;
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

function packViews(
  config: CouponPackConfig,
  usage: Map<string, PackUsage>,
  unitCredits: number,
): CouponPackView[] {
  return buildCouponPacks(config).map((pack) => {
    const grant = packGrant(pack, unitCredits);
    return {
      ...pack,
      boughtToday: usage.get(pack.key)?.today ?? 0,
      boughtTotal: usage.get(pack.key)?.total ?? 0,
      price: grant.priceCredits,
      ratioTickets: grant.ratioTickets,
      totalTickets: grant.totalTickets,
    };
  });
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
  } else if (kind === "raiden") {
    const config = await getRaidenConfig();
    status = raidenActivityWindow(config).status;
    activityKey = raidenActivityKey(config);
    unitCredits = config.couponUnitCredits;
  } else if (kind === "trial") {
    const config = await getTrialConfig();
    status = trialActivityWindow(config).status;
    activityKey = trialActivityKey(config);
    unitCredits = config.couponUnitCredits;
  } else if (kind === "workshop") {
    const config = await getWorkshopConfig();
    status = workshopActivityWindow(config).status;
    activityKey = workshopActivityKey(config);
    unitCredits = config.couponUnitCredits;
  } else {
    const config = await getCollectionConfig();
    status = collectionActivityWindow(config).status;
    activityKey = collectionActivityKey(config);
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

/** 当前上线玩法的券与状态。 */
export async function resolveActivities(): Promise<ResolvedActivity[]> {
  return Promise.all(LIVE_ACTIVITY_KINDS.map((kind) => resolveActivity(kind)));
}

/** 经典玩法的券与状态；只在活动中心与各自玩法页用到。 */
export async function resolveLegacyActivities(): Promise<ResolvedActivity[]> {
  return Promise.all(LEGACY_ACTIVITY_KINDS.map((kind) => resolveActivity(kind)));
}

export interface ActivityCouponView extends ResolvedActivity {
  credits: number;
  /** 可用整张数：不足一张的零头不计。 */
  tickets: number;
  packs: CouponPackView[];
}

export interface CurrencySnapshot {
  permanent: number;
  temporary: number;
  coupons: ActivityCouponView[];
}

const round2 = (value: number): number => Math.round(value * 100) / 100;
const DAY_MS = 86_400_000;

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
  // 一个用户的券行最多 6 条（六种玩法各一），直接按用户取回再筛，避免 D1 对复合表达式 IN 的解析坑。
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
 * 一次取齐若干种券的余额；默认只取当前上线的三个玩法。
 * `resolveActivity` 要逐个读活动配置，与余额查询并发。
 */
export async function listActivityCoupons(
  userId: string,
  kinds: ActivityKind[] = LIVE_ACTIVITY_KINDS,
): Promise<ActivityCouponView[]> {
  const activities = await Promise.all(kinds.map((kind) => resolveActivity(kind)));
  const [balances, usage, packConfig] = await Promise.all([
    readCouponRows(
      userId,
      activities.map((item) => ({ kind: item.kind, activityKey: item.activityKey })),
    ),
    readPackUsage(userId),
    getCouponPackConfig(),
  ]);
  return activities.map((item) => {
    const credits = item.activityKey
      ? round2(balances.get(`${item.kind}|${item.activityKey}`) ?? 0)
      : 0;
    return {
      ...item,
      credits,
      tickets: couponTickets(credits, item.unitCredits),
      packs: packViews(packConfig, usage, item.unitCredits),
    };
  });
}

/** 经典玩法的券余额：活动中心的「经典玩法」分区使用。 */
export async function listLegacyActivityCoupons(userId: string): Promise<ActivityCouponView[]> {
  return listActivityCoupons(userId, LEGACY_ACTIVITY_KINDS);
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
  const [balances, usage, packConfig] = await Promise.all([
    activity.activityKey
      ? readCouponRows(userId, [{ kind, activityKey: activity.activityKey }])
      : Promise.resolve(new Map<string, number>()),
    readPackUsage(userId),
    getCouponPackConfig(),
  ]);
  const credits = activity.activityKey
    ? round2(balances.get(`${kind}|${activity.activityKey}`) ?? 0)
    : 0;
  return {
    ...activity,
    credits,
    tickets: couponTickets(credits, activity.unitCredits),
    packs: packViews(packConfig, usage, activity.unitCredits),
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
    throw new Error(`${spend.reason}：兑换 ${tickets} 张需要 ${formatAmount(amount)} cr 等值`);
  }

  try {
    await addCouponCredits(userId, kind, activityKey, activity.couponName, amount);
    await db.insert(topups).values({
      id: crypto.randomUUID(),
      userId,
      amount: -amount,
      type: COUPON_TOPUP_TYPE,
      description: `兑换${activity.couponName} ${tickets} 张（${formatAmount(amount)} cr 等值，${activity.label}）`,
      createdAt: new Date(),
    });
  } catch (err) {
    await refundPermanentCredits(
      userId,
      amount,
      `兑换${activity.couponName}失败退回（${formatAmount(amount)} cr 等值）`,
    ).catch(() => undefined);
    throw err;
  }

  return { credits: amount, tickets, couponName: activity.couponName };
}

/** 珍宝礼包：花 cr 买当期活动券，倍率、限购与附赠内容读后台配置（0 = 不限 / 不送）。 */
export async function buyCouponPack(
  userId: string,
  kind: ActivityKind,
  packKey: string,
): Promise<{
  tickets: number;
  bonusTickets: number;
  tempCredits: number;
  tempValidDays: number;
  price: number;
  couponName: string;
}> {
  const packConfig = await getCouponPackConfig();
  const pack = buildCouponPacks(packConfig).find((item) => item.key === packKey);
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

  const grant = packGrant(pack, activity.unitCredits);
  const price = grant.priceCredits;
  const credits = grant.totalCredits;

  const spend = await spendCredits(userId, price);
  if (!spend.ok) throw new Error(`${spend.reason}：礼包需要 ${formatAmount(price)} cr 等值`);

  const purchaseId = crypto.randomUUID();
  const now = new Date();
  let recorded = false;
  let couponGranted = false;
  let tempBalanceId: string | null = null;
  let tempTopupId: string | null = null;
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
        price,
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
    couponGranted = true;

    const bonusParts: string[] = [];
    if (grant.bonusTickets > 0) bonusParts.push(`含赠 ${grant.bonusTickets} 张`);
    if (pack.tempCredits > 0) bonusParts.push(`赠 ${formatAmount(pack.tempCredits)} tcr`);
    const bonusText = bonusParts.length > 0 ? `，${bonusParts.join("、")}` : "";
    await db.insert(topups).values({
      id: crypto.randomUUID(),
      userId,
      amount: -price,
      type: COUPON_TOPUP_TYPE,
      description: `购买${pack.name}（${activity.couponName} +${formatTickets(grant.totalTickets)} 张${bonusText}，${activity.label}）`,
      createdAt: now,
    });

    if (pack.tempCredits > 0) {
      tempBalanceId = crypto.randomUUID();
      await db.insert(temporaryBalances).values({
        id: tempBalanceId,
        userId,
        amount: pack.tempCredits,
        expiresAt: new Date(now.getTime() + pack.tempValidDays * DAY_MS),
        description: `购买${pack.name}赠送（${pack.tempValidDays} 天内有效）`,
        createdAt: now,
      });
      tempTopupId = crypto.randomUUID();
      await db.insert(topups).values({
        id: tempTopupId,
        userId,
        amount: pack.tempCredits,
        type: PACK_BONUS_TOPUP_TYPE,
        description: `购买${pack.name}赠送 tcr（${activity.label}）`,
        createdAt: now,
      });
    }
  } catch (err) {
    if (tempTopupId) {
      await db.delete(topups).where(eq(topups.id, tempTopupId)).catch(() => undefined);
    }
    if (tempBalanceId) {
      await db
        .delete(temporaryBalances)
        .where(eq(temporaryBalances.id, tempBalanceId))
        .catch(() => undefined);
    }
    if (couponGranted) {
      // 券面可能已被用户同时在别的页面花掉，条件扣减挡一次负余额；没扣净只记日志。
      const { changes } = await d1Run(
        `UPDATE activity_coupon SET credits = credits - ?, updatedAt = ?
          WHERE userId = ? AND activityKind = ? AND activityKey = ? AND credits >= ?`,
        [credits, Date.now(), userId, kind, activityKey, credits],
      ).catch(() => ({ changes: 0 }));
      if (changes !== 1) {
        console.error("[buyCouponPack] 失败回滚时券面未能全额撤回:", {
          userId,
          kind,
          activityKey,
          credits,
        });
      }
    }
    if (recorded) {
      await db
        .delete(couponPackPurchases)
        .where(eq(couponPackPurchases.id, purchaseId))
        .catch(() => undefined);
    }
    await refundPermanentCredits(
      userId,
      price,
      `购买${pack.name}失败退回（${formatAmount(price)} cr 等值）`,
    ).catch(() => undefined);
    throw err;
  }

  return {
    tickets: grant.totalTickets,
    bonusTickets: grant.bonusTickets,
    tempCredits: pack.tempCredits,
    tempValidDays: pack.tempValidDays,
    price,
    couponName: activity.couponName,
  };
}

export interface CouponPayment {
  couponId: string | null;
  couponPart: number;
  /** 本次扣掉的整张数。 */
  tickets: number;
}

/**
 * 玩法付费点的统一扣款：只扣当期活动券，不再接受货币直付。
 * 费用按「整张 × 该活动券单价」结算；券不足直接失败，由调用方提示先兑换。
 */
export async function payWithCoupon(
  userId: string,
  kind: ActivityKind,
  activityKey: string,
  rawCostCredits: number,
  rawUnitCredits: number,
): Promise<{ ok: true; payment: CouponPayment } | { ok: false; reason: string }> {
  const unit = rawUnitCredits > 0 ? rawUnitCredits : 1;
  const tickets = ticketsForCost(Number(rawCostCredits), unit);
  if (tickets <= 0) {
    return { ok: true, payment: { couponId: null, couponPart: 0, tickets: 0 } };
  }
  const amount = creditsForTickets(tickets, unit);

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

  const available = rows[0] ? couponTickets(Number(rows[0].credits), unit) : 0;
  if (!rows[0] || available < tickets) {
    return {
      ok: false,
      reason: `活动券不足：本次需要 ${tickets} 张，当前可用 ${available} 张，请先兑换`,
    };
  }

  const { changes } = await d1Run(
    "UPDATE activity_coupon SET credits = credits - ?, updatedAt = ? WHERE id = ? AND credits >= ?",
    [amount, Date.now(), rows[0].id, amount],
  );
  if (changes !== 1) {
    return {
      ok: false,
      reason: `活动券不足：本次需要 ${tickets} 张，请先兑换`,
    };
  }

  return { ok: true, payment: { couponId: rows[0].id, couponPart: amount, tickets } };
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
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("活动券到账金额必须大于 0");
  if (!activityKey.trim() || !couponName.trim()) throw new Error("活动券轮次或券名缺失");
  await addCouponCredits(userId, kind, activityKey, couponName, amount);
}

/**
 * 开奖/累抽失败时撤回刚发的活动券：条件扣减挡一次负余额（券可能已被同时花掉），
 * 没扣净只记日志，不让补偿流程二次抛错盖住原始异常。
 */
export async function revokeCouponCredits(
  userId: string,
  kind: ActivityKind,
  activityKey: string,
  rawAmount: number,
): Promise<void> {
  const amount = round2(Number(rawAmount));
  if (!Number.isFinite(amount) || amount <= 0) return;
  const { changes } = await d1Run(
    `UPDATE activity_coupon SET credits = credits - ?, updatedAt = ?
      WHERE userId = ? AND activityKind = ? AND activityKey = ? AND credits >= ?`,
    [amount, Date.now(), userId, kind, activityKey, amount],
  ).catch(() => ({ changes: 0 }));
  if (changes !== 1) {
    console.error("[revokeCouponCredits] 撤回活动券时券面未能全额扣回:", {
      userId,
      kind,
      activityKey,
      amount,
    });
  }
}

/** 某轮次当前可用整张活动券；轮次为空或没有券行时按 0。开奖前读一次做展示基线。 */
export async function couponTicketBalance(
  userId: string,
  kind: ActivityKind,
  activityKey: string | null,
  unitCredits: number,
): Promise<number> {
  if (!activityKey) return 0;
  const rows = await db
    .select({ credits: activityCoupons.credits })
    .from(activityCoupons)
    .where(
      and(
        eq(activityCoupons.userId, userId),
        eq(activityCoupons.activityKind, kind),
        eq(activityCoupons.activityKey, activityKey),
      ),
    )
    .limit(1);
  return couponTickets(Number(rows[0]?.credits ?? 0), unitCredits);
}
