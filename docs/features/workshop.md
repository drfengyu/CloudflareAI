# 限时活动·灵宠工坊（v0.42.0）

合成 / 养成玩法：花活动券采集 1~3 阶灵宠，**两只同阶合成一只高一阶**，任意一条养成线
首次达到配置阶位时发一次 tcr。合成是确定性的，不会失败也不花券，随机只发生在采集这一层，
权重直接写在页面上。

- 前台：`/workshop`（侧边栏「灵宠工坊」，活动中心默认展示）
- 后台：系统设置 → 「限时活动（灵宠工坊）」
- 配置键：`option.workshop_config`（界面按字段拆成数字输入框，管理员不写 JSON）
- 账本：`topup.type = 18`（里程碑只发 tcr；采集票价在券兑换 / 礼包时已按 type=15 记过支出）
- 表：`workshop_state`（迁移 `migrations/028_new_activity_games.sql`）
- 里程碑幂等：`activity_milestone` 唯一索引 `(userId, activityKind, activityKey, tierKey)`

## 玩法

1. 三条养成线（焰尾狐 / 潮汐鲸 / 森语鹿）各 9 阶，阶位名固定在 `WORKSHOP_LINES`。
2. 「采集一次」按 `gatherWeights` 抽 1~3 阶，扣一次 `gatherCostCredits` 的当期工坊券；
   三条线共用每日 `dailyGathers` 次数。
3. 两条同阶可合成一条高一阶（1~8 阶可合成，第 9 阶是终点），合成不消耗活动券、不会失败。
4. 任意一条线达到 `milestones` 里的阶位，各发一次 tcr（`tierKey = tier:N`），页面显示进度与「补领」。

## 并发与补偿

- 状态（三条线的 9 格数量 + 当日采集数）整体存 `workshop_state.state` JSON，读写用
  `WHERE version = ?` 乐观锁；并发采集 / 合成只有一个能推进，另一个提示刷新。
- 采集先扣券再写状态：CAS 连续 3 次失败或撞到每日上限时，`refundCouponPayment` 退回券。
- 里程碑先 `INSERT OR IGNORE` 占住 `activity_milestone` 唯一键再发 tcr；发奖失败删掉占位行，
  不会出现「标记已领但钱没到」。

## 配置

默认每日 20 次、单次 2 cr、券单价 2 cr、权重 60/30/10、里程碑 3/5/7/9 阶 → 6/15/30/80 tcr，
奖励 `rewardValidDays` 天内有效。后台可改次数、票价、券单价、有效期、三档权重与任意阶位里程碑；
权重全为 0 时回退默认，阶位越界 / 重复由 `sanitizeWorkshopMilestones` 丢弃。
