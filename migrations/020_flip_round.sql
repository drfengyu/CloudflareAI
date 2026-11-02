-- v0.15.0 限时活动「翻牌夺宝」：一局一行，牌桌在开局时就洗好定死
-- 只新增表与索引，不改动任何既有表、不回填、不删除历史数据。
-- 应用方式：node scripts/run-migration.js migrations/020_flip_round.sql

CREATE TABLE IF NOT EXISTS flip_round (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  activityKey TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priceCredits REAL NOT NULL,
  board TEXT NOT NULL,
  position INTEGER,
  rewardCredits REAL,
  createdAt INTEGER,
  settledAt INTEGER
);

CREATE INDEX IF NOT EXISTS idx_flip_round_user
  ON flip_round(userId, activityKey, createdAt);
-- 「这个人还有没有没翻完的局」是开局与进页都要问的一句话，走这个索引变成一次定位。
CREATE INDEX IF NOT EXISTS idx_flip_round_open
  ON flip_round(userId, status);
