import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_TRIAL_CONFIG,
  sanitizeTrialConfig,
  trialRewardFor,
  trialTimeBounds,
  type TrialConfig,
} from "../lib/trial/config";
import {
  TRIAL_INPUT,
  createTrialGame,
  generateTrialDungeon,
  parseTrialDungeon,
  simulateTrialDungeon,
  stepTrialGame,
  trialInteractTarget,
  type TrialDungeon,
  type TrialGameState,
  type TrialWave,
} from "../lib/trial/dungeon";
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
  normalizeWorkshopState,
  type WorkshopState,
} from "../lib/workshop/state";
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

/** 固定种子的 LCG：同一个种子每次跑出同一串随机数，便于断言边界。 */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(values.length - 1, index++)];
}

function trial(overrides: Partial<TrialConfig> = {}): TrialConfig {
  return { ...DEFAULT_TRIAL_CONFIG, ...overrides };
}

// ---------------------------------------------------------------- 每日试炼

const dummyWave = (overrides: Partial<TrialWave> = {}): TrialWave => ({
  key: "dummy",
  name: "木桩",
  title: "测试用",
  shape: "mire",
  hp: 1,
  atk: 5,
  pattern: ["attack"],
  ...overrides,
});

const dummyBoss = (wave: Partial<TrialWave> = {}): TrialDungeon["floors"][number]["boss"] => ({
  kind: "fight",
  title: "层主房",
  hint: "",
  wave: dummyWave(wave),
});

function manualDungeon(floors: TrialDungeon["floors"]): TrialDungeon {
  return { version: 5, seed: 1, heroHp: 100, floors };
}

/** 一路向右走到门前，再按一次 F 进门。 */
function enterFirstRoom(dungeon: TrialDungeon, frames: number[]): TrialGameState {
  const state = createTrialGame(dungeon);
  let n = 0;
  while (trialInteractTarget(state) === null && n < 600) {
    frames.push(TRIAL_INPUT.right);
    stepTrialGame(state, TRIAL_INPUT.right);
    n += 1;
  }
  assert.ok(trialInteractTarget(state), "能走到第一扇门前");
  frames.push(TRIAL_INPUT.interact);
  stepTrialGame(state, TRIAL_INPUT.interact);
  return state;
}

/** 走到斩击距离内，站定出刀。 */
function approachEnemy(state: TrialGameState, frames: number[]): void {
  let n = 0;
  while (
    state.phase === "fight" &&
    state.enemy !== null &&
    state.enemy.x - state.hero.x > 50 &&
    n < 900
  ) {
    frames.push(TRIAL_INPUT.right);
    stepTrialGame(state, TRIAL_INPUT.right);
    n += 1;
  }
  assert.ok(state.enemy);
  assert.ok(state.enemy.x - state.hero.x <= 50, "能走到斩击距离");
}

/** 交替按松斩击，直到这场战斗结束。 */
function fightUntilOver(state: TrialGameState, frames: number[], limit = 1200): void {
  let n = 0;
  while (state.phase === "fight" && n < limit) {
    const mask = n % 2 === 0 ? TRIAL_INPUT.attack : 0;
    frames.push(mask);
    stepTrialGame(state, mask);
    n += 1;
  }
  assert.notEqual(state.phase, "fight", "战斗在限定帧数内结束");
}

/** 走到层主门前按 F，进入层主战。 */
function walkToBossDoor(state: TrialGameState, frames: number[]): void {
  let n = 0;
  while (trialInteractTarget(state)?.kind !== "boss" && n < 900) {
    frames.push(TRIAL_INPUT.right);
    stepTrialGame(state, TRIAL_INPUT.right);
    n += 1;
  }
  assert.equal(trialInteractTarget(state)?.kind, "boss");
  frames.push(TRIAL_INPUT.interact);
  stepTrialGame(state, TRIAL_INPUT.interact);
}

