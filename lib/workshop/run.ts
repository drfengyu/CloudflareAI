import { createWildEncounter } from "./battle";
import type { WorkshopConfig } from "./config";
import {
  WORKSHOP_DIR,
  fieldEncounterChanceAt,
  fieldHitsSolid,
  fieldPointPixel,
  fieldStepRandom,
  workshopFieldFor,
  type WorkshopField,
} from "./field";
import type { WorkshopEncounter, WorkshopRun } from "./state";

/**
 * 一趟探险：进图付一次券，之后在地图上自由走，服务端按种子逐格重放并摇遇敌。
 *
 * 客户端只上传「往哪个方向走了几格」的路径（`[方向, 步数][]` 的游程编码），
 * 地图形状由 `field.ts` 的纯函数复现，所以走位是否合法、踩到什么地貌、第几步摇中
 * 遇敌，服务端都能自己算一遍——客户端报不上来的东西一律以重放结果为准。
 */

/** `[方向下标, 连续步数]`；方向见 `WORKSHOP_DIR`（上右下左）。 */
export type WorkshopWalkPath = [number, number][];

export interface WorkshopWalkLimits {
  /** 一趟最多走多少步：走位刷遇敌的总闸。 */
  maxSteps: number;
  /** 一趟最多摇出多少次遇敌。 */
  maxEncounters: number;
  /** 单次请求最多接受多少步路径。 */
  maxPathSteps: number;
}

/** 单次请求能上传的路径长度上限：够按住方向键跑满一屏，再多就是攻击面。 */
export const WORKSHOP_WALK_MAX_PATH_STEPS = 96;

export function workshopWalkLimits(config: WorkshopConfig): WorkshopWalkLimits {
  return {
    maxSteps: config.runMaxSteps,
    maxEncounters: config.runMaxEncounters,
    maxPathSteps: WORKSHOP_WALK_MAX_PATH_STEPS,
  };
}

export type WorkshopWalkOutcome =
  | { kind: "ok"; run: WorkshopRun; consumed: number }
  | { kind: "encounter"; run: WorkshopRun; consumed: number; encounter: WorkshopEncounter }
  | { kind: "capped"; run: WorkshopRun; consumed: number; reason: "steps" | "encounters" };

const DIRECTIONS = WORKSHOP_DIR.length;
const MAX_RUN_ENTRIES = 40;
const MAX_RUN_LENGTH = 64;

/** 脏路径兜回可用：非法项整条丢掉，长度与步数都夹到上限内。 */
export function sanitizeWalkPath(raw: unknown, maxPathSteps: number): WorkshopWalkPath {
  if (!Array.isArray(raw)) return [];
  const path: WorkshopWalkPath = [];
  let total = 0;
  for (const item of raw) {
    if (!Array.isArray(item) || item.length < 2) continue;
    const dir = Math.trunc(Number(item[0]));
    const count = Math.trunc(Number(item[1]));
    if (!Number.isInteger(dir) || dir < 0 || dir >= DIRECTIONS) continue;
    if (!Number.isInteger(count) || count <= 0) continue;
    const take = Math.min(count, MAX_RUN_LENGTH, maxPathSteps - total);
    if (take <= 0) break;
    const last = path[path.length - 1];
    if (last && last[0] === dir) last[1] += take;
    else path.push([dir, take]);
    total += take;
    if (total >= maxPathSteps || path.length > MAX_RUN_ENTRIES) break;
  }
  return path;
}

/** 客户端把连续同向的行走合并成一条游程，减少上传体积。 */
export function pushWalkStep(path: WorkshopWalkPath, dir: number): void {
  const last = path[path.length - 1];
  if (last && last[0] === dir) last[1] += 1;
  else path.push([dir, 1]);
}

export function workshopRunField(run: WorkshopRun): WorkshopField {
  return workshopFieldFor(run.areaKey, run.seed);
}

export function newWorkshopRun(input: {
  areaKey: string;
  seed: number;
  now?: number;
}): WorkshopRun {
  const field = workshopFieldFor(input.areaKey, input.seed);
  return {
    areaKey: field.areaKey,
    seed: field.seed,
    tx: field.camp.tx,
    ty: field.camp.ty,
    steps: 0,
    encounters: 0,
    startedAt: input.now ?? Date.now(),
  };
}

