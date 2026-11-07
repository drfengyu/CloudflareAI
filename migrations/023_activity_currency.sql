-- v0.32.0 货币与活跃度：活动券余额 + 每日/每周任务领取
-- 新增两张表，并给 reward_claim 补奖励形态列；不改动既有数据、不回填、不删除历史。
-- 应用方式：node scripts/run-migration.js migrations/023_activity_currency.sql

ALTER TABLE reward_claim ADD COLUMN rewardKind TEXT NOT NULL DEFAULT 'temp_credits';
ALTER TABLE reward_claim ADD COLUMN rewardLabel TEXT;

CREATE TABLE IF NOT EXISTS activity_coupon (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  activityKind TEXT NOT NULL,
  activityKey TEXT NOT NULL,
  couponName TEXT NOT NULL,
  credits REAL NOT NULL DEFAULT 0,
  createdAt INTEGER,
  updatedAt INTEGER
);

-- 一个用户在同一活动轮次只有一行券；轮次变更后旧行保留但不再参与支付。
CREATE UNIQUE INDEX IF NOT EXISTS uq_activity_coupon
  ON activity_coupon(userId, activityKind, activityKey);

CREATE INDEX IF NOT EXISTS idx_activity_coupon_user
  ON activity_coupon(userId, activityKind);

CREATE TABLE IF NOT EXISTS activity_task_claim (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  periodKind TEXT NOT NULL,
  periodKey TEXT NOT NULL,
  taskKey TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER
);

-- 同一用户同一周期的同一任务只能领一次；周期 key 变更后自然开启新一轮。
CREATE UNIQUE INDEX IF NOT EXISTS uq_activity_task_claim
  ON activity_task_claim(userId, periodKind, periodKey, taskKey);

CREATE INDEX IF NOT EXISTS idx_activity_task_claim_period
  ON activity_task_claim(userId, periodKind, periodKey);
