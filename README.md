# Cloudflare AI Console

充分利用 **Cloudflare Workers AI**（约 78 个模型）的全功能控制台，部署在 **Vercel** 上：
按功能分类在线生成（文本 / 图像 / 图像理解 / 嵌入 / 翻译），多用户使用记录与用量监控，
并对外提供 **OpenAI 兼容** 与 **Anthropic 兼容** 的 API 网关，供 Claude Code / Codex / Hermes 等编程工具直接调用。

## 功能进度

### 基础功能（P0-P6 已完成）

| 模块 | 说明 | 状态 |
| --- | --- | --- |
| 脚手架 | Next.js 16 + Tailwind v4 + 控制台布局 + 文档骨架 | ✅ |
| 模型库 | 同步 `/ai/models/search`，按分类展示 ~59 个模型 | ✅ |
| 鉴权 + 存储 | Auth.js 多用户，D1/KV over REST，业务表 | ✅ |
| 在线生成 | 文本流式 / 文生图 / 视觉 / 嵌入 / 翻译 | ✅ |
| 用量监控 | Neuron 记账、历史记录 | ✅ |
| API 网关 | OpenAI（chat/embeddings/models）+ Anthropic（messages） | ✅ |
| 部署 | 限流、Vercel 生产部署 | ✅ |

### 架构改造（2026-06-13 起，参考 new-api）

当前版本：**v0.13.1**（2026-10-30）—— 雷电行动内嵌双栏 + 机体 HP / 战机等级 / 击破回满 + 精英与 Boss 战利品掉落 + 装备上限 10 / 护盾 16 秒 / 弹幕密度下调（v0.13.1 修复后台保存装备上限报错）

| 阶段 | 说明 | 状态 |
| --- | --- | --- |
| **Phase A** | 视觉地基（shadcn 组件/主题/布局） | ✅ 完成 |
| **Phase B** | 数据内核 & 计量修复 | ✅ 部分完成 |
| ├─ 定价模块 | hosted ×1000 / proxied ×1 倍率 + 图像固定价 | ✅ |
| ├─ 倍率管理 | 管理员动态调整每个模型的倍率（0.01-100） | ✅ |
| ├─ 真实计量 | 按 token/neurons 计费 + 余额扣减 + error 记 0 | ✅ |
| ├─ 余额校验 | user + apiKey 双重余额预检 + 402 拒绝（预检输出按模型预留档位封顶，档位后台可调） | ✅ |
| ├─ 图像修复 | FLUX-2 multipart 响应解析 | ✅ |
| ├─ API Key 必需 | 所有 Playground 必须有 key，无 key 返回 403 | ✅ |
| └─ 流式计量 | 流式结束后按**终态** usage chunk 精确计量；截断流只计 input、output 记 0 | ✅ |
| **Phase C** | 数据看板 | ✅ 完成 |
| ├─ 用量聚合 | 小时/日趋势 + 模型排行 + credits 统计 | ✅ |
| ├─ 图表渲染 | recharts 折线/柱状/条形图 | ✅ |
| ├─ 时间切换 | 今日/本周/本月（修复 async searchParams） | ✅ |
| └─ 余额展示 | StatCard + 最近调用列表 | ✅ |
| **Phase D** | 令牌管理界面 | ✅ 完成 |
| ├─ Key 统计 | 每个 key 的调用次数 + 消耗 credits | ✅ |
| ├─ 额度进度 | 有限/无限额度可视化 + 进度条 | ✅ |
| ├─ 列表对齐 | CSS Grid 固定宽度列布局 | ✅ |
| └─ 状态管理 | 创建/编辑/禁用/删除 + 模型白名单 | ✅ |
| **Phase E** | 公开定价页 | ✅ 完成 |
| ├─ 定价展示 | 按类别展示所有模型实际计费价格 | ✅ |
| └─ 价格策略 | 显示应用倍率后的 credits 单价（cr / per K input token） | ✅ |
| **Phase F** | 管理后台 | ✅ 完成 |
| ├─ 用户管理 | 角色/余额/注册时间列表 | ✅ |
| ├─ 兑换码管理 | 额度/状态/使用情况 + 使用者追踪 | ✅ |
| ├─ 钱包页面 | 余额卡片 + 充值流水 | ✅ |
| ├─ 系统设置 | 定价倍率配置预览 | ✅ |
| ├─ 定价管理 | 管理员内联编辑模型倍率 | ✅ |
| └─ 设置页面 | 简化为仅显示用户 ID | ✅ |
| **Phase G** | 用户留存 | ✅ 完成 |
| ├─ 签到功能 | 日历签到 + 随机奖励 + 统计展示 | ✅ |
| ├─ 限时活动·幸运转盘 | 抽奖券购买 + 抽 1 次/10 次 + 累抽送券 + 外圈赠券奖型 + 后台奖池与返还率 + 活动记录与站点收益 | ✅ |
| └─ 限时活动·雷电行动 | 纵版射击三关 + 机体 HP/战机等级/击破回满 + 精英与 Boss 战利品 + 内嵌双栏作战面板 + cr 购买装备/复活 + 服务端用时校验 + 后台配置与活动记录 | ✅ |
| **Phase H** | AI 供应商渠道管理 | ✅ 完成 |
| ├─ 适配器框架 | OpenAI/Anthropic/Cloudflare 适配器 + 注册表 | ✅ |
| ├─ 渠道 CRUD | 动态配置表单 + 搜索过滤 + 状态切换 | ✅ |
| ├─ 渠道详情 | 关联密钥/模型列表/热门排行/统计 | ✅ |
| ├─ 健康检查 | 验证上游 API 连接是否正常 | ✅ |
| ├─ 模型同步 | 从上游拉取模型列表写入定价表 | ✅ |
| └─ 渠道路由 | OpenAI/Anthropic 请求直通转发 | ✅ |

