-- v0.27.0 站内信：系统给单个用户发放物品或下达提示（密码被管理员重置、活动补偿、人工奖励）
-- 只新增表与索引，不改动任何既有表、不回填、不删除历史数据。
-- 应用方式：node scripts/run-migration.js migrations/021_message.sql

CREATE TABLE IF NOT EXISTS message (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'notice',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  attachmentKind TEXT,
  attachment TEXT,
  sentBy TEXT REFERENCES user(id) ON DELETE SET NULL,
  readAt INTEGER,
  claimedAt INTEGER,
  createdAt INTEGER
);

-- 收件箱按时间倒序翻页，未读筛选也走这一条。
CREATE INDEX IF NOT EXISTS idx_message_user
  ON message(userId, createdAt);
-- 顶栏铃铛每次进页都要问「还有几条没读」，靠它变成一次定位而不是全表扫。
CREATE INDEX IF NOT EXISTS idx_message_unread
  ON message(userId, readAt);
-- 每日清理问的是「已读满 3 天且没有待领附件」，claimedAt 为 NULL 的行也要被扫到，
-- 所以两个字段都进索引，不能让 IS NULL 的判断退回全表。
CREATE INDEX IF NOT EXISTS idx_message_purge
  ON message(readAt, claimedAt);
