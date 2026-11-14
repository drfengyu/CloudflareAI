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
  - 记录：`lib/lottery/records.ts` 只读聚合（不新增表）——用户侧「我的转盘记录」逐次明细 + 汇总，管理侧 `/admin/lottery` 按今日/近 7 日/近 30 日窗口出站点净收益、按用户聚合与最近 200 注明细；净收益 = 券面 + 回收 − 发放，只算已开奖的券
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

**当前版本**：v0.72.0（2026-11-14，三国讨逆传战斗界面与演出修补）
**下一版本**：待定

- v0.72.0 三国讨逆传战斗界面与演出修补：伤害飘字按目标错列并钳制在兵力面板下方；
  指令区显示阵型对抗（克制 / 被克 / 均势）与当前指挥目标；新增按有效速度排序的「行动顺序」条，
  引擎 `battleTurnOrder` 与结算共用一份排序；尊重 `prefers-reduced-motion`（关震屏 / 印章回弹 / 扬尘）；
  败退印章窗口随倍速缩短；深底章节加轮廓光；小地图补视野框；城内铺子补焦点环。
  `tsc` 0 错误、改动文件 ESLint 0/0、`tests/trial-saga.test.ts` 51/51，未在真实浏览器逐帧核对。

- v0.70.0 五个活动页画面交互修补：试炼 / 工坊 HUD 的券数改成按钮直接开券包，转盘与翻牌页头补活动窗口条；
  券不足时抽奖 / 开局按钮可点并提示缺口，转盘失败说明未扣券；试炼弹层在手机上钉视口、
  自动存档失败可点重试；工坊战斗错误常驻并可同步、休息不可用写明原因、走位不抢输入框按键；
  翻牌翻开时牌面显示加载态；工坊 / 星图 / 翻牌把玩法移到统计卡之前；券包礼包手机单列、兑换支持回车；
  转盘窄屏抽完滚动到结果；星位补焦点环与更大命中区。`tsc` 0 错误、改动文件 ESLint 0/0，未在真机点验。
- v0.69.1 三国讨逆传野外遇敌概率再降到原来的 3 倍：
  树林 30%、草地 16.5%、海边滩涂 13.5%、官道 9%；场次上限与冷却仍不设。
  `tests/trial-saga.test.ts` 50 项全过，`tsc` / ESLint 通过。
- v0.69.0 三国讨逆传野外遭遇取消场次上限与冷却：
  移除 `SAGA_MAX_ENCOUNTERS` 封顶与战后 / 出城冷却，跨入新的野外格子即可继续判定；
  遇敌概率从 5 倍回调到 4 倍（树林 40%、草地 22%、滩涂 18%、官道 12%）。
  HUD 改为「遭遇 n 场」。`tests/trial-saga.test.ts` 50 项全过，`tsc` / ESLint 通过。
- v0.68.0 三国讨逆传野外遇敌概率整体提高为原来的 5 倍：
  树林 50%、草地 27.5%、海边滩涂 22.5%、官道 15%，城门洞、城墙与城内校场仍安全；
  每趟 10 场遭遇上限、战后冷却 18 格与出城冷却 12 格不变。
  遇敌只在客户端判定，遭遇战仍以 `{ k: "skirmish" }` 指令上传重放，旧行军战报不受影响。
  `tests/trial-saga.test.ts` 50 项全过，`tsc` / ESLint 通过。
- v0.67.0 三国讨逆传旧规则行军续玩修复：
  旧版本开出的行军读取时切到当前 `SAGA_RULESET`，同时记下 `legacyRules` 与 `rulesFrom`；
  分界之前的指令仍按旧规则重放（旧战报不变），之后的战斗（含主帅本阵）补士兵位、
  发敌方配装与随机强化。`createReplayState` / `replaySagaRun` 按分界切换规则，
  战斗结算的计策领悟改读 `battle.rules`。
  `tests/trial-saga.test.ts` 50 项全过，`tsc` / ESLint 通过。
- v0.66.0 三国讨逆传敌方装备细化：
  敌方兵甲每 5 级升一档；每场按战斗种子给兵器 / 甲胄各滚一次随机强化（铁匠铺同一口径，
  16 级以上最多 +3、杂兵最多 +1，只作用于本场），敌情面板显示 `+N` 与最终加成；
  招降只收人，敌将随身装备不随入队。`SAGA_RULESET = 5`，v0.65.0 行军按 `rules = 4`
  以 8 级一档、不强化重放。
  `tests/trial-saga.test.ts` 49 项全过，`tsc` / ESLint 通过。
- v0.65.0 三国讨逆传敌方装备：
  敌将按等级每 8 级升一档兵器甲胄并计入攻防，营寨士兵位与野外领头敌将同规则；
  杂兵（兵士 / 山贼 / 海贼 / 盗贼，`SagaEnemy.poor`）按等级发装备但低一档；
  野外遭遇新增第四类杂兵「海贼」，`SAGA_RULESET = 4` 生效，v0.64.0 行军按 `rules = 3`
  以原编成与空手杂兵重放，旧对局不受影响。
  `tests/trial-saga.test.ts` 47 项全过，`tsc` / ESLint 通过。
- v0.64.0 三国讨逆传战斗规则升级：
  野外遇敌概率翻倍（官道 3% / 草地 5.5% / 滩涂 4.5% / 树林 10%，城内与城门洞仍安全）；
  战斗新增「敌情」按钮，展示敌将四维、装备、计策与特性；
  营寨 / 精锐 / 攻城战按种子补 1~N 个士兵位，敌我上场统一封顶 5 人；
  `SAGA_RULESET = 3`：计策点改为 `2 + 智力/20 + 等级项`（玩家封顶 12、敌方 10），
  普攻与火计按 `0.9 + 智力差/400`（65%~98%）判命中，伤害乘 `1 + (等级-1)×1%`；
  敌将按等级带兵器甲胄并计入攻防。旧局 `rules = 1/2` 保持原重放结果。
  `tests/trial-saga.test.ts` 46 项全过，`tsc` / ESLint 通过。
- v0.63.0 平定奖励改发金币：
  平定一处地方的档位奖励从 tcr 改为游戏金币，`trialGoldFor` 结算后直接加进
  `endSave.gold`（上限 9,999,999），随存档带进下一处地方、不过期；
  钱庄存金仍折成 tcr 进钱包，`rewardValidDays` 只作用于这部分。
  战报新增 `result.clearGold` 持久化，重复提交与行军录都按金币展示。
- v0.62.0 任务成就扩充：
  每日 9 项合计 120 活跃度（目标 100）、每周 9 项合计 360（目标 300），任务多于目标以允许跳过；
  新增文生图 / 翻译 / 嵌入 / 网关 API / 领奖励信 / AI 能力种类 / 模型种类任务。
  `apiSuccessCount` 只统计 `usage_log.channel ∈ {openai, anthropic}`，站内对话走 `chatPromptCount`；
  工坊 / 星图按 `updatedAt` 在周期内各计 1 局。任务页合计由清单实时汇总。
