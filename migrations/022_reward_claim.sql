-- v0.31.0 限时返利：奖励先发站内信，领取后再进临时余额
-- 只新增表与索引，不改动任何既有表、不回填、不删除历史数据。
-- 应用方式：node scripts/run-migration.js migrations/022_reward_claim.sql

CREATE TABLE IF NOT EXISTS reward_claim (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  activityKind TEXT NOT NULL,
  tierKey TEXT NOT NULL,
  rewardCredits REAL NOT NULL DEFAULT 0,
  validDays INTEGER NOT NULL DEFAULT 0,
  topupType INTEGER NOT NULL DEFAULT 0,
  messageId TEXT,
  claimedAt INTEGER,
  createdAt INTEGER
);

-- 同一用户同一活动的同一档位只能发一次；重复点击与并发请求由这条唯一索引挡。
CREATE UNIQUE INDEX IF NOT EXISTS uq_reward_claim
  ON reward_claim(userId, activityKind, tierKey);

-- 活动页按用户 + 活动类型一次读出全部档位状态。
CREATE INDEX IF NOT EXISTS idx_reward_claim_user
  ON reward_claim(userId, activityKind);