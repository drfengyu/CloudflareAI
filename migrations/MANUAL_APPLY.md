-- 手动应用迁移到 Cloudflare D1
-- 步骤：

-- 1. 登录 Cloudflare Dashboard: https://dash.cloudflare.com/
-- 2. 进入 Workers & Pages > D1 > cloudflare-ai-db
-- 3. 点击 "Console" 标签页
-- 4. 执行以下 SQL（一条一条执行）：

-- 创建临时余额表
CREATE TABLE IF NOT EXISTS temporary_balance (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL,
  redemptionId TEXT REFERENCES redemption(id) ON DELETE SET NULL,
  description TEXT,
  createdAt INTEGER NOT NULL
);

-- 添加兑换码余额有效期字段
-- 注意：SQLite 不支持 ADD COLUMN IF NOT EXISTS
-- 如果已经添加过，会报错但不影响
ALTER TABLE redemption ADD COLUMN balanceValidDays INTEGER;

-- 验证表结构
PRAGMA table_info(redemption);
PRAGMA table_info(temporary_balance);

-- 查看现有兑换码
SELECT id, code, quota, balanceValidDays FROM redemption LIMIT 5;
