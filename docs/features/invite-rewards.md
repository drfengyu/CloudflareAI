# 邀请返利设计文档

> v0.8.0 新增。迁移：`migrations/015_invite_rewards.sql`（已在线上 D1 执行）。

## 功能概述

每个账号有一个邀请码，好友通过 `/register?ref=<code>` 注册成功后，邀请人与被邀请人各获得一笔永久余额奖励，
并记入钱包充值记录（`topup type=7`）。

## 数据库

### user 新增列

| 列 | 说明 |
|----|------|
| `inviteCode` | 12 位小写十六进制，唯一。存量账号通过 `ensureInviteCode()` 在首次打开邀请页时补发 |
| `invitedBy` | 邀请人 userId，仅邮箱注册且携带有效邀请码时写入 |

### invite_record 表

```sql
CREATE TABLE invite_record (
  id TEXT PRIMARY KEY,
  inviterId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  inviteeId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  inviterReward REAL NOT NULL DEFAULT 0,
  inviteeReward REAL NOT NULL DEFAULT 0,
  createdAt INTEGER
);
CREATE UNIQUE INDEX uq_invite_record_invitee ON invite_record(inviteeId);
CREATE INDEX idx_invite_record_inviter ON invite_record(inviterId, createdAt);
```

- `inviteeId` 唯一：一个账号只能被邀请一次。
- 奖励金额在注册当时锁定，之后改后台配置不影响历史记录。
- 命中邀请人每日上限时，该行 `inviterReward = 0`，仍保留归因关系。

## 配置项（option）

| Key | 默认 | 说明 |
|-----|------|------|
| `invite_enabled` | `"true"` | 是否发放邀请奖励（关闭后链接仍可注册，只是不发奖） |
| `invite_reward_inviter` | `"300"` | 邀请人奖励 cr |
| `invite_reward_invitee` | `"200"` | 被邀请人奖励 cr |

后台入口：`/admin/settings` →「邀请奖励」。

## 注册链路

1. `app/(auth)/register/page.tsx` 读取 `searchParams.ref`，透传给 `AuthForm` 的隐藏字段 `ref`。
2. `registerAction` 校验邀请码：用户存在且 `status=1`、功能开关打开、邀请人邮箱 ≠ 注册邮箱；
   任一不满足按普通注册处理。
3. `createCredentialUser` 写入 `inviteCode`（新码）与 `invitedBy`。
4. `grantInviteRewards`（`lib/invite/rewards.ts`）：
   - 统计邀请人 24 小时内已获奖励次数，≥ `INVITE_DAILY_REWARD_LIMIT`（10）则邀请人奖励为 0；
   - 写 `invite_record`；
   - 双方 `user.balanceCredits` 增加，各写一条 `topup type=7`；
     邀请人描述为 `邀请 v***@example.com 注册奖励`，被邀请人为 `受邀注册奖励`。
5. 奖励发放失败只打日志、不回滚账号（归因仍可从 `user.invitedBy` 追溯）。

## 页面

`/invite`（侧边栏「邀请好友」）：邀请码 / 链接（一键复制）、邀请数据（已邀请数 / 累计奖励）、
奖励规则、最近 20 条邀请（邮箱按 `maskEmail` 打码，显示单次邀请人奖励）。
链接 origin 由 `getRequestOrigin()` 从请求头推导，本地与线上各自正确。

## 限制

- 注册 IP 限流：24 小时内最多 3 次（`registration_log` 计数）。
- 邀请人 24 小时奖励上限 10 次（按 `invite_record.createdAt` 统计）。
