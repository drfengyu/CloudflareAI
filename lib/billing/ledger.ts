/**
 * 个人账本：把「余额为什么是这个数」拆成按天、按类型的收支。
 *
 * 两个来源：
 * - `topup`：所有发放与活动收支（正负都有），账本主体。
 * - `usage_log.creditsUsed`：API 消费。它只记在用量表里、不进 `topup`，漏掉它就解释不了
 *   余额为什么往下掉。按「当天每个模型」聚合成一笔，重度调用用户一天几百次也不会撑爆小计。
 *
 * **临时余额过期从 v0.29.3 起逐笔记账**：`vercel.json` 每天 02:00 UTC 跑
 * `/api/cron/cleanup-expired-balances`，在删掉 `expiresAt <= now` 的临时余额行之前，
 * 按每一行补一笔负数 `topup`（`type=14` 过期作废，`createdAt` 用原到期时间），
 * 账本天表才能在到期那天看到这笔支出。历史过期行已被旧版 cron 删掉，2026-11-07
 * 按可证记录一次性补记（id 前缀 `expire:backfill:`，只补流水、不动余额），
 * 之后的新过期继续由 cron 逐笔记账。
 *
 * 两张表 UNION ALL 后在 SQL 里分组，排序一律回到 JS：本仓库已实测 D1 对 `ORDER BY`
 * 聚合别名解析失败。投影列多、又要求按列别名取数，所以走 `d1All` 而不是 sqlite-proxy
 * 的位置数组。
 */

import { d1All } from "@/lib/db/d1-http";

export const LEDGER_PAGE_SIZE = 10;

const DAY_MS = 86_400_000;

export type LedgerCategory = "recharge" | "reward" | "activity" | "usage" | "expire";
export type LedgerFilter = "all" | LedgerCategory;

export const LEDGER_FILTERS: { id: LedgerFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "recharge", label: "充值" },
  { id: "reward", label: "赠送与返利" },
  { id: "activity", label: "活动" },
  { id: "expire", label: "过期作废" },
  { id: "usage", label: "API 消费" },
];

/** 过期作废流水的 `topup.type`：cron 删临时余额前按行补记，金额为负。 */
export const TOPUP_TYPE_EXPIRE = 14;

/** `topup.type` 的界面名，与 `lib/db/schema.ts` 的注释同一份口径。 */
export const TOPUP_TYPE_LABEL: Record<number, string> = {
  1: "兑换码",
  2: "管理员调整",
  3: "签到奖励",
  4: "注册奖励",
  5: "在线充值",
  6: "幸运转盘",
  7: "邀请返利",
  8: "消费返利",
  9: "任务成就",
  10: "充值赠送",
  11: "雷电行动",
  12: "翻牌夺宝",
  13: "站内信奖励",
  14: "过期作废",
};

const DAY_OF = (column: string) => `strftime('%Y-%m-%d', ${column} / 1000, 'unixepoch', '+8 hours')`;

/**
 * 每个类别包含哪些 `topup.type`。活动（6/11/12）正负都有，所以既可能出现在收入也可能出现在支出。
 * 过期作废（14）由清理 cron 写入，只有负数。
 *
 * 新增发放类型时必须同时登记进 `TOPUP_TYPE_LABEL` 和这里，`tests/ledger.test.ts` 会检查
 * 类型是否恰好各归一类——漏了不会报错，只会静默算进「活动」。
 */
export const LEDGER_CATEGORY_TYPES: Record<Exclude<LedgerCategory, "usage">, number[]> = {
  recharge: [1, 2, 5, 13],
  reward: [3, 4, 7, 8, 9, 10],
  activity: [6, 11, 12],
  expire: [TOPUP_TYPE_EXPIRE],
};

const TOPUP_CATEGORY = `CASE WHEN type IN (${LEDGER_CATEGORY_TYPES.recharge.join(", ")}) THEN 'recharge'
                             WHEN type IN (${LEDGER_CATEGORY_TYPES.reward.join(", ")}) THEN 'reward'
                             WHEN type IN (${LEDGER_CATEGORY_TYPES.expire.join(", ")}) THEN 'expire'
                             ELSE 'activity' END`;

const TOPUP_INCOME = `CASE WHEN amount > 0 THEN amount ELSE 0 END`;
const TOPUP_EXPENSE = `CASE WHEN amount < 0 THEN -amount ELSE 0 END`;

