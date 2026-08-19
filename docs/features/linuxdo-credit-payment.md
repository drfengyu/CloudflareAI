# LinuxDO Credit（积分）支付接入指南

> 功能状态：已实现（2026-08-19）
> 官方文档：https://credit.linux.do/docs/api （本仓库同步存档：`docs/creditapi.md`）

## 1. 功能概述

钱包支持使用 **LinuxDO 积分（Credit）** 在线充值，用户选择「LinuxDO 积分」渠道后跳转到 `credit.linux.do` 认证界面，支付成功后平台异步回调，系统验签、幂等发放永久余额。

### 采用协议：易支付兼容接口

LinuxDO Credit 提供两种协议：

| 协议 | 签名方式 | type | 说明 |
| --- | --- | --- | --- |
| 官方 LDC 接口 | Ed25519 非对称 | `ldcpay` | 需要商户 Ed25519 密钥对，更安全 |
| **易支付兼容接口** | **MD5（密钥拼接）** | `epay` | **本项目采用**，与既有彩虹易支付协议完全一致 |

选易支付兼容接口的原因：签名算法、下单/回调/查询流程与项目里已有的 `lib/payment/epay.ts` 完全一致，可直接复用订单表、幂等结算、对账与定时任务，改动最小、风险最低。

## 2. 前置条件（在 credit.linux.do 上操作）

官方集市中心：https://credit.linux.do/merchant（需要先登录 LINUX DO 账号，且账号有可用的积分）。

### 步骤 1：创建应用

1. 打开 **集市中心** https://credit.linux.do/merchant
2. 点击右上角 **「创建应用」** 按钮
3. 填写应用信息（以本项目生产域名为例）：

| 字段 | 填写内容 |
| --- | --- |
| 应用名称 | `浅梦AI服务平台`（可自定义） |
| 应用主页 | `https://cloudai.fuwari.fun` |
| 回调地址（return_url） | `https://cloudai.fuwari.fun/wallet`（支付成功回跳页） |
| 通知地址（notify_url） | `https://cloudai.fuwari.fun/api/pay/linuxdo/notify` |

> 本项目下单时会传订单级 `notify_url`/`return_url` 覆盖应用配置，因此应用级回调地址填对即可，不填也能用。

### 步骤 2：获取 API 凭证

1. 在集市中心**顶部右侧的选择器**中选中刚创建的应用
2. 在 **「API 配置」** 面板中查看两项凭证：
   - `Client ID` → 对应本系统设置的 **Client ID (PID)**
   - `Client Secret` → 对应本系统设置的 **Client Secret (KEY)**

> `Client Secret` 用于签名验证，**妥善保管，切勿泄露**，也不要提交到 git。

### 步骤 3：在本系统后台填写配置

路径：登录本系统管理员 → 侧边栏 **系统设置** → **在线充值（LinuxDO 积分）**

| 本系统设置项 | 填写内容 |
| --- | --- |
| 启用 LinuxDO 积分支付 | 勾选 |
| 网关地址 | `https://credit.linux.do/epay`（默认值即可） |
| Client ID (PID) | 步骤 2 的 `Client ID` |
| Client Secret (KEY) | 步骤 2 的 `Client Secret` |
| 汇率 (1 积分 = ? cr) | 例如 `1`（1 积分到账 1 cr） |
| 最低/最高充值（积分） | 例如 `1` / `1000` |

保存后钱包充值弹窗即出现「LinuxDO 积分」按钮，用户选择后跳转 `credit.linux.do` 认证界面完成支付。

> 协议说明：本实现采用 LinuxDO 的 **易支付兼容接口**（`type=epay`，MD5 签名），与官方文档「3.3 快速集成 New API」一致，只是把 New API 的 `epay/notify` 换成我们的 `/api/pay/linuxdo/notify`。

### 注意事项

- **收费/手续费**：积分流转手续费为**动态费率**，由**服务方（收款方）**承担——即用户支付的积分会有部分作为手续费，实际到账少于面额，请自行评估充值汇率。
- **消费方**：付款用户需拥有 linux.do 账号且有足够积分，通过 LINUX DO Connect (OAuth) 认证后完成支付。
- **争议处理**：平台支持服务方与消费方的双向争议处理。

## 3. 后台配置（本系统）

