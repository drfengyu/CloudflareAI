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

- **积分单位**：credits（支持小数）是唯一的账本与界面货币；`option.creditsPerUsd` 只用于把渠道上游的美元定价折算成 credits。两套账本：`user.balanceCredits` 与 `apiKey.remainCredits`（可无限），请求时都校验、都扣减。neuron 作为技术用量指标保留。
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
  - 预检额度 `estimateRequestCredits`：输入实估 + 输出按 `model_pricing.reserveOutputTokens` 封顶（默认 1024）；
    否则 `max_tokens=32000` 的客户端会被按全量预留挡在 402。402 带 needed/available 数字并写 error 日志
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
- ✅ `lib/usage/queries.ts` 聚合（一律接受 `UsageWindow = { start, end }` 左闭右开窗口，时钟由页面算好传入）：
  - `getUsageSummary`（次数 / 成功失败 / credits / tokens / 平均延迟）
  - `getUsageTrend(userId, win, "hour" | "day")`（按北京时间分桶的消耗与调用趋势，桶键与 `cnBucketKeys` 一致）
  - `getUsageByModel(userId, win, orderBy)`（Top 10，可按消耗或调用次数）
  - `getLifetimeUsage`（不受窗口影响的全生命周期累计）
  - 所有查询含 `creditsUsed` 统计
- ✅ `/dashboard` 重做：
  - 问候式头部（北京时间 早上好/中午好/… + 用户名），右侧时间范围切换（今日/近 7 日/近 30 日，滚动窗口）
  - 四组核心指标卡：账户数据（余额 + 历史消耗）/ 使用统计（请求次数 + 成功失败）/ 资源消耗（额度 + Tokens）/ 性能指标（RPM + TPM/延迟）
  - 「模型数据分析」卡：消耗分布 / 调用趋势 / 调用次数分布 / 调用次数排行 / 渠道分布 / 活动消耗 六个 tab
  - 底部三张信息卡：系统公告 / 常见问答 / 服务可用性（内容存 `option` 表，`lib/settings/dashboard-info.ts`；可用性由 `/api/uptime` 客户端按需拉取——配了地址走 Uptime Kuma，留空则自检本站端点）

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
  - 显示实付 credits 单价 = 表价 × 模型倍率 × 基础倍率（界面统一 cr / per K input token，不显示美元）
  - 模型来源标识（hosted/proxied）
  - 定价策略说明卡片（hosted ×1000 / proxied ×1 / 图像固定价）
  - 全站只显 credits（界面不再出现美元换算）
