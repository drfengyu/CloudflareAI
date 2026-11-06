"use server";

import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/d1-http";
import { users } from "@/lib/db/schema";
import { requireUser } from "@/lib/usage/meter";
import {
  DRAW_RECORD_PAGE_SIZE,
  listDrawRecords,
  lotteryBalance,
  lotteryTicketTotals,
  lotteryUserRecords,
  rangeWindow,
  type DrawRecord,
  type LotteryBalance,
  type LotteryTicketTotals,
  type LotteryUserRecord,
} from "@/lib/lottery/records";

export type AdminDrawRow = DrawRecord & { email: string | null };

export interface AdminActivityReport {
  balance: LotteryBalance;
  ticketTotals: LotteryTicketTotals;
  perUser: LotteryUserRecord[];
  detail: { rows: AdminDrawRow[]; totalRecords: number; totalPages: number };
}

async function assertAdmin(): Promise<void> {
  const currentUserId = await requireUser();
  const currentUser = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, currentUserId))
    .limit(1);
  if (!currentUser[0] || currentUser[0].role < 10) {
    throw new Error("权限不足");
  }
}

/**
 * 整份时间窗报告：概览数字、按用户汇总、逐次明细第一页。
 * 切「今日 / 近 7 日 / 近 30 日 / 全部」时一次换全套，避免概览跟明细用两个窗口各说各话。
 */
export async function loadActivityReport(range: string): Promise<AdminActivityReport> {
  await assertAdmin();
  const win = rangeWindow(range);

  const [balance, perUser, ticketTotals, records] = await Promise.all([
    lotteryBalance({ win }),
    lotteryUserRecords(win),
    lotteryTicketTotals(win),
    listDrawRecords({ win, limit: DRAW_RECORD_PAGE_SIZE }),
  ]);

  // 明细里出现的用户必然在 perUser 里（同一窗口、同样有开奖），不用再查一次 user 表。
  const emailById = new Map(perUser.map((u) => [u.userId, u.email]));
  return {
    balance,
    ticketTotals,
    perUser,
    detail: {
      rows: records.map((record) => ({
        ...record,
        email: emailById.get(record.userId) ?? null,
      })),
      totalRecords: balance.draws,
      totalPages: Math.max(1, Math.ceil(balance.draws / DRAW_RECORD_PAGE_SIZE)),
    },
  };
}

/**
 * 「逐次明细」卡片的局部翻页数据：窗口口径与首屏一致，
 * 邮箱只查这一页涉及的用户 id（一页最多 10 个，远低于 D1 的 100 绑定上限）。
 */
export async function listAdminDrawRecords(
  page: number,
  range: string,
): Promise<{ rows: AdminDrawRow[]; totalRecords: number; totalPages: number }> {
  await assertAdmin();
  const win = rangeWindow(range);
  const safePage = Math.max(1, Math.trunc(Number(page)) || 1);

  const [records, balance] = await Promise.all([
    listDrawRecords({
      win,
      limit: DRAW_RECORD_PAGE_SIZE,
      offset: (safePage - 1) * DRAW_RECORD_PAGE_SIZE,
    }),
    lotteryBalance({ win }),
  ]);

  const ids = [...new Set(records.map((record) => record.userId))];
  const owners = ids.length
    ? await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(inArray(users.id, ids))
    : [];
  const emailById = new Map(owners.map((owner) => [owner.id, owner.email]));

  return {
    rows: records.map((record) => ({
      ...record,
      email: emailById.get(record.userId) ?? null,
    })),
    totalRecords: balance.draws,
    totalPages: Math.max(1, Math.ceil(balance.draws / DRAW_RECORD_PAGE_SIZE)),
  };
}