**开发中**：
- ✅ 活动轮次支持：`lottery_ticket` / `lottery_draw` 加 `activityKey` 字段，管理端可配置「活动结束时未使用券作废」；保底按活动轮次重置（新活动连续未中计数清零）；记录页只显示当期活动的战绩与明细（新活动重计）
- ✅ 页面切换性能优化：dashboard layout 每次导航的 2 次 D1 查询（用户 role + siteName）优化为 role 存 JWT、siteName 用 `unstable_cache` 缓存 1 小时，管理员修改时 `revalidateTag` 立即失效
- ✅ 返还率计算修复：后台返还率提示现在计入累抽送券成本（此前改送券档位返还率不变）
- ✅ 保底机制重做：阈值 8→12 次，去掉固定翻倍，改为每多 1 次未中外圈概率 +0.5%（上限 35%），中大奖后清零重计；转圈动画期间实时显示本次外圈概率（含保底提升）
- ✅ 买券按钮余额不足时禁用，显示「需 X cr / 余额 Y cr」，防止负债买券
- ✅ 线上故障修复：累抽赠券唯一索引加 activityKey（跨活动轮次冲突导致开奖失败）；isUniqueConflict 兼容 Drizzle 错误格式；JWT 缺失 role 导致全站卡顿+抽奖失败；登录页 authChannels 并行查询
- ✅ 10连抽同一扇区多次命中时指针并排显示（加角度偏移，避免重叠成一根）
- ✅ 买券失败时返回具体错误原因（不再统一返回「发券失败」，便于线上定位）
- ✅ 买50张券发券失败修复：grantTickets 的 batchRows 列数从8改为10（实际INSERT含10个字段），避免120参数超D1的100参数限制；多批插入改并行，100张券从~5秒降到~1.5秒
- ✅ 中奖墙重做：横向滚动改纵向无缝自动滚动（60秒一轮，悬停暂停），配色走主题 token（中性灰底 + 前景色文字，去掉绿/金彩色金额与写死的白色字），h-56 高度、去掉会糊住文字的渐隐遮罩，emoji 图标保留
- ✅ 右侧区域布局优化：我的战绩移到顶部，卡片顺序调整为战绩→结果→中奖墙→规则；战绩卡片配色简化（数字用主题前景色 + 中性底，去掉渐变和三色，浅色主题下不再是白底白字）；左侧转盘区域间距收紧减少下方空白
- ✅ 奖池模拟器 `scripts/lottery-sim.ts`：只读配置，支持单抽/十连批次、批前保底快照与赠券续抽；修复短周期伪随机及静默截断，输出有效返还、每券 cr 差额和按会话计算的抽样误差。`--soften/--target` 仅生成本地候选，不能将模拟值当历史返还保证（参数和回归测试见 `docs/features/lottery.md`）