- ✅ 价格计算逻辑：
  - 复用 `lib/billing/display-price.ts`
  - 图像模型显示固定价格（3,000-4,000 cr/张）
  - 文本/嵌入模型显示 per K input token 价格（存储口径仍是 cr/1M，仅展示换算）
  - 自动应用倍率，结果只以 credits 展示

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
- ✅ **限时活动·幸运转盘**（2026-09-23，详见 [`docs/features/lottery.md`](docs/features/lottery.md)）：
  - 数据库：`lottery_ticket`（一行一券，`usedDrawId` 非空即消耗）+ `lottery_draw`（逐次记录，`unique(batchId, seq)`）；活动配置整体存 `option.lottery_config`
  - 分层：`lib/lottery/prize-math.ts`（纯计算：清洗/窗口/开奖/期望返还，**不碰数据库**，好让后台表单在浏览器里实时算返还率）→ `lib/lottery/config.ts`（读配置）→ `lib/lottery/store.ts`（账本原语）→ `app/(dashboard)/lottery/actions.ts`
  - 原子性：D1 经 REST 无事务，新增 `d1Run()` 取 `meta.changes`，扣款/锁券一律条件更新判定命中。一次 10 连抽原先要打约 40 次串行 D1 往返（实测 7~10 秒），现在整批结果先在内存 `planDrawBatch` 算完，写入按表合并（一条 `CASE` 锁整批、每表一条多行 INSERT、倒扣合并成一次净额 UPDATE）并并发发出 → 9 次往返、约 2.4 秒；代价是回滚粒度从「单次开奖」变成「整批撤销」
  - 资金：买券「临时余额→永久余额」且不透支；中奖进带过期的临时余额；倒扣直接扣永久余额、允许负数；统一 `topup` type 6，不写 `usage_log`
  - 展示：扇区/规则/结果/流水一律实际 cr。**内圈存绝对 cr、外圈存倍数 × 基数（`ticket`/`batch`）**，所以券价是独立的利润率杠杆：奖池不动、调高券价，返还率就下降。想让奖池跟着券价走，用后台的「按 ×N 重算内圈」按钮（显式动作，不做默认耦合）
  - 后台：`/admin/settings` 新卡片配奖池与累抽档位，顶部实时显示内圈期望 / 外圈期望 / 单券综合 / 返还率 / 站点每券净得（默认池按券价 100 配平到约 91.1%），外圈每行现算该档实际 cr
  - 记录：`lib/lottery/records.ts` 只读聚合（不新增表）——用户侧「我的活动记录」逐次明细 + 汇总，管理侧 `/admin/lottery` 按今日/近 7 日/近 30 日窗口出站点净收益、按用户聚合与最近 200 注明细；净收益 = 券面 + 回收 − 发放，只算已开奖的券
  - 奖型：外圈 `kind = "credits" | "tickets"`，赠券档直接发 `source='prize'` 的券、不动 cr 也不写流水，张数记在 `lottery_draw.grantTickets`（`migrations/008_lottery_prize_tickets.sql`）；期望返还把赠券按券价折算计入成本。**改奖池的顺序固定为「代码先上线，再写 `option.lottery_config`」**，旧代码会把 `kind:'tickets'` 读成 0 cr 奖品
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

### ✅ 渠道管理（Channel Management）完整实现（2026-06-18）

**已完成**：
- ✅ **数据库扩展**：
  - 新增 `channels` 表（id、name、type、status、config、createdAt）
  - `api_keys` 表新增 `channelId` 外键（关联 channels）
  - `model_pricing` 表新增 `channelId` 外键（关联 channels）
  - `usage_logs` 表新增 `channelId` 外键（关联 channels）
  - 默认渠道 `default-cloudflare` 自动创建并迁移现有数据
- ✅ **渠道 API**：
  - `GET /api/channels` — 列出所有渠道（管理员）
  - `POST /api/channels` — 创建渠道（管理员）
  - `GET /api/channels/[id]` — 获取渠道详情（管理员）
  - `PUT /api/channels/[id]` — 更新渠道（管理员）
  - `DELETE /api/channels/[id]` — 软删除渠道（管理员）
  - `GET /api/channels/[id]/models` — 渠道关联模型列表
  - `POST /api/channels/[id]/models/sync` — 从上游同步模型列表
  - `PUT /api/channels/[id]/models/[modelId]` — 更新模型倍率
  - `DELETE /api/channels/[id]/models/[modelId]` — 移除模型关联
  - `GET /api/channels/[id]/health` — 渠道健康检查
  - `GET /api/channels/[id]/stats` — 渠道使用统计（总览/日趋势/模型排行/错误）
- ✅ **渠道路由网关**（`lib/channels/router.ts`）：
  - 根据 API Key 的 `channelId` 自动路由到对应上游
  - 支持 `openai`（直通 OpenAI API）和 `anthropic`（直通 Anthropic API，含格式转换）
  - `cloudflare` 保持现有内置逻辑不变
- ✅ **三端路由集成**：
  - `/v1/chat/completions` — 非 Cloudflare 渠道自动转发
  - `/v1/messages` — 同上
  - `/v1/embeddings` — 同上
  - 所有路由的 `logUsage` 调用已传入 `channelId`
- ✅ **模型发现**：
  - `/v1/models?channel_id=xxx` — 按渠道过滤可用模型列表
  - 默认无参数时返回所有 hosted 模型（向后兼容）
- ✅ **管理员界面**：
  - `/admin/channels` — 渠道管理页面（列表 + 动态配置表单 + 搜索过滤 + 健康检查 + 状态切换）
  - `/admin/channels/[id]` — 渠道详情页（关联密钥/模型列表/热门排行/统计）
  - 服务端权限校验（role ≥ 10）
