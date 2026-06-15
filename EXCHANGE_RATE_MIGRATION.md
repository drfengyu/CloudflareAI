# 汇率调整 + 临时余额系统改造完成

## 改造内容

### 1. ✅ 汇率调整：500,000:1 → 1:1

**变更前**：
- 1 credit = $0.000002 USD
- 500,000 credits = $1 USD

**变更后**：
- 1 credit = $1 USD
- 更直观的换算关系

**影响文件**：
- `lib/billing/credits.ts` - 修改 `CREDITS_PER_USD = 1`
- `lib/billing/display-price.ts` - 更新注释和计算
- `lib/db/schema.ts` - 更新 `balanceCredits` 注释

---

### 2. ✅ 临时余额系统

**新增表**：`temporary_balance`
```sql
CREATE TABLE temporary_balance (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  amount INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL,  -- 过期时间
  redemptionId TEXT,
  description TEXT,
  createdAt INTEGER NOT NULL
);
```

**扩展表**：`redemption`
- 新增字段：`balanceValidDays INTEGER` - 充值后余额的有效期（天）

**余额类型**：
- **永久余额** (`user.balanceCredits`) - 管理员充值到此，永不过期
- **临时余额** (`temporary_balance`) - 兑换码充值到此，有过期时间

---

### 3. ✅ 兑换码改造

**生成兑换码**：
- 新增字段：「充值余额有效期（天）」
- 默认值：365 天
- 可配置：兑换码本身过期时间 vs 充值余额过期时间

**兑换流程**：
1. 验证兑换码有效性
2. 计算余额过期时间 = now + balanceValidDays
3. **插入临时余额记录**
4. 记录充值流水（含过期时间）
5. 更新兑换码使用次数

**文件**：
- `app/(dashboard)/admin/redemptions/actions.ts`
- `app/(dashboard)/admin/redemptions/generate-codes-dialog.tsx`
- `app/(dashboard)/wallet/actions.ts`

---

### 4. ✅ 钱包页面改造

**余额显示**：
```
总余额: 521 credits ≈ $521 USD
  永久: 21 cr  |  临时: 500 cr
```

**新增区块**：临时余额明细
- 显示每笔临时余额的金额、描述、过期时间
- 自动过滤已过期的余额

**充值成功消息**：
- 旧：`充值成功！已获得 500,000 cr，当前余额 521,518 cr`
- 新：`充值成功！已获得 10 cr，有效期至 2027-06-15`

**文件**：
- `app/(dashboard)/wallet/page.tsx`
- `app/(dashboard)/wallet/redeem-code-dialog.tsx`

---

### 5. ✅ 定价页面简化

**移除内容**：
- ❌ 倍率说明（Hosted ×1000 / Proxied ×1）
- ❌ 倍率列

**保留内容**：
- ✅ 模型名称、来源、价格
- ✅ Credits 换算说明：`1 credit = $1 USD`

**优化说明**：
```
定价说明
• 文本模型：按 token 计费，价格单位为「每百万 token」
• 图像模型：固定价格，价格单位为「每张图片」
• Credits 换算：1 credit = $1 USD
```

**文件**：
- `app/(dashboard)/pricing/page.tsx`

---

## 数据库迁移

**SQL 文件**：`migrations/0003_add_temporary_balance.sql`

```sql
-- 1. 创建临时余额表
CREATE TABLE temporary_balance (...);

-- 2. 添加兑换码余额有效期字段
ALTER TABLE redemption ADD COLUMN balanceValidDays INTEGER;

-- 3. 更新现有用户余额（可选）
-- UPDATE user SET balanceCredits = CAST(balanceCredits / 500000.0 AS INTEGER);
```

**⚠️ 重要提示**：
- 现有用户余额需要手动调整（521,518 cr → 1 cr）
- 或者保持原有余额，新充值按新汇率

---

## 测试要点

### 1. 兑换码生成
- [ ] 默认额度改为 10 cr（不再是 500,000 cr）
- [ ] 余额有效期默认 365 天
- [ ] 两个过期时间都能正确设置

### 2. 兑换码使用
- [ ] 充值到临时余额（不再是永久余额）
- [ ] 过期时间正确计算
- [ ] Toast 显示有效期

### 3. 钱包页面
- [ ] 总余额 = 永久 + 临时
- [ ] 临时余额明细显示
- [ ] 已过期余额自动过滤
- [ ] USD 换算正确（1:1）

### 4. 定价页面
- [ ] 移除倍率相关说明
- [ ] 价格显示正确
- [ ] USD 换算正确

### 5. 用户管理
- [ ] 余额显示更新（更小的数字）
- [ ] 手动充值仍到永久余额

---

## 提交记录

```
d97c149 feat(billing): change exchange rate to 1:1 and add temporary balance system
```

**变更文件**：
- `lib/billing/credits.ts`
- `lib/billing/display-price.ts`
- `lib/db/schema.ts`
- `app/(dashboard)/wallet/actions.ts`
- `app/(dashboard)/wallet/page.tsx`
- `app/(dashboard)/wallet/redeem-code-dialog.tsx`
- `app/(dashboard)/admin/redemptions/actions.ts`
- `app/(dashboard)/admin/redemptions/generate-codes-dialog.tsx`
- `app/(dashboard)/pricing/page.tsx`
- `migrations/0003_add_temporary_balance.sql`

---

## 后续工作

### 1. 定时任务：清理过期余额
```sql
DELETE FROM temporary_balance 
WHERE expiresAt < unixepoch('now') * 1000;
```

### 2. 余额扣减逻辑
需要修改 `lib/usage/meter.ts`：
1. 优先扣减临时余额（最早过期的优先）
2. 临时余额不足时，扣减永久余额
3. 记录扣减来源

### 3. 数据迁移
如果需要保留现有用户购买力：
```sql
UPDATE user 
SET balanceCredits = CAST(balanceCredits / 500000.0 AS INTEGER)
WHERE balanceCredits > 0;
```

---

## 测试完成时间

待测试验证（需要运行迁移 + 重新生成兑换码）
