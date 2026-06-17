@AGENTS.md

# 改造路线图：参考 new-api 重构本项目

> 本节为正在进行的多阶段改造计划（参考 QuantumNous/new-api），逐阶段实现并提交。
> 完整规划文件：`C:\Users\Administrator\.claude\plans\hidden-weaving-lighthouse.md`

## 背景

当前项目 `cloudflare-ai-console`（Next.js 16 App Router + React 19 + Tailwind v4 + Cloudflare D1/Drizzle + Auth.js v5）已具备模型库、Playground、用量记录、API 密钥、设置等页面，但相对 new-api 有明显差距，且核心计量是坏的：计量未实现（`logUsage` 恒记 0、额度只展示不强制、流式记 0 token）、令牌过于简单（仅创建/吊销）、缺少余额/钱包/兑换码/管理后台/定价页/图表看板。

目标：参考本地 `D:\Download\new-api-main`（`web/default` 重设计前端 + Go 后端业务语义），改造成视觉贴近 new-api、功能覆盖「数据看板 / 令牌增强 / 真实计量+定价 / 管理后台」的多用户 AI 网关。

## 开发规范

### API 路由规范（必读）

**本项目遵循 new-api 的标准路由约定**，详见 [`docs/API_ROUTES.md`](docs/API_ROUTES.md)：

- **AI 推理网关**：`/v1/*` — OpenAI/Anthropic 兼容端点（根路径，无 `/api` 前缀）
- **业务 API**：`/api/*` — 用户/令牌/兑换码等业务逻辑
- **站内 Playground**：`/api/ai/*` — 需登录的在线生成功能

### 参考实现（必读）

**所有功能开发和规划前，必须先参考本地 `D:\Download\new-api-main` 的实现**：

1. **路由设计**：`router/api-router.go` + `router/relay-router.go` — **标准路由约定**
2. **后端逻辑**：`model/*.go` + `controller/*.go`
3. **前端组件**：`web/default/src/features/*/` 
4. **配置管理**：`setting/operation_setting/*.go`
5. **数据库设计**：`model/*.go` 中的 struct 定义

**参考流程**：
```bash
# 1. 查找相关文件
find "D:\Download\new-api-main" -name "*keyword*.go" -o -name "*keyword*.tsx"

# 2. 阅读核心实现
Read <file_path>

# 3. 理解业务逻辑后再实现本项目对应功能
```

### 测试验证流程

**每个功能完成后必须执行完整的测试验证**：

#### 1. 本地测试（开发环境）

```bash
# 类型检查
npm run typecheck

# 代码规范
npm run lint

# 本地启动
npm run dev
# 访问 http://localhost:3000 手动测试功能
```

#### 2. Playwright E2E 测试

```bash
# 安装 Playwright（首次）
npx playwright install

# 编写测试用例（参考现有测试）
# tests/e2e/checkin.spec.ts
# tests/e2e/pricing.spec.ts

# 运行测试
npm run test:e2e

# 生成测试报告
npx playwright show-report
```

**测试覆盖要求**：
- 登录/注册流程
- API Key 创建和使用
- 主要功能页面（Dashboard / Keys / Wallet / Pricing）
- API 网关调用（OpenAI / Anthropic 兼容性）
- 错误处理和边界情况

#### 3. Vercel 预览部署

```bash
# 安装 Vercel CLI（首次）
npm i -g vercel

# 登录 Vercel
vercel login

# 预览部署（自动生成预览 URL）
vercel

# 查看部署日志
vercel logs <deployment-url>

# 测试预览环境
curl https://<preview-url>/api/health
```

#### 4. Cloudflare D1 数据验证

```bash
# 通过 D1 HTTP API 查询数据
curl "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/d1/database/$CF_D1_DATABASE_ID/query" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM checkin ORDER BY createdAt DESC LIMIT 5;"}'

# 验证数据一致性
# - 签到记录是否正确存储
# - 余额扣减是否准确
# - 充值流水是否完整
```

#### 5. 线上功能测试（生产环境）

