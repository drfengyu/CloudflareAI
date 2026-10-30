# 充值阶梯赠送

**版本**：v0.10.0 · **状态**：代码已上线，**默认关闭**，开关在「后台 → 系统设置 → 充值阶梯赠送」

## 口径

按订单**实付金额**取「能满足的最高一档」发一次固定额度，**不叠加**（`pickBonusCredits`）。
档位是后台的一段 JSON：`[{"minCny":50,"bonus":200},{"minCny":100,"bonus":600}]`，最多 20 档，
读侧统一走 `sanitizeBonusTiers`（丢非数字、按门槛去重、升序），管理员手填脏值不会算出可用数以外的结果。

`minCny` 与订单 `amountCny` 同口径：支付宝 / 微信是元，LinuxDO 积分通道就是积分数。
充值弹窗里那张档位表因此对两种通道都成立，不需要分开配。

**赠送进临时余额**（有效期 `recharge_bonus_valid_days`，默认 30 天），不并进永久余额：
付费用户的主充值本来就是永久的，赠送带期限既能做促销又不让存量无限堆积。
钱包流水记 `type=10`，已在 `lib/billing/grant-expiry.ts` 的 CASE / NOT IN 登记。

## 发放时机与失败面

挂在 `settleRechargeOrder` 的**「抢占成功」分支**里（步骤 5，完成订单之前）：
重复回调进不到这个分支，所以不需要额外幂等键；发放整段包在 `try/catch` 里，
**赠送失败绝不回滚主充值**——用户的钱已经到账，顶多少送一笔，不能因此把充值也变成未到账。
结算返回值多了 `bonus?: number`，回调与管理端手动补发都能看到实际赠送额。

## 涉及文件

| 层 | 文件 |
| --- | --- |
| 逻辑 | `lib/payment/bonus.ts`（`getRechargeBonusSettings` / `pickBonusCredits` / `grantRechargeBonus`） |
| 接入 | `lib/payment/order.ts`（`settleRechargeOrder` 步骤 5） |
| 配置 | `option` 键 `recharge_bonus_enabled` / `recharge_bonus_tiers` / `recharge_bonus_valid_days` |
| 界面 | `app/(dashboard)/wallet/redeem-code-dialog.tsx`（选金额时实时预告「本单额外赠送 X cr」+ 档位表）、`wallet/page.tsx` 传参 |
| 后台 | `admin/settings/settings-form.tsx` → `RechargeBonusSettingsForm` |
| 账本 | `lib/billing/grant-expiry.ts`、`wallet/topup-records-card.tsx`（标签） |

## 验证状态（如实记录）

- 读侧与界面：`/wallet` 已实测渲染（活动关闭时不出现赠送提示，`tests/e2e/v010-activities.spec.ts` 断言）。
- 发放侧：`grantRechargeBonus` **未在真实订单上端到端跑过**——那需要临时把 `recharge_bonus_enabled` 写成 true，
  属于线上活动配置改动，按约定留给管理员在后台自行开启。写库形状（临时余额 + `type=10` 流水）与任务奖励同构，
  后者已按完整链路验证并还原。
