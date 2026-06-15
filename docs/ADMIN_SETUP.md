# 管理员权限升级指南

## 问题
新增的 Phase E（定价页）和 Phase F（管理后台）页面需要管理员权限才能访问，但默认注册的用户角色为 1（普通用户）。

## 解决方案

### 方法 1：使用 Debug API（推荐，最简单）

1. **登录你的账号**（浏览器访问 http://localhost:3000/login）

2. **查看当前用户信息**
   ```bash
   # 在浏览器登录后，访问：
   http://localhost:3000/api/debug/whoami
   ```
   返回示例：
   ```json
   {
     "email": "your@email.com",
     "role": 1,
     "roleLabel": "普通用户",
     "canAccessAdmin": false
   }
   ```

3. **升级为超级管理员**
   ```bash
   # 浏览器访问（替换你的邮箱）：
   http://localhost:3000/api/debug/make-admin?email=your@email.com
   ```
   返回示例：
   ```json
   {
     "message": "升级成功",
     "email": "your@email.com",
     "oldRole": 1,
     "newRole": 100,
     "adminPages": ["/admin/users", "/admin/redemptions", "/admin/settings"]
   }
   ```

4. **刷新页面，导航栏会出现"管理"分组**

### 方法 2：直接修改数据库

使用 Cloudflare Dashboard 访问 D1 数据库：

```sql
-- 查看所有用户
SELECT id, email, role FROM user;

-- 升级指定用户为超管（替换 your@email.com）
UPDATE user SET role = 100 WHERE email = 'your@email.com';
```

### 方法 3：使用 TypeScript 脚本

```bash
# 安装 tsx（如果还没有）
npm install -D tsx

# 运行脚本
npx tsx scripts/make-admin.ts your@email.com
```

## 角色说明

| 角色值 | 名称 | 权限 |
|--------|------|------|
| 1 | 普通用户 | 访问 Playground、钱包、API Key |
| 10 | 管理员 | + 用户管理、兑换码管理、系统设置 |
| 100 | 超级管理员 | 全部权限 |

## 验证

升级后访问以下页面应该正常显示（不再重定向到登录）：

- http://localhost:3000/pricing （所有用户）
- http://localhost:3000/wallet （所有用户）
- http://localhost:3000/admin/users （管理员）
- http://localhost:3000/admin/redemptions （管理员）
- http://localhost:3000/admin/settings （管理员）

## 注意事项

- Debug API 仅在开发环境（NODE_ENV=development）可用
- 生产环境需要通过数据库直接修改
- 建议第一个注册的用户自动设为超管（见 CLAUDE.md Phase B 设计）
