-- Migration: 限时活动·外圈赠券档
-- 2026-09-23
-- 外圈新增「赠送抽奖券」奖型：它不动 cr 账本（不写 topup 流水），所以开奖行要自己记下
-- 发了几张券，用户侧活动记录与后台收益页都读这一列。
-- lottery_ticket.source 是无 CHECK 约束的 TEXT，直接多一个取值 'prize'，不需要改表。

ALTER TABLE lottery_draw ADD COLUMN grantTickets INTEGER NOT NULL DEFAULT 0;
