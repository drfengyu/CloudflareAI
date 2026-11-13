import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_WORKSHOP_CONFIG,
  WORKSHOP_LINES,
  sanitizeWorkshopConfig,
  sanitizeWorkshopMilestones,
  workshopTierName,
} from "../lib/workshop/config";
import {
  captureChance,
  createGymEncounter,
  createWildEncounter,
  resolveWorkshopBattle,
  typeMultiplier,
} from "../lib/workshop/battle";
import {
  createPet,
  expToNext,
  gainExp,
  petStats,
} from "../lib/workshop/pets";
import {
  emptyWorkshopState,
  highestTier,
  normalizeWorkshopRunShape,
  normalizeWorkshopState,
  type WorkshopRun,
  type WorkshopState,
} from "../lib/workshop/state";
import {
  WORKSHOP_TILE_CAMP,
  WORKSHOP_TILE_GRASS,
  WORKSHOP_TILE_GYM,
  WORKSHOP_TILE_PATH,
  WORKSHOP_TILE_ROCK,
  WORKSHOP_TILE_TALL,
  WORKSHOP_TILE_TREE,
  WORKSHOP_TILE_WATER,
  fieldEncounterChanceAt,
  fieldHitsSolid,
  fieldReachable,
  fieldSpeedAt,
  fieldStepRandom,
  fieldTileAt,
  workshopFieldFor,
  type WorkshopField,
} from "../lib/workshop/field";
import {
  newWorkshopRun,
  normalizeWorkshopRun,
  pushWalkStep,
  replayWorkshopWalk,
  sanitizeWalkPath,
  workshopWalkLimits,
  type WorkshopWalkPath,
} from "../lib/workshop/run";
import {
  CONSTELLATIONS,
  rollStarStone,
  sanitizeCollectionConfig,
  sanitizeCollectionSetRewards,
} from "../lib/collection/config";
import {
  addStones,
  emptyCollectionState,
  litConstellations,
  normalizeCollectionState,
  placeStarStone,
  starCount,
} from "../lib/collection/state";

function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(values.length - 1, index++)];
}

// ---------------------------------------------------------------- 灵宠工坊

const WORKSHOP_DAY = "2026-11-12";

function workshopState(overrides: Partial<WorkshopState> = {}): WorkshopState {
  return { ...emptyWorkshopState(WORKSHOP_DAY), ...overrides };
}

test("工坊里程碑去重并按阶升序，阶数越界被丢掉", () => {
  const rows = sanitizeWorkshopMilestones([
    { tier: 9, reward: 80 },
    { tier: 3, reward: 6 },
    { tier: 3, reward: 99 },
    { tier: 0, reward: 5 },
    { tier: 10, reward: 5 },
    { tier: 5.7, reward: 15 },
  ]);
  assert.deepEqual(rows, [
    { tier: 3, reward: 6 },
    { tier: 5, reward: 15 },
    { tier: 9, reward: 80 },
  ]);
});

test("工坊配置兼容旧字段，票价按券单价对齐整张", () => {
  const config = sanitizeWorkshopConfig({
    dailyGathers: 7,
    gatherCostCredits: 5,
    couponUnitCredits: 3,
    milestones: [],
  });
  // 旧字段 gather* 兜底读回；5 / 3 → 2 张 → 6 cr。
  assert.equal(config.dailyExplores, 7);
  assert.equal(config.exploreCostCredits, 6);
  // 道馆默认 5 cr 也按 3 cr 券面向上取整到 6 cr。
  assert.equal(config.gymCostCredits, 6);
  assert.equal(config.couponUnitCredits, 3);
  assert.deepEqual(config.milestones, DEFAULT_WORKSHOP_CONFIG.milestones);
});

test("工坊阶位名按线取，越界夹到两端", () => {
  assert.equal(workshopTierName("ember", 1), WORKSHOP_LINES[0].tiers[0]);
  assert.equal(workshopTierName("ember", 9), "九尾炎尊");
  assert.equal(workshopTierName("ember", 99), "九尾炎尊");
  assert.equal(workshopTierName("unknown", 0), WORKSHOP_LINES[0].tiers[0]);
});

