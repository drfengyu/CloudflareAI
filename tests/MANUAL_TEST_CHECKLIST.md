# 计费和 Token 显示功能 - 手动测试清单

## 测试环境
- URL: http://localhost:3000
- 测试账户: (邮箱) / test123456

## 前置条件
1. ✅ 开发服务器已启动 (`npm run dev`)
2. ✅ 数据库已迁移
3. ✅ 代码已推送到 main 分支
4. ⏳ 等待 Vercel 部署完成

---

## 测试用例

### 1. Dashboard - Token 统计显示
**路径**: `/dashboard`

**验证点**:
- [ ] "今日调用" 卡片显示：`输入 X / 输出 Y`
- [ ] "本月调用" 卡片显示：`X cr · 输入 Y / 输出 Z`
- [ ] 最近 10 次调用列表显示 token 列（格式：`1,234 / 567`）
- [ ] 余额显示格式：`X cr` + `≈ $Y`

**预期结果**:
- Token 数量带千位分隔符
- 无 token 数据时显示 `—`
- USD 换算：1 cr = $1

---

### 2. 历史记录 - Token 显示
**路径**: `/history`

**验证点**:
- [ ] 每条记录显示 token 列
- [ ] 格式：`输入 / 输出`（如 `500 / 100`）
- [ ] 无 token 时显示 `—`
- [ ] Credits 显示：`X cr`
- [ ] 延迟显示：`X.XXs`
- [ ] 时间显示完整

**预期结果**:
- 所有列垂直对齐
- Token 列宽度固定 100px
- Credits 列宽度固定 80px

---

### 3. 文本模型计费测试
**路径**: `/playground/text`

**步骤**:
1. 选择模型：`@cf/meta/llama-3.1-8b-instruct`
2. 输入短消息："Hello, count to 5"
3. 点击发送，等待响应
4. 查看 `/history` 页面

**验证点**:
- [ ] 调用状态：`ok`
- [ ] 显示 token 数量（如 `50 / 20`）
- [ ] Credits 消耗合理（假设 base=1000）：
  - 预期：约 0.01-0.1 cr
  - 计算：(50+20) / 1,000,000 × $200 × 1000 ≈ 0.014 cr
- [ ] 控制台日志显示：`base×1000`

**检查数据库**:
```sql
SELECT 
  model, 
  inputTokens, 
  outputTokens, 
  creditsUsed,
  status
FROM usage_log 
ORDER BY createdAt DESC 
LIMIT 1;
```

**预期**:
- `inputTokens`: 40-60
- `outputTokens`: 15-25
- `creditsUsed`: 0.01-0.1 (取决于 base)
- `status`: 'ok'

---

### 4. 图像模型计费测试
**路径**: `/playground/image`

**步骤**:
1. 选择模型：`@cf/black-forest-labs/flux-1-schnell`
2. 输入 prompt："A beautiful sunset"
3. 点击生成，等待图片
4. 查看 `/history` 页面

**验证点**:
- [ ] 调用状态：`ok`
- [ ] Token 显示：`—`（图像模型无 token）
- [ ] Credits 消耗：**固定 3000 cr**（不受 base 影响）
- [ ] 控制台日志显示：`fixed, no base multiplier`

**检查数据库**:
```sql
SELECT 
  model, 
  task,
  creditsUsed,
  status
FROM usage_log 
WHERE task = 'Text-to-Image'
ORDER BY createdAt DESC 
LIMIT 1;
```

**预期**:
- `task`: 'Text-to-Image'
- `creditsUsed`: 3000
- `inputTokens`: NULL
- `outputTokens`: NULL

---

### 5. 基础倍率验证
**路径**: 数据库查询

**检查基础倍率设置**:
```sql
SELECT key, value 
FROM options 
WHERE key = 'pricing_base_multiplier';
```

**可能的值**:
- 如果是 `1000`：文本调用应该在 0.01-1 cr
- 如果是 `1`：文本调用应该在 0.00001-0.001 cr
- 如果不存在：使用默认 `1000`

**插入默认倍率**（如果不存在）:
```sql
INSERT INTO options (key, value) 
VALUES ('pricing_base_multiplier', '1000')
ON CONFLICT (key) DO NOTHING;
```

---

### 6. 管理后台验证
**路径**: `/admin/users`（需要管理员权限）

**验证点**:
- [ ] 用户列表显示余额：`X cr`
- [ ] USD 转换显示：`≈ $Y`（1:1 换算）
- [ ] 点击管理按钮打开对话框
- [ ] 对话框显示当前余额和 USD

**示例**:
- 余额：2,000 cr
- 显示：≈ $2,000.00

---

### 7. 定价页面验证
**路径**: `/pricing`

**验证点**:
- [ ] 按分类显示所有模型
- [ ] 每个模型显示价格（$/1M tokens）
- [ ] 图像模型显示固定价格（cr/张）
- [ ] 价格说明清晰

---

## 问题排查

### 如果文本消耗过低（如 0.00005 cr）
**原因**: 基础倍率未设置或为 1
**解决**: 
```sql
UPDATE options 
SET value = '1000' 
WHERE key = 'pricing_base_multiplier';
```

### 如果图像消耗不是固定值
**原因**: 代码错误应用了基础倍率
**解决**: 检查最新代码是否已部署

### 如果 token 不显示
**原因**: 历史记录是旧数据（修复前）
**解决**: 发起新调用，检查新记录

---

## 自动化测试

**运行所有测试**:
```bash
# UI 验证测试
npx playwright test tests/e2e/ui-verification.spec.ts

# 完整计费测试（需要登录）
npx playwright test tests/e2e/billing-verification.spec.ts

# 生成报告
npx playwright show-report
```

---

## 成功标准

✅ **Dashboard**:
- 显示 token 统计（今日/本月）
- 最近调用列表显示 token

✅ **历史记录**:
- 每条记录显示 token（X / Y）
- 布局对齐正确

✅ **文本模型**:
- 应用基础倍率
- 消耗合理（0.01-1 cr for 短消息）

✅ **图像模型**:
- 固定价格（3000-4000 cr）
- 不受基础倍率影响

✅ **管理后台**:
- 余额显示正确（1:1 换算）

---

## 测试数据参考

### 文本模型（base=1000）
| Token 数 | 模型价格 | 预期消耗 |
|---------|---------|---------|
| 100 in / 50 out | $200/$400 per 1M | 0.04 cr |
| 500 in / 200 out | $200/$400 per 1M | 0.18 cr |
| 1000 in / 500 out | $200/$400 per 1M | 0.40 cr |

### 图像模型
| 模型 | 固定价格 |
|-----|---------|
| flux-1-schnell | 3000 cr |
| flux-2-dev | 4000 cr |
| stable-diffusion-xl | 3500 cr |

---

**测试完成后，请在此记录结果** ✓
