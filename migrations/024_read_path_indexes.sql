-- v0.32.1 读放大治理：topup 按类型取数补复合索引
-- 现有 idx_topup_user_created 只能先取出该用户全部流水、再逐行过滤 type；
-- 任务「本周充值」与看板「活动消耗」都按 type 取数，补 (userId, type, createdAt) 后只扫命中类型。
-- 应用方式：node scripts/run-migration.js migrations/024_read_path_indexes.sql

CREATE INDEX IF NOT EXISTS idx_topup_user_type_created
  ON topup(userId, type, createdAt);
