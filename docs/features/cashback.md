# 限时消费返利、活动券与用量冲榜

**版本**：v0.32.0 · **状态**：代码已上线，**默认关闭**，开关在「后台 → 系统设置 → 消费返利」

## 为什么要它

上线前只读盘点（2026-10-30）：全站真实 API 消耗约 863.91 cr / 22 次 / 3 个用户每月，而回收几乎只由抽奖转盘驱动。
消费返利直接挂在「真实消耗」这条唯一在流动的钱上，用小额返还把用户拉回来继续消耗；
活动券把返利、充值活动与三个限时玩法串成一个闭环，避免奖励发出去却没有地方花。

## 消费返利口径

- **与限时充值活动共用同一时间段**：直接复用 `recharge_bonus_start_date` / `recharge_bonus_end_date`
  （北京时间，开始日 00:00 起、结束日次日 00:00 止）。后台不需要再配一份日期。
- 按活动期内**累计消费**判定，逐档发放：达到的每一档都能各领一次，不是只取最高一档。
- 默认五档（后台可改，最多 10 档）：

| 累计消费 | 奖励区间 |
| --- | --- |
| 500 cr | 10–100 cr |
| 2,000 cr | 20–200 cr |
| 5,000 cr | 50–400 cr |
| 10,000 cr | 100–700 cr |
| 20,000 cr | 200–1,200 cr |

- 每档发放时随机一种形态：临时货币 40% / 永久货币 30% / 当期活动券 20% / 抽奖券 10%（1–3 张）；
  金额在档位区间内随机，档位越高区间越高。活动券落点从「当前开着的活动」里随机挑一个，
  没有开着的活动时自动降级为临时货币，不会发出一张领不到的空头券。
- 「消费」取 `usage_log.creditsUsed` 汇总；失败调用记 0 cr，不需要按 `status` 过滤。
- 奖励不直接进余额，统一走「发放到站内信 → 领取后到账」。

## 活动券与珍宝礼包

活动券是**按活动、按轮次计价的 credits**，不是独立汇率：

- 三种券分别对应幸运转盘 / 翻牌夺宝 / 雷电行动；同一轮所有人看到同一个券名
  （`couponNameFor` 用 `${kind}:${activityKey}` 做 FNV-1a，池内选名，不落随机表）。
- 当期活动结束即作废，下一轮 `activityKey` 变化后自然换名；旧券行保留但不再参与支付。
- 获取方式：按活动单价整张兑换（1 张 = `couponUnitCredits` cr，默认 1，先临时余额、再永久余额）、
  珍宝礼包、消费返利 / 活跃度奖励。
- 珍宝礼包三档固定比例：小份 10 cr → 20 cr（200%）、中份 50 cr → 250 cr（500%）、大份 100 cr → 1,000 cr（1000%）。
  限购按「用户 + 礼包」跨活动统计、北京自然日切日（`coupon_pack_purchase`，迁移 025）：小份不限，
  中份每日 2 / 累计 20，大份每日 1 / 累计 10；写入用单条 `INSERT ... SELECT ... WHERE` 复查计数，并发不超卖。
- 玩法付费只扣活动券：券面不足直接失败并提示先兑换，不再接受余额直付。券在兑换 / 买礼包时已经作为
  `topup type=15` 记过支出，所以账本合计与余额下降保持一致。

## 发放与到账

1. 用户在「活动中心」页（`/cashback`）的消费返利卡片里，对已达标的档位点「发放到站内信」；
2. 服务端按当前累计重新校验资格，随机结果在发放时锁定进 `reward_claim`
   （`activityKind=cashback`，`tierKey` 为累计门槛，如 `5000`）；唯一索引挡双击 / 并发；
3. 发一封带附件（临时 / 永久货币、活动券或抽奖券）的站内信；
4. 用户在站内信点「领取」后才真正入账，并回写 `reward_claim.claimedAt`。

之后改比例、改档位都不会让已发放的奖励变数——活动页展示的已发额度取自 `reward_claim` 快照。

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
| 表 / 迁移 | `lib/db/schema.ts`（`rewardClaims` / `activityCoupons`）、`migrations/022_reward_claim.sql`、`migrations/023_activity_currency.sql` |
| 返利逻辑 | `lib/cashback/{config,claims}.ts` |
| 活动券 | `lib/activity/coupons.ts`（兑换、礼包、支付与退款） |
| 站内信 | `lib/message/messages.ts`（`temp_credits` / `credits` / `coupon` / `tickets` 附件） |
| 配置 | `lib/settings/index.ts` → `getCashbackSettings()`，键前缀 `cashback_*`；活动时间复用 `recharge_bonus_*` |
| 页面 | `app/(dashboard)/cashback/{page,actions,coupon-actions}.tsx`、`components/cashback/{cashback-tier-panel,recharge-panel}.tsx`、`components/activity/coupon-shop.tsx` |
| 顶栏 | `components/dashboard/currency-bar.tsx`（铃铛左侧货币条） |
| 后台 | `app/(dashboard)/admin/settings/settings-form.tsx` → `CashbackSettingsForm`（逐行数字档位，无 JSON） |
| 账本 | `lib/billing/ledger.ts`（type=8 返利、type=15 活动券兑换归「赠送与返利」） |

## 已知边界

- 管理员账号自身的消耗与发放会进同一张榜：`drfengling@163.com` 的历史 `topup` 累计超 10 亿 cr（早期自用兑换码），
  但排行榜读的是 `usage_log` 消耗，不受那条发放影响。
- 活动关闭期间照常统计用量，开启后**不补发**历史消费档位；累计窗口从 `recharge_bonus_start_date` 起算。
- 老版本已经直接发放到临时余额的 `cashback_claim` 行没有对应站内信，活动页仅作为「已领取」历史展示。
- 活动券到期不做后台批处理，读侧按 `activityKey` 过滤，过期券自然不再显示与参与支付。
