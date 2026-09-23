# 限时活动 · 幸运转盘

> 2026-09-23 上线。入口：侧边栏「通用 → 限时活动」，路由 `/lottery`。
> 配置：`/admin/settings` 的「限时活动（幸运转盘）」卡片。

## 玩法

1. 用户用 credits 购买**抽奖券**（默认 100 cr / 张，后台可调）。
2. 点「抽 1 次」或「抽 10 次」，每次消耗一张券，转盘开奖。
3. 转盘是**两段式指针**（暗色霓虹风）：
   - **内圈**：奖品格（固定加 / 减 cr）+ **唯一一个「外圈入口」格**，入口占满 `outerChancePercent`（默认 12.5%）。扇区角度由 `innerSectorLayout` 与抽奖同源，格子大小就是真实概率。
   - 内圈指针停在入口上 → 该指针**变长伸进外圈环带**，外圈再独立转一次，把对应奖品转到这根指针下决定最终结果。
   - **外圈**：按倍数结算的正负 cr，基数是单张券价或本次总花费（后台二选一）。
4. **抽 10 次**：转盘一次转停，然后按结果角度**依次弹出 10 根指针**（每根间隔 130ms）；命中入口的指针画成伸入环带的长线。多次进入时外圈只对位**最后一次**的落点，其余画虚线示意、结果看右侧明细。
5. **累抽送券**：累计抽奖次数达到配置档位时赠送抽奖券（如满 10 次送 1 张），每人每档位只发一次。

侧边栏入口在「通用 → 限时活动」。

## 对外文案只写实际 cr

倍数（`multiplier`）是配置里的内部表达，**转盘扇区、奖池规则、开奖结果与钱包流水一律显示实际 cr**。
因为 `multiplierBase = "batch"` 时同一格子在两种玩法下金额不同，外圈扇区与规则表都分两行标注：

```
单抽 +150 cr
10连 +1500 cr
```

`multiplierBase = "ticket"` 时两档金额相同，第二行显示「10连 同上」。
换算入口是 `outerPrizeCredits(config, multiplier, drawCount)`（`lib/lottery/prize-math.ts`）。

## 资金口径

| 事件 | 处理 |
|------|------|
| 买券 | 先扣临时余额（过期早的先扣），不足再扣永久余额；总额不足直接失败，不透支 |
| 中奖（正数） | 发进**临时余额**，`prizeValidDays` 天后过期 |
| 倒扣（负数） | 直接扣永久余额，**允许扣成负数** |
| 全部资金变动 | 写 `topup` 流水，`type = 6`，描述含奖品文案 |

抽奖不写 `usage_log`，所以不进看板的调用统计与模型消耗。活动结束后未使用的券作废，不折算回 cr。

## 数据模型

```
option.lottery_config        活动配置（JSON，见下）
lottery_ticket               一行一券；usedDrawId 非空即已消耗
  unique(userId, milestoneDraws)   档位赠券只发一次的幂等键（NULL 不参与唯一性）
lottery_draw                 逐次开奖记录；unique(batchId, seq)
  migration: migrations/007_lottery.sql
```

配置结构（`lib/lottery/prize-math.ts` 的 `LotteryConfig`）：

```jsonc
{
  "enabled": true,
  "startAt": "2026-09-25 00:00",   // 北京时间墙钟串，同公告时间约定
  "endAt": "2026-10-08 23:59",
  "ticketPriceCredits": 100,
  "outerChancePercent": 12.5,
  "multiplierBase": "ticket",       // ticket=单张券价 / batch=本次总花费
  "prizeValidDays": 7,
  "innerPrizes": [{ "credits": 60, "weight": 25 }, ...],
  "outerPrizes": [{ "multiplier": 1.5, "weight": 30 }, ...],
  "milestones": [{ "draws": 10, "tickets": 1 }, ...]
}
```

扇区角度按权重分配，所以「权重」同时决定中奖概率与该扇区的大小。缺字段、权重全 0、时间写错都会
被 `sanitizeLotteryConfig` 退回默认值——配置写坏时活动照常可玩，而不是让 `/lottery` 500。

## 关键文件

| 文件 | 职责 |
|------|------|
| `lib/lottery/prize-math.ts` | 纯计算：类型、配置清洗、活动窗口、按权重开奖、期望返还与返还率。**不 import 任何读库代码**，后台表单据此在浏览器里实时算返还率 |
| `lib/lottery/config.ts` | `getLotteryConfig()`：读 `option.lottery_config` |
| `lib/lottery/store.ts` | 账本原语：发券 / 锁券 / 扣 cr / 发临时余额 / 档位赠券 |
| `app/(dashboard)/lottery/actions.ts` | `buyTickets` / `drawLottery` 两个服务端动作 |
| `app/(dashboard)/lottery/lottery-wheel.tsx` | 双圈 SVG 转盘与结果面板（客户端） |
| `app/(dashboard)/admin/settings/lottery-form.tsx` | 后台配置表单 |

## 实现注意

- **没有事务**：D1 走 REST，`db` 拿不到受影响行数，所以条件更新统一走 `d1Run()`（读 `meta.changes`）。
  买券 = `UPDATE user SET balanceCredits = balanceCredits - ? WHERE id = ? AND balanceCredits >= ?`；
  锁券 = `UPDATE lottery_ticket SET usedDrawId = ? WHERE id = ? AND usedDrawId IS NULL`。
  并发双花靠这两条条件更新挡住，而不是靠先读后写。
- **逐次撤销**：10 连抽先整批锁券，再逐次结算；某次失败只撤销那一次（删开奖行、删流水、
  删临时余额行或反向补回永久余额、退券），已成功的部分保留，剩余未开奖的券原样退回。
- **`multiplierBase = "batch"` 的经济性**：10 连抽会按批次总花费（1000 cr）结算每一次的倍数，
  每券期望是单抽的约 10 倍——想让单抽与连抽等价就用 `ticket`。后台表单会按这个区别显示提示。
- 默认奖池配平到**单券返还率 ≈ 90.7%**（券价 100 cr）。改奖池时以后台那行「单券期望返还 / 返还率」为准，
  超过 100% 即每卖一张券净亏。
- 时间一律北京时间墙钟串（`lib/date.ts` 的 `parseCnWallClock`），避免服务器 UTC 造成活动提前/延后开关。
- **10 连抽的服务端耗时**：每次开奖要写券锁定、开奖行、流水、临时余额/永久余额，都是独立的 D1 HTTP 往返，
  实测一次 10 连抽约 7~10 秒（转盘内圈动画 2.6s，指针会在这段时间里依次落）。
  要压到 2 秒内得把这 10 次的写入批量化（一次多行 insert + 一次汇总余额更新 + 一条批量锁券语句），
  代价是回滚粒度从「单次开奖」变成「整批」，尚未做。
