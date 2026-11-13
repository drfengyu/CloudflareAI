import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_TRIAL_CONFIG,
  TRIAL_MAX_FLOORS,
  sanitizeTrialConfig,
  trialRewardFor,
  type TrialConfig,
} from "../lib/trial/config";
import { SAGA_CHAPTERS } from "../lib/trial/saga/data";
import {
  SAGA_RUN_VERSION,
  SAGA_TILE_FOREST,
  SAGA_TILE_GRASS,
  SAGA_TILE_ROAD,
  type SagaCommand,
  type SagaRun,
} from "../lib/trial/saga/types";
import {
  autoPlaySagaRun,
  canEngageNode,
  createReplayState,
  generateSagaRun,
  openNodes,
  parseSagaRun,
  replaySagaRun,
  restAtInn,
  sanitizeSagaCommands,
  settleSagaRun,
} from "../lib/trial/saga/run";
import {
  fieldEncounterChanceAt,
  fieldHotspotNear,
  fieldHitsSolid,
  fieldReachable,
  fieldTileAt,
  generateSagaField,
  sagaFieldFor,
} from "../lib/trial/saga/map";
import {
  SAGA_MAX_ENCOUNTERS,
  sagaEncounterFor,
} from "../lib/trial/saga/encounter";
import {
  DEFAULT_SAGA_BANK,
  bankCreditsForGold,
  bankGoldForTcr,
  sanitizeSagaBank,
} from "../lib/trial/saga/bank";
import { SAGA_INN_PRICE_GOLD } from "../lib/trial/saga/inn";
import { generalStats, initialTrialSave } from "../lib/trial/saga/state";

function trial(overrides: Partial<TrialConfig> = {}): TrialConfig {
  return { ...DEFAULT_TRIAL_CONFIG, ...overrides };
}

function freshRun(seed = 11, nodeCount = 5): SagaRun {
  return generateSagaRun({
    activityKey: "trial-test",
    save: initialTrialSave(),
    nodeCount,
    seed,
  });
}

/** 一场必定能打赢的测试关：敌军只有 1 点兵力，用来验证结算与章节推进。 */
function easyRun(startSave = initialTrialSave()): SagaRun {
  return {
    version: SAGA_RUN_VERSION,
    kind: "saga",
    activityKey: "trial-test",
    seed: 1,
    nodes: [
      {
        kind: "boss",
        name: "测试关",
        blurb: "",
        chapter: startSave.chapter,
        enemies: [
          {
            id: "zhangjiao",
            name: "张角",
            title: "测试",
            level: 1,
            troops: 1,
            maxTroops: 1,
            force: 0,
            intellect: 0,
            defense: 0,
            speed: 0,
            tactics: [],
            color: "#000000",
            accent: "#ffffff",
            recruitable: false,
            recruitHard: false,
            boss: true,
          },
        ],
        rewardGold: 30,
        rewardExp: 40,
        enemyFormation: "yulin",
      },
    ],
    startSave,
    purchases: [],
    shopSeq: 0,
    bank: DEFAULT_SAGA_BANK,
  };
}

/** 一场必定打输的测试关：三名高速重兵敌将，一回合就能把单人队伍打空，好验证兵败后的重整。 */
function wreckedRun(): SagaRun {
  const base = easyRun();
  const template = base.nodes[0].enemies[0];
  const brute = (id: string, name: string) => ({
    ...template,
    id,
    name,
    title: "伏兵",
    troops: 9999,
    maxTroops: 9999,
    force: 400,
    intellect: 0,
    defense: 0,
    speed: 999,
    tactics: [],
    boss: false,
    recruitable: false,
    recruitHard: false,
  });
  const save = initialTrialSave();
  save.gold = 100;
  save.party = [save.party[0]];
  return {
    ...base,
    startSave: save,
    nodes: [
      {
        ...base.nodes[0],
        kind: "battle",
        name: "死地",
        rewardGold: 0,
        rewardExp: 0,
        enemies: [
          brute("dengmao", "邓茂"),
          brute("zhangliang", "张梁"),
          brute("chengyuanzhi", "程远志"),
        ],
      },
      {
        ...base.nodes[0],
        kind: "battle",
        name: "软柿子",
        enemies: [{ ...template, boss: false }],
      },
    ],
  };
}

