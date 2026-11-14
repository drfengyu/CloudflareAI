import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_TRIAL_CONFIG,
  TRIAL_MAX_FLOORS,
  sanitizeTrialConfig,
  trialRewardFor,
  type TrialConfig,
} from "../lib/trial/config";
import { SAGA_CHAPTERS, SAGA_GENERAL_BY_ID, SAGA_TRAITS, SAGA_TRAIT_BY_ID, tacticsFor, traitStats } from "../lib/trial/saga/data";
import {
  SAGA_FIELD_COLS,
  SAGA_FIELD_ROWS,
  SAGA_MAX_LEVEL,
  SAGA_RULESET,
  SAGA_RUN_VERSION,
  SAGA_TILE_FOREST,
  SAGA_TILE_GRASS,
  SAGA_TILE_ROAD,
  SAGA_TILE_WALL,
  SAGA_TILE_YARD,
  type SagaBattleState,
  type SagaCommand,
  type SagaRun,
} from "../lib/trial/saga/types";
import {
  SAGA_NPCS,
  campScene,
  chapterIntroScene,
  chapterVictoryScene,
  councilScene,
  poiScene,
  tavernScene,
} from "../lib/trial/saga/story";
import {
  sagaNextQuest,
  sagaQuestContext,
  sagaQuestsFor,
} from "../lib/trial/saga/quests";
import {
  autoBattleRounds,
  autoPlaySagaRun,
  canEngageNode,
  createReplayState,
  generateSagaRun,
  openNodes,
  parseSagaRun,
  replaySagaRun,
  restAtInn,
  sagaRunUntouched,
  sanitizeSagaCommands,
  settleSagaRun,
} from "../lib/trial/saga/run";
import {
  fieldEncounterChanceAt,
  fieldHotspotNear,
  fieldHitsSolid,
  fieldReachable,
  fieldShoreAt,
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
  SAGA_COUPON_ITEM_ID,
  SAGA_MAX_COUPON_TICKETS,
  bankCreditsForGold,
  couponGoldCost,
  couponsForGold,
  sanitizeSagaBank,
} from "../lib/trial/saga/bank";
import { SAGA_INN_ITEM_ID, SAGA_INN_PRICE_TICKETS } from "../lib/trial/saga/inn";
import {
  createGeneralState,
  findGeneral,
  generalStats,
  initialTrialSave,
  normalizeTrialSave,
} from "../lib/trial/saga/state";
import { startBattle } from "../lib/trial/saga/battle";
import { battleEnemyAtPoint, makeSagaView } from "../components/trial/renderer";
import {
  SAGA_TRAINING_ITEM_ID,
  SAGA_TRAINING_TICKETS_PER_LEVEL,
  trainGeneral,
  trainingCost,
  trainingLevelCap,
} from "../lib/trial/saga/training";
import {
  SAGA_FORGE_ITEM_ID,
  SAGA_FORGE_MAX_LEVEL,
  forgeCost,
  forgeStat,
  normalizeGearLevels,
} from "../lib/trial/saga/forge";

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

