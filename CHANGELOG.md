# 更新日志

本项目的所有重要变更都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.3.1] - 2025-06-25

### 修复

- **API Key 创建功能**
  - 修复 `encryptedKey` 列缺失导致创建失败的问题
  - 添加缺失的环境变量 `API_KEY_ENCRYPTION_SECRET`
  - 更新 `.env.example` 添加加密密钥说明
- **API Key 查看功能**
  - 修复密钥查看按钮提示"解密失败"的问题
  - 配置独立的开发和生产环境加密密钥
- **API Key 名称显示**
  - 修复 Drizzle ORM leftJoin 字段映射 bug
  - Key 名称不再错误显示为渠道名称
  - 改用手动查询映射避免字段错位

### 新增

- **数据库迁移工具**
  - `scripts/run-migration.js` - 通过 D1 HTTP API 执行 SQL 迁移
  - `scripts/check-schema.js` - 检查表结构
  - `scripts/check-keys.js` - 验证 API Keys 数据
  - `scripts/add-encrypted-key.js` - 添加 encryptedKey 列
- **文档**
  - `docs/fixes/2025-06-25-keys-page-fixes.md` - API Key 修复详细记录
  - `docs/fixes/2025-06-25-drizzle-leftjoin-bug.md` - Drizzle ORM Bug 分析
  - `docs/VERCEL_ENV_SETUP.md` - Vercel 环境变量配置指南
  - `COMPLETE_FIX_SUMMARY.md` - 完整修复总结

### 技术债务

- 识别并记录 Drizzle ORM leftJoin 在同名字段时的映射问题
- 建议对所有使用 leftJoin 的查询进行 code review

---

## [0.4.0] - 2026-06-26

### 新增

- **Playground 渠道路由扩展**（所有 4 个 playground API 路由现支持第三方渠道转发）
  - `lib/channels/lookup.ts` — 共享渠道查询 helper（查 modelPricing.channelId → 回退 apiKeys.channelId）
  - **嵌入向量**（`/api/ai/embeddings`）：body 转换 `{ text }` → `{ input }`，走 `/v1/embeddings`
  - **LLM 翻译**（`/api/ai/translate` LLM 分支）：body 直接兼容，走 `/v1/chat/completions`
  - **文生图**（`/api/ai/image`）：body 转换 `{ prompt, num_steps, guidance }` → `{ model, prompt, n:1 }`，走 `/v1/images/generations`；响应 OpenAI URL → 下载 → base64 data URL
  - **图像理解**（`/api/ai/vision`）：body 转换 `{ prompt, image: bytes }` → OpenAI messages `[{ text }, { image_url }]`，走 `/v1/chat/completions`
  - 非 200 响应解析上游 JSON error 并正确回传
  - 用 `after()` 异步记 usage（含 `channelId`）
  - 上游 real usage 优先用于计费（embeddings/vision fallback 估算）
- **Playground 前端渠道模型显示**（`/playground/*` 所有页面）
  - 文生图 / 图像理解 / 嵌入向量 / 翻译页面现在也显示非 Cloudflare 渠道模型
  - 渠道模型在模型选择器中显示 `[渠道名]` 后缀，调用时走后端渠道路由转发
- **站内 Playground 增强**
    - DeepSeek-v4 等推理模型的 `reasoning_content` 渲染为可折叠灰色块
    - 显示「🧠 思考过程」标签 + token 估算，默认展开，点击可折叠
    - 正文内容与思考链视觉分离，移动端体验友好
  - **动态上下文窗口显示**
    - toolbar 新增只读进度条：`已用 tokens / contextWindow (百分比)`
    - 切换模型时自动加载该模型的 ctx 元数据（Cloudflare hosted 模型有值，第三方渠道模型未知时显示「模型 ctx 未知」）
    - 本地估算对话累计 token（CJK ≈ 1 token/char，拉丁 ≈ 1 token / 4 chars）
  - **简化输出控制**
    - 移除 `max_tokens` 手动输入框，单次输出长度交由模型默认值决定
    - 避免用户混淆「单次输出上限」与「上下文窗口」两个概念
