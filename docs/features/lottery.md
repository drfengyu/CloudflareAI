# 限时活动 · 幸运转盘

> 2026-09-23 上线。入口：顶部导航「活动中心 → 幸运转盘」，路由 `/lottery`。
> 配置：`/admin/settings` 的「限时活动（幸运转盘）」卡片。

## 玩法

1. 抽奖按**当期活动券**整张扣费（默认单抽 100 cr = 100 张活动券，后台可调；1 张 = `couponUnitCredits` cr）。
   券从珍宝礼包、消费返利、任务与站内信获得；v0.38.0 起转盘页不卖券，v0.61.0 起盘面下发
   新增「兑换活动券」券包入口（`CouponEntry` 深色配色，复用 `CouponShop`），抽奖按钮旁即可兑换。
   每天首次单抽免费。
2. 点「抽 1 次」或「抽 10 次」，转盘开奖。
3. 转盘是**两段式指针**（暗色霓虹风）：
   - **内圈**：奖品格（固定加 / 减 cr）+ **唯一一个「外圈入口」格**，入口占满 `outerChancePercent`（默认 12.5%）。扇区角度由 `innerSectorLayout` 与抽奖同源，格子大小就是真实概率。
   - 内圈指针停在入口上 → 该指针**变长伸进外圈环带**，外圈再独立转一次，把对应奖品转到这根指针下决定最终结果。
   - **外圈**：两类奖型（`kind`）——**cr 档**按倍数结算正负 cr，基数是单张券价或本次总花费（后台二选一）；
     **活动券档**直接发活动券，不动 cr。默认外圈 16 档里配了 4 档活动券（+1 / +2 / +3 / +5 个抽奖等价）。
4. **抽 10 次**：转盘一次转停，然后按结果角度**依次弹出 10 根指针**（每根间隔 130ms）；命中入口的指针画成伸入环带的长线。多次进入时外圈只对位**最后一次**的落点，其余画虚线示意、结果看右侧明细。
5. **累抽送活动券**：累计抽奖次数达到配置档位时赠送活动券（如满 10 次送 1 个抽奖等价），每人每档位只发一次，
   领取记录落在 `lottery_milestone_grant`，唯一索引 `(userId, activityKey, draws)` 接住并发。

奖池配置里的 `tickets`（外圈活动券档与累抽档位）是**抽奖等价**：1 = 一次抽奖的价值 = `ticketPriceCredits` cr，
不是活动券张数。实发张数 = 抽奖等价 × `ticketsForCost(单券价, 券单价)`，面值 = 抽奖等价 × 单券价；
展示、入账与 toast 都按折算后的活动券张数写（`formatTicketLabel` / `couponTicketsForReward`）。
因为单券价被 `snapCostToUnit` 吸到券单价整数倍，折算永远无小数漂移。

顶部导航入口在「活动中心 → 幸运转盘」（v0.24.1 起页面与导航都叫「幸运转盘」，「限时活动」不再作为这个玩法的名字，
只留作后台设置卡片的分类前缀）。

## 内圈绝对 cr、外圈倍率：券价是独立的利润率杠杆

- **内圈**存绝对 `credits`（可为负）。
- **外圈**存 `multiplier`，实际 cr = 倍数 × 基数（`ticket` = 单券价，`batch` = 本次总花费）。

于是**改单券价会直接改返还率**：券价调高而奖池不动，内圈那 87.5% 分支的期望不变、外圈按券价放大，
综合下来站点每券净得变多。这就是把「定价」当作独立旋钮的用法，后台顶部那块面板会实时把
内圈期望 / 外圈期望 / 单券综合 / 返还率 / 站点每券净得 全部重算一遍。

想让奖池跟着券价等比缩放（保持手感不变）时，改完券价点表单里的「按 ×N 重算内圈」按钮——
它是显式动作，不是默认耦合，所以不会出现"改了价格却不知道利润率变成多少"的情况。

> 曾经试过把内圈也存成「倍率 × 券价」，结果两圈同步缩放，返还率被奖池形状钉死、券价调多少都一样，
> 定价这个旋钮等于废掉。因此内圈保持绝对值。历史配置里若出现过 `innerPrizes[].multiplier`，
> `sanitizeInner` 会按当次券价折回绝对 cr 读取。

## 调池子先看数：`scripts/lottery-sim.ts`

