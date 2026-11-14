# 限时活动·灵宠工坊（v0.54.1，v0.51.0 改为冒险地图）

红白机式养成：开局三选一初始灵宠，花活动券进图，在俯视角的冒险地图里一格一步地走，
草丛里摇出野生灵宠后用招式打倒或精灵球捕捉，升级到门槛自动进化，走到地图另一头的道馆
按徽章顺序挑战，图鉴记录见过的每一阶。两只同阶灵宠仍可合成一只高一阶，作为不花券的加速路径。

- 前台：`/workshop`（侧边栏「灵宠工坊」，活动中心默认展示）
- 券入口（v0.61.0）：画面 HUD 显示活动券张数，`券包`页签内是兑换 / 珍宝礼包；
  页面本身不再挂独立的券商店卡片（`components/workshop/board.tsx`）
- 后台：系统设置 → 「限时活动（灵宠工坊）」
- 配置键：`option.workshop_config`（界面按字段拆成数字输入框，管理员不写 JSON）
- 账本：`topup.type = 18`（里程碑只发 tcr；进图 / 道馆票价在券兑换 / 礼包时已按 type=15 记过支出）
- 表：`workshop_state`（沿用迁移 `migrations/028_new_activity_games.sql`，无新增迁移）
- 里程碑幂等：`activity_milestone` 唯一索引 `(userId, activityKind, activityKey, tierKey)`

## 玩法

1. **三选一**：第一次进入从焰尾狐（ember）/ 潮汐鲸（tide）/ 森语鹿（verdant）里选一只
   Lv.5 初始灵宠，不花券；选定后不可更换（`starter` 固定）。
2. **进图**：花一次 `exploreCostCredits` 的当期工坊券从营地出发进入某片区域的冒险地图，
   一天最多 `dailyExplores` 趟；区域按徽章数解锁（灰烬原野 → 潮声浅滩 → 苔语密林 → 星陨高地）。
3. **走图**：地图是 44×28 格、每格 32 px 的格网，外圈岩石封死。方向键 / WASD、屏幕方向键
   或直接点击地面都能走（点击只走贪心折线，不寻最短路）。高草丛 slows 且遇敌率 16%、
   普通草 5%、花丛 10%、小径 1.5%、营地 / 道馆 / 水面 / 岩石不摇。一趟走满
   `runMaxSteps` 步或摇出 `runMaxEncounters` 只野生灵宠即自动收兵。
4. **战斗**：每只灵宠两个招式（普通系「撞击」+ 本系技），属性三角
   焰 → 森 → 潮 → 焰（克制 ×1.5、被克 ×0.67）。可选防御（本回合受伤减半）、换人、
   喝药水、扔精灵球、逃跑；道馆战不能捕捉或逃跑。战斗结束后仍在刚才的格子上，
   可以继续走；野外不能休息，走回营地门口才行。
5. **捕捉**：精灵球只对野生灵宠有效，成功率随残血上升、随阶数下降，夹在 5%~92%。
6. **成长**：战斗胜利给经验，升级补足生命上限差值；到达该阶进化等级（6 / 10 / 14 … / 34）
   自动升阶并回满新增血量，第 9 阶是终点，50 级封顶。
7. **队伍与仓库**：队伍 3 只、仓库 60 只；战斗中可换人，倒地自动换下一只活着灵宠，
   全灭判负并就地结束这趟探险（`run` 置空、整队扶到 `max(1, floor(maxHp / 4))` 血），
   不会把人卡在野外。药水回复 20 点，每天首次休息免费、回满整队（限营地；
   整队倒地时这一道闸放开，否则没药水就只能一直躺着）；免费次数用完后可按后台设定的
   `restCostCredits` 花工坊券付费休息，券不足只能等第二天。
8. **道馆**：道馆在地图另一头，必须把主角走到它跟前一格才能挑战（服务端按光标坐标判邻居），
   按徽章数顺序发放，胜利给徽章 + 2 精灵球 + 2 药水 + 金币；三枚徽章解锁星陨高地。
9. **金币与商店**（v0.53.0）：野生胜利掉 `10 + 阶数×4 + 等级` 金，道馆首胜按关卡
   掉 100 / 200 / 300 金；工坊商店卖精灵球 25 金、药水 20 金，一次买 1~10 个，
   战斗中不能进店。金币只在本活动里流通（不换成 tcr、不接受 cr 充值），
   来源与去向都留在游戏内。
10. **合成**（保留）：两只同线同阶灵宠合成一只高一阶（取两者较高等级、满血），不花券、
    不会失败；队伍↔队伍留在队伍，仓库内合成留在仓库。
11. **里程碑**：任意一条线首次达到配置阶位发一次 tcr，`tierKey = tier:N`；判定取图鉴与当前
    灵宠的最高阶，合成消耗掉低阶灵宠也不会让已达成阶位回退。
12. **图鉴**：3 条线 × 9 阶，拥有某阶即视为见过 1~该阶；未解锁格位显示剪影。

## 存档结构

