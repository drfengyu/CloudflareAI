/**
 * 简单的内存限流器（适用于单进程环境如 Vercel Serverless）。
 * 生产环境建议使用 Upstash Rate Limit 或 Cloudflare Workers rate limiting。
 */

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
 * 检查并更新限流计数。
 * @returns true 表示允许请求，false 表示超出限制
 */
export function checkRateLimit(
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

/** 定期清理过期条目（可选，避免内存泄漏） */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}, 60_000);