改 `option.lottery_config` 之前先在本地跑模拟。它**只读**线上配置（或 `--file` 指定的完整 JSON），
复用 `rollPrize`，按独立会话输出有效返还率、站点每买入券的 cr 差额，以及倒扣率、会话不亏率等指标。

```bash
npx tsx --env-file=.env.local scripts/lottery-sim.ts --out pool.json
npx tsx scripts/lottery-sim.ts --file pool.json --batch 10 --sessions 30000 --seed 20261028
npx tsx scripts/lottery-sim.ts --file pool.json --soften 0.5 --target 93 --out candidate.json
npx tsx --test tests/lottery-simulation.test.ts
```

参数：
- `--draws 1,10,30,100`：每会话购买多少券，**不是一批抽多少次**。
- `--batch 1|10`：默认逐次单抽；10 表示有至少 10 券时十连，否则单抽。模拟器以「抽奖等价」为单位：
  开奖返还的活动券与累抽档位的活动券都在批后加入券包继续抽。
- `--sessions N`：每种规模的独立会话数，默认 8000；`--seed N`：32 位无符号整数种子，默认 20261010。
- `--target R`：只缩放正档，尝试拟合名义 R%；`--soften F`：负档乘 0~1，再调正档保持目标名义。
  `--soften` 默认保留不高于券价的正档，`--no-keep-be` 才允许缩放这些档位。
  拟合系数范围为 0.1~2，取整后以输出的实际名义值为准，不是有效返还目标。
- `--file P`：从本地读取，无需数据库环境；`--out P`：保存最终配置，无 what-if 时保存当前读取的配置。
  导出值是模拟输入/候选，不是数据库原始备份；不要整行覆盖线上配置。

模拟约束：
- 每个会话从本轮零累计、零保底开始，买入券价固定，返还的活动券全部续抽直至券包为空。
- 保底与线上一致：每批取一次概率快照，只看最近 30 条未中大奖记录；十连中途中奖不改变本批概率。
- 每会话超过 100000 抽仍有券时直接报错，不再把剩余券当成零成本后输出虚假的利润。
- 使用 Mulberry32 可复现伪随机序列，仅用于模拟；各规模与 what-if 各自重置种子，不依赖输出顺序。

口径：
- **名义返还率**：后台 `lotteryExpectation()` 的加权值，活动券按面值、档位按最高门槛均摊。
- **有效返还率**：所有开奖净 cr（发奖减倒扣，含活动券续抽）÷ 买入总价。活动券不再额外按面值计入收益。
  有效值可以高于或低于名义值，不能给模拟结果再补加一次活动券成本。
- **站点/券**：买入金额减净返还，再除以买入券数；是 cr 账本差额，不是现金净利润。
- **倒扣率**：仅统计开奖结果 cr<0；**单注≥券价**：该注 cr 加活动券面值至少等于券价，不代表整会话不亏。
- **±95%抽样(pp)**：按独立会话算标准误的 1.96 倍，是模拟均值的近似抽样误差；单会话显示 N/A。
  这不是线上历史返还的预测区间，也不能用来认定历史亏损“只是运气”。
- 未模拟每日免费抽、跨会话保底/累计、历史调价/调池、券过期、余额过期及实际消费成本。
  历史对账需区分买入额和已用券面额；不能用当前奖池解释整段历史。

2026-10-28 修正：旧模拟器随机序列存在 10466 值短周期，且批次基数、保底与续抽截断有偏差。
旧版的具体返还预测、不亏概率和调池优劣结论撤回；调整前保存相同输入、使用多个种子复测，再确认线上目标。

## 对外文案只写实际 cr

倍数（`multiplier`）是配置里的内部表达，**转盘扇区、奖池规则、开奖结果与钱包流水一律显示实际 cr**。
因为 `multiplierBase = "batch"` 时同一格子在两种玩法下金额不同，外圈扇区与规则表都分两行标注：

```
单抽 +150 cr
10连 +1500 cr
```

`multiplierBase = "ticket"` 时两档金额相同，第二行显示「10连 同上」。
换算入口是 `outerPrizeCredits(config, multiplier, drawCount)`（`lib/lottery/prize-math.ts`）。

活动券档不折算成 cr，扇区与规则表直接写「+N 张活动券」（`formatTicketLabel`，N 已按抽奖等价折算），
色调也单独用金色，免得被当成一个小额 cr 档。

