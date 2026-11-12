import { d1All } from "@/lib/db/d1-http";
import { ledgerHasMovement } from "@/lib/billing/ledger";
import { cnLastNDaysStart, cnStartOfToday, cnStartOfTomorrow } from "@/lib/date";
import { COUPON_TOPUP_TYPE, PACK_BONUS_TOPUP_TYPE, type ActivityKind } from "@/lib/activity/coupons";
import { TOPUP_TYPE_LOTTERY } from "@/lib/lottery/prize-math";
import { TOPUP_TYPE_FLIP } from "@/lib/flip/config";
import { TOPUP_TYPE_RAIDEN } from "@/lib/raiden/config";
import { TOPUP_TYPE_TRIAL } from "@/lib/trial/config";
import { TOPUP_TYPE_WORKSHOP } from "@/lib/workshop/config";
import { TOPUP_TYPE_COLLECTION } from "@/lib/collection/config";

/**
 * 管理端「活动记录」：把六种限时活动的站点收支按北京日汇总成一张表。
 *
 * 站点视角与个人账本正好相反——用户花 cr 买券（`type=15`）是站点收入，
 * 活动发奖（`type=6/11/12/17/18/19`）与礼包赠 tcr（`type=16`）是站点支出；
 * 转盘的倒扣同样记为站点收入。`type=15/16` 是六种活动共用的流水，只能从
 * 描述里的活动名反推归属，反推不到的单独落在「未归属活动券」。
 */

export type ActivityLedgerKey = ActivityKind | "other";

interface ActivityLedgerMeta {
  key: ActivityLedgerKey;
  label: string;
  /** 该活动自己的奖励流水类型；`15/16` 无独立类型，靠描述匹配。 */
  rewardType: number | null;
  /** 描述里的活动名关键字（兑换 / 礼包流水的归属依据）。 */
  match: string | null;
}

export const ACTIVITY_LEDGER_META: ActivityLedgerMeta[] = [
  { key: "trial", label: "每日试炼", rewardType: TOPUP_TYPE_TRIAL, match: "试炼" },
  { key: "workshop", label: "灵宠工坊", rewardType: TOPUP_TYPE_WORKSHOP, match: "工坊" },
  { key: "collection", label: "星匣图鉴", rewardType: TOPUP_TYPE_COLLECTION, match: "星匣" },
  { key: "lottery", label: "幸运转盘", rewardType: TOPUP_TYPE_LOTTERY, match: "转盘" },
  { key: "flip", label: "翻牌夺宝", rewardType: TOPUP_TYPE_FLIP, match: "翻牌" },
  { key: "raiden", label: "雷电行动", rewardType: TOPUP_TYPE_RAIDEN, match: "雷电" },
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
  const matched = ACTIVITY_LEDGER_META.find((item) => item.match && text.includes(item.match));
  return matched?.key ?? "other";
}

/** 与 `activityKeyForRow` 同一份元数据生成的 SQL CASE，避免两边各维护一套口径。 */
function attributionCase(alias = ""): string {
  const prefix = alias ? `${alias}.` : "";
  return `CASE
  ${ACTIVITY_LEDGER_META.map((item) => `WHEN ${prefix}type = ${item.rewardType} THEN '${item.key}'`).join("\n  ")}
  ${ACTIVITY_LEDGER_META.map(
    (item) => `WHEN ${prefix}type IN (${COUPON_TOPUP_TYPE}, ${PACK_BONUS_TOPUP_TYPE}) AND ${prefix}description LIKE '%${item.match}%' THEN '${item.key}'`,
  ).join("\n  ")}
  ELSE 'other'
END`;
}

const ATTRIBUTION_CASE = attributionCase();

const DAY_OF = "strftime('%Y-%m-%d', createdAt / 1000, 'unixepoch', '+8 hours')";

export type ActivityLedgerRange = "today" | "7d" | "30d" | "all";

export const ACTIVITY_LEDGER_RANGES: { id: ActivityLedgerRange; label: string }[] = [
  { id: "today", label: "今日" },
  { id: "7d", label: "近 7 日" },
  { id: "30d", label: "近 30 日" },
  { id: "all", label: "全部" },
];

export const ACTIVITY_LEDGER_PAGE_DAYS = 10;

/** 窗口按北京日界：`today` 起于今天 00:00，其余到明天 00:00 为止。 */
export function activityLedgerWindow(range: ActivityLedgerRange): { start: Date; end: Date } | null {
  if (range === "all") return null;
  const end = cnStartOfTomorrow();
  if (range === "today") return { start: cnStartOfToday(), end };
  if (range === "7d") return { start: cnLastNDaysStart(7), end };
  return { start: cnLastNDaysStart(30), end };
}

interface ActivityLedgerRawRow {
  date: string;
  activityKey: string;
  income: number;
  expense: number;
  entries: number;
}

