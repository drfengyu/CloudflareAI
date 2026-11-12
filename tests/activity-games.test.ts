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
