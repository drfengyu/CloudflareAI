import { drizzle } from "drizzle-orm/sqlite-proxy";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Runtime D1 access from Vercel.
 *
 * Cloudflare's D1 REST `/query` endpoint runs SQL and returns rows as objects.
 * Drizzle's sqlite-proxy driver expects rows as positional arrays in SELECT
 * order — D1 preserves column order, so `Object.values(row)` is the correct
 * mapping. Migrations use a separate path (drizzle-kit d1-http); this is only
 * for queries at request time.
 */

interface D1Result {
  results?: Record<string, unknown>[];
  success: boolean;
  meta?: { changes?: number; last_row_id?: number };
}

async function d1Request(sql: string, params: unknown[]): Promise<D1Result | undefined> {
  const res = await fetch(
    `${env.cloudflare.apiBase}/accounts/${env.cloudflare.accountId}/d1/database/${env.cloudflare.d1DatabaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.cloudflare.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    },
  );
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    const msg =
      body?.errors?.map((e: { message: string }) => e.message).join("; ") ||
      `D1 query failed (${res.status})`;
    throw new Error(msg);
  }
  return (body.result as D1Result[])?.[0];
}

async function d1Query(
  sql: string,
  params: unknown[],
): Promise<Record<string, unknown>[]> {
  return (await d1Request(sql, params))?.results ?? [];
}

/**
 * 执行一条写语句并返回受影响行数。
 *
 * 条件更新（`UPDATE ... WHERE balance >= ?`）靠 drizzle 拿不到结果——sqlite-proxy 的
 * 回调只回传 rows，UPDATE 的 rows 恒为空。要判断有没有真正命中，只能直接读 D1 的
 * `meta.changes`，原子扣费/券锁定依赖它。
 */
export async function d1Run(
  sql: string,
  params: unknown[] = [],
): Promise<{ changes: number }> {
  const first = await d1Request(sql, params);
  return { changes: first?.meta?.changes ?? 0 };
}

export const db = drizzle(
  async (sql, params, method) => {
    const rows = await d1Query(sql, params);
    const asArrays = rows.map((r) => Object.values(r));
    return { rows: method === "get" ? (asArrays[0] ?? []) : asArrays };
  },
  { schema },
);