export interface ActivityLedgerCell {
  key: ActivityLedgerKey;
  label: string;
  income: number;
  expense: number;
  entries: number;
}

export interface ActivityLedgerDay {
  /** 北京墙钟 `YYYY-MM-DD`。 */
  date: string;
  income: number;
  expense: number;
  entries: number;
  cells: ActivityLedgerCell[];
}

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const ORDER = new Map<ActivityLedgerKey, number>(
  [...ACTIVITY_LEDGER_META.map((item) => item.key), "other"].map(
    (key, index) => [key, index] as [ActivityLedgerKey, number],
  ),
);

/** 一天内的活动小计按固定顺序排；没有真实进出的行不显示。 */
export function foldActivityLedger(rows: ActivityLedgerRawRow[]): ActivityLedgerDay[] {
  const days = new Map<string, ActivityLedgerDay>();
  for (const row of rows) {
    if (!row.date) continue;
    const key = (ORDER.has(row.activityKey as ActivityLedgerKey)
      ? row.activityKey
      : "other") as ActivityLedgerKey;
    if (!ledgerHasMovement(row)) continue;
    const day = days.get(row.date) ?? { date: row.date, income: 0, expense: 0, entries: 0, cells: [] };
    let cell = day.cells.find((item) => item.key === key);
    if (!cell) {
      cell = { key, label: LABEL_BY_KEY.get(key) ?? ACTIVITY_LEDGER_OTHER_LABEL, income: 0, expense: 0, entries: 0 };
      day.cells.push(cell);
    }
    cell.income += row.income;
    cell.expense += row.expense;
    cell.entries += row.entries;
    day.income += row.income;
    day.expense += row.expense;
    day.entries += row.entries;
    days.set(row.date, day);
  }
  return [...days.values()]
    .map((day) => ({
      ...day,
      cells: day.cells.sort((a, b) => (ORDER.get(a.key) ?? 99) - (ORDER.get(b.key) ?? 99)),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** 窗口内的逐日「日期 × 活动」汇总；空窗口返回空数组。 */
export async function listActivityLedgerDays(
  range: ActivityLedgerRange,
): Promise<ActivityLedgerDay[]> {
  const win = activityLedgerWindow(range);
  const rangeFilter = win ? " AND createdAt >= ? AND createdAt < ?" : "";
  const params = win ? [win.start.getTime(), win.end.getTime()] : [];
  const rows = await d1All<Record<string, unknown>>(
    `SELECT ${DAY_OF} AS date, ${ATTRIBUTION_CASE} AS activityKey,
            SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) AS income,
            SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS expense,
            COUNT(*) AS entries
     FROM topup
     WHERE type IN (${TYPES.join(", ")}) AND amount <> 0${rangeFilter}
     GROUP BY date, activityKey`,
    params,
  );
  return foldActivityLedger(
    rows
      .filter((row) => typeof row.date === "string")
      .map((row) => ({
        date: row.date as string,
        activityKey: String(row.activityKey ?? "other"),
        income: num(row.income),
        expense: num(row.expense),
        entries: num(row.entries),
      })),
  );
}

export function sumActivityLedger(days: ActivityLedgerDay[]): {
  income: number;
  expense: number;
  entries: number;
} {
  return days.reduce(
    (sum, day) => ({
      income: sum.income + day.income,
      expense: sum.expense + day.expense,
      entries: sum.entries + day.entries,
    }),
    { income: 0, expense: 0, entries: 0 },
  );
}

export interface ActivityLedgerActivityTotal {
  key: ActivityLedgerKey;
  label: string;
  income: number;
  expense: number;
  entries: number;
  /** 窗口内为该活动付过费或领过奖的人数。 */
  users: number;
}

interface ActivityTotalRawRow {
  activityKey: string;
  income: number;
  expense: number;
  entries: number;
  users: number;
}

/** 各活动在窗口内的合计，按元数据固定顺序返回；没有流水的活动也保留 0 行。 */
export function foldActivityTotals(rows: ActivityTotalRawRow[]): ActivityLedgerActivityTotal[] {
  const byKey = new Map<ActivityLedgerKey, ActivityLedgerActivityTotal>();
  for (const row of rows) {
    const key = (ORDER.has(row.activityKey as ActivityLedgerKey)
      ? row.activityKey
      : "other") as ActivityLedgerKey;
    if (!ledgerHasMovement(row)) continue;
    const current = byKey.get(key) ?? {
      key,
      label: LABEL_BY_KEY.get(key) ?? ACTIVITY_LEDGER_OTHER_LABEL,
      income: 0,
      expense: 0,
      entries: 0,
      users: 0,
    };
    current.income += row.income;
    current.expense += row.expense;
    current.entries += row.entries;
    current.users += row.users;
    byKey.set(key, current);
  }
  return [...byKey.values()].sort(
    (a, b) => (ORDER.get(a.key) ?? 99) - (ORDER.get(b.key) ?? 99),
  );
}

export async function listActivityLedgerActivityTotals(
  range: ActivityLedgerRange,
): Promise<ActivityLedgerActivityTotal[]> {
  const win = activityLedgerWindow(range);
  const rangeFilter = win ? " AND createdAt >= ? AND createdAt < ?" : "";
  const params = win ? [win.start.getTime(), win.end.getTime()] : [];
  const rows = await d1All<Record<string, unknown>>(
    `SELECT ${ATTRIBUTION_CASE} AS activityKey,
            SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) AS income,
            SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS expense,
            COUNT(*) AS entries,
            COUNT(DISTINCT userId) AS users
     FROM topup
     WHERE type IN (${TYPES.join(", ")}) AND amount <> 0${rangeFilter}
     GROUP BY activityKey`,
    params,
  );
  return foldActivityTotals(
    rows.map((row) => ({
      activityKey: String(row.activityKey ?? "other"),
      income: num(row.income),
      expense: num(row.expense),
      entries: num(row.entries),
      users: num(row.users),
    })),
  );
}

export interface ActivityLedgerUserCell {
  key: ActivityLedgerKey;
  label: string;
  income: number;
  expense: number;
}

export interface ActivityLedgerUserRow {
  userId: string;
  /** 显示名；没有昵称时退回邮箱或 userId 前缀。 */
  label: string;
  income: number;
  expense: number;
  entries: number;
  cells: ActivityLedgerUserCell[];
}

interface ActivityUserRawRow {
  userId: string | null;
  name: string | null;
  email: string | null;
  activityKey: string;
  income: number;
  expense: number;
  entries: number;
}

/** 用户 × 活动的流水折叠成「一人一行」，附带他在各活动上的出入。 */
export function foldActivityUsers(rows: ActivityUserRawRow[]): ActivityLedgerUserRow[] {
  const users = new Map<string, ActivityLedgerUserRow>();
  for (const row of rows) {
    if (!row.userId) continue;
    if (!ledgerHasMovement(row)) continue;
    const key = (ORDER.has(row.activityKey as ActivityLedgerKey)
      ? row.activityKey
      : "other") as ActivityLedgerKey;
    const label =
      (row.name && row.name.trim()) ||
      (row.email && row.email.trim()) ||
      `${row.userId.slice(0, 8)}…`;
    const entry = users.get(row.userId) ?? {
      userId: row.userId,
      label,
      income: 0,
      expense: 0,
      entries: 0,
      cells: [],
    };
    let cell = entry.cells.find((item) => item.key === key);
    if (!cell) {
      cell = {
        key,
        label: LABEL_BY_KEY.get(key) ?? ACTIVITY_LEDGER_OTHER_LABEL,
        income: 0,
        expense: 0,
      };
      entry.cells.push(cell);
    }
    cell.income += row.income;
    cell.expense += row.expense;
    entry.income += row.income;
    entry.expense += row.expense;
    entry.entries += row.entries;
    users.set(row.userId, entry);
  }
  return [...users.values()]
    .map((user) => ({
      ...user,
      cells: user.cells.sort((a, b) => (ORDER.get(a.key) ?? 99) - (ORDER.get(b.key) ?? 99)),
    }))
    .sort((a, b) => b.income + b.expense - (a.income + a.expense) || b.entries - a.entries);
}

/**
 * 窗口内每个用户的站点收支。一次查询拿到「用户 × 活动」，折叠在 JS 里做，
 * 避免再为每个人单独查一次（D1 往返比内存折叠贵得多）。
 */
export async function listActivityLedgerUsers(
  range: ActivityLedgerRange,
): Promise<ActivityLedgerUserRow[]> {
  const win = activityLedgerWindow(range);
  const rangeFilter = win ? " AND t.createdAt >= ? AND t.createdAt < ?" : "";
  const params = win ? [win.start.getTime(), win.end.getTime()] : [];
  const rows = await d1All<Record<string, unknown>>(
    `SELECT t.userId AS userId, u.name AS name, u.email AS email,
            ${attributionCase("t")} AS activityKey,
            SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END) AS income,
            SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) AS expense,
            COUNT(*) AS entries
     FROM topup t
     LEFT JOIN user u ON u.id = t.userId
     WHERE t.type IN (${TYPES.join(", ")}) AND t.amount <> 0${rangeFilter}
     GROUP BY t.userId, activityKey`,
    params,
  );
  return foldActivityUsers(
    rows.map((row) => ({
      userId: row.userId ? String(row.userId) : null,
      name: row.name ? String(row.name) : null,
      email: row.email ? String(row.email) : null,
      activityKey: String(row.activityKey ?? "other"),
      income: num(row.income),
      expense: num(row.expense),
      entries: num(row.entries),
    })),
  );
}