```bash
# 推送到主分支触发生产部署
git push origin main

# 等待 Vercel 自动部署完成
# 访问生产域名验证功能

# 测试 API 网关
curl https://cloudai.fuwari.fun/api/openai/v1/chat/completions \
  -H "Authorization: Bearer sk-cfai-xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "@cf/meta/llama-3.1-8b-instruct",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### 测试检查清单（每次部署前）

- [ ] 本地 TypeScript 类型检查通过
- [ ] 代码 lint 无错误
- [ ] 本地开发环境功能正常
- [ ] Playwright E2E 测试通过
- [ ] Vercel 预览部署成功
- [ ] Cloudflare D1 数据验证通过
- [ ] 线上功能测试无异常
- [ ] 文档已更新（README / CHANGELOG / feature docs）

## 已确认决策

1. **计费**＝内部整数「余额/积分」账本 + 兑换码 + 管理员手动充值，**不接真实支付**。
2. **部署场景**＝多用户对外（类 SaaS），需完整用户/角色/系统设置后台。
3. **UI 底座**＝shadcn/ui + Radix，图表用 recharts。

## 架构决策

- **积分单位**：credits（支持小数），`CREDITS_PER_USD = 1`（1 credit = $1 USD）。两套账本：`user.balanceCredits` 与 `apiKey.remainCredits`（可无限），请求时都校验、都扣减。neuron 作为技术用量指标保留。
- **角色**：`user.role` 数值制 `1=普通 / 10=管理员 / 100=超管`。引导：`ADMIN_EMAILS` 命中或首个注册用户 → 超管。`proxy.ts` + 服务端双重 gate。
- **令牌状态**：`status` 数值制 `1=启用 / 2=禁用 / 3=过期 / 4=耗尽`（迁移 `revoked`）。
- **系统设置**：单个 `option(key,value)` KV 表，镜像到带缓存的内存 map（`lib/settings`），复杂值存 JSON。
- **UI 组件**：手写 shadcn 风格 primitives。新增依赖：`@radix-ui/react-*`、`class-variance-authority`、`recharts`、`sonner`、`next-themes`、`react-hook-form`、`@hookform/resolvers`、`@tanstack/react-table`、`date-fns`。

## 分阶段路线图（逐阶段提交，阶段间汇报）

- **Phase A — 视觉地基（不改行为）**：oklch 主题令牌（`app/globals.css`）+ 主题预设（`app/theme-presets.css`：default/anthropic/cloudflare）；手写 `components/ui/*` shadcn primitives + `components/data-table/*` + recharts 图表封装；重做 sidebar（分组导航 对话/通用/个人/管理）+ header（主题切换+用户菜单）；根布局接入 ThemeProvider + Toaster；迁移旧 token class（`text-muted`→`text-muted-foreground`，surface/danger 走别名）。
- **Phase B — 数据内核 & 计量修复**：扩展 schema（user/api_key 字段 + redemption/topup/option 表）；`lib/billing/` 定价模块；修 `lib/usage/meter.ts`（真实计量 + 余额/令牌额度扣减 + 流式结束计量）；网关接入校验（余额/状态/有效期/IP/模型白名单）；消除 route 内重复 `node:crypto`；引导管理员角色。
- **Phase C — 数据看板**：`lib/usage/queries.ts` 聚合（日趋势/模型排行/渠道分布/总计含 credits）；重做 `/dashboard` 为 Tabs + recharts 图表 + StatCard sparkline + 时间范围/粒度切换。
- **Phase D — 令牌管理界面**：`/keys` 改 DataTable（状态/额度进度/模型限制/分组/有效期）+ 创建编辑 Sheet（模型白名单 MultiSelect、额度、有效期、IP、批量）；server actions。
- **Phase E — 公开定价页**：`/pricing` 定价表（模型/类型/来源/上下文/输入输出单价/能力/分组倍率），来自 catalog + `model-meta.zh.ts` + option 倍率覆盖。
- **Phase F — 管理后台**：`/admin/users`（角色/状态/分组/余额调整）、`/admin/redemptions`（批量生成/状态）、`/wallet`（兑换+流水）、`/admin/settings`（option KV 编辑器）；`lib/settings` 读写缓存。

## 验证

每阶段：`npm run typecheck` + `npm run lint` + `npm run dev` 手测。B：`sk-cfai-…` 调网关确认真实计量/扣减/拒绝越权。F：兑换加余额记流水、改设置生效、非管理员拦截。

---

## 当前进度（2026-06-16 更新）

### ✅ Phase B — 数据内核 & 计量修复（完成）

**已完成**：
- ✅ 扩展 schema：`user.balanceCredits`、`user.role`、`apiKey.status`、`topup` 表、`option` 表、`checkin` 表
- ✅ `lib/billing/model-pricing.ts` 统一定价表：
  - **分类线性映射重构**（2026-06-16）：8 个价格分桶 + 桶内线性映射到 OpenAI 主流价格
  - 类内极差收敛：classify 2112× → 3×、text 246× → 35×、speech 73× → 4×
  - 图像模型固定价（3000-4000 cr/张）
  - `model_pricing` 表 + `multiplier` 字段（管理员动态调整，sync 时保留）
- ✅ `lib/usage/meter.ts` 真实计量：
  - 调用 `calculateCredits` 按真实 token/neurons 计费
  - 余额预检 `verifyBalance`（user + apiKey 双重校验）
  - 成功扣减 `user.balanceCredits`，失败时记 0 credits
  - 修复 FLUX-2 multipart 响应解析（`lib/cloudflare/ai.ts`）
- ✅ **流式真实计量**（2026-06-16）：
  - `lib/usage/stream-intercept.ts`：TransformStream 拦截 SSE 流
  - 解析末尾 `usage` chunk（Cloudflare 默认发，无需 `stream_options`）
  - 累积 `choices[0].delta.content` 供 playground 保存对话
  - 用 Next.js 15 `after()` API 确保 Vercel serverless 在响应后继续运行 logUsage
- ✅ 网关接入校验（余额/状态/有效期/IP/模型白名单）
- ✅ 管理员充值（D1 直接操作 + topup 流水）
- ✅ 数据迁移：redemption/topup REAL 类型支持小数

**验证通过**（线上 cloudai.fuwari.fun）：
- FLUX-2 成功出图 + 精确扣 4000 cr
- error 调用不扣费、记 0 credits
- 余额不足时 402 拒绝
- 倍率调整实时生效
- **流式调用真实 token 计量**：outputTokens 从估算 2048 降到真实值（如 16）

### ✅ Phase C — 数据看板（完成）

**已完成**：
- ✅ `lib/usage/queries.ts` 聚合：
  - `getHourlyUsageToday`（0-23 时小时柱状图）
  - `getDailyUsage`（近 7 日/30 日折线图）
  - `getUsageByModel`（Top 10 模型横向条形图）
  - 所有查询含 `creditsUsed` 统计
- ✅ `/dashboard` 重做：
  - 余额/今日消耗/调用数/本月调用 StatCard
  - 时间范围切换（今日/本周/本月），修复 Next.js 16 async searchParams
  - recharts 图表渲染（小时趋势/日趋势/模型分布）
  - 最近 10 次调用列表（状态/模型/credits/延迟）

**验证通过**：
- 图表正常渲染，切换今日/本周/本月正常
- credits 统计准确，error 记录显示 `—`（0 cr）

### ✅ Phase D — 令牌管理界面（完成）

**已完成**：
- ✅ API Key 使用统计：
  - 每个 key 显示调用次数 + 消耗 credits
  - 新增"调用"列：`29 次` + `15,823 cr`
  - 查询 `usage_log` 聚合统计（SUM + COUNT）
- ✅ 额度进度可视化：
  - 无限额度 key：显示 `已用 / 账户余额`，进度条反映使用百分比
  - 有限额度 key：显示 `剩余 / 总额度`，进度条反映消耗进度
  - 清晰标签：`无限额度 · 已用 X%`
- ✅ Error 追踪系统：
  - 添加 `errorReason` 字段到 `usage_log` 表
  - 所有 API error handler 捕获并记录错误原因
  - 显示层展示错误信息（截断 + tooltip）
- ✅ 渠道标识：
  - `web` = 站内（Playground）
  - `openai` = OpenAI（API 客户端）
  - `anthropic` = Anthropic（API 客户端）
  - 历史数据（无 apiKeyId）单独标识
- ✅ 完美对齐布局：
  - CSS Grid 三列布局（`auto | 1fr | auto`）
  - 固定宽度右对齐（credits 80px，latency 50px，time 120px）
  - 所有列表项垂直对齐，无论内容长短
- ✅ API Key 必需：
  - 所有 Playground API（text/image/embeddings/translate/vision）必须有 key
  - 无 key 返回 403
  - 所有记录关联 apiKeyId

**验证通过**（线上 cloudai.fuwari.fun）：
- Key 统计准确（调用次数 + credits）
- 额度进度条正常显示
- Error 记录显示"—"（0 cr）+ 错误原因 tooltip
- 列表完美对齐
- 渠道标识清晰区分

### ✅ Phase E — 公开定价页（完成，2026-06-15）

**已完成**：
- ✅ `/pricing` 页面：
  - 按类别分组展示所有模型定价（文本/图像/视觉/嵌入/翻译/语音/视频）
  - 显示应用倍率后的实际美元价格和 credits
  - 模型来源标识（hosted/proxied）
  - 定价策略说明卡片（hosted ×1000 / proxied ×1 / 图像固定价）
  - Credits 换算说明（1 credit = $1 USD）
- ✅ 价格计算逻辑：
  - 复用 `lib/billing/display-price.ts`
  - 图像模型显示固定价格（3,000-4,000 cr/张）
  - 文本/嵌入模型显示 per M tokens 价格
  - 自动应用倍率并转换为美元

**验证通过**：
- 类型检查通过
- 页面正常渲染（需登录）
- 价格显示准确

### ✅ Phase F — 管理后台（完成基础页面，2026-06-16）

**已完成**：
- ✅ `/admin/users` 用户管理：
  - 用户列表（邮箱/角色/余额/注册时间）
  - 角色标识（普通用户/管理员/超级管理员）
  - 余额显示（credits + USD）
  - 管理员权限校验（role ≥ 10）
- ✅ `/admin/redemptions` 兑换码管理：
  - 兑换码列表（code/额度/状态/使用者/创建时间）
  - 状态计算（未使用/已使用/已过期）
  - 额度显示（credits + USD）
- ✅ `/wallet` 钱包页面：
  - 余额卡片显示（credits + USD + 图标）
  - 充值流水列表（类型/金额/时间/描述）
  - 类型标识（兑换码充值/管理员充值/签到奖励）
- ✅ `/admin/settings` 系统设置：
  - 定价倍率配置表单（hosted/proxied multiplier）
  - 所有设置 JSON 预览
  - 管理员权限校验
- ✅ `/admin/pricing` 定价管理（2026-06-16 新增）：
  - 管理员内联编辑每个模型的倍率（0.01-100）
  - 分类筛选（全部/文本/图像等）
  - 搜索功能（模型 ID / 名称）
  - 显示基础价 → 最终价转换
  - 倍率实时生效（计费 + 页面显示）

**验证通过**：
- 类型检查通过
- 所有页面正常渲染
- 权限校验正确（非管理员重定向到 dashboard）
- 倍率调整实时生效

### ✅ Phase G — 用户留存（完成，2026-06-16）

**已完成**：
- ✅ **签到功能**（详见 [`docs/features/checkin.md`](docs/features/checkin.md)）：
  - 数据库：`checkin` 表 + `option` 配置（enabled/min_quota/max_quota）
  - 后端：Server Actions（`getCheckinStatus` + `performCheckin`）
    - 防重复检查（UNIQUE 约束）
    - 随机奖励计算（10-100 cr）
    - 原子操作 + 手动回滚
  - 前端：CheckinCalendarCard 组件
    - 7×6 日历网格（42 天）
    - 可折叠界面（默认已签到时收起）
    - 月份导航（上/下月切换）
    - 统计展示（累计签到/本月获得/累计获得）
    - 已签到日期显示绿点 + Tooltip 奖励额度
    - Toast 反馈（成功/失败）
  - 集成：`/wallet` 页面顶部
  - 充值流水：新增 type 3（签到奖励）
- ✅ **新用户注册奖励**（2026-06-16）：
  - 新用户注册时自动获得 2000 credits
  - 奖励记录到 `topup` 表（type 4 = 其他充值）
  - 充值描述："新用户注册奖励"
  - 实现位置：`lib/db/queries.ts` 的 `createCredentialUser()`
- ✅ **兑换码使用者追踪**（2026-06-16）：
  - `redemption` 表新增 `usedUserId` 字段（最后使用者 ID）
  - `redemption` 表新增 `redeemedAt` 字段（最后兑换时间）
  - 管理后台兑换码列表显示使用者邮箱和时间
  - 兑换时更新使用者信息和时间戳
  - 修复 Drizzle ORM leftJoin 字段错位问题（使用手动查询 + Map 映射）
- ✅ **设置页面简化**（2026-06-16）：
  - 移除冗余的余额显示（钱包页面已有）
  - 移除冗余的计费说明（定价页面已有）
  - 仅保留用户 ID 显示

**验证通过**（线上 cloudai.fuwari.fun）：
- 签到功能已启用（`checkin_enabled = true`）
- 日历 UI 正常渲染
- 签到按钮防抖正常
- 奖励随机生成（10-100 cr）
- 余额实时更新
- 充值流水正确记录
- 新用户注册获得 2000 cr
- 兑换码列表显示使用者信息
- 设置页面简洁清晰

### ✅ UI 与计费口径修订（2026-06-17）

**已完成**：
- ✅ **嵌入 Token 估算修复**：旧 `字符数 × 1.5` 高估约 6×（嵌入上游不返回 usage，估算即计费）；
  新增 `lib/usage/tokens.ts`（CJK≈1/字、拉丁≈1/4 字符），应用到 `/v1/embeddings` 与 `/api/ai/embeddings`
- ✅ **30 日模型柱状图配色失效修复**：`hsl(var(--primary))` 包裹 oklch 令牌非法 → 改用 `var(--chart-1..5)`；
  三图表 tooltip `var(--surface)`（未定义）→ `var(--card)`
- ✅ **主题配色扩展**：新增 Ocean/Emerald/Violet/Rose 共 7 套预设
- ✅ **侧边栏品牌名可配置**：导航顶部读取 `siteName` 设置，保存后 `revalidatePath("/", "layout")` 即时生效
- ✅ **计费文档口径修订**（`docs/BILLING_GUIDE.md`）：
  - `base_multiplier` 实为线上部署值 **100**（原文档误写 1000）
  - 明确「**展示价 ≠ 实扣价**」：实扣单价 = 展示价 × base_multiplier × 模型倍率（决策：维持现状，仅文档说明）
  - 新增 Token 估算章节 + 嵌入扣费示例 + 线上 `usage_log` 实测对账（bge-base 3 token = 0.02783 cr ✓）

### ✅ Vision / 翻译 计费与正确性修订（2026-06-17）

**已完成**：
- ✅ **图像理解（Vision）token 计费修复**（`app/api/ai/vision/route.ts`）：
  - 输出：旧 `max_tokens || 512` 按上限计费 → 改为 `estimateTokens(实际返回文本)`
  - 输入：旧 `prompt.length × 1.5` 忽略图像 → 改为 `estimateTokens(prompt) + IMAGE_INPUT_TOKENS(576)`（计入 patch token）
  - 实测：2×2 图返回 `" Red"`（≈1 token），旧逻辑会计 256–512，新逻辑按真实 1 token
- ✅ **翻译双路径架构 + 计费修复**（`app/api/ai/translate/route.ts` + 翻译页/客户端）：
  - 新增 LLM 翻译路径（文本模型 + 翻译提示词），CJK 质量远优于 m2m100；m2m100 保留为「快速 · CJK 有限」选项
  - 路由按 `model.includes("m2m100")` 分派；两条路径**均使用上游真实 usage** 计费
  - 防御性剥离 `<think>…</think>` 块，避免推理模型思考内容混入译文
  - 翻译页：模型下拉新增 hosted 文本模型，默认排序优先非推理 instruct 模型（llama-3.3/llama-4/gemma-4/mistral-small/gpt-oss）
  - 客户端：新增**源语言选择器**（自动检测/zh/en/es/fr/de/ja/ko）
  - 实测验证：zh→en `人工智能正在改变世界` m2m100 返回空 `''`、LLM 返回 `Artificial intelligence is changing the world` ✓
- ✅ **文档同步**：`docs/BILLING_GUIDE.md` 新增「图像理解（Vision）计费」「翻译计费」两章，含公式/扣费示例/推理模型注意事项

### 🚧 待完成

- **Phase B 剩余**：网关 IP/模型白名单校验优化（已实现基础逻辑）
- **Phase D 剩余**：批量创建 key、分组管理（groupMultiplier）、导出统计
- **Phase F 剩余**：Server Actions UI 完善（充值/余额调整/兑换码生成前端表单）、权限细化

---

## 版本发布

**当前版本**：v0.2.2（2026-06-16）
**下一版本**：v0.3.0（流式计量 + 定价重构，待发布）

所有版本变更记录见根目录 [`CHANGELOG.md`](CHANGELOG.md)，遵循 [Keep a Changelog](https://keepachangelog.com/) 规范。

