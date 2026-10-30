-- v0.9.0 站内聊天产品化：chat_session + chat_message
-- 只新增表与索引，不改动任何既有表、不回填、不删除历史数据。
-- 应用方式：node scripts/run-migration.js migrations/016_chat_tables.sql

CREATE TABLE IF NOT EXISTS chat_session (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '新对话',
  model TEXT NOT NULL,
  systemPrompt TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  shareToken TEXT UNIQUE,
  createdAt INTEGER,
  lastMessageAt INTEGER
);

CREATE INDEX IF NOT EXISTS idx_chat_session_user_list
  ON chat_session(userId, pinned, lastMessageAt);

CREATE TABLE IF NOT EXISTS chat_message (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL REFERENCES chat_session(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL,
  model TEXT,
  content TEXT NOT NULL,
  reasoning TEXT,
  creditsUsed REAL NOT NULL DEFAULT 0,
  createdAt INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_message_seq
  ON chat_message(sessionId, seq);

CREATE INDEX IF NOT EXISTS idx_chat_message_session
  ON chat_message(sessionId, seq);