- **API Key 模型白名单按渠道过滤**（`/keys`）
  - 创建/编辑 key 时，模型白名单候选列表自动按所选渠道过滤
  - 默认渠道（Cloudflare）→ 显示所有 hosted 模型
  - 第三方渠道（DeepSeek/OpenAI/...）→ 仅显示该渠道关联模型
  - 切换渠道时自动重置已勾选模型，避免跨渠道误配
  - 编辑历史 key 时，已勾选但不属于当前渠道的模型标记为「不属于当前渠道」（灰色提示），避免意外丢失
- **AI 供应商渠道管理（Channel Management）**
  - 完整 CRUD 管理界面：`/admin/channels` + `/admin/channels/[id]` 详情页
  - 动态配置表单：根据渠道类型（OpenAI/Anthropic/Azure/Cloudflare）自动切换配置字段
  - 适配器注册表（`lib/channels/registry.ts`）：统一管理各渠道适配器实例
  - **OpenAI 适配器**（`lib/channels/openai-adapter.ts`）：直通 OpenAI API、健康检查、模型列表获取
  - **Anthropic 适配器**（`lib/channels/anthropic-adapter.ts`）：直通 Anthropic API、健康检查、内置模型列表
  - **Cloudflare 适配器**（`lib/channels/cloudflare-adapter.ts`）：占位（内置逻辑）
  - **渠道健康检查**：`GET /api/channels/[channelId]/health` — 验证上游 API 连接是否正常
  - **渠道模型同步**：`POST /api/channels/[channelId]/models/sync` — 从上游拉取模型列表写入定价表
  - **渠道模型倍率管理**：`PUT/DELETE /api/channels/[channelId]/models/[modelId]`
  - **渠道统计 API**：`GET /api/channels/[channelId]/stats` — 总览/日趋势/模型排行/近期错误
  - 详情页：关联密钥列表 + 渠道模型展示 + 热门模型排行 + 配置信息
  - 列表页支持搜索过滤、状态切换、健康检查操作
- **工具调用（Function Calling）端到端支持**（`/v1/messages` + `/v1/chat/completions`）
  - 新增 `lib/relay/anthropic.ts`：Anthropic ⇆ OpenAI 双向转换（参考 new-api `relay-claude.go`）
    - 请求：`tool_use`(assistant) → OpenAI `tool_calls`；`tool_result`(user) → 独立 `role:"tool"` 消息；
      `image` block → `image_url`；`tools` / `tool_choice` 正确映射
    - 响应：OpenAI `tool_calls` → Anthropic `tool_use` block；`finish_reason` → `stop_reason`
  - `lib/usage/anthropic-stream.ts` 重写为块索引状态机：发射 `tool_use` content block + `input_json_delta`
  - `lib/usage/stream-intercept.ts` 新增 `openAIResponseToSSE`：把非流式结果回放成 OpenAI SSE（含 `tool_calls` deltas）
  - 适配 Claude Code 的 `tool_use → tool_result` 智能体循环
- **翻译双路径架构（LLM + m2m100）**
  - 新增 LLM 翻译路径：用文本模型 + 翻译提示词（`/api/ai/translate`），CJK 质量远优于 m2m100
  - `@cf/meta/m2m100-1.2b` 保留为「快速 · CJK 有限」选项
  - 翻译页 `/playground/translate`：模型下拉新增所有 hosted 文本模型，默认排序优先非推理 instruct 模型
    （`llama-3.3` / `llama-4` / `gemma-4` / `mistral-small` / `gpt-oss`），避免推理模型为隐藏思考多计 output token
  - 新增**源语言选择器**（自动检测 / zh / en / es / fr / de / ja / ko）
  - 路由防御性剥离 `<think>…</think>` 块，避免推理模型思考内容混入译文
- **主题配色扩展**
  - 新增 4 套配色预设：Ocean（蓝）/ Emerald（绿）/ Violet（紫）/ Rose（玫红）
  - 连同原有 default / anthropic / cloudflare 共 7 套，可在右上角主题菜单切换
  - **每套配色现均定义完整的背景色系**（--background / --card / --border 等 25+ 令牌），
    不再共享中性灰背景 —— Ocean 有淡蓝背景、Emerald 有薄荷背景、Violet 有淡紫背景、Rose 有腮红背景、
    Cloudflare 有暖橙调背景、Anthropic 保持奶油纸背景
  - 明暗两套（light + dark）各配色独立调校，sidebar / chart / ring 等辅助色随主题一致
- **侧边栏品牌名可配置**
  - 导航顶部品牌名改为读取系统设置 `siteName`（`/admin/settings` > 站点名称）
  - 保存后 `revalidatePath("/", "layout")`，改名即时生效
