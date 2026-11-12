-- v0.42.0 三个新玩法（每日试炼 / 灵宠工坊 / 星匣图鉴）的存储。
-- 经典玩法（转盘 / 翻牌 / 雷电）的表与数据保持不动，新玩法用独立表，互不影响。
-- 应用方式：node scripts/run-migration.js migrations/028_new_activity_games.sql

-- 每日试炼：一次挑战一行，题目与答案开局即落库，交卷只判分。
CREATE TABLE IF NOT EXISTS trial_run (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  activityKey TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  questions TEXT NOT NULL,
  questionCount INTEGER NOT NULL,
  correct INTEGER NOT NULL DEFAULT 0,
  durationMs INTEGER NOT NULL DEFAULT 0,
  rewardCredits REAL NOT NULL DEFAULT 0,
  startedAt INTEGER NOT NULL,
  submittedAt INTEGER
);

CREATE INDEX IF NOT EXISTS idx_trial_run_user ON trial_run (userId, activityKey, startedAt);

-- 灵宠工坊 / 星匣图鉴：每用户 × 轮次一行状态，整体 JSON + 乐观锁版本号。
CREATE TABLE IF NOT EXISTS workshop_state (
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  activityKey TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL,
  updatedAt INTEGER NOT NULL,
  PRIMARY KEY (userId, activityKey)
);

CREATE TABLE IF NOT EXISTS collection_state (
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  activityKey TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL,
  updatedAt INTEGER NOT NULL,
  PRIMARY KEY (userId, activityKey)
);

-- 一次性里程碑（工坊达到某阶 / 图鉴集齐一组）：唯一索引保证只发一次。
CREATE TABLE IF NOT EXISTS activity_milestone (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  activityKind TEXT NOT NULL,
  activityKey TEXT NOT NULL,
  tierKey TEXT NOT NULL,
  rewardCredits REAL NOT NULL DEFAULT 0,
  createdAt INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_activity_milestone
  ON activity_milestone (userId, activityKind, activityKey, tierKey);