const winCommands: SagaCommand[] = [
  {
    k: "battle",
    node: 0,
    rounds: Array.from({ length: 5 }, () => [
      { g: "liubei", a: "attack", target: 0 },
      { g: "guanyu", a: "attack", target: 0 },
      { g: "zhangfei", a: "attack", target: 0 },
    ]),
  },
];

// ---------------------------------------------------------------- 每日试炼

test("讨逆传生成：同种子同一局，节点按章节地名推进并以首领收尾", () => {
  const run = freshRun();
  assert.equal(run.version, SAGA_RUN_VERSION);
  assert.equal(run.kind, "saga");
  assert.equal(run.nodes.length, 5);
  assert.deepEqual(
    run.nodes.map((node) => node.kind),
    ["battle", "battle", "battle", "elite", "boss"],
  );
  assert.deepEqual(freshRun(), run);
  assert.equal(freshRun(12).seed, 12);

  const stages = new Set(SAGA_CHAPTERS[0].stages);
  for (const node of run.nodes) {
    assert.equal(stages.has(node.name.split("·")[0]), true, `节点地名 ${node.name} 来自章节`);
    const ids = node.enemies.map((enemy) => enemy.id);
    assert.equal(new Set(ids).size, ids.length, "同一场敌将不重复");
  }
  assert.equal(run.nodes[run.nodes.length - 1].enemies[0].id, SAGA_CHAPTERS[0].boss);

  assert.equal(freshRun(5, TRIAL_MAX_FLOORS).nodes.length, TRIAL_MAX_FLOORS);
  assert.equal(freshRun(5, 0).nodes.length, 2);
});

test("对局 JSON：版本校验严格，旧玩法与损坏数据一律当没有对局", () => {
  const run = freshRun();
  const parsed = parseSagaRun(JSON.stringify(run));
  assert.ok(parsed);
  assert.deepEqual(parsed.nodes, run.nodes);
  assert.deepEqual(parsed.startSave, run.startSave);
  assert.equal(parsed.seed, run.seed);
  assert.equal(parsed.endSave, undefined);
  assert.equal(parseSagaRun(null), null);
  assert.equal(parseSagaRun("[]"), null);
  assert.equal(parseSagaRun("not-json"), null);
  assert.equal(parseSagaRun(JSON.stringify({ ...run, version: 5 })), null);
  assert.equal(parseSagaRun(JSON.stringify({ ...run, kind: "dungeon" })), null);
  assert.equal(parseSagaRun(JSON.stringify({ ...run, activityKey: "" })), null);
  assert.equal(parseSagaRun(JSON.stringify({ ...run, nodes: [] })), null);
  assert.equal(parseSagaRun(JSON.stringify({ ...run, nodes: Array(8).fill(run.nodes[0]) })), null);
  // v5 浮游城/答题存档不会被误认成讨逆传。
  assert.equal(parseSagaRun(JSON.stringify({ version: 5, seed: 1, heroHp: 100, floors: [] })), null);
});