- **流式真实计量**
  - 拦截 OpenAI/Anthropic gateway 和 playground 的 SSE 流
  - 解析末尾 `usage` chunk 拿到真实 `prompt_tokens` / `completion_tokens`
  - 使用 Next.js 15 `after()` API 确保 Vercel serverless 在响应后继续运行 `logUsage`
  - 验证：outputTokens 从估算值 2048 降到真实值（如 16 tokens）
- **模型定价重构**
  - 替换原先的「官方价 ×1000 + 阈值调整」公式为**分类线性映射**
  - 8 个价格区间分桶（textSmall/Medium/Large, embeddings, translate, vision, classify, speech）
  - 桶内按官方价排序后线性映射到 OpenAI 主流价格区间
  - 类内极差大幅收敛：classify 2112× → 3×、text 246× → 35×（含 3 档）、speech 73× → 4×
  - 管理员调整的 multiplier 在 sync 时保留（不被覆盖）

### 修复

- **定价页与模型库渠道标签显示修复**
  - 渠道 Tab 标签不再显示泛泛的"第三方"，改为显示渠道自定义名称（如 Vercel/DeepSeek）
  - `PricingTabs` 的 `ChannelBadge` 对 `openai-compatible` 渠道显示渠道名称而非"第三方"
  - 模型浏览器 (`model-browser.tsx`) 的渠道 Badge 同样显示渠道自定义名称
- **定价管理页面渠道筛选修复**
  - 修复 `PricingManager` 用 `channelSource` 字符串过滤模型但 tab key 是 UUID 的问题
  - 改为按 `channelId` 匹配，点击各渠道 tab 正确显示对应的模型列表
- **文本生成 Playground 模型分组修复**
  - 各渠道模型不再全部归入"第三方渠道"分组
  - 改为按渠道名称动态分组（Vercel / DeepSeek 等各独立 optgroup）
- **定价页渠道模型倍率应用修复**
  - 渠道模型定价未读取 `multiplier` 字段，显示基础价而非应用倍率后的最终价
  - 修复后显示 `basePrice * multiplier`（与 Cloudflare 模型行为一致）
- **渠道模型分类纠正（DB 数据）**
  - Vercel 渠道 293 个模型中 261 个被错误分类为 `"remote"`
  - 根据模型 ID 关键词推测正确分类：text(261)、image(14)、embeddings(11)、speech(4)、vision(3)
  - 同步设置各分类的默认定价（text: 500/1500, image: 3500, embeddings: 100, speech: 400, vision: 600/1200）
- **渠道同步 API 增强**
  - 新增 `mapUpstreamType()` 函数从 modelId 推断分类（适配无 type 返回的上游）
  - 新增 `CATEGORY_DEFAULT_PRICES` 为无上游定价的模型设置分类默认定价
  - 新同步的模型将自动获得正确的分类和定价
  - 根因：旧实现把所有 content block **展平为纯文本**，丢弃 `tools` / `tool_use` / `tool_result`，
    流式转换器只发文本 delta → Claude Code 拿不到 `tool_use`、智能体循环断裂
  - **400 被拒**：多轮回传时 assistant 消息 `content` 给了 `null`，而 Cloudflare 要求必须是字符串
    （`Type mismatch '/messages/N/content' 'string' not in 'null'`）→ 改为 `""`
  - **流式工具丢失**：Cloudflare 流式端点把工具调用序列化进 `delta.content` 文本，**不发**结构化
    `tool_calls` deltas → 有工具时改用非流式上游拿结构化结果，再合成标准 SSE（`anthropicMessageToSSE` /
    `openAIResponseToSSE`），保证 `tool_use` / `tool_calls` 结构
  - `/v1/chat/completions` 同步修复：旧实现只挑 `model/messages/stream/temperature/max_tokens` 转发，
    **丢弃了 `tools` / `tool_choice`** → 改为透传完整校验后的请求体
- **`/v1/*` 网关被 Auth.js 中间件错误重定向到 `/login`**（外部 API 客户端不可用）
  - 根因：路由从 `/api/openai/v1/*` 迁移到 `/v1/*` 后，`proxy.ts` 的 matcher 只排除了 `/api`，
    导致 `/v1/*` 路径被 next-auth 当作页面访问，未登录会话直接 302 → `/login`，
    Bearer API key 在路由处理器内根本没机会校验
  - 修复：matcher 增加排除 `v1`，使 `/v1/*` 不再走 Auth.js 中间件，回到路由内 Bearer 校验
