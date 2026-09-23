-- Migration: 限时活动·抽奖（券 + 开奖记录）
-- 2026-09-23
-- 券以「一行一券」建模，消耗 = 回填 usedDrawId（D1 无事务，条件更新是双花的唯一防线）。
-- 活动本身（起止/奖池/概率/累抽档位）是配置，存 option 表的 lottery_config，不建表。

CREATE TABLE IF NOT EXISTS lottery_ticket (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  priceCredits REAL NOT NULL DEFAULT 0,
  milestoneDraws INTEGER,
  usedDrawId TEXT,
  createdAt INTEGER
);

-- 同一累抽档位只发一次；SQLite 唯一索引视 NULL 互不相等，买券行不受约束。
CREATE UNIQUE INDEX IF NOT EXISTS uq_lottery_ticket_milestone
  ON lottery_ticket (userId, milestoneDraws);

CREATE TABLE IF NOT EXISTS lottery_draw (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  batchId TEXT NOT NULL,
  seq INTEGER NOT NULL,
  ring TEXT NOT NULL,
  label TEXT NOT NULL,
  multiplier REAL,
  deltaCredits REAL NOT NULL,
  baseCredits REAL NOT NULL DEFAULT 0,
  ticketId TEXT REFERENCES lottery_ticket(id) ON DELETE SET NULL,
  createdAt INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lottery_draw_batch_seq
  ON lottery_draw (batchId, seq);

CREATE INDEX IF NOT EXISTS idx_lottery_draw_user_created
  ON lottery_draw (userId, createdAt);
