-- v0.40.0 翻牌夺宝奖项支持发活动券：
-- 面值正好等于券单价整数倍的奖项，翻中后发对应张数的翻牌活动券（不进 tcr 余额）；
-- 有零头的奖项仍按 tcr 发放。rewardTickets 记录该局实发的整张数，
-- NULL = 发的是 tcr（或还未翻开 / 空牌），历史行不需要回填。
-- 应用方式：node scripts/run-migration.js migrations/027_flip_coupon_rewards.sql

ALTER TABLE flip_round ADD COLUMN rewardTickets INTEGER;