test("灵宠升级到进化等级自动升阶，50 级封顶", () => {
  assert.deepEqual(petStats(1, 5), { maxHp: 47, atk: 11, def: 7 });
  assert.equal(expToNext(5), 42);

  const grown = gainExp(createPet({ lineKey: "ember", tier: 1, level: 5 }), expToNext(5));
  assert.equal(grown.pet.level, 6);
  assert.equal(grown.levels, 1);
  // 1 阶在 6 级进化成 2 阶。
  assert.equal(grown.fromTier, 1);
  assert.equal(grown.toTier, 2);

  // 第 9 阶没有进化，冲满级后经验清零。
  const capped = gainExp(createPet({ lineKey: "tide", tier: 9, level: 49 }), 999_999);
  assert.equal(capped.pet.level, 50);
  assert.equal(capped.pet.exp, 0);
  assert.equal(capped.toTier, 9);
});

test("旧版「各阶数量」存档换算成灵宠个体，进度不丢", () => {
  const raw = {
    day: WORKSHOP_DAY,
    gathersToday: 4,
    items: {
      ember: [2, 1, 0, 0, 0, 0, 0, 0, 0],
      tide: [2, 0, 0, 0, 0, 0, 0, 0, 0],
      verdant: [1, 0, 0, 0, 0, 0, 0, 0, 0],
    },
  };
  const state = normalizeWorkshopState(raw, WORKSHOP_DAY);
  // 3 + 2 + 1 = 6 只：队伍取前三（2 阶在前），其余进仓库。
  assert.equal(state.party.length + state.box.length, 6);
  assert.equal(state.party.length, 3);
  assert.equal(state.party[0].tier, 2);
  assert.equal(state.party[0].level, 8);
  assert.equal(state.box.length, 3);
  assert.equal(state.starter, "ember");
  assert.equal(state.entersToday, 4);
  assert.equal(state.dex.includes("ember:2"), true);
  assert.equal(highestTier(state), 2);
  // 旧存档没有血量口径，迁移后一律满血。
  assert.equal(state.party.every((pet) => pet.hp === petStats(pet.tier, pet.level).maxHp), true);
});

test("区域遭遇按注入随机数定点，未知区域返回 null", () => {
  const wild = createWildEncounter("ash", () => 0);
  assert.deepEqual(
    wild && { kind: wild.kind, lineKey: wild.lineKey, tier: wild.tier, level: wild.level },
    { kind: "wild", lineKey: "ember", tier: 1, level: 2 },
  );
  assert.equal(createWildEncounter("nowhere"), null);
  const gym = createGymEncounter(2);
  assert.deepEqual(gym && { stage: gym.gymStage, tier: gym.tier, level: gym.level }, {
    stage: 2,
    tier: 6,
    level: 20,
  });
  assert.equal(createGymEncounter(9), null);
});

test("属性克制：本系克制 ×1.5，被克 ×0.67，普通系不参与", () => {
  assert.equal(typeMultiplier("ember", "verdant"), 1.5);
  assert.equal(typeMultiplier("verdant", "ember"), 0.67);
  assert.equal(typeMultiplier("tide", "ember"), 1.5);
  assert.equal(typeMultiplier("normal", "ember"), 1);
  assert.equal(typeMultiplier("ember", "ember"), 1);
});

test("捕捉概率随残血上升、随阶数衰减并夹在上下限", () => {
  const near = (actual: number, expected: number) => Math.abs(actual - expected) < 1e-9;
  assert.equal(captureChance({ hp: 100, maxHp: 100, tier: 1 }), 0.12);
  // 9 阶满血直接压到下限。
  assert.equal(captureChance({ hp: 100, maxHp: 100, tier: 9 }), 0.05);
  // 残血提升捕捉率，但高阶明显更难：1 阶 0.80 / 9 阶 0.40。
  assert.equal(near(captureChance({ hp: 0, maxHp: 100, tier: 1 }), 0.8), true);
  assert.equal(near(captureChance({ hp: 0, maxHp: 100, tier: 9 }), 0.4), true);
  assert.equal(captureChance({ hp: 0, maxHp: 100, tier: 1 }) > captureChance({ hp: 0, maxHp: 100, tier: 9 }), true);
});

