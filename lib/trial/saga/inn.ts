/**
 * 客栈住店：行军途中回城歇脚，花 1 张活动券，把上阵武将的兵力补满。
 *
 * 战斗只掉兵力、不回满，住店让残兵能接着往下一处打。价格写死在引擎里：
 * 收兵重放不读后台配置，客户端与服务器必须同价。
 *
 * 兵败后也能住店：购买记录在重放时把全队拉回满编、场景切回 `field`；
 * 否则一次失手就只能收兵重来，客栈反倒在最缺兵的时候用不上。
 */

export const SAGA_INN_PRICE_TICKETS = 1;

/** 每天前两次住店免费，跨日按 Asia/Shanghai 自然日重置。 */
export const SAGA_FREE_INN_PER_DAY = 2;

export function trialDayKey(at: number = Date.now()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(at));
  } catch {
    return new Date(at).toISOString().slice(0, 10);
  }
}

/** 按存档里的免费次数判断这一笔住店是否免费。 */
export function freeInnAvailable(save: { innFreeDate?: string; innFreeUsed?: number }, at?: number): boolean {
  const day = trialDayKey(at);
  const used = save.innFreeDate === day ? Math.max(0, Math.trunc(Number(save.innFreeUsed) || 0)) : 0;
  return used < SAGA_FREE_INN_PER_DAY;
}

/** 客栈在购买记录里的虚拟商品 ID，不占军需限购。 */
export const SAGA_INN_ITEM_ID = "inn_rest";
