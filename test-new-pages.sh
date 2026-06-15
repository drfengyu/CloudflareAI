#!/bin/bash

# 测试脚本：验证新增页面

echo "=== 测试新增页面 ==="
echo ""

BASE_URL="http://localhost:3000"

# 测试页面列表
PAGES=(
  "/pricing"
  "/wallet"
  "/admin/users"
  "/admin/redemptions"
  "/admin/settings"
)

for page in "${PAGES[@]}"; do
  echo "Testing: $page"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$page")

  if [ "$STATUS" = "302" ]; then
    echo "✓ $page - OK (redirects to login)"
  elif [ "$STATUS" = "200" ]; then
    echo "✓ $page - OK (renders)"
  else
    echo "✗ $page - FAIL (status: $STATUS)"
  fi
  echo ""
done

echo "=== 测试完成 ==="
