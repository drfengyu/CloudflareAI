-- Migration: 累抽档位赠券的唯一索引补上「档位内第几张」
-- 2026-09-23
-- 原索引 UNIQUE(userId, milestoneDraws) 让同一档位只能存一行，于是「送 2 张及以上」的档位
-- 在 grantTickets 批量插入时第二行就撞索引，整笔赠券被 catch 吞掉 → 线上除了第 10 档（送 1 张）
-- 之外没有任何档位发放成功。带上 milestoneSeq 后，一档位可以存 N 行，而重复领取仍会被第 0 张挡下。

ALTER TABLE lottery_ticket ADD COLUMN milestoneSeq INTEGER NOT NULL DEFAULT 0;

DROP INDEX IF EXISTS uq_lottery_ticket_milestone;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lottery_ticket_milestone
  ON lottery_ticket (userId, milestoneDraws, milestoneSeq);
