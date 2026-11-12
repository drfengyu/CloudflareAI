import { d1All } from "@/lib/db/d1-http";
import { ledgerHasMovement } from "@/lib/billing/ledger";
import { COUPON_TOPUP_TYPE, PACK_BONUS_TOPUP_TYPE, type ActivityKind } from "@/lib/activity/coupons";
import { TOPUP_TYPE_LOTTERY } from "@/lib/lottery/prize-math";
import { TOPUP_TYPE_FLIP } from "@/lib/flip/config";
import { TOPUP_TYPE_RAIDEN } from "@/lib/raiden/config";
import { TOPUP_TYPE_TRIAL } from "@/lib/trial/config";
import { TOPUP_TYPE_WORKSHOP } from "@/lib/workshop/config";
import { TOPUP_TYPE_COLLECTION } from "@/lib/collection/config";

/**
 * 管理端「活动记录」：按活动 → 活动时段 → 北京日 / 用户汇总站点收支。
 *
 * 站点视角与个人账本相反——用户花 cr 买券（`type=15`）是站点收入，
 * 活动发奖（`type=6/11/12/17/18/19`）与礼包赠 tcr（`type=16`）是站点支出；
 * 转盘的倒扣同样记为站点收入。`type=15/16` 是六种活动共用的流水，只能从
 * 描述里的活动名反推归属，反推不到的单独落在「未归属活动券」。
 *
 * 页面上没有全局时间窗：每个活动只展示它自己实际有流水的时段，
 * 时段由该活动的首末记账日推导，活动内部再按天拆开。
 */

export type ActivityLedgerKey = ActivityKind | "other";

interface ActivityLedgerMeta {
  key: ActivityLedgerKey;
  label: string;
  /** 该活动自己的奖励流水类型；`15/16` 无独立类型，靠描述匹配。 */
  rewardType: number | null;
  /** 描述里的活动名关键字（兑换 / 礼包流水的归属依据），兼容旧活动名。 */
  match: string[] | null;
}

export const ACTIVITY_LEDGER_META: ActivityLedgerMeta[] = [
  { key: "trial", label: "每日试炼", rewardType: TOPUP_TYPE_TRIAL, match: ["试炼"] },
  { key: "workshop", label: "灵宠工坊", rewardType: TOPUP_TYPE_WORKSHOP, match: ["工坊"] },
  {
    key: "collection",
    label: "星图共鸣",
    rewardType: TOPUP_TYPE_COLLECTION,
    match: ["星图", "星匣"],
  },
  { key: "lottery", label: "幸运转盘", rewardType: TOPUP_TYPE_LOTTERY, match: ["转盘"] },
  { key: "flip", label: "翻牌夺宝", rewardType: TOPUP_TYPE_FLIP, match: ["翻牌"] },
  { key: "raiden", label: "雷电行动", rewardType: TOPUP_TYPE_RAIDEN, match: ["雷电"] },
];

export const ACTIVITY_LEDGER_OTHER_LABEL = "未归属活动券";

const LABEL_BY_KEY = new Map<ActivityLedgerKey, string>([
  ...ACTIVITY_LEDGER_META.map((item) => [item.key, item.label] as [ActivityLedgerKey, string]),
  ["other", ACTIVITY_LEDGER_OTHER_LABEL],
]);

const TYPE_TO_KEY = new Map<number, ActivityLedgerKey>(
  ACTIVITY_LEDGER_META.filter((item) => item.rewardType !== null).map(
    (item) => [item.rewardType as number, item.key] as [number, ActivityLedgerKey],
  ),
);

const TYPES = [
  ...ACTIVITY_LEDGER_META.filter((item) => item.rewardType !== null).map(
    (item) => item.rewardType as number,
  ),
  COUPON_TOPUP_TYPE,
  PACK_BONUS_TOPUP_TYPE,
];

