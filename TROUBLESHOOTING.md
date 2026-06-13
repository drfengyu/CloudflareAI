## 🔍 Vercel 部署问题排查指南

### 第 1 步：查看部署状态

1. 访问：https://vercel.com/seacats-projects/cloudflare-ai/deployments
2. 找到最新的部署（Commit: a85ca24）
3. 检查状态：
   - ✅ **Ready** = 部署成功但运行时出错
   - ❌ **Error** = 构建失败
   - ⏳ **Building** = 还在构建中

### 第 2 步：查看错误日志

**如果状态是 Error（构建失败）：**
- 点击该部署 → 查看 **"Building"** 标签
- 复制错误信息（通常在日志最后）

**如果状态是 Ready 但页面无法加载：**
- 点击该部署 → 查看 **"Runtime Logs"** 标签
- 查找 500 或其他错误
- 或访问：https://vercel.com/seacats-projects/cloudflare-ai/logs

### 第 3 步：检查环境变量

访问：https://vercel.com/seacats-projects/cloudflare-ai/settings/environment-variables

**必须确认这 7 个变量都存在：**

```
CF_ACCOUNT_ID = your_cloudflare_account_id
CF_API_TOKEN = your_cloudflare_api_token
CF_D1_DATABASE_ID = your_d1_database_id
CF_KV_NAMESPACE_ID = your_kv_namespace_id
AUTH_SECRET = your_auth_secret_32_bytes
GITHUB_CLIENT_ID = your_github_oauth_client_id
GITHUB_CLIENT_SECRET = your_github_oauth_client_secret
```

**检查要点：**
- [ ] 7 个变量都存在
- [ ] 变量名拼写正确（不是 AUTH_GITHUB_ID，而是 GITHUB_CLIENT_ID）
- [ ] 值没有多余的空格、引号或换行
- [ ] 环境都选中了（Production, Preview, Development）

### 第 4 步：常见错误及解决方案

| 错误现象 | 可能原因 | 解决方案 |
|---------|---------|---------|
| 页面完全空白 | AUTH_SECRET 未设置 | 添加 AUTH_SECRET 环境变量 |
| 500 Internal Error | 环境变量缺失或错误 | 检查所有 7 个变量 |
| "Cannot connect to database" | CF_D1_DATABASE_ID 错误 | 确认 D1 数据库 ID |
| "Invalid API token" | CF_API_TOKEN 权限不足 | 重新生成 Token（需要 D1/KV/AI 权限）|
| GitHub 登录失败 | OAuth 配置错误 | 更新 callback URL |

### 第 5 步：快速修复（如果找不到具体错误）

**方案 A：重新部署**
1. 进入 Deployments 页面
2. 点击最新部署的三个点 → **"Redeploy"**
3. 选择 **"Use existing Build Cache"**
4. 等待 2-3 分钟

**方案 B：清除缓存重新部署**
1. Settings → General → 滚动到底部
2. 点击 **"Clear Build Cache"**
3. 回到 Deployments → **"Redeploy"**

### 第 6 步：实在不行，手动检查环境变量

在 Vercel 项目设置中，逐个删除并重新添加环境变量：

1. Settings → Environment Variables
2. 删除所有现有变量
3. 逐个重新添加（参考上面的清单）
4. 每添加一个都确认：
   - 变量名正确
   - 值正确（无空格/引号）
   - 环境全选
5. 添加完所有 7 个后，Redeploy

---

## ⚡ 我需要你提供的信息

请告诉我：

1. **部署状态**：Error 还是 Ready？
2. **错误信息**：从 Building 或 Runtime Logs 中复制的完整错误
3. **环境变量数量**：Settings → Environment Variables 显示有几个变量？

有了这些信息，我可以精准定位问题！
