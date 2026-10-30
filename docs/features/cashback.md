# 消费返利与用量冲榜

**版本**：v0.10.0 · **状态**：代码已上线，**默认关闭**，开关在「后台 → 系统设置 → 消费返利」

## 为什么要它

上线前只读盘点（2026-10-30）：全站真实 API 消耗约 863.91 cr / 22 次 / 3 个用户每月，而回收几乎只由抽奖转盘驱动。
消费返利直接挂在「真实消耗」这条唯一在流动的钱上，用小额返还把用户拉回来继续消耗。

## 口径

- **按北京自然日结算、用户手动领取**：只有已结束的日子可领（今天不算），最多往前补 `backfillDays` 天（默认 3，上限 31）。
  攒很久再一次性领走大额的路径被这个窗口堵死。
- 单日返利 = `min(当日消费 × rate, cap)`，且当日消费需 ≥ `minCredits` 才起返。默认 `rate=0.1`、`minCredits=20`、`cap=200`。
- 发放进**临时余额**（`temporary_balance`），有效期 `cashback_valid_days`（默认 7 天），到期自动作废；
  钱包流水记 `type=8`，`lib/billing/grant-expiry.ts` 的 CASE / NOT IN 都已登记这一类，否则流水要么永挂要么整类消失。
- 「当日消费」取 `usage_log.creditsUsed` 汇总。失败调用记 0 cr，所以不需要按 `status` 过滤。
- 领取时把当日消费与实发额度**快照**进 `cashback_claim`：之后改比例、改定价都不会让历史返利变数。

## 防重放

D1 没有事务，所以 `claimCashback` 是**先插 `cashback_claim` 占住 `uq_cashback_claim(userId, periodDate)`，
再发临时余额与流水；发放写失败就把这条占位删掉**。反过来先发光，连点两次就是真发两份。

## 用量冲榜

`getUsageLeaderboard` 按窗口（`leaderboardDays`，默认 7 天）聚合 `usage_log`，JS 侧排序后取前 `leaderboardSize` 名。
SQL 只做 `GROUP BY`——D1 上 `ORDER BY` 聚合表达式或 SELECT 别名会解析失败（见 `docs/fixes`）。
展示是脱敏的（`lib/mask.ts` 的 `maskUserLabel`：邮箱首字符 + `***`），自己那行高亮为「（我）」。
**排行榜只读，不发放任何奖励**，避免变成刷量目标。

## 涉及文件

| 层 | 文件 |
| --- | --- |
| 表 / 迁移 | `lib/db/schema.ts`（`cashbackClaims`）、`migrations/017_cashback_claim.sql`（已在线上 D1 执行） |
| 逻辑 | `lib/cashback/claims.ts` |
| 配置 | `lib/settings/index.ts` → `getCashbackSettings()`，键前缀 `cashback_*` |
| 页面 | `app/(dashboard)/cashback/{page,actions}.tsx`、`components/cashback/claim-panel.tsx` |
| 后台 | `app/(dashboard)/admin/settings/settings-form.tsx` → `CashbackSettingsForm` |
| 账本 | `lib/billing/grant-expiry.ts`（type=8 到期过滤）、`wallet/topup-records-card.tsx`（标签） |

## 已知边界

- 管理员账号自身的消耗与发放会进同一张榜：`drfengling@163.com` 的历史 `topup` 累计超 10 亿 cr（早期自用兑换码），
  但排行榜读的是 `usage_log` 消耗，不受那条发放影响。
- 活动关闭期间照常统计用量，开启后**不补发**历史日子的返利（`backfillDays` 窗口本身就是限制）。