test("道馆胜利发徽章与补给，并清空遭遇", () => {
  const pet = createPet({ lineKey: "ember", tier: 9, level: 50 });
  const state = workshopState({
    starter: "ember",
    party: [pet],
    activePetId: pet.id,
    encounter: createGymEncounter(1),
  });
  const result = resolveWorkshopBattle(state, { kind: "move", moveId: "signature" }, () => 0.5);
  assert.equal(result.status, "won");
  assert.equal(result.state.encounter, null);
  assert.equal(result.state.badges, 1);
  assert.deepEqual(result.drops, { ball: 2, potion: 2 });
  assert.equal(result.expGained > 0, true);
  // 入参不被修改。
  assert.equal(state.badges, 0);
  assert.notEqual(state.encounter, null);
});

test("精灵球捕捉成功入队，道馆战禁止使用精灵球", () => {
  const pet = createPet({ lineKey: "verdant", tier: 1, level: 5 });
  const wild = createWildEncounter("ash", () => 0);
  assert.ok(wild);
  const state = workshopState({
    starter: "verdant",
    party: [pet],
    activePetId: pet.id,
    encounter: { ...wild, hp: 1 },
  });
  const result = resolveWorkshopBattle(state, { kind: "ball" }, () => 0);
  assert.equal(result.status, "captured");
  assert.equal(result.state.encounter, null);
  assert.equal(result.state.items.ball, state.items.ball - 1);
  assert.equal(result.captured?.to, "party");
  assert.equal(result.state.party.length, 2);
  assert.equal(result.state.dex.includes("ember:1"), true);

  const gymState = workshopState({
    starter: "verdant",
    party: [pet],
    activePetId: pet.id,
    encounter: createGymEncounter(1),
  });
  assert.throws(() => resolveWorkshopBattle(gymState, { kind: "ball" }), /道馆战不能使用精灵球/);
});

test("防御回合倒地自动换下一只，无人可换判负", () => {
  const front = createPet({ lineKey: "ember", tier: 1, level: 1, hp: 1 });
  const backup = createPet({ lineKey: "ember", tier: 1, level: 10 });
  const strong = createGymEncounter(3);
  assert.ok(strong);

  const withBackup = workshopState({
    starter: "ember",
    party: [front, backup],
    activePetId: front.id,
    encounter: strong,
  });
  const switched = resolveWorkshopBattle(withBackup, { kind: "guard" }, sequence([0, 0]));
  assert.equal(switched.status, "ongoing");
  assert.equal(switched.state.activePetId, backup.id);
  assert.equal(switched.state.party[0].hp, 0);
  assert.equal(switched.events.some((event) => event.text.includes("派出")), true);

  const alone = workshopState({
    starter: "ember",
    party: [front],
    activePetId: front.id,
    encounter: strong,
  });
  const lost = resolveWorkshopBattle(alone, { kind: "guard" }, sequence([0, 0]));
  assert.equal(lost.status, "lost");
  assert.equal(lost.state.encounter, null);
  assert.equal(lost.state.party[0].hp, 0);
});

// ---------------------------------------------------------------- 灵宠冒险地图

const MAP_LIMITS = { maxSteps: 600, maxEncounters: 4, maxPathSteps: 96 };

const close = (actual: number, expected: number) => Math.abs(actual - expected) < 1e-9;

/** 造一块齐刷刷的同种地貌，专门用来验概率与速度口径。 */
function flatField(kind: number, rate = 1): WorkshopField {
  const cols = 5;
  const rows = 5;
  return {
    areaKey: "ash",
    seed: 0,
    cols,
    rows,
    tile: 32,
    terrain: new Array<number>(cols * rows).fill(kind),
    worldW: cols * 32,
    worldH: rows * 32,
    camp: { tx: 1, ty: 1 },
    gym: { tx: 3, ty: 3 },
    rate,
  };
}

function firstSolid(field: WorkshopField): { tx: number; ty: number } | null {
  for (let ty = 0; ty < field.rows; ty += 1) {
    for (let tx = 0; tx < field.cols; tx += 1) {
      if (fieldHitsSolid(field, (tx + 0.5) * field.tile, (ty + 0.5) * field.tile)) return { tx, ty };
    }
  }
  return null;
}

