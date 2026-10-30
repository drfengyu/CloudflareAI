-- v0.10.0 运营活动：消费返利领取记录
-- 只新增表与索引，不改动任何既有表、不回填、不删除历史数据。
-- 应用方式：node scripts/run-migration.js migrations/017_cashback_claim.sql

CREATE TABLE IF NOT EXISTS cashback_claim (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  periodDate TEXT NOT NULL,
  consumedCredits REAL NOT NULL DEFAULT 0,
  rewardCredits REAL NOT NULL DEFAULT 0,
  createdAt INTEGER
);

-- 每人每个自然日只能领一次；并发重复点击由这条唯一索引挡（与 checkin 同构）
CREATE UNIQUE INDEX IF NOT EXISTS uq_cashback_claim
  ON cashback_claim(userId, periodDate);

CREATE INDEX IF NOT EXISTS idx_cashback_claim_period
  ON cashback_claim(periodDate);