### 扇区标签：标签 → 记号 → 亮点，三级退化

标签是切向排的，能占到的宽度就是落点半径处的弧长。`labelSize()` 按「弧长 ÷ 标签宽度」收缩字号，
缩到 7.5 以下就不写整段文字，改画记号：**★ = cr 档，券 = 活动券档**；窄到连记号都放不下（弧长 < 7px，
16 档外圈里的 ×20 头奖就是这一类）再由 `Glyph()` 退化成环带中线上一个发光的亮点。
**不允许出现空白格**：极窄扇区恰恰装着头奖，留白会被读成「这一格里没有奖品」，
「0.05% 那档真的能抽到吗」这个疑问就来自这里。

每个扇区的 `<g>` 上挂一个 `<title>`（完整文案 + 10 连口径 + 概率），鼠标悬停就能看清被缩成记号或亮点的格子，
盘面下方也写明了这套记号含义；「奖池与规则」区始终全量列出。概率走 `formatChance()`：
≥1% 一位小数、<1% 两位小数、低于 0.01% 写「<0.01%」——原先一律 `toFixed(1)`，头奖那格显示成「0.0%」，
看着像根本不可能命中。

内圈标签落在 `INNER_LABEL_R = 内圈半径 × 0.76`（贴着外沿）：同一扇区角在更大半径处能分到更多弧长，
5% 概率的档位因此仍写得下「+400 cr」这类标签；早先取 0.63 时它会掉到阈值以下。

### 外圈怎么读：入口落点 → 多根读数针同时显示（改这里前先读）

外圈有两类不同的指针，各管一件事：

- **内圈落点指针**（内圈层，`spokeAngles()`）：**只画不进入外圈的指针**，从 hub 伸到内圈外沿之前
  （`INNER_R - 6 = 130`），青色。2026-10-23 改：进入外圈的指针不再画（由静态层的多根读数针代替），
  避免指针总数混乱。
- **外圈读数针**（静态层，不随内圈转，`outerNeedles` 数组）：**每次进入外圈就加一根长针**，
  从中心（`OUTER_POINTER_IN = 0`）一路伸到贴近外沿（`OUTER_POINTER_OUT = 180`），
  **停在该发奖品的格子上**。2026-10-23 改：多根长针同时显示（不再只有一根依次移动），
  每根对应一次外圈入口，颜色按顺序循环（洋红 / 青 / 金 / 紫 / 粉）。起点从中心开始，消除与中心轴的间隙。

读数针的目标角不是入口方向，而是那一格外圈转停后的自然朝向：
`restDeg = outerSpan.center + innerFinal + outerRotation`。外圈只整圈转（`+3 × 360`），
整圈不改变 mod 360 的朝向，所以这个式子在转之前转之后都成立。`innerFinal` 必须先把内圈最终角度
算出来留住（不能用 `setInnerRotation(current => …)` 的函数式更新），否则针和盘面各用一份基准，会错开。
第一发的动画分两步：先 `transition: none` 把针瞬移到这一发的入口落点，60ms 后开启动画扫到 `restDeg`，
看着就是「从落点扫到奖励格」。

10 连抽可能进入外圈好几发：**环带只在第一发摇一次**，后面几发的读数针直接出现在各自格子上
（`OUTER_SWEEP_MS + OUTER_HOLD_MS` = 700 + 800ms 间隔），所有针同时留在盘面上，最后一发出现后才进 `done`。
一轮没有外圈入口时根本不画读数针。这么切是因为结果在请求返回时就全定了，外圈再摇几圈都不改变
「针停在哪格」，重复摇只是耗时。

### 一次抽奖花多久（改时长前先算这笔账）

动画的计时零点是「服务端响应回来的那一刻」，但内圈从**点击瞬间**就开始转（预转），所以总时长是
`服务端耗时 + 后段动画`，而不是 `服务端 + 预转 + 后段`：