- ✅ **适配器框架**：
  - `lib/channels/adapter.ts` — ChannelAdapter 接口（含 healthCheck / listModels）
  - `lib/channels/registry.ts` — 适配器注册表 + 配置字段定义 + 类型常量
  - `lib/channels/openai-adapter.ts` — OpenAI 适配器（直通、健康检查、模型列表）
  - `lib/channels/anthropic-adapter.ts` — Anthropic 适配器（直通、健康检查、模型列表）
  - `lib/channels/cloudflare-adapter.ts` — Cloudflare 适配器（占位）
  - `lib/channels/router.ts` — 路由分发 + OpenAI/Anthropic 转换
- ✅ **所有 API 路由适配 Next.js 16 Promise<params> 规范**
- ✅ **TypeScript 类型检查通过（0 errors）**
- ✅ **修复 keys/page.tsx 中 leftJoin 导入（drizzle-orm v0.45.2 无该导出）**

### ✅ Phase F（补充）— 管理后台增强（2026-06-17 完成）

- ✅ **兑换码批量生成 UI**（`/admin/redemptions`）：
  - `GenerateCodesDialog` 组件：数量、额度、最大使用次数、兑换码有效期、余额有效期
  - Server Action：`generateRedemptionCodes`
- ✅ **用户余额调整 UI**（`/admin/users`）：
  - `ManageUserDialog` 组件：充值/扣减、备注、角色修改
  - Server Actions：`adjustUserBalance` + `updateUserRole`
  - 记录到 `topup` 表（type 2 = 管理员充值）
- ✅ **签到配置界面**（`/admin/settings`）：
  - `CheckinSettingsForm` 组件：开关、最小/最大奖励、有效期配置
  - Server Action：`updateCheckinSettings`

### ✅ API Key 功能修复（2026-06-25）

**已完成**：
- ✅ **环境变量配置**：
  - 添加 `API_KEY_ENCRYPTION_SECRET` 到 `.env.local` 和 `.env.example`
  - 修复密钥查看功能解密失败问题
  - 生成独立的生产环境加密密钥
- ✅ **数据库修复**：
  - `api_key` 表添加 `encryptedKey` 列（修复 0004 迁移错误表名）
  - 创建 D1 HTTP API 迁移工具（`scripts/run-migration.js`）
  - 新增表结构检查工具（`scripts/check-schema.js`）
- ✅ **Drizzle leftJoin Bug 修复**：
  - 修复字段映射错位导致 key 名称显示为渠道名的问题
  - 移除 leftJoin，改为分别查询 + 手动映射
  - 新增 `scripts/check-keys.js` 用于数据验证
- ✅ **文档完善**：
  - `docs/fixes/2026-06-25-keys-page-fixes.md` - 环境变量修复记录
  - `docs/fixes/2026-06-25-drizzle-leftjoin-bug.md` - ORM Bug 详细分析
  - `docs/VERCEL_ENV_SETUP.md` - 生产环境配置指南
  - `COMPLETE_FIX_SUMMARY.md` - 完整修复总结

**验证通过**：
- ✅ API Key 创建功能正常
- ✅ 密钥查看功能解密成功
- ✅ Key 名称正确显示（不被渠道名覆盖）
- ✅ 类型检查通过

**相关 Commits**：
- 1bc837e - 环境变量配置
- 08bc0bb - 部署文档
- 4b9dbd0 - 数据库修复
- 3c28ea1 - 字段映射修复
- 8b05ef7 - 文档补充

---

### ✅ Phase A — 视觉地基（完成，2026-06-26）

**已完成**：
- ✅ oklch 主题令牌系统（`app/globals.css`）+ 7 套主题预设（`app/theme-presets.css`：default/anthropic/cloudflare/ocean/emerald/violet/rose，含完整明暗背景色令牌）
- ✅ shadcn/ui primitives（`components/ui/*` 24 个组件）+ `components/data-table/*` 统一封装 + `components/charts/*` recharts 封装
- ✅ 布局重构：sidebar 分组导航 + header（主题切换 + 用户菜单）+ ThemeProvider + Toaster
- ✅ 旧令牌迁移（`text-muted`→`text-muted-foreground` 等别名兼容）

