/**
 * 城中的铁匠铺：花活动券把兵器 / 甲胄强化到指定等级。
 *
 * 强化等级存在存档的 `gearLevels`（按装备 ID 记，0 级不入表），
 * 与装备本身解耦：换将、卸装都不掉级。服务端购买时按购买位置重放校验当前等级，
 * 重放只负责把等级抬到记录里的目标值，不采信客户端上报。
 */

import { SAGA_ITEM_BY_ID } from "./data";
import type { TrialSave } from "./types";

export const SAGA_FORGE_ITEM_ID = "forge";
export const SAGA_FORGE_MAX_LEVEL = 5;

/** 每级强化按基础属性的两成追加，满级约为原属性的两倍。 */
export const SAGA_FORGE_BONUS_PCT = 0.2;

function clampLevel(value: unknown): number {
  const level = Math.trunc(Number(value));
  return Number.isFinite(level) ? Math.min(SAGA_FORGE_MAX_LEVEL, Math.max(0, level)) : 0;
}

function forgeable(itemId: string): boolean {
  const item = SAGA_ITEM_BY_ID.get(itemId);
  return Boolean(item && (item.kind === "weapon" || item.kind === "armor"));
}

/** 从多少级强化到下一级要几张券；满级、非装备或查无此物返回 0。 */
export function forgeCost(itemId: string, fromLevel: number): number {
  const item = SAGA_ITEM_BY_ID.get(itemId);
  if (!item || !forgeable(itemId)) return 0;
  const level = clampLevel(fromLevel);
  if (level >= SAGA_FORGE_MAX_LEVEL) return 0;
  return item.priceTickets + level * 2;
}

/** 强化带来的属性增量：按基础属性两成一级，四舍五入到整数。 */
export function forgeBonus(base: number, level: number): number {
  const safe = Math.max(0, Math.floor(Number(base) || 0));
  return Math.round(safe * SAGA_FORGE_BONUS_PCT * clampLevel(level));
}

/** 装备在指定强化等级下的攻击 / 防御值（强化只加成装备自带的那一项）。 */
export function forgeStat(itemId: string, level: number): number {
  const item = SAGA_ITEM_BY_ID.get(itemId);
  if (!item || !forgeable(itemId)) return 0;
  const base = item.kind === "weapon" ? item.atk ?? 0 : item.def ?? 0;
  return base + forgeBonus(base, level);
}

/** 存档里的强化等级表：只留可强化的装备，0 级与脏数据一律丢弃。 */
export function normalizeGearLevels(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [itemId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!forgeable(itemId)) continue;
    const level = clampLevel(value);
    if (level > 0) out[itemId] = level;
  }
  return out;
}

export function gearLevel(save: TrialSave, gearId: string | null): number {
  if (!gearId) return 0;
  return clampLevel(save.gearLevels?.[gearId] ?? 0);
}

/** 把某件装备抬到目标等级；已在该等级及以上返回 0。 */
export function upgradeGear(save: TrialSave, gearId: string, targetLevel: number): number {
  if (!forgeable(gearId)) return 0;
  const current = gearLevel(save, gearId);
  const target = Math.min(SAGA_FORGE_MAX_LEVEL, clampLevel(targetLevel));
  if (target <= current) return 0;
  save.gearLevels = { ...(save.gearLevels ?? {}), [gearId]: target };
  return target - current;
}
