-- v0.11.0 限时活动「雷电行动」：纵版射击游戏的对局、通关流水与首通进度
-- 只新增表与索引，不改动任何既有表、不回填、不删除历史数据。
-- 应用方式：node scripts/run-migration.js migrations/019_raiden.sql

CREATE TABLE IF NOT EXISTS raiden_run (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  activityKey TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  loadout TEXT,
  power INTEGER NOT NULL DEFAULT 1,
  bombs INTEGER NOT NULL DEFAULT 3,
  lives INTEGER NOT NULL DEFAULT 3,
  revives INTEGER NOT NULL DEFAULT 0,
  creditsSpent REAL NOT NULL DEFAULT 0,
  stage INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  startedAt INTEGER NOT NULL,
  lastSettleAt INTEGER NOT NULL,
  endedAt INTEGER
);

CREATE INDEX IF NOT EXISTS idx_raiden_run_user
  ON raiden_run(userId, activityKey, startedAt);
CREATE INDEX IF NOT EXISTS idx_raiden_run_board
  ON raiden_run(activityKey, score);

CREATE TABLE IF NOT EXISTS raiden_clear (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  runId TEXT NOT NULL,
  activityKey TEXT NOT NULL,
  stageNo INTEGER NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL,
  rewardCredits REAL NOT NULL DEFAULT 0,
  durationMs INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER
);

-- 同一局的同一关只结算一次：重复提交（断网重试、连点）由它挡下。
CREATE UNIQUE INDEX IF NOT EXISTS uq_raiden_clear_run_stage
  ON raiden_clear(runId, stageNo);
CREATE INDEX IF NOT EXISTS idx_raiden_clear_user
  ON raiden_clear(userId, activityKey, createdAt);
CREATE INDEX IF NOT EXISTS idx_raiden_clear_stage
  ON raiden_clear(activityKey, stageNo);

CREATE TABLE IF NOT EXISTS raiden_progress (
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  activityKey TEXT NOT NULL,
  stageNo INTEGER NOT NULL,
  firstClearedAt INTEGER NOT NULL,
  clears INTEGER NOT NULL DEFAULT 1,
  bestScore INTEGER NOT NULL DEFAULT 0,
  bestDurationMs INTEGER,
  updatedAt INTEGER NOT NULL,
  PRIMARY KEY (userId, activityKey, stageNo)
);

CREATE INDEX IF NOT EXISTS idx_raiden_progress_activity
  ON raiden_progress(activityKey, stageNo);