整份进度存 `workshop_state.state` JSON：`day / entersToday / gymsToday / starter / party /
box / dex / items{ball,potion} / gold / badges / activePetId / run / encounter / restDay`
（`gold` 为 v0.53.0 新增，旧档读回默认 0）。纯数据与纯函数
在 `lib/workshop/state.ts`、`lib/workshop/pets.ts`，服务端与单测共用。

进行中的一趟探险是 `run = { areaKey, seed, tx, ty, steps, encounters, startedAt }`：
只存「哪张图 + 种子 + 走到哪 + 走了几步 / 摇了几次」，地图本身与随机数状态都不落库。
`normalizeWorkshopRunShape`（`state.ts`）只校结构，`normalizeWorkshopRun`（`run.ts`）按真实
地图夹住光标，站进障碍或图外就回营地，读档时由 `store.readState` 串起来调用。

旧版「三条线各阶数量」存档（`items: { ember: number[], ... }`）在 `normalizeWorkshopState`
时换算成灵宠个体：等级按 `阶数 × 4`，按阶数排序后前 3 只进队伍、其余进仓库（合计上限 63），
同一天的采集 / 探索次数（`gathersToday` / `exploresToday`）保留为进图次数，图鉴按灵宠阶数补齐，
老玩家不用从 1 级重练。没有 `run` 字段就是没在图上。

## 服务端结算

- 客户端只提交「这一回合做什么」（`move / guard / ball / potion / switch / run`），伤害、捕捉、
  掉落、经验全部由 `resolveWorkshopBattle` 在服务端计算，随机数可注入，单测固定序列。
- **走位按种子重放**：客户端把连续同向的行走攒成游程路径 `[方向下标, 步数][]` 发上来，
  服务端用同一份纯函数（`lib/workshop/field.ts` 生成地图、`run.ts` 的 `replayWorkshopWalk`
  逐格重放）自己走一遍。撞墙 / 出图的步子不动也不计步，第 N 步的随机数只由
  `fieldStepRandom(seed, N)` 决定，所以从任意一步重放都能接得上；客户端上传的坐标、
  步数、遇敌结果一律以重放为准，分段重放与整段重放算出同一个游标（有单测）。
- 单次请求最多 96 步（`WORKSHOP_WALK_MAX_PATH_STEPS`），脏路径项整条丢弃，单条游程最长 64 步。
  只有 `walk` 结果为 `encounter / capped` 时才 `revalidatePath`，纯走位不回传整页。
- 进图与道馆先扣券再写状态：CAS 连续 3 次失败、每日次数用完或创建遭遇失败时，
  `refundCouponPayment` 把券退回原处。收兵离开（`leaveWorkshopField`）不退券，战斗中也拒绝离开。
- 写入用 `WHERE version = ?` 乐观锁；并发战斗 / 捕捉 / 走位只有一个能推进，另一个收到「操作冲突，请刷新后重试」。
- 里程碑先 `INSERT OR IGNORE` 占住 `activity_milestone` 唯一键再发 tcr；发奖失败删掉占位行。
  战斗 / 合成把存档推进落库之后才发里程碑，这一步失败只记服务端日志（`safeGrantReachedMilestones`），
  不再把已经成功的动作报成失败——漏发的 tcr 留在页面「补领」里，下次进页面还能领。
- **战斗结束兜底**（v0.54.1）：客户端还停在战斗页、服务端却没有这场遭遇了（别的标签页已结算、
  写回执丢了、存档被重置），`battleWorkshop` 不再抛「当前没有进行中的战斗」，而是回一份
  `status = "ended"` 的结算（`endedWorkshopBattle`）带着权威存档，前端据此收起战斗界面。
  客户端 `act()` 在任意战斗动作失败时都会 `router.refresh()` 重拉存档，任何形式的失步都会收敛，
  不会永远卡在战斗页。战斗进行中合成在服务端与按钮上都已禁用（`战斗中不能合成，打完再合`）。
- Server Action 限流：`workshop-enter` 30 次/60s、`workshop-walk` 240 次/60s（走位是逐格高频上报）、
  `workshop-shop` 60 次/60s。
- **走位并发收敛**（v0.53.0）：`field-canvas.tsx` 同一时间只允许一段路径在路上
  （`inFlightRef`），服务端判遇敌 / 走满后立即 `stoppedRef` 锁死本地游程并清空待发路径；
  画布卸载（战斗面板挂载）时不再补发残路径。纯 `ok` 确认只同步步数 / 遇敌数，
  不清本地光标与点击寻路队列；只有服务端游标与本地预测分叉、遇敌或请求失败才把主角
  拉回服务端坐标。此前遇敌瞬间的并发路径会被服务端当成「上一场战斗还没结束」拒绝，
  并表现为走两步被拉回原位。

## 画面

`components/workshop/field-painter.ts` 是纯绘制的红白机式画家（格、装饰、主角、小地图、HUD），
`components/workshop/field-canvas.tsx` 负责逐格行走、攒路径上报与服务端游标纠偏。
逻辑视野固定宽 640，高度随画布 CSS 比例推导（窄屏 4:3 且不超过屏高 42%，宽屏 16:9），
位图按 `CSS 宽 / 640 × devicePixelRatio`（夹 1~2）放大，`ctx.setTransform` 回到逻辑坐标，
所以画面在大屏和手机上都铺得开又不会被拉伸。