**最新更新（v0.13.0）**：
- ✅ 雷电行动改为内嵌双栏：左侧 2:3 游戏画面 + 右侧「作战面板」（准备期装备/记录/排行/规则，出击后实时战况），两者同高占满控制台可视区，窄屏单列堆叠；不再整页全屏独占
- ✅ 机体 HP 系统：上限 100 HP，弹幕 -10、撞敌机 -38/-50、撞障碍与光束 -34，HP 归零才掉命；受击 0.9 秒无敌与护盾分开计时，画面内机体血条 + HUD + 作战面板同步显示当前/上限
- ✅ 战机等级 Lv 与击破回满：Lv 由火力/散射/导弹等级合成；每累计击破 25 架机体 HP 回满，HUD 与作战面板显示回满进度
- ✅ 精英与 Boss 战利品：精英 60% 掉 1~3 cr 金色战利品箱、Boss 固定掉 4 箱（2~4 cr），通关未拾取的自动回收；服务端按 20/24/28 cr 封顶后并入关卡奖励，流水与结算面板单独标注
- ✅ 难度下调：敌机与三套 Boss 的开火间隔、单轮弹数、弹速全面放缓，敌机与障碍血条常显（精英金边）
- ✅ 装备上限 火力/炸弹/备用机体各 10（护盾仍为开关）、出击火力最高 Lv11、炸弹最高 13 发；能量护盾 8 秒 → 16 秒
- ✅ 修复：作战面板净收益漏减复活花费；撞击伤害在击毁之后结算导致「撞死敌机不扣血」
- ✅ v0.13.1 修复：后台把装备单局上限填 10 保存时报「单局上限应不超过 2」——保存校验仍写着旧常量，现统一读 `RAIDEN_ITEM_MAX_CAP`（10 / 10 / 1 / 10）

**上一版本（v0.12.0）**：
- ✅ 雷电行动全屏化：开始菜单（装备/记录/排行/规则）、关卡与用时、得分与奖励、Boss 血条、护盾/散射/导弹状态、准备倒计时、暂停与结算全部内嵌在 2:3 游戏画面内
- ✅ 手感重做：Lv1 改为 2 发窄角机炮（不再 7 发广角），S 提供侧向散射、M 提供追踪导弹；护盾改为 8 秒并在 HUD 正常倒计时（修复整局无敌）；敌机生命上调，撞击会击毁敌机并扣命
- ✅ 关卡加长与障碍物：三关 Boss 延后到约 92/104/116 秒并补齐波次；每关新增水雷/拒马/集装箱/陨石等可击毁障碍，低血量冒烟、显示血条、有概率掉落补给
- ✅ 战机成长可视化：火力等级加装机炮、双发尾焰、装甲与更宽机翼（满级金边），S/M 等级显示散射荚舱与导弹挂架；击破特效按机型区分（残骸、扩散环、二次连爆、震屏）

