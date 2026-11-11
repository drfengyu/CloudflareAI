# 每日 / 每周任务与活跃度里程碑

**版本**：v0.32.0（v0.40.0 调整消费门槛单位与里程碑奖励口径） · **状态**：代码已上线，**默认关闭**，开关在「后台 → 系统设置 → 任务成就奖励」

## 设计取舍

任务清单**写在代码里**（`lib/tasks/tasks.ts` 的 `DAILY_TASKS` / `WEEKLY_TASKS`），后台只决定开不开与奖励有效期。
理由：每个任务的「完成判定」本来就是读各业务表现场数据，做成可配置就得连查询表达式一起配置——
收益为零，风险是配出一个永远达不成的任务。后台不再提供逐任务额度（v0.10.0 的 `task_reward_overrides` 已废弃）。

**进度不落库**。每次进页面并发跑各任务的 `COUNT` / `SUM` 取现场进度，只有「领过哪些任务」写
`activity_task_claim`，所以不存在状态同步这回事，改任务口径也不需要回填历史。

## 每日任务（合计 100 活跃度）

| key | 任务 | 判定 | 活跃度 |
| --- | --- | --- | --- |
| `daily_checkin` | 每日签到 | 今天签到 1 次 | 10 |
| `daily_chat` | 站内对话 3 次 | `chat_message.role=user`（按会话归属）≥ 3 | 15 |
| `daily_api` | API 成功调用 5 次 | `usage_log.status=ok` ≥ 5 | 20 |
| `daily_spend` | 消费满 50 tcr | 当日 `usage_log.creditsUsed` 合计 ≥ 50（tcr 消费计入） | 20 |
| `daily_activity` | 参与限时玩法 | 转盘 / 翻牌 / 雷电任一局 | 15 |
| `daily_inbox` | 领取站内信奖励 | 当日领取任意带附件站内信 | 20 |

## 每周任务（合计 300 活跃度）

| key | 任务 | 判定 | 活跃度 |
| --- | --- | --- | --- |
| `weekly_checkin` | 本周签到 5 天 | 一周内签到 5 个自然日 | 40 |
| `weekly_chat` | 站内对话 20 次 | 本周提问 ≥ 20 | 40 |
| `weekly_api` | API 成功调用 50 次 | 本周成功调用 ≥ 50 | 50 |
| `weekly_spend` | 本周消费满 500 cr | 本周消耗 ≥ 500 cr | 60 |
| `weekly_activity` | 参与限时玩法 10 局 | 三种玩法合计 ≥ 10 局 | 50 |
| `weekly_topup` | 本周充值到账 500 cr | 兑换码 + 在线充值 ≥ 500 cr | 60 |

周期按北京时间：每日 0 点重置；每周一 0 点重置（`weeklyStartDate` 用纯墙钟日期运算，跨年也正确）。

## 领取与里程碑

- 任务完成后必须**手动领取活跃度**：`claimTask` 先重算进度，再 `INSERT OR IGNORE` 进
  `activity_task_claim`（唯一索引 `uq_activity_task_claim`），重复点击被挡下。
- 活跃度跨过里程碑时**自动发站内信**，不用手动点「发奖」；站内信里再点领取才到账。

| 周期 | 里程碑 | 奖励区间 |
| --- | --- | --- |
| 每日 | 25 / 50 / 75 / 100 | 5–15 / 10–30 / 20–50 / 40–100 tcr |
| 每周 | 50 / 100 / 150 / 200 / 250 / 300 | 20–50 / 40–100 / 70–160 / 110–240 / 160–340 / 240–500 tcr |

里程碑奖励**只发临时货币 tcr**（v0.40.0 起不再掺永久货币），金额在区间内随机，
有效期 `tasks_valid_days`（默认 30 天）。发信占位写 `reward_claim`
（`activityKind=activity`，`tierKey=周期:周期键:活跃度`），唯一索引挡重复与并发。
历史站内信里的永久货币附件不受影响，仍按原附件类型领取。

## 涉及文件

| 层 | 文件 |
| --- | --- |
| 表 / 迁移 | `lib/db/schema.ts`（`activityTaskClaims` / `rewardClaims`）、`migrations/023_activity_currency.sql` |
| 逻辑 | `lib/tasks/tasks.ts` |
| 配置 | `lib/settings/index.ts` → `getTaskSettings()`，键 `tasks_enabled` / `tasks_valid_days` |
| 页面 | `app/(dashboard)/tasks/{page,actions}.tsx`、`components/tasks/task-board.tsx` |
| 后台 | `app/(dashboard)/admin/settings/settings-form.tsx` → `TaskSettingsForm`（开关 + 有效期） |
| 站内信 | `lib/message/messages.ts`（`temp_credits` / `credits` 附件与领取） |
| 账本 | `lib/billing/ledger.ts`（type=9 归「赠送与返利」） |

## 验证

`tests/activity-currency.test.ts` 覆盖：每日任务合计 100、每周合计 300、周一起算日期、
里程碑区间边界，以及随机奖励只发 tcr（`kind=temp_credits`、label 以 tcr 结尾）。
`npm run typecheck`、`npm run build` 通过。
生产迁移 023 只新增两张空表与两个带默认值的 `reward_claim` 列，不回填、不改历史数据。
