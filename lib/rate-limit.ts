/**
 * 限流。2026-10-17 拆成两套，因为它们的代价完全不同：
 *
 * - `checkRateLimit`（D1 计数，跨实例真正生效）：给**花钱的动作**用——买券、开奖、下支付单。
 *   这些本来就要打 D1 写库，多一条 UPSERT 的延迟可以接受，换来的是「连点/并发/多实例都挡得住」。
 * - `checkInProcessRateLimit`（进程内 Map）：只给 `/v1/*` 推理网关用。那里加一次 D1 写就是给
 *   每次首 token 之前多塞 100~200ms，不值。所以它仍然是**每实例一份**的宽松护栏，
 *   真按用户限流靠的是额度与计费，不是这里——别再把它当全局限流看。
 */

import { d1Run } from "@/lib/db/d1-http";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

export interface RateLimitOptions {
  /** 时间窗口（毫秒） */
  window: number;
  /** 窗口内最大请求数 */
  limit: number;
}

/**
 * 进程内限流（每实例一份，Vercel 多实例之间不共享）。
 * @returns true 表示允许请求，false 表示超出限制
 */
export function checkInProcessRateLimit(
  key: string,
  options: RateLimitOptions = { window: 60_000, limit: 60 },
): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    // 新窗口
    store.set(key, { count: 1, resetAt: now + options.window });
    return true;
  }

  if (entry.count >= options.limit) {
    return false; // 超出限制
  }

  entry.count++;
  return true;
}

/**
 * 定期清理过期条目（避免内存泄漏）。`unref()` 让这个定时器不阻止进程退出——
 * 一次性脚本里 `import` 到本模块时，没有它 node 会一直挂着不结束。
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}, 60_000).unref?.();

/**
 * 站内 playground（`/api/ai/*`，含 `/chat`）的护栏。和 `/v1` 一样用进程内计数：
 * 这些端点每次调用都要先读余额、打上游，再塞一次 D1 写不值。
 * 超限直接给 429，未超限返回 null，调用方 `if (limited) return limited;`。
 */
export function playgroundRateLimitResponse(userId: string, task: string): Response | null {
  const allowed = checkInProcessRateLimit(`playground:${task}:${userId}`, {
    window: 60_000,
    limit: 30,
  });
  return allowed ? null : Response.json({ error: "请求过于频繁，请 1 分钟后再试" }, { status: 429 });
}

/**
 * 跨实例的固定窗口限流：一条 UPSERT 完成「开窗 / 计数 / 判上限」。
 *
 * 语义拆开看：
 * - 窗口起点按 `window` 对齐算出来，所以 `windowStart` 不同就等于跨进了新窗口 → 计数重置为 1，直接放行。
 * - 同一窗口内 `count < limitValue` 才更新；更新不动（`changes === 0`）就说明已经到上限 → 拒绝。
 * - `WHERE` 守住的更新不会写脏计数：达到上限后连 `count` 都不再涨，避免解除后立刻被旧计数挡住。
 *
 * D1 经 REST 没有事务，但单条 UPSERT 自身是原子的，所以并发下最坏也只是同一窗口多放行一两个请求。
 * 过期桶靠 1/50 概率顺手删一次，不做定时任务（站点没有常驻进程）。
 */
export async function checkRateLimit(
  key: string,
  options: RateLimitOptions = { window: 60_000, limit: 60 },
): Promise<boolean> {
  const now = Date.now();
  const windowStart = Math.floor(now / options.window) * options.window;
  // 宽限一个窗口再回收，免得正在计数的桶被删掉后又从 0 开始。
  const expiresAt = windowStart + options.window * 2;

  const upsert = await d1Run(
    `INSERT INTO rate_limit_bucket (bucketKey, windowStart, count, limitValue, expiresAt)
     VALUES (?, ?, 1, ?, ?)
     ON CONFLICT(bucketKey) DO UPDATE SET
       windowStart = excluded.windowStart,
       limitValue  = excluded.limitValue,
       expiresAt   = excluded.expiresAt,
       count       = CASE
         WHEN rate_limit_bucket.windowStart != excluded.windowStart THEN 1
         ELSE rate_limit_bucket.count + 1
       END
     WHERE rate_limit_bucket.windowStart != excluded.windowStart
        OR rate_limit_bucket.count < rate_limit_bucket.limitValue`,
    [key, windowStart, options.limit, expiresAt],
  );

  if (Math.random() < 0.02) {
    // 顺手清理：失败不影响放行判断，吞掉即可。
    await d1Run(`DELETE FROM rate_limit_bucket WHERE expiresAt < ?`, [now]).catch(() => ({
      changes: 0,
    }));
  }

  return upsert.changes > 0;
}