- v0.61.0 活动券内置与全站补偿：
  五个玩法页撤掉页面级 `CouponShop` 卡片，券余额与兑换 / 礼包入口进画面：
  试炼沿用城内活动券铺子；工坊 HUD 显示券数并新增「券包」页签；
  星图 / 翻牌 / 转盘新增 `components/activity/coupon-entry.tsx`（点余额展开 `CouponShop`，
  `tone="dark"` 适配转盘盘面）。钱包页保留全站券商店。
  存档回档补偿改为全站：`scripts/send-trial-coupon-compensation.mjs` 给所有 `status <> 3`
  用户各发一封站内信，附件 4 张当期试炼券（`activityKey` = `trial_config.startAt`，
  券名 `couponNameFor("trial", activityKey)`，券面 `4 × couponUnitCredits`，线上为 200 cr/张、共 800 cr），
  消息 id 为 `trial-save-fix-20261114:<userId>`，`INSERT OR IGNORE` 幂等，默认 dry-run。
  `parseAttachment` 的 coupon 分支改按 `ACTIVITY_KINDS` 校验，试炼 / 工坊 / 星图券信可正常领取。
  线上已执行：7 名用户各 1 封，重跑仍为 7 封。
- v0.60.0 画面与交互修复：
  `paintBattle` 增加 `nowMs` 毫秒时间轴：帧循环里的 `time` 是秒、`BattleAnimation.startedAt`
  是毫秒，原 `elapsed = time - startedAt` 恒为负，所有战斗动画不画但按钮仍锁 1.2 秒以上；
  回合收尾 `setTimeout` 存进 `animTimerRef`，开新回合与卸载时清理。
  `battleEnemyAtPoint` 改为命中框内取离触点最近的 slot（4 将以上命中框重叠，原按下标返回第一个）。
  开场浮层卡片补 `max-h-full overflow-y-auto overscroll-contain`，手机窄屏不再裁掉「出发」按钮。
  `coupon-shop.tsx` 礼包改「先选中 → 确认条确认」，取消不扣款。
  城内与行军界面「试炼券」统一为「活动券」、价格图标改 `CouponIcon`；铺子交易按钮统一按 `busy` 禁用；
  `/trial` 去掉 `lg:max-w-[1440px]`，版心回到 `PageBody` 默认宽度。
- v0.59.0 铁匠铺装备强化与玩法页倒计时：
  新增 `lib/trial/saga/forge.ts`：`SAGA_FORGE_MAX_LEVEL = 5`、`forgeCost`（`priceTickets + 当前等级 × 2`）、
  `forgeBonus` / `forgeStat`（每级 +20% 基础属性）、`upgradeGear`（只升不降）、
  `normalizeGearLevels`（只留武器 / 护甲，截断 0~5 级）。
  `TrialSave.gearLevels` 存强化等级，与装备解耦；`generalStats(state, gearLevels?)`
  可选第二参，`battle.ts` 建阵与招降补兵传入 `state.save.gearLevels`，其余旧调用不变。
  购买记录 `{ itemId: "forge", gearId, targetLevel, cmdIndex }` 由 `parsePurchases` / `applyPurchase`
  读取；服务端 `upgradeTrialGear`（`lib/trial/store.ts`）重放核对持有与当前等级，
  目标等级由服务端定（当前 +1），`payWithCoupon` 扣券后写记录，乐观锁失败退款、`purchaseId` 幂等。
  铁匠铺面板下半区展示 `+等级`、攻 / 防 `当前 → 下一级`、下一级券价与强化按钮。
  另把 `components/activity/activity-window-badge.tsx` 接入 `/trial`、`/workshop`、`/collection`
  活动进行中的页头（复用 `activityCountdown` 与临期券提醒）。
  `tests/trial-saga.test.ts` 新增两项铁匠铺用例（共 43 项）；`tsc`、ESLint 通过；
  本机无 `.env.local`，页面未实测。

- v0.58.0 活动中心 2.0 与钱庄金币换券：
  活动中心 `/cashback` 顶部改为实时进度卡 —— `lib/activity/hub.ts` 的 `loadActivityHub`
  一次聚合三种玩法的券视图与快照，卡片展示活动窗口 / 券面单价 / 结束日期 / 券数 /
  进度条 / 继续入口 / 临期提醒；`lib/activity/window.ts` 提供纯函数倒计时
  （`formatRemaining` / `countdownTone` / `activityCountdown`，2 天内转琥珀、6 小时内转红），
  `components/activity/countdown.tsx` 每 30 秒在前端刷新；新增「今日日程」直达条。
  `ResolvedActivity` 补 `startMs` / `endMs`，读侧不再重复解析活动配置。
  钱庄新增「金币 → 试炼券」：汇率复用券面单价 `couponUnitCredits`（1 张 = X 金），
  不限量，兑换即到账；`lib/trial/saga/bank.ts` 的 `couponGoldCost` / `couponsForGold`
  负责取整，`buyTrialCoupons`（`lib/trial/store.ts`）重放核对金币后发券，
  购买记录 `{ itemId: "coupon", coupons, goldCost, cmdIndex }` 只用于重放扣金，
  整段 JSON 乐观锁失败会 `revokeCouponCredits` 撤回，同一 `purchaseId` 幂等。
  新增 `tests/activity-window.test.ts`（5 项）与钱庄换券用例；`tsc`、ESLint 通过。

- v0.57.2 三国讨逆传战斗排版与遇敌规则修正：
  `components/trial/game.tsx` 的战斗指挥区从画布底部浮层改为画布下方独立区块，
  每名武将拆成「状态行 + 指令行」两行（名字 / 等级 / 兵力 / 计策点 / 当前指令 /
  五个行动按钮 / 目标 / 计策 / 道具选择），去掉 `max-h-[150px]` 与强制换行，
  两军血条与队列不再被遮挡；结算卡在「前往下一处 / 回到城镇」下补一句
  「回城后下次仍从新地方出发，进度已存好」。
  `lib/trial/saga/map.ts` 的 `fieldEncounterChanceAt` 给官道 1.2%、海边滩涂 2%
  正概率，城门洞（按 `city.gateTx/gateTy` 判定）、城墙与 `SAGA_TILE_YARD` 城内校场仍为 0，
  推翻 v0.57.1 的「官道与海边安全」；试炼页规则、开始弹窗、`encounter.ts` 注释同步。
  `tests/trial-saga.test.ts` 遇敌概率用例改为四类野外地形正概率 + 城内与城门洞为 0，
  新增「出城即入遇敌范围」，共 162 项全过；`tsc`、ESLint、`npm run build` 通过；
  本机无 `.env.local`，页面未实测。
  运维：存档回档补偿最早给受影响用户发过 800 cr（`topupType = 13`，
  id `trial-save-fix-20261114-5c7dcb78`）；v0.61.0 起改为全站每人 4 张当期试炼券
  （约合 800 cr）的站内信，旧那封已领取的 800 cr 不回滚。