test("指令清洗：未知字段、军需商店与错槽装备都被丢弃", () => {
  const commands = sanitizeSagaCommands([
    { k: "formation", f: "fengshi" },
    { k: "formation", f: "bogus" },
    { k: "shop", i: "herb" },
    { k: "shop", i: "secret_medicine" },
    { k: "equip", g: "liubei", slot: "weapon", i: "guandao" },
    { k: "equip", g: "liubei", slot: "weapon", i: "cloth" },
    { k: "party", active: ["liubei", "guanyu", "zhangfei"] },
    { k: "bank", g: 100 },
    { k: "bank", g: 150 },
    { k: "bank", g: 400 },
    { k: "bank", g: -100 },
    { k: "inn" },
    {
      k: "battle",
      node: 1,
      rounds: [
        [
          { g: "liubei", a: "attack", target: 0 },
          { g: "guanyu", a: "cast", target: 0 },
          { g: "zhangfei", a: "tactic", t: "guwu" },
        ],
      ],
    },
    { k: "leave" },
    // 营地下标越界、缺失或不是数字：整条战斗指令丢弃。
    { k: "battle", node: 7, rounds: [[]] },
    { k: "battle", node: -1, rounds: [[]] },
    { k: "battle", rounds: [[]] },
    "junk",
    null,
  ]);
  assert.deepEqual(
    commands.map((command) => command.k),
    // 存金档位随每次行军的钱庄规则走，清洗阶段只挡住负数，整档校验留给重放。
    ["formation", "shop", "equip", "party", "bank", "bank", "bank", "inn", "battle", "leave"],
  );
  const battle = commands.find((command) => command.k === "battle");
  assert.ok(battle && battle.k === "battle");
  if (battle.k === "battle") {
    assert.equal(battle.node, 1);
    assert.equal(battle.rounds.length, 1);
    assert.deepEqual(
      battle.rounds[0].map((round) => round.a),
      ["attack", "tactic"],
    );
  }
  assert.deepEqual(sanitizeSagaCommands("nope"), []);
});

test("指令重放是纯函数；战斗没打完会锁住本场，不能反复重开", () => {
  const run = freshRun(21, 3);
  const idle = replaySagaRun(run, []);
  assert.equal(idle.state.scene, "field");
  assert.deepEqual(idle.state.clearedNodes, []);
  assert.equal(idle.cleared, 0);

  const commands: SagaCommand[] = [
    { k: "formation", f: "fengshi" },
    { k: "shop", i: "herb" },
    { k: "battle", node: 0, rounds: [] },
  ];
  const first = replaySagaRun(run, commands);
  assert.equal(first.state.scene, "battle");
  assert.equal(first.state.battle?.nodeName, run.nodes[0].name);
  assert.deepEqual(replaySagaRun(run, commands), first);

  const withLeave = replaySagaRun(run, [...commands, { k: "leave" }]);
  assert.equal(withLeave.state.scene, "battle");
  assert.equal(withLeave.cleared, 0);
});

test("攻打顺序由大地图走位决定：首领本阵要先拔尽其余营寨", () => {
  const run = freshRun(71, 3);
  assert.deepEqual(
    run.nodes.map((node) => node.kind),
    ["battle", "elite", "boss"],
  );
  const state = replaySagaRun(run, []).state;
  assert.deepEqual(openNodes(run, state), [0, 1]);
  assert.equal(canEngageNode(run, state, 2), false, "其余营寨未破，打不了主帅本阵");
  assert.equal(canEngageNode(run, state, run.nodes.length), false);
  assert.equal(canEngageNode(run, state, -1), false);

  // 非法的攻打指令被丢弃：一个营也没破，人还留在大地图上，之后也不会被补打。
  const illegal = replaySagaRun(run, [{ k: "battle", node: 2, rounds: [] }]);
  assert.deepEqual(illegal.state.clearedNodes, []);
  assert.equal(illegal.state.scene, "field");
  assert.equal(illegal.cleared, 0);

  // 拔掉前锋两营后，本阵成为唯一可攻的目标；已破的营不能反复打。
  const nearEnd = replaySagaRun(run, []).state;
  nearEnd.clearedNodes = [0, 1];
  assert.deepEqual(openNodes(run, nearEnd), [2]);
  assert.equal(canEngageNode(run, nearEnd, 0), false);
});

test("军需购买从 cmdIndex 起生效，不会回溯加强已经开打的战斗", () => {
  const run = freshRun(31, 2);
  const purchased = (cmdIndex: number): SagaRun => ({
    ...run,
    purchases: [{ id: "buy1", itemId: "tiger_tally", tickets: 2, at: 1, cmdIndex }],
  });
  const battle: SagaCommand = { k: "battle", node: 0, rounds: [] };
  const troops = (state: ReturnType<typeof replaySagaRun>): number => {
    const current = state.state.battle;
    assert.ok(current);
    return current.party.reduce((sum, general) => sum + general.maxTroops, 0);
  };

  const baseline = troops(replaySagaRun(run, [battle]));
  const applied = troops(replaySagaRun(purchased(0), [battle]));
  const late = troops(replaySagaRun(purchased(1), [battle, { k: "leave" }]));
  assert.ok(applied > baseline, "开战前买虎符，全队兵力上限提高");
  assert.equal(late, baseline, "打完第一场再买，本场不会被加强");
});