test("走位路径只认合法游程，同向合并、越界夹掉", () => {
  assert.deepEqual(
    sanitizeWalkPath([[1, 3], [1, 4], [7, 2], [-1, 5], [0, 0], [2, 200]], 96),
    // 7 号方向和负方向都不存在，0 步不算走路；单条游程最长 64 格
    [[1, 7], [2, 64]],
  );
  assert.deepEqual(sanitizeWalkPath([[0, 50], [1, 50]], 60), [[0, 50], [1, 10]]);
  assert.deepEqual(sanitizeWalkPath("nope", 96), []);
  assert.deepEqual(sanitizeWalkPath([[1, 10]], 0), []);

  const path: WorkshopWalkPath = [];
  pushWalkStep(path, 2);
  pushWalkStep(path, 2);
  pushWalkStep(path, 0);
  assert.deepEqual(path, [[2, 2], [0, 1]]);
});

test("同一份「区域 + 种子」永远算出同一张图", () => {
  const field = workshopFieldFor("grove", 20261112);
  assert.equal(workshopFieldFor("grove", 20261112), field);
  assert.equal(field.areaKey, "grove");
  assert.equal(field.seed, 20261112);
  // 未知区域退回默认区，种子换一张图就换一片地貌
  assert.equal(workshopFieldFor("nowhere", 1).areaKey, "ash");
  assert.notEqual(workshopFieldFor("grove", 20261113).terrain.join(), field.terrain.join());

  for (const seed of [1, 9_876_543, 42]) {
    for (const areaKey of ["ash", "shore", "grove", "spire"]) {
      const item = workshopFieldFor(areaKey, seed);
      assert.equal(item.rate > 0, true);
      // 外圈全是岩石，走不出这张图
      assert.equal(fieldTileAt(item, 0, 0), WORKSHOP_TILE_ROCK);
      assert.equal(fieldTileAt(item, -1, 12), WORKSHOP_TILE_ROCK);
      // 营地与道馆各自占位，且营地一定走得通道馆
      assert.equal(fieldTileAt(item, item.camp.tx, item.camp.ty), WORKSHOP_TILE_CAMP);
      assert.equal(fieldTileAt(item, item.gym.tx, item.gym.ty), WORKSHOP_TILE_GYM);
      assert.equal(fieldReachable(item)[item.gym.ty * item.cols + item.gym.tx], true);
    }
  }
});

test("地貌决定遇敌率、移速与脚底碰撞", () => {
  const middle = { x: 2.5 * 32, y: 2.5 * 32 };
  assert.equal(fieldEncounterChanceAt(flatField(WORKSHOP_TILE_TALL), 2, 2), 0.16);
  assert.equal(fieldEncounterChanceAt(flatField(WORKSHOP_TILE_GRASS), 2, 2), 0.05);
  assert.equal(fieldEncounterChanceAt(flatField(WORKSHOP_TILE_PATH), 2, 2), 0.015);
  for (const kind of [WORKSHOP_TILE_CAMP, WORKSHOP_TILE_GYM, WORKSHOP_TILE_WATER, WORKSHOP_TILE_TREE]) {
    assert.equal(fieldEncounterChanceAt(flatField(kind), 2, 2), 0);
  }
  // 区域倍率放大遇敌率：星塔的高草丛
  assert.equal(close(fieldEncounterChanceAt(flatField(WORKSHOP_TILE_TALL, 1.25), 2, 2), 0.2), true);
  assert.equal(fieldEncounterChanceAt(flatField(WORKSHOP_TILE_GRASS), -3, 9), 0);

  assert.equal(fieldSpeedAt(flatField(WORKSHOP_TILE_TALL), middle.x, middle.y), 0.78);
  assert.equal(fieldSpeedAt(flatField(WORKSHOP_TILE_PATH), middle.x, middle.y), 1.18);
  assert.equal(fieldSpeedAt(flatField(WORKSHOP_TILE_GRASS), middle.x, middle.y), 1);

  // 20 px 的碰撞盒：贴着水边走不进去，踩上去才撞
  const pond = flatField(WORKSHOP_TILE_GRASS);
  pond.terrain[2 * pond.cols + 2] = WORKSHOP_TILE_WATER;
  assert.equal(fieldHitsSolid(pond, middle.x, middle.y), true);
  assert.equal(fieldHitsSolid(pond, 1.5 * 32, middle.y), false);
  assert.equal(fieldHitsSolid(pond, 0, 0), true);
});

test("第几步的随机流只由种子决定，服务端可从任意一步重放", () => {
  const take = (seed: number, step: number) => {
    const random = fieldStepRandom(seed, step);
    return [random(), random(), random()];
  };
  assert.deepEqual(take(1234, 7), take(1234, 7));
  assert.notDeepEqual(take(1234, 7), take(1234, 8));
  assert.notDeepEqual(take(1234, 7), take(1235, 7));
});

