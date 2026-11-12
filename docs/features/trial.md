# 限时活动·每日试炼（v0.42.0）

服务端出题、服务端判分的整数四则限时挑战。与转盘 / 翻牌不同，这里的随机只在**出题**，
奖励完全由答对题数决定，没有暗箱概率：题目与答案在开局时落库，浏览器只拿到题干。

- 前台：`/trial`（侧边栏「每日试炼」，活动中心默认展示）
- 后台：系统设置 → 「限时活动（每日试炼）」
- 配置键：`option.trial_config`（界面按字段拆成数字输入框，管理员不写 JSON）
- 账本：`topup.type = 17`（奖励只发 tcr；票价在券兑换 / 礼包时已按 type=15 记过支出，开局不再写负流水）
- 表：`trial_run`（迁移 `migrations/028_new_activity_games.sql`）

## 玩法

1. 点「开始试炼」，按票价折成**整数张**扣当期试炼活动券（`payWithCoupon`；`runPriceCredits` 被
   `snapCostToUnit` 吸到券价整数倍，不足 1 张按 1 张）。
2. 服务端生成 `questionCount` 道互不相同的整数四则 / 两步混合题（`lib/trial/questions.ts`），
   连同答案写进 `trial_run.questions`，下发给浏览器的只有 `prompt`。
3. 限时内交卷，服务端按库里的答案严格判分（小数先取整，非数字算错）；答对题数命中最高一档发 tcr。
4. 中途关页面不丢局：未交卷的那局 `status = active`，回来接着答，不会重复扣券。
5. 每日最多 `dailyRuns` 局，按北京时间自然日统计（`countTrialRunsToday`）。

## 反作弊与幂等

- **超时**：用时超过「限时 + 5 秒宽限」记 `expired`，按 0 分处理，不返还券。
- **瞬交**：用时短于「每题 4 秒且不超过限时」的下限，答对清零（仍可按 0 分档结算），挡脚本。
- **只发一次**：交卷用 `UPDATE trial_run ... WHERE status = 'active'` 抢占；断网重试命中
  `already`，返回首次结果，不重复发奖。发奖失败把状态改回 `active` 让用户能重交。
- 活动结束后仍可交卷：只要这局属于当前轮次（`activityKey` 为开始时间），按开局时的配置结算。

## 奖励与配置

默认 `questionCount = 5`、`timeLimitSeconds = 120`、`dailyRuns = 3`、`runPriceCredits = 5`、
券单价 `5 cr`，档位 2/3/4/5 题 → 1/2/4/8 tcr，奖励 `rewardValidDays` 天内有效。

后台可改题数（≤ 10）、限时（≥ 15 秒）、每日局数、票价、券单价、有效期与档位；
`tiers` 按答对题数升序去重，越界档位由 `sanitizeTrialConfig` 丢弃。