test("钱庄存金：按存金价整档收，每趟封顶 600 金，超出的指令不再扣金", () => {
  const startSave = initialTrialSave();
  startSave.gold = 900;
  const run = { ...freshRun(51, 3), startSave };

  const banked = replaySagaRun(run, [
    { k: "bank", g: 100 },
    { k: "bank", g: 400 },
    { k: "bank", g: 100 },
    { k: "bank", g: 100 },
  ]).state;
  assert.equal(banked.save.gold, 300, "只扣前 600 金");
  assert.equal(banked.bankedGold, DEFAULT_SAGA_BANK.maxGoldPerRun);

  const odd = replaySagaRun(run, [{ k: "bank", g: 150 }]).state;
  assert.equal(odd.save.gold, 900, "不在整档上的存金整笔不扣");
  assert.equal(odd.bankedGold, 0);

  const poorSave = initialTrialSave();
  poorSave.gold = 250;
  const poor = replaySagaRun({ ...run, startSave: poorSave }, [{ k: "bank", g: 300 }]).state;
  assert.equal(poor.save.gold, 250, "金币不足时整笔不扣");
  assert.equal(poor.bankedGold, 0);

  assert.equal(bankCreditsForGold(0), 0);
  assert.equal(bankCreditsForGold(100), 1);
  assert.equal(bankCreditsForGold(600), 6);
  assert.equal(bankCreditsForGold(1000), 6, "再多的金币也只按上限结算");
  assert.equal(bankGoldForTcr(3), 120);
});

test("钱庄规则：换金价必须低于存金价，上限对齐整档", () => {
  const bank = sanitizeSagaBank({ goldPerTcr: 100, maxGoldPerRun: 650, goldPerTcrBuy: 100 });
  assert.equal(bank.goldPerTcrBuy, 99);
  assert.equal(bank.maxGoldPerRun, 600);
  assert.deepEqual(sanitizeSagaBank(null), DEFAULT_SAGA_BANK);
});

test("客栈住店：缺兵才收 30 金并补满全队，满编或钱不够不收费", () => {
  const run = freshRun(61, 2);
  const state = createReplayState(run);
  state.save.gold = 100;
  const [first] = state.save.party;
  const max = generalStats(first).maxTroops;
  state.partyTroops[first.id] = max - 50;

  assert.equal(restAtInn(state), true);
  assert.equal(state.partyTroops[first.id], max);
  assert.equal(state.save.gold, 100 - SAGA_INN_PRICE_GOLD);

  // 全员满编再住一次只是白跑，分文不收。
  assert.equal(restAtInn(state), false);
  assert.equal(state.save.gold, 100 - SAGA_INN_PRICE_GOLD);

  // 缺兵但连店钱都不够：不能住，也不偷偷补兵。
  state.save.gold = SAGA_INN_PRICE_GOLD - 1;
  state.partyTroops[first.id] = 1;
  assert.equal(restAtInn(state), false);
  assert.equal(state.partyTroops[first.id], 1);
  assert.equal(state.save.gold, SAGA_INN_PRICE_GOLD - 1);

  // 指令重放走同一口径：满编时插一条住店指令不扣钱。
  const fresh = replaySagaRun(run, [{ k: "inn" }, { k: "leave" }]).state;
  assert.equal(fresh.save.gold, run.startSave.gold);
});