test("分段重放与整段重放算出同一个游标", () => {
  const path: WorkshopWalkPath = [[1, 5], [2, 3], [1, 4]];
  let compared = 0;
  for (let seed = 1; seed <= 12; seed += 1) {
    const run = newWorkshopRun({ areaKey: "ash", seed, now: 0 });
    assert.deepEqual({ tx: run.tx, ty: run.ty }, workshopFieldFor("ash", seed).camp);
    assert.deepEqual(run, normalizeWorkshopRun(run));

    const whole = replayWorkshopWalk(run, path, MAP_LIMITS);
    const head = replayWorkshopWalk(run, path.slice(0, 1), MAP_LIMITS);
    // 中途遇敌会打断这条路径，只比两端都走完的样本
    if (whole.kind !== "ok" || head.kind !== "ok") continue;
    const tail = replayWorkshopWalk(head.run, path.slice(1), MAP_LIMITS);
    assert.deepEqual(
      { tx: tail.run.tx, ty: tail.run.ty, steps: tail.run.steps, encounters: tail.run.encounters },
      { tx: whole.run.tx, ty: whole.run.ty, steps: whole.run.steps, encounters: whole.run.encounters },
    );
    assert.equal(tail.consumed + head.consumed, whole.consumed);
    compared += 1;
  }
  assert.equal(compared > 0, true);
});

test("撞墙的那一步不动也不摇骰，走满上限立刻收兵", () => {
  const start = newWorkshopRun({ areaKey: "grove", seed: 4242, now: 0 });
  const loop: WorkshopWalkPath = [[1, 300], [2, 300], [3, 300], [0, 300]];

  // 遇敌额度用尽：下一步都不迈，直接判收兵
  const drained: WorkshopRun = { ...start, encounters: 4 };
  assert.deepEqual(replayWorkshopWalk(drained, loop, MAP_LIMITS), {
    kind: "capped",
    run: drained,
    consumed: 1,
    reason: "encounters",
  });
  // 步数闸门也在摇骰之前查，免得走满还多摇一只
  const tired: WorkshopRun = { ...start, steps: 600 };
  assert.deepEqual(replayWorkshopWalk(tired, loop, MAP_LIMITS), {
    kind: "capped",
    run: tired,
    consumed: 1,
    reason: "steps",
  });

  // 门口那条路走满 1200 步也不会越界，且服务端算的遇敌次数不会超过上限
  const long = replayWorkshopWalk(start, loop, { ...MAP_LIMITS, maxSteps: 120 });
  assert.equal(long.run.steps <= 120, true);
  assert.equal(long.run.encounters <= MAP_LIMITS.maxEncounters, true);
  if (long.kind === "encounter") {
    assert.equal(long.encounter.kind, "wild");
    assert.equal(long.run.encounters, 1);
  }

  // 一路往图外的岩石围墙上挤：顶多迈出营地门口那两格
  const wall = replayWorkshopWalk(start, [[3, 40]], MAP_LIMITS);
  assert.equal(wall.run.ty, start.ty);
  assert.equal(wall.run.tx >= 1, true);
  assert.equal(wall.run.steps <= 2, true);
});

test("脏游标回营地：站在树里或图外都按同一张图夹回来", () => {
  const field = workshopFieldFor("ash", 555);
  const clean = normalizeWorkshopRun(newWorkshopRun({ areaKey: "ash", seed: 555, now: 0 }));
  assert.deepEqual({ tx: clean?.tx, ty: clean?.ty }, field.camp);

  const outside = normalizeWorkshopRun({
    areaKey: "ash",
    seed: 555,
    tx: 9_999,
    ty: -4,
    steps: 1e9,
    encounters: -2,
    startedAt: 0,
  });
  assert.equal(outside !== null && outside.tx <= field.cols - 1 && outside.ty >= 0, true);
  assert.equal(outside !== null && outside.steps <= 1_000_000 && outside.encounters === 0, true);
  // 未知区域退回默认图，游标也跟着换图夹
  assert.equal(normalizeWorkshopRun({ ...outside!, areaKey: "nowhere" })?.areaKey, "ash");

  const solid = firstSolid(field);
  assert.notEqual(solid, null);
  if (solid) {
    const sunk = normalizeWorkshopRun({ ...field.camp, areaKey: "ash", seed: 555, steps: 12, encounters: 1, startedAt: 0, tx: solid.tx, ty: solid.ty });
    assert.deepEqual({ tx: sunk?.tx, ty: sunk?.ty }, field.camp);
  }
  assert.equal(normalizeWorkshopRun(null), null);
});

