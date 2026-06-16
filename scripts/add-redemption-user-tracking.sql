-- 为兑换码表添加使用者跟踪字段
-- Migration: add usedUserId and redeemedAt to redemption table

-- 添加使用者用户 ID 字段
ALTER TABLE redemption ADD COLUMN usedUserId TEXT REFERENCES user(id) ON DELETE SET NULL;

-- 添加最后兑换时间字段
ALTER TABLE redemption ADD COLUMN redeemedAt INTEGER;

-- 注释：
-- usedUserId: 记录最后一次使用该兑换码的用户 ID
-- redeemedAt: 记录最后一次兑换的时间戳（毫秒）