- **`/v1/models` 改为公开端点**（OpenAI 客户端发现模型不应需要 API key）
  - 旧逻辑：路由内强制 Bearer 校验
  - 新逻辑：完全公开，仅返回模型 ID 等公开元数据；加 5 分钟边缘缓存（`Cache-Control: public, s-maxage=300, stale-while-revalidate=3600`）
- **图像理解（Vision）token 计费**（高估）
  - **输出**：旧逻辑直接把 `max_tokens || 512` 当作实际输出 token 计费，**按上限收钱**而非实际生成长度；
    实测一张 2×2 图返回 `" Red"`（≈1 token），旧逻辑会计费 256–512
  - **输入**：旧逻辑 `prompt.length × 1.5` 方向错（×1.5 高估文本 ~6×）且**完全忽略图像**
  - 新逻辑：input = `estimateTokens(prompt) + IMAGE_INPUT_TOKENS(576)`（计入图像 patch token，llava-1.5 典型值）；
    output = `estimateTokens(实际返回文本)`
- **翻译 token 计费**（高估 + CJK 损坏）
  - 旧路由 `text.length × 1.5` 估算输入和输出，而 m2m100 **本身就返回真实 usage**，估算值白白覆盖
  - 旧 UI 无源语言选择，且 m2m100-1.2b 对 CJK 源语言基本损坏（实测 `你好`→`by`、`おはよう`→`by`、中文常返回空字符串）
  - 新逻辑：两条路径都用上游真实 `usage.prompt_tokens / completion_tokens` 计费；CJK 由 LLM 路径正确翻译
- **嵌入 Token 估算错误**（计费偏差）
  - 旧逻辑用 `字符数 × 1.5` 估算嵌入输入 token，方向相反、对英文高估约 6×
  - 嵌入模型上游不返回真实 usage，估算值即计费值，故偏差直接体现在扣费
  - 新增 `lib/usage/tokens.ts`：CJK ≈ 1 token/字、拉丁 ≈ 1 token/4 字符，最小 1
  - 应用到 `/v1/embeddings` 与 `/api/ai/embeddings` 两个路由
- **数据看板 30 日模型柱状图配色失效**
  - 根因：`hsl(var(--primary))` 包裹的是 oklch 令牌，`hsl(oklch(...))` 非法导致柱子回退黑色
  - 改为直接引用 `var(--chart-1..5)`，并随主题预设变色
  - 顺带修复三个图表 tooltip 背景 `var(--surface)`（未定义）→ `var(--card)`
- **站内 Playground 调用 DeepSeek-v4-flash 返回空内容**
  - **根因 1（前端）**：前端仅监听 `delta.content` 流式 delta，DeepSeek 推理模型先发 `delta.reasoning_content`（思考链），
    再发 `delta.content`（正文），旧逻辑只累积正文、丢弃思考，且思考期间 UI 无反馈
  - **根因 2（路由）**：路由仅按 API Key 绑定的 `channelId` 决定上游，不看所选模型属于哪个渠道 →
    站内 playground 用默认 key（绑定 `default-cloudflare` 渠道），选 `deepseek-v4-flash` 后请求被发到 Cloudflare，
    上游返回 `AiError: No such model deepseek-v4-flash`
  - **根因 3（baseUrl）**：`forwardToOpenAI` 对所有 OpenAI 兼容渠道（包括 DeepSeek）硬编码 `baseUrl = "https://api.openai.com/v1"`，
    DeepSeek 请求被误发到 OpenAI，上游返回 `Incorrect API key provided`
  - 修复 1：前端 `text-gen.tsx` 同时监听 `reasoning_content` 和 `content`，分别累积到 `Message.reasoning` 和 `Message.content`，
    思考与正文分离渲染（可折叠灰色块 + 正文）
  - 修复 2：`/api/ai/text` 路由改为优先按模型查 `model_pricing.channelId` 找归属渠道，找不到再回退到 key 的 `channelId`
  - 修复 3：`lib/channels/router.ts` 的 switch 分发时按渠道 type 传入正确的 `defaultBaseUrl`（openai → `api.openai.com`，
    deepseek → `api.deepseek.com`，openai-compatible → 必须显式配置）

### 变更