| 段 | 常量 | 值 | 说明 |
|---|---|---|---|
| 预转（与请求并行） | `PRE_SPIN_MS` / `PRE_SPIN_DEG` | 1200ms / 540° | 匀速，与结果无关，用来盖住服务端等待 |
| 接管定停 | `SPIN_SETTLE_MS` | 1500ms（2 圈） | 响应回来时若预转还没跑完，CSS transition 从当前插值位置继续，不跳 |
| 10 根指针依次落 | `SPOKE_STEP_MS` | 130ms × 10 = 1300ms | 起点 = `SPIN_SETTLE_MS` |
| 外圈第一发 | `SPIN_OUTER_MS + OUTER_HOLD_MS` | 1500 + 800ms | 环带摇一次 + 第一根针扫到奖励格 |
| 外圈后续每发 | `OUTER_SWEEP_MS + OUTER_HOLD_MS` | 700 + 800ms | 新针直接出现在格子上 |

按进入外圈的次数 k，动画段（不含服务端）：k=0 → 2.8s，k=1 → 5.2s，k=2 → 6.7s，k=3 → 8.2s。
线上 `drawLottery` 约 1s，所以典型一轮（k=1~2）**6~8 秒**；本地 dev 的 server action 要 3~6 秒，
总时长被它主导，别拿 dev 的墙钟当优化依据。

实测（一次性账号，本地 dev 真抽；转停后用 DOM 取针的绝对角与每格弧端点角比对，并用页面内 50ms
`setInterval` 采 `getComputedStyle` 的插值角）：

- **落点准**：转停后针与所在格中心偏差 0°、0°、0°、0.03°（4 个有外圈入口的轮次），
  所在格 `<title>` 文案与该发实际入账的奖品一致，最后一格总与明细里最后一发对上。
  长针改版后再测一次：针起点 r=42、`needleDeg = 168.07°`、与所在格中心偏差 **0°**，
  所在格 `<title>` =「+350 cr · 概率 2.6%」= 明细最后一发。
- **多针同时显示**：一轮进了 4 次外圈（+5 张券 / +1 张券 / −80 cr / +438 cr），4 根读数针依次出现
  并留在各自格子上（138.7° / 88.9° / 162.5° / 336.1°），颜色按顺序循环（洋红 / 青 / 金 / 紫），
  与明细顺序一致；环带只在第一发摇过一次，后面三根针直接出现在静止的环带上。
- **预转盖住等待**：服务端 4.2~5.7s 的那几轮，盘面在 t=+52~94ms 就已经在动（改前这段时间盘面是静止的）。

## 资金口径

| 事件 | 处理 |
|------|------|
| 付费抽 | 只扣当期活动券：整批按单抽价折成**整数张**（`payWithCoupon`，`round2(注数 × 单券价)`）；券余额向下取整比对，不足直接失败并提示先兑换。免费抽不扣券。券只从盘面下券包的兑换 / 礼包（v0.61.0）、返利、任务与站内信获得 |
| 中奖（正数） | 发进**tcr 余额**，`prizeValidDays` 天后过期 |
| 倒扣（负数） | **先扣未过期的tcr 余额（最早到期的先扣），不够再扣cr 余额**；落到本金的部分允许扣成负数 |
| 抽中活动券档 | 按抽奖等价折算成活动券面值入账（`couponCreditsForReward`），**不动 cr、不写流水** |
| 累抽档位 | 同上，另写一行 `lottery_milestone_grant` 保证每档只发一次 |
| 珍宝礼包让利 | 购买时 `coupon_pack_purchase` 记实付与到账券面；差额 `couponCredits − priceCredits` 记为**站点亏损**（同时是用户获利），发生在购券时、不动 cr 余额 |
| 全部资金变动 | 写 `topup` 流水，`type = 6`，描述含奖品文案 |

> 活动券内部仍按 cr 券面记账（`activity_coupon.credits`，1 张 = 该活动 `couponUnitCredits`），
> 但**张数一律是整数**：发放按整张折算（向下取整），扣费按 `ticketsForCost` 折成整数张，
> 后台单抽价与各玩法价格都被 `snapCostToUnit` 吸到券价的整数倍，界面只显示「活动券图标 × 张数」。

> 活动账目（`type=6`）在个人账本 `/ledger` 里归「活动」类别，正负都按天汇总；逐次明细仍在
> `/lottery`「我的转盘记录」与 `/admin/activity`（六种活动按天汇总）查看。钱包页不再列流水，只留余额、最近 8 笔收支
> 与「tcr 余额明细」（中奖发放的tcr 余额仍带到期时间）。