test("探险存档结构非法就当作没进图，旧字段名照样读回", () => {
  assert.equal(normalizeWorkshopRunShape(null), null);
  assert.equal(normalizeWorkshopRunShape("x"), null);
  assert.equal(normalizeWorkshopRunShape({ seed: 1 }), null);
  assert.equal(normalizeWorkshopRunShape({ areaKey: "ash", seed: -3 }), null);
  const row = normalizeWorkshopRunShape({
    areaKey: "shore",
    seed: "88",
    tx: -5,
    ty: 1e9,
    steps: 3.9,
    encounters: "2",
  });
  assert.deepEqual(
    row && { areaKey: row.areaKey, seed: row.seed, tx: row.tx, ty: row.ty, steps: row.steps, encounters: row.encounters },
    { areaKey: "shore", seed: 88, tx: 0, ty: 9_999, steps: 3, encounters: 2 },
  );

  const legacy = normalizeWorkshopState({ day: WORKSHOP_DAY, exploresToday: 3 }, WORKSHOP_DAY);
  assert.equal(legacy.entersToday, 3);
  assert.equal(legacy.run, null);
  const withRun = normalizeWorkshopState(
    { day: WORKSHOP_DAY, run: { areaKey: "ash", seed: 5, tx: 1, ty: 2, steps: 3, encounters: 1 } },
    WORKSHOP_DAY,
  );
  assert.deepEqual(
    withRun.run && [withRun.run.areaKey, withRun.run.tx, withRun.run.ty, withRun.run.steps],
    ["ash", 1, 2, 3],
  );
  assert.equal(normalizeWorkshopState({ day: WORKSHOP_DAY, run: { areaKey: "", seed: 5 } }, WORKSHOP_DAY).run, null);
});

test("单趟上限进配置并喂给走位闸门", () => {
  assert.equal(DEFAULT_WORKSHOP_CONFIG.runMaxSteps, 600);
  assert.equal(DEFAULT_WORKSHOP_CONFIG.runMaxEncounters, 4);
  assert.equal(sanitizeWorkshopConfig({ runMaxSteps: 5, runMaxEncounters: 0 }).runMaxSteps, 20);
  assert.equal(sanitizeWorkshopConfig({ runMaxEncounters: 1e9 }).runMaxEncounters, 50);
  const config = sanitizeWorkshopConfig({ runMaxSteps: 300, runMaxEncounters: 6 });
  assert.deepEqual(workshopWalkLimits(config), { maxSteps: 300, maxEncounters: 6, maxPathSteps: 96 });
});

// ---------------------------------------------------------------- 星图共鸣

test("观星颜色等概率、亮度 60 / 30 / 10", () => {
  assert.deepEqual(rollStarStone(sequence([0, 0])), { color: "blue", brightness: 1 });
  assert.deepEqual(rollStarStone(sequence([0.34, 0.599999])), { color: "teal", brightness: 1 });
  assert.deepEqual(rollStarStone(sequence([0.67, 0.6])), { color: "gold", brightness: 2 });
  assert.deepEqual(rollStarStone(sequence([0.999999, 0.9])), { color: "gold", brightness: 3 });
});

test("星图配置兼容旧字段并把票价对齐券面", () => {
  const legacy = sanitizeCollectionConfig({
    dailyBoxes: 4,
    openCostCredits: 3,
    couponUnitCredits: 2,
  });
  assert.equal(legacy.dailyObserves, 4);
  // 3 / 2 → 1.5 张，四舍五入 2 张 → 4 cr。
  assert.equal(legacy.observeCostCredits, 4);

  const clamped = sanitizeCollectionConfig({
    observeCostCredits: 5,
    couponUnitCredits: 2,
    dailyObserves: 0,
    resonanceReward: -3,
    rewardValidDays: 0,
  });
  // 5 / 2 → 2.5 张，四舍五入 3 张 → 6 cr。
  assert.equal(clamped.observeCostCredits, 6);
  assert.equal(clamped.dailyObserves, 1);
  assert.equal(clamped.resonanceReward, 0);
  assert.equal(clamped.rewardValidDays, 1);
  assert.equal(clamped.setRewards.length, CONSTELLATIONS.length);
});

