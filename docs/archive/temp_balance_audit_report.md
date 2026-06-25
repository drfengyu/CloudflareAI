# Temporary Balance Expiration Audit Report

**Date**: 2026-06-22  
**Status**: ✅ **ALL CHECKS PASSED**

## Summary

All queries and operations on the `temporary_balance` table correctly handle expiration filtering. No issues found.

---

## Detailed Findings

### ✅ 1. Cron Cleanup Endpoint (`/api/cron/cleanup-expired-balances/route.ts`)

**Status**: CORRECT ✓

```typescript
// Lines 40-43: Query expired records
const expiredRecords = await db
  .select()
  .from(temporaryBalances)
  .where(sql`${temporaryBalances.expiresAt} <= ${nowMs}`);

// Lines 56-58: Delete expired records
await db
  .delete(temporaryBalances)
  .where(sql`${temporaryBalances.expiresAt} <= ${nowMs}`);
```

**Verification**: Correctly filters and deletes only expired records using `expiresAt <= now`.

---

### ✅ 2. Meter.ts - Balance Deduction (`lib/usage/meter.ts`)

**Status**: CORRECT ✓

```typescript
// Lines 107-117: Query only unexpired balances for deduction
const tempBalances = await db
  .select()
  .from(temporaryBalances)
  .where(
    and(
      eq(temporaryBalances.userId, userId),
      gt(temporaryBalances.expiresAt, now),  // ✓ Only unexpired
    ),
  )
  .orderBy(temporaryBalances.expiresAt);
```

**Verification**: 
- Correctly filters `expiresAt > now` before deducting
- Orders by expiration (earliest first, FIFO)
- Only operates on valid temporary balances

---

### ✅ 3. Meter.ts - Get Total Balance (`lib/usage/meter.ts`)

**Status**: CORRECT ✓

```typescript
// Lines 166-175: Query only unexpired balances for total
const now = new Date();
const tempBalances = await db
  .select({ amount: temporaryBalances.amount })
  .from(temporaryBalances)
  .where(
    and(
      eq(temporaryBalances.userId, userId),
      gt(temporaryBalances.expiresAt, now),  // ✓ Only unexpired
    ),
  );
```

**Verification**: Correctly excludes expired balances from total calculation.

---

### ✅ 4. Display Balance (`lib/billing/display-balance.ts`)

**Status**: CORRECT ✓

```typescript
// Lines 91-102: Filter expired balances in display calculation
const tempRows = await db
  .select({
    amount: temporaryBalances.amount,
    expiresAt: temporaryBalances.expiresAt,
  })
  .from(temporaryBalances)
  .where(eq(temporaryBalances.userId, userId));

const now = new Date();
const temporary = tempRows
  .filter((tb) => new Date(tb.expiresAt) > now)  // ✓ Filter expired
  .reduce((acc, tb) => acc + tb.amount, 0);
```

**Verification**: 
- Fetches all records first, then filters in-memory
- Correctly excludes expired balances using `expiresAt > now`
- Safe approach for display calculation

---

### ✅ 5. Wallet Page (`app/(dashboard)/wallet/page.tsx`)

**Status**: CORRECT ✓

```typescript
// Lines 30-42: Query all, then filter unexpired
const now = new Date();
const tempBalances = await db
  .select()
  .from(temporaryBalances)
  .where(eq(temporaryBalances.userId, userId))
  .orderBy(temporaryBalances.expiresAt);

const allValidTempBalances = tempBalances.filter(
  (tb) => new Date(tb.expiresAt) > now  // ✓ Filter expired
);
const temporaryTotal = allValidTempBalances.reduce((sum, tb) => sum + tb.amount, 0);
```

**Verification**: 
- Correctly filters expired balances before summing
- Display logic properly handles expired balances
- Shows only valid balances to user

---

### ✅ 6. Admin Users Page (`app/(dashboard)/admin/users/page.tsx`)

**Status**: CORRECT ✓

```typescript
// Lines 47-57: Uses getUserTotalBalance() which filters expired
const usersWithBalance = await Promise.all(
  allUsers.map(async (u) => {
    const balance = await getUserTotalBalance(u.id);  // ✓ Calls meter.ts
    return {
      ...u,
      totalBalance: balance.total,
      permanentBalance: balance.permanent,
      temporaryBalance: balance.temporary,  // ✓ Already filtered
      roleLabel: roleLabels[u.role || 1] || roleLabels[1],
    };
  })
);
```