- v0.57.1 三国讨逆传存档与地形修复：
  `lib/trial/store.ts` 新增 `startedAtDesc`：`typeof(startedAt) = 'text'` 时用
  `CAST(strftime('%s', startedAt) AS INTEGER) * 1000`，与毫秒整数统一比较，
  读存档、进行中行军与历史列表共用；旧行替换分支不再绑 `Date`，直接绑毫秒。
  `findActiveTrialRun` 跳过 `sagaRunUntouched`（零 `commands`、零 `purchases`、`shopSeq = 0`）
  的空壳行军，下一次出发按最新 `endSave` 重开，涿州平定后回城不再回档。
  `lib/trial/saga/map.ts` 的 `paintBlob` 增加保留谓词，营地 / 乡野空地只铺草地、
  不再截断官道；新增 `fieldShoreAt`（8 邻水），水边草地遇敌概率为 0；
  `components/trial/renderer.ts` 在水边画沙岸与浪线。
  `tests/trial-saga.test.ts` 新增官道贯通 BFS 与空壳行军判定，共 162 项全过。

- v0.57.0 三国讨逆传自动存档、武将特性、战斗界面与训练场：
  规则集升级 `SAGA_RULESET = 2`，旧局 `rules: 1` 重放结果不变。
  `lib/trial/saga/data.ts` 新增无双 / 智圣 / 会心 / 猛将 / 铁壁 / 神速 / 仁德七种固有特性，
  提供武力 / 智力 / 统率 / 兵力、暴击率（×1.7）与额外攻击次数加成，战斗与结算读 `traitStats`；
  升级按等级给策略点（上限 12），`tacticsFor(def, level)` 让智将在特定等级习得计策。
  新指令 `{ k: "retreat" }`：撤退把当前战况（兵力 / 阵型 / 冷却）写回行军态并回到大地图，
  再战接着打，不掉已拔营寨；`retreatFromBattle` 供前端调用。
  自动存档：`autoSaveTrialAction` 客户端防抖上报，`saveTrialRunProgress` 以整段 `questions`
  做乐观锁，返回重放后的 `{ commands, settled, settlement }`；重放到达 `won` 即自动结算，
  前端不再有「收兵」按钮，兵败 / 平定额度直接走结算卡；刷新时取 localStorage 与服务端
  指令中更长的一份。
  `lib/trial/saga/training.ts` 训练场：`SAGA_TRAINING_ITEM_ID = "training"`，2 张券升 1 级，
  上限 `9 + 已拔营寨 × 3`（封顶 30），低级可按 10 级一档整段买；购买记录带 `cmdIndex` 重放。
  野外遇敌概率提高（草地 2.4% / 树林 5%）。药店补品类、城内补活动券礼包入口（`coupon` 直通
  `CouponShop`，余额变化 `router.refresh()` 实时回填）。
  `components/trial/game.tsx` 战斗改为上下两联布局：武将竖排成列、双方各占半边血条
  （`paintBattleTeams`），战报与策略选择移到画面下方中间浮层，战场点击可选中敌军；
  未遇敌时点空白处打开「军中一览」（武将 / 道具 / 装备 / 队伍）。
  `tests/trial-saga.test.ts` 新增特性、规则集兼容、策略点与计策、撤退、训练场、
  遇敌概率等用例，共 160 项全过；`tsc`、ESLint、`npm run build` 通过；
  本机无 `.env.local`，页面未实测。

- v0.56.0 三国讨逆传补全剧情与场景，纯前端表现层，不动经济 / 服务端 / 表结构：
  大地图 `SAGA_FIELD_COLS / ROWS` 由 52×34 扩到 76×48，每张图在官道格上新增
  村落 / 祠堂 / 渡口三处 `SagaFieldPoi`（地名取章节 `landmarks`，四连通可达），
  走到跟前按 E 弹 `poiScene`；新增 `lib/trial/saga/story.ts`（intro / camp / victory /
  poi / tavern / council 六类 `SagaScene` 与 `SAGA_NPCS` 台词）与
  `lib/trial/saga/quests.ts`（2 主线 + 6 支线，进度由 `SagaReplayState` 与本地
  走访数推出，不入存档）；`components/trial/portraits.ts` 用 FNV 哈希生成武将立绘，
  武器 / 护甲分四档换甲色、盔饰与兵器剪影；`components/trial/scenes.tsx` 新增
  街景 `TownScene`、`NpcIntro`、`QuestBoard`、`PartyStrip`、`CampBanner`、
  打字机 `DialogueOverlay`；`components/trial/game.tsx` 进城改为街景 + 铺子面板，
  补酒馆 / 营帐页签、军令 HUD、回城 / 出城切换，看过的场景与走访点记在
  `localStorage` 的 `trial-saga-town:${runId}:${seed}`；刷新不重播、走访只影响支线。
  `tests/trial-saga.test.ts` 新增 3 项（地图扩容与三处地标可达、剧情 / NPC 数据完整、
  军令进度与主线优先），共 153 项全过；`tsc`、ESLint、`npm run build` 通过；
  本机无 `.env.local`，页面未实测。

- v0.55.0 三国讨逆传取消出城券费，活动券成为城内唯一流通货币：
  `startTrialRun` 不再 `payWithCoupon`，`TrialConfig` / 后台表单 / 页面删去
  `runPriceCredits`；`SagaItemDef` 只保留必填 `priceTickets`（武器 / 护甲 1/2/3/5 张，
  伤药 1、良药 2，军需 1~2），`buyTrialSupply` 泛化为 `buyTrialItem`——客栈虚拟商品
  `inn_rest`（`SAGA_INN_PRICE_TICKETS = 1`）与普通商品都按 `priceTickets ×
  couponUnitCredits` 实时扣券，购买记录带 `cmdIndex`，CAS 冲突退券；重放侧
  `parsePurchases` 以商品表校正券价、客栈可重复买、被动军需去重，`applyPurchase`
  对 `inn_rest` 调 `restAtInn` 并在 `lost` 时切回 `field`。
  旧金币指令 `{ k: "shop" }` / `{ k: "inn" }` 从 `SagaCommand`、`sanitizeSagaCommands`
  与重放循环移除（改版客户端伪造也无效）；历史 `bank_gold` / `gold_*` 购买记录仍读回。
  钱庄只保留金币 → tcr 单向：删 `buyTrialGold` / `GoldPurchaseResult` /
  `bankGoldForTcr` / `SAGA_BANK_MAX_TCR_BUY` / `SAGA_INN_PRICE_GOLD` / `buyGoldItem`，
  后台删「换金价」输入，`SagaBankPolicy.goldPerTcrBuy` 仅用于校验历史记录。
  前台 HUD 去掉 tcr 与出城券数，开始 / 结算弹窗直接出发；钱庄面板只留存金，
  铁匠铺 / 药铺 / 军需 / 客栈全部显示券价。`tests/trial-saga.test.ts` 重写经济用例
  （券价清洗、住店券补兵 / 兵败重整、购买记录校正、被动去重、旧记录兼容），
  共 150 项全过；`tsc`、ESLint、`npm run build` 通过；本机无 `.env.local`，页面未实测。

