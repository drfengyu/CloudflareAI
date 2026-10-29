-- 2026-10-29 抽奖累计统计行：把「不限时间」的开奖/券包聚合从整表扫描改成一行读写。
-- 背景见 docs/fixes/2026-10-29-d1-read-amplification.md。
-- 表数据全部可由 lottery_draw / lottery_ticket 重算：需要全量重建时先 DELETE FROM lottery_user_stats，再重跑本文件。

CREATE TABLE IF NOT EXISTS lottery_user_stats (
  "userId" text NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  scope text NOT NULL,
  draws integer NOT NULL DEFAULT 0,
  "outerHits" integer NOT NULL DEFAULT 0,
  "paidOut" real NOT NULL DEFAULT 0,
  "clawedBack" real NOT NULL DEFAULT 0,
  "ticketFace" real NOT NULL DEFAULT 0,
  "lastDrawAt" integer,
  "boughtTickets" integer NOT NULL DEFAULT 0,
  "boughtCredits" real NOT NULL DEFAULT 0,
  "unusedTickets" integer NOT NULL DEFAULT 0,
  "unusedCredits" real NOT NULL DEFAULT 0,
  "giftTickets" integer NOT NULL DEFAULT 0,
  "prizeTickets" integer NOT NULL DEFAULT 0,
  "updatedAt" integer,
  PRIMARY KEY ("userId", scope)
);

-- 用户侧明细（ORDER BY createdAt DESC LIMIT n）、连续未中计数、免费抽判据都要按用户取最近若干行。
CREATE INDEX IF NOT EXISTS idx_lottery_draw_user_created ON lottery_draw(userId, createdAt);

-- 回填 1/4：开奖 & 全量口径。
INSERT INTO lottery_user_stats ("userId", scope, draws, "outerHits", "paidOut", "clawedBack", "ticketFace", "lastDrawAt", "updatedAt")
SELECT
  d.userId,
  'all',
  COUNT(*),
  SUM(CASE WHEN d.ring = 'outer' THEN 1 ELSE 0 END),
  ROUND(SUM(CASE WHEN d.deltaCredits > 0 THEN d.deltaCredits ELSE 0 END), 2),
  ROUND(SUM(CASE WHEN d.deltaCredits < 0 THEN -d.deltaCredits ELSE 0 END), 2),
  ROUND(SUM(COALESCE((SELECT t.priceCredits FROM lottery_ticket t WHERE t.id = d.ticketId), 0)), 2),
  MAX(d.createdAt),
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM lottery_draw d
WHERE d.userId IS NOT NULL
GROUP BY d.userId
ON CONFLICT("userId", scope) DO UPDATE SET
  draws = excluded.draws,
  "outerHits" = excluded."outerHits",
  "paidOut" = excluded."paidOut",
  "clawedBack" = excluded."clawedBack",
  "ticketFace" = excluded."ticketFace",
  "lastDrawAt" = excluded."lastDrawAt",
  "updatedAt" = excluded."updatedAt";

-- 回填 2/4：开奖 & 活动轮次口径（/lottery 的「当前活动战绩」读这条）。
INSERT INTO lottery_user_stats ("userId", scope, draws, "outerHits", "paidOut", "clawedBack", "ticketFace", "lastDrawAt", "updatedAt")
SELECT
  d.userId,
  d.activityKey,
  COUNT(*),
  SUM(CASE WHEN d.ring = 'outer' THEN 1 ELSE 0 END),
  ROUND(SUM(CASE WHEN d.deltaCredits > 0 THEN d.deltaCredits ELSE 0 END), 2),
  ROUND(SUM(CASE WHEN d.deltaCredits < 0 THEN -d.deltaCredits ELSE 0 END), 2),
  ROUND(SUM(COALESCE((SELECT t.priceCredits FROM lottery_ticket t WHERE t.id = d.ticketId), 0)), 2),
  MAX(d.createdAt),
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM lottery_draw d
WHERE d.activityKey IS NOT NULL
GROUP BY d.userId, d.activityKey
ON CONFLICT("userId", scope) DO UPDATE SET
  draws = excluded.draws,
  "outerHits" = excluded."outerHits",
  "paidOut" = excluded."paidOut",
  "clawedBack" = excluded."clawedBack",
  "ticketFace" = excluded."ticketFace",
  "lastDrawAt" = excluded."lastDrawAt",
  "updatedAt" = excluded."updatedAt";

-- 回填 3/4：券包 & 全量口径（买入、未开奖余券、赠送、抽中）。
INSERT INTO lottery_user_stats ("userId", scope, "boughtTickets", "boughtCredits", "unusedTickets", "unusedCredits", "giftTickets", "prizeTickets", "updatedAt")
SELECT
  t.userId,
  'all',
  SUM(CASE WHEN t.source = 'buy' THEN 1 ELSE 0 END),
  ROUND(SUM(CASE WHEN t.source = 'buy' THEN t.priceCredits ELSE 0 END), 2),
  SUM(CASE WHEN t.source = 'buy' AND t.usedDrawId IS NULL THEN 1 ELSE 0 END),
  ROUND(SUM(CASE WHEN t.source = 'buy' AND t.usedDrawId IS NULL THEN t.priceCredits ELSE 0 END), 2),
  SUM(CASE WHEN t.source = 'gift' THEN 1 ELSE 0 END),
  SUM(CASE WHEN t.source = 'prize' THEN 1 ELSE 0 END),
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM lottery_ticket t
WHERE t.userId IS NOT NULL
GROUP BY t.userId
ON CONFLICT("userId", scope) DO UPDATE SET
  "boughtTickets" = excluded."boughtTickets",
  "boughtCredits" = excluded."boughtCredits",
  "unusedTickets" = excluded."unusedTickets",
  "unusedCredits" = excluded."unusedCredits",
  "giftTickets" = excluded."giftTickets",
  "prizeTickets" = excluded."prizeTickets",
  "updatedAt" = excluded."updatedAt";

-- 回填 4/4：没有开奖也没有券的用户不需要行；历史 null 轮次（活动功能上线前）只进 all 口径。
-- 说明：券侧计数不按活动轮次拆分（用户页与管理端「全部」只读 all），轮次行里保持 0。
