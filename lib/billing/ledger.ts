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

export const LEDGER_CATEGORY_LABEL: Record<LedgerCategory, string> = {
  recharge: "充值",
  reward: "赠送与返利",
  activity: "活动",
  usage: "API 消费",
  expire: "过期作废",
};

export const LEDGER_FILTERS: { id: LedgerFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "recharge", label: LEDGER_CATEGORY_LABEL.recharge },
  { id: "reward", label: LEDGER_CATEGORY_LABEL.reward },
  { id: "activity", label: LEDGER_CATEGORY_LABEL.activity },
  { id: "expire", label: LEDGER_CATEGORY_LABEL.expire },
  { id: "usage", label: LEDGER_CATEGORY_LABEL.usage },
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
  15: "活动券兑换",
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
  activity: [6, 11, 12, 15],
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

/** 某一天的一个类型（`topup.type` / API 消费）的收支小计；同类型再按来源细分。 */
export interface LedgerTypeRow {
  category: LedgerCategory;
  typeCode: number;
  /** 细分键（过期来源 / 充值渠道），用于 React key 与排序，不直接展示。 */
  subtype: string;
  /** 直接展示的名称，例如「支付宝模拟」「兑换码到期」。 */
  label: string;
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
  /** 细分键与展示名；缺省时回退到类型名。 */
  subtype?: string;
  label?: string;
}

/** 最近收支按天展开时的一类小计。 */
export interface LedgerRecentCategoryRow {
  category: LedgerCategory;
  /** 细分键：充值渠道 / 过期来源 / 流水类型，用于 React key。 */
  subtype: string;
  label: string;
  entries: number;
  income: number;
  expense: number;
}

/** 最近收支的一天：折叠时看日小计，展开看各类明细。 */
export interface LedgerRecentDay {
  date: string;
  entries: number;
  income: number;
  expense: number;
  rows: LedgerRecentCategoryRow[];
}

type DayRange = { from: number; to: number };

/** 钱包「最近收支」的窗口：含今天在内的 5 个北京日历日，不限条数。 */
const RECENT_WINDOW_DAYS = 5;

const CN_OFFSET_MS = 8 * 60 * 60 * 1000;

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

/** 时间戳所属的北京日期。 */
export function cnDateOf(ts: number): string {
  return new Date(ts + CN_OFFSET_MS).toISOString().slice(0, 10);
}