/** 流水归属：独有类型直接映射；兑换 / 礼包按描述里的活动名反推。 */
export function activityKeyForRow(typeCode: number, description: string | null): ActivityLedgerKey | null {
  const direct = TYPE_TO_KEY.get(typeCode);
  if (direct) return direct;
  if (typeCode !== COUPON_TOPUP_TYPE && typeCode !== PACK_BONUS_TOPUP_TYPE) return null;
  const text = description ?? "";
  const matched = ACTIVITY_LEDGER_META.find((item) =>
    item.match?.some((keyword) => text.includes(keyword)),
  );
  return matched?.key ?? "other";
}

/** 与 `activityKeyForRow` 同一份元数据生成的 SQL CASE，避免两边各维护一套口径。 */
function attributionCase(alias = ""): string {
  const prefix = alias ? `${alias}.` : "";
  return `CASE
  ${ACTIVITY_LEDGER_META.map((item) => `WHEN ${prefix}type = ${item.rewardType} THEN '${item.key}'`).join("\n  ")}
  ${ACTIVITY_LEDGER_META.flatMap((item) =>
    (item.match ?? []).map(
      (keyword) =>
        `WHEN ${prefix}type IN (${COUPON_TOPUP_TYPE}, ${PACK_BONUS_TOPUP_TYPE}) AND ${prefix}description LIKE '%${keyword}%' THEN '${item.key}'`,
    ),
  ).join("\n  ")}
  ELSE 'other'
END`;
}

const DAY_OF = "strftime('%Y-%m-%d', t.createdAt / 1000, 'unixepoch', '+8 hours')";

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const ORDER = new Map<ActivityLedgerKey, number>(
  [...ACTIVITY_LEDGER_META.map((item) => item.key), "other"].map(
    (key, index) => [key, index] as [ActivityLedgerKey, number],
  ),
);

export interface ActivityLedgerRawRow {
  activityKey: string;
  date: string;
  userId: string | null;
  name: string | null;
  email: string | null;
  income: number;
  expense: number;
  entries: number;
}

export interface ActivityLedgerDayTotal {
  /** 北京墙钟 `YYYY-MM-DD`。 */
  date: string;
  income: number;
  expense: number;
  entries: number;
}

export interface ActivityLedgerUserRow {
  userId: string;
  /** 显示名；没有昵称时退回邮箱或 userId 前缀。 */
  label: string;
  income: number;
  expense: number;
  entries: number;
}

export interface ActivityLedgerSection {
  key: ActivityLedgerKey;
  label: string;
  /** 该活动实际有账的首末北京日；没有流水时为 null。 */
  firstDate: string | null;
  lastDate: string | null;
  income: number;
  expense: number;
  entries: number;
  /** 窗口内为该活动付过费或领过奖的人数。 */
  users: number;
  /** 按日倒序。 */
  days: ActivityLedgerDayTotal[];
  /** 按付入 + 领出倒序。 */
  userRows: ActivityLedgerUserRow[];
}

interface SectionAccumulator {
  key: ActivityLedgerKey;
  days: Map<string, ActivityLedgerDayTotal>;
  users: Map<string, ActivityLedgerUserRow>;
}

const userLabel = (row: ActivityLedgerRawRow): string =>
  (row.name && row.name.trim()) ||
  (row.email && row.email.trim()) ||
  `${row.userId?.slice(0, 8) ?? ""}…`;

/**
 * 把「活动 × 日 × 用户」的原始汇总折叠成每个活动一段：
 * 活动总计、按天表、按用户小计。同一天或同一个人跨多行时在这里相加。
 */
