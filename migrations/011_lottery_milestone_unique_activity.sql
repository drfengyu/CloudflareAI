-- Migration: 累抽赠券唯一索引加上 activityKey，支持不同活动轮次各自领一次
-- 2026-10-10
-- 旧索引 (userId, milestoneDraws, milestoneSeq) 导致跨活动轮次同档位赠券冲突，
-- 新索引 (userId, milestoneDraws, milestoneSeq, activityKey) 允许每轮活动各自领一次。

DROP INDEX IF EXISTS uq_lottery_ticket_milestone;
CREATE UNIQUE INDEX IF NOT EXISTS uq_lottery_ticket_milestone
  ON lottery_ticket (userId, milestoneDraws, milestoneSeq, activityKey);
