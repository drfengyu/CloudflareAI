# 站内信系统（v0.27.0）

## 用途

- 系统 / 管理员给单个用户发通知（维护公告、补偿说明等）。
- 带附件的奖励信：cr 余额、临时余额（限时返利 / 充值奖励）、抽奖券、兑换码、自定义物品 / 凭证。
  附件不会在发信时入账，用户点「领取」才真正发放。
- 安全提示：管理员重置密码、用户自助改密、首次设置密码时自动发一封 `security` 信留痕。

## 数据模型

`message`（迁移 `migrations/021_message.sql`，schema 见 `lib/db/schema.ts` 的 `messages`）：

| 列 | 说明 |
| --- | --- |
| `id` | uuid |
| `userId` | 收件人，`ON DELETE CASCADE` |
| `kind` | `notice` / `reward` / `security` |
| `title` / `body` | 主题与正文（列表简述由正文压平后截 60 字生成，不单独存） |
| `attachmentKind` | `credits` / `temp_credits` / `tickets` / `redemption` / `item`，可空 |
| `attachment` | JSON：`{"credits":50}`、`{"credits":50,"validDays":30,"topupType":10,"rewardClaimId":"..."}`、`{"count":2}`、`{"code":"..."}`、`{"label":"..."}` |
| `sentBy` | 发信管理员，系统信为 null，`ON DELETE SET NULL` |
| `readAt` | 第一次打开的毫秒时间戳；清理的起算点 |
| `claimedAt` | 领取时间；无附件的信恒为 null |
| `createdAt` | 发送时间 |

索引：`(userId, createdAt)` 列表、`(userId, readAt)` 未读、`(readAt, claimedAt)` 清理。

## 领取与幂等

`claimMessage()` 先做条件更新抢锁：

```sql
UPDATE message SET claimedAt = ?, readAt = COALESCE(readAt, ?)
WHERE id = ? AND userId = ? AND claimedAt IS NULL AND attachmentKind IS NOT NULL
```

`changes !== 1` 说明这封信没有附件、不属于该用户或已经领过，直接抛错，不会二次入账。
入账（余额 / 券）抛错时把 `claimedAt` 回滚为 `NULL`，让用户能重试 —— 与消费返利领取同一模式。

- **cr**：`users.balanceCredits` 原子加，并写一条 `topup type=13`（1–12 已被其他来源占用）。
- **临时余额**（`temp_credits`）：写 `temporary_balance` 与 `topup`（`type` 由附件指定：8 消费返利 / 10 充值赠送），
  有效期取附件 `validDays`；若带 `cashbackDate` 同时补写 `cashback_claim` 历史行。
  领取成功后回写 `reward_claim.claimedAt`；回写失败不影响已到账的钱，活动页用站内信 `claimedAt` 兜底。
- **抽奖券**：`grantTickets(userId, count, { source: "gift", priceCredits: 0 })`。
  翻牌夺宝是按 cr 计价的局，没有券，所以这里只覆盖幸运转盘。
- **兑换码 / 自定义物品**：领取前 `readMessage` 返回空内容，领取后才返回明文，
  避免不点领取也能把码抄走。

## 清理

`purgeExpiredMessages()` 由 `/api/cron/purge-messages` 每天 4:00 UTC 调用：

```sql
DELETE FROM message
WHERE readAt IS NOT NULL AND readAt < ?
  AND (claimedAt IS NOT NULL OR attachmentKind IS NULL)
```

即「每封信读过满 3 天删除」。**带附件但还没领取的信不删** —— 用户读过却没来得及领，
删掉等于把奖励吞了。这类信用户也不能手动删除（`deleteMessage` 会拒绝并提示），
必须先领取；领取后或本来就无附件的信可随时手删。

## 管理端：重置密码而不是查看

`users.passwordHash` 是 bcrypt 单向哈希，任何接口都还原不出原密码，所以用户管理里只提供重置：

- 留空自动生成 12 位可读密码（排除 `O0Il1`，保证大小写 + 数字）；也可手填 8–72 位。
- 重置成功后密码保留到主动关闭，关闭前要求确认已保存；取消关闭或切换分区不清除，确认关闭后不再回显。
- 自动给操作者和目标用户发送安全站内信，并向目标用户邮箱发送邮件；操作者就是目标用户时站内信只发一封。
- 可选「在双方站内信和用户邮件中附上新密码」（默认关）。站内信读过 3 天后删除，邮件不会随之清理。
- 各通知独立发送；某一路失败显示警告，已重置的密码仍返回管理员，不自动重置或重复发送。
- 权限：管理员（role 10）可重置普通用户；重置另一个管理员账号需要超管（100）—— 管理员之间互相改密等于提权通道。
- 用户侧 `/settings` 可自助改密：有密码先验当前密码，改完给自己发一封安全提示；
  LinuxDO / OAuth 注册的无密码账号走「设置密码」分支。

## SMTP 邮件通知（v0.28.0）

超级管理员在「系统设置 → 邮件通知（SMTP）」填写服务器、用户名、发件邮箱、端口、连接加密与授权码后启用。
支持 TLS（通常 465）和强制 STARTTLS（通常 587），校验服务器证书，不支持明文传输。
配置存于 `option.smtp_config`，授权码使用 `API_KEY_ENCRYPTION_SECRET` 加密；该环境变量必须显式配置，不能依赖默认密钥。
密码栏留空保留已有授权码，前端只收到是否已设置的标记，不收到明文或密文；读取原配置失败时终止保存，不覆盖已有授权码。

默认不启用；未配置、无有效收件邮箱、占位地址或发送失败时，重置弹窗明确显示邮件未发送或结果未确认。
SMTP 返回成功只代表发信服务器接受，不保证进入收件箱。连接与会话有超时，不自动重试发送。

## 相关文件

- `lib/message/messages.ts` — 数据层与附件语义
- `app/(dashboard)/messages/` — `/messages` 页面、`inbox.tsx` 主从布局、server actions
- `components/dashboard/message-bell.tsx` — 顶栏铃铛
- `app/(dashboard)/admin/users/actions.ts` — `resetUserPassword` / `sendUserMessage`
- `app/(dashboard)/settings/password-form.tsx` — 自助改密
- `app/api/cron/purge-messages/route.ts` — 清理任务