**上一版本（v0.11.0）**：
- ✅ 限时活动·雷电行动 `/raiden`：高仿雷电 3 的纵版射击（480×720 Canvas、三关独立波次与 Boss、程序化音效），自动射击 + 相对拖动、炸弹清屏、暂停与付费复活；活动默认关闭，开关/时间窗/每日次数后台可配
- ✅ cr 双向流动：出击前用 cr 购买火力强化/炸弹/护盾/备用机体（服务端按配置重算价格），通关发首通与重复奖励到临时余额（默认 30 天有效），重复奖励按北京自然日封顶；装备、复活、奖励全部记 `topup type=11`
- ✅ 服务端只信墙钟：一局由服务端发号，结算校验关卡顺序、真实用时上下限与分数上限；`uq_raiden_clear(runId, stageNo)` 挡重复结算、`raiden_progress` 主键抢首通，D1 无事务下按相反顺序补偿回滚
- ✅ 后台 `/admin/settings` 雷电配置卡（实时预览满装备价与奖励合计）+ `/admin/raiden` 活动记录（净收益/出击/首通/榜单/最近明细，按活动轮次隔离）；新表 `raiden_run` / `raiden_clear` / `raiden_progress`（迁移 019，启用前执行）

**上一版本（v0.10.0）**：
- ✅ 消费返利 `/cashback`：按北京自然日结算，用户手动领取近 N 天（默认 3 天）的消耗返现，默认比例 10%、满 20 cr 起返、单日封顶 200 cr，进临时余额 7 天过期；新表 `cashback_claim`（迁移 017 已在线上 D1 执行）以 `uq_cashback_claim(userId, periodDate)` 挡并发重复领取
- ✅ 用量冲榜：同页展示窗口内按用户聚合的真实消耗（脱敏昵称、自己那行高亮），SQL 只 `GROUP BY`、排序放 JS（D1 不支持 `ORDER BY` 聚合表达式）；排行榜只读不发放
- ✅ 任务成就 `/tasks`：7 个一次性任务（首次对话 / 跑通 API / 首次充值 / 累计签到 7 天 / 首次邀请 / 首次抽奖 / 首次领返利），进度**现场读业务表**不落库，`user_task`（迁移 018）只记「领过」；新表 + 后台可按任务 key 覆盖额度，默认合计 70 cr
- ✅ 充值阶梯赠送：按订单实付取满足的最高一档送临时余额（默认 30 天有效），发放挂在 `settleRechargeOrder` 抢占成功分支且**失败绝不回滚主充值**；充值弹窗实时预告「本单额外赠送 X cr」
- ✅ 三项活动**全部默认关闭**，比例 / 门槛 / 封顶 / 档位 / 有效期 / 每任务额度都在后台可调；钱包流水新增 `type=8 消费返利`、`type=9 任务奖励`、`type=10 充值赠送`，到期过滤同步登记进 `lib/billing/grant-expiry.ts`

**上一版本（v0.9.0）**：
- ✅ 站内聊天 `/chat`：多轮对话自动存进 `chat_session` / `chat_message`（迁移 016 已在线上 D1 执行），标题自动取首条消息摘要、可重命名 / 置顶 / 删除；回答走 markdown 渲染，代码块带语言标签与一键复制，推理模型的思考链可折叠
- ✅ 流式交互：Enter 发送、「停止」中断（半截回答照旧落库并标注被中断）、「重新生成」替换旧回答不重复问题、「编辑重发」从那条消息起重建
- ✅ 计费口径不变：`/chat` 复用 `/api/ai/text`（预检 → 扣费 → 用量日志），不另起一套；扣费仍按上游真实 usage 结算
- ✅ 补两处站内 playground 漏口：走第三方渠道的请求此前绕过余额预检（0 额度也能打外部渠道），现在预检上移到渠道路由之前；`/api/ai/*` 五个端点补每用户每类任务 30 次/分的进程内护栏，超限 429
- ✅ 端到端可在非 3000 端口跑：`PLAYWRIGHT_BASE_URL` + 覆盖 `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL`（否则未登录请求会被重定向到 `.env.local` 里写死的 3000）

