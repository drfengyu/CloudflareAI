-- Migration: 每日免费抽的库层幂等 + 跨实例限流计数表
-- 2026-10-17
--
-- 1) lottery_draw.freeDrawDate：只有「今日免费抽」那一行写北京日期（如 2026-10-17），花钱抽的写 NULL。
--    配下面的唯一索引，两个并发/连点的免费抽请求在库里只留得下一条 —— 原先只有
--    hasUsedFreeDrawToday 的先读后写，同时进来就双双放行。
--    SQLite 的唯一索引认为 NULL 互不相等，所以付费抽的行不受约束影响。
ALTER TABLE lottery_draw ADD COLUMN freeDrawDate TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lottery_draw_free_draw
  ON lottery_draw (userId, freeDrawDate);

-- 2) rate_limit_bucket：`lib/rate-limit.ts` 的 checkRateLimit 计数落这里。
--    之前是进程内 Map，Vercel 每实例各一份，等于没限流。一行一个固定窗口桶，
--    计数与判上限靠一条 UPSERT 完成（见 lib/rate-limit.ts 的注释）。
CREATE TABLE IF NOT EXISTS rate_limit_bucket (
  bucketKey TEXT PRIMARY KEY,
  windowStart INTEGER NOT NULL,
  count INTEGER NOT NULL,
  limitValue INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL
);

-- 过期桶靠偶发的清理语句删（每 50 次检查随手一次），扫这张表用得上。
CREATE INDEX IF NOT EXISTS idx_rate_limit_bucket_expires
  ON rate_limit_bucket (expiresAt);