路径：登录管理员账号 → 侧边栏 **系统设置** → **在线充值（LinuxDO 积分）**。

| 设置项 | 说明 | 默认值 |
| --- | --- | --- |
| 启用 LinuxDO 积分支付 | 开关，关闭时钱包不显示该渠道 | 关 |
| 网关地址 | LinuxDO 网关基址（不带结尾斜杠） | `https://credit.linux.do/epay` |
| Client ID (PID) | LinuxDO 控制台创建的 `pid` | 空 |
| Client Secret (KEY) | LinuxDO 控制台创建的 `key` | 空 |
| 汇率 (1 积分 = ? cr) | 充值到账的 credits 换算比例 | 1 |
| 最低充值（积分） | 单笔最低积分 | 1 |
| 最高充值（积分） | 单笔最高积分 | 1000 |

保存后钱包充值弹窗会多出「LinuxDO 积分」按钮（仅在启用时显示）。

设置存储在 D1 `option` 表：`ldpay_enabled` / `ldpay_api_url` / `ldpay_pid` / `ldpay_key` / `ldpay_rate` / `ldpay_min` / `ldpay_max`。

## 4. 业务流程

```
钱包 → 选「LinuxDO 积分」→ 立即支付
  │ createPayOrder(channel=linuxdo)
  │  ├─ 限流（每用户 1 分钟 5 单）＋ 渠道白名单校验
  │  ├─ createRechargeOrder：按 ldpay_rate 锁定额度，写 payment_order（channel=linuxdo, status=0）
  │  └─ buildLinuxdoPayUrl：type=epay + MD5 签名 → 302/跳转 submit.php
  ▼
credit.linux.do 认证界面 → 用户确认支付
  │
  ├─ 异步回调（GET /api/pay/linuxdo/notify，最多重试 5 次）
  │  └─ 验签 + pid/金额校验 → settleRechargeOrder（幂等发放永久余额 + topup 流水）
  │
  └─ 回跳 /wallet?paid=1&orderNo=xxx
      └─ 订单卡片轮询 checkOrderStatus（4s 一次，待支付时触发服务端对账）

兜底：Vercel Cron 每日 03:00 对账（/api/cron/reconcile-orders，Hobby 套餐限制每日一次；钱包页 4s 轮询为实时兜底）→ reconcileOrder 按 channel 查询真实状态并补发/关闭。
```

### 下单（`/epay/pay/submit.php`）

方法 `POST`，本项目将参数放入 URL 后跳转（与易支付一致）。

| 参数 | 值 |
| --- | --- |
| pid | LinuxDO `pid` |
| type | `epay` |
| out_trade_no | 订单号（`TU` + 时间戳 + 随机串） |
| name | `AI 平台充值` |
| money | 积分数量，保留 2 位小数（如 `10.00`） |
| notify_url | `https://cloudai.fuwari.fun/api/pay/linuxdo/notify` |
| return_url | `https://cloudai.fuwari.fun/wallet?paid=1&orderNo=xxx` |
| device | `web` |
| sign | MD5 签名 |
| sign_type | `MD5` |

### 签名算法（易支付兼容）

```text
1. 取所有非空参数，排除 sign、sign_type
2. 按参数名 ASCII 升序排序，拼接 k1=v1&k2=v2...
3. 末尾直接追加 Client Secret：payload = k1=v1&k2=v2 + SECRET
4. sign = md5(payload)（小写十六进制）
```

示例（本仓库 `lib/payment/epay.ts` 的 `epaySign` 与 `epayVerify` 直接复用）：

```js
payload = "money=10.00&name=AI 平台充值&out_trade_no=TUxxx&pid=1001&type=epay"
sign    = md5(payload + SECRET)   // 小写 hex
```

### 异步回调（`/api/pay/linuxdo/notify`）

- LinuxDO 以 **HTTP GET** 通知（本实现同时兼容 POST 表单）。
- 验签通过、`pid` 匹配、金额相符、`trade_status=TRADE_SUCCESS` 时执行幂等发放。
- 应用需返回 **HTTP 200 + 响应体 `success`**（大小写不敏感），否则平台重试（最多 5 次）。
- 幂等：`settleRechargeOrder` 用 `UPDATE ... WHERE orderNo=? AND status=0` 原子抢占，重复回调不会重复发放。

### 订单查询 / 对账（`/epay/api.php`）

