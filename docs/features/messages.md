# 站内信系统（v0.27.0）

## 用途

- 系统 / 管理员给单个用户发通知（维护公告、补偿说明等）。
- 带附件的奖励信：cr 余额、抽奖券、兑换码、自定义物品 / 凭证。
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
| `attachmentKind` | `credits` / `tickets` / `redemption` / `item`，可空 |
| `attachment` | JSON：`{"credits":50}`、`{"count":2}`、`{"code":"..."}`、`{"label":"..."}` |
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
删掉等于把奖励吞了，这类信只能领取或由用户自己删。用户可在收件箱里随时手删任意一封。

## 管理端：重置密码而不是查看

`users.passwordHash` 是 bcrypt 单向哈希，任何接口都还原不出原密码，所以用户管理里只提供重置：

- 留空自动生成 12 位可读密码（排除 `O0Il1`，保证大小写 + 数字）；也可手填 8–72 位。
- 明文只在对话框里显示一次，关掉即不可再取；库里只存新哈希。
- 可选「发站内信通知」（默认开）与「在正文里附上新密码」（默认关，开启后明文会落库，
  随信在读过 3 天后删除）。
- 权限：管理员（role 10）可重置普通用户；重置另一个管理员账号需要超管（100）—— 管理员之间互相改密等于提权通道。
- 用户侧 `/settings` 可自助改密：有密码先验当前密码，改完给自己发一封安全提示；
  LinuxDO / OAuth 注册的无密码账号走「设置密码」分支。

## 相关文件

- `lib/message/messages.ts` — 数据层与附件语义
- `app/(dashboard)/messages/` — `/messages` 页面、`inbox.tsx` 主从布局、server actions
- `components/dashboard/message-bell.tsx` — 顶栏铃铛
- `app/(dashboard)/admin/users/actions.ts` — `resetUserPassword` / `sendUserMessage`
- `app/(dashboard)/settings/password-form.tsx` — 自助改密
- `app/api/cron/purge-messages/route.ts` — 清理任务