**验证通过**：typecheck 0 errors、7 套主题切换正常、深浅色模式正常

### ✅ 渠道图表增强（完成，2026-08-18）

**已完成**：
- ✅ Dashboard 新增渠道分布饼图（近 30 日按 credits 分布）：
  - `components/charts/pie-chart.tsx` — 统一 PieChart 封装（donut 样式 + Legend + tooltip）
  - `lib/usage/queries.ts` 新增 `getUsageByChannel`（按 channelId 聚合 + leftJoin 渠道名，null 回退 web/openai/anthropic 标签）
- ✅ 渠道详情页 30 日趋势图 + 错误率曲线（`/admin/channels/[channelId]`）：
  - 服务端直查 `usage_log` 按日聚合（calls/credits/errors）
  - `AreaChart` 渲染调用趋势（tooltip 含 credits + 错误数）
  - `LineChart` 渲染每日错误率 %（`errors / calls`，destructive 色）

**验证通过**：typecheck 0 errors、lint 无新增 error、`npm run build` 成功

### 🚧 待完成

- **Phase D 剩余**：
  - API Key 批量创建（一次生成 N 个带前缀的 key）
  - API Key 分组管理（新增 `key_groups` 表 + 组倍率；schema 已有 `group`/`groupMultiplier` 列未使用）
  - API Key 用量导出（CSV/JSON 导出统计）

---

## 版本发布

**当前版本**：v0.30.0（2026-11-07，钱包最近收支按天分组 + 充值弹窗改版 + 昵称修改）
**下一版本**：v0.31.0（尚未选型）

- v0.30.0 钱包「最近收支」改为近 5 天、最多 50 笔并按北京日期分组：折叠看当天净额，展开看各类目
  笔数 / 收支与当天小计（先截断 50 笔再聚合，折叠与展开同源）；充值弹窗按渠道配置上下限（此前
  写死 1–1000），预设卡显示倍率角标与 `≈ N cr` 折算、自定义金额实时换算并禁用非法提交；设置页
  支持改昵称（`unstable_update` 同步 JWT，顶栏立即生效）。新增 `lib/payment/recharge-display.ts`、
  `lib/user/nickname.ts` 与对应回归测试；生产删除两笔测试兑换码及其配对过期流水（余额未变）。

- v0.29.5 账本当天分类细分：过期作废按流水描述还原发放出处（兑换码 / 转盘 / 翻牌 / 签到 / 充值赠送 /
  邀请 / 消费返利 / 任务 / 雷电 / 站内信，历史补记单列），充值按 `payment_order.channel` 拆出
  支付宝 / 微信 / QQ / LinuxDO，回调 `type=mock` 的标「模拟」；分页显示「第 X / 共 Y 页」；
  钱包结算说明精简，永久余额不再提管理员调整。细分在 JS 里聚合，订单渠道 50 个一批回查。

- v0.29.4 历史过期临时余额一次性补记：向生产 `topup` 写 6 笔负数 `type=14`
  （详见 `docs/features/personal-ledger.md`），id 前缀 `expire:backfill:`、`INSERT OR IGNORE`、只补流水不改余额；
  两笔有凭证的兑换码按原到期日（`YDU5QKKA4TWA89XK` 10 亿 @ 2026-06-24、`4VZKN2X4DFL9HJTU` 100 万 @ 2026-06-25），
  其余 4 个用户的剩余负差额按 2026-11-06 汇总各一笔。补记后所有用户账目净额 = 当前余额。
  同时修结算取整：钱包先按原始值剔除过期总额、最后取整；账本顶部四格在差额不足一分时由「收入 − 余额」倒推支出，
  避免 10 亿量级的半分尾数让三个展示数差一分。天表与差额判定仍用原始值。

