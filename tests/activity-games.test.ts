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
  generateTrialDungeon,
  parseTrialDungeon,
  simulateTrialDungeon,
  type TrialDungeon,
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
  COLLECTION_SETS,
  collectionItemKey,
  completedSets,
  isSetComplete,
  missingItems,
  rollCollectionItem,
  sanitizeCollectionConfig,
  sanitizeCollectionSetRewards,
} from "../lib/collection/config";

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
  return { version: 4, seed: 1, heroHp: 100, floors };
}

test("浮游城生成：每层两个野区门与一间层主房，同种子重放同一张塔", () => {
  const dungeon = generateTrialDungeon(5, seeded(11));
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

test("旧版答题 / 单排波次 / 旧地下城对局不胜任浮游城", () => {
  assert.equal(parseTrialDungeon(null), null);
  assert.equal(parseTrialDungeon(JSON.stringify([{ prompt: "1+1", answer: 2 }])), null);
  assert.equal(parseTrialDungeon(JSON.stringify({ version: 2, seed: 1, heroHp: 80, waves: [] })), null);
  assert.equal(
    parseTrialDungeon(
      JSON.stringify({ version: 3, seed: 1, heroHp: 100, floors: [{ rooms: [] }] }),
    ),
    null,
  );

  const generated = generateTrialDungeon(3, seeded(5));
  assert.deepEqual(parseTrialDungeon(JSON.stringify(generated)), generated);
});

test("宝箱立即给装备，层主经验会升级并抬升生命上限", () => {
  const dungeon = manualDungeon([
    {
      rooms: [
        { kind: "treasure", title: "宝箱", hint: "", relic: "bloodpact" },
        { kind: "rest", title: "营地", hint: "" },
      ],
      boss: dummyBoss(),
    },
    {
      rooms: [
        { kind: "treasure", title: "宝箱", hint: "", relic: "whetstone" },
        { kind: "rest", title: "营地", hint: "" },
      ],
      boss: dummyBoss(),
    },
  ]);

  const result = simulateTrialDungeon(dungeon, [
    { t: "enter", i: 0 },
    { t: "boss" },
    { t: "skill", s: "slash" },
    { t: "boss" },
    { t: "skill", s: "slash" },
  ]);
  assert.deepEqual(result.relics, ["bloodpact"]);
  // 生命结晶 115，击败 1F 层主（45 EXP）升到 2 级再加 10。
  assert.equal(result.heroMaxHp, 125);
  assert.equal(result.heroHp, 125);
  assert.equal(result.level, 2);
  assert.equal(result.floorsCleared, 2);
  assert.equal(result.status, "cleared");
  assert.equal(result.victory, true);
  assert.equal(result.events[0].relic, "bloodpact");
  assert.equal(result.events[1].kind, "boss");
});

test("精英装备在击破后才生效，营地按上限回血，可以直接挑战层主", () => {
  const dungeon = manualDungeon([
    {
      rooms: [
        {
          kind: "elite",
          title: "精英木桩",
          hint: "",
          relic: "whetstone",
          wave: dummyWave({ hp: 1, atk: 30, pattern: ["attack"] }),
        },
        { kind: "rest", title: "营地", hint: "" },
      ],
      boss: dummyBoss(),
    },
    {
      rooms: [{ kind: "rest", title: "营地", hint: "" }],
      boss: dummyBoss(),
    },
  ]);

  const entered = simulateTrialDungeon(dungeon, [{ t: "enter", i: 0 }]);
  assert.deepEqual(entered.relics, []);
  assert.equal(entered.status, "fighting");

  const afterFight = simulateTrialDungeon(dungeon, [
    { t: "enter", i: 0 },
    { t: "skill", s: "guard" },
    { t: "skill", s: "slash" },
  ]);
  assert.deepEqual(afterFight.relics, ["whetstone"]);
  assert.equal(afterFight.status, "choosing");
  assert.equal(afterFight.fieldCleared, true);
  // 守势格挡 14，吃 16 伤害 → 84；清怪回复 6 → 90。
  assert.equal(afterFight.heroHp, 90);

  const rested = simulateTrialDungeon(dungeon, [
    { t: "enter", i: 0 },
    { t: "skill", s: "guard" },
    { t: "skill", s: "slash" },
    { t: "boss" },
    { t: "skill", s: "slash" },
    { t: "enter", i: 0 },
  ]);
  // 层主经验升到 2 级（上限 110，清怪与升级共回 16 → 106），营地补到满。
  assert.equal(rested.heroMaxHp, 110);
  assert.equal(rested.heroHp, rested.heroMaxHp);
  assert.equal(rested.events[2].healed, 4);

  const skipped = simulateTrialDungeon(dungeon, [{ t: "boss" }]);
  assert.equal(skipped.status, "fighting");
  assert.equal(skipped.current?.boss, true);
});

test("同一动作序列可重复重放；非法动作兜底为第一扇门 / 斩击", () => {
  const dungeon = manualDungeon([
    {
      rooms: [{ kind: "fight", title: "木桩", hint: "", wave: dummyWave({ hp: 400, atk: 5 }) }],
      boss: dummyBoss(),
    },
    {
      rooms: [{ kind: "fight", title: "木桩", hint: "", wave: dummyWave({ hp: 400, atk: 5 }) }],
      boss: dummyBoss(),
    },
  ]);
  const actions = [
    { t: "enter", i: 0 },
    ...Array.from({ length: 40 }, (_, i) => ({
      t: "skill",
      s: i % 5 === 0 ? "burst" : i % 3 === 0 ? "guard" : "slash",
    })),
    { t: "boss" },
    { t: "skill", s: "slash" },
  ];
  const first = simulateTrialDungeon(dungeon, actions);
  assert.deepEqual(simulateTrialDungeon(dungeon, actions), first);
  assert.ok(first.turns > 0);
  assert.equal(first.floorsCleared >= 1, true);

  const ignored = simulateTrialDungeon(dungeon, ["garbage", 1, null]);
  assert.equal(ignored.status, "choosing");
  assert.equal(ignored.turns, 0);

  const fallback = simulateTrialDungeon(dungeon, [{ t: "enter", i: 99 }]);
  assert.equal(fallback.events.length, 1);
  assert.equal(fallback.events[0].floor, 1);
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

// ---------------------------------------------------------------- 星匣图鉴

test("开匣先等概率选星匣再按权重抽藏品", () => {
  assert.deepEqual(rollCollectionItem(sequence([0, 0])), {
    setKey: COLLECTION_SETS[0].key,
    itemKey: COLLECTION_SETS[0].items[0].key,
  });
  assert.deepEqual(rollCollectionItem(sequence([0.99, 0])), {
    setKey: COLLECTION_SETS[COLLECTION_SETS.length - 1].key,
    itemKey: COLLECTION_SETS[COLLECTION_SETS.length - 1].items[0].key,
  });
  // 星匣内最后一个位置是 15 权重的王冠，随机数接近 1 时落在它上面。
  assert.deepEqual(rollCollectionItem(sequence([0, 0.999999])), {
    setKey: COLLECTION_SETS[0].key,
    itemKey: "crown",
  });
  assert.equal(COLLECTION_SETS.every((set) => set.items.length === 6), true);
});

test("集齐判定、缺件列表与集齐奖励补全", () => {
  const aurora = COLLECTION_SETS[0];
  const owned = new Set(
    aurora.items.slice(0, 5).map((item) => collectionItemKey(aurora.key, item.key)),
  );

  assert.equal(isSetComplete(owned, aurora.key), false);
  assert.deepEqual(completedSets(owned), []);
  assert.deepEqual(
    missingItems(owned, aurora.key).map((item) => item.key),
    [aurora.items[5].key],
  );

  owned.add(collectionItemKey(aurora.key, aurora.items[5].key));
  assert.equal(isSetComplete(owned, aurora.key), true);
  assert.deepEqual(completedSets(owned), [aurora.key]);
  assert.deepEqual(missingItems(owned, aurora.key), []);
});

test("图鉴集齐奖励按固定星匣顺序补齐，未知星匣被忽略", () => {
  assert.deepEqual(sanitizeCollectionSetRewards([{ set: "abyss", reward: 20 }, { set: "ghost", reward: 99 }]), [
    { set: "aurora", reward: 8 },
    { set: "abyss", reward: 20 },
    { set: "grove", reward: 30 },
  ]);
  // 重复行只认第一条。
  assert.deepEqual(
    sanitizeCollectionSetRewards([
      { set: "grove", reward: 40 },
      { set: "grove", reward: 80 },
    ]).find((row) => row.set === "grove"),
    { set: "grove", reward: 40 },
  );
});

test("图鉴配置对齐票价并夹住边界值", () => {
  const config = sanitizeCollectionConfig({
    openCostCredits: 5,
    couponUnitCredits: 2,
    dailyBoxes: 0,
    duplicateDust: -3,
    dustPerItem: 0,
    rewardValidDays: 0,
  });
  // 5 / 2 → 2.5 四舍五入为 3 张 → 6 cr。
  assert.equal(config.openCostCredits, 6);
  assert.equal(config.dailyBoxes, 1);
  assert.equal(config.duplicateDust, 0);
  assert.equal(config.dustPerItem, 1);
  assert.equal(config.rewardValidDays, 1);
  assert.equal(config.setRewards.length, COLLECTION_SETS.length);
});
