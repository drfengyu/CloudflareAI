/**
 * 余额显示逻辑辅助函数
 *
 * 当永久余额为负数时，用临时余额补正显示：
 * - 永久余额显示 = max(0, permanent) 或补正后仍为负
 * - 临时余额显示 = 补正后剩余可用额度
 *
 * 示例：
 * 1. permanent -50, temporary 100
 *    → display: permanent 0, temporary 50 (用50补正)
 *
 * 2. permanent -150, temporary 100
 *    → display: permanent -50, temporary 0 (不够补，还欠50)
 *
 * 3. permanent 100, temporary 50
 *    → display: permanent 100, temporary 50 (无需补正)
 */

export interface BalanceBreakdown {
  permanent: number;        // 真实永久余额
  temporary: number;        // 真实临时余额
  total: number;            // 真实总余额
  displayPermanent: number; // 显示用永久余额
  displayTemporary: number; // 显示用临时余额
}

/**
 * 计算显示用余额（补正负数）
 */
export function calculateDisplayBalance(
  permanent: number,
  temporary: number
): BalanceBreakdown {
  const total = permanent + temporary;

  if (permanent >= 0) {
    // 永久余额为正，无需补正
    return {
      permanent,
      temporary,
      total,
      displayPermanent: permanent,
      displayTemporary: temporary,
    };
  }

  // 永久余额为负，用临时余额补正
  const deficit = Math.abs(permanent); // 负数的绝对值（欠多少）

  if (temporary >= deficit) {
    // 临时余额足够补正到 0
    return {
      permanent,
      temporary,
      total,
      displayPermanent: 0,
      displayTemporary: temporary - deficit,
    };
  } else {
    // 临时余额不够补正，还有负数
    return {
      permanent,
      temporary,
      total,
      displayPermanent: permanent + temporary, // 还欠的部分
      displayTemporary: 0,
    };
  }
}