- v0.54.1 工坊战斗不再卡死：`battleWorkshop` 先 `ensureStateRow`，遇到「客户端还在战斗页、
  服务端已经没有这场遭遇」（写回执丢失 / 别处先结算 / 存档被重置）时不再抛
  「当前没有进行中的战斗」，改回 `endedWorkshopBattle(state)`——`status = "ended"`、
  事件「战斗已经结束」，把服务端权威存档带回前端，`BattlePanel` 随之卸载。
  客户端 `act()` 失败一律 `router.refresh()` 对齐一次，`ended` 弹「这场战斗已经结束」，
  战报卡显示「战斗已结束」。
  战斗/合成落库后的里程碑改走 `safeGrantReachedMilestones`：发奖抛错只记日志，
  不把已结算的回合报成失败（漏发的奖励由页面「补领」兜底）。
  `mergeWorkshop` 补上 `state.encounter` 闸门，队伍页合成按钮在战斗中一并禁用。
  `tests/activity-games.test.ts` 新增 2 项（三只灵宠倒地两只后第三只接管、读档后遭遇仍在
  且能出手；无遭遇时 `ended` 结算），共 149 项全过；`tsc`、ESLint、`npm run build` 通过；
  本机无 `.env.local`，战斗页未实测。

- v0.54.0 野外随机遇敌：新增 `lib/trial/saga/encounter.ts`——`sagaEncounterFor(run, ordinal)`
  只读 `run.seed` 与「本趟第几场」，决定兵种（兵士 / 山贼 / 盗贼）、1~3 队杂兵与
  38% 概率的本章敌将（合计最多 4 队），等级 / 兵力 / 金币 / 经验随章节与场次成长，
  野外敌军不可招降；`SAGA_MAX_ENCOUNTERS = 10` 封顶防刷金。
  `battle.ts` 抽出 `buildBattle` 并新增 `startEncounterBattle`（节点下标 -1，
  RNG 盐独立）；新指令 `{ k: "skirmish", rounds }` 只在 `scene === "field"` 受理，
  按序号重建敌军重放，胜利回 `field`、失败进 `lost`，不占营地进度；空指令丢弃、
  每趟最多 10 场。`map.ts` 新增 `fieldEncounterChanceAt`（官道 / 城内外 0，
  草地 1.1%、树林 2.4%）。`components/trial/game.tsx` 逐格判定遇敌（战后冷却 18 格、
  出城 12 格）、触发即停寻路开遭遇战、HUD「遭遇 n/10」、战斗标题「敌军 N 队」、
  战报「野外遭遇 N 场」；`SagaReplayState.encounters` / `SagaRunResult.encounters`
  随重放与结算。`tests/trial-saga.test.ts` 新增 6 项（编成确定性与上限、三类兵种、
  遭遇战胜利、指令清洗、兵败忽略、地形概率），共 147 项全过；`tsc`、ESLint、
  `npm run build` 通过；本机无 `.env.local`，页面未实测。

- v0.53.1 兵败后住店重整：`restAtInn(state, revive)` 在 `scene === "lost"` 时掉店钱
  照收（30 金）、把全队拉回满编；`replaySagaRun` 不再一见 `lost` 就 `break`，
  而是继续重放城中指令，`inn` 成功且 `revive` 时把场面切回 `field`、清空
  `state.battle` 让行军从下一步继续。兵败期间 `battle` 指令一律 `break` 丢弃。
  前台 `innBlocked` 按场景 / 兵力 / 金币给出具体禁用原因；敌营「兵败」面板与
  军情弹窗新增「回城住店」`goInn`（走到城门后开客栈页签）。金币不足 30 仍住不了店，
  只能收兵；收兵规则不变（按已拔营寨数结算，平定才发 tcr）。
  `tests/trial-saga.test.ts` 新增兵败住店用例（重整 / 金币不足 / 兵败期 battle 丢弃），
  20 项全过；`tsc`、ESLint、`npm run build` 通过；本机无 `.env.local`，页面未实测。

- v0.53.0 工坊修遇敌、钱庄双向、活动音频：
  - 工坊野外遇敌修复：`components/workshop/field-canvas.tsx` 新增 `inFlightRef`（同一时间只发
    一段路径）与 `stoppedRef`（服务端判 encounter / capped 后锁死本地游程），画布卸载时清空
    `pendingRef` 不再补发；纯 `ok` 确认只 `applyCounts`，不重置本地光标 / 跳跃 / 点击队列。
    此前遇敌瞬间的并发路径会被 `walkWorkshopField` 当成「上一场战斗还没结束」拒绝，
    并因 `applyRun` 重置光标表现为走两步被拉回。
  - 工坊金币与商店：`lib/workshop/shop.ts`（精灵球 25 金 / 药水 20 金、单次 1~10 个），
    `WorkshopState.gold`（旧档默认 0），`workshopVictoryGold`（野生 `10 + tier×4 + level`，
    道馆 `100 × stage`），`buyWorkshopShopItem` + `buyWorkshopShopItemAction`（限流 60/60s）。
  - 钱庄改为**可配置双向**：`lib/trial/saga/bank.ts` 的 `SagaBankPolicy`
    （`goldPerTcr` 默认 100、`maxGoldPerRun` 默认 600、`goldPerTcrBuy` 默认 40 且强制
    < 存金价），出城时 `sanitizeSagaBank` 冻结进 `SagaRun.bank`；旧局无 `bank` 字段退回
    `DEFAULT_SAGA_BANK`。换金走 `buyTrialGold`（`temporaryOnly` 扣 tcr + 负流水 +
    `itemId = "bank_gold"` 购买记录，重放时于 `cmdIndex` 加金，CAS 冲突退款）。
    `spendCredits` 重新支持 `temporaryOnly`（不足时把已扣的临时行加回去）。
    面板改数量输入 + 「全部」；后台试炼表单新增三项并校验换金价 < 存金价。
  - 音频：`lib/game/audio.ts` 用 Web Audio 合成 4 套 BGM 与 14 种音效（无素材），
    `components/activity/sound-toggle.tsx` 用 `useSyncExternalStore` 读开关，
    默认关闭、点击后 `window.confirm` 二次确认，偏好存 `localStorage: cloudai:game-audio`；
    离开活动页 `setTheme(null)`。试炼 `playBattleSfx` 按 460ms 动画节拍播报，
    工坊 `playBattleHitFx` 解析日志伤害并按 540ms 顺序触发受击抖动 / 飘字 / 斜劈
    （`app/globals.css` 的 `battle-hurt` / `battle-float` / `battle-slash`）。
  - 验证：`tsc`、触碰文件的 ESLint、`npx tsx --test tests/*.test.ts`（140 项）、
    `npm run build` 全过；本机无 `.env.local`，页面 / 音频未在真实浏览器实测。