**倒扣的扣款顺序（2026-10-17 改）**：`clawbackCredits()`（`lib/lottery/store.ts`）把整批倒扣按
「未过期tcr 余额（`expiresAt` 升序）→ 本金」的顺序回收，跟模型消费走同一条优先级。
改之前倒扣是一步砸本金，于是出现过这种分裂：某账号本金被砸成 −1,598.80，手上却还躺着 14 笔共 2,051.39 cr
的未过期tcr 余额（2026-10-21 起逐笔作废，最晚一笔 11-14）——界面按「负数补正」显示可用 +452.58，
站点没真收回成本，用户还在这些行作废完的那天发现可用余额从正翻负。
两个实现细节：本批刚发出的中奖行会按 id 排除（否则同一次写入里「刚发给他的钱当场又被扣走」）；
回收返回一张凭据（扣了哪些行、各多少、删了哪些行），整批回滚时按它原路退回，扣空被删的行按快照重建。

**倒扣不设下限（2026-10-17 定案，与上面那条不冲突）**：本金不够就继续扣成负数，跟消费侧同口径。
当天曾实现过「一批合计最多扣到 0」的下限，管理员看过之后要求**回退**。**别再往这个方向加东西**；
真要加下限，改动点是 `clawbackCredits()` 落到本金的那一步。
线上曾有 2 个账号本金为负（−1,400 / −1,598.8），2026-10-17 由管理员决定**补正为 0**：各发一笔本金把它填平，
写成 `topup type=2`（描述「负本金补正：本金归零」），未过期的tcr 余额一分未动。现在库里负本金账号为 0 个，
但这不代表以后不会有——口径本身（允许扣成负数）没变。

抽奖不写 `usage_log`，所以不进看板的调用统计与模型消耗。活动券按活动轮次（`activityKey` = 配置 `startAt`）
记账，仅限本轮使用：管理员换一轮后旧券不再可花，也不折算回 cr；本轮延长结束时间后仍可继续使用。

## 数据模型

```
option.lottery_config        活动配置（JSON，见下）
activity_coupon              活动券券包；券面按 cr 记账，按 kind=gift 与 activityKey 分轮次，1 张 = couponUnitCredits cr
lottery_draw                 逐次开奖记录；unique(batchId, seq)
  grantTickets               本注抽中的**抽奖等价**张数（0 = cr 档）；展示与入账时 ×ticketCost 折成活动券张数
  ticketCredits              这一注消耗的活动券面值（免费抽为 0），窗口对账直接读它
  ticketId                   历史抽奖券外键；v0.39.0 起恒为 NULL，旧行仍可按券表回退关联
  freeDrawDate               只有「今日免费抽」那行写北京日期（如 2026-10-17），付费抽为 NULL
  unique(userId, freeDrawDate) 免费抽的库层幂等键：一天只能领一次，并发/连点由它兜底
  migration: migrations/007_lottery.sql
  migration: migrations/008_lottery_prize_tickets.sql（加 grantTickets 列）
  migration: migrations/009_lottery_milestone_seq.sql（加 milestoneSeq 列并重建唯一索引）
  migration: migrations/011_lottery_milestone_unique_activity.sql（赠券唯一键加上 activityKey）
  migration: migrations/012_lottery_free_draw_idempotency_and_rate_limit.sql（加 freeDrawDate + 唯一索引，建 rate_limit_bucket 表）
  migration: migrations/026_lottery_coupon_only.sql（加 ticketCredits 列）
lottery_milestone_grant      累抽档位领取记录（v0.39.0）
  unique(userId, activityKey, draws)   每轮每档只发一次；并发重复领取由这个唯一索引接住
  migration: migrations/026_lottery_coupon_only.sql
lottery_ticket               历史抽奖券表：v0.39.0 起不再写入，保留只读，供旧开奖行回退关联
  source                     gift=累抽档位送 / prize=外圈抽中 / buy=旧版买券（v0.38.0 前，仅存历史行）
lottery_user_stats           按 (userId, scope) 累计的统计行；scope='all' 为全量口径，其余为活动轮次 startAt
  draws / outerHits / paidOut / clawedBack / ticketFace / lastDrawAt   开奖侧累计（开奖批次结算时增量 upsert）
  boughtTickets / boughtCredits / unusedTickets / unusedCredits / giftTickets / prizeTickets
                             券包侧历史列，v0.39.0 起不再维护（新数据看 coupon_pack_purchase 与开奖明细）
  migration: migrations/014_lottery_user_stats.sql（建表 + 历史回填 + lottery_draw(userId, createdAt) 索引）
rate_limit_bucket            跨实例限流计数，一行一个固定窗口桶（见 lib/rate-limit.ts）
```