test("客栈：兵败后住店能重整旗鼓，接着行军", () => {
  const run = wreckedRun();
  const lose: SagaCommand[] = [
    { k: "battle", node: 0, rounds: [[{ g: "liubei", a: "attack", target: 0 }]] },
  ];
  const lost = replaySagaRun(run, lose).state;
  assert.equal(lost.scene, "lost");
  assert.equal(lost.partyTroops.liubei, 0);
  assert.equal(lost.save.gold, 100);

  // 败退状态下再出兵无效：零兵力硬打只会白送，得先住店或收兵。
  const again = replaySagaRun(run, [
    ...lose,
    { k: "battle", node: 1, rounds: [[{ g: "liubei", a: "attack", target: 0 }]] },
  ]).state;
  assert.equal(again.scene, "lost");
  assert.equal(again.clearedNodes.length, 0);

  // 住店：收一笔店钱、全队补满、行军回到 field，后续城镇指令重新生效。
  const rested = replaySagaRun(run, [
    ...lose,
    { k: "inn" },
    { k: "formation", f: "fengshi" },
  ]).state;
  assert.equal(rested.scene, "field");
  assert.equal(rested.save.gold, 100 - SAGA_INN_PRICE_GOLD);
  assert.equal(rested.partyTroops.liubei, generalStats(run.startSave.party[0]).maxTroops);
  assert.equal(rested.save.formation, "fengshi");

  // 重整后能接着打下另一座营，行军不会被兵败锁死。
  const won = replaySagaRun(run, [
    ...lose,
    { k: "inn" },
    { k: "battle", node: 1, rounds: [[{ g: "liubei", a: "attack", target: 0 }]] },
  ]).state;
  assert.equal(won.clearedNodes.includes(1), true);
  assert.equal(won.scene, "field");

  // 店钱不够就救不回来，不给零成本复活留口子。
  const broke = wreckedRun();
  broke.startSave.gold = SAGA_INN_PRICE_GOLD - 1;
  const stuck = replaySagaRun(broke, [...lose, { k: "inn" }]).state;
  assert.equal(stuck.scene, "lost");
  assert.equal(stuck.partyTroops.liubei, 0);
  assert.equal(stuck.save.gold, SAGA_INN_PRICE_GOLD - 1);
});

test("收兵战果记录存金与通关金币，两者互不覆盖", () => {
  const startSave = initialTrialSave();
  startSave.gold = 500;
  const settled = settleSagaRun(easyRun(startSave), [
    { k: "bank", g: 300 },
    ...winCommands,
  ]);

  assert.equal(settled.result.bankedGold, 300);
  assert.equal(settled.result.goldGained, 30, "钱庄存金不算战斗战利品");
  assert.equal(settled.endSave.gold, 230, "500 − 300 存金 + 30 战利品");
});

test("钱庄换金：兑换记录在对应指令位置加金，并写进收兵存档", () => {
  const run = easyRun();
  const purchased: SagaRun = {
    ...run,
    purchases: [
      { id: "goldbuy1", itemId: "bank_gold", tickets: 0, gold: 120, at: 1, cmdIndex: 0 },
    ],
  };
  const state = replaySagaRun(purchased, [{ k: "leave" }]).state;
  assert.equal(state.save.gold, run.startSave.gold + 120);

  const settled = settleSagaRun(purchased, winCommands);
  assert.equal(settled.endSave.gold, run.startSave.gold + 120 + 30);

  const parsed = parseSagaRun(JSON.stringify(purchased));
  assert.ok(parsed);
  assert.equal(parsed.purchases[0]?.gold, 120, "兑换记录能完整读回");
  const offPrice = parseSagaRun(
    JSON.stringify({
      ...purchased,
      purchases: [{ id: "goldbuy2", itemId: "bank_gold", tickets: 0, gold: 30, at: 1, cmdIndex: 0 }],
    }),
  );
  assert.equal(offPrice?.purchases.length, 0, "不在换金价整档上的记录被丢掉");
});