export interface LedgerDayRow {
  /** 北京墙钟 `YYYY-MM-DD`。 */
  date: string;
  /** 未取整的原值：取整只在展示层做一次，逐日取整再相加会让「累计」与余额差出一分尾数。 */
  income: number;
  expense: number;
  /** 真实笔数：API 消费按调用次数计，不是按聚合后的模型条数计。 */
  entries: number;
}

/** 某一天的一个类型（`topup.type` / API 消费）的收支小计。 */
export interface LedgerTypeRow {
  category: LedgerCategory;
  typeCode: number;
  entries: number;
  income: number;
  expense: number;
}

export interface LedgerTotals {
  income: number;
  expense: number;
}

/** 钱包页「最近收支」用的一条变动：发放/活动逐笔，API 消费是当天该模型的累计。 */
export interface LedgerRecentEntry {
  ts: number;
  category: LedgerCategory;
  typeCode: number;
  detail: string | null;
  income: number;
  expense: number;
  calls: number;
}

type DayRange = { from: number; to: number };

/** 钱包「最近收支」只看这段窗口，与旧「充值记录」卡同一量级，避免每次开钱包都全表扫。 */
const RECENT_WINDOW_DAYS = 90;

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const text = (value: unknown): string | null =>
  typeof value === "string" && value ? value : null;

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * 两表 UNION 的公共主体。`range` 为空 = 不限时间（天表）；给了 range = 只看这段窗口。
 *
 * `amount <> 0` 直接写进 SQL：管理员填 0 的调整、金额为 0 的发放既不加钱也不扣钱，留在
 * 结果里只会占掉「最近 N 条」的名额、并把笔数算多，而不是留到 JS 里筛。
 *
 * 占位符顺序必须和两个分支的 WHERE 严格对齐：topup → usage_log。数量错了 D1 直接报
 * `Wrong number of parameter bindings`。导出只为让回归测试能数一遍占位符与参数
 * （`tests/ledger.test.ts`），业务调用方一律走下面的查询函数。
 */
export function ledgerUnion(userId: string, range: DayRange | null): { sql: string; params: unknown[] } {
  const dayFilter = range ? " AND createdAt >= ? AND createdAt < ?" : "";
  const bounds: unknown[] = range ? [range.from, range.to] : [];

  return {
    sql: `
      SELECT createdAt AS ts, ${TOPUP_CATEGORY} AS category, type AS typeCode,
             description AS detail, ${TOPUP_INCOME} AS income, ${TOPUP_EXPENSE} AS expense,
             1 AS calls
      FROM topup WHERE userId = ? AND amount <> 0${dayFilter}
      UNION ALL
      SELECT MAX(createdAt) AS ts, 'usage' AS category, 0 AS typeCode, model AS detail,
             0 AS income, SUM(creditsUsed) AS expense, COUNT(*) AS calls
      FROM usage_log WHERE userId = ? AND creditsUsed > 0${dayFilter}
      GROUP BY model, ${DAY_OF("createdAt")}`,
    params: [userId, ...bounds, userId, ...bounds],
  };
}

/** 最近窗口的毫秒区间：`[now - days, now]`，给「最近收支」这类只看眼前的查询用。 */
export function recentWindow(now = Date.now(), days = RECENT_WINDOW_DAYS): DayRange {
  return { from: now - days * DAY_MS, to: now };
}

/** 北京日界：`YYYY-MM-DD` → 当天 [00:00, 24:00) 的毫秒区间；非法日期与还没开始的日子返回 null。 */
export function cnDayRange(date: string, now = Date.now()): DayRange | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const from = Date.parse(`${date}T00:00:00+08:00`);
  if (!Number.isFinite(from)) return null;
  if (from > now) return null;
  return { from, to: from + DAY_MS };
}

/**
 * 有没有真实进出。SQL 已经挡掉 `amount = 0`，这里只剩「不足半分的四舍五入」这一种情况：
 * 金额为 0.004 cr 的行既不加钱也不扣钱，留在天表里只会让人以为「这天有账但对不上」。
 * 判定用未取整的原值，天表和当天分类小计才不会一个显示、一个不显示。
 */