- v0.29.3 过期临时余额改为**真实流水**：cleanup cron 在删 `temporary_balance` 行之前，按行写一笔负数
  `topup type=14`（`createdAt` 用原到期时间，id 为 `expire:<临时余额 id>` + `INSERT OR IGNORE` 保证幂等；
  先记账后删行，记账失败不删）。账本天表因此在到期日看到「过期作废」支出，筛选/翻页/当天分类与其它类别一致；
  已过期的兑换码不再「只有收入」。消费与回滚路径删临时余额行**不要**补这类流水（支出已记过，会重复扣）。
  2026-11-07 前的历史过期行已被旧版 cron 删掉，无法逐行还原，v0.29.4 已按可证记录补记。
  `ledgerSummary()` 删除，累计收入/支出回到原始流水合计；`ledgerSettlement()` 改收真实过期合计
  （`sumExpiredExpense()`），从收入与支出两头剔除，`gap` 与 `reconciled` 如实反映历史差额。
  「全部」顶部两类差额都单列：负差额 = 历史过期/未入账扣减，正差额 = 账外增加。
  钱包继续不显示已过期发放金额，最近收支排除 `type=14`。

- v0.29.2 钱包余额卡改为「当前余额结算」：`有效入账 − 累计支出 = 当前余额`。有效入账 = 账本累计收入 −
  过期作废的临时余额，钱包页因此不出现已过期的发放金额（线上超管账号那笔 2026-06-17、10 亿、7 天有效的
  兑换码不再显示；剔除后余额 56,385.22 = 5,286,519.43 − 5,230,134.21）。过期金额当时由差额反推
  （v0.29.3 已改为真实流水）。最近收支卡删掉 v0.29.1 加的「账本累计 / 差额」段，回到纯列表 + 90 天样本合计。
  审查结论：除那笔 10 亿兑换码外，剩余差额 −60,760.90 全部是过期临时余额与未入账余额
  变更，无重复、无符号错乱；管理员下调余额不写 topup 的旧缺口已在同版补上——`admin/users/actions.ts` 正负调整
  都记 `type=2`（负数默认描述「管理员手动扣减」），此后人工改余额会进账本。

- v0.29.1 注册奖励（`topup.type=4`）从充值类目移到赠送与返利；充值只保留 1/2/5/13。钱包「最近收支」卡底部加
  账本累计（收入 / 支出 / 净收支）与差额，写明「净收支 + 差额 = 总余额」，最近 8 笔改标为 90 天样本、不是余额合计。
  永久为负时的抵扣说明独立成句（实为 −X，已用 Y 抵扣），不再用「其中」造成再减一次的错觉。
  钱包因此每次多一次全量天表聚合（与账本页同一把尺子，实测约 0.34s，与 90 天窗口查询同量级）；列表本身仍只扫 90 天。

- v0.29.0 个人账本按天汇总收支，类别可筛选、每页 10 天卡片内局部刷新，「当天分类」只给每类收支与当天合计（不铺细项）。
  账目合并两张表：`topup`（发放与活动收支）+ `usage_log.creditsUsed`（API 消费，不进 topup）。两表 `UNION ALL` 后按北京日界
  在 SQL 里分组、排序放 JS（D1 不给聚合别名排序），并走新增的 `d1All`（只接受 SELECT，按列别名取数，避开 sqlite-proxy
  的位置数组错位）。**到期没花完的临时余额刻意不做第三张来源表**：`vercel.json` 每天 02:00 UTC 的 cleanup cron 把
  `expiresAt <= now` 的 `temporary_balance` 整行删除且不写流水，读它会让过去某天的账随清理被改写——账本最不能容忍历史变动。
  因此这笔钱与「早期未计量调用」「管理员直接下调余额（下调不写 topup）」一起体现在页头的「与余额的差额」里，不要改成硬凑，
  也不要回头去读 `temporary_balance`；要真正记账必须先在 cron 里补写流水（v0.29.3 已实现：删行前补 `type=14` 负流水）。
  金额为 0 的行由 SQL 的 `amount <> 0` 挡掉，不进天表 / 分类 / 最近收支；天表与分类都用未取整原值判定进出、取整只在展示层，
  否则会出现「这天列进表里、点开却没有小计」或累计差一分。差额只在「全部」类别下给出（筛选态合计天然不等于余额）。
  钱包删掉「充值记录」卡与 `lib/billing/grant-expiry.ts`、`lib/billing/topup-view.ts`，
  订单卡只留未到账（status 0/1）与手动查询，翻页动作 `listMyPayOrders` / `listMyTopups` 一并删除；
  「最近收支」的**列表**只扫 90 天窗口，别整卡改全量；v0.29.1 起钱包另跑一次全量天表聚合只为对账（约 0.34s），
  两者不要混成一张查询。

