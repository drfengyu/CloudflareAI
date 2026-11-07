# 消费返利与用量冲榜

**版本**：v0.31.0 · **状态**：代码已上线，**默认关闭**，开关在「后台 → 系统设置 → 消费返利」

## 为什么要它

上线前只读盘点（2026-10-30）：全站真实 API 消耗约 863.91 cr / 22 次 / 3 个用户每月，而回收几乎只由抽奖转盘驱动。
消费返利直接挂在「真实消耗」这条唯一在流动的钱上，用小额返还把用户拉回来继续消耗。

## 口径

- **按北京自然日结算、用户手动发放**：只有已结束的日子可发（今天不算），最多往前补 `backfillDays` 天（默认 3，上限 31）。
  攒很久再一次性领走大额的路径被这个窗口堵死。
- 单日返利 = `min(当日消费 × rate, cap)`，且当日消费需 ≥ `minCredits` 才起返。默认 `rate=0.1`、`minCredits=20`、`cap=200`。
- 「当日消费」取 `usage_log.creditsUsed` 汇总。失败调用记 0 cr，所以不需要按 `status` 过滤。
- 奖励不直接进余额，与充值活动共用同一条「发放到站内信 → 领取后到账」链路。

## 发放与到账

1. 用户在「限时返利」页（`/cashback`）的消费返利卡片里，对可发放日期点「发放到站内信」；
2. 服务端重新计算当日消费与返利，写 `reward_claim`（`activityKind=cashback`，`tierKey=YYYY-MM-DD`）
   占住发放位；唯一索引挡双击 / 并发，重复发放按 `claimedAt` 区分「已发待领 / 已领取」；
3. 发一封带 `temp_credits` 附件的站内信，附件内保存当日消费与返利快照；
4. 用户在站内信点「领取」，才写入**临时余额**（有效期 `cashback_valid_days`，默认 7 天）
   与钱包流水 `type=8`，并补写一行 `cashback_claim` 作为历史快照，然后回写 `reward_claim.claimedAt`。

之后改比例、改定价都不会让已发放的返利变数——活动页展示的已发额度取自 `reward_claim` 快照。
`cashback_claim` 仍是「已领取」的历史表：老数据原样保留并继续在活动页显示为已领。

## 防重放

D1 没有事务，所以分两级幂等：

- 发信前先 `INSERT OR IGNORE` 进 `reward_claim`（唯一索引 `uq_reward_claim`）；
- 站内信领取时先用条件 `UPDATE ... WHERE claimedAt IS NULL` 抢占，抢不到说明已被领走；
- 领取写余额失败会把 `claimedAt` 置回 `NULL`，用户还能重试；
- 待领取的附件不能手动删除，cron 也不会清，避免「活动页说已发、信没了」。

## 用量冲榜

`getUsageLeaderboard` 按窗口（`leaderboardDays`，默认 7 天）聚合 `usage_log`，JS 侧排序后取前 `leaderboardSize` 名。
SQL 只做 `GROUP BY`——D1 上 `ORDER BY` 聚合表达式或 SELECT 别名会解析失败（见 `docs/fixes`）。
展示是脱敏的（`lib/mask.ts` 的 `maskUserLabel`：邮箱首字符 + `***`），自己那行高亮为「（我）」。
**排行榜只读，不发放任何奖励**，避免变成刷量目标。

## 涉及文件

| 层 | 文件 |
| --- | --- |
| 表 / 迁移 | `lib/db/schema.ts`（`cashbackClaims` / `rewardClaims`）、`migrations/017_cashback_claim.sql`、`migrations/022_reward_claim.sql` |
| 逻辑 | `lib/cashback/claims.ts`、`lib/rewards/claims.ts` |
| 站内信 | `lib/message/messages.ts`（`temp_credits` 领取写入临时余额与 `cashback_claim`） |
| 配置 | `lib/settings/index.ts` → `getCashbackSettings()`，键前缀 `cashback_*` |
| 页面 | `app/(dashboard)/cashback/{page,actions}.tsx`、`components/cashback/{claim-panel,recharge-panel}.tsx` |
| 后台 | `app/(dashboard)/admin/settings/settings-form.tsx` → `CashbackSettingsForm` |
| 账本 | `lib/billing/ledger.ts`（type=8 归「赠送与返利」） |

## 已知边界

- 管理员账号自身的消耗与发放会进同一张榜：`drfengling@163.com` 的历史 `topup` 累计超 10 亿 cr（早期自用兑换码），
  但排行榜读的是 `usage_log` 消耗，不受那条发放影响。
- 活动关闭期间照常统计用量，开启后**不补发**历史日子的返利（`backfillDays` 窗口本身就是限制）。
- 老版本已经直接发放到临时余额的 `cashback_claim` 行没有对应站内信，活动页仅作为「已领取」历史展示。