test("攻克章节：发金币经验、进下一章并解锁武将写进存档", () => {
  const startSave = initialTrialSave();
  startSave.chapter = 2;
  const settled = settleSagaRun(easyRun(startSave), winCommands);

  assert.equal(settled.cleared, 1);
  assert.equal(settled.victory, true);
  assert.equal(settled.result.chapterName, "徐州风云");
  assert.equal(settled.result.chapterAfter, 3);
  assert.equal(settled.endSave.chapter, 3);
  assert.equal(settled.endSave.stats.wins, 1);
  assert.equal(settled.endSave.stats.runs, 1);
  assert.ok(settled.endSave.gold > startSave.gold);
  assert.equal(
    [...settled.endSave.party, ...settled.endSave.reserve].some((member) => member.id === "zhaoyun"),
    true,
    "通关徐州风云后赵云入队",
  );
  assert.deepEqual(settled.result.recruited, []);
});

test("自动战斗完整跑一局：重复调用结果一致，战绩按局累计", () => {
  const run = freshRun(41, 3);
  const first = autoPlaySagaRun(run);
  const second = autoPlaySagaRun(run);
  assert.deepEqual(second, first);
  assert.equal(first.result.total, 3);
  assert.equal(first.endSave.stats.runs, 1);
  assert.equal(first.state.clearedNodes.length, first.cleared);
  assert.ok(first.cleared >= 0 && first.cleared <= 3);
  assert.equal(new Set(first.state.clearedNodes).size, first.state.clearedNodes.length, "同一座营不会被重复攻克");
  assert.ok(first.state.clearedNodes.every((node) => node >= 0 && node < 3));
});