- v0.52.0 两处「旅店」补齐，钱庄收口：
  - 灵宠工坊：免费休息仍是每日一次（整队倒地照旧放开），用完后按后台新增的
    `restCostCredits`（默认 2 cr，`snapCostToUnit` 对齐券面）用 `payWithCoupon` 买付费休息；
    `restWorkshopParty` 先预读判断免费 / 付费，`attemptWrite` 内复核，预读免费而写入时
    已非免费则整笔失败，CAS 冲突 / 规则失败都 `refundCouponPayment` 原路退券；
    返回 `paidCredits`，前台按钮区分「今日免费 / 付费休息（N 张券）/ 紧急休整」。
  - 三国讨逆传：新增 `lib/trial/saga/inn.ts`（`SAGA_INN_PRICE_GOLD = 30`，固定价写死在引擎，
    收兵重放不读后台配置）与 `{ k: "inn" }` 指令；`restAtInn` 在全队有人缺兵时收费并补满
    `partyTroops`，满编 / 金币不足不收费。城中整备新增客栈页签（逐将兵力条 + 住店按钮），
    兵力只在这趟行军有效。
  - 钱庄改**单向**：删掉 `buyTrialGold` / `buyTrialGoldAction` / `SAGA_GOLD_PACKS` 与
    tcr → 金币面板，只保留 100 金 = 1 tcr、每趟封顶 3 tcr 的存金；`spendCredits` 的
    `temporaryOnly` 选项随之删除。tcr 买金等于用充值 / 活动奖励直接买兵力与装备，
    也会架空 30 金的客栈定价。
  - 验证：`tests/trial-saga.test.ts` 45 项（新增客栈收费 / 不收钱 / 满编重放用例，
    指令清洗覆盖 `inn`）；`tests/activity-games.test.ts` 新增付费休息券价对齐用例；
    `tsc`、ESLint、`npm run build` 通过；本机无 `.env.local`，页面未在浏览器实测。

- v0.51.1 灵宠工坊全灭不再卡死：`resolveWorkshopBattle` 判负时收掉 `run` 并把整队扶到
  `max(1, floor(maxHp / 4))`，`restWorkshopParty` 对整队倒地的存档放开「每天一次」这道闸，
  前台休息按钮按「还有血没满」决定禁用、全灭时显示「紧急休整」；道馆按钮改按服务端光标
  与道馆格的邻接关系灰掉，省一次必退券的空请求。试炼页的活动券余额改用
  `lottery-wheel.tsx` 的渲染期对齐写法把 `initialTickets` / `initialTcr` 同步回本地 state，
  页内兑换完券出城弹窗立刻可用（此前只在开局 / 购物时改本地值，永远读不到兑换后的新张数）。
- v0.51.0 灵宠工坊从「一张券抽一只」改为**进图制的俯视角冒险地图**（与 v0.50.0 的行军大地图
  同一套思路，但遭遇改为逐格随机）：新增 `lib/workshop/field.ts`（纯函数
  `generateWorkshopField({ areaKey, seed })` 生成 44×28 格、每格 32 px 的格网，外圈岩石封死，
  地貌 blob + 主干道与三条岔路由 `carveRoad` 串起营地与道馆，另有 20 px 脚底碰撞盒、减速、
  遇敌率、可达性 BFS、交互点查询、`fieldStepRandom(seed, 第 N 步)` 与按「区域 + 种子」的
  64 条 LRU 缓存）；`lib/workshop/run.ts`（`sanitizeWalkPath` 收 `[方向下标, 步数][]` 游程路径、
  `replayWorkshopWalk` 逐格重放并按脚下地貌摇遇敌、`normalizeWorkshopRun` 按真实地图夹住光标、
  `workshopWalkLimits` 从配置取闸）；`components/workshop/field-painter.ts` + `field-canvas.tsx`
  （红白机式画家 + 逐格行走、攒路径上报、服务端游标纠偏）。数据模型：
  `WorkshopState.exploresToday` → `entersToday`（旧字段读回兼容），新增
  `run = { areaKey, seed, tx, ty, steps, encounters, startedAt }`；配置新增 `runMaxSteps`
  （默认 600，夹 20~5000）与 `runMaxEncounters`（默认 4，夹 1~50），`dailyExplores` 默认从 20
  降到 5（一张券换一整趟）。服务端动作 `enterWorkshopField` / `walkWorkshopField` /
  `leaveWorkshopField` 取代 `exploreWorkshop`，道馆挑战必须把光标走到道馆跟前一格，野外不能
  休息。**走位可被服务端验证**：地图与随机流都是种子的纯函数，客户端只上传方向序列，
  撞墙不计步、遇敌即停、走满上限由服务端收兵；单次请求最多 96 步（限流
  `workshop-walk` 240 次/60s）。为避免 `state.ts` → `field.ts` → `battle.ts` → `state.ts` 的循环，
  `run` 的结构归一留在 `state.ts`（`normalizeWorkshopRunShape`），几何归一放 `run.ts` 并由
  `store.readState` 串起来。
- v0.51.0 画面视野改为按画布比例推导（0.50.1 之后逻辑视野仍是死的 16:9，手机上画面虽然铺满
  了宽度，可视区域却压成一条）：`components/trial/renderer.ts` 的 `makeSagaView(height)` 固定
  逻辑宽 960、高度取画布 CSS 比例（窄屏 4:3 且不超过屏高 50%，宽屏 16:9，夹在 420~1200），
  `paintField` / `paintBattle` / 小地图 / HUD / 暗角全部改读 `view`；战斗场景用 `k = h / 540`
  只平移排好的站位与布景纵坐标、不拉伸角色本身。`game.tsx` 依据推导出的高度回写
  `canvas.style.height`，位图尺寸仍是「CSS 宽 / 960 × dpr」。工坊地图同理（固定宽 640，
  `makeWorkshopView` 导高度，窄屏 4:3 不超过屏高 42%）。验证除 typecheck / lint / 27 项单测外，
  还用无 DOM 的桩 `CanvasRenderingContext2D` 跑了 7000+ 帧工坊画面与 1500+ 帧试炼画面，
  查 `NaN` 坐标、非法渐变色标、越界 alpha 与不存在的 context 成员，均为 0；真机与浏览器实测
  仍未做（本机无 Node / npm，起不了 dev server）。

- v0.50.1 行军画面尺寸与清晰度：试炼页 `PageBody` 用 `px-3 sm:px-5 lg:max-w-[1440px] lg:px-8`
  覆盖默认窄版心，画布容器在窄屏 `-mx-5` 满幅出血到卡片两边；`components/trial/game.tsx`
  按「CSS 宽 / 960 × devicePixelRatio（夹在 1 ~ 2）」设置画布位图尺寸，`ResizeObserver`
  跟随布局变化，每帧 `ctx.setTransform(scale, 0, 0, scale, 0, 0)` 回到 960×540 逻辑坐标，
  所以 `renderer.ts` 的美术与点击寻路的坐标换算都不用改。逻辑视野仍是 16:9。