/** 出生点与光标所在的像素坐标（脚底即格心）。 */
export function workshopRunPixel(run: WorkshopRun): { x: number; y: number } {
  const field = workshopRunField(run);
  return fieldPointPixel(field, { tx: run.tx, ty: run.ty });
}

export function workshopCampPixel(run: WorkshopRun): { x: number; y: number } {
  const field = workshopRunField(run);
  return fieldPointPixel(field, field.camp);
}

/** 脏存档兜底：按真实的图夹住光标，站在障碍或图外面就直接回营地。 */
export function normalizeWorkshopRun(run: WorkshopRun | null): WorkshopRun | null {
  if (!run) return null;
  const field = workshopRunField(run);
  const next: WorkshopRun = {
    ...run,
    areaKey: field.areaKey,
    seed: field.seed,
    tx: clampInt(run.tx, 0, field.cols - 1, field.camp.tx),
    ty: clampInt(run.ty, 0, field.rows - 1, field.camp.ty),
    steps: clampInt(run.steps, 0, 1_000_000, 0),
    encounters: clampInt(run.encounters, 0, 10_000, 0),
  };
  if (pointSolid(field, next)) {
    next.tx = field.camp.tx;
    next.ty = field.camp.ty;
  }
  return next;
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function pointSolid(field: WorkshopField, run: WorkshopRun): boolean {
  const { x, y } = fieldPointPixel(field, { tx: run.tx, ty: run.ty });
  return fieldHitsSolid(field, x, y);
}

/**
 * 逐格重放一段走位：撞墙的那一步不动也不摇骰，走得动的步数计入 `steps`，
 * 每步按脚下地貌与 `fieldStepRandom(seed, 第几步)` 决定会不会遇敌。
 * 一遇敌就停下，剩下的路径直接丢弃（客户端按返回的光标把主角拉回去）。
 */
export function replayWorkshopWalk(
  input: WorkshopRun,
  path: WorkshopWalkPath,
  limits: WorkshopWalkLimits,
): WorkshopWalkOutcome {
  const field = workshopRunField(input);
  const run: WorkshopRun = { ...input };
  let consumed = 0;

  for (const [dir, count] of path) {
    for (let i = 0; i < count; i += 1) {
      consumed += 1;
      if (run.steps >= limits.maxSteps) {
        return { kind: "capped", run, consumed, reason: "steps" };
      }
      if (run.encounters >= limits.maxEncounters) {
        return { kind: "capped", run, consumed, reason: "encounters" };
      }
      const step = WORKSHOP_DIR[dir];
      if (!step) return { kind: "ok", run, consumed };
      const nx = run.tx + step.dx;
      const ny = run.ty + step.dy;
      const { x, y } = fieldPointPixel(field, { tx: nx, ty: ny });
      // 走不动：不移动、不计步、不摇骰，客户端与服务端算的是同一张图所以结果一致
      if (nx < 0 || ny < 0 || nx >= field.cols || ny >= field.rows || fieldHitsSolid(field, x, y)) {
        continue;
      }
      run.tx = nx;
      run.ty = ny;
      run.steps += 1;

      const chance = fieldEncounterChanceAt(field, nx, ny);
      if (chance <= 0) continue;
      const random = fieldStepRandom(run.seed, run.steps);
      if (random() >= chance) continue;
      const encounter = createWildEncounter(field.areaKey, random);
      if (!encounter) continue;
      run.encounters += 1;
      return { kind: "encounter", run, consumed, encounter };
    }
  }
  return { kind: "ok", run, consumed };
}

/** 还剩多少步与多少次遇敌额度，供 HUD 与「该收兵了」提示用。 */
export function workshopRunRemaining(run: WorkshopRun, limits: WorkshopWalkLimits): {
  steps: number;
  encounters: number;
} {
  return {
    steps: Math.max(0, limits.maxSteps - run.steps),
    encounters: Math.max(0, limits.maxEncounters - run.encounters),
  };
}