test("指令清洗：未知字段、旧金币商店与错槽装备都被丢弃", () => {
  const commands = sanitizeSagaCommands([
    { k: "formation", f: "fengshi" },
    { k: "formation", f: "bogus" },
    // v0.55 起城内买卖只走试炼券，旧的金币商店 / 住店指令不再采信。
    { k: "shop", i: "herb" },
    { k: "shop", i: "secret_medicine" },
    { k: "inn" },
    { k: "equip", g: "liubei", slot: "weapon", i: "guandao" },
    { k: "equip", g: "liubei", slot: "weapon", i: "cloth" },
    { k: "party", active: ["liubei", "guanyu", "zhangfei"] },
    { k: "bank", g: 100 },
    { k: "bank", g: 150 },
    { k: "bank", g: 400 },
    { k: "bank", g: -100 },
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
    ["formation", "equip", "party", "bank", "bank", "bank", "battle", "leave"],
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
});

test("钱庄规则：上限对齐整档，旧换金价只影响历史记录", () => {
  const bank = sanitizeSagaBank({ goldPerTcr: 100, maxGoldPerRun: 650, goldPerTcrBuy: 100 });
  assert.equal(bank.goldPerTcrBuy, 99);
  assert.equal(bank.maxGoldPerRun, 600);
  assert.deepEqual(sanitizeSagaBank(null), DEFAULT_SAGA_BANK);
});

test("客栈重整：缺兵才补满全队，满编返回 false", () => {
  const run = freshRun(61, 2);
  const state = createReplayState(run);
  const [first] = state.save.party;
  const max = generalStats(first).maxTroops;
  state.partyTroops[first.id] = max - 50;

  assert.equal(restAtInn(state), true);
  assert.equal(state.partyTroops[first.id], max);
  assert.equal(restAtInn(state), false, "全员满编再住一次什么也不做");
});

test("客栈：住店券记录按指令位置补兵，兵败后能重整旗鼓接着行军", () => {
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

  // 住店券在购买时已扣，重放只认购买记录：补满全队、行军回到 field，金币不动。
  const innRun: SagaRun = {
    ...run,
    purchases: [
      {
        id: "inn1",
        itemId: SAGA_INN_ITEM_ID,
        tickets: SAGA_INN_PRICE_TICKETS,
        at: 1,
        cmdIndex: lose.length,
      },
    ],
  };
  const rested = replaySagaRun(innRun, [...lose, { k: "formation", f: "fengshi" }]).state;
  assert.equal(rested.scene, "field");
  assert.equal(rested.save.gold, 100, "店钱不走金币");
  assert.equal(rested.partyTroops.liubei, generalStats(run.startSave.party[0]).maxTroops);
  assert.equal(rested.save.formation, "fengshi");

  // 重整后能接着打下另一座营，行军不会被兵败锁死。
  const won = replaySagaRun(innRun, [
    ...lose,
    { k: "battle", node: 1, rounds: [[{ g: "liubei", a: "attack", target: 0 }]] },
  ]).state;
  assert.equal(won.clearedNodes.includes(1), true);
  assert.equal(won.scene, "field");

  // 没有住店券记录就救不回来，不给零成本复活留口子。
  const stuck = replaySagaRun(run, lose).state;
  assert.equal(stuck.scene, "lost");
  assert.equal(stuck.partyTroops.liubei, 0);
  assert.equal(stuck.save.gold, 100);
});

test("购买记录：券价按商品表校正，客栈可重复买、被动军需只认一份", () => {
  const run = freshRun(63, 2);
  const parsed = parseSagaRun(
    JSON.stringify({
      ...run,
      purchases: [
        { id: "p1", itemId: "guandao", tickets: 99, at: 1, cmdIndex: 0 },
        { id: "p2", itemId: SAGA_INN_ITEM_ID, tickets: 99, at: 1, cmdIndex: 0 },
        { id: "p3", itemId: SAGA_INN_ITEM_ID, tickets: 1, at: 1, cmdIndex: 0 },
        { id: "p4", itemId: "tiger_tally", tickets: 1, at: 1, cmdIndex: 0 },
        { id: "p5", itemId: "tiger_tally", tickets: 1, at: 1, cmdIndex: 0 },
        { id: "p6", itemId: "not_an_item", tickets: 1, at: 1, cmdIndex: 0 },
      ],
    }),
  );
  assert.ok(parsed);
  assert.deepEqual(
    parsed.purchases.map((purchase) => [purchase.itemId, purchase.tickets]),
    [
      ["guandao", 5],
      [SAGA_INN_ITEM_ID, SAGA_INN_PRICE_TICKETS],
      [SAGA_INN_ITEM_ID, SAGA_INN_PRICE_TICKETS],
      ["tiger_tally", 2],
    ],
  );

  // 装备按购买指令位置入库，券价张数不采信客户端写回的 99。
  const state = replaySagaRun(parsed, [{ k: "leave" }]).state;
  assert.equal(state.save.gear.guandao, 1);
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

test("钱庄换金（旧记录）：历史兑换仍在对应指令位置加金，并写进收兵存档", () => {
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

test("钱庄换券：按券面单价折算金币，重放扣金、记录可读回", () => {
  assert.equal(couponGoldCost(0, 5), 0);
  assert.equal(couponGoldCost(-3, 5), 0);
  assert.equal(couponGoldCost(3, 0), 0);
  assert.equal(couponGoldCost(1, 5), 5);
  assert.equal(couponGoldCost(3, 5), 15);
  assert.equal(couponGoldCost(3, 2.5), 8, "金币取整，不足 1 金进位");
  assert.equal(couponGoldCost(1_000_000, 100), 9_999_999, "单笔金币有上限");

  assert.equal(couponsForGold(0, 5), 0);
  assert.equal(couponsForGold(4, 5), 0);
  assert.equal(couponsForGold(5, 5), 1);
  assert.equal(couponsForGold(12, 5), 2);
  assert.equal(couponsForGold(100, 0), 0);

  const startSave = initialTrialSave();
  startSave.gold = 100;
  const run = { ...freshRun(71, 2), startSave };
  const purchased: SagaRun = {
    ...run,
    purchases: [
      {
        id: "coupon1",
        itemId: SAGA_COUPON_ITEM_ID,
        tickets: 0,
        coupons: 10,
        goldCost: 50,
        at: 1,
        cmdIndex: 0,
      },
    ],
  };
  const state = replaySagaRun(purchased, [{ k: "leave" }]).state;
  assert.equal(state.save.gold, 50, "换券扣金");
  assert.equal(state.bankedGold, 0, "换券不占存金额度");

  // 金币不会被扣成负数：旧记录里金币不够时只扣到 0。
  const poorSave = initialTrialSave();
  poorSave.gold = 20;
  const poor = replaySagaRun({ ...purchased, startSave: poorSave }, [{ k: "leave" }]).state;
  assert.equal(poor.save.gold, 0);

  const parsed = parseSagaRun(JSON.stringify(purchased));
  assert.ok(parsed);
  assert.equal(parsed.purchases[0]?.coupons, 10);
  assert.equal(parsed.purchases[0]?.goldCost, 50);

  const tampered = parseSagaRun(
    JSON.stringify({
      ...purchased,
      purchases: [
        { id: "coupon2", itemId: SAGA_COUPON_ITEM_ID, coupons: 9_999_999, goldCost: 9_999_999, at: 1, cmdIndex: 0 },
        { id: "coupon3", itemId: SAGA_COUPON_ITEM_ID, coupons: 0, goldCost: 0, at: 1, cmdIndex: 0 },
        { id: "coupon4", itemId: SAGA_COUPON_ITEM_ID, coupons: -5, goldCost: 10, at: 1, cmdIndex: 0 },
      ],
    }),
  );
  assert.equal(tampered?.purchases.length, 1, "无效兑换记录被丢掉");
  assert.equal(tampered?.purchases[0]?.coupons, SAGA_MAX_COUPON_TICKETS, "张数按上限截断");
});

test("钱庄换券：结算时扣掉兑换金币，战斗缴获照常入账", () => {
  const startSave = initialTrialSave();
  startSave.gold = 100;
  const run = easyRun(startSave);
  const purchased: SagaRun = {
    ...run,
    purchases: [
      {
        id: "coupon9",
        itemId: SAGA_COUPON_ITEM_ID,
        tickets: 0,
        coupons: 10,
        goldCost: 50,
        at: 1,
        cmdIndex: 0,
      },
    ],
  };
  const settled = settleSagaRun(purchased, winCommands);
  assert.equal(settled.endSave.gold, 80, "100 − 50 换券 + 30 战利品");
  assert.equal(settled.result.goldGained, 30, "换券不算战斗战利品");
});

test("铁匠铺强化：价格随等级递增、满级封顶，属性按基础两成叠加", () => {
  assert.equal(forgeCost("iron_sword", 0), 1);
  assert.equal(forgeCost("iron_sword", 1), 3);
  assert.equal(forgeCost("iron_sword", 4), 9);
  assert.equal(forgeCost("iron_sword", SAGA_FORGE_MAX_LEVEL), 0, "满级不再收费");
  assert.equal(forgeCost("guandao", 0), 5);
  assert.equal(forgeCost("herb", 0), 0, "消耗品不能强化");
  assert.equal(forgeCost("not_an_item", 0), 0);

  assert.equal(forgeStat("iron_sword", 0), 8);
  assert.equal(forgeStat("iron_sword", 3), 13);
  assert.equal(forgeStat("iron_sword", SAGA_FORGE_MAX_LEVEL), 16);
  assert.equal(forgeStat("guandao", SAGA_FORGE_MAX_LEVEL), 54);
  assert.equal(forgeStat("cloth", SAGA_FORGE_MAX_LEVEL), 12);
  assert.equal(forgeStat("herb", 5), 0);

  assert.deepEqual(
    normalizeGearLevels({ iron_sword: 9, cloth: -2, herb: 3, guandao: "2" }),
    { iron_sword: SAGA_FORGE_MAX_LEVEL, guandao: 2 },
    "只留可强化装备，等级截断到 0~5",
  );
  assert.deepEqual(normalizeTrialSave({ ...initialTrialSave(), gearLevels: undefined }).gearLevels, {});
});

test("铁匠铺强化：购买记录按指令位置抬等级，收兵存档保留，脏记录被丢掉", () => {
  const run = freshRun(81, 2);
  const guanyu = run.startSave.party.find((general) => general.id === "guanyu")!;
  assert.equal(guanyu.weapon, "iron_sword");
  const purchases = [
    { id: "forge1", itemId: SAGA_FORGE_ITEM_ID, tickets: 1, gearId: "iron_sword", targetLevel: 1, at: 1, cmdIndex: 0 },
    { id: "forge2", itemId: SAGA_FORGE_ITEM_ID, tickets: 3, gearId: "iron_sword", targetLevel: 2, at: 2, cmdIndex: 0 },
    { id: "forge3", itemId: SAGA_FORGE_ITEM_ID, tickets: 1, gearId: "iron_sword", targetLevel: 1, at: 3, cmdIndex: 0 },
  ];
  const state = replaySagaRun({ ...run, purchases }, []).state;
  assert.equal(state.save.gearLevels.iron_sword, 2, "等级只增不减");
  assert.equal(
    generalStats(state.save.party.find((general) => general.id === "guanyu")!, state.save.gearLevels)
      .weaponAtk,
    11,
    "铁剑强化到 +2：8 + 3",
  );
  assert.equal(generalStats(guanyu).weaponAtk, 8, "不传等级表时按原属性");

  const forged = settleSagaRun({ ...easyRun(), purchases }, winCommands);
  assert.equal(forged.endSave.gearLevels.iron_sword, 2, "收兵存档保留强化等级");

  const parsed = parseSagaRun(
    JSON.stringify({
      ...run,
      purchases: [
        { id: "forge4", itemId: SAGA_FORGE_ITEM_ID, tickets: 9, gearId: "iron_sword", targetLevel: 99, at: 1, cmdIndex: 0 },
        { id: "forge5", itemId: SAGA_FORGE_ITEM_ID, tickets: 1, gearId: "herb", targetLevel: 1, at: 1, cmdIndex: 0 },
        { id: "forge6", itemId: SAGA_FORGE_ITEM_ID, tickets: 1, gearId: "cloth", targetLevel: 0, at: 1, cmdIndex: 0 },
        { id: "forge7", itemId: SAGA_FORGE_ITEM_ID, tickets: 1, gearId: "not_an_item", targetLevel: 1, at: 1, cmdIndex: 0 },
      ],
    }),
  );
  assert.ok(parsed);
  assert.equal(parsed.purchases.length, 1, "非装备与零级记录被丢掉");
  assert.equal(parsed.purchases[0]?.targetLevel, SAGA_FORGE_MAX_LEVEL, "目标等级按上限截断");
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
    couponUnitCredits: 5,
    rewardValidDays: 0,
    bankGoldPerTcr: 250,
    bankMaxGoldPerRun: 700,
    tiers: [
      { correct: 3, reward: 2 },
      { correct: 3, reward: 9 },
      { correct: 20, reward: 99 },
      { correct: 1, reward: -5 },
    ],
  });

  assert.equal(config.questionCount, TRIAL_MAX_FLOORS);
  assert.equal(config.rewardValidDays, 1);
  // 存金上限按存金价向下对齐整档：700 → 500。
  assert.equal(config.bankMaxGoldPerRun, 500);
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

test("大地图扩容：76×48 的图上有村落、祠堂与渡口，都铺在官道上走得到", () => {
  for (let chapter = 0; chapter < SAGA_CHAPTERS.length; chapter++) {
    for (let nodeCount = 2; nodeCount <= 7; nodeCount++) {
      const field = generateSagaField({ chapter, nodeCount, seed: chapter * 53 + nodeCount * 11 });
      const label = `第 ${chapter} 处 ${nodeCount} 营`;
      assert.equal(field.cols, SAGA_FIELD_COLS, `${label}：列数`);
      assert.equal(field.rows, SAGA_FIELD_ROWS, `${label}：行数`);
      assert.equal(field.worldW, SAGA_FIELD_COLS * field.tile);
      assert.deepEqual(field.pois.map((poi) => poi.kind), ["village", "shrine", "ferry"], label);
      const seen = fieldReachable(field);
      for (const poi of field.pois) {
        assert.equal(fieldTileAt(field, poi.tx, poi.ty), SAGA_TILE_ROAD, `${poi.name} 铺在官道上`);
        assert.equal(seen[poi.ty * field.cols + poi.tx], true, `${poi.name} 可达`);
        const hotspot = fieldHotspotNear(field, poi.x, poi.y - 6);
        assert.equal(hotspot?.kind, "poi", `${poi.name} 走到跟前能交互`);
        assert.equal(hotspot?.poi?.name, poi.name);
      }
      const names = field.pois.map((poi) => poi.name);
      assert.equal(new Set(names).size, names.length, "三处点位不重名");
      assert.equal(SAGA_CHAPTERS[chapter].landmarks.every((name) => names.includes(name)), true);
      assert.equal(new Set(field.pois.map((poi) => `${poi.tx}:${poi.ty}`)).size, 3);
    }
  }
});

test("剧情场景：开场、阵前、平定、乡野、酒馆与议事都有台词与立绘", () => {
  for (let chapter = 0; chapter < SAGA_CHAPTERS.length; chapter++) {
    const intro = chapterIntroScene(chapter);
    assert.equal(intro.lines.length >= 4, true);
    assert.equal(intro.lines[0].side, "narrator");
    const victory = chapterVictoryScene(chapter);
    assert.equal(victory.lines.length >= 3, true);
    const tavern = tavernScene(chapter);
    assert.equal(tavern.lines.length >= 3, true);
    const council = councilScene(chapter, ["liubei", "guanyu", "zhangfei"]);
    assert.equal(council.lines.length, 5);
    for (const scene of [intro, victory, tavern, council]) {
      assert.equal(scene.lines.every((line) => line.text.length > 0), true, scene.id);
      for (const line of scene.lines) {
        if (line.generalId) {
          assert.equal(SAGA_GENERAL_BY_ID.has(line.generalId), true, `${line.speaker} 的立绘 id 有效`);
        }
      }
    }
  }

  const run = freshRun(11, 5);
  for (const node of run.nodes) {
    const scene = campScene(0, node, node.enemies[0]?.id);
    assert.equal(scene.lines.length >= 3, true);
    assert.equal(scene.lines[0].side, "narrator");
    assert.equal(scene.lines[1].side, "enemy");
    assert.equal(scene.lines.some((line) => line.side === "hero"), true);
  }

  const field = sagaFieldFor(run);
  for (const poi of field.pois) {
    const scene = poiScene(0, poi);
    assert.equal(scene.lines.length >= 3, true);
    assert.equal(scene.lines.some((line) => line.side === "npc"), true);
    assert.equal(
      scene.lines.some(
        (line) => line.generalId === "liubei" || line.generalId === "guanyu" || line.generalId === "zhangfei",
      ),
      true,
    );
  }

  for (const id of [
    "blacksmith",
    "herbalist",
    "innkeeper",
    "banker",
    "quartermaster",
    "drillmaster",
    "tavernkeeper",
    "tentkeeper",
    "recordkeeper",
  ]) {
    const npc = SAGA_NPCS[id];
    assert.equal(Boolean(npc?.name && npc.title && npc.greeting), true, `${id} 有掌柜招呼语`);
    assert.equal(npc.lines.length >= 3, true, `${id} 至少有三句闲谈`);
  }
});

test("军令：进度从重放状态与乡野见闻推出，主线优先", () => {
  const run = easyRun();
  const state = replaySagaRun(run, winCommands).state;
  const ctx = sagaQuestContext(run, state, { visitedPois: 1, totalPois: 3 });
  assert.equal(ctx.total, 1);
  assert.equal(ctx.cleared, 1);
  assert.equal(ctx.bossCleared, true);
  assert.equal(ctx.partySize, state.save.party.length);
  assert.equal(ctx.equipped <= ctx.partySize, true);

  const quests = sagaQuestsFor(ctx);
  assert.equal(quests.length, 8);
  assert.equal(quests.filter((quest) => quest.scope === "main").length, 2);
  assert.equal(quests.every((quest) => quest.progress <= quest.target), true);
  const byId = new Map(quests.map((quest) => [quest.id, quest]));
  assert.equal(byId.get("clear-camps")?.done, true);
  assert.equal(byId.get("take-boss")?.done, true);
  assert.equal(byId.get("poi")?.progress, 1);
  assert.equal(byId.get("poi")?.done, false);
  assert.equal(byId.get("bank")?.progress, 0);
  assert.equal(byId.get("wins")?.progress, 1);
  assert.equal(sagaNextQuest(quests)?.scope, "side");

  const fieldState = replaySagaRun(run, []).state;
  const early = sagaQuestsFor(sagaQuestContext(run, fieldState, { visitedPois: 0, totalPois: 3 }));
  assert.equal(sagaNextQuest(early)?.id, "clear-camps");
  assert.equal(sagaNextQuest([]), null);

  const walked = sagaQuestsFor(
    sagaQuestContext(run, fieldState, { visitedPois: 99, totalPois: 3 }),
  );
  assert.equal(walked.find((quest) => quest.id === "poi")?.done, true);
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

test("野外遇敌概率：官道、草地、海边与树林都遇敌，城墙与城内校场除外", () => {
  const field = generateSagaField({ chapter: 0, nodeCount: 5, seed: 3 });
  let forest = 0;
  let grass = 0;
  let road = 0;
  let shore = 0;
  let safeCity = 0;
  for (let ty = 0; ty < field.rows; ty++) {
    for (let tx = 0; tx < field.cols; tx++) {
      const kind = fieldTileAt(field, tx, ty);
      const chance = fieldEncounterChanceAt(field, (tx + 0.5) * field.tile, (ty + 0.5) * field.tile);
      const gate = tx === field.city.gateTx && (ty === field.city.gateTy || ty === field.city.gateTy + 1);
      if (gate) {
        assert.equal(chance, 0, "城门洞归城内，站着不遇敌");
        continue;
      }
      if (kind === SAGA_TILE_FOREST) {
        assert.equal(chance, 0.05);
        forest += 1;
      } else if (kind === SAGA_TILE_GRASS) {
        if (fieldShoreAt(field, tx, ty)) {
          assert.equal(chance, 0.02, "海边滩涂也会遇敌");
          shore += 1;
        } else {
          assert.equal(chance, 0.024);
          grass += 1;
        }
      } else if (kind === SAGA_TILE_ROAD) {
        assert.equal(chance, 0.012, "官道也会遇敌");
        road += 1;
      } else {
        assert.equal(chance, 0, `城墙与城内校场不遇敌（tile=${kind}）`);
        if (kind === SAGA_TILE_WALL || kind === SAGA_TILE_YARD) safeCity += 1;
      }
    }
  }
  assert.equal(forest > 0 && grass > 0 && road > 0 && shore > 0, true, "树林 / 草地 / 官道 / 海边滩涂都要有");
  assert.equal(safeCity > 0, true, "地图上要有城墙与城内校场");
});

test("出城即入遇敌范围：城门外有概率，城门洞与城内校场恒为 0", () => {
  const field = generateSagaField({ chapter: 0, nodeCount: 5, seed: 7 });
  assert.equal(
    fieldEncounterChanceAt(field, (field.city.gateTx + 0.5) * field.tile, (field.city.gateTy + 0.5) * field.tile),
    0,
    "城门口必定安全",
  );
  assert.equal(fieldEncounterChanceAt(field, field.spawn.x, field.spawn.y) > 0, true, "出城后的出生点已在野外");
  for (let tx = field.city.tx + 1; tx < field.city.tx + field.city.w - 1; tx++) {
    for (let ty = field.city.ty + 1; ty < field.city.ty + field.city.h - 1; ty++) {
      if (fieldTileAt(field, tx, ty) !== SAGA_TILE_YARD) continue;
      assert.equal(
        fieldEncounterChanceAt(field, (tx + 0.5) * field.tile, (ty + 0.5) * field.tile),
        0,
        "城内校场不遇敌",
      );
    }
  }
});

test("官道贯通：城门口沿官道能走到每座营与每个乡野点位", () => {
  for (const seed of [1, 3, 7, 2026]) {
    const field = generateSagaField({ chapter: 0, nodeCount: 5, seed });
    const { cols, rows } = field;
    const seen = new Array<boolean>(cols * rows).fill(false);
    const start = field.city.gateTy * cols + field.city.gateTx;
    seen[start] = true;
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head];
      const tx = cell % cols;
      const ty = Math.floor(cell / cols);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as [number, number][]) {
        const nx = tx + dx;
        const ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const next = ny * cols + nx;
        if (seen[next] || fieldTileAt(field, nx, ny) !== SAGA_TILE_ROAD) continue;
        seen[next] = true;
        queue.push(next);
      }
    }
    for (const camp of field.camps) {
      assert.equal(
        seen[camp.ty * cols + camp.tx],
        true,
        `seed ${seed} 的营地 ${camp.node} 必须与城门官道相连`,
      );
    }
    for (const poi of field.pois) {
      assert.equal(
        seen[poi.ty * cols + poi.tx],
        true,
        `seed ${seed} 的 ${poi.kind} 必须与城门官道相连`,
      );
    }
  }
});

test("空壳行军：没指令、没购买、没商店进账才算没动过，可以按最新存档重开", () => {
  const run = freshRun();
  assert.equal(sagaRunUntouched(run), true);
  assert.equal(sagaRunUntouched({ ...run, commands: [{ k: "formation", f: "fengshi" }] }), false);
  assert.equal(
    sagaRunUntouched({
      ...run,
      purchases: [
        { id: "p1", itemId: "herb", tickets: 2, at: 1, cmdIndex: 0 },
      ],
    }),
    false,
  );
  assert.equal(sagaRunUntouched({ ...run, shopSeq: 1 }), false);
});

// ---------------------------------------------------------------- 特性 / 规则

test("武将特性：无双 / 智圣 / 会心 / 猛将等固有特性挂在指定武将身上", () => {
  const ids = new Set(SAGA_TRAITS.map((trait) => trait.id));
  for (const id of ["wushuang", "zhisheng", "huixin", "mengjiang"]) {
    assert.equal(ids.has(id as (typeof SAGA_TRAITS)[number]["id"]), true, `特性表包含 ${id}`);
  }
  for (const general of SAGA_GENERAL_BY_ID.values()) {
    for (const id of general.traits ?? []) {
      assert.equal(SAGA_TRAIT_BY_ID.has(id), true, `${general.name} 的特性 ${String(id)} 必须有定义`);
    }
  }
  assert.equal(SAGA_GENERAL_BY_ID.get("lvbu")?.traits?.includes("wushuang"), true);
  assert.equal(SAGA_GENERAL_BY_ID.get("zhugeliang")?.traits?.includes("zhisheng"), true);
  assert.equal(SAGA_GENERAL_BY_ID.get("zhaoyun")?.traits?.includes("huixin"), true);
  assert.equal(SAGA_GENERAL_BY_ID.get("guanyu")?.traits?.includes("mengjiang"), true);

  assert.equal(traitStats(SAGA_GENERAL_BY_ID.get("lvbu")).force, 6, "无双 +6 武力");
  assert.equal(traitStats(SAGA_GENERAL_BY_ID.get("zhugeliang")).intellect, 8, "智圣 +8 智力");
  const meng = traitStats(SAGA_GENERAL_BY_ID.get("guanyu"));
  assert.equal(meng.force, 6, "猛将 +6 武力");
  assert.equal(traitStats(SAGA_GENERAL_BY_ID.get("zhaoyun")).force, 0, "会心不加四维");
});

test("战斗规则：新行军启用特性与成长计策，旧行军 rules=1 按老规则重放", () => {
  const run = freshRun();
  assert.equal(run.rules, SAGA_RULESET);
  const old = parseSagaRun(JSON.stringify({ ...run, rules: undefined }));
  assert.ok(old);
  assert.equal(old.rules, 1, "旧行军缺省 rules=1");

  const newBattle = replaySagaRun(run, [{ k: "battle", node: 0, rounds: [] }]).state.battle;
  const oldBattle = replaySagaRun(old, [{ k: "battle", node: 0, rounds: [] }]).state.battle;
  assert.ok(newBattle && oldBattle);
  assert.equal(newBattle.party[0].traits?.includes("rende"), true, "新规则带特性");
  assert.deepEqual(oldBattle.party[0].traits, [], "旧规则不启用特性");

  const save = initialTrialSave();
  save.party = [createGeneralState("zhaoyun", 9)];
  const lv9Run = { ...easyRun(save), rules: SAGA_RULESET };
  const lv9 = startBattle(lv9Run, 0, createReplayState(lv9Run)).party[0];
  assert.deepEqual(lv9.tactics, ["huoji"], "9 级赵云还没领悟鼓舞");
  save.party[0].level = 10;
  const lv10 = startBattle(lv9Run, 0, createReplayState(lv9Run)).party[0];
  assert.deepEqual(lv10.tactics, ["huoji", "guwu"], "10 级领悟鼓舞");
});

test("策略点：升级增长，智将额外吃智力，封顶 12 点", () => {
  assert.deepEqual(tacticsFor(SAGA_GENERAL_BY_ID.get("pangtong"), 7), ["huoji", "hunluan"]);
  assert.deepEqual(tacticsFor(SAGA_GENERAL_BY_ID.get("pangtong"), 8), ["huoji", "hunluan", "guwu"]);

  const save = initialTrialSave();
  const run = { ...easyRun(save), rules: SAGA_RULESET };
  const atLv1 = startBattle(run, 0, createReplayState(run)).party[0];
  save.party[0].level = 10;
  const atLv10 = startBattle(run, 0, createReplayState(run)).party[0];
  save.party[0].level = 30;
  const atLv30 = startBattle(run, 0, createReplayState(run)).party[0];
  assert.equal(atLv10.tacticPoints > atLv1.tacticPoints, true, "升级增加策略点");
  assert.equal(atLv1.tacticPoints, 5, "刘备 1 级：基础 2 + 智力 2 + 仁德 1");
  assert.equal(atLv30.tacticPoints, 12, "策略点封顶 12");
  assert.equal(atLv1.tactics.includes("huifu"), true, "仁德之主自带回复");
});

// ---------------------------------------------------------------- 撤退 / 训练

test("撤退：只结束当前这一场仗，编制与已走指令都保留，之后还能接着打", () => {
  const run = freshRun();
  const formation: SagaCommand = { k: "formation", f: "fengshi" };
  const prelude = replaySagaRun(run, [formation]).state;
  const rounds = autoBattleRounds(run, 0, prelude);
  assert.equal(rounds.length > 0, true, "自动行军能打出可复现的回合");

  const fought = replaySagaRun(run, [
    formation,
    { k: "battle", node: 0, rounds: [] },
    { k: "retreat" },
  ]);
  assert.equal(fought.state.scene, "field", "撤退后回到大地图");
  assert.equal(fought.state.battle, null);
  assert.equal(fought.state.save.formation, "fengshi", "战前变更的阵型没有丢");
  assert.equal(fought.state.clearedNodes.length, 0);

  const carried = replaySagaRun(run, [
    formation,
    { k: "battle", node: 0, rounds: [] },
    { k: "retreat" },
    { k: "battle", node: 0, rounds },
  ]);
  assert.equal(carried.state.scene === "won" || carried.state.scene === "field", true);
  assert.deepEqual(carried.state.clearedNodes, [0], "撤退之后下一次进攻照常结算");
  assert.equal(carried.state.save.formation, "fengshi");

  assert.deepEqual(sanitizeSagaCommands([{ k: "retreat" }, { junk: true }]), [{ k: "retreat" }]);
});

test("训练场：逐级计价，上限随平定数增长并封顶 30", () => {
  assert.equal(SAGA_TRAINING_ITEM_ID, "training");
  assert.equal(SAGA_TRAINING_TICKETS_PER_LEVEL, 2);
  const save = initialTrialSave();
  assert.equal(trainingLevelCap(save), 9, "初到涿郡可练到 9 级");
  assert.equal(trainingCost(1, 10), 18);
  assert.equal(trainingCost(7, 7), 0);
  assert.equal(trainingCost(9, 4), 0);

  save.stats.wins = 3;
  assert.equal(trainingLevelCap(save), 18, "每平定一处 +3 级");
  save.stats.wins = 20;
  assert.equal(trainingLevelCap(save), SAGA_MAX_LEVEL, "封顶 30 级");

  save.stats.wins = 0;
  const guanyu = findGeneral(save, "guanyu");
  assert.ok(guanyu);
  assert.equal(trainGeneral(save, "guanyu", 30), 8, "不超过上限时逐级练到 9 级");
  assert.equal(guanyu.level, 9);
  assert.equal(trainGeneral(save, "guanyu", 5), 0, "已在目标等级以上不重复收费");
  assert.equal(trainGeneral(save, "nobody", 10), 0);
});

test("训练购买记录：解析留档，重放按购买位置抬到目标等级", () => {
  const run = easyRun();
  run.purchases = [
    {
      id: "train-1",
      itemId: SAGA_TRAINING_ITEM_ID,
      tickets: 10,
      generalId: "guanyu",
      targetLevel: 6,
      at: 1,
      cmdIndex: 0,
    },
  ];
  const parsed = parseSagaRun(JSON.stringify(run));
  assert.ok(parsed);
  assert.equal(parsed.purchases.length, 1);
  assert.equal(parsed.purchases[0].generalId, "guanyu");
  assert.equal(parsed.purchases[0].targetLevel, 6);

  const replay = replaySagaRun(run, []);
  assert.equal(findGeneral(replay.state.save, "guanyu")?.level, 6);

  const dropped = parseSagaRun(
    JSON.stringify({
      ...run,
      purchases: [
        { id: "train-2", itemId: SAGA_TRAINING_ITEM_ID, tickets: 2, generalId: "nobody", targetLevel: 5, at: 1, cmdIndex: 0 },
      ],
    }),
  );
  assert.ok(dropped);
  assert.equal(dropped.purchases.length, 0, "查无此人的训练记录被丢弃");
});

test("战斗点选：人多时命中框重叠，按距离取最近的敌将", () => {
  const view = makeSagaView(540);
  // 5 个敌将时 slot 间距只有 29，横向错位 40，命中框必然互相覆盖。
  const battle = { enemies: Array.from({ length: 5 }, () => ({})) } as unknown as SagaBattleState;
  assert.equal(battleEnemyAtPoint(view, battle, 722, 190), 0, "点第 1 个敌将");
  assert.equal(battleEnemyAtPoint(view, battle, 682, 277), 3, "点第 4 个敌将，不能被前面的框截走");
  assert.equal(battleEnemyAtPoint(view, battle, 20, 20), -1, "点空地不选人");
});
