# 进程内 Map 当限流用：在 Vercel 上等于没限流

日期：2026-10-17
影响：`lib/rate-limit.ts`、`app/(dashboard)/lottery/actions.ts`、`app/(dashboard)/wallet/actions.ts`、`app/v1/*`

## 症状

`checkRateLimit()` 把计数放在模块级 `Map` 里，注释写着「适用于单进程环境如 Vercel Serverless」。
Vercel 不是单进程：每个冷启动的实例各有一份 Map，请求被分发到哪个实例就按哪个实例的计数放行。
结果是三个真金白银的动作形同虚设：

| 调用点 | 想挡什么 | 实际效果 |
|---|---|---|
| `lottery-buy:<userId>` 10 次/分 | 脚本刷买券 | 只挡住同一个实例上的连点 |
| `lottery-draw:<userId>` 12 次/分 | 连点重复开奖 | 同上，并发抽奖能同时进来好几批 |
| `pay-order:<userId>` 5 次/分 | 重复下单 | 同上 |
| `openai:/anthropic:<userId>` 60 次/分 | 网关滥用 | 同上 |

## 处理

按代价分成两套，而不是无脑全上分布式：

- **花钱的动作走 D1 计数**（`checkRateLimit`，改成 async）：一条 UPSERT 同时完成「开窗 / 计数 / 判上限」。
  这些请求本来就要打 D1 写库，多一条语句的延迟可以接受，换来跨实例真正生效。
  表 `rate_limit_bucket` 一行一个窗口桶，`WHERE` 守住「已到上限就不更新」，所以计数不会被自己顶高，
  解除只靠窗口滚动。过期桶按 2% 概率顺手删（站点没有常驻进程，不搞定时器）。
- **`/v1/*` 推理网关继续用进程内那份**，但改名成 `checkInProcessRateLimit`，注释写明它是**每实例一份**的
  宽松护栏。这里加一次 D1 写就是给每次首 token 之前多塞 100~200ms，不值；真正按用户兜底的是额度与计费。

## 已知边界

- D1 经 REST 没有事务，同窗口内并发最坏多放行一两个请求（实测并发 6 次、上限 3 → 恰好放行 3 次）。
  限流要的是量级正确，不是精确计数，可接受。
- 改判据不影响历史：桶是临时数据，删表重建都行。

## 顺手修的同类问题

`hasUsedFreeDrawToday` 也是先读后写，所以免费抽能并发重复领。这条改成了库层幂等：
`lottery_draw.freeDrawDate` + `unique(userId, freeDrawDate)`，详见 `docs/features/lottery.md`。
迁移：`migrations/012_lottery_free_draw_idempotency_and_rate_limit.sql`（已执行到线上 D1）。