**Verification**: 
- Delegates to `getUserTotalBalance()` from `meter.ts`
- That function already filters expired balances (see #3 above)
- Displays correct temporary balance totals

---

### ✅ 7. Admin Users Columns (`app/(dashboard)/admin/users/columns.tsx`)

**Status**: CORRECT ✓

```typescript
// Lines 48-67: Uses pre-calculated balances from page
const total = row.original.totalBalance;       // Already filtered
const permanent = row.original.permanentBalance;
const temporary = row.original.temporaryBalance;  // Already filtered

const display = calculateDisplayBalance(permanent, temporary);
```

**Verification**: 
- Uses balances passed from parent page
- Parent page already filtered expired balances (see #6)
- Display calculation is correct

---

### ✅ 8. Manage User Dialog (`app/(dashboard)/admin/users/manage-user-dialog.tsx`)

**Status**: CORRECT ✓

```typescript
// Lines 129-148: Uses UserRow data with pre-filtered balances
user.totalBalance        // Already filtered by parent
user.permanentBalance
user.temporaryBalance    // Already filtered by parent
```

**Verification**: 
- Receives UserRow from parent with pre-filtered balances
- No direct database queries
- Display logic is correct

---

### ✅ 9. Wallet Actions - Redeem Code (`app/(dashboard)/wallet/actions.ts`)

**Status**: CORRECT ✓

```typescript
// Lines 47-56: Creates new temporary balance with future expiration
await db.insert(temporaryBalances).values({
  id: crypto.randomUUID(),
  userId: currentUserId,
  amount: redemption.quota,
  expiresAt: balanceExpiresAt,  // ✓ Future date
  redemptionId: redemption.id,
  description: `兑换码充值: ${code}`,
  createdAt: now,
});
```

**Verification**: 
- Only creates new records (INSERT)
- Does not query or filter existing records
- New records have future expiration dates

---

### ✅ 10. Checkin Actions (`app/(dashboard)/wallet/checkin-actions.ts`)

**Status**: CORRECT ✓

```typescript
// Lines 184-192: Creates new temporary balance with future expiration
await db.insert(temporaryBalances).values({
  id: crypto.randomUUID(),
  userId,
  amount: quotaAwarded,
  expiresAt,  // ✓ Future date (now + validDays)
  description: `每日签到奖励...`,
  createdAt: now,
});
```

**Verification**: 
- Only creates new records (INSERT)
- Does not query or filter existing records
- New records have future expiration dates

---

### ✅ 11. Delete User Action (`app/(dashboard)/admin/users/delete-user-action.ts`)

**Status**: CORRECT ✓

```typescript
// Line 64: Deletes ALL temporary balances for user
await db.delete(temporaryBalances).where(eq(temporaryBalances.userId, targetUserId));
```

**Verification**: 
- Cascade delete operation
- Does not need expiration filtering (deletes all)
- Correct behavior for user deletion

---

### ✅ 12. Admin User Actions (`app/(dashboard)/admin/users/actions.ts`)

**Status**: N/A ✓

```typescript
// No temporaryBalances imports or queries
```

**Verification**: 
- Does not interact with temporary_balance table
- Only modifies permanent balance (`users.balanceCredits`)
- No issues

---

## Conclusion

**All systems correctly handle temporary balance expiration:**

1. ✅ **Deduction logic** (`meter.ts`): Only deducts from unexpired balances
2. ✅ **Balance queries** (`meter.ts`, `display-balance.ts`): Filter expired before summing
3. ✅ **Display logic** (wallet, admin pages): Show only unexpired balances
4. ✅ **Cleanup cron**: Correctly identifies and deletes expired records
5. ✅ **Creation logic** (redeem, checkin): Creates records with future expiration
6. ✅ **Deletion logic**: Correctly handles cascade deletion

**No action required.** The codebase is consistent and correct.

---

## Recommendations

### 1. Consider Database-Level Cleanup

Currently cleanup relies on Vercel Cron. Consider adding:

```sql
-- Add index for cleanup performance
CREATE INDEX IF NOT EXISTS idx_temp_balance_expires 
ON temporary_balance(expiresAt);
```

### 2. Add Monitoring

Consider logging expired balance cleanup to track:
- Number of records cleaned per run
- Total credits expired per day
- Users affected by expiration

### 3. Consider Grace Period

For better UX, consider adding a grace period:
- Show "expiring soon" warning (e.g., < 24 hours)
- Allow one-time extension for accidental expiration

---

## Test Scenarios Verified

✅ Balance deduction skips expired temp balances  
✅ Dashboard shows only unexpired balances  
✅ Wallet page filters expired before display  
✅ Admin page calculates correct totals  
✅ Cleanup cron deletes only expired records  
✅ New temp balances created with future expiration  
✅ User deletion removes all temp balances (expired or not)  

**All scenarios pass.**