test("浮游城生成：每层两个野区门与一间层主房，同种子重放同一张塔", () => {
  const dungeon = generateTrialDungeon(5, seeded(11));
  assert.equal(dungeon.version, 5);
  assert.equal(dungeon.floors.length, 5);
  for (const floor of dungeon.floors) {
    assert.equal(floor.rooms.length, 2);
    assert.ok(floor.rooms.some((room) => room.kind === "fight" || room.kind === "elite"));
    assert.ok(floor.boss.wave);
    assert.equal(floor.boss.wave?.enrage, true);
    for (const room of floor.rooms) {
      if (room.kind === "treasure" || room.kind === "elite") assert.ok(room.relic);
      if (room.kind !== "treasure" && room.kind !== "rest") assert.ok(room.wave);
    }
  }
  assert.deepEqual(generateTrialDungeon(5, seeded(11)), dungeon);
  assert.equal(generateTrialDungeon(99, seeded(2)).floors.length, 7);
  assert.equal(generateTrialDungeon(0, seeded(2)).floors.length, 1);
});

test("旧版答题 / 回合制对局不胜任动作版浮游城", () => {
  assert.equal(parseTrialDungeon(null), null);
  assert.equal(parseTrialDungeon(JSON.stringify([{ prompt: "1+1", answer: 2 }])), null);
  assert.equal(parseTrialDungeon(JSON.stringify({ version: 2, seed: 1, heroHp: 80, waves: [] })), null);
  assert.equal(
    parseTrialDungeon(
      JSON.stringify({ version: 3, seed: 1, heroHp: 100, floors: [{ rooms: [] }] }),
    ),
    null,
  );
  const oldTurnBased = { ...generateTrialDungeon(3, seeded(5)), version: 4 };
  assert.equal(parseTrialDungeon(JSON.stringify(oldTurnBased)), null);

  const generated = generateTrialDungeon(3, seeded(5));
  assert.deepEqual(parseTrialDungeon(JSON.stringify(generated)), generated);
});

test("走进门、击破野怪与层主后通关，整串输入帧可被重放", () => {
  const dungeon = manualDungeon([
    {
      rooms: [
        { kind: "fight", title: "木桩", hint: "", wave: dummyWave({ atk: 0 }) },
        { kind: "rest", title: "营地", hint: "" },
      ],
      boss: dummyBoss({ name: "层主", atk: 0 }),
    },
  ]);
  const frames: number[] = [];
  const state = enterFirstRoom(dungeon, frames);
  assert.equal(state.phase, "fight");
  assert.ok(state.enemy);

  approachEnemy(state, frames);
  fightUntilOver(state, frames);
  assert.equal(state.fieldCleared, true);
  assert.equal(state.kills, 1);
  assert.equal(state.phase, "explore");

  walkToBossDoor(state, frames);
  assert.equal(state.phase, "fight");
  approachEnemy(state, frames);
  fightUntilOver(state, frames);
  assert.equal(state.phase, "won");

  const result = simulateTrialDungeon(dungeon, frames);
  assert.equal(result.status, "cleared");
  assert.equal(result.victory, true);
  assert.equal(result.floorsCleared, 1);
  assert.equal(result.ticks, frames.length);
  assert.deepEqual(simulateTrialDungeon(dungeon, frames), result);
});

test("宝箱进门就给装备，层主经验升级并抬升生命上限", () => {
  const dungeon = manualDungeon([
    {
      rooms: [
        { kind: "treasure", title: "宝箱", hint: "", relic: "bloodpact" },
        { kind: "rest", title: "营地", hint: "" },
      ],
      boss: dummyBoss({ name: "层主", atk: 0 }),
    },
  ]);
  const frames: number[] = [];
  const state = enterFirstRoom(dungeon, frames);
  assert.deepEqual(state.hero.relics, ["bloodpact"]);
  assert.equal(state.hero.maxHp, 115);
  assert.equal(state.hero.hp, 115);
  assert.equal(state.fieldCleared, true);

  walkToBossDoor(state, frames);
  approachEnemy(state, frames);
  fightUntilOver(state, frames);
  assert.equal(state.phase, "won");
  // 层主 45 经验：1 → 2 级，再 +10 生命上限。
  assert.equal(state.hero.level, 2);
  assert.equal(state.hero.maxHp, 125);

  const result = simulateTrialDungeon(dungeon, frames);
  assert.equal(result.status, "cleared");
  assert.deepEqual(result.relics, ["bloodpact"]);
  assert.equal(result.heroMaxHp, 125);
});

