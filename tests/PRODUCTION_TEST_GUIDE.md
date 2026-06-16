# 线上环境测试验证指南

## 测试环境
- URL: https://cloudai.fuwari.fun
- 最新部署提交: 778073c (fix: add error handling to getPricingConfig)
- 测试账户密码: test123456

---

## 测试清单

### ✅ 阶段 1：登录和基础功能

1. **访问网站**
   ```
   https://cloudai.fuwari.fun
   ```
   - [ ] 页面正常加载（不是 500 错误）
   - [ ] 重定向到登录页面

2. **登录测试账户**
   - 邮箱: (你的测试账户邮箱)
   - 密码: test123456
   - [ ] 登录成功，跳转到 Dashboard

3. **Dashboard 检查**
   - [ ] 显示当前余额卡片
   - [ ] 显示今日消耗卡片
   - [ ] "今日调用" 卡片显示 token 统计：`输入 X / 输出 Y`
   - [ ] "本月调用" 卡片显示 token 统计
   - [ ] 最近 10 次调用列表显示（如果有历史记录）

---

### ✅ 阶段 2：文本模型测试（验证基础倍率）

4. **访问文本 Playground**
   ```
   https://cloudai.fuwari.fun/playground/text
   ```

5. **发起文本请求**
   - 选择模型: `@cf/meta/llama-3.1-8b-instruct`
   - 输入消息: "Hello, count to 5"
   - 点击 "发送"
   - [ ] 请求成功（不是 500 错误）
   - [ ] 收到响应
   - [ ] 控制台无错误（F12 查看）

6. **检查历史记录**
   ```
   https://cloudai.fuwari.fun/history
   ```
   - [ ] 最新记录状态为 `ok`
   - [ ] 显示 token 列：格式 `X / Y`（如 `50 / 20`）
   - [ ] 显示 credits 消耗（如 `0.05 cr`）
   - [ ] 消耗金额合理：
     - 如果基础倍率=1000：约 0.01-0.1 cr
     - 如果基础倍率=1：约 0.00001-0.0001 cr

7. **计算验证**
   ```
   假设：
   - 输入 50 tokens, 输出 20 tokens
   - 模型价格: $200/1M (input), $400/1M (output)
   - 基础倍率: 1000
   
   预期消耗:
   = (50/1,000,000 × $200 + 20/1,000,000 × $400) × 1000
   = (0.01 + 0.008) × 1000
   = 18 cr × 1000 / 1000
   = 0.018 cr ✓
   ```

---

### ✅ 阶段 3：图像模型测试（验证固定价格）

8. **访问图像 Playground**
   ```
   https://cloudai.fuwari.fun/playground/image
   ```

9. **发起图像请求**
   - 选择模型: `@cf/black-forest-labs/flux-1-schnell`
   - 输入 prompt: "A beautiful sunset over mountains"
   - 点击 "生成"
   - [ ] 请求成功
   - [ ] 图片生成成功
   - [ ] 控制台无错误

10. **检查历史记录**
    - [ ] 最新记录状态为 `ok`
    - [ ] Task 显示: `Text-to-Image`
    - [ ] Token 显示: `—`（图像模型无 token）
    - [ ] **Credits 消耗固定: 3000 cr**（不受基础倍率影响）

---

### ✅ 阶段 4：数据库验证

11. **检查基础倍率设置**
    
    通过 D1 HTTP API 或 Wrangler CLI:
    ```sql
    SELECT key, value 
    FROM options 
    WHERE key = 'pricing_base_multiplier';
    ```
    
    **预期结果**:
    - 如果返回记录: 使用该值（如 `1000`）
    - 如果无记录: 使用默认值 `1000`

12. **查看最近的调用记录**
    ```sql
    SELECT 
      id,
      model,
      task,
      channel,
      status,
      inputTokens,
      outputTokens,
      creditsUsed,
      errorReason,
      datetime(createdAt) as time
    FROM usage_log 
    ORDER BY createdAt DESC 
    LIMIT 10;
    ```
    
    **验证点**:
    - [ ] 文本请求: `status = 'ok'`, 有 `inputTokens` 和 `outputTokens`
    - [ ] 图像请求: `status = 'ok'`, `creditsUsed = 3000`
    - [ ] 无 500 错误记录（或 errorReason 不为空）

