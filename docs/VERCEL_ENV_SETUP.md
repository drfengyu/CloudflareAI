# Vercel 环境变量配置指南

## 由于网络问题无法使用 Vercel CLI

Vercel CLI 当前遇到网络连接问题（无法连接到 sentry.io），请通过 **Vercel Dashboard** 手动添加环境变量。

---

## 方法 1: 通过 Vercel Dashboard（推荐）

### 步骤：

1. **登录 Vercel Dashboard**
   - 访问：https://vercel.com/dashboard
   - 找到项目：`CloudflareAI` 或你的项目名称

2. **进入项目设置**
   - 点击项目名称
   - 点击顶部导航的 `Settings`
   - 左侧菜单选择 `Environment Variables`

3. **添加环境变量**
   
   **变量名**：
   ```
   API_KEY_ENCRYPTION_SECRET
   ```
   
   **变量值**（为生产环境生成新密钥）：
   ```
   SbOw4FM5l4z2uVc2x4/tJd/khX9QD1KBHAqbCgMiK3o=
   ```
   
   **环境**（Environments）：
   - ✅ Production
   - ✅ Preview
   - ✅ Development（可选）

4. **保存**
   - 点击 `Save` 按钮

5. **重新部署**
   - 返回项目 `Deployments` 页面
   - 点击最新部署右侧的 `•••` 菜单
   - 选择 `Redeploy`（选择 "Use existing build cache" 更快）

---

## 方法 2: 通过 Vercel CLI（网络正常时）

### 添加单个环境变量：

```bash
# Production 环境
vercel env add API_KEY_ENCRYPTION_SECRET production

# 输入值：
SbOw4FM5l4z2uVc2x4/tJd/khX9QD1KBHAqbCgMiK3o=

# Preview 环境
vercel env add API_KEY_ENCRYPTION_SECRET preview

# Development 环境（可选）
vercel env add API_KEY_ENCRYPTION_SECRET development
```

### 从 .env 文件批量导入：

```bash
# 创建 .env.production 文件
echo "API_KEY_ENCRYPTION_SECRET=SbOw4FM5l4z2uVc2x4/tJd/khX9QD1KBHAqbCgMiK3o=" > .env.production

# 导入到 Vercel
vercel env pull .env.production
```

---

## 验证环境变量已配置

### 方法 1: 通过 Dashboard
1. 进入 `Settings` > `Environment Variables`
2. 确认 `API_KEY_ENCRYPTION_SECRET` 已列出
3. 查看应用的环境（Production / Preview / Development）

### 方法 2: 通过 CLI
```bash
vercel env ls
```

### 方法 3: 部署后测试
1. 等待 Vercel 自动重新部署（或手动触发）
2. 访问生产环境：https://你的域名.vercel.app
3. 登录并进入 `/keys` 页面
4. 创建新的 API Key
5. 点击眼睛图标 👁️ 查看完整密钥
6. 确认能成功解密并显示

---

## 重要说明

⚠️ **生产环境密钥与开发环境不同**

- **开发环境** (.env.local)：`8lMeDvA3c47KOO5bJNPwtnHPfcFjnARoLUgetxOdHlU=`
- **生产环境** (Vercel)：`SbOw4FM5l4z2uVc2x4/tJd/khX9QD1KBHAqbCgMiK3o=`

这意味着：
- ✅ 开发环境创建的密钥在生产环境无法解密（密钥不同）
- ✅ 生产环境需要重新创建所有 API Key
- ✅ 这是安全最佳实践：不同环境使用不同的加密密钥

⚠️ **密钥泄露处理**

如果加密密钥泄露：
1. 立即生成新密钥：`openssl rand -base64 32`
2. 在 Vercel 中更新环境变量
3. 触发重新部署
4. 通知所有用户重新创建 API Key

⚠️ **备份**

- 将生产环境密钥安全存储在密码管理器中
- 不要将生产密钥提交到 Git
- 团队成员通过安全渠道共享（如 1Password / Bitwarden）

---

## 所有需要配置的环境变量

确保以下环境变量都已在 Vercel 中配置：

```bash
# Cloudflare
CF_ACCOUNT_ID=your-cloudflare-account-id
CF_API_TOKEN=your-cloudflare-api-token
CF_D1_DATABASE_ID=your-d1-database-id
CF_KV_NAMESPACE_ID=your-kv-namespace-id

# Auth.js
AUTH_SECRET=your-auth-secret
NEXTAUTH_URL=https://your-domain.vercel.app

# OAuth (可选)
AUTH_GITHUB_ID=your-github-client-id
AUTH_GITHUB_SECRET=your-github-client-secret
LINUXDO_CLIENT_ID=your-linuxdo-client-id
LINUXDO_CLIENT_SECRET=your-linuxdo-client-secret
LINUXDO_MIN_TRUST_LEVEL=1

# API Key 加密（本次新增）
API_KEY_ENCRYPTION_SECRET=SbOw4FM5l4z2uVc2x4/tJd/khX9QD1KBHAqbCgMiK3o=

# 公开 URL
NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app
```

---

## 故障排查

### 问题 1: Vercel CLI 网络错误

**错误信息**：
```
Error: getaddrinfo ENOENT sentry.io
```

**解决方案**：
1. 检查网络连接和防火墙
2. 使用 VPN 或代理
3. 使用 Vercel Dashboard（推荐）

### 问题 2: 部署后仍然解密失败

**可能原因**：
1. 环境变量未生效 - 需要重新部署
2. 变量名拼写错误 - 确认是 `API_KEY_ENCRYPTION_SECRET`
3. 变量值有空格 - 检查复制粘贴时是否有多余字符

**调试步骤**：
1. 在 Vercel Dashboard 确认变量已保存
2. 手动触发 Redeploy
3. 查看部署日志确认构建成功
4. 创建新的 API Key 测试（旧密钥无法解密）

---

## 完成检查清单

- [ ] 在 Vercel Dashboard 添加 `API_KEY_ENCRYPTION_SECRET`
- [ ] 选择 Production 和 Preview 环境
- [ ] 保存后触发重新部署
- [ ] 部署成功后访问生产站点
- [ ] 创建新的 API Key
- [ ] 测试查看功能（点击眼睛图标）
- [ ] 确认解密成功
- [ ] 将生产密钥安全备份

---

**生成时间**: 2025-06-25  
**生产环境密钥**: `SbOw4FM5l4z2uVc2x4/tJd/khX9QD1KBHAqbCgMiK3o=`  
**开发环境密钥**: `8lMeDvA3c47KOO5bJNPwtnHPfcFjnARoLUgetxOdHlU=`
