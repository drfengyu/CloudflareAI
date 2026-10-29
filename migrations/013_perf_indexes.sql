-- 2026-10-29 性能：D1 读取放大治理。
-- EXPLAIN 证实以下查询原本走全表扫描（topup / lottery_ticket / temporary_balance），
-- 三张表长到 5.6k 行后，每次打开 /wallet、/lottery、看板都要重复读整表。
-- 全部为普通索引，可随时 DROP INDEX 回退。

-- 钱包充值流水：WHERE userId = ? AND createdAt >= ? ORDER BY createdAt DESC LIMIT 20
CREATE INDEX IF NOT EXISTS idx_topup_user_created ON topup(userId, createdAt);

-- 券包：可用券计数与取券（userId + usedDrawId IS NULL + expired = 0 + ORDER BY createdAt）
CREATE INDEX IF NOT EXISTS idx_lottery_ticket_user_state
  ON lottery_ticket(userId, usedDrawId, expired, createdAt);

-- 管理端按时间窗聚合券面值（无 userId 过滤）
CREATE INDEX IF NOT EXISTS idx_lottery_ticket_created ON lottery_ticket(createdAt);

-- 管理端按时间窗聚合开奖 / 首页「最近大奖」24 小时查询（无 userId 过滤）
CREATE INDEX IF NOT EXISTS idx_lottery_draw_created ON lottery_draw(createdAt);

-- 临时余额：WHERE userId = ? AND expiresAt > now
CREATE INDEX IF NOT EXISTS idx_temporary_balance_user_expires ON temporary_balance(userId, expiresAt);

-- 看板窗口统计：同一窗口内会连续跑 4 条 WHERE userId + createdAt 区间的聚合
CREATE INDEX IF NOT EXISTS idx_usage_log_user_created ON usage_log(userId, createdAt);
