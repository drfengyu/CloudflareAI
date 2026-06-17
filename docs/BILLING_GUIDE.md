# 计费规则说明文档

> 最后更新：2026-06-17  
> 对应代码版本：v0.2.2

## 📋 目录

- [积分单位](#积分单位)
- [定价策略](#定价策略)
- [倍率调整](#倍率调整)
- [计费流程](#计费流程)
- [余额扣减](#余额扣减)
- [失败处理](#失败处理)
- [流式计量](#流式计量)

---

## 积分单位

```
1 credit = $1 USD (1:1 汇率)
CREDITS_PER_USD = 1
```

**示例**：
- 用户余额 10 cr = $10.00 USD
- 消耗 0.05 cr = $0.05 USD
- 充值 5 cr = $5.00 USD

**支持小数**：系统全面支持小数 credits，精度至 0.0001 cr。

**相关代码**：
- `lib/billing/credits.ts` - 汇率定义
- `lib/db/schema.ts` - 数据库字段（REAL 类型）

---

## 定价策略

### 核心逻辑

按模型分类线性映射到 **OpenAI 主流价格区间**（2026-06-16 重构）。

### 文本模型（按参数量分档）

| 档位 | 参数量 | 输入价（$/M tokens） | 输出价（$/M tokens） | 示例模型 |
|------|--------|---------------------|---------------------|----------|
| **Small** | ≤7B | 100-400 | 200-800 | Llama 3.2 1B/3B |
| **Medium** | 8-30B | 300-1200 | 600-2500 | Llama 3.1 8B, Gemma 27B |
| **Large** | ≥30B | 800-3500 | 1500-5000 | DeepSeek R1, Qwen QwQ |

**识别规则**（`lib/billing/model-pricing.ts:50-66`）：
```typescript
// Large: ≥30B 参数 / 已知重型模型
/-32b|-70b|-120b|kimi-k2|deepseek-r1|nemotron|llama-4-scout|qwq/i

// Medium: 8-30B 参数 / 已知中型模型
/granite|gemma-4-26b|glm-4\.7|llama-3\.1-8b|llama-3\.2-11b|qwen3-30b/i

// Small: 默认（≤7B）
```

### 其他模型类型

| 类型 | 输入价区间（$/M tokens） | 输出价区间（$/M tokens） | 用途 |
|------|------------------------|------------------------|------|
| **Embeddings** | 50-200 | 50-200 | 向量嵌入 |
| **Vision** | 300-800 | 600-1500 | 视觉理解 |
| **Translate** | 200-500 | 200-500 | 翻译 |
| **Classify** | 100-300 | 100-300 | 分类 |
| **Speech** | 200-800 | 200-800 | 语音 |

### 图像模型（固定价格）

```typescript
// 单位：credits/张（1cr=$1）
FLUX-2 Dev:              4.00 cr/张
FLUX-2 Klein (4B/9B):    3.50 cr/张
FLUX-1 Schnell:          3.00 cr/张
SD XL Lightning:         3.333 cr/张
其他图像模型:            3.50 cr/张（默认）
```

**特点**：
- 图像模型价格**不受基础倍率影响**
- 按生成图片数量计费（不按 token）
- 固定价格由 `IMAGE_MODEL_PRICING` 常量定义

---

## 倍率调整

### 两级倍率系统

#### 1. 基础倍率（Base Multiplier）

全局倍率，**仅对文本/嵌入模型生效**，图像模型不受影响。

```typescript
// 默认值：1000（图像除外）
pricing_base_multiplier = 1000

// 最终价格计算
finalPrice = basePrice × baseMultiplier
```

**配置位置**：`/admin/settings` > 定价倍率配置

**应用范围**：
- ✅ 文本模型（Small/Medium/Large）
- ✅ Embeddings
- ✅ Vision
- ✅ Translate
- ✅ Classify
- ✅ Speech
- ❌ 图像模型（固定价格）

#### 2. 模型倍率（Model Multiplier）

单个模型的倍率，优先级**高于**基础倍率。

```typescript
// 默认值：1.0
multiplier = 1.0

// 最终价格计算
finalPrice = basePrice × baseMultiplier × multiplier
```

**配置位置**：`/admin/pricing` > 内联编辑

**倍率范围**：0.01 - 100

**使用场景**：
- 调整热门模型价格（如 GPT-4o 类比价格）
- 测试新模型定价
- 促销活动（临时降价）
- 成本控制（高成本模型提价）

### 倍率计算示例

```typescript
// 示例：Llama 3.1 8B（Medium 档）
baseInputPrice = 600 ($/M tokens, 来自 CATEGORY_RANGES)
baseMultiplier = 1000  // 全局配置
modelMultiplier = 0.8  // 单个模型配置

// 最终输入价
finalInputPrice = 600 × 1000 × 0.8 = 480,000 cr/M tokens

// 用户调用 1000 tokens
inputTokens = 1000
creditsUsed = (1000 / 1,000,000) × 480,000 = 0.48 cr = $0.48
```

---

## 计费流程

### 完整流程图

```
┌─────────────────┐
│ 1. 请求前置检查 │
└────────┬────────┘
         │ verifyBalance()
         ├─ 检查用户余额（永久 + 临时）
         ├─ 检查 API Key 额度（如有限制）
         ├─ 检查 API Key 状态（启用/禁用/过期）
         └─ 检查有效期
         ↓
┌─────────────────┐
│ 2. 执行 AI 推理 │ → Cloudflare Workers AI
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ 3. 获取真实用量 │
└────────┬────────┘
         │ 流式：解析 SSE 末尾 usage chunk
         │ 非流式：response.usage
         ↓
┌─────────────────┐
│ 4. 计算费用     │
└────────┬────────┘
         │ calculateCredits()
         ├─ 查询 model_pricing 表
         ├─ 应用基础倍率（文本模型）
         ├─ 应用模型倍率
         └─ 返回 creditsUsed
         ↓
┌─────────────────┐
│ 5. 双重扣费     │
└────────┬────────┘
         │ deductCredits()
         ├─ 扣用户余额（临时 → 永久）
         └─ 扣 API Key 额度（如有限制）
         ↓
┌─────────────────┐
│ 6. 记录日志     │
└────────┬────────┘
         │ logUsage()
         ├─ 写入 usage_log 表
         ├─ 记录 creditsUsed
         └─ 更新 API Key lastUsedAt
         ↓
┌─────────────────┐
│ 7. 状态更新     │
└────────┬────────┘
         │ 自动更新 API Key 状态
         ├─ 余额不足 → status=4
         ├─ 已过期 → status=3
         └─ 禁用 → status=2
```

### 关键函数

| 函数 | 文件 | 职责 |
|------|------|------|
| `verifyBalance()` | `lib/usage/meter.ts:188` | 前置校验 |
| `calculateCredits()` | `lib/billing/pricing.ts:12` | 费用计算 |
| `deductCredits()` | `lib/usage/meter.ts:101` | 余额扣减 |
| `logUsage()` | `lib/usage/meter.ts:15` | 用量记录 |

---

## 余额扣减

### 扣减策略（优先级顺序）

```typescript
// 1. 优先扣减临时余额（按过期时间升序）
temporaryBalances
  .where(expiresAt > now)
  .orderBy(expiresAt ASC)

// 2. 临时余额不够，扣减永久余额
user.balanceCredits -= remaining
```

### 临时余额特性

- **来源**：活动奖励、限时充值、签到奖励
- **过期时间**：`temporary_balances.expiresAt`
- **自动清理**：过期自动删除（查询时过滤）
- **优先消耗**：确保用户先用完临时额度

### 示例场景

```typescript
// 用户余额状态
permanent: 10 cr
temporary: [
  { amount: 5 cr, expiresAt: 2026-06-20 },  // 7天后过期
  { amount: 3 cr, expiresAt: 2026-06-18 },  // 3天后过期
]
total: 18 cr

// 消耗 6 cr
1. 先扣 3 cr（3天后过期的临时余额）
2. 再扣 3 cr（7天后过期的临时余额，剩余2cr）
3. 永久余额不变（10 cr）

// 最终状态
permanent: 10 cr
temporary: [
  { amount: 2 cr, expiresAt: 2026-06-20 }
]
total: 12 cr
```

---

## 失败处理

### 失败不计费原则

```typescript
// status === "error" → creditsUsed = 0
if (input.status === "error") {
  creditsUsed = 0;  // 失败的调用不计费
}
```

### 失败原因追踪

```typescript
// 所有失败调用记录 errorReason
await logUsage({
  status: "error",
  errorReason: "Insufficient balance",  // 记录具体原因
  creditsUsed: 0,
});
```

### 常见失败原因

| 错误码 | 原因 | 是否扣费 | 日志记录 |
|--------|------|---------|---------|
| 402 | 余额不足 | ❌ | ✅ errorReason |
| 403 | API Key 禁用/过期 | ❌ | ✅ errorReason |
| 429 | 速率限制 | ❌ | ✅ errorReason |
| 500 | 上游服务错误 | ❌ | ✅ errorReason |
| 504 | 超时 | ❌ | ✅ errorReason |

---

## 流式计量

### 流式调用特殊处理

**问题**：流式响应无法在请求完成前获取真实 token 数。

**解决方案**：
1. **TransformStream 拦截**：`lib/usage/stream-intercept.ts`
2. **解析 SSE 末尾 usage chunk**：Cloudflare 默认发送
3. **累积 delta.content**：供 Playground 保存对话
4. **Next.js 15 `after()` API**：确保 serverless 响应后继续执行

### 实现代码

```typescript
// lib/usage/stream-intercept.ts
export function interceptUsageStream(
  stream: ReadableStream,
  onUsage: (usage: { input_tokens: number; output_tokens: number }) => void
): ReadableStream {
  return stream.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        // 解析 SSE 流
        const text = new TextDecoder().decode(chunk);
        if (text.includes('"usage":{')) {
          // 提取 usage 数据
          const match = text.match(/"usage":\s*({[^}]+})/);
          if (match) {
            const usage = JSON.parse(match[1]);
            onUsage(usage);
          }
        }
        controller.enqueue(chunk);
      }
    })
  );
}

// 使用 after() 确保计费完成
after(async () => {
  await logUsage({
    inputTokens: realInputTokens,
    outputTokens: realOutputTokens,
    status: "ok"
  });
});
```

### 验证结果

**修复前**：
```
outputTokens: 2048 (估算值，Vercel 响应完立即结束)
creditsUsed: 2.048 cr (虚高)
```

**修复后**：
```
outputTokens: 16 (真实值，从 usage chunk 解析)
creditsUsed: 0.016 cr (准确)
```

---

## API Key 状态管理

### 状态枚举

```typescript
status = 1  // 启用
status = 2  // 禁用（管理员手动）
status = 3  // 过期（expiresAt < now）
status = 4  // 额度耗尽（remainCredits <= 0）
```

### 自动状态转换

```typescript
// 请求前检查
if (expiresAt && expiresAt < now) {
  await db.update(apiKeys)
    .set({ status: 3 })  // 自动标记为过期
    .where(eq(apiKeys.id, apiKeyId));
}

// 请求后检查
if (remainCredits !== null && remainCredits <= 0) {
  await db.update(apiKeys)
    .set({ status: 4 })  // 自动标记为耗尽
    .where(eq(apiKeys.id, apiKeyId));
}
```

### 状态优先级

```
禁用（2） > 过期（3） > 额度耗尽（4） > 启用（1）
```

**校验逻辑**：
1. ❌ 禁用 → 立即拒绝
2. ❌ 过期 → 立即拒绝 + 自动标记
3. ❌ 额度耗尽 → 立即拒绝 + 自动标记
4. ✅ 启用 → 继续执行

---

## 相关文档

- [API 路由规范](API_ROUTES.md)
- [签到功能设计](features/checkin.md)
- [测试报告](../tests/MANUAL_TEST_CHECKLIST.md)
- [变更日志](../CHANGELOG.md)

---

## 数据库表结构

### model_pricing（模型定价表）

```sql
CREATE TABLE model_pricing (
  modelId TEXT PRIMARY KEY,
  category TEXT NOT NULL,        -- text/image/embeddings/...
  source TEXT NOT NULL,          -- hosted/proxied
  inputPrice REAL,               -- $/M tokens (NULL for image)
  outputPrice REAL,              -- $/M tokens (NULL for image)
  unit TEXT,                     -- "per M input tokens" / "image"
  isImage INTEGER DEFAULT 0,     -- 1=图像模型
  fixedPrice REAL,               -- 图像模型固定价（cr/张）
  multiplier REAL DEFAULT 1.0,   -- 模型倍率（管理员可调）
  createdAt INTEGER,
  updatedAt INTEGER
);
```

### usage_log（用量日志表）

```sql
CREATE TABLE usage_log (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  apiKeyId TEXT,
  model TEXT NOT NULL,
  task TEXT,                     -- text-generation/Text-to-Image
  source TEXT,                   -- hosted/proxied
  channel TEXT NOT NULL,         -- web/openai/anthropic
  inputTokens INTEGER DEFAULT 0,
  outputTokens INTEGER DEFAULT 0,
  neurons INTEGER DEFAULT 0,
  creditsUsed REAL DEFAULT 0,    -- 本次消耗的 credits
  costUsd REAL DEFAULT 0,        -- legacy（已废弃）
  status TEXT DEFAULT 'ok',      -- ok/error
  errorReason TEXT,              -- 失败原因
  latencyMs INTEGER,
  createdAt INTEGER NOT NULL
);
```

### temporary_balances（临时余额表）

```sql
CREATE TABLE temporary_balances (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  amount REAL NOT NULL,          -- credits 金额
  expiresAt INTEGER NOT NULL,    -- 过期时间戳（ms）
  source TEXT,                   -- 来源说明
  createdAt INTEGER NOT NULL
);
```

---

**文档维护者**：AI Assistant  
**最后审核**：2026-06-17