- `GET /epay/api.php?act=order&pid=..&key=..&out_trade_no=..`
- 响应：`code=1` 且 `status=1` 表示支付成功；`status=0` 表示失败/处理中；订单不存在返回 HTTP 404 `{"code":-1,"msg":"服务不存在或已完成"}`。
- 本系统通过 `queryLinuxdoOrder` 在对账时主动查询，回调丢失也能兜底到账/关闭。

## 5. 代码结构

| 文件 | 职责 |
| --- | --- |
| `lib/payment/linuxdo.ts` | LinuxDO 配置读取、下单 URL 构建、订单查询（复用 `epaySign`/`epayVerify`） |
| `lib/payment/order.ts` | 渠道感知：按 `channel` 选汇率与校验；`reconcileOrder` 按渠道分发查询；幂等结算 |
| `app/api/pay/linuxdo/notify/route.ts` | 异步回调（GET+POST），验签 → 结算 |
| `app/(dashboard)/wallet/actions.ts` | `createPayOrder` 支持 `linuxdo` 渠道；`checkOrderStatus` 对账 |
| `app/(dashboard)/wallet/page.tsx` | 读取 LinuxDO 配置，传给充值弹窗 |
| `app/(dashboard)/wallet/redeem-code-dialog.tsx` | 充值弹窗新增「LinuxDO 积分」渠道按钮与单位（积分） |
| `app/(dashboard)/wallet/recharge-orders-card.tsx` | 订单卡片渠道文案（LinuxDO 积分） |
| `app/(dashboard)/admin/settings/*` | 后台配置：`LinuxdoSettingsForm` + `updateLinuxdoSettings` |
| `app/(dashboard)/admin/orders/orders-table.tsx` | 管理端订单渠道文案 |

订单数据沿用 `payment_order` 表，`channel` 字段新增 `linuxdo` 取值（原有 `alipay`/`wechat`/`qqpay` 不变）；对账/关闭/定时任务均为渠道感知，无需迁移。

## 6. 验证方式

已通过以下验证（2026-08-19）：

1. **下单链路**：临时启用 LinuxDO 配置 → 钱包弹窗出现「LinuxDO 积分」按钮 → 金额单位切换为「积分」→ 点「立即支付」生成订单，`payment_order` 落库（`channel=linuxdo`，10 积分 → 10 cr），跳转 URL 指向 `credit.linux.do/epay/pay/submit.php?type=epay&pid=1001&sign_type=MD5&notify_url=.../api/pay/linuxdo/notify`。
2. **回调链路**：构造合法签名的 GET 通知 → 返回 `200 success` → 订单状态 0→2（已到账）、写入 `tradeNo`、生成 +10cr topup 流水。
3. `npm run typecheck` 通过；改动文件 lint 通过。

## 7. 注意事项 / 常见问题

- **密钥安全**：`ldpay_key` 存于 D1 `option` 表，仅服务端使用；勿泄露到前端或提交到 git。
- **金额口径**：`payment_order.amountCny` 对 LinuxDO 订单存的是**积分数量**，credits 按 `ldpay_rate` 锁定；回调以订单金额为准校验（差值 >0.01 拒绝）。
- **回调丢失**：钱包订单卡片轮询 + Vercel Cron 定时对账双兜底。
- **订单有效期**：由 LinuxDO 平台配置 `merchant_order_expire_minutes` 决定，超时订单在平台上不可再支付，本系统对账时按 `TRADE_CLOSED`/查无此单处理关闭。
- **常见平台错误**（`error_msg`）：`不支持的请求类型`（type 非 epay）、`签名验证失败`（拼串或密钥不符）、`金额必须大于0`/`积分小数位数不能超过2位`、`订单已过期`、`订单不存在或已完成`、`余额不足`。
- **无法支付时**：优先检查 `ldpay_enabled`、`pid`/`key` 是否正确、金额是否在 min/max 范围、签名是否随金额变化重新计算。
- **计费不变式**：充值发放的是**永久余额**（`user.balanceCredits`），写入 `topup`（type=5），与易支付一致，不会违反既有计费口径。

## 8. 参考

- 官方 API 文档：https://credit.linux.do/docs/api
- 本仓库存档：`docs/creditapi.md`
- 使用说明：https://credit.linux.do/docs/how-to-use