test("按住格挡能把横斩伤害压到 0", () => {
  const dungeon = manualDungeon([
    {
      rooms: [
        { kind: "fight", title: "木桩", hint: "", wave: dummyWave({ hp: 999, atk: 12 }) },
        { kind: "rest", title: "营地", hint: "" },
      ],
      boss: dummyBoss({ atk: 0 }),
    },
  ]);
  const play = (guarding: boolean) => {
    const state = createTrialGame(dungeon);
    let n = 0;
    while (trialInteractTarget(state) === null && n < 600) {
      stepTrialGame(state, TRIAL_INPUT.right);
      n += 1;
    }
    stepTrialGame(state, TRIAL_INPUT.interact);
    assert.equal(state.phase, "fight");
    for (let i = 0; i < 900; i += 1) {
      stepTrialGame(state, guarding ? TRIAL_INPUT.guard : 0);
    }
    return state.hero;
  };
  const plain = play(false);
  const guarded = play(true);
  assert.ok(plain.totalTaken > 0, "不格挡会掉血");
  assert.equal(guarded.totalTaken, 0, "格挡 14 完全抵消 12 点横斩");
  assert.equal(guarded.hp, guarded.maxHp);
});

test("输入帧纯函数重放；脏帧与越界掩码不会打乱结算", () => {
  const dungeon = generateTrialDungeon(2, seeded(21));
  const frames = Array.from({ length: 300 }, (_, i) =>
    i % 11 === 0
      ? TRIAL_INPUT.jump
      : i % 3 === 0
        ? TRIAL_INPUT.right
        : i % 5 === 0
          ? TRIAL_INPUT.attack
          : 0,
  );
  const first = simulateTrialDungeon(dungeon, frames);
  assert.deepEqual(simulateTrialDungeon(dungeon, frames), first);
  assert.equal(first.ticks, frames.length);

  const dirty = simulateTrialDungeon(dungeon, ["garbage", 1, null, 999999, -5]);
  assert.equal(dirty.ticks, 5);
  assert.equal(dirty.status, "playing");
  assert.equal(dirty.floorsCleared, 0);
});

test("试炼配置：层数与档位互相约束，脏值退回可用默认", () => {
  const config = sanitizeTrialConfig({
    questionCount: 99,
    timeLimitSeconds: 1,
    dailyRuns: 0,
    runPriceCredits: 7,
    couponUnitCredits: 5,
    rewardValidDays: 0,
    tiers: [
      { correct: 3, reward: 2 },
      { correct: 3, reward: 9 },
      { correct: 20, reward: 99 },
      { correct: 1, reward: -5 },
    ],
  });

  assert.equal(config.questionCount, 7);
  assert.equal(config.timeLimitSeconds, 15);
  assert.equal(config.dailyRuns, 1);
  assert.equal(config.rewardValidDays, 1);
  // 票价按券单价对齐整张：7 → 5。
  assert.equal(config.runPriceCredits, 5);
  // 重复档位保留第一条，超出层数的被丢弃，奖励不为负。
  assert.deepEqual(config.tiers, [
    { correct: 1, reward: 0 },
    { correct: 3, reward: 2 },
  ]);
  assert.equal(sanitizeTrialConfig(null).questionCount, DEFAULT_TRIAL_CONFIG.questionCount);
});

test("试炼奖励取达到的最高一档，时间边界守住瞬交与超时", () => {
  const config = trial();
  assert.equal(trialRewardFor(config, 0), 0);
  assert.equal(trialRewardFor(config, 1), 0);
  assert.equal(trialRewardFor(config, 2), 1);
  assert.equal(trialRewardFor(config, 4), 4);
  assert.equal(trialRewardFor(config, 5), 8);
  assert.equal(trialRewardFor(config, 99), 8);

  // 默认 5 层 / 300 秒：最短 8 秒（下限），最长 305 秒。
  assert.deepEqual(trialTimeBounds(config), { minMs: 8_000, maxMs: 305_000 });
  // 每层 1.5 秒，但不超过限时；60 秒限时 → 最短 15 秒。
  assert.deepEqual(trialTimeBounds(trial({ questionCount: 10, timeLimitSeconds: 60 })), {
    minMs: 15_000,
    maxMs: 65_000,
  });
});

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
  assert.equal(state.exploresToday, 4);
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
