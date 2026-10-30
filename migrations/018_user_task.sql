-- v0.10.0 运营活动：任务成就领取记录
-- 只新增表与索引，不改动任何既有表、不回填、不删除历史数据。
-- 应用方式：node scripts/run-migration.js migrations/018_user_task.sql

CREATE TABLE IF NOT EXISTS user_task (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  taskKey TEXT NOT NULL,
  rewardCredits REAL NOT NULL DEFAULT 0,
  createdAt INTEGER
);

-- 一个任务只能领一次；并发重复点击由这条唯一索引挡（与 cashback_claim 同构）
-- 最左前缀同时服务「按用户查已领清单」，不再另建索引。
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_task
  ON user_task(userId, taskKey);
