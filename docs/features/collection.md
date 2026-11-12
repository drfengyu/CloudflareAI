# 限时活动·星匣图鉴（v0.42.0）

盲盒 / 图鉴收集玩法：三个星匣各 6 件藏品，开匣先等概率选星匣、再按条目权重抽藏品；
重复藏品折算星尘，星尘可以**定向兑换任意未收集的藏品**——保底不靠隐藏概率，缺什么补什么。

- 前台：`/collection`（侧边栏「星匣图鉴」，活动中心默认展示）
- 后台：系统设置 → 「限时活动（星匣图鉴）」
- 配置键：`option.collection_config`（界面按字段拆成数字输入框，管理员不写 JSON）
- 账本：`topup.type = 19`（集齐奖励只发 tcr；开匣票价在券兑换 / 礼包时已按 type=15 记过支出）
- 表：`collection_state`（迁移 `migrations/028_new_activity_games.sql`）
- 集齐幂等：`activity_milestone` 唯一索引 `(userId, activityKind, activityKey, tierKey)`，
  `tierKey = set:<星匣 key>`

## 玩法

1. 星匣固定在 `COLLECTION_SETS`：极光 / 深海 / 古树，各 6 件藏品，条目权重 100/100/80/60/35/15。
2. 「开启星匣」按 `openCostCredits` 扣当期星匣券；先等概率选一个星匣，再按匣内权重抽一件。
3. 首次抽到收录进图鉴；重复抽到折算 `duplicateDust` 星尘。
4. 星尘达到 `dustPerItem` 可定向兑换**任意未收集**的藏品（已收录 / 已集齐的星匣会被拒绝）。
5. 集齐一个星匣发一次 tcr（`setRewards`），页面显示各匣进度与「补领」。
6. 每日最多 `dailyBoxes` 次，按北京时间自然日统计。

## 并发与补偿

- 已收录列表、星尘、当日开匣数整体存 `collection_state.state` JSON，写入用 `WHERE version = ?`
  乐观锁；CAS 连续 3 次失败或撞到每日上限时退回券。
- 集齐判定在状态写成功后按全量已收录重算（`completedSets`），先占 `activity_milestone`
  唯一键再发 tcr；失败删占位行，重试不会重复发。
- 星尘兑换不扣活动券，只扣星尘；兑换后同样立即结算集齐奖励。

## 配置

默认每日 10 次、单次 2 cr、券单价 2 cr、重复折算 2 星尘、定向兑换 12 星尘，
集齐奖励极光 / 深海 / 古树 = 8 / 15 / 30 tcr，奖励 `rewardValidDays` 天内有效。
后台可改次数、票价、券单价、有效期、星尘参数与三个星匣的集齐奖励；未知星匣键被忽略，
缺失的奖励行按默认补齐，避免只改一行导致其余匣集齐后没有奖励。
