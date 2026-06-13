-- Phase C 扩展：对话历史存储
-- 用于保存文本生成的 prompt 和 response，便于用户查看历史对话

CREATE TABLE IF NOT EXISTS conversation_history (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  sessionId TEXT,  -- 可选，用于分组同一会话的多轮对话
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  response TEXT NOT NULL,
  inputTokens INTEGER DEFAULT 0,
  outputTokens INTEGER DEFAULT 0,
  creditsUsed INTEGER DEFAULT 0,
  createdAt INTEGER NOT NULL,
  FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
);

-- 索引：按用户和时间查询（最常见的查询模式）
CREATE INDEX IF NOT EXISTS idx_conversation_userId_createdAt
  ON conversation_history(userId, createdAt DESC);

-- 索引：按会话 ID 查询（查看同一会话的多轮对话）
CREATE INDEX IF NOT EXISTS idx_conversation_sessionId
  ON conversation_history(sessionId, createdAt ASC);