- v0.50.0 三国讨逆传的行军从线性节点改为**类吞食天地的俯视大地图**：新增
  `lib/trial/saga/map.ts`（纯函数：`generateSagaField({ 章节, 营寨数, 种子 })` 生成
  52×34 格网，地貌 blob + 河流 + 官道串起城门与各营，另有碰撞 / 减速 / 可达性 BFS /
  交互点查询与按种子缓存）；`components/trial/renderer.ts` 的 `paintField` 画 tile、
  城池城门、营寨（已破 / 可攻 / 未可三态）、四向行走动画、小地图与 HUD；
  `components/trial/game.tsx` 用 `requestAnimationFrame` 逐帧移动（分轴碰撞可贴墙滑动）、
  支持键盘 / 摇杆 / 点击寻路，城与营改为覆盖面板（`CampPanel` / `ArmyPanel`）。
  数据模型：`SAGA_RUN_VERSION` 6 → 7，`SagaReplayState` 用 `clearedNodes: number[]` +
  `completed` 取代 `nodeIndex`，战斗指令带 `node`，场景去掉 `"town"` 只剩
  `field / battle / won / lost`；`canEngageNode` 规定主帅本阵要先拔尽其余营寨，非法指令
  整条丢弃且不补打。**地图不入库也不采信客户端**：地图只由种子在客户端复现，服务端重放
  只看「打了哪座营、这一仗怎么打」，因此走位本身没有可作弊的收益。章节新增 `terrain`
  风味（平原 / 山地 / 江河 / 丛林）。

- v0.49.0 三国讨逆传新增城镇钱庄，把游戏金币与 tcr 收支打通（规则集中在
  `lib/trial/saga/bank.ts`；其中 tcr → 金币方向已在 v0.52.0 关闭，现为单向存金）：
  金币 → tcr 按 100:1，每次行军封顶 300 金（3 tcr），
  以 `{ k: "bank", g }` 指令重放扣金并累计 `bankedGold`，收兵时与平定奖励合并成一条
  type 17 正流水；tcr → 金币按 1:50 即时到账，`buyTrialGold` 用
  `spendCredits(..., { temporaryOnly: true })` 只扣临时余额，再以 CAS 追加金币包购买记录
  （重放按 `cmdIndex` 入账），冲突自动退还 tcr。两向价差 2:1 且存金收益低于出城票价，
  堵住刷金套利。首次否决了「1 金 = 10 tcr」：一趟全清 255~1025 金会变成 2550~10250 tcr。
  城镇渲染新增钱庄建筑与柜台，`game.tsx` 加入钱庄面板、HUD tcr 与结算存金明细；
  测试覆盖清洗 / 重放 / 封顶 / 金币包与结算分账。

- v0.48.0 每日试炼改版为《三国讨逆传》长线剧情 RPG：`lib/trial/saga/` 分 `data.ts`（58 名武将、
  4 条计策、5 种阵型、装备与军需、8 处地方的剧情 / 地名 / 首领 / 入队武将）、`state.ts`
  （存档归一、升级、招募、编成、装备与购买）、`battle.ts`（五将回合制兵团战）与 `run.ts`
  （行军生成、指令清洗、确定性重放、收兵结算）。剧情从涿郡一路推进到五丈原，走完当前地方
  全部节点才出现下一处地名，界面上不再出现「章节 / 局」；没有每日次数与限时，存档随最近一行
  `endSave` 延续，全剧终（八处皆定）后服务端拒绝开新行军。战斗按攻击 / 计策 / 防御 / 道具
  逐将下令，火计 / 回复 / 混乱 / 鼓舞消耗计策点，阵型互相克制，敌将兵力 ≤35% 可招降；城镇可
  编成、换阵型、买卖装备，军需帐用活动券买局内增益（购买记 `cmdIndex`，从下一步起生效，
  CAS 冲突退款）。反作弊仍只收指令，服务端用种子从 `startSave` 重放；平定当前地方才按节点数
  发 tcr。`trial_config` 删去 `timeLimitSeconds` / `dailyRuns`；`trial_run` 表结构不变
  （`questions` 存行军 JSON、`questionCount` = 节点数、`correct` = 已攻克节点数）。

- v0.47.0 每日试炼从文字回合制改为 2D 横版角色动作游戏：`lib/trial/dungeon.ts` 重写为
  60Hz 固定步长引擎——地图版本 5，每帧记录一个输入位掩码（左 / 右 / 跳 / 斩击 / 弧斩 /
  星屑 / 格挡 / 回血 / 进门），整数物理 + 种子随机，客户端实时演算、服务端 `replayTrialGame`
  用同一份帧序列逐帧重放，仍不信任浏览器上报的血量与楼层；敌人抬手亮「!」并显示意图，
  离地 34px 可躲横斩，连击最多 +10，层主残血狂暴，宝箱 / 精英掉可叠层装备。
  `components/trial/renderer.ts` 新增 480×270 像素 Canvas 渲染（程序化像素精灵、
  视差背景、7 层配色、粒子与伤害数字），`components/trial/game.tsx` 改为键盘 + 触控输入、
  rAF 固定步长、`localStorage` 续局与交卷重试。旧回合制 active 局（JSON 版本不是 5）
  在开局时就地换图且不重复扣券；经济与 `trial_run` 表结构不变。

- v0.46.0 星匣图鉴改版为「星图共鸣」：`lib/collection/config.ts`（极光 / 深海 / 古树三张星座 ×
  9 个星位，星石颜色 + 亮度、观星概率、熔炼 / 凝星价格、星座奖励与旧配置字段兼容）、
  `lib/collection/state.ts`（星石库存、同色亮度足够的嵌入与优先消耗、脏值归一、旧星匣存档迁移：
  未集齐藏品折星石、已集齐星匣直接点亮整张星座）、`lib/collection/store.ts`（观星先扣券失败退券、
  `WHERE version = ?` 乐观锁、完成星座与每日共鸣占 `activity_milestone` 唯一键后发 tcr）。
  前台 `/collection` 重做为星空画布（点选星位、亮线、库存、熔炼 / 凝星、每日共鸣），后台表单改为
  每日观星 / 观星票价 / 券单价 / 每日共鸣 / 有效期 / 星座完成奖励。全部状态仍在
  `collection_state.state` JSON，无需新迁移。

- v0.45.0 灵宠工坊改版为红白机式养成：`lib/workshop/pets.ts`（灵宠个体、面板、经验、自动进化）、
  `lib/workshop/state.ts`（存档结构、脏值归一、旧版各阶数量迁移）、`lib/workshop/battle.ts`
  （区域 / 道馆 / 招式 / 属性三角 / 捕捉 / 服务端回合结算）。开局三选一，区域按徽章解锁，
  战斗支持招式 / 防御 / 换人 / 药水 / 精灵球 / 逃跑，升级到门槛自动升阶，50 级封顶；队伍 3、
  仓库 60，倒地自动换人、全灭判负；三座道馆按徽章顺序挑战并发补给；3×9 图鉴按拥有阶数补齐。
  保留同阶二合一合成，里程碑改按图鉴 + 灵宠最高阶判定。全部状态仍在 `workshop_state.state` JSON，
  旧存档读取时换算成灵宠个体（等级 = 阶数 × 4），旧配置 `dailyGathers` / `gatherCostCredits`
  兼容读回，无需新迁移。前台 `/workshop` 与后台表单重做。

