-- Migration: 抽奖活动轮次支持（activityKey + 过期券）
-- 2026-10-09
-- 新增 activityKey 字段标识每条券/记录属于哪一轮活动（用活动 startAt 字符串），
-- 新增 expired 字段标记活动结束后作废的券。历史数据 activityKey 为 NULL，expired 默认为 0。

ALTER TABLE lottery_ticket ADD COLUMN activityKey TEXT;
ALTER TABLE lottery_ticket ADD COLUMN expired INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lottery_draw ADD COLUMN activityKey TEXT;

CREATE INDEX IF NOT EXISTS idx_lottery_ticket_activity ON lottery_ticket (userId, activityKey);
CREATE INDEX IF NOT EXISTS idx_lottery_draw_activity ON lottery_draw (userId, activityKey);