**上一版本（v0.8.0）**：
- ✅ 邀请返利：`/invite` 展示邀请码/链接/最近邀请，好友经 `?ref=` 注册后双方获得永久余额（默认 300 / 200 cr），记 `topup type=7` 流水；后台可开关并调额度
- ✅ 签到连签奖励：连续签到每满 7 天额外 +200 cr（后台可配），签到卡新增「连签 N 天」徽标与连续签到统计；签到切日统一按北京时间
- ✅ API 上手页 `/docs`：base_url、鉴权方式、端点表、curl / OpenAI SDK / Anthropic SDK / embeddings 示例一键复制、错误码表

**上一版本（v0.7.0）**：
- ✅ 每日免费抽 1 次：每个用户每天第 1 次单抽不消耗券，服务端验证防作弊；活动记录与管理端明细新增「免费」来源标签
- ✅ 保底机制 / 幸运值：连续 8 次未中外圈正档后下一次外圈概率翻倍，前端进度条实时展示，中大奖后计数清零
- ✅ 外圈奖品新增「永久余额」类型：按倍数结算后直接发永久余额（不过期），转盘绿色扇区 + 「永久」标记，后台可配
- ✅ 大奖实时播报 / 中奖墙：活动页展示最近 24 小时大奖记录（脱敏用户 + 奖品 + 相对时间），横向滚动播报

**上一版本（v0.6.0）**：
- ✅ 限时活动·幸运转盘（`/lottery`）：credits 买券 + 抽 1 次 / 10 次，暗色霓虹双圈转盘（内圈固定加减 cr、外圈按倍数结算，扇区角度即真实概率），累抽满档送券；账本走 `lottery_ticket` + `lottery_draw`，买券按「临时余额→永久余额」扣、中奖发进会过期的临时余额
- ✅ 外圈赠券奖型：外圈奖品可为「+N 张抽奖券」，不折算成 cr、不写流水，转盘单独用金色标注
- ✅ 后台活动配置：内/外圈奖池权重即概率、券价、外圈概率、倍数基数、累抽档位可调，顶部实时显示内圈期望 / 外圈期望 / 单券综合 / 返还率 / 站点每券净得；**内圈绝对 cr、外圈倍数**，因此券价是独立的利润率杠杆
- ✅ 活动记录与站点收益：用户侧「我的活动记录」，管理侧 `/admin/lottery`（今日/近 7 日/近 30 日/全部 + 净收益概览 + 按用户聚合 + 最近 200 注明细），只读聚合不加新表
- ✅ 10 连抽整批算完再一次写库：D1 串行往返 40+ → 9，一次 10 连抽 7~10 秒降到 2.4 秒；任一写入失败整批回滚，不留「10 注里留下 3 注」
- ✅ 在线充值对账闭环：服务端主动查单（`api.php?act=order`）+ 幂等结算 + 手动对账补发/关闭 + `/admin/orders` 订单管理页 + Vercel Cron 每日兜底对账 + 下单限流
- ✅ LinuxDO 积分充值：新增 `linuxdo` 渠道（易支付兼容协议、MD5 签名），与易支付共用一套订单/对账/幂等发放体系
- ✅ 看板改版：北京时间问候行 + 四张分组卡（账户/使用/资源/性能）+「模型数据分析」五 tab + 公告/问答/服务可用性三张信息卡（后台可配，可用性未配 Uptime 地址时自检本站端点）
- ✅ 全站货币口径收敛为 Credits（移除界面美元显示），模型单价按 `cr / per K input token` 展示为**实付价**（表价 × 模型倍率 × 基础倍率）
- ✅ 余额预检按模型「预留档位」封顶 output tokens（新增 `model_pricing.reserveOutputTokens`），修掉 Claude Code 一类客户端 `max_tokens=32000` 被预检挡成 402；402 文案带需要/可用具体 cr 并补写 error 流水
- ✅ 修复：流式调用漏计 input tokens、截断流把 usage 占位桩当真实用量计费、一次买 ≥17 张券「扣钱不给券」（D1 100 绑定参数上限）、累抽送多张的档位全部静默失效、`/admin/settings` 全量 JSON 编辑器把支付密钥渲染进 DOM、看板「今日分布」把昨天算进今天、`scripts/run-migration.js` 空执行却报成功