**为什么要有 `lottery_user_stats`**：`/lottery`、看板、管理端「全部」都要读「不限时间」的
总次数/总收益/券面值。这类聚合没有可用的索引，每次加载都得把该用户（或全站）的历史行读完；
D1 免费层每天 500 万行读取，5.6k 行的一张表开几次页面就见底。现在开奖时用一条 UPSERT
把增量写进行（`lib/lottery/stats.ts` 定义口径，`applyDrawStats` / `revertDrawStats` 落库），读侧只取一行；
回滚整批开奖时按同一份增量反向扣回并重算 `lastDrawAt`。
**管理端的时间窗口径（今日/近 7 日/近 30 日）仍然回到明细表聚合**，累计行不存时间维度。
数据可由明细全量重算：先 `DELETE FROM lottery_user_stats` 再重跑 `migrations/014_lottery_user_stats.sql`。

**免费抽为什么要有 `freeDrawDate`**：`hasUsedFreeDrawToday` 是先读后写，两个请求同时进来时都读到
「今天还没抽」，于是双双放行——一天能白嫖好几次。页面上那道检查留着（省一次写失败的回滚），
真正的闸门是唯一索引：撞了它就是「今日免费抽已使用，明天再来」，`drawLottery` 里按
`isUniqueConflict` 识别并把整批已写的行退回。

配置结构（`lib/lottery/prize-math.ts` 的 `LotteryConfig`）：

```jsonc
{
  "enabled": true,
  "startAt": "2026-09-25 00:00",   // 北京时间墙钟串，同公告时间约定；改它即开启新一轮（activityKey）
  "endAt": "2026-10-08 23:59",
  "ticketPriceCredits": 100,        // 单抽消耗的 cr，扣券时折成整数张
  "couponUnitCredits": 1,           // 1 张活动券 = 多少 cr；单抽价会被吸到它的整数倍
  "outerChancePercent": 12.5,
  "multiplierBase": "ticket",       // ticket=单张券价 / batch=本次总花费
  "prizeValidDays": 7,
  "innerPrizes": [{ "credits": 250, "weight": 12 }, ...],   // 绝对 cr，可为负
  "outerPrizes": [
    { "kind": "credits", "multiplier": 1.5, "weight": 14 },   // kind 缺省即 credits
    { "kind": "tickets", "tickets": 2, "weight": 7 },         // 2 个抽奖等价 → 按券价折成活动券
    ...
  ],
  "milestones": [{ "draws": 10, "tickets": 1 }, ...]          // tickets 同样是抽奖等价
}
```

扇区角度按权重分配，所以「权重」同时决定中奖概率与该扇区的大小。缺字段、权重全 0、时间写错都会
被 `sanitizeLotteryConfig` 退回默认值——配置写坏时活动照常可玩，而不是让 `/lottery` 500。
`ticketPriceCredits` 会被当期活动券单价 `snapCostToUnit` 吸到**整数倍**（1 张起），
所以实际扣券永远是整张；后台表单保存的也是吸附后的值。

## 转盘记录与站点收益

钱本来就逐笔记在 `activity_coupon` 与 `lottery_draw` 上，两处始终是唯一真源；
`lib/lottery/records.ts` 只负责读。2026-10-29 起，「不限时间」的开奖汇总改读累计行
`lottery_user_stats`（开奖时增量维护），管理端的时间窗仍回到明细聚合。

**用户侧**：`/lottery` 页面下方「我的转盘记录」卡片——逐次时间、落在哪一圈、结果文案、cr 变动、
这一注的活动券来源与面值（活动券 / 免费），外加一排汇总（次数、外圈命中、中奖发放、倒扣回收、已开奖消耗、本期净收益）。
**只显示当前活动轮次的最新 30 条**：用户主要关注最近单抽 / 10 连的结果，明细取当期最新 30 条（`MY_RECORDS_LIMIT`，
`listDrawRecords` 按 `activityKey` 过滤），每页 10 条、最多 3 页，翻页在卡片内局部刷新
（服务端动作 `listMyActivityRecords`，不改 URL、不整页刷新，页码按封顶后的总页数夹取）；
战绩汇总仍按当期全量算（不受 30 条限制），总数取 `min(当期累计行 draws, 30)`；
管理员改 `startAt` 开启新一轮后旧轮记录不再显示，当轮结束后仍可查看。

