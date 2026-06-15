-- Migration: 汇率调整 + 临时余额系统
-- 2026-06-15
-- 1 credit = $1 USD (原 500,000 cr = $1)

-- 1. 创建临时余额表
CREATE TABLE IF NOT EXISTS temporary_balance (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL,
  redemptionId TEXT REFERENCES redemption(id) ON DELETE SET NULL,
  description TEXT,
  createdAt INTEGER NOT NULL
);

-- 2. 添加兑换码余额有效期字段
ALTER TABLE redemption ADD COLUMN balanceValidDays INTEGER;

-- 3. 更新现有用户余额（500,000:1 → 1:1）
-- 注意：这会导致余额大幅缩减，需要根据实际情况调整
-- 示例：521,518 cr → 1 cr (521518 / 500000 = 1.04)
-- UPDATE user SET balanceCredits = CAST(balanceCredits / 500000.0 AS INTEGER);

-- 4. 清理已过期的临时余额（定期任务）
-- DELETE FROM temporary_balance WHERE expiresAt < unixepoch('now') * 1000;
