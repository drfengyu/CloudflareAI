-- v0.39.0 转盘抽奖券改为活动券：
-- 1) 开奖行新增 ticketCredits 列，记录这一注消耗的活动券面值（免费抽为 0）。
--    抽奖券移除后不再回填 ticketId，窗口口径的站点收入直接读这一列；历史行为 NULL，读侧退回券表关联。
-- 2) 累抽档位改发当期活动券，新增领取记录表，唯一索引接住并发重复领取。
-- 历史 lottery_ticket / lottery_user_stats 表保留不删。
-- 应用方式：node scripts/run-migration.js migrations/026_lottery_coupon_only.sql

ALTER TABLE lottery_draw ADD COLUMN ticketCredits REAL;

CREATE TABLE IF NOT EXISTS lottery_milestone_grant (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  activityKey TEXT NOT NULL,
  draws INTEGER NOT NULL,
  tickets INTEGER NOT NULL,
  createdAt INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lottery_milestone_grant
  ON lottery_milestone_grant(userId, activityKey, draws);