export function foldActivitySections(rows: ActivityLedgerRawRow[]): ActivityLedgerSection[] {
  const acc = new Map<ActivityLedgerKey, SectionAccumulator>();

  for (const row of rows) {
    if (!row.date) continue;
    if (!ledgerHasMovement(row)) continue;
    const key = (ORDER.has(row.activityKey as ActivityLedgerKey)
      ? row.activityKey
      : "other") as ActivityLedgerKey;
    const section = acc.get(key) ?? { key, days: new Map(), users: new Map() };

    const day = section.days.get(row.date) ?? {
      date: row.date,
      income: 0,
      expense: 0,
      entries: 0,
    };
    day.income += row.income;
    day.expense += row.expense;
    day.entries += row.entries;
    section.days.set(row.date, day);

    if (row.userId) {
      const user = section.users.get(row.userId) ?? {
        userId: row.userId,
        label: userLabel(row),
        income: 0,
        expense: 0,
        entries: 0,
      };
      user.income += row.income;
      user.expense += row.expense;
      user.entries += row.entries;
      section.users.set(row.userId, user);
    }

    acc.set(key, section);
  }

  return [...acc.values()]
    .map((section) => {
      const days = [...section.days.values()].sort((a, b) => b.date.localeCompare(a.date));
      const userRows = [...section.users.values()].sort(
        (a, b) => b.income + b.expense - (a.income + a.expense) || b.entries - a.entries,
      );
      return {
        key: section.key,
        label: LABEL_BY_KEY.get(section.key) ?? ACTIVITY_LEDGER_OTHER_LABEL,
        firstDate: days.length > 0 ? days[days.length - 1].date : null,
        lastDate: days.length > 0 ? days[0].date : null,
        income: days.reduce((sum, day) => sum + day.income, 0),
        expense: days.reduce((sum, day) => sum + day.expense, 0),
        entries: days.reduce((sum, day) => sum + day.entries, 0),
        users: section.users.size,
        days,
        userRows,
      };
    })
    .sort((a, b) => (ORDER.get(a.key) ?? 99) - (ORDER.get(b.key) ?? 99));
}

/** 一次扫描拿到「活动 × 日 × 用户」的汇总；活动时段由数据本身的首末日给出。 */
export async function listActivityLedgerSections(): Promise<{
  sections: ActivityLedgerSection[];
  totals: ActivityLedgerTotals;
}> {
  const rows = await d1All<Record<string, unknown>>(
    `SELECT ${attributionCase("t")} AS activityKey,
            ${DAY_OF} AS date,
            t.userId AS userId,
            u.name AS name,
            u.email AS email,
            SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END) AS income,
            SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) AS expense,
            COUNT(*) AS entries
     FROM topup t
     LEFT JOIN user u ON u.id = t.userId
     WHERE t.type IN (${TYPES.join(", ")}) AND t.amount <> 0
     GROUP BY activityKey, date, t.userId`,
  );
  const parsed = rows.map((row) => ({
    activityKey: String(row.activityKey ?? "other"),
    date: typeof row.date === "string" ? row.date : "",
    userId: row.userId ? String(row.userId) : null,
    name: row.name ? String(row.name) : null,
    email: row.email ? String(row.email) : null,
    income: num(row.income),
    expense: num(row.expense),
    entries: num(row.entries),
  }));
  const sections = foldActivitySections(parsed);
  return { sections, totals: sumSections(sections, parsed) };
}

export interface ActivityLedgerTotals {
  income: number;
  expense: number;
  entries: number;
  users: number;
}

/** 全站总计：各活动金额相加，人数按 userId 去重（同一人参加多个活动只算一次）。 */
export function sumSections(
  sections: ActivityLedgerSection[],
  rows: ActivityLedgerRawRow[],
): ActivityLedgerTotals {
  const sums = sections.reduce(
    (sum, section) => ({
      income: sum.income + section.income,
      expense: sum.expense + section.expense,
      entries: sum.entries + section.entries,
    }),
    { income: 0, expense: 0, entries: 0 },
  );
  const distinct = new Set(rows.filter((row) => ledgerHasMovement(row)).map((row) => row.userId));
  distinct.delete(null);
  return { ...sums, users: distinct.size };
}