**上一版本（v0.5.0）**：
- ✅ 易支付在线充值（初版）：钱包双 Tab（在线充值 ¥10/30/68/128 / 兑换码），支付宝+微信，回调验签幂等发放永久余额，`payment_order` 订单表 + `/admin/settings` 支付配置（网关/PID/密钥/汇率/限额）
- ✅ Free Plan 模型标记：5 个需 Workers Paid 模型（deepseek-v4、glm-5.2、kimi-k2.6 等）在模型库/定价页显示徽章，Playground 自动过滤
- ✅ Dashboard 模型/渠道分布图跟随时间范围切换（今日/近 7 日/近 30 日）
- ✅ 计费口径澄清：`model_pricing` 表价即 cr（不再二次乘汇率），修复 Dashboard 500（server→client 函数传递）
- ✅ 渠道图表 E2E 测试（`tests/e2e/channel-charts.spec.ts`）

**上一版本（v0.4.0）**：
- ✅ Playground 渠道路由：嵌入/翻译/文生图/图像理解 4 条路由支持第三方渠道转发
- ✅ 工具调用端到端支持：Anthropic ↔ OpenAI 双向转换（`lib/relay/anthropic.ts`），适配 Claude Code 智能体循环
- ✅ 推理模型思考链渲染：`reasoning_content` 可折叠展示 + 动态上下文窗口进度条
- ✅ API Key 模型白名单按渠道过滤
- ✅ 渠道元数据同步（上游定价/上下文窗口/分类纠正）+ 定价页/模型库渠道标签修复
- ✅ 主题配色扩展至 7 套（default/anthropic/cloudflare/ocean/emerald/violet/rose）
- ✅ 侧边栏品牌名可配置（系统设置 `siteName` 即时生效）

**上一版本（v0.3.1）**：
- ✅ AI 供应商渠道管理：完整 CRUD + 适配器框架 + 健康检查 + 模型同步（详见下方 Phase H）
- ✅ 签到功能（日历 UI + 每日签到获得随机额度奖励）
- ✅ 管理员定价管理（动态调整模型倍率 0.01-100）
- ✅ 兑换码额度修正（50 → 5）
- ✅ 用户余额重新结算（按实际充值消耗计算）

**变更详情**：见 [`CHANGELOG.md`](CHANGELOG.md) 和 [`CLAUDE.md`](CLAUDE.md)


## 快速部署

### 一键部署到 Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyour-username%2FCloudflareAI&env=CF_ACCOUNT_ID,CF_API_TOKEN,CF_D1_DATABASE_ID,CF_KV_NAMESPACE_ID,AUTH_SECRET,GITHUB_CLIENT_ID,GITHUB_CLIENT_SECRET)

点击按钮后，Vercel 会要求你填入以下环境变量：