- v0.28.1 支付宝、微信与 QQ 易支付充值仅管理员可用（数据库 role ≥ 10），钱包隐藏普通用户入口，下单动作独立查库校验；LinuxDO、兑换码、旧订单查询和回调不变。无在线渠道时充值弹窗直接展示兑换码。

- v0.28.0 重置密码自动发双方站内信与用户邮件；SMTP 在系统设置配置（仅超管），`smtp_config` 的授权码使用 `API_KEY_ENCRYPTION_SECRET` 加密且不回显。
  通知失败仅返回警告，不丢失已生成的密码；可选附带明文，邮件不会随站内信清理。SMTP 保留密码时严格读取原配置，读失败不写回。
  弹窗改四区切换、视口限高，固定表格列与用户行 ID 并保留分页；弹窗挂在分页行之外，列表变化也不卸载密码结果，关闭前确认后清除。

- v0.27.0 加站内信（`message` 表，迁移 021）：`lib/message/messages.ts` 提供发信/列表/未读/领取/删除/过期清理，
  附件四种（cr 写 `topup type=13`、券走 `grantTickets source=gift`、兑换码与自定义凭证领取前遮内容）。
  领取必须靠 `d1Run` 的条件 UPDATE 做幂等守卫，`changes !== 1` 即视为已领；入账失败回滚 `claimedAt`。
  清理口径是"每封信读过 3 天后删"，但**带附件且未领取的信永不自动删**，否则等于吞奖励。
  管理员端"密码查看"在 bcrypt 下不成立，只能重置：明文只在弹窗出现一次，可选写进发给该用户的站内信；
  管理员之间互相改密是提权通道，只有超管能重置管理员账号。收件箱 `/messages` 用主从布局（左主题+简述、右正文+领取），
  顶栏铃铛的未读数由布局服务端算好传入，避免每次导航多打一次 D1。
- v0.26.1 把 v0.26.0 那张独立的活动消耗卡并回「模型数据分析」的药丸行：它本质是"第 6 种视角"，
  做成独立卡片就变成"药丸切换 + 一张永远在的图"两种呈现混在一起，还多占一节高度。
  组件因此去掉 `Card` 外壳（`activity-spend-card.tsx` → `activity-spend-chart.tsx`，`ActivitySpendChart`），
  高度对齐其余视角的 280px；`ModelAnalyticsCard` 的 `TABS` 加 `activity`、props 加 `activities`。
  与其它 tab 一样是纯展示切换 —— 数据仍由服务端一次算好传入，点药丸不重新请求。

- v0.26.0 在看板「趋势与分布」节加了「活动消耗」卡：三个限时玩法各画消耗柱 + 收入柱，净收入用平滑曲线叠在同一坐标系、可为负。
  数据层 `lib/usage/activity-spend.ts` 走 `topup` 账本（`type` 6 / 11 / 12）而不是各玩法的累计表 —— 雷电与翻牌的汇总只按
  `activityKey` 记账、没有时间窗，只有账本能给出窗口内的投入产出，且与钱包流水同口径。
  净收入必须单独一根右轴：它与消耗差两三个数量级（近 7 日 17.9 万 vs 160 万），共用轴会被压成贴着零线的平线，
  所以再叠一条 `ReferenceLine y=0` 虚线，点在线上方是赚、下方是亏。并入既有分节而非另起一节，随 `今日 / 近 7 日 / 近 30 日` 变。