test("嵌入星石只认同色且亮度足够，优先消耗刚好够的一档", () => {
  const state = emptyCollectionState("2026-11-12");
  const lowBlue = CONSTELLATIONS[0].nodes[0];
  const midBlue = CONSTELLATIONS[0].nodes[3];
  const highGold = CONSTELLATIONS[0].nodes[4];

  assert.equal(placeStarStone(state, lowBlue.id).ok, false);
  assert.equal(placeStarStone(state, highGold.id).ok, false);

  addStones(state, "blue", 2);
  addStones(state, "blue", 1, 2);
  assert.deepEqual(placeStarStone(state, lowBlue.id), { ok: true, brightness: 1 });
  assert.equal(starCount(state, "blue", 1), 1);
  assert.equal(starCount(state, "blue", 2), 1);

  assert.deepEqual(placeStarStone(state, midBlue.id), { ok: true, brightness: 2 });
  assert.equal(starCount(state, "blue", 2), 0);
  assert.equal(placeStarStone(state, lowBlue.id).ok, false);

  // 高亮度星石可以补低亮度星位，只消耗刚好够的那一颗。
  const spare = emptyCollectionState("2026-11-12");
  addStones(spare, "blue", 3);
  assert.deepEqual(placeStarStone(spare, CONSTELLATIONS[0].nodes[1].id), {
    ok: true,
    brightness: 3,
  });
  assert.equal(starCount(spare, "blue", 3), 0);
});

test("星座 9 个星位全亮才算完成", () => {
  const aurora = CONSTELLATIONS[0];
  const state = emptyCollectionState("2026-11-12");
  state.nodes = aurora.nodes.slice(0, 8).map((node) => node.id);
  assert.deepEqual(litConstellations(state), []);
  state.nodes.push(aurora.nodes[8].id);
  assert.deepEqual(litConstellations(state), [aurora.key]);
});

test("旧图鉴存档换算成星石并按新轮次保留进度", () => {
  const abyss = CONSTELLATIONS.find((item) => item.key === "abyss");
  assert.ok(abyss);
  const state = normalizeCollectionState(
    {
      day: "2026-11-12",
      boxesToday: 4,
      dust: 7,
      owned: [
        "aurora/shard",
        "aurora/dust",
        "abyss/pearl",
        "abyss/conch",
        "abyss/coral",
        "abyss/scale",
        "abyss/moon",
        "abyss/crown",
      ],
    },
    "2026-11-12",
  );
  assert.equal(state.observesToday, 4);
  assert.equal(state.shards, 7);
  // 极光座前两件旧藏品稀有度对应 1 级星石。
  assert.equal(starCount(state, "blue", 1), 2);
  // 集齐的深海座直接点亮整张星座，不再拆成星石。
  assert.equal(abyss.nodes.every((node) => state.nodes.includes(node.id)), true);
  assert.equal(state.stones.teal.every((count) => count === 0), true);
});

test("存档只保留已知星位并夹住星石数量", () => {
  const state = normalizeCollectionState({
    stones: { blue: [-2, 3, "x"], teal: "no", gold: [1] },
    nodes: ["aurora-1", "ghost", 42, "aurora-1"],
  });
  assert.deepEqual(state.stones.blue, [0, 3, 0]);
  assert.deepEqual(state.stones.teal, [0, 0, 0]);
  assert.deepEqual(state.stones.gold, [1, 0, 0]);
  assert.deepEqual(state.nodes, ["aurora-1"]);
});

test("星座完成奖励按固定顺序补齐，未知星座被忽略", () => {
  assert.deepEqual(
    sanitizeCollectionSetRewards([{ set: "abyss", reward: 20 }, { set: "ghost", reward: 99 }]),
    [
      { set: "aurora", reward: 8 },
      { set: "abyss", reward: 20 },
      { set: "grove", reward: 30 },
    ],
  );
  // 重复行只认第一条。
  assert.deepEqual(
    sanitizeCollectionSetRewards([
      { set: "grove", reward: 40 },
      { set: "grove", reward: 80 },
    ]).find((row) => row.set === "grove"),
    { set: "grove", reward: 40 },
  );
});