export function ledgerHasMovement(row: { income: number; expense: number }): boolean {
  return Math.abs(row.income) >= 0.005 || Math.abs(row.expense) >= 0.005;
}

/**
 * 天表按北京日界分组，一天一行；`filter` 只统计某一类。
 * 返回全部有收支的日子（一天一行，量级是活跃天数），排序与分页在调用方 JS 里做。
 *
 * 分组行里 `date` 为空 = `createdAt` 缺失（历史脏行），无法归到任何一天，只能落在页面上的
 * 「差额」里，不在表格里凭空造一个 1970-01-01。
 */
export async function listLedgerDays(
  userId: string,
  filter: LedgerFilter = "all",
): Promise<LedgerDayRow[]> {
  const { sql, params } = ledgerUnion(userId, null);
  const categoryFilter = filter === "all" ? "" : " WHERE category = ?";
  const rows = await d1All<Record<string, unknown>>(
    `SELECT ${DAY_OF("ts")} AS date, SUM(income) AS income, SUM(expense) AS expense, SUM(calls) AS entries
     FROM (${sql})${categoryFilter} GROUP BY date`,
    categoryFilter ? [...params, filter] : params,
  );
  return rows
    .filter((row) => typeof row.date === "string")
    .map((row) => ({
      date: row.date as string,
      income: num(row.income),
      expense: num(row.expense),
      entries: num(row.entries),
    }))
    // 先按原值判有没有进出；取整留给展示层，天表与当天小计才不会一个显示、一个不显示。
    .filter(ledgerHasMovement);
}

/** 某一天的分类型小计；`filter` 非 all 时只留那一类。 */
export async function listLedgerDayByType(
  userId: string,
  range: DayRange,
  filter: LedgerFilter = "all",
): Promise<LedgerTypeRow[]> {
  const { sql, params } = ledgerUnion(userId, range);
  const categoryFilter = filter === "all" ? "" : " WHERE category = ?";
  const rows = await d1All<Record<string, unknown>>(
    `SELECT category, typeCode, SUM(calls) AS entries, SUM(income) AS income, SUM(expense) AS expense
     FROM (${sql})${categoryFilter} GROUP BY category, typeCode`,
    categoryFilter ? [...params, filter] : params,
  );
  return rows
    .map((row) => ({
      category: String(row.category) as LedgerCategory,
      typeCode: num(row.typeCode),
      entries: num(row.entries),
      income: num(row.income),
      expense: num(row.expense),
    }))
    .filter(ledgerHasMovement);
}

/**
 * 钱包页的最近收支：窗口内最近若干条变动，与账本同一份口径。
 * SQL 里已按 `amount <> 0` 过滤，`LIMIT` 就是实际条数。
 *
 * 过期作废不进这一列：钱包只回答「还能用的钱怎么进出的」，过期统一去账本看；
 * 结算条已经把过期从收入和支出两头都剔掉，列表里再出现会让人重复扣一次。
 */
export async function listRecentLedgerEntries(
  userId: string,
  limit: number,
  range: DayRange,
): Promise<LedgerRecentEntry[]> {
  const { sql, params } = ledgerUnion(userId, range);
  const rows = await d1All<Record<string, unknown>>(
    `SELECT ts, category, typeCode, detail, income, expense, calls
     FROM (${sql}) WHERE ts IS NOT NULL AND category <> 'expire' ORDER BY ts DESC LIMIT ?`,
    [...params, limit],
  );
  return rows.map((row) => ({
    ts: num(row.ts),
    category: String(row.category) as LedgerCategory,
    typeCode: num(row.typeCode),
    detail: text(row.detail),
    income: num(row.income),
    expense: num(row.expense),
    calls: num(row.calls),
  }));
}

/** 天表行与当天类型行都能直接汇总；汇总保持原值，取整只在展示层做一次。 */
export function sumLedgerDays(rows: Array<{ income: number; expense: number }>): LedgerTotals {
  return {
    income: rows.reduce((sum, row) => sum + row.income, 0),
    expense: rows.reduce((sum, row) => sum + row.expense, 0),
  };
}

