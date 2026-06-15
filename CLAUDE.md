@AGENTS.md

# 改造路线图：参考 new-api 重构本项目

> 本节为正在进行的多阶段改造计划（参考 QuantumNous/new-api），逐阶段实现并提交。
> 完整规划文件：`C:\Users\Administrator\.claude\plans\hidden-weaving-lighthouse.md`

## 背景

当前项目 `cloudflare-ai-console`（Next.js 16 App Router + React 19 + Tailwind v4 + Cloudflare D1/Drizzle + Auth.js v5）已具备模型库、Playground、用量记录、API 密钥、设置等页面，但相对 new-api 有明显差距，且核心计量是坏的：计量未实现（`logUsage` 恒记 0、额度只展示不强制、流式记 0 token）、令牌过于简单（仅创建/吊销）、缺少余额/钱包/兑换码/管理后台/定价页/图表看板。

目标：参考本地 `D:\Download\new-api-main`（`web/default` 重设计前端 + Go 后端业务语义），改造成视觉贴近 new-api、功能覆盖「数据看板 / 令牌增强 / 真实计量+定价 / 管理后台」的多用户 AI 网关。

## 已确认决策

1. **计费**＝内部整数「余额/积分」账本 + 兑换码 + 管理员手动充值，**不接真实支付**。
2. **部署场景**＝多用户对外（类 SaaS），需完整用户/角色/系统设置后台。
3. **UI 底座**＝shadcn/ui + Radix，图表用 recharts。

## 架构决策

- **积分单位**：整数 credits，`CREDITS_PER_USD = 500000`（1 credit = $0.000002）。两套账本：`user.balanceCredits` 与 `apiKey.remainCredits`（可无限），请求时都校验、都扣减。neuron 作为技术用量指标保留。
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

## 当前进度（2026-06-15 更新）

### ✅ Phase B — 数据内核 & 计量修复（部分完成）

**已完成**：
- ✅ 扩展 schema：`user.balanceCredits`、`user.role`、`apiKey.status`、`topup` 表、`option` 表、credits 单位常量
- ✅ `lib/billing/pricing.ts` 定价模块：hosted ×1000 / proxied ×1 倍率，图像模型固定价（FLUX-2/SDXL 等）
- ✅ `lib/usage/meter.ts` 真实计量：
  - 调用 `calculateCredits` 按真实 token/neurons 计费
  - 余额预检 `verifyBalance`（user + apiKey 双重校验）
  - 成功扣减 `user.balanceCredits`，失败时记 0 credits
  - 修复 FLUX-2 multipart 响应解析（`lib/cloudflare/ai.ts`）
- ✅ 网关接入校验（余额/状态/有效期）
- ✅ 管理员充值（D1 直接操作 + topup 流水）

**验证通过**（线上 cloudai.fuwari.fun）：
- FLUX-2 成功出图 + 精确扣 4000 cr
- error 调用不扣费、记 0 credits
- 余额不足时 402 拒绝

### ✅ Phase C — 数据看板（部分完成）

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

### ✅ 附加改进

- ✅ 模型库价格显示：`lib/billing/display-price.ts` 计算应用倍率后的实际美元价格（$30.00 / $342.00 / per M input tokens），替代原始官方价
- ✅ 所有小数统一显示 2 位（$0.01 ~ $999.99）

### 🚧 待完成

- **Phase B 剩余**：流式结束计量（当前流式按估算扣费）、网关 IP/模型白名单校验
- **Phase D**：令牌管理界面重做（DataTable + 状态/额度/模型限制/有效期）
- **Phase E**：公开定价页（`/pricing`）
- **Phase F**：管理后台（`/admin/users`、`/admin/redemptions`、`/wallet`、`/admin/settings`）

