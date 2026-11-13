# 限时活动·灵宠工坊（v0.45.0，v0.51.0 改为冒险地图）

红白机式养成：开局三选一初始灵宠，花活动券进图，在俯视角的冒险地图里一格一步地走，
草丛里摇出野生灵宠后用招式打倒或精灵球捕捉，升级到门槛自动进化，走到地图另一头的道馆
按徽章顺序挑战，图鉴记录见过的每一阶。两只同阶灵宠仍可合成一只高一阶，作为不花券的加速路径。

- 前台：`/workshop`（侧边栏「灵宠工坊」，活动中心默认展示）
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
   不会把人卡在野外。药水回复 20 点，每天可免费休息一次回满整队（限营地；
   整队倒地时这一道闸放开，否则没药水就只能一直躺着）。
8. **道馆**：道馆在地图另一头，必须把主角走到它跟前一格才能挑战（服务端按光标坐标判邻居），
   按徽章数顺序发放，胜利给徽章 + 2 精灵球 + 2 药水；三枚徽章解锁星陨高地。
9. **合成**（保留）：两只同线同阶灵宠合成一只高一阶（取两者较高等级、满血），不花券、
   不会失败；队伍↔队伍留在队伍，仓库内合成留在仓库。
10. **里程碑**：任意一条线首次达到配置阶位发一次 tcr，`tierKey = tier:N`；判定取图鉴与当前
    灵宠的最高阶，合成消耗掉低阶灵宠也不会让已达成阶位回退。
11. **图鉴**：3 条线 × 9 阶，拥有某阶即视为见过 1~该阶；未解锁格位显示剪影。

## 存档结构

整份进度存 `workshop_state.state` JSON：`day / entersToday / gymsToday / starter / party /
box / dex / items{ball,potion} / badges / activePetId / run / encounter / restDay`。纯数据与纯函数
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
- Server Action 限流：`workshop-enter` 30 次/60s、`workshop-walk` 240 次/60s（走位是逐格高频上报）。

## 画面

`components/workshop/field-painter.ts` 是纯绘制的红白机式画家（格、装饰、主角、小地图、HUD），
`components/workshop/field-canvas.tsx` 负责逐格行走、攒路径上报与服务端游标纠偏。
逻辑视野固定宽 640，高度随画布 CSS 比例推导（窄屏 4:3 且不超过屏高 42%，宽屏 16:9），
位图按 `CSS 宽 / 640 × devicePixelRatio`（夹 1~2）放大，`ctx.setTransform` 回到逻辑坐标，
所以画面在大屏和手机上都铺得开又不会被拉伸。

## 配置

默认每日进图 5 次、单次 2 cr；单趟 600 步、4 次遇敌；每日道馆 3 次、单次 5 cr；券单价 2 cr；
休息免费；里程碑 3/5/7/9 阶 → 6/15/30/80 tcr，奖励 `rewardValidDays` 天内有效。后台可改次数、
票价、券单价、单趟步数 / 遇敌上限、有效期与任意阶位里程碑；票价按券单价对齐整张，
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

画家层另用无 DOM 的桩 `CanvasRenderingContext2D`（只认标准成员、坐标一律查 `NaN`）跑过
7000+ 帧：5 个区域 × 4 种种子 × 全部视野高度 × 4 个朝向 × 三档徽章，无异常、无非法颜色与
越界 alpha。真机手机与浏览器实测尚未做（本机没有 Node / npm，起不了 `npm run dev`）。
