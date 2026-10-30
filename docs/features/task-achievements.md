# 任务成就一次性奖励

**版本**：v0.10.0 · **状态**：代码已上线，**默认关闭**，开关在「后台 → 系统设置 → 任务成就奖励」

## 设计取舍

任务清单**写在代码里**（`lib/tasks/tasks.ts` 的 `TASKS`），后台只决定三件事：开不开、临时余额给几天、
按任务 key 覆盖一次性额度。理由：每个任务的「完成判定」本来就是读各业务表的现场数据，
把它做成可配置就得连查询表达式一起配置——收益为零，风险是配出一个永远达不成的任务。

**进度不落库**。`listTasks` 一次读 `user_task` 拿到「领过哪些」，再并发跑 7 条 `COUNT` 取现场进度，
所以不存在「状态同步」这回事，改任务口径也不需要回填历史。

## 清单与默认额度

| key | 任务 | 判定 | 默认 |
| --- | --- | --- | --- |
| `first_chat` | 第一次站内对话 | `chat_message`（`role=user`，按 `chat_session.userId` 归属）≥ 1 | 5 cr |
| `first_api` | 跑通一次 API | `usage_log` 中 `status=ok` 且 `channel ∈ (openai, anthropic)` ≥ 1 | 10 cr |
| `first_topup` | 第一次充值 | `topup.type ∈ (1, 5)` ≥ 1 | 10 cr |
| `checkin_streak` | 累计签到 7 天 | `checkin` 行数 ≥ 7 | 15 cr |
| `invite_first` | 邀到第一位朋友 | `invite_record.inviterId` ≥ 1 | 20 cr |
| `lottery_first` | 第一次转盘抽奖 | `lottery_draw` ≥ 1 | 5 cr |
| `cashback_first` | 领到第一笔消费返利 | `cashback_claim` ≥ 1 | 5 cr |

后三项刻意挂在别的活动上，让签到 / 邀请 / 抽奖 / 返利互相引流；总默认发放 70 cr，比一次在线充值的最小档还小。

`first_api` 只算走 OpenAI / Anthropic 兼容口的成功调用——站内 `/chat` 与 playground 记的是 `channel='web'`，
不计入这一项，否则「跑通 API」这个目标就形同虚设。

## 发放与防重放

与消费返利同一套写法：`claimTask` 先插 `user_task` 占住 `uq_user_task(userId, taskKey)`，
再写临时余额 + `topup.type=9` 流水；发放失败就把占位删掉，避免这一天被唯一索引永久挡死。
领取时服务端**重算一次进度**，前端的可领状态只是提示，不是判据。
实发额度快照进 `rewardCredits`，之后后台改数不影响历史。

## 涉及文件

| 层 | 文件 |
| --- | --- |
| 表 / 迁移 | `lib/db/schema.ts`（`userTasks`）、`migrations/018_user_task.sql`（已在线上 D1 执行） |
| 逻辑 | `lib/tasks/tasks.ts` |
| 配置 | `lib/settings/index.ts` → `getTaskSettings()`，键 `tasks_enabled` / `tasks_valid_days` / `task_reward_overrides` |
| 页面 | `app/(dashboard)/tasks/{page,actions}.tsx`、`components/tasks/task-list.tsx`、`components/dashboard/sidebar.tsx` |
| 后台 | `admin/settings/settings-form.tsx` → `TaskSettingsForm`（含任务 key 与默认额度对照表） |
| 账本 | `lib/billing/grant-expiry.ts`（type=9 到期过滤）、`wallet/topup-records-card.tsx`（标签） |

## 实测（2026-10-30）

一次性脚本对 `test@example.com` 走完整链路：`first_api` 进度 1/1 → 领取 → 新增 1 行临时余额（10 cr，30 天到期）
+ 1 行 `topup type=9`（10 cr）+ 1 行 `user_task`；立刻重复领取被服务端挡下（`该任务奖励已领取`）；
按 id 删掉这 3 行后与基线逐张表对齐，残留 0 行。**脚本只在进程内把 `enabled` 当作 true，没有写 `option` 表**，
线上开关仍是关闭态。页面关闭态由 `tests/e2e/v010-activities.spec.ts` 覆盖（1 passed）。