战斗面板（v0.53.0）在 DOM 层补上打击反馈：`BattlePanel` 解析服务端日志里的
「造成 N 伤害」，按 540ms 间隔依次触发敌方 / 我方受击抖动（`battle-hurt`）、
伤害飘字（`battle-float`，≥28 记重击并带 `!`）与斜劈光带（`battle-slash`，
敌方金色 / 我方红色），靠父节点 `key` 变化重挂载重播；CSS 在 `app/globals.css`。

## 音乐与音效（v0.53.0）

与三国讨逆传共用 `lib/game/audio.ts`（Web Audio 合成，无音频素材）：野外
`workshop-field`（106 BPM）、战斗 `workshop-battle`（150 BPM）。默认关闭，
战斗面板上方的 `SoundToggle` 需二次确认才播放，选择记在 `localStorage`
（`cloudai:game-audio`），进入 / 结束战斗时自动换曲目。
动作音效：招式 `hit` / 重击 `crit`、精灵球 `capture`、药水与休息 `heal`、
防御 `guard`、换宠 `click`、逃跑 `flee`、遇敌 `encounter`、购买与补领 `coin`、
胜利 `win`、全灭 `lose`。

## 配置

默认每日进图 5 次、单次 2 cr；单趟 600 步、4 次遇敌；每日道馆 3 次、单次 5 cr；券单价 2 cr；
每日首次休息免费，之后付费休息 2 cr；里程碑 3/5/7/9 阶 → 6/15/30/80 tcr，
奖励 `rewardValidDays` 天内有效。后台可改次数、
票价、券单价、付费休息券价、单趟步数 / 遇敌上限、有效期与任意阶位里程碑；票价按券单价对齐整张，
阶位越界 / 重复由 `sanitizeWorkshopMilestones` 丢弃，`runMaxSteps` 夹在 20~5000、
`runMaxEncounters` 夹在 1~50。旧配置字段 `dailyGathers` / `gatherCostCredits` 读回时作为
`dailyExplores` / `exploreCostCredits` 的兜底，升级不会重置管理员调过的次数与票价。

## 验证

`tests/activity-games.test.ts` 覆盖：配置旧字段兼容与整张对齐、单趟上限进配置并喂给走位闸门、
里程碑清洗、阶位名、经验升级与自动进化 / 50 级封顶、旧存档迁移（含 `exploresToday → entersToday`
与 `run` 缺失）、路径游程编码与脏数据夹断、同一「区域 + 种子」复现同一张图 / 外圈封死 / 营地到
道馆连通、地貌决定遇敌率与移速与脚底碰撞、`fieldStepRandom` 只由种子与步数决定、分段重放与
整段重放游标一致、撞墙不计步 / 走满上限收兵、脏游标回营地、区域遭遇定点、属性克制、捕捉概率边界、
道馆胜利掉落与徽章、捕捉入队与道馆禁用精灵球、倒地自动换人 / 全灭判负（判负同时收兵回营地、
整队按四分之一血扶起）。

工坊金币掉落、商店补给与价格、旧档 `gold` 缺省 / 封顶另有单测覆盖
（`tests/activity-games.test.ts`）；走位并发修复与 `BattleFx` 音效 / 动画属于客户端行为，
做了类型检查与构建验证，未在真实浏览器里试听试玩。

战斗卡死修复（v0.54.1）的回归用例：三只灵宠（前排两只 1 血）连吃两回合防御后前排倒地、
中间与后排依次接管，每一步都过一遍 JSON + `normalizeWorkshopState` 读档往返，断言遭遇仍在；
以及服务端无遭遇时 `endedWorkshopBattle` 返回 `status = "ended"`、遭遇清空、无经验无掉落。
客户端 `router.refresh()` 收敛属于页面行为，同样只做了类型 / 构建验证，本机没有 `.env.local` 起不了登录态页面。

画家层另用无 DOM 的桩 `CanvasRenderingContext2D`（只认标准成员、坐标一律查 `NaN`）跑过
7000+ 帧：5 个区域 × 4 种种子 × 全部视野高度 × 4 个朝向 × 三档徽章，无异常、无非法颜色与
越界 alpha。真机手机与浏览器实测尚未做（本机没有可用的 `.env.local`，起不了需要登录态的页面）。

## 画面交互（v0.70.0）

- HUD 的活动券数改成按钮，点了切到「券包」页签；休息按钮旁边常驻说明为什么不能休息
  （战斗中 / 队伍状态已满 / 券不足还差几张），不用对着灰按钮猜。
- 战斗动作失败除了 toast 还在面板上方留一条错误条，带「同步进度」按钮拉权威存档；
  战斗结束（`state.encounter` 清空，经 `acceptData`）时自动收掉。
- 野外走位的全局 keydown 跳过 `INPUT` / `TEXTAREA` / `SELECT` 与 `contenteditable`，
  WASD 和 Enter 不再抢输入框。
- 页面把玩法卡挪到五行统计卡之前，手机首屏先看到能操作的部分。
