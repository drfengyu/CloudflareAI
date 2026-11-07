"use server";

import { requireUser } from "@/lib/usage/meter";
import { getActualBalance } from "@/lib/billing/display-balance";
import {
  LEDGER_FILTERS,
  LEDGER_PAGE_SIZE,
  cnDayRange,
  ledgerGap,
  listLedgerDayByType,
  listLedgerDays,
  sumLedgerDays,
  type LedgerCategory,
  type LedgerDayRow,
  type LedgerFilter,
  type LedgerTotals,
  type LedgerTypeRow,
} from "@/lib/billing/ledger";

export interface LedgerOverview {
  days: LedgerDayRow[];
  hasNext: boolean;
  /** 当前筛选下的全量累计；过期作废已由 cron 逐笔记入 `topup type=14`。 */
  totals: LedgerTotals;
  balance: number;
  /**
   * 账目合计与余额的差额（正数 = 余额更高）。过期作废从 v0.29.3 起有真实流水，
   * 这里只剩历史遗留；只在「全部」类别下有值，筛选态合计天然不等于余额。
   */
  gap: number | null;
}

export interface LedgerDayDetail {
  date: string;
  rows: LedgerTypeRow[];
  totals: LedgerTotals;
}

const FILTER_IDS = new Set<string>(LEDGER_FILTERS.map((item) => item.id));

/** 筛选参数来自客户端，只认已知类别；其余一律退回「全部」。 */
function safeFilter(filter: unknown): LedgerFilter {
  return FILTER_IDS.has(String(filter)) ? (String(filter) as LedgerFilter) : "all";
}

const CATEGORY_ORDER: LedgerCategory[] = ["recharge", "reward", "activity", "expire", "usage"];

/** 类型小计按「充值 → 赠送与返利 → 活动 → 过期作废 → API 消费」排，同类按 type 升序。 */
function sortTypeRows(rows: LedgerTypeRow[]): LedgerTypeRow[] {
  return [...rows].sort((a, b) => {
    const byCategory = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    return byCategory !== 0 ? byCategory : a.typeCode - b.typeCode;
  });
}

/**
 * 天表一页 + 全量合计 + 与余额的差额。
 *
 * 一次把该用户所有「有账的日子」取回来（一天一行，量级是活跃天数），翻页在内存里切：
 * 累计与差额本来就是全量口径，按页取数反而要每页再扫一次全表。
 */
export async function loadLedger(page: number, filter: unknown): Promise<LedgerOverview> {
  const userId = await requireUser();
  const category = safeFilter(filter);
  const [days, balance] = await Promise.all([
    listLedgerDays(userId, category),
    getActualBalance(userId),
  ]);

  const sorted = [...days].sort((a, b) => b.date.localeCompare(a.date));
  const safePage = Math.max(1, Math.trunc(Number(page)) || 1);
  const start = (safePage - 1) * LEDGER_PAGE_SIZE;
  const totals = sumLedgerDays(sorted);
  const gap = category === "all" ? ledgerGap(balance, totals) : null;

  return {
    days: sorted.slice(start, start + LEDGER_PAGE_SIZE),
    hasNext: start + LEDGER_PAGE_SIZE < sorted.length,
    totals,
    balance,
    gap: gap !== null && Math.abs(gap) >= 0.01 ? gap : null,
  };
}

/** 某一天的分类型小计（不含细项：账本只解释「这天每类进出多少」）。 */
export async function loadLedgerDay(date: string, filter: unknown): Promise<LedgerDayDetail> {
  const userId = await requireUser();
  const range = cnDayRange(date);
  if (!range) throw new Error("日期无效");

  const rows = await listLedgerDayByType(userId, range, safeFilter(filter));
  return { date, rows: sortTypeRows(rows), totals: sumLedgerDays(rows) };
}