/** 含今天在内 `days` 个北京日历日的窗口：`[第 1 天 00:00, now]`。 */
export function recentDayWindow(now = Date.now(), days = RECENT_WINDOW_DAYS): DayRange {
  const todayStart = Math.floor((now + CN_OFFSET_MS) / DAY_MS) * DAY_MS - CN_OFFSET_MS;
  return { from: todayStart - (days - 1) * DAY_MS, to: now };
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

interface LedgerCategoryDayRow {
  date: string;
  category: LedgerCategory;
  income: number;
  expense: number;
  entries: number;
}

/**
 * 天表的第一层：按「北京日 + 类别」汇总。
 *
 * 钱包要的过期作废合计与账本要的日表都从这一份结果折出来——同一段历史只扫一遍，
 * 不再让日表查询和单独的过期合计各扫一次全量流水。
 */
async function listLedgerCategoryDays(
  userId: string,
  filter: LedgerFilter,
): Promise<LedgerCategoryDayRow[]> {
  const { sql, params } = ledgerUnion(userId, null);
  const categoryFilter = filter === "all" ? "" : " WHERE category = ?";
  const rows = await d1All<Record<string, unknown>>(
    `SELECT ${DAY_OF("ts")} AS date, category, SUM(income) AS income, SUM(expense) AS expense, SUM(calls) AS entries
     FROM (${sql})${categoryFilter} GROUP BY date, category`,
    categoryFilter ? [...params, filter] : params,
  );
  return rows
    .filter((row) => typeof row.date === "string")
    .map((row) => ({
      date: row.date as string,
      category: String(row.category) as LedgerCategory,
      income: num(row.income),
      expense: num(row.expense),
      entries: num(row.entries),
    }));
}

/** 把「日 + 类别」折回一天一行；取整仍留给展示层，先按原值判断有没有真实进出。 */
function foldLedgerDays(rows: LedgerCategoryDayRow[]): LedgerDayRow[] {
  const days = new Map<string, LedgerDayRow>();
  for (const row of rows) {
    const day = days.get(row.date) ?? { date: row.date, income: 0, expense: 0, entries: 0 };
    day.income += row.income;
    day.expense += row.expense;
    day.entries += row.entries;
    days.set(row.date, day);
  }
  return [...days.values()].filter(ledgerHasMovement);
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
  return foldLedgerDays(await listLedgerCategoryDays(userId, filter));
}

export interface LedgerOverview {
  days: LedgerDayRow[];
  /** 全量过期作废支出（正数）：钱包结算要把发放与作废两头一起剔除。 */
  expired: number;
}

/**
 * 钱包结算要的两样东西一次取齐：天表（算累计收支）与过期作废合计。
 * 过期行已在同一份 UNION 里按类别分好组，不必再单独扫一遍 `topup`。
 */
export async function listLedgerOverview(userId: string): Promise<LedgerOverview> {
  const rows = await listLedgerCategoryDays(userId, "all");
  const expired = rows
    .filter((row) => row.category === "expire")
    .reduce((sum, row) => sum + row.expense, 0);
  return { days: foldLedgerDays(rows), expired: Math.max(0, expired) };
}

/** 充值渠道的展示名；`mock` 来自易支付回调的 `type=mock`（测试网关）。 */
const RECHARGE_CHANNEL_LABEL: Record<string, { pay: string; mock: string }> = {
  alipay: { pay: "支付宝支付", mock: "支付宝模拟" },
  wechat: { pay: "微信支付", mock: "微信模拟" },
  qqpay: { pay: "QQ 支付", mock: "QQ 模拟" },
  linuxdo: { pay: "LinuxDO 积分", mock: "LinuxDO 积分" },
};

/** 类型=5 的流水描述里只带订单号，渠道要去 `payment_order` 取。 */
const ORDER_NO_PATTERN = /订单\s+(TU[0-9A-Za-z]+)/;

interface OrderChannel {
  channel: string | null;
  simulated: boolean;
}

/** 过期流水描述里带着原临时余额的发放来源，按关键词还原。 */
const EXPIRE_SOURCE_LABEL: { pattern: RegExp; label: string }[] = [
  { pattern: /兑换码/, label: "兑换码到期" },
  { pattern: /幸运转盘|限时活动抽奖/, label: "转盘赠送到期" },
  { pattern: /翻牌夺宝/, label: "翻牌夺宝到期" },
  { pattern: /每日签到|签到奖励/, label: "签到赠送到期" },
  { pattern: /充值赠送/, label: "充值赠送到期" },
  { pattern: /邀请/, label: "邀请返利到期" },
  { pattern: /消费返利/, label: "消费返利到期" },
  { pattern: /任务/, label: "任务奖励到期" },
  { pattern: /雷电行动/, label: "雷电行动到期" },
  { pattern: /站内信/, label: "站内信奖励到期" },
];

const HISTORY_PREFIX = "历史补记";

/** 过期作废按「兑换码 / 转盘 / ...」细分；无法归因的历史行单独标补记。 */
export function ledgerExpireSubtype(detail: string | null): { subtype: string; label: string } {
  const description = detail ?? "";
  const matched = EXPIRE_SOURCE_LABEL.find((item) => item.pattern.test(description));
  if (matched) {
    const historical = description.startsWith(HISTORY_PREFIX);
    return {
      subtype: `${matched.label}-${historical ? "history" : "live"}`,
      label: historical ? `${matched.label}（补记）` : matched.label,
    };
  }
  if (description.startsWith(HISTORY_PREFIX)) {
    return { subtype: "history", label: "历史补记" };
  }
  return { subtype: "other", label: "其他临时余额到期" };
}

/** 充值按实际渠道细分；回调 `type=mock` 的单独标「模拟」。 */
export function ledgerRechargeSubtype(
  typeCode: number,
  detail: string | null,
  orders: Map<string, OrderChannel>,
): { subtype: string; label: string } {
  if (typeCode === 1) return { subtype: "type-1", label: "兑换码充值" };
  if (typeCode !== 5) {
    return { subtype: `type-${typeCode}`, label: TOPUP_TYPE_LABEL[typeCode] ?? "充值" };
  }
  const orderNo = detail?.match(ORDER_NO_PATTERN)?.[1];
  const order = orderNo ? orders.get(orderNo) : undefined;
  const channel = order?.channel ? RECHARGE_CHANNEL_LABEL[order.channel] : undefined;
  if (!order?.channel || !channel) {
    return { subtype: "online-unknown", label: "在线充值" };
  }
  return order.simulated
    ? { subtype: `${order.channel}-mock`, label: channel.mock }
    : { subtype: order.channel, label: channel.pay };
}

/**
 * 充值渠道只在 `payment_order` 里；按 50 个一批查，避开 D1 单条语句 100 个绑定上限。
 * 查不到的订单（历史脏行 / 已删订单）退回「在线充值」，不影响当天小计。
 */
async function loadOrderChannels(orderNos: string[]): Promise<Map<string, OrderChannel>> {
  const map = new Map<string, OrderChannel>();
  const unique = [...new Set(orderNos)];
  for (let start = 0; start < unique.length; start += 50) {
    const chunk = unique.slice(start, start + 50);
    const rows = await d1All<Record<string, unknown>>(
      `SELECT orderNo, channel, json_extract(notifyPayload, '$.type') AS notifyType
       FROM payment_order WHERE orderNo IN (${chunk.map(() => "?").join(", ")})`,
      chunk,
    );
    for (const row of rows) {
      const orderNo = text(row.orderNo);
      if (!orderNo) continue;
      map.set(orderNo, {
        channel: text(row.channel),
        simulated: text(row.notifyType) === "mock",
      });
    }
  }
  return map;
}

/**
 * 一行的细分口径：过期看发放来源、充值看渠道、其余按流水类型。
 * 账本天表明细与钱包「最近收支」共用，保证两边看到的细项名称一致。
 */
function resolveLedgerSubtype(
  category: LedgerCategory,
  typeCode: number,
  detail: string | null,
  orders: Map<string, OrderChannel>,
): { subtype: string; label: string } {
  if (category === "expire") return ledgerExpireSubtype(detail);
  if (category === "recharge") return ledgerRechargeSubtype(typeCode, detail, orders);
  return { subtype: `type-${typeCode}`, label: ledgerTypeLabel({ category, typeCode }) };
}

/**
 * 某一天的分类型小计；`filter` 非 all 时只留那一类。
 *
 * 过期作废与在线充值还要再细分来源：前者看流水描述里的发放出处，后者要回查
 * `payment_order.channel` 与回调里的 `type=mock`。细分只能在 JS 里做，所以这一天
 * 的原始行先取回来再按 `category + typeCode + subtype` 聚合；窗口只有一天，量可控。
 */
export async function listLedgerDayByType(
  userId: string,
  range: DayRange,
  filter: LedgerFilter = "all",
): Promise<LedgerTypeRow[]> {
  const { sql, params } = ledgerUnion(userId, range);
  const categoryFilter = filter === "all" ? "" : " WHERE category = ?";
  const rows = await d1All<Record<string, unknown>>(
    `SELECT category, typeCode, detail, income, expense, calls FROM (${sql})${categoryFilter}`,
    categoryFilter ? [...params, filter] : params,
  );

  const orderNos: string[] = [];
  for (const row of rows) {
    if (String(row.category) !== "recharge" || num(row.typeCode) !== 5) continue;
    const orderNo = text(row.detail)?.match(ORDER_NO_PATTERN)?.[1];
    if (orderNo) orderNos.push(orderNo);
  }
  const orders = orderNos.length > 0 ? await loadOrderChannels(orderNos) : new Map<string, OrderChannel>();

  const grouped = new Map<string, LedgerTypeRow>();
  for (const row of rows) {
    const category = String(row.category) as LedgerCategory;
    const typeCode = num(row.typeCode);
    const detail = text(row.detail);
    const subtype = resolveLedgerSubtype(category, typeCode, detail, orders);
    const key = `${category}|${typeCode}|${subtype.subtype}`;
    const current = grouped.get(key) ?? {
      category,
      typeCode,
      subtype: subtype.subtype,
      label: subtype.label,
      entries: 0,
      income: 0,
      expense: 0,
    };
    current.entries += num(row.calls);
    current.income += num(row.income);
    current.expense += num(row.expense);
    grouped.set(key, current);
  }

  return [...grouped.values()].filter(ledgerHasMovement);
}

const CATEGORY_ORDER: LedgerCategory[] = ["recharge", "reward", "activity", "usage", "expire"];

/**
 * 把最近变动按北京日期分组，可按 `limit` 截断；钱包页传 null 表示不限条数。
 *
 * 聚合只在 JS 里做：先截断再按类汇总，折叠行的日小计与展开后的
 * 分类小计永远相加闭合，不会出现「日合计包含被截掉的笔数」。
 */
export function groupRecentLedgerDays(
  entries: LedgerRecentEntry[],
  limit: number | null = null,
): LedgerRecentDay[] {
  const sorted = [...entries]
    .filter((entry) => Number.isFinite(entry.ts))
    .sort((a, b) => b.ts - a.ts);
  const limited = limit === null ? sorted : sorted.slice(0, limit);

  const days = new Map<string, LedgerRecentDay>();
  for (const entry of limited) {
    const date = cnDateOf(entry.ts);
    let day = days.get(date);
    if (!day) {
      day = { date, entries: 0, income: 0, expense: 0, rows: [] };
      days.set(date, day);
    }
    const subtype = entry.subtype ?? `type-${entry.typeCode}`;
    let row = day.rows.find(
      (item) => item.category === entry.category && item.subtype === subtype,
    );
    if (!row) {
      row = {
        category: entry.category,
        subtype,
        label:
          entry.label ??
          (entry.category === "usage"
            ? LEDGER_CATEGORY_LABEL.usage
            : (TOPUP_TYPE_LABEL[entry.typeCode] ?? LEDGER_CATEGORY_LABEL[entry.category])),
        entries: 0,
        income: 0,
        expense: 0,
      };
      day.rows.push(row);
    }
    row.entries += entry.calls;
    row.income += entry.income;
    row.expense += entry.expense;
  }

  return [...days.values()]
    .map((day) => {
      const rows = day.rows
        .filter(ledgerHasMovement)
        .sort((a, b) => {
          const byCategory = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
          if (byCategory !== 0) return byCategory;
          return a.label.localeCompare(b.label, "zh-CN");
        });
      const totals = sumLedgerDays(rows);
      return {
        date: day.date,
        entries: rows.reduce((sum, row) => sum + row.entries, 0),
        income: totals.income,
        expense: totals.expense,
        rows,
      };
    })
    .filter((day) => day.rows.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * 钱包页的最近收支：近 5 天全部逐笔，与账本同一份细分口径，按天分组。
 *
 * 过期作废不进这一列：钱包只回答「还能用的钱怎么进出的」，过期统一去账本看；
 * 结算条已经把过期从收入和支出两头都剔掉，列表里再出现会让人重复扣一次。
 */
export async function listRecentLedgerByDay(
  userId: string,
  now = Date.now(),
): Promise<LedgerRecentDay[]> {
  const { sql, params } = ledgerUnion(userId, recentDayWindow(now));
  const rows = await d1All<Record<string, unknown>>(
    `SELECT ts, category, typeCode, detail, income, expense, calls
     FROM (${sql}) WHERE ts IS NOT NULL AND category <> 'expire' ORDER BY ts DESC`,
    params,
  );

  const orderNos: string[] = [];
  for (const row of rows) {
    if (String(row.category) !== "recharge" || num(row.typeCode) !== 5) continue;
    const orderNo = text(row.detail)?.match(ORDER_NO_PATTERN)?.[1];
    if (orderNo) orderNos.push(orderNo);
  }
  const orders = orderNos.length > 0 ? await loadOrderChannels(orderNos) : new Map<string, OrderChannel>();

  const entries: LedgerRecentEntry[] = [];
  for (const row of rows) {
    const entry = {
      ts: num(row.ts),
      category: String(row.category) as LedgerCategory,
      typeCode: num(row.typeCode),
      detail: text(row.detail),
      income: num(row.income),
      expense: num(row.expense),
      calls: num(row.calls),
    };
    if (!ledgerHasMovement(entry)) continue;
    const subtype = resolveLedgerSubtype(entry.category, entry.typeCode, entry.detail, orders);
    entries.push({ ...entry, subtype: subtype.subtype, label: subtype.label });
  }
  return groupRecentLedgerDays(entries);
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