**管理侧**：转盘的逐次明细、按用户收益与礼包让利已并入 `/admin/activity`
（六种限时活动按北京日汇总的站点收支，见 `docs/features/activity-ledger.md`）。
`/admin/lottery` 与导航里的「转盘记录」已移除，旧地址自动跳转到 `/admin/activity`。

**并表后的口径**：统一活动记录按现金流记站点收支——买券 / 礼包实付（`topup.type=15`，描述里带活动名）
与倒扣回收算转盘收入，中奖发放（`type=6` 正数）算支出。活动券是提前付费、开奖时才发奖，
所以购券日收入、开奖日支出，不再按券面值在开奖时点确认；活动券档本身不产生 cr 流水。
返还率与奖池口径仍在 `/admin/settings` 的转盘配置卡里实时预览。

## 关键文件

| 文件 | 职责 |
|------|------|
| `lib/lottery/prize-math.ts` | 纯计算：类型、配置清洗、活动窗口、按权重开奖、期望返还与返还率。**不 import 任何读库代码**，后台表单据此在浏览器里实时算返还率 |
| `lib/lottery/config.ts` | `getLotteryConfig()`：读 `option.lottery_config` |
| `lib/lottery/store.ts` | 账本原语：扣 cr / 发tcr 余额 / 倒扣回收 / 开奖统计增量 / 累抽领取记录 |
| `lib/lottery/records.ts` | 只读聚合：用户侧逐次明细与战绩汇总（管理侧已并入 `/admin/activity`） |
| `app/(dashboard)/lottery/actions.ts` | `drawLottery` 等抽奖服务端动作 |
| `app/(dashboard)/lottery/lottery-wheel.tsx` | 双圈 SVG 转盘与结果面板（客户端） |
| `app/(dashboard)/lottery/lottery-records.tsx` | 「我的转盘记录」卡片（服务端渲染） |
| `app/(dashboard)/admin/lottery/page.tsx` | 旧后台入口，跳转到 `/admin/activity` |
| `app/(dashboard)/admin/settings/lottery-form.tsx` | 后台配置表单 |
| `scripts/lottery-sim.ts` | 奖池模拟器（只读线上配置，跑蒙特卡洛出体感与收益指标） |

## 实现注意

- **没有事务**：D1 走 REST，`db` 拿不到受影响行数，所以条件更新统一走 `d1Run()`（读 `meta.changes`）。
  付费抽 = `UPDATE activity_coupon SET credits = credits - ? WHERE id = ? AND credits >= ?`
  （`payWithCoupon`，金额 = 整数张 × 券价）。并发双花靠这条条件更新挡住，而不是靠先读后写；
  不再有「锁券 → 开奖 → 扣券」两步，也不存在锁券语句（旧实现的空 `id IN ()` 正是 10 连抽报错的根因）。
- **整批撤销**：一次开奖先在内存里把整批结果算完（`planDrawBatch`），再一波并发写库。
  任一写入失败就整批退回——删开奖行、删流水、删tcr 余额行、反向补回净额、收回发出的活动券、
  删掉本批占下的累抽档位、退还付费券，不存在「10 注里留下 3 注」的半截状态。
- **累抽档位由领取记录表去重（v0.39.0）**：跨档时先
  `INSERT INTO lottery_milestone_grant … ON CONFLICT(userId, activityKey, draws) DO NOTHING`，
  `changes === 1` 才算本批占下该档；发券失败时删掉本批 claim，这些档位下次还能再发。
  旧的 `lottery_ticket.milestoneSeq` 序号方案随抽奖券一起下线。
  **跨档判定只看当前这一批的次数区间**，修复前错过的档位不会自动补发，要回填得单独跑脚本。
- **`multiplierBase = "batch"` 的经济性**：10 连抽会按批次总花费（1000 cr）结算每一次的倍数，
  每券期望是单抽的约 10 倍——想让单抽与连抽等价就用 `ticket`。后台表单会按这个区别显示提示。