- **API 路由标准化**（遵循 new-api 约定）
  - 迁移推理网关从 `/api/openai/v1/*` 和 `/api/anthropic/v1/*` 到标准 `/v1/*` 根路径
  - OpenAI 兼容：`/v1/chat/completions`、`/v1/embeddings`、`/v1/models`
  - Anthropic 兼容：`/v1/messages`
  - 业务 API 保持 `/api/*` 路径不变
  - 更新所有文档和示例配置

### 文档

- **`docs/BILLING_GUIDE.md` 计费口径修订**
  - 修正 `base_multiplier` 为线上部署值 **100**（原文档误写 1000）
  - 明确「**展示价 ≠ 实扣价**」口径：实扣单价 = 展示价 × base_multiplier × 模型倍率（维持现状，仅文档说明）
  - 新增「Token 估算」「图像理解（Vision）计费」「翻译计费」三个章节，含公式、扣费示例与实测对账
  - 修正图像固定价笔误（`4.00 cr/张` → `4000 cr/张`）

### 规划中

- **Phase A**：视觉地基（oklch 主题 + shadcn primitives + 布局重做）
- **Phase D 剩余**：
  - API Key 批量创建（一次生成 N 个带前缀的 key）
  - API Key 分组管理（新增 `key_groups` 表 + 组倍率）
  - API Key 用量导出（CSV/JSON 导出统计）
- **渠道图表增强**：
  - Dashboard 新增渠道分布饼图
  - 渠道详情页 30 日趋势图 + 错误率曲线

## [0.2.2] - 2026-06-16

### 新增

- **新用户注册奖励**
  - 新用户注册时自动获得 2000 credits 欢迎奖励
  - 奖励记录到 `topup` 表（type 4 = 其他充值）
  - 充值描述："新用户注册奖励"
- **兑换码使用者追踪**
  - `redemption` 表新增 `usedUserId` 字段（最后使用者 ID）
  - `redemption` 表新增 `redeemedAt` 字段（最后兑换时间）
  - 管理后台兑换码列表显示使用者邮箱
  - 兑换时更新使用者信息和时间戳

### 变更

- **设置页面简化**
  - 移除冗余的余额显示（钱包页面已有）
  - 移除冗余的计费说明（定价页面已有）
  - 仅保留用户 ID 显示
  - 页面更简洁清晰

### 修复

- **Drizzle ORM JOIN 问题**
  - 修复 D1 HTTP 模式下 leftJoin 字段错位问题
  - 改用手动查询 + Map 映射方案
  - 兑换码列表正确显示使用者信息

## [0.2.1] - 2026-06-16

### 新增

- **Phase G - 签到功能**
  - 新增 `checkin` 表存储签到记录
  - 新增每日签到功能，随机获得额度奖励（10-100 cr）
  - 新增 CheckinCalendarCard 组件（日历 UI + 统计展示）
    - 7×6 日历网格（42 天）
    - 可折叠界面（默认已签到时收起）
    - 月份导航（上/下月切换）
    - 统计卡片（累计签到/本月获得/累计获得）
    - 已签到日期显示绿点 + Tooltip 奖励额度
  - 集成到 `/wallet` 页面顶部
  - Server Actions：`getCheckinStatus()` 和 `performCheckin()`
  - 充值流水新增 type 3（签到奖励）
  - 签到配置存储在 `option` 表（enabled/min_quota/max_quota）
  - 防重复签到：UNIQUE(userId, checkinDate) 约束
  - 详细文档：`docs/features/checkin.md`
- **Phase F - 管理员定价管理**
  - 新增 `/admin/pricing` 定价管理页面
  - 管理员可内联编辑每个模型的倍率（0.01-100）
  - `model_pricing` 表新增 `multiplier` 字段
  - 分类筛选（全部/文本/图像等）
  - 搜索功能（模型 ID / 名称）
  - 显示基础价 → 最终价转换
  - 倍率实时生效（计费 + 页面显示）

### 变更

- **数据迁移**
  - `redemption.quota` 和 `topup.amount` 从 INTEGER 改为 REAL 支持小数
  - 历史兑换码额度调整：50 → 5（÷10）
  - 历史充值记录调整：≥100 的金额 ÷10
  - 用户余额按实际充值消耗重新结算（移除系统补偿记录）
- **文档结构优化**
  - 签到功能设计从 `CLAUDE.md` 移至 `docs/features/checkin.md`
  - README 更新功能进度和亮点

