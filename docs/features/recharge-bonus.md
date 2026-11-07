# 限时充值活动（充值阶梯赠送）

**版本**：v0.32.0 · **状态**：代码已上线，**默认关闭**，开关在「后台 → 系统设置 → 充值阶梯赠送」

活动开始 / 结束日期同时是「限时消费返利」的统计窗口（见 `docs/features/cashback.md`），后台只配这一份日期。

## 口径

按**活动期内累计实付**判定档位：活动开始日期 00:00（北京）到结束日期次日 00:00 之间、
状态为已完成的在线充值订单（`payment_order.status = 2`）按 `amountCny` 求和。
累计达到几档，就**每档各能领一次**，不是只取最高一档，也不按单笔订单重复计算。
`minCny` 与订单 `amountCny` 同口径：支付宝 / 微信是元，LinuxDO 积分通道就是积分数。

后台**逐档填数字**（每档「实付满 / 赠送 cr」两个输入框，可添加可删除，最多 20 档），
同时配置活动开始日期、结束日期（留空表示长期开放）与赠送有效期。库里存的是
`[{"minCny":50,"bonus":200},{"minCny":100,"bonus":600}]` 这样的 JSON，但管理员不需要也不应该看到它。
读侧统一走 `sanitizeBonusTiers`（丢非数字、按门槛去重、升序），保存时若两档写了同一个门槛会直接报错。

## 发放与到账

奖励**不再随订单自动到账**（`settleRechargeOrder` 已移除自动赠送，避免与手动领取重复发放）：

1. 用户在「限时返利」页（`/cashback`）的充值卡片里，对已达标档位点「发放到站内信」；
2. 服务端重新校验活动状态、累计金额与档位，写一条 `reward_claim` 占住发放位
   （唯一索引 `uq_reward_claim(userId, activityKind, tierKey)` 挡双击 / 并发）；
3. 发一封带 `temp_credits` 附件的站内信；
4. 用户在站内信点「领取」，才写入**临时余额**（有效期 `recharge_bonus_valid_days`，默认 30 天）
   与钱包流水 `type=10`，并回写 `reward_claim.claimedAt`。

活动页区分「未达标 / 可发放 / 已发到站内信 / 已领取」，已发放但未领取的附件不会被 cron 清理。
临时余额不并进永久余额：付费用户的主充值本来就是永久的，赠送带期限既能做促销又不让存量无限堆积。
`tierKey` 取门槛金额的规范字符串（`normalizeTierKey`），改赠送额度不影响已发记录，改门槛就是另一档。

## 涉及文件

| 层 | 文件 |
| --- | --- |
| 逻辑 | `lib/payment/bonus.ts`（设置读取 / 档位裁剪）、`lib/rewards/claims.ts`（累计、发放、幂等） |
| 表 / 迁移 | `lib/db/schema.ts`（`rewardClaims`）、`migrations/022_reward_claim.sql` |
| 站内信 | `lib/message/messages.ts`（`temp_credits` 附件，领取时写临时余额与流水） |
| 配置 | `option` 键 `recharge_bonus_enabled` / `recharge_bonus_start_date` / `recharge_bonus_end_date` / `recharge_bonus_tiers` / `recharge_bonus_valid_days` |
| 页面 | `app/(dashboard)/cashback/page.tsx`、`components/cashback/recharge-panel.tsx`、`app/(dashboard)/cashback/actions.ts` |
| 钱包 | `app/(dashboard)/wallet/redeem-code-dialog.tsx`（只提示累计档位与去活动页领取，不再预告本单赠送） |
| 后台 | `app/(dashboard)/admin/settings/settings-form.tsx` → `RechargeBonusSettingsForm` |
| 账本 | `lib/billing/ledger.ts`（type=10 归「赠送与返利」） |

## 验证状态（如实记录）

- 读侧与界面：`/wallet` 与 `/cashback` 本地实测；累计计算只读核对线上今日已完成订单与 type=10 流水均为 0，
  切换为手动领取不会重复发放历史订单。
- 发放侧：`issueRechargeTierReward` 的写库形状（`reward_claim` + `temp_credits` 站内信 + 领取后临时余额/流水）
  在本地对真实 D1 测试账号跑通；线上活动配置仍由管理员在后台自行开启。