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

## 第二阶段：开奖写路径维护累计统计行（同日补）

索引只能把「按用户取最近 N 行」限制住；「不限时间」的 COUNT/SUM 仍要把历史读完。
这一轮把这类汇总搬到 `lottery_user_stats`（一行 = 一个用户 × 一个口径），
开奖、买券时用一条 UPSERT 累加增量，读侧只取一行。

| 写入点 | 增量 |
|---|---|
| 开奖批次结算（`drawLottery`） | `draws` / `outerHits` / `paidOut` / `clawedBack` / `ticketFace` / `lastDrawAt`，同时写 `scope='all'` 与当前活动轮次两行 |
| 买券（`buyTickets`） | `boughtTickets` / `boughtCredits` / `unusedTickets` / `unusedCredits` |
| 开奖消耗购买券 / 档位赠券 / 抽中赠券 | `unused*` 减；`giftTickets` / `prizeTickets` 加 |
| 整批回滚 / 买券回滚 | 按同一份增量取反；开奖回滚后按明细 `MAX(createdAt)` 重算 `lastDrawAt` |

读侧切换（`lib/lottery/records.ts`、`lib/lottery/store.ts`）：

- `lotteryBalance({userId})`、`lotteryBalance({userId, activityKey})`：读一行（用户页汇总、看板「转盘抽奖」卡）。
- `lotteryBalance()`（全站「全部」）/ `lotteryBalanceByUser()` / `lotteryTicketTotals()`：按用户行求和或直接列出，行数 = 有记录的用户数。
- `countDraws`（累抽档位判定）：原先每抽一次就把该用户本轮开奖记录 COUNT 一遍，现在读一行。
- 管理端 今日 / 近 7 日 / 近 30 日：仍走明细聚合（累计行不存时间维度），由 `idx_lottery_draw_created` / `idx_lottery_ticket_created` 限制在窗口内。

改后计划（实测 `EXPLAIN QUERY PLAN`）：

| 查询 | 计划 |
|---|---|
| 用户累计行 | `SEARCH lottery_user_stats USING INDEX sqlite_autoindex_lottery_user_stats_1 (userId=? AND scope=?)` |
| 全站累计 | `SCAN lottery_user_stats`（用户数级） |
| 可用券计数 | `SEARCH lottery_ticket USING COVERING INDEX idx_lottery_ticket_user_state` |
| 用户最近开奖 | `SEARCH lottery_draw USING INDEX idx_lottery_draw_user_created (userId=?)` |
| 免费抽判据 | `MULTI-INDEX OR`：`uq_lottery_draw_free_draw` + `idx_lottery_draw_user_created` |

按行数折算，`/lottery` 从约 2.2 万行降到数百行（明细 50 条 + 券包 + 最近大奖 + 保底 30 条），
看板「转盘抽奖」从约 5.5k 行降到 1 行，管理端「全部」从约 1.7 万行降到用户数量级。

## 回填与验证

`migrations/014_lottery_user_stats.sql` 已执行到线上 D1（建表 + 回填 + `idx_lottery_draw_user_created`）。
回填结果与明细逐项对照一致（2026-10-29）：

| 口径 | 累计行 | 明细表 |
|---|---|---|
| draws | 5,556 | 5,556 |
| outerHits | 1,095 | 1,095 |
| paidOut | 943,389.72 | 943,389.72 |
| clawedBack | 89,804 | 89,804 |
| ticketFace | 883,175 | 883,175 |
| bought / unused / gift / prize | 5,150 / 40 / 67 / 360 | 同值 |

活动轮次口径按 `(userId, activityKey)` 逐行对照，7 行全部一致。
写路径用一次性临时用户跑通「买券 → 消耗 → 开奖 → 读回 → 回滚 → 删除」，
删除后统计行随外键级联清空；纯增量口径另有 `tests/lottery-stats.test.ts`（6 个用例）。

## 已知边界

- 累计行是派生数据，唯一真源仍是 `lottery_ticket` / `lottery_draw`。若「统计写成功、其余写失败、
  回滚本身也失败」同时发生，可能出现漂移；修复方式：`DELETE FROM lottery_user_stats` 后重跑
  `migrations/014_lottery_user_stats.sql`。
- 券侧计数（bought / unused / gift / prize）只维护 `all` 口径；活动轮次行只含开奖侧累计。
- 累计行不存时间维度，管理端切到「今日 / 近 7 日 / 近 30 日」时仍走明细聚合，读取量随窗口内活动量增长。