- v0.44.0 每日试炼改版为「浮游城」：`lib/trial/dungeon.ts` 新增版本 4 地图（每层两扇野区门 +
  层主房，最多 7 层），种子生成后落 `trial_run.questions`，`questionCount` = 总层数、`correct` = 通关层数。
  交卷只收 `enter / boss / skill / item` 动作序列，服务端 `simulateTrialDungeon` 确定性重放（剑技冷却、
  连击加伤、层主残血狂暴、经验升级、宝箱 / 精英装备、营地回血）；超时或瞬交按 0 层，仍用
  `WHERE status = 'active'` 抢占用局并只发一次 tcr。旧版答题 / 波次 / 地下城局在开局时就地换图不重复扣券。
  前台重做 HUD / 角色与怪物 SVG / localStorage 断点续战，后台表单上限改 7 层并删除 `lib/trial/questions.ts`。

- v0.43.2 `/admin/activity` 去掉全局时间窗与分页，改为「站点总计 → 每个活动一张卡」：活动时段由
  该活动首末记账日推导，卡内左栏按天、右栏按用户小计，底部活动小计；没有流水不出卡。
  数据侧只留一次 `GROUP BY activityKey, date, userId` 查询（`attributionCase("t")` 带别名 CASE，
  `LEFT JOIN user` 取名），按天与按用户两份表都在 JS 折叠，D1 不排序。仍然不列逐笔明细。

- v0.43.0 管理端活动记录合并：新增 `/admin/activity`，把原「转盘记录」与「雷电记录」并成一张
  「北京日 × 活动」站点收支表（收入 = 买券 / 礼包实付与转盘倒扣，支出 = 六种活动发奖与礼包赠送 tcr）。
  数据只读聚合 `topup` 的 6/11/12/15/16/17/18/19 类型；15/16 是共用流水，按描述里的活动名归属，
  识别不到的落在「未归属活动券」。`/admin/lottery` 与 `/admin/raiden` 改为跳转，删除转盘报告组件
  与其 actions，导航只保留一个「活动记录」。三个新玩法已在线上开启
  （`trial_config` / `workshop_config` / `collection_config`，2026-11-12 04:00 ~ 2026-11-30 23:59）。

- v0.42.0 限时活动改版：新增三个默认上线的玩法（`/trial`、`/workshop`、`/collection`），原转盘 / 翻牌 / 雷电
  保留为「经典玩法」（页面、数据、配置与路由不动）。活动中心与顶栏只展示新玩法三种券，经典玩法入口收进
  「经典玩法」区块；`ActivityKind` 扩到 6 个，`LIVE_ACTIVITY_KINDS` / `LEGACY_ACTIVITY_KINDS` 分组。
  每日试炼题目与答案在开局时落库、服务端判分（`trial_run`）；灵宠工坊三条线 9 阶、两只同阶合成上一阶
  （`workshop_state` 乐观锁）；星匣图鉴三个星匣各 6 件、重复折星尘、星尘定向补缺（`collection_state`）。
  三类奖励只发 tcr（`topup.type` 17/18/19，均归活动类目），里程碑 / 集齐奖励用 `activity_milestone`
  唯一索引保证只发一次；兑换与礼包沿用整张券口径，礼包档位六个活动共用。后台新增三张数字表单卡片
  （不写 JSON），迁移 028。

- v0.41.0 界面余额只按单位展示：取消「临时货币 / 永久货币」措辞，新增 `components/currency/money.tsx`
  （`Money` / `UnitLegend`，金币 cr、沙漏 tcr），钱包 / 顶栏 / 看板 / 邀请 / 兑换码 / 后台用户与设置统一单位加图标。
  发放、到账与流水提示（签到、返利、里程碑、充值赠送、雷电、翻牌、站内信附件、cron 过期作废）统一为 tcr；
  混合扣费与汇总仍用「cr 等值」；转盘记录按 label 尾部单位推导 `balanceUnit` 逐笔展示。
- v0.40.0 翻牌夺宝支持券奖：`flipRewardTickets` 判定奖项面值是否为券单价整数倍，是则翻中发整张
  翻牌活动券（`grantCouponToRound`，不进 tcr、不写 `topup`），否则维持 tcr；`flip_round.rewardTickets`
  记录实发张数（迁移 027），牌桌 / 开牌 / 牌局列表 / 战绩（`wonTickets`）统一按券图标 × 张数展示。
  任务成就把每日「消费满 50 cr」改为「消费满 50 tcr」（口径仍是当日 `usage_log.creditsUsed`），
  里程碑随机奖励只发 tcr，删除永久货币分支。
- v0.39.1 后台「活动记录」改名「转盘记录」（导航 / `/admin/lottery` 标题 / 用户侧「我的转盘记录」卡片）；
  收益概览在「站点净收益」后补回「已开奖消耗」指标（`balance.ticketFace`，grid 改 7 列），与「礼包让利」
  并列区分：消耗是开奖抵扣的活动券面值、计入净收益，礼包让利是购券优惠、不进净收益。用户侧记录只显示最新
  30 条（`MY_RECORDS_LIMIT`，10/页 ≤3 页，首屏与 `listMyActivityRecords` 都封顶并夹取页码），战绩汇总与管理端不受限。
- v0.39.0 转盘彻底移除抽奖券：`lib/lottery/store.ts` 删除 `lockTickets` / `grantTickets` /
  `expireTicketsForActivity` 等一整套抽奖券原语，付费一律 `payWithCoupon` 整张扣当期活动券。
  修复活动券全额支付时 `lockTickets([], drawIds)` 生成空 `CASE` + `id IN ()` 导致 10 连抽报错。
  外圈活动券档与累抽档位改发当期活动券：配置 `tickets` 保留「抽奖等价」语义，实发按
  `couponTicketsForReward` / `couponCreditsForReward` 折算；新增 `lottery_milestone_grant`
  领取记录表与 `lottery_draw.ticketCredits` 列（迁移 026）。后台转盘记录用「礼包让利」替换
  「售券收入」：`coupon_pack_purchase` 的 `SUM(到账券面 − 实付)` 同时记为站点亏损与用户获利。
  消费返利、站内信、任务文案里的「抽奖券」全部改为「转盘活动券」。