- v0.25.1 把 `/admin/lottery` 的 `今日 / 近 7 日 / 近 30 日 / 全部` 从 `<a href="?range=">` 改成按钮 + 局部刷新。
  关键点是**窗口不只管明细**：概览六个数字与按用户表都按窗口算，所以新增 `loadActivityReport(range)` 一次返回整套，
  三张卡与标签合并成 `components/admin/lottery-report.tsx` 共用一份状态；只翻页时才走 `listAdminDrawRecords` 单换明细，
  否则会出现「概览写着今日 109 次、明细是全部第 2 页」这种自相矛盾。`?range=` 保留为首屏直达入口。

- v0.25.0 把三处活动记录列表（`/lottery` 我的活动记录、`/flip` 我的牌局、`/admin/lottery` 逐次明细）统一成
  「每页最多 10 条 + 只刷卡片」：翻页走 `Pagination` 的 `onPageChange` 与三个只读服务端动作
  （`listMyActivityRecords` / `listMyFlipRounds` / `listAdminDrawRecords`），不再改 URL、不再整页刷新。
  每页条数与后台时间窗口径收进 `lib/lottery/records.ts`；`drawNetCredits` 挪到 `lib/lottery/prize-math.ts`，
  因为客户端组件不能 import 带 D1 驱动的 records 层。卡片都带 `key={首行 id}`，开奖后重挂回第 1 页。

- v0.24.1 把转盘自己的名字从「限时活动」改成「幸运转盘」：`nav-data.ts` 的条目、`/lottery` 的 `PageHeader`、
  开奖流水文案、任务提示、后台活动记录副标题五处一起改，「限时活动」退回成 `/admin/settings` 三张卡片的分类前缀。
  副标题同时去掉重复的「幸运转盘 ·」，与 `/flip`、`/raiden` 的「标题=玩法名」口径对齐。账本 `type=6`、
  配置键 `lottery_config` 与历史流水文案都不动——改名不碰钱。

- v0.24.0 把 v0.23.0 的 20/24px 再放宽到 32px：药丸 `gap-x-5`→`gap-x-8`，条目 `gap-x-6`→`gap-x-6 xl:gap-x-8`。
  条目行必须带断点——全程 32px 时 1024 宽度下管理模块 8 个条目会折成两行，导航高度从 91px 涨到 128px；
  现在实测 1024 单行 24px，1280 / 1440 / 1920 单行 32px，`navH` 恒 91px。纵向一律未动。

- v0.23.0 只调 `components/dashboard/module-nav.tsx` 的横向间距：药丸 `gap-2`→`gap-x-5 gap-y-2`（8→20px），
  条目 `gap-x-1`→`gap-x-6 gap-y-1`（4→24px），条目内图标与文字 `gap-1.5`→`gap-2`。
  用户说的「紧凑」指的是**行内**横向挤，不是两行贴太近，所以 `pt-3 / pb-2 / pt-1.5` 与 `px-2.5 py-1.5` 一律保留，
  导航高度仍 91px；1024 宽度下管理模块 8 个条目仍排成一行不折行。

- v0.22.0 的病灶不是渲染慢，而是**发版后旧页面仍按旧哈希取 `/_next/static/chunks/*.js`**：那些文件在新部署里已不存在，
  点进没访问过的路由就 404，而全站没有 `error.tsx`，只剩 Next 默认错误页。v0.21.0 之后当前模块以外的链接不再渲染，
  也就没有预取，命中率被抬高。
- 数据层新增 `lib/cloudflare/http.ts`：D1 / KV / Cloudflare REST 统一走 `cfRequest`。
  **读** 5s 超时 + 最多重试 1 次（仅 429/5xx/连不上）；**写** 20s 超时、绝不自动重试——
  扣费类 UPDATE 的响应丢了无法判断上游是否已落库，重试等于重复扣钱。`d1-http.ts` 用 sqlite-proxy 回调的
  `method === "run"` 区分写，`d1Run` 恒为写档。
- 新增 `app/(dashboard)/error.tsx`（代码块失败自动整页刷新一次，15s 防循环；其余错误给「重试/刷新页面」）
  与 `app/(dashboard)/loading.tsx`（整段骨架屏，此前只有 `/wallet` 有）。