| 环境变量 | 说明 | 获取方式 |
| --- | --- | --- |
| `CF_ACCOUNT_ID` | Cloudflare 账户 ID | [Dashboard](https://dash.cloudflare.com) 右侧 "Account ID" |
| `CF_API_TOKEN` | API Token（需要 Workers AI / D1 / KV 权限） | [创建 Token](https://dash.cloudflare.com/profile/api-tokens) |
| `CF_D1_DATABASE_ID` | D1 数据库 ID | 见 [D1 创建步骤](#d1-数据库) |
| `CF_KV_NAMESPACE_ID` | KV 命名空间 ID | 见 [KV 创建步骤](#kv-命名空间) |
| `AUTH_SECRET` | Auth.js 密钥（32 字节随机） | 运行 `openssl rand -base64 32` |
| `GITHUB_CLIENT_ID` | GitHub OAuth App Client ID | 见 [GitHub OAuth 配置](docs/SETUP.md#github-oauth) |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App Secret | 同上 |

部署完成后：
1. 访问你的 Vercel 域名（如 `https://your-app.vercel.app`）
2. 注册账户或用 GitHub 登录
3. 在 `/keys` 页面创建 API key
4. 在编程工具（Claude Code / Codex）中配置 base URL 为你的域名

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/your-username/CloudflareAI.git
cd CloudflareAI

# 安装依赖
npm install

# 复制环境变量模板
cp .env.local.example .env.local

# 编辑 .env.local，填入 Cloudflare 配置和 Auth.js 密钥

# 应用数据库迁移（首次运行）
npm run db:migrate

# 启动开发服务器
npm run dev
```

访问 http://localhost:3000

### D1 数据库

创建 D1 数据库并获取 ID：

```bash
# 在 Cloudflare Dashboard 创建
# 或使用 Wrangler CLI
wrangler d1 create cloudflare-ai-console
# 输出中的 "database_id" 即为 CF_D1_DATABASE_ID
```

应用迁移（通过 D1 HTTP API）：

```bash
npm run db:migrate
```

### KV 命名空间

```bash
# Cloudflare Dashboard: Workers & Pages > KV > Create namespace
# 或使用 Wrangler
wrangler kv:namespace create cloudflare-ai-console
# 输出中的 "id" 即为 CF_KV_NAMESPACE_ID
```

## 使用示例

### 在 Claude Code 中使用

1. 在控制台 `/keys` 页面创建 API key（如 `sk-cfai-xxxxx`）
2. 配置 Claude Code：

```json
{
  "customModels": [
    {
      "provider": "openai",
      "model": "@cf/meta/llama-3.1-8b-instruct",
      "apiKey": "sk-cfai-xxxxx",
      "baseURL": "https://your-app.vercel.app/v1"
    }
  ]
}
```

### 在 Continue / Codex 中使用

```json
{
  "models": [
    {
      "title": "Cloudflare Llama 3.1",
      "provider": "openai",
      "model": "@cf/meta/llama-3.1-8b-instruct",
      "apiKey": "sk-cfai-xxxxx",
      "apiBase": "https://your-app.vercel.app/v1"
    }
  ]
}
```

### cURL 测试

```bash
# OpenAI 格式
curl https://your-app.vercel.app/v1/chat/completions \
  -H "Authorization: Bearer sk-cfai-xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "@cf/meta/llama-3.1-8b-instruct",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# Anthropic 格式
curl https://your-app.vercel.app/v1/messages \
  -H "x-api-key: sk-cfai-xxxxx" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "@cf/meta/llama-3.1-8b-instruct",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## 技术栈

- **Next.js 16（App Router）+ TypeScript**，部署 Vercel
- **Tailwind CSS v4** + 自建轻量 UI 组件 + lucide 图标
- **Auth.js (NextAuth v5)** 多用户登录（邮箱密码 + GitHub OAuth）
- **Cloudflare D1 + KV**（通过 REST API 从 Vercel 访问），**Drizzle ORM** 管理 schema/迁移
- **Zod** 校验，**内存限流**（60 req/min per user）

## 功能亮点

- **59+ 模型**：自动同步 Cloudflare Workers AI 全模型目录，按功能分类，显示应用倍率后的实际计费价格
- **在线生成**：5 个 playground（文本对话流式/文生图/图像理解/嵌入/翻译）
- **真实计量**：按 token/neurons 精确计费，余额预检 + 双重扣减（user + apiKey），error 不扣费
- **数据看板**：问候式头部 + 四组核心指标（账户数据 / 使用统计 / 资源消耗 / 性能指标），「模型数据分析」卡内五个 tab（消耗分布 / 调用趋势 / 调用次数分布 / 调用次数排行 / 渠道分布），时间范围切换（今日/近 7 日/近 30 日）；底部三张信息卡（系统公告 / 常见问答 / 服务可用性），内容由管理员在系统设置中配置
- **用户留存**：
  - 新用户注册奖励（2000 credits）
  - 签到功能（日历 UI + 每日随机奖励 10-100 cr）
  - 限时活动·幸运转盘（`/lottery`）：credits 购券开奖，内圈固定加减 cr、外圈按倍数结算 cr 或直接赠抽奖券（界面只显实际 cr，单抽与 10 连分列），券价是独立的利润率杠杆、后台实时重算返还率，累抽满档位送券；中奖进临时余额、倒扣先扣未过期的临时余额再扣本金（本金允许扣成负数，与消费扣费同一优先级），资金变动统一 `topup type=6` 流水（赠券不动 cr），活动账目不进钱包「充值记录」、统一在「我的活动记录」可查；一次 10 连抽整批算完再一次性写库（约 2.4 秒，失败整批退回不留半截状态）；「我的活动记录」逐次可查，管理端 `/admin/lottery` 看用户参与与站点净收益
- **兑换码系统**：批量生成、状态管理、使用者追踪（显示谁兑换了哪个码）；生成时有安全上限（单码额度 ≤ 100,000 cr、单码使用次数 ≤ 1,000、一次 ≤ 100 个）
- **定价管理**：管理员可动态调整每个模型的倍率（0.01-100），实时生效
- **API 网关**：OpenAI + Anthropic 双协议兼容，供编程工具直接调用
- **多用户**：邮箱密码注册 + GitHub OAuth，D1 存储用户/会话/余额/用量日志

## 贡献

欢迎 PR！主要方向：
- 语音/视频 playground 实现（集成第三方 API）
- 分布式限流（Upstash / Cloudflare Workers KV）
- API 网关流式格式完全兼容 Anthropic SSE
- Dashboard 图表可视化

## 许可

MIT

---

**Powered by Cloudflare Workers AI + Next.js 16 + Vercel**

## 文档

- [`CHANGELOG.md`](CHANGELOG.md) — 版本变更记录（遵循 Keep a Changelog 规范）
- [`docs/API_ROUTES.md`](docs/API_ROUTES.md) — **API 路由规范**（遵循 new-api 标准约定）
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — 架构与目录结构
- [`docs/MODELS.md`](docs/MODELS.md) — 模型分类与 Workers AI 要点
- [`docs/API.md`](docs/API.md) — API 网关用法（OpenAI / Anthropic 兼容）
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — Vercel + Cloudflare 部署
- [`docs/features/checkin.md`](docs/features/checkin.md) — 签到功能设计文档
- [`docs/features/lottery.md`](docs/features/lottery.md) — 限时活动·幸运转盘（玩法、账本口径与实现注意）
- [`docs/features/cashback.md`](docs/features/cashback.md) — 消费返利与用量冲榜（结算口径、防重放、排行榜实现注意）
- [`docs/features/task-achievements.md`](docs/features/task-achievements.md) — 任务成就一次性奖励（清单、判定与额度覆盖）
- [`docs/features/recharge-bonus.md`](docs/features/recharge-bonus.md) — 充值阶梯赠送（档位口径与发放失败面）
- [`docs/features/raiden.md`](docs/features/raiden.md) — 限时活动·雷电行动（玩法、经济口径、服务端校验与实现注意）
- [`docs/features/channel-management.md`](docs/features/channel-management.md) — AI 供应商渠道管理设计文档
- [`CLAUDE.md`](CLAUDE.md) — 项目指令和改造路线图

> 约定：**每次提交都同步更新相关 md 文档**，并在 `CHANGELOG.md` 追加版本记录。