13. **检查错误记录**
    ```sql
    SELECT 
      COUNT(*) as error_count,
      COUNT(CASE WHEN errorReason IS NULL THEN 1 END) as null_reason_count
    FROM usage_log 
    WHERE status = 'error' 
      AND datetime(createdAt) > datetime('now', '-1 hour');
    ```
    
    **预期**: 
    - 最近 1 小时内无新错误
    - 如果有错误，`errorReason` 不应为 NULL

---

### ✅ 阶段 5：Vercel 日志检查

14. **查看 Vercel 部署日志**
    
    访问 Vercel Dashboard:
    ```
    https://vercel.com/your-project/deployments
    ```
    
    **检查点**:
    - [ ] 最新部署状态: `Ready`
    - [ ] 部署时间: 最近几分钟内
    - [ ] 构建日志无错误

15. **查看 Function 日志**
    
    在 Vercel Logs 中搜索:
    ```
    [calculateCredits]
    [getPricingConfig]
    ```
    
    **正常日志示例**:
    ```
    [calculateCredits] @cf/meta/llama-3.1-8b-instruct: 0.018 cr 
    (in=50@$200, out=20@$400, base×1000)
    ```
    
    **错误日志示例**（应该不再出现）:
    ```
    [getPricingConfig] Database query failed, using defaults: Error...
    ```
    
    如果看到 "using defaults"，说明 options 表查询失败但已降级使用默认值 ✓

---

### ✅ 阶段 6：管理后台验证（需要管理员权限）

16. **访问用户管理**
    ```
    https://cloudai.fuwari.fun/admin/users
    ```
    
    如果有管理员权限:
    - [ ] 用户列表正常显示
    - [ ] 余额显示格式: `X cr` + `≈ $Y`（1:1 换算）
    - [ ] 点击管理按钮打开对话框
    - [ ] 对话框显示当前余额和 USD 转换

17. **访问定价管理**
    ```
    https://cloudai.fuwari.fun/admin/pricing
    ```
    
    - [ ] 模型列表正常显示
    - [ ] 价格显示合理（$/1M tokens）
    - [ ] 可以调整单个模型的 multiplier

---

## 问题排查

### 如果文本请求返回 500

**可能原因 1**: `getPricingConfig` 仍然失败
- **检查**: Vercel 日志中搜索 `[getPricingConfig]`
- **解决**: 确认最新代码已部署（778073c）

**可能原因 2**: `options` 表不存在
- **检查**: 
  ```sql
  SELECT name FROM sqlite_master WHERE type='table' AND name='option';
  ```
- **解决**: 运行数据库迁移
  ```bash
  npm run db:migrate
  ```

**可能原因 3**: 环境变量缺失
- **检查**: Vercel Settings > Environment Variables
- **必需变量**: `CF_ACCOUNT_ID`, `CF_API_TOKEN`, `CF_D1_DATABASE_ID`

### 如果 token 不显示

**可能原因**: 旧的历史记录（修复前）
- **解决**: 发起新请求，检查新记录

### 如果消耗金额过低

**可能原因**: 基础倍率为 1 而非 1000
- **检查**: 
  ```sql
  SELECT value FROM options WHERE key = 'pricing_base_multiplier';
  ```
- **解决**: 
  ```sql
  INSERT OR REPLACE INTO options (key, value) 
  VALUES ('pricing_base_multiplier', '1000');
  ```

### 如果图像消耗不是 3000

**可能原因**: 代码应用了基础倍率（不应该）
- **解决**: 确认最新代码已部署（701f040）

---

## 成功标准

✅ **所有功能正常**:
1. 文本请求成功，显示 token，消耗合理
2. 图像请求成功，固定价格 3000 cr
3. Dashboard 显示 token 统计
4. 历史记录显示完整
5. 无 500 错误
6. Vercel 日志正常

---

## 测试完成后

请在此记录结果:

- [ ] 阶段 1: 登录和基础功能 ✓/✗
- [ ] 阶段 2: 文本模型测试 ✓/✗  
  - 消耗金额: _____ cr
- [ ] 阶段 3: 图像模型测试 ✓/✗  
  - 消耗金额: _____ cr
- [ ] 阶段 4: 数据库验证 ✓/✗
- [ ] 阶段 5: Vercel 日志 ✓/✗
- [ ] 阶段 6: 管理后台 ✓/✗

**遇到的问题**:
(记录在此)

**截图**:
- Dashboard
- 历史记录
- Vercel 日志

---

**测试日期**: ___________
**测试人**: ___________