- v0.21.0 撤掉桌面端左侧栏，改成 `components/dashboard/module-nav.tsx` 的两级顶部导航：第一级五个模块药丸
  （通用 / 活动中心 / 在线体验 / 个人 / 管理，点击落到该模块首页），第二级只铺当前模块的条目。
  导航结构与判据集中在 `components/dashboard/nav-data.ts`，抽屉（`SidebarNav`）与顶部导航共用同一份；
  品牌位移到 `AppHeader` 左侧，`PageBody` 的版心因此在整个视口取中。窄屏仍是底部标签栏 + 菜单抽屉。
- v0.19.0 ~ v0.20.0 是「雷电行动」双武器槽（7 种子弹各自独立等级 → 改为自动装填等级最高的两种，
  删 `Q` / `E` 键位），实现见 `components/raiden/weapons.ts`、`engine.ts`、`game.tsx`，
  设计文档 `docs/features/raiden.md`。
- v0.18.0 动的是**排版骨架**而不是配色：`components/dashboard/section.tsx` 提供 `PageBody`（`mx-auto max-w-6xl`
  居中版心）、`PageSection`（上沿发丝线 + 居中衬线小节标题 + 轻字重副标题）、`PillTab`（胶囊筛选），
  20+ 个页面原先各自的 `space-y-N p-8` 满铺容器统一换成 `PageBody`；看板改居中 hero + 三节正文，
  钱包分两节，模型库筛选全部居中。`ModelAnalyticsCard` 因此**删掉了 `rangeLabel` prop**（标题由分节给出）。
- v0.17.0 把**默认配色**换成米白纸面 + 棕墨字 + 苔绿点缀（浅色与深色同一套色相），标题走衬线轴、数字仍用无衬线 +
  `tabular-nums`，圆角 12px、阴影改棕调，窄屏导航改成固定底部标签栏。旧的灰阶配色原样存成
  `[data-theme-preset="neutral"]`，「外观 → 配色」可切回，**所以这版是可逆的**；配色选择存在 localStorage，
  由 `components/theme/theme-provider.tsx` 管理（不是后台设置，改了不会影响其他用户）。
- v0.16.0 只动表现层，不改任何数据口径：看板分组卡去掉 `truncate`、账户卡并入通用卡、全零序列不再画空坐标系、
  侧栏拆成 通用/活动中心/在线体验/个人/管理（后三组可折叠且当前页所在组强制展开）、钱包月历压成日期紧凑条、
  模型库 logo 破图退回首字母。
- v0.12.0 ~ v0.14.0 是「雷电行动」小游戏（前台 `/raiden`、后台 `raiden_config`，设计文档 `docs/features/raiden.md`）。
- v0.15.0「翻牌夺宝」（前台 `/flip`、后台 `flip_config`、`topup.type=12`，设计文档 `docs/features/flip-cards.md`）
  发版当天由管理员自行开启并定数值（票价 100 cr / 牌桌合计 1010 cr → 返还率 84.17%），迁移 020 同日在线上执行。
- v0.10.0 三项活动**全部默认关闭**：开与不开、比例 / 档位 / 每任务额度都在「后台 → 系统设置」由管理员决定。
  本次发版**没有写任何 `option` 活动配置**，也没动线上奖池与任何真实用户余额。
- 迁移 017（`cashback_claim`）与 018（`user_task`）是纯增量建表 DDL（`CREATE TABLE IF NOT EXISTS`），
  2026-10-30 已在线上 D1 执行；两张表当时是空的，回退只需 `DROP TABLE`。
- 顺延未做：`/chat` 会话导出与公开分享页（`chat_session.shareToken` 已留列）、`chat_message.creditsUsed` 仍恒为 0、
  抽奖「翻牌夺宝」变体（券价 / 奖池 / 返还率三个数值要先定）。
- 涉及线上奖池、真实用户余额与活动开关配置时仍然单独确认，不随代码推送自动执行。

所有版本变更记录见根目录 [`CHANGELOG.md`](CHANGELOG.md)，遵循 [Keep a Changelog](https://keepachangelog.com/) 规范。