### 修复

- 修复 `schema.ts` 缺少 `unique` 导入
- 修复 `checkin-actions.ts` 中 `createdAt` 类型错误（使用 Date 对象）

## [0.2.0] - 2026-06-15

### 新增

- **API Key 管理增强**
  - 新增每个 key 的使用统计（调用次数 + 消耗 credits）
  - 新增"调用"列，显示每个 key 的调用次数和消耗
  - 新增额度进度条可视化（无限额度和有限额度 key）
  - 通过 `usage_log` 聚合实现实时用量追踪
- **Error 追踪系统**
  - `usage_log` 表新增 `errorReason` 字段
  - Error 记录现在显示错误信息（带 tooltip）
  - 所有 API 错误处理器现在捕获并存储错误原因
- **渠道标识**
  - 明确的渠道标签：站内（web）、OpenAI、Anthropic
  - 清晰区分 playground 和 API 客户端调用
- **UI 改进**
  - 历史记录和数据看板采用 Grid 对齐布局
  - 固定宽度列实现完美垂直对齐
  - 数值指标（credits、延迟、时间）右对齐

### 变更

- **API Key 要求**
  - 所有 Playground API 现在需要有效的 API key（文本、图像、嵌入、翻译、视觉）
  - 如果用户未创建 API key，返回 403
  - 所有记录必须关联到 apiKeyId
- **额度显示逻辑**
  - 无限额度 key：显示 `已用 / 账户余额` + 百分比
  - 有限额度 key：显示 `剩余 / 总额度` + 进度条
  - 移除了没有数据支撑的误导性进度条
- **计费系统**
  - 修复 error 调用计费为 0 credits（之前按估算计费）
  - Error 记录现在正确显示"—"（0 cr）
  - 改进 FLUX-2 multipart 响应解析

### 修复

- **API Key 编辑**
  - 修复 KeySheet 在切换 key 时不重新挂载（添加 `key` prop）
  - 修复空字符串导致数据库 NaN（添加 trim + 条件 parseInt）
  - 添加余额验证：API key 额度不能超过账户余额
- **数据准确性**
  - 返还 4 条 error 记录错误扣除的 15,500 cr
  - 修正总用量从 43,982 cr 到 28,482 cr
  - 余额从 6,018 cr 恢复到 21,518 cr
- **列表对齐**
  - 修复因内容长短不一导致的列表项错位
  - 实现 CSS Grid 固定列宽
  - 所有数值指标现在正确右对齐

### 安全

- 添加服务端验证，防止 API key 额度超过用户余额
- 所有 Playground 端点现在需要认证和有效的 API key

## [0.1.0] - 2026-06-14

### 新增

- **核心功能**
  - Auth.js v5 用户认证
  - API key 生成和管理
  - 多模型支持（文本、图像、嵌入、视觉、翻译）
  - 用量追踪和日志记录
  - 基于 credits 的计费系统
- **数据看板**
  - 实时余额显示
  - 每小时和每日用量图表（recharts）
  - 模型使用分布图
  - 最近 10 次调用列表
- **Playground**
  - 文本生成（LLaMA、Qwen、DeepSeek）
  - 图像生成（FLUX、Stable Diffusion）
  - 视觉理解（图像理解）
  - 嵌入向量
  - 翻译
- **API 兼容性**
  - OpenAI 兼容端点（`/v1/*`）
  - Anthropic 兼容端点（`/v1/*`）
  - 模型列表和对话补全
- **数据库**
  - Cloudflare D1 + Drizzle ORM
  - Schema: users, api_keys, usage_log, conversations, topup, option
  - 迁移系统（通过 `/api/db-migrate`）

### 技术栈

- Next.js 16 (App Router)
- React 19
- Tailwind CSS v4
- TypeScript
- Cloudflare D1 + Drizzle ORM
- Auth.js v5
- Recharts 数据可视化

[0.4.0]: https://github.com/drfengyu/CloudflareAI/compare/v0.3.1...v0.4.0
[未发布]: https://github.com/drfengyu/CloudflareAI/compare/v0.4.0...HEAD
[0.2.2]: https://github.com/drfengyu/CloudflareAI/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/drfengyu/CloudflareAI/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/drfengyu/CloudflareAI/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/drfengyu/CloudflareAI/releases/tag/v0.1.0