test("讨逆配置：节点数与档位互相约束，脏值退回可用默认", () => {
  const config = sanitizeTrialConfig({
    questionCount: 99,
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

  assert.equal(config.questionCount, TRIAL_MAX_FLOORS);
  assert.equal(config.rewardValidDays, 1);
  // 票价按券单价对齐整张：7 → 5。
  assert.equal(config.runPriceCredits, 5);
  // 重复档位保留第一条，超出节点数的被丢弃，奖励不为负。
  assert.deepEqual(config.tiers, [
    { correct: 1, reward: 0 },
    { correct: 3, reward: 2 },
  ]);
  const fallback = sanitizeTrialConfig(null);
  assert.equal(fallback.questionCount, DEFAULT_TRIAL_CONFIG.questionCount);
  assert.equal(sanitizeTrialConfig({ questionCount: 1 }).questionCount, 2);
});

test("平定奖励取攻破营寨数的最高一档", () => {
  const config = trial();
  assert.equal(trialRewardFor(config, 0), 0);
  assert.equal(trialRewardFor(config, 1), 0);
  assert.equal(trialRewardFor(config, 2), 1);
  assert.equal(trialRewardFor(config, 4), 4);
  assert.equal(trialRewardFor(config, 5), 8);
  assert.equal(trialRewardFor(config, 99), 8);
});

test("平定最后一处地方：剧情停在终点，不越界到不存在的下一处", () => {
  const startSave = initialTrialSave();
  startSave.chapter = SAGA_CHAPTERS.length - 1;
  const settled = settleSagaRun(easyRun(startSave), winCommands);

  assert.equal(settled.victory, true);
  assert.equal(settled.result.chapterAfter, SAGA_CHAPTERS.length - 1);
  assert.equal(settled.endSave.chapter, SAGA_CHAPTERS.length - 1);
  assert.equal(settled.endSave.stats.wins, 1);
});

// ---------------------------------------------------------------- 行军大地图

test("大地图生成：同种子同一张图，营寨数量与节点一一对应", () => {
  for (let chapter = 0; chapter < SAGA_CHAPTERS.length; chapter++) {
    for (let nodeCount = 2; nodeCount <= 7; nodeCount++) {
      const seed = chapter * 97 + nodeCount;
      const field = generateSagaField({ chapter, nodeCount, seed });
      assert.deepEqual(generateSagaField({ chapter, nodeCount, seed }), field, "按种子复现");
      assert.deepEqual(
        field.camps.map((camp) => camp.node),
        Array.from({ length: nodeCount }, (_, index) => index),
      );
      assert.equal(field.camps.every((camp) => camp.x === (camp.tx + 0.5) * field.tile), true);
      assert.equal(
        field.camps[nodeCount - 1].x >= field.camps[nodeCount - 2].x,
        true,
        "主帅本阵扎在最远处",
      );
    }
  }
});

test("大地图可行走：城门与每座营都在四连通可达区内", () => {
  for (let chapter = 0; chapter < SAGA_CHAPTERS.length; chapter++) {
    for (let nodeCount = 2; nodeCount <= 7; nodeCount++) {
      const label = `第 ${chapter} 章 ${nodeCount} 营`;
      const field = generateSagaField({ chapter, nodeCount, seed: chapter * 31 + nodeCount * 7 });
      const seen = fieldReachable(field);
      assert.equal(fieldHitsSolid(field, field.spawn.x, field.spawn.y), false, `${label}：出生点不在墙上`);
      for (const camp of field.camps) {
        const cell = Math.floor(camp.y / field.tile) * field.cols + Math.floor(camp.x / field.tile);
        assert.equal(seen[cell], true, `${label}：营地 ${camp.node} 可达`);
        const hotspot = fieldHotspotNear(field, camp.x, camp.y - 6);
        assert.equal(hotspot?.kind, "camp", `${label}：走到营前能触发交互`);
        assert.equal(hotspot?.camp?.node, camp.node);
      }
      const atGate = fieldHotspotNear(field, field.city.x, field.city.y - 6);
      assert.equal(atGate?.kind, "city", `${label}：城门口可回城`);
      assert.equal(fieldHotspotNear(field, field.spawn.x, field.spawn.y - 6)?.kind, "city");
    }
  }
});

test("大地图不入库存档：只由种子复现，与对局 JSON 里的节点数一致", () => {
  const run = freshRun(81, 4);
  const field = sagaFieldFor(run);
  assert.equal(field.camps.length, run.nodes.length);
  assert.deepEqual(sagaFieldFor(run), generateSagaField({ chapter: 0, nodeCount: 4, seed: run.seed }));
  // 只有种子/节点数参与地图，行军进度不会改变地形。
  const replayed = { ...run, nodes: run.nodes.slice(0, 3) };
  assert.equal(sagaFieldFor(replayed).camps.length, 3);
});

// ---------------------------------------------------------------- 野外遇敌

test("野外遭遇编成：同种子同序号固定，1~4 队且将领可有可无", () => {
  const run = freshRun(11, 5);
  for (let ordinal = 0; ordinal < SAGA_MAX_ENCOUNTERS; ordinal++) {
    const node = sagaEncounterFor(run, ordinal);
    assert.deepEqual(sagaEncounterFor(run, ordinal), node, `第 ${ordinal} 场按序号复现`);
    assert.equal(node.kind, "battle");
    assert.equal(node.enemies.length >= 1 && node.enemies.length <= 4, true, "敌军 1~4 队");
    assert.equal(
      node.enemies.filter((enemy) => enemy.id.startsWith("foe_")).length >= 1,
      true,
      "至少有一队杂兵",
    );
    assert.equal(new Set(node.enemies.map((enemy) => enemy.id)).size, node.enemies.length);
    assert.equal(node.rewardGold > 0 && node.rewardExp > 0, true);
    assert.equal(
      node.enemies.every((enemy) => !enemy.recruitable),
      true,
      "野外敌军不开放招降",
    );
  }
  // 序号越界按最后一档算，不会崩。
  assert.deepEqual(
    sagaEncounterFor(run, SAGA_MAX_ENCOUNTERS + 5),
    sagaEncounterFor(run, SAGA_MAX_ENCOUNTERS - 1),
  );
});

test("野外遭遇兵种：兵士、山贼、盗贼都可能出现，有无将领两种编成都有", () => {
  const groups = new Set<string>();
  let withLeader = false;
  let withoutLeader = false;
  for (let seed = 1; seed <= 40; seed++) {
    const run = freshRun(seed, 5);
    for (let ordinal = 0; ordinal < SAGA_MAX_ENCOUNTERS; ordinal++) {
      const node = sagaEncounterFor(run, ordinal);
      groups.add(node.name.includes("·") ? node.name.split("·")[0] : node.name);
      if (node.enemies.some((enemy) => !enemy.id.startsWith("foe_"))) withLeader = true;
      else withoutLeader = true;
    }
  }
  assert.deepEqual([...groups].sort(), ["山贼拦路", "散兵游勇", "盗贼伏击"].sort());
  assert.equal(withLeader && withoutLeader, true, "有将领与纯杂兵两种编成都出现");
});

test("野外遭遇战：不占营地进度，打赢照常得金币经验并继续行军", () => {
  const run = easyRun();
  const rounds = Array.from({ length: 50 }, () => [
    { g: "liubei", a: "attack" as const, target: 0 },
    { g: "guanyu", a: "attack" as const, target: 0 },
    { g: "zhangfei", a: "attack" as const, target: 0 },
  ]);
  const result = replaySagaRun(run, [{ k: "skirmish", rounds }]);
  assert.equal(result.state.encounters, 1, "遭遇场次 +1");
  assert.equal(result.state.clearedNodes.length, 0, "不占营地进度");
  assert.equal(result.state.scene, "field", "打赢后接着行军");
  assert.equal(result.state.goldGained > 0 && result.state.expGained > 0, true);
  assert.equal(result.state.battlesWon, 1);

  const second = replaySagaRun(run, [
    { k: "skirmish", rounds },
    { k: "skirmish", rounds },
  ]);
  assert.equal(second.state.encounters, 2, "第二场按下一个序号生成");

  const settled = settleSagaRun(run, [{ k: "skirmish", rounds }]);
  assert.equal(settled.result.encounters, 1, "战报记录遭遇场次");
  assert.equal(settled.result.goldGained, result.state.goldGained);
});

test("野外遭遇指令：空指令被丢弃，每趟最多 10 场", () => {
  assert.deepEqual(sanitizeSagaCommands([{ k: "skirmish", rounds: [] }]), []);
  const spam = Array.from({ length: SAGA_MAX_ENCOUNTERS + 4 }, () => ({
    k: "skirmish" as const,
    rounds: [[{ g: "liubei", a: "attack" as const, target: 0 }]],
  }));
  const cleaned = sanitizeSagaCommands(spam);
  assert.equal(cleaned.length, SAGA_MAX_ENCOUNTERS);
  assert.equal(cleaned.every((command) => command.k === "skirmish"), true);
});

test("野外遭遇只在行军途中发生：兵败后不再受理遭遇指令", () => {
  const run = wreckedRun();
  const rounds = [[{ g: "liubei", a: "attack" as const, target: 0 }]];
  const lost = replaySagaRun(run, [
    { k: "battle", node: 0, rounds },
    { k: "skirmish", rounds },
  ]);
  assert.equal(lost.state.scene, "lost");
  assert.equal(lost.state.encounters, 0, "兵败后的遭遇指令被忽略");
  assert.equal(lost.state.clearedNodes.length, 0);
});

test("野外遇敌概率：官道安全，草地与树林才有概率", () => {
  const field = generateSagaField({ chapter: 0, nodeCount: 5, seed: 3 });
  let walkable = 0;
  for (let ty = 0; ty < field.rows; ty++) {
    for (let tx = 0; tx < field.cols; tx++) {
      const kind = fieldTileAt(field, tx, ty);
      const chance = fieldEncounterChanceAt(field, (tx + 0.5) * field.tile, (ty + 0.5) * field.tile);
      if (kind === SAGA_TILE_GRASS || kind === SAGA_TILE_FOREST) {
        assert.equal(chance > 0, true, `草地/树林有遇敌概率（tile=${kind}）`);
        walkable += 1;
      } else {
        assert.equal(chance, 0, `官道与城池不遇敌（tile=${kind}）`);
      }
    }
  }
  assert.equal(walkable > 0, true);
  assert.equal(fieldTileAt(field, field.city.gateTx, field.city.gateTy), SAGA_TILE_ROAD);
  assert.equal(
    fieldEncounterChanceAt(field, (field.city.gateTx + 0.5) * field.tile, (field.city.gateTy + 0.5) * field.tile),
    0,
    "城门口必定安全",
  );
});
