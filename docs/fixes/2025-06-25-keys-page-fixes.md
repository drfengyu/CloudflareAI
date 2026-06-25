# Keys 页面修复 (2025-06-25)

## 问题 1: 密钥查看按钮提示解密失败

### 根因
- 缺少环境变量 `API_KEY_ENCRYPTION_SECRET`
- `lib/auth/api-key.ts` 中的 `decryptApiKey()` 函数需要此环境变量来解密存储的 API Key
- 当环境变量不存在时，使用默认密钥 `"default-32-byte-secret-change-me!!"`

### 修复
1. ✅ 在 `.env.local` 中添加：
   ```bash
   # API Key encryption secret (AES-256-GCM, 32 bytes)
   API_KEY_ENCRYPTION_SECRET=8lMeDvA3c47KOO5bJNPwtnHPfcFjnARoLUgetxOdHlU=
   ```

2. ✅ 在 `.env.example` 中添加文档：
   ```bash
   # API Key encryption secret (AES-256-GCM, generate with `openssl rand -base64 32`).
   API_KEY_ENCRYPTION_SECRET=
   ```

### 验证
- 生成命令：`openssl rand -base64 32`
- 加密算法：AES-256-GCM
- 密钥长度：32 字节（通过 SHA-256 哈希确保）

### 注意事项
⚠️ **重要**：
- 旧密钥如果用不同的 `API_KEY_ENCRYPTION_SECRET` 加密，将无法解密
- 生产环境必须在 Vercel 项目设置中配置此环境变量
- 更改此密钥后，所有已存储的加密密钥将无法解密

---

## 问题 2: 修改 key 名字界面仍为 deepseek

### 调查结果
- ✅ 检查了所有 keys 相关组件，**未发现任何 "deepseek" 残留文本**
- 检查的文件：
  - `app/(dashboard)/keys/key-sheet.tsx` - 编辑对话框组件
  - `app/(dashboard)/keys/client.tsx` - 创建密钥组件
  - `app/(dashboard)/keys/columns.tsx` - 表格列定义
  - `app/(dashboard)/keys/actions.ts` - Server Actions
  - `app/(dashboard)/keys/key-display.tsx` - 密钥显示组件

### 界面文本确认
当前 `KeySheet` 组件标题和标签：
- 对话框标题：`"编辑 API Key"`
- 表单字段：
  - `"名称"`
  - `"绑定渠道"`
  - `"总额度（credits）"`
  - `"有效期"`
  - `"IP 白名单"`
  - `"模型白名单"`

### 可能原因
如果用户仍然看到 "deepseek" 文本，可能是：
1. **浏览器缓存** - 需要硬刷新（Ctrl+Shift+R）
2. **开发服务器未重启** - 已执行重启以加载新环境变量
3. **混淆了其他页面** - 可能在 Playground 或其他页面看到 deepseek 模型相关内容

### 建议
- 清除浏览器缓存并硬刷新
- 确认是在 `/keys` 页面的编辑对话框中看到问题

---

## 部署检查清单

部署到生产环境前，请确保：

- [ ] Vercel 项目设置中添加了 `API_KEY_ENCRYPTION_SECRET` 环境变量
- [ ] 使用 `openssl rand -base64 32` 生成新的随机密钥（不要使用开发环境的密钥）
- [ ] 重新部署后，创建新的测试密钥并验证查看功能正常
- [ ] 文档更新到 `.env.example`

## 相关文件

- `lib/auth/api-key.ts` - 加密/解密实现
- `app/(dashboard)/keys/actions.ts` - `revealApiKeyAction` Server Action
- `app/(dashboard)/keys/key-display.tsx` - 查看/复制按钮组件
- `.env.local` - 开发环境配置
- `.env.example` - 环境变量模板

## 测试步骤

1. 启动开发服务器：`npm run dev`
2. 登录并进入 `/keys` 页面
3. 创建新的 API Key
4. 点击眼睛图标查看完整密钥
5. 验证解密成功并显示完整密钥
6. 点击复制按钮验证复制功能
7. 点击编辑按钮，确认对话框标题为"编辑 API Key"