- v0.38.0 活动券全面整数张：新增 `lib/activity/ticket-math.ts`（`couponTickets` 向下取整 /
  `ticketsForCost` 向上取整至少 1 张 / `creditsForTickets` / `snapCostToUnit`），
  三个玩法的价格在 `sanitize*Config` 里吸到券价整数倍，`payWithCoupon` 改为按整张扣
  （`CouponPayment` 增加 `tickets`）。礼包模型改为「整数张数 + 倍率」：配置存 `tickets`，
  `packGrant` 返回 `ratioTickets / bonusTickets / totalTickets / totalCredits`，
  实付 = `ratioTickets × 券单价 × 100 ÷ 倍率`；旧配置只有 `priceCredits` 时按实付价折整张读取。
  转盘页删除 `buyTickets` / `MAX_TICKETS_PER_PURCHASE` 与购买面板，抽 1 次 / 10 次按
  「免费抽 / 按整张扣当期活动券」结算并直接显示券图标 × 张数；付费抽无 `ticketId`
  （`freeDrawDate` 也为 null），券面按单抽价计入统计。消费返利与站内信券奖励按整张发放；
  全站券数量统一走 `components/activity/coupon-badge.tsx` 的 `CouponIcon` / `CouponCount`，
  不再显示 cr 券面。修复站内信 `coupon` 附件在收件箱缺少渲染分支。

- v0.37.0 珍宝礼包到账改按张数：`lib/activity/pack-grant.ts` 的 `packGrant` 只把倍率作用于实付金额，
  按该活动 `couponUnitCredits` 折成张数（保留两位小数），再叠加 `bonusTickets`；返回
  `ratioTickets / totalTickets / totalCredits`。礼包卡片、后台预览、购买提示与 `topup type=15`
  流水说明都不再展示到账券面 cr，实付仍按 cr。后台预览按转盘 / 翻牌 / 雷电各自的券单价分别折算。
  券内部仍以 cr 券面记账（合计张数 × 单价），`payWithCoupon` 的 1:1 抵扣不变。

- v0.36.1 顶栏货币条的活动券改显示张数（`credits / unitCredits` 折算），窄屏下拉与 tooltip 同步，
  券面 cr 不再出现在顶栏；cr / tcr 余额仍按完整金额 + 单位显示。

- v0.36.0 珍宝礼包自定义档位：`lib/activity/pack-config.ts` 的配置结构升级为 `{ packs: [...] }`
  （1–6 档，每档 `key / name / priceCredits / ratioPercent / dailyLimit / totalLimit / bonusTickets /
  tempCredits / tempValidDays`），旧的 `{small,medium,large}` 读取时按默认补齐。`buyCouponPack`
  按档赠 `bonusTickets` 张券（× 活动单价折券面）与 `tempCredits` tcr（写带 `expiresAt` 的
  `temporary_balance` + `topup type=16 礼包赠送`，账本归「赠送与返利」），任一步失败整体回滚。
  后台表单可增删档位并实时预览；用户侧卡片突出实付金额 + 活动券图标 ×N 角标，档位名只留 tooltip；
  顶栏货币条改完整金额 + 单位（去掉 k/m 缩写），窄屏压字号保持单行。

- v0.35.0 珍宝礼包赠券：`packGrant` 把「倍率券面 + 1 张当期活动券 × 该活动单价」合并成到账合计，
  `buyCouponPack` 按合计入账并把总额写进 `coupon_pack_purchase.couponCredits`；礼包视图新增
  `baseCredits` / `bonusTickets`（v0.37.0 起改为 `ratioTickets` / `totalTickets`），卡片显示「得 X cr +1 张券」。修复礼包设置无法保存：倍率输入框
  原来 `min=0.01` + `step=1`，浏览器把 200/500/1000 判为非法步进并阻止提交，改为 `step="any"`；
  基础设置两个价格倍率输入框（`min=0.01` + `step=0.1`）同病同修。

- v0.34.0 珍宝礼包配置化：`lib/activity/pack-config.ts` 读写 `option.coupon_pack_config`，
  三档分别存 `ratioPercent`（%）、`dailyLimit`、`totalLimit`（0 = 不限）；`buildCouponPacks`
  把配置展开成礼包视图，购买券面按配置实时计算，后台「珍宝礼包（活动券通用）」卡片用
  `pack-form.tsx` 三行数字表单编辑并实时预览到账 cr。名称与实付价保持固定，避免改价影响历史记录；
  三个活动共用同一份限购额度，仍依赖迁移 025 的 `coupon_pack_purchase`。

- v0.33.0 货币单位：永久货币 `cr`、临时货币 `tcr`，`lib/billing/units.ts` 提供
  `formatAmount / formatPermanent / formatTemporary / formatCombined`，`formatCredits` 委托 `formatAmount`
  保持旧小数规则；界面文案全部按单位标注。限时活动只认活动券（`payWithCoupon` 只扣券面，
  `CouponPayment` 收敛为 `couponId + couponPart`），三玩法删除货币直付分支；每个活动新增
  `couponUnitCredits`（1 张 = X cr，默认 1），兑换按整张 × 单价，券面仍按 cr 1:1 抵扣。
  珍宝礼包限购：中份每日 2 / 累计 20、大份每日 1 / 累计 10，按「用户 + 礼包」跨活动统计，
  新表 `coupon_pack_purchase`（迁移 025）用单条 `INSERT ... SELECT ... WHERE` 复查计数防并发超卖。

- v0.32.1 钱包结算的日表与过期作废合计合并为一次 D1 扫描（`listLedgerOverview`，日表按「北京日 + 类别」
  分组后折回一天一行，删除 `sumExpiredExpense`）；活动页用量冲榜的全站窗口聚合加 2 分钟 `unstable_cache`；
  迁移 024 给 `topup` 补 `(userId, type, createdAt)` 复合索引，任务 / 看板按 type 取数不再全量过滤。

- v0.32.0 顶栏新增货币条（铃铛左侧永久 / 临时余额与三种活动券，永久「+」跳转充值弹窗）；
  活动券按「活动 + 轮次」计价，余额 1:1 兑换、珍宝礼包 200%/500%/1000%，三个玩法支付时先扣券再扣余额；
  消费返利改与充值活动共用时间段、按累计消费 500/2000/5000/10000/20000 逐档随机发货币 / 券 / 转盘活动券；
  任务成就改为每日 6 项 100 活跃度、每周 6 项 300，手动领取任务后每 25 / 50 活跃度自动发站内信随机货币。
  新表 `activity_coupon` / `activity_task_claim`（迁移 023，另给 `reward_claim` 补 `rewardKind` / `rewardLabel`）；
  钱包最近收支改近 5 天不限条数，并按账本同一细分口径展开。

- v0.31.0 限时充值活动与限时消费返利合并为「限时返利」单页 `/cashback`。充值改按活动期内累计实付
  判定，达到的每个档位可分别手动发放一次（不再随订单自动赠送，`settleRechargeOrder` 已移除自动赠送）；
  消费返利也改为手动发放。两者都先发带 `temp_credits` 附件的站内信，用户领取后才写临时余额与
  `topup type=8/10`。新表 `reward_claim`（迁移 022）以 `uq_reward_claim(userId, activityKind, tierKey)`
  挡重复发放，领取时回写 `claimedAt`；后台充值活动新增开始 / 结束日期，钱包充值弹窗改为累计档位提示。

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

