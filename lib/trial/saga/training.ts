/**
 * 城中的训练场：花活动券把武将逐级练到指定等级。
 *
 * 训练是一条带 `generalId` / `targetLevel` 的购买记录，服务端按购买位置重放时
 * 直接把等级抬到目标值；价格由「目标等级 − 当前等级」决定，训练上限随主线推进。
 */

import { SAGA_GENERAL_BY_ID } from "./data";
import { findGeneral } from "./state";
import { SAGA_MAX_LEVEL, type TrialSave } from "./types";

export const SAGA_TRAINING_ITEM_ID = "training";
export const SAGA_TRAINING_TICKETS_PER_LEVEL = 2;

/** 训练场上限：初到涿郡可练到 9 级，每平定一处地方 +3，最高 30 级。 */
export function trainingLevelCap(save: TrialSave): number {
  return Math.min(SAGA_MAX_LEVEL, 9 + Math.max(0, save.stats.wins) * 3);
}

export function trainingCost(fromLevel: number, toLevel: number): number {
  const levels = Math.trunc(toLevel) - Math.trunc(fromLevel);
  return levels > 0 ? levels * SAGA_TRAINING_TICKETS_PER_LEVEL : 0;
}

/** 把武将练到目标等级；已在目标等级以上、查无此人或超出上限都返回 0。 */
export function trainGeneral(save: TrialSave, generalId: string, targetLevel: number): number {
  const general = findGeneral(save, generalId);
  if (!general || !SAGA_GENERAL_BY_ID.get(generalId)) return 0;
  const target = Math.min(
    trainingLevelCap(save),
    SAGA_MAX_LEVEL,
    Math.trunc(Number(targetLevel) || 0),
  );
  if (target <= general.level) return 0;
  const gained = target - general.level;
  general.level = target;
  general.exp = 0;
  return gained;
}
