-- 2026-11-22 下线旧「每日试炼 / 三国讨逆传」玩法。
-- 游戏代码与页面入口已移除；这里删除唯一的游戏态表与配置，
-- 历史账本流水（topups / activity_coupon）保留用于对账，不再对外展示。
DROP TABLE IF EXISTS trial_run;
DELETE FROM option WHERE key = 'trial_config';