- 默认奖池按**单券价 100 cr** 配平到返还率 ≈ 91.1%。内圈是绝对 cr，所以券价一改这个数就会动
  （125 cr 券价下同一份内圈只有约 77%）；改奖池时以后台那行「内圈 / 外圈 / 单券综合期望 + 返还率」为准，
  超过 100% 即每卖一张券净亏。
- 时间一律北京时间墙钟串（`lib/date.ts` 的 `parseCnWallClock`），避免服务器 UTC 造成活动提前/延后开关。
- **转盘页没有独立购券面板**（v0.38.0 删除 `buyTickets` / `MAX_TICKETS_PER_PURCHASE`）：
  券从盘面下的券包入口（兑换 / 礼包，v0.61.0）、返利、任务与站内信获得；
  付费抽的剩余份数按单抽价折整张扣券。发券走 `batchRows(values, 7)` 分片写入，
  单条 INSERT 绑 100 个参数是 D1 的硬上限（见下条）。
- **D1 单语句最多绑 100 个参数**：`too many SQL variables`。批量插入（`insert().values(多行)`）每行每列都占一个参数，
  所以早期的「一次买 50 张券」= 300 个参数，那时扣了钱却发不出券。统一用 `lib/db/d1-http.ts` 的
  `batchRows(rows, 每行列数)` 分片；`inArray()` 同理（每个 id 一个参数），记录页与 `/admin/orders` 的邮箱映射都分段查。
- **10 连抽的服务端耗时**：一次 10 连抽原先要打约 40 次**串行** D1 HTTP 往返（每注各一次开奖行、
  一次流水、一次余额变动，外加逐张锁券），实测 7~10 秒。现在整批结果先在内存算完，写入按表合并
  （每张表一条多行 INSERT、倒扣合并成一次净额 UPDATE、付费合并成一条条件扣券），互不相关的语句并发发出，
  实测降到约 2.4 秒（往返数 40+ → 9，关键路径 4 波）。剩下的时间里 D1 单程就占 0.4~0.9 秒，
  再要快只能换掉「Vercel 走 REST 打 D1」这层传输，而不是继续省语句。
  代价是回滚粒度从「单次开奖」变成「整批」——见上面「整批撤销」。
- **活动券档不写 0 cr 流水**：`planDrawBatch` 命中 `kind='tickets'` 时只回填开奖行的
  `grantTickets`（抽奖等价），cr 余额与 `topup` 一行都不动；批后按券价折算成活动券统一入账，
  整批撤销时按已发面值扣回。期望返还里活动券按券价折算，所以后台那行「返还率」把送出去的券也算成成本。
- **改奖池要先部署再改配置**：`kind='tickets'` 在旧代码里会被读成 `multiplier` 缺失 → 0 cr 奖品，
  真实用户会抽到一堆空档。顺序固定为「代码上线 → 写 `option.lottery_config`」。
- **活动券只在本轮可用**：券按 `kind=gift` + `activityKey`（= 配置 `startAt`）记账，抽奖只读当前轮的券。
  管理员改 `startAt` 即换轮，旧轮券留在库里但不再可花；想清掉旧轮券面值需单独跑脚本，不影响开奖。
  延长本轮 `endAt` 不换 key，券继续可用。
- **`scripts/run-migration.js`**：按行剥掉 `--` 注释后再切句（早先按整块 filter，首行是注释的迁移文件会被判成
  0 条语句却打印成功）；0 条语句直接退出，D1 以 HTTP 200 + `success:false` 返回的报错也会抛出。

## 画面交互（v0.70.0）

- 抽奖按钮不再因为券不足而禁用：点一下弹「还差 N 张，可在下方券包兑换」，按钮下方常驻缺口提示；
  开奖失败时 toast 明确「本次未扣券，券包不变」。
- 页头挂 `ActivityWindowBadge`（倒计时 + 临期券提醒），与试炼 / 工坊 / 星图一致。
- 窄屏（< 1024px）抽完后自动把「本次结果」滚进视野；「本次结果」卡带 `id="lottery-current-result"`。
- 抽奖记录表加 `min-w-[560px]`，窄屏横向滚动而不是把列挤成一字一行。
- 记录组件的 `key` 改为当期 `activityKey`，翻页途中刷新不会因为多了一条记录就跳回第 1 页。
