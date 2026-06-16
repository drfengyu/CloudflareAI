-- Step 1: 备份旧数据到临时表
CREATE TABLE redemption_backup AS SELECT * FROM redemption;
CREATE TABLE topup_backup AS SELECT * FROM topup;

-- Step 2: 删除旧表
DROP TABLE redemption;
DROP TABLE topup;

-- Step 3: 重建 redemption 表（quota 改为 REAL）
CREATE TABLE redemption (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  type INTEGER NOT NULL,
  quota REAL NOT NULL,
  usedCount INTEGER NOT NULL DEFAULT 0,
  maxUses INTEGER,
  expiresAt INTEGER,
  balanceValidDays INTEGER,
  createdBy TEXT REFERENCES user(id) ON DELETE SET NULL,
  createdAt INTEGER NOT NULL
);

-- Step 4: 重建 topup 表（amount 改为 REAL）
CREATE TABLE topup (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  type INTEGER NOT NULL,
  description TEXT,
  redemptionId TEXT REFERENCES redemption(id) ON DELETE SET NULL,
  createdAt INTEGER NOT NULL
);

-- Step 5: 迁移 redemption 数据（quota 保持原值，已经是新系统）
INSERT INTO redemption (id, code, type, quota, usedCount, maxUses, expiresAt, balanceValidDays, createdBy, createdAt)
SELECT id, code, type, quota, usedCount, maxUses, expiresAt, balanceValidDays, createdBy, createdAt
FROM redemption_backup;

-- Step 6: 迁移 topup 数据（amount ÷ 100，仅对 ≥ 10000 的记录）
INSERT INTO topup (id, userId, amount, type, description, redemptionId, createdAt)
SELECT
  id,
  userId,
  CASE
    WHEN amount >= 10000 THEN amount / 100.0
    ELSE amount
  END as amount,
  type,
  description,
  redemptionId,
  createdAt
FROM topup_backup;

-- Step 7: 删除备份表
DROP TABLE redemption_backup;
DROP TABLE topup_backup;
