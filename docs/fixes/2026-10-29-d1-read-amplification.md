# 缺索引导致的全表扫描：钱包/券包/管理端聚合每次都在读整表

日期：2026-10-29
影响：`migrations/013_perf_indexes.sql`（仅 DDL，无应用代码改动）

## 现象

Cloudflare 面板显示 D1 免费额度「已读取行」早上就跑到 40.86k / 5M。额度本身没爆，
但读放大明显：站点只有 5 个用户，一张表 5.6k 行，一早上却读了几万行。

## 实测规模（2026-10-29）

| 表 | 行数 |
|---|---|
| topup | 5,644 |
| lottery_ticket | 5,577 |
| lottery_draw | 5,556 |
| usage_log | 475 |
| model_pricing | 361 |
| temporary_balance | 32 |

`EXPLAIN QUERY PLAN` 显示以下查询是 `SCAN <table>`（全表扫描）：

| 查询 | 调用点 | 原计划 |
|---|---|---|
| `topup WHERE userId = ? AND createdAt >= ? ORDER BY createdAt DESC LIMIT 20` | `/wallet` 充值流水 | `SCAN topup` + `USE TEMP B-TREE FOR ORDER BY` |
| `topup WHERE userId = ? AND createdAt >= ?`（SUM） | 余额统计 | `SCAN topup` |
| `temporary_balance WHERE userId = ? AND expiresAt > now` | `/wallet`、看板、网关预检 | `SCAN temporary_balance` |
| `lottery_ticket WHERE userId = ? AND usedDrawId IS NULL AND expired = 0` | 抽奖页券数、开奖取券 | 借 `uq_lottery_ticket_milestone` 扫该用户全部券 |
| `lottery_draw WHERE createdAt >= ? AND (...)` | 首页「最近大奖」24h | 全表扫描后排序 |
| `lottery_draw/ticket WHERE createdAt BETWEEN ? AND ?` | 管理端按时间窗聚合 | 全表扫描（无 userId 前缀时用不上 `(userId, createdAt)`） |

按行数折算，一次 `/lottery` 打开约读 2.2 万行，一次 `/wallet` 约 5.7 千行，
一次管理端「全部」口径约 1.7 万行。这就是「早上 4 万」的来源。

## 修复

`migrations/013_perf_indexes.sql`，6 条普通索引（可 `DROP INDEX` 回退）：

| 索引 | 服务的查询 |
|---|---|
| `idx_topup_user_created (userId, createdAt)` | 钱包流水按时间倒序取 20 条 |
| `idx_lottery_ticket_user_state (userId, usedDrawId, expired, createdAt)` | 可用券计数（覆盖索引）与按创建时间取券 |
| `idx_lottery_ticket_created (createdAt)` | 管理端券面值按时间窗聚合 |
| `idx_lottery_draw_created (createdAt)` | 最近大奖 24h、管理端开奖按时间窗聚合 |
| `idx_temporary_balance_user_expires (userId, expiresAt)` | 未过期临时余额 |
| `idx_usage_log_user_created (userId, createdAt)` | 看板同一窗口内的 4 条用量聚合 |

已执行到线上 D1（`node scripts/run-migration.js migrations/013_perf_indexes.sql`）。

## 验证

改后计划全部走索引：

- `topup` → `SEARCH topup USING INDEX idx_topup_user_created (userId=? AND createdAt>?)`
- `lottery_ticket` 计数 → `SEARCH ... USING COVERING INDEX idx_lottery_ticket_user_state`
- `lottery_ticket` 取券 → 同一索引，无临时排序
- `lottery_draw` 24h 大奖 → `SEARCH ... USING INDEX idx_lottery_draw_created (createdAt>?)`
- 管理端窗口聚合 → `COVERING INDEX idx_lottery_ticket_created` / `idx_lottery_draw_created`
- `usage_log` 窗口 → `idx_usage_log_user_created`

结果一致性：同一用户「未用券数」带索引与 `NOT INDEXED` 全表扫描结果相同；
钱包前 20 条流水两种计划的 id 顺序完全一致。

## 已知边界（本次没动的部分）

「累计 / 全部活动」这类聚合必然要读完该用户的历史行，加索引也降不下来：

| 位置 | 每次打开读取 |
|---|---|
| `/lottery` `lotteryBalance({userId})` + `lotteryBalance({userId, activityKey})` | 各约 5.5k 行 |
| `/lottery` `lotteryTicketTotals(userId)` | 约 5.6k 行 |
| 看板「转盘抽奖」卡 `lotteryBalance({userId})` | 约 5.5k 行 |
| 管理端「全部」口径 `lotteryBalance` + `lotteryBalanceByUser` + `lotteryTicketTotals` | 各约 5.5k 行 |

要彻底压掉这部分，需要一张按用户的累计统计行（开奖批次结算时增量 upsert，
并提供一次性重建脚本兜底）。这会改动开奖写路径，暂未实施；当前规模下
（每天几万行 vs 5M 额度）不影响可用性。
