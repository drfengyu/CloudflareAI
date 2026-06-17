# 余额显示逻辑验证报告

## 测试时间
2026-06-17

## 测试目的
验证永久余额为负数（欠费）时，临时余额补正显示逻辑是否正确。

## 测试场景（8个）

### ✅ 场景1：临时余额足够补正
- **输入**：permanent=-50, temporary=100
- **真实余额**：total=50
- **显示余额**：permanent=0, temporary=50
- **说明**：用 50 临时余额补正永久欠款，剩余 50 可用

### ✅ 场景2：临时余额不够补正
- **输入**：permanent=-150, temporary=100
- **真实余额**：total=-50
- **显示余额**：permanent=-50, temporary=0
- **说明**：临时余额全部用于补正，仍欠 50

### ✅ 场景3：临时余额刚好补平
- **输入**：permanent=-30, temporary=30
- **真实余额**：total=0
- **显示余额**：permanent=0, temporary=0
- **说明**：临时余额刚好抵消永久欠款

### ✅ 场景4：无临时余额可补
- **输入**：permanent=-100, temporary=0
- **真实余额**：total=-100
- **显示余额**：permanent=-100, temporary=0
- **说明**：显示真实欠款

### ✅ 场景5：无欠款正常显示
- **输入**：permanent=100, temporary=50
- **真实余额**：total=150
- **显示余额**：permanent=100, temporary=50
- **说明**：无需补正，正常显示

### ✅ 场景6：永久余额为0
- **输入**：permanent=0, temporary=100
- **真实余额**：total=100
- **显示余额**：permanent=0, temporary=100
- **说明**：边界情况，无需补正

### ✅ 场景7：严重欠费
- **输入**：permanent=-200, temporary=0
- **真实余额**：total=-200
- **显示余额**：permanent=-200, temporary=0
- **说明**：显示真实欠款（无临时余额）

### ✅ 场景8：小数支持
- **输入**：permanent=-10.5, temporary=20.3
- **真实余额**：total=9.8
- **显示余额**：permanent=0, temporary=9.8
- **说明**：小数计算正确

## 测试结果

**通过率**：8/8 (100%)

## 核心逻辑（伪代码）

```typescript
if (permanent >= 0) {
  // 无欠款，直接显示
  return { displayPermanent: permanent, displayTemporary: temporary };
}

const deficit = Math.abs(permanent); // 欠款金额

if (temporary >= deficit) {
  // 临时余额够补
  return { displayPermanent: 0, displayTemporary: temporary - deficit };
} else {
  // 临时余额不够补
  return { displayPermanent: permanent + temporary, displayTemporary: 0 };
}
```

## 显示效果

### 用户管理列表（`/admin/users`）
```
余额列显示：
- 总余额：50 cr = $50.00
- 明细：(永久 0 + 临时 50)
```

### 管理对话框
```
当前余额: 50 cr (≈ $50.00)
永久: 0 cr + 临时: 50 cr (已用临时余额补正)
```

## 关键特性

1. **视觉友好**：用户看到的是"可用余额"而非负数（当临时余额够补时）
2. **真实透明**：当临时余额不够补时，仍显示真实欠款
3. **不影响扣费**：仅显示层优化，不改变扣费逻辑
4. **支持小数**：精确计算小数余额

## 相关文件

- `lib/billing/display-balance.ts` - 核心逻辑
- `app/(dashboard)/admin/users/columns.tsx` - 列表显示
- `app/(dashboard)/admin/users/manage-user-dialog.tsx` - 对话框显示

## 结论

✅ **永久余额欠费显示逻辑完全正确，符合预期！**
