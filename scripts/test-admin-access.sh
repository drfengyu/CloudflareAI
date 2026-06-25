#!/bin/bash

# 完整功能测试（需要先登录）

echo "=== 测试新增页面（需要登录后才能完整测试） ==="
echo ""
echo "请先在浏览器登录：http://localhost:3000/login"
echo "登录账号：drfengling@163.com"
echo "角色已升级为：超级管理员 (role=100)"
echo ""
echo "升级后可以访问的页面："
echo ""
echo "✓ 通用分组："
echo "  - /pricing (定价)"
echo ""
echo "✓ 个人分组："
echo "  - /wallet (我的钱包)"
echo ""
echo "✓ 管理分组（需要 role ≥ 10）："
echo "  - /admin/users (用户管理)"
echo "  - /admin/redemptions (兑换码管理)"
echo "  - /admin/settings (系统设置)"
echo ""
echo "登录后，sidebar 左侧导航会显示「管理」分组"
echo ""

# 测试 API
echo "=== 测试 Debug API ==="
echo ""
echo "1. 测试 /api/debug/whoami（需要在浏览器登录后访问）"
echo "   http://localhost:3000/api/debug/whoami"
echo ""
echo "2. 当前数据库状态："

if [ -z "$CF_ACCOUNT_ID" ] || [ -z "$CF_API_TOKEN" ] || [ -z "$CF_D1_DATABASE_ID" ]; then
  echo "   （需要设置环境变量：CF_ACCOUNT_ID, CF_API_TOKEN, CF_D1_DATABASE_ID）"
else
  curl -s "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/d1/database/$CF_D1_DATABASE_ID/query" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"sql":"SELECT email, role, balanceCredits FROM user WHERE email = '\''drfengling@163.com'\''"}' \
    | grep -o '"email":"[^"]*","role":[0-9]*,"balanceCredits":[0-9]*' | sed 's/"email":"/邮箱: /;s/","role":/ | 角色: /;s/,"balanceCredits":/ | 余额: /;s/$/cr/'
fi

echo ""
echo "=== 下一步 ==="
echo "1. 在浏览器访问 http://localhost:3000/login 登录"
echo "2. 登录后访问 http://localhost:3000/admin/users 查看用户管理页面"
echo "3. 检查 sidebar 是否显示「管理」分组"