/**
 * 账目合计与真实余额的差额。
 *
 * 差额非零是历史事实，不是 bug，来源有三类：
 * 1. **2026-11-07 前到期作废的临时余额**：旧版 cron 直接删行、没有流水。2026-11-07
 *    已按可证记录一次性补记（`expire:backfill:` 前缀），现存负差额只剩无法归因的早期数据。
 * 2. 早期版本的调用没计量 `creditsUsed`。
 * 3. 历史数据里管理员直接改过余额（2026-11-07 前下调不写 `topup`；之后正负都记 `type=2`）。
 * 所以账本页如实把差额单列说明，而不是假装合计等于余额。
 */
export function ledgerGap(actualBalance: number, totals: LedgerTotals): number {
  return round2(actualBalance - (totals.income - totals.expense));
}

export function ledgerNet(row: { income: number; expense: number }): number {
  return round2(row.income - row.expense);
}

export interface LedgerSettlement {
  /** 累计收入里剔除过期作废部分后的口径：只剩真正留下或被花掉的入账。 */
  effectiveIncome: number;
  /** 累计支出里同样剔除过期作废：钱包只展示「还能用的钱」怎么进出。 */
  expense: number;
  expired: number;
  balance: number;
  /** 原始账目合计与余额的差额（正数 = 余额更高），历史遗留时非零。 */
  gap: number;
  /** 有效入账 − 支出是否正好等于余额；有历史差额时为 false。 */
  reconciled: boolean;
}

/** 全量过期作废支出（正数）：钱包结算要把发放与作废两头一起剔掉。 */
export async function sumExpiredExpense(userId: string): Promise<number> {
  const rows = await d1All<Record<string, unknown>>(
    "SELECT SUM(-amount) AS expired FROM topup WHERE userId = ? AND type = ? AND amount < 0",
    [userId, TOPUP_TYPE_EXPIRE],
  );
  return Math.max(0, num(rows[0]?.expired));
}

/**
 * 钱包用的「当前结算」口径：把过期作废的发放与作废两头都从展示里剔除。
 *
 * 过期金额来自 `topup type=14` 的真实流水（v0.29.3 起 cron 逐笔补记），
 * 不再由余额差额反推；`有效入账 − 支出` 与余额的差只剩历史遗留，页面如实标出。
 */
export function ledgerSettlement(
  actualBalance: number,
  totals: LedgerTotals,
  expiredExpense: number,
): LedgerSettlement {
  // 先按原始值剔除：过期总额本身可能带半分以下尾数，先取整再减会让
  // 有效入账/支出各偏 0.01，钱包三笔数在 10 亿量级下看起来差一分。
  const expiredRaw = Math.max(0, expiredExpense);
  const effectiveIncomeRaw = totals.income - expiredRaw;
  const expenseRaw = totals.expense - expiredRaw;
  return {
    effectiveIncome: round2(effectiveIncomeRaw),
    expense: round2(expenseRaw),
    expired: round2(expiredRaw),
    balance: round2(actualBalance),
    gap: ledgerGap(actualBalance, totals),
    reconciled: Math.abs(round2(effectiveIncomeRaw - expenseRaw) - actualBalance) < 0.01,
  };
}

/**
 * 账本顶部四格的展示口径。
 *
 * D1 的 REAL 合计常带半分尾数（例如支出 1,005,290,895.1157），收入、支出、净收支、余额
 * 各自四舍五入后可能差 1 分。原始差额已不足一分时，支出改由「收入 − 余额」倒推，
 * 四格在按分展示后仍能加减闭合；只影响展示，天表与判差额都用原值。
 */
export function ledgerDisplayTotals(totals: LedgerTotals, balance: number): LedgerTotals {
  const income = round2(totals.income);
  return { income, expense: round2(income - balance) };
}

/** 类型行的界面名：发放/活动按 `topup.type` 取名，API 消费按类别取名。 */
export function ledgerTypeLabel(row: { category: LedgerCategory; typeCode: number }): string {
  if (row.category === "usage") return "API 消费";
  return TOPUP_TYPE_LABEL[row.typeCode] ?? "其他";
}

/** 钱包「最近收支」一行显示成 `+100 cr` / `-1,250 cr`。 */
export function ledgerEntryLabel(entry: LedgerRecentEntry): string {
  if (entry.category === "usage") {
    return `API 消费${entry.detail ? ` · ${entry.detail}` : ""}${entry.calls > 1 ? ` × ${entry.calls}` : ""}`;
  }
  return TOPUP_TYPE_LABEL[entry.typeCode] ?? "其他";
}
