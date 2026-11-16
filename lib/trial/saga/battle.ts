import {
  SAGA_FORMATION_BY_ID,
  SAGA_GENERAL_BY_ID,
  SAGA_ITEM_BY_ID,
  SAGA_TACTIC_BY_ID,
  SAGA_TRAIT_BY_ID,
  sagaBondsFor,
  sagaCorpsOf,
  tacticsFor,
} from "./data";
import { sagaEncounterFor } from "./encounter";
import { forgeStat } from "./forge";
import { generalStats, grantGeneralExp, recruitToSave, findGeneral, troopBaseline } from "./state";
import {
  SAGA_PARTY_SIZE,
  type SagaBattleEvent,
  type SagaBattleGeneral,
  type SagaBattleState,
  type SagaCorps,
  type SagaItemDef,
  type SagaNode,
  type SagaReplayState,
  type SagaRoundCommand,
  type SagaRun,
  type SagaTraitId,
  type TacticId,
} from "./types";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * v8 及更早的药品回复口径。v9 把双方兵力翻倍、药品按两倍兵力同步，
 * 旧行军重放时仍按原值结算，已经打过的战报不会因为改版翻盘。
 */
const LEGACY_HEAL: Record<string, number> = {
  herb: 60,
  medicine: 150,
  jinchuang: 300,
  dahuan: 600,
  junliang: 200,
  lingzhi: 450,
};

function nextRand(state: number): { value: number; state: number } {
  const a = (state + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: a };
}

function roll(battle: SagaBattleState): number {
  const next = nextRand(battle.rngState);
  battle.rngState = next.state;
  return next.value;
}

function formationAtk(id: SagaBattleState["playerFormation"]): number {
  return (SAGA_FORMATION_BY_ID.get(id)?.atk ?? 100) / 100;
}

function formationDef(id: SagaBattleState["playerFormation"]): number {
  return (SAGA_FORMATION_BY_ID.get(id)?.def ?? 100) / 100;
}

function formationSpd(id: SagaBattleState["playerFormation"]): number {
  return (SAGA_FORMATION_BY_ID.get(id)?.spd ?? 100) / 100;
}

function counterMod(attacker: SagaBattleState["playerFormation"], defender: SagaBattleState["playerFormation"]): number {
  const a = SAGA_FORMATION_BY_ID.get(attacker);
  const d = SAGA_FORMATION_BY_ID.get(defender);
  if (!a || !d) return 1;
  if (a.beats === defender) return 1.12;
  if (d.beats === attacker) return 0.92;
  return 1;
}

const living = (list: SagaBattleGeneral[]): SagaBattleGeneral[] => list.filter((g) => !g.downed);

/** 本回合行动顺序：有效速度（含阵型加成）从高到低，同速玩家先手。 */
export function battleTurnOrder(battle: SagaBattleState): SagaBattleGeneral[] {
  return [...living(battle.party), ...living(battle.enemies)].sort((a, b) => {
    const aSpeed =
      a.speed * formationSpd(a.side === "player" ? battle.playerFormation : battle.enemyFormation);
    const bSpeed =
      b.speed * formationSpd(b.side === "player" ? battle.playerFormation : battle.enemyFormation);
    if (bSpeed !== aSpeed) return bSpeed - aSpeed;
    if (a.side !== b.side) return a.side === "player" ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

/** 汇总一组特性上的某项数值，没有特性时为 0。 */
function traitTotalOf(
  ids: readonly SagaTraitId[] | undefined,
  key: "crit" | "extraAttack" | "attackPct" | "damageCut" | "tacticPoints" | "tacticPct",
): number {
  let total = 0;
  for (const id of ids ?? []) {
    const trait = SAGA_TRAIT_BY_ID.get(id);
    const value = trait?.[key];
    if (typeof value === "number") total += value;
  }
  return total;
}

function traitTotal(
  unit: SagaBattleGeneral,
  key: "crit" | "extraAttack" | "attackPct" | "damageCut" | "tacticPoints" | "tacticPct",
): number {
  return traitTotalOf(unit.traits, key);
}

function tacticName(id: TacticId): string {
  return SAGA_TACTIC_BY_ID.get(id)?.name ?? id;
}

/** 敌军按等级发装备：同一档兵器 / 甲胄，让敌情面板里看得到、打起来也算数。 */
const GEAR_TIERS = {
  weapon: ["iron_sword", "spear", "blade", "guandao"],
  armor: ["cloth", "leather", "iron_armor", "heavy_armor"],
} as const;

/** 每 `step` 级升一档；杂兵传 -2 拿低两档的旧兵器（v4/v5 传 -1）。v5 起改成 5 级一档。 */
function gearTierFor(level: number, shift = 0, step = 8): number {
  return clamp(Math.floor((level - 1) / step) + shift, 0, GEAR_TIERS.weapon.length - 1);
}

/** 装备的随机强化等级：等级越高越容易强化，杂兵最多 +1。 */
function gearPlusFor(rng: () => number, level: number, poor: boolean): number {
  const cap = poor ? 1 : Math.min(3, 1 + Math.floor(level / 8));
  return Math.floor(rng() * (cap + 1));
}

function tierGear(tier: number, weaponPlus = 0, armorPlus = 0): {
  weapon: string;
  armor: string;
  weaponAtk: number;
  armorDef: number;
  weaponPlus: number;
  armorPlus: number;
} {
  const weapon = GEAR_TIERS.weapon[clamp(tier, 0, GEAR_TIERS.weapon.length - 1)];
  const armor = GEAR_TIERS.armor[clamp(tier, 0, GEAR_TIERS.armor.length - 1)];
  return {
    weapon,
    armor,
    // 强化加成按铁匠铺同一口径：每级两成基础属性。
    weaponAtk: forgeStat(weapon, weaponPlus),
    armorDef: forgeStat(armor, armorPlus),
    weaponPlus,
    armorPlus,
  };
}

function seedRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 营地 / 攻城战按种子补进来的士兵位；人数由上层按双方 5 人上限算好。 */
const SOLDIER_NAMES = ["步卒", "刀盾兵", "长矛兵", "弓手", "轻骑"];
const SOLDIER_MARKS = ["甲", "乙", "丙", "丁", "戊"];

function buildSoldier(
  node: SagaNode,
  nodeIndex: number,
  slot: number,
  rules: number,
  rng: () => number,
): SagaBattleGeneral {
  const chapter = Math.max(0, node.chapter);
  const level =
    1 +
    chapter * 4 +
    nodeIndex +
    (node.kind === "boss" ? 2 : node.kind === "elite" ? 1 : 0);
  const jitter = 0.9 + rng() * 0.2;
  // v13 起营中杂兵也按「同等级我方基准 × 1.4~2.0」给兵：站在营里的步卒不比将少太多。
  const troops =
    rules >= 13
      ? Math.max(
          120,
          Math.round(troopBaseline(level) * (1.4 + (slot % 3) * 0.2) * jitter),
        )
      : Math.max(60, Math.round((90 + level * 9) * (1 + chapter * 0.05) * jitter));
  const intellect = Math.max(12, Math.round(20 + level * 0.5));
  // v5 起 5 级一档并可能带随机强化；旧规则不多抽随机数，重放结果不变。
  const weaponPlus = rules >= 5 ? gearPlusFor(rng, level, true) : 0;
  const armorPlus = rules >= 5 ? gearPlusFor(rng, level, true) : 0;
  // v6 起营中杂兵也比敌将低两档，装备差距与野外杂兵保持一致。
  const gear = tierGear(
    gearTierFor(level, rules >= 6 ? -2 : -1, rules >= 5 ? 5 : 8),
    weaponPlus,
    armorPlus,
  );
  return {
    id: `guard_${nodeIndex}_${slot}`,
    name: `${SOLDIER_NAMES[slot % SOLDIER_NAMES.length]}${SOLDIER_MARKS[slot] ?? slot + 1}`,
    title: node.kind === "boss" ? "守城亲兵" : "营中步卒",
    side: "enemy",
    level,
    troops,
    maxTroops: troops,
    force: Math.round((52 + level * 1.2) * jitter),
    intellect,
    defense: Math.round((50 + level * 1.1) * jitter),
    speed: Math.round((44 + level * 0.6) * jitter),
    tactics: [],
    traits: [],
    corps:
      rules >= 10
        ? slot % SOLDIER_NAMES.length === 4
          ? "cavalry"
          : slot % SOLDIER_NAMES.length === 3
            ? "bow"
            : "spear"
        : "spear",
    bonds: [],
    bondAtk: 0,
    bondCut: 0,
    tacticPoints:
      rules >= 3
        ? Math.max(1, 2 + Math.floor(intellect / 20) + Math.floor(level / 6))
        : Math.max(1, 2 + Math.floor(intellect / 30)),
    weaponAtk: gear.weaponAtk,
    armorDef: gear.armorDef,
    weapon: gear.weapon,
    armor: gear.armor,
    weaponPlus: gear.weaponPlus,
    armorPlus: gear.armorPlus,
    color: "#57534e",
    accent: "#e7e5e4",
    guard: false,
    confused: 0,
    buff: 0,
    downed: false,
    recruitable: false,
    recruitHard: false,
    boss: false,
  };
}

/** 等级越高出手越重：1 级为基准，30 级约 +29%。 */
function skillFactor(level: number): number {
  return 1 + clamp(level - 1, 0, 29) * 0.01;
}

/** 命中率按双方智力差浮动：智力压制最多九成八，被压制至少六成五。 */
function hitChance(actor: SagaBattleGeneral, target: SagaBattleGeneral): number {
  return clamp(0.9 + (actor.intellect - target.intellect) / 400, 0.65, 0.98);
}

/**
 * 兵种克制：v10 起骑克弓、弓克枪、枪克骑；同兵种与旧规则一律 1 倍。
 * 导出给单测用，别在界面上再抄一份系数。
 */
export function corpsCounterFactor(
  rules: number,
  actor: SagaCorps,
  target: SagaCorps,
): number {
  if (rules < 10 || actor === target) return 1;
  const wins =
    (actor === "cavalry" && target === "bow") ||
    (actor === "bow" && target === "spear") ||
    (actor === "spear" && target === "cavalry");
  return wins ? 1.15 : 0.85;
}

/**
 * v10 起：按武将底子判兵种，同一侧凑齐名将连携就整队加成。
 * 只在 v10 及以后生效，旧行军重放保持原结果。
 */
function applyWarband(
  party: SagaBattleGeneral[],
  enemies: SagaBattleGeneral[],
  rules: number,
  log: SagaBattleEvent[],
): void {
  for (const unit of [...party, ...enemies]) {
    const def = SAGA_GENERAL_BY_ID.get(unit.id);
    if (def) unit.corps = rules >= 10 ? sagaCorpsOf(def) : "spear";
    else if (rules < 10) unit.corps = "spear";
    unit.bonds = [];
    unit.bondAtk = 0;
    unit.bondCut = 0;
  }
  if (rules < 10) return;
  const sides: { units: SagaBattleGeneral[]; side: "player" | "enemy" }[] = [
    { units: party, side: "player" },
    { units: enemies, side: "enemy" },
  ];
  for (const { units, side } of sides) {
    if (units.length === 0) continue;
    const bonds = sagaBondsFor(units.map((unit) => unit.id));
    for (const unit of units) {
      for (const bond of bonds) {
        unit.bonds.push(bond.name);
        unit.bondAtk += bond.attackPct ?? 0;
        unit.bondCut += bond.damageCut ?? 0;
        unit.speed += bond.speed ?? 0;
        unit.tacticPoints = Math.min(16, unit.tacticPoints + (bond.tacticPoints ?? 0));
      }
    }
    for (const bond of bonds) {
      const joined = bond.members
        .filter((id) => units.some((unit) => unit.id === id))
        .map((id) => SAGA_GENERAL_BY_ID.get(id)?.name ?? id);
      log.push({
        kind: "buff",
        side,
        actor: bond.name,
        text: `${bond.name} 生效：${joined.join("、")}（${bond.desc}）`,
      });
    }
  }
}

export function startBattle(run: SagaRun, nodeIndex: number, state: SagaReplayState): SagaBattleState {
  return buildBattle(
    run.nodes[nodeIndex],
    nodeIndex,
    (run.seed ^ ((nodeIndex + 1) * 0x9e3779b9)) >>> 0,
    state,
  );
}

/** 野外遭遇战：编成由种子与序号推出，节点下标记 -1，不占营地进度。 */
export function startEncounterBattle(
  run: SagaRun,
  ordinal: number,
  state: SagaReplayState,
): SagaBattleState {
  return buildBattle(
    sagaEncounterFor(run, ordinal, state.rules ?? 1),
    -1,
    (run.seed ^ Math.imul(ordinal + 101, 0x85ebca6b)) >>> 0,
    state,
  );
}

function buildBattle(
  node: SagaNode,
  nodeIndex: number,
  rngState: number,
  state: SagaReplayState,
): SagaBattleState {
  const buffs = state.buffs;
  const rules = state.rules ?? 1;
  const party: SagaBattleGeneral[] = state.save.party.map((saved) => {
    const def = SAGA_GENERAL_BY_ID.get(saved.id);
    const stats = generalStats(saved, state.save.gearLevels, rules);
    const maxTroops = Math.max(
      1,
      Math.round(stats.maxTroops * (1 + buffs.troopPct / 100)),
    );
    const stored = state.partyTroops[saved.id];
    const troops = clamp(stored ?? maxTroops, 0, maxTroops);
    return {
      id: saved.id,
      name: def?.name ?? saved.id,
      title: def?.title ?? "",
      side: "player",
      level: saved.level,
      troops,
      maxTroops,
      force: stats.force,
      intellect: stats.intellect,
      defense: stats.defense,
      speed: stats.speed + buffs.speed,
      tactics: rules >= 2 ? tacticsFor(def, saved.level) : def?.tactics ?? [],
      traits: rules >= 2 ? def?.traits ?? [] : [],
      corps: "spear",
      bonds: [],
      bondAtk: 0,
      bondCut: 0,
      // v3 起策略点主要看智力：每 20 点智力 +1，等级每 4 级再 +1；v12 起上限抬到 16，
      // 好让原版口径的高阶计策（6~12 点）放得动。
      tacticPoints:
        rules >= 3
          ? Math.min(
              16,
              2 +
                Math.floor(stats.intellect / 20) +
                Math.floor((saved.level - 1) / 4) +
                buffs.tacticPoints +
                traitTotalOf(def?.traits, "tacticPoints"),
            )
          : rules >= 2
            ? Math.min(
                16,
                2 +
                  Math.floor(stats.intellect / 30) +
                  Math.floor((saved.level - 1) / 3) +
                  buffs.tacticPoints +
                  traitTotalOf(def?.traits, "tacticPoints"),
              )
            : Math.min(9, 2 + Math.floor(stats.intellect / 30) + buffs.tacticPoints),
      weaponAtk: stats.weaponAtk,
      armorDef: stats.armorDef,
      weapon: saved.weapon,
      armor: saved.armor,
      color: def?.color ?? "#475569",
      accent: def?.accent ?? "#e2e8f0",
      guard: false,
      confused: 0,
      buff: 0,
      downed: troops <= 0,
      recruitable: false,
      recruitHard: false,
      boss: false,
    };
  });
  // v5 起敌方装备每 5 级升一档，并按种子滚一次强化；旧规则沿用 8 级一档、不强化。
  const gearStep = rules >= 5 ? 5 : 8;
  const poorShift = rules >= 6 ? -2 : -1;
  const gearRng = rules >= 5 ? seedRng((rngState ^ 0x2545f491) >>> 0) : null;
  // v7 起招降只在野外遭遇：营寨 / 精锐 / 攻城一律不可招。
  // v8 起野外「有名有姓的领头头目」都能劝降，不再看武将资料的 recruitable 白名单
  // （否则桃园起兵 / 徐州风云 / 赤壁之战这几章的野外一场都招不到人）；
  // 只有 `poor` 的杂兵和「黄巾力士」这种兵种型通用杂号不收。
  // v7 的行军仍按旧白名单重放，避免已经落下的招降指令结果翻盘。
  const fieldEncounter = nodeIndex < 0;
  const enemies: SagaBattleGeneral[] = node.enemies.slice(0, SAGA_PARTY_SIZE).map((enemy) => {
    const baseDef = SAGA_GENERAL_BY_ID.get(enemy.id);
    const fieldLeader = fieldEncounter && !enemy.poor && enemy.id !== "huangjin_lishi";
    const fieldLeaderV7 = fieldLeader && Boolean(baseDef?.recruitable);
    const recruitable =
      rules >= 8 ? fieldLeader : rules >= 7 ? fieldLeaderV7 : enemy.recruitable;
    const recruitHard =
      rules >= 8
        ? fieldLeader && Boolean(baseDef?.recruitHard)
        : rules >= 7
          ? fieldLeaderV7 && Boolean(baseDef?.recruitHard)
          : enemy.recruitHard;
    // v4 起杂兵也带装备，但比同级敌将低档：v6 起低两档，v4/v5 低一档；v3 只有敌将带装备。
    const gear =
      rules < 3 || (rules < 4 && enemy.poor)
        ? null
        : tierGear(
            gearTierFor(enemy.level, enemy.poor ? poorShift : 0, gearStep),
            gearRng ? gearPlusFor(gearRng, enemy.level, Boolean(enemy.poor)) : 0,
            gearRng ? gearPlusFor(gearRng, enemy.level, Boolean(enemy.poor)) : 0,
          );
    return {
      id: enemy.id,
      name: enemy.name,
      title: enemy.title,
      side: "enemy",
      level: enemy.level,
      troops: enemy.troops,
      maxTroops: enemy.maxTroops,
      force: enemy.force,
      intellect: enemy.intellect,
      defense: enemy.defense,
      speed: enemy.speed,
      tactics: enemy.tactics,
      traits: enemy.traits ?? [],
      corps: "spear",
      bonds: [],
      bondAtk: 0,
      bondCut: 0,
      tacticPoints:
        rules >= 3
          ? Math.max(2, 2 + Math.floor(enemy.intellect / 20) + Math.floor(enemy.level / 6))
          : rules >= 2
            ? Math.max(2, 2 + Math.floor(enemy.intellect / 30) + Math.floor(enemy.level / 6))
            : Math.max(2, 2 + Math.floor(enemy.intellect / 30)),
      weaponAtk: gear?.weaponAtk ?? 0,
      armorDef: gear?.armorDef ?? 0,
      weapon: gear?.weapon ?? null,
      armor: gear?.armor ?? null,
      weaponPlus: gear?.weaponPlus ?? 0,
      armorPlus: gear?.armorPlus ?? 0,
      color: enemy.color,
      accent: enemy.accent,
      guard: false,
      confused: 0,
      buff: 0,
      downed: false,
      recruitable,
      recruitHard,
      boss: enemy.boss,
    };
  });
  // 营寨与攻城战：按种子给敌方补 1~N 个士兵位，连同武将最多 5 人上场。
  if (rules >= 3 && nodeIndex >= 0) {
    const room = SAGA_PARTY_SIZE - enemies.length;
    if (room > 0) {
      const rng = seedRng((rngState ^ Math.imul(nodeIndex + 17, 0x27d4eb2f)) >>> 0);
      const count = 1 + Math.floor(rng() * room);
      for (let slot = 0; slot < count; slot++) {
        enemies.push(buildSoldier(node, nodeIndex, slot, rules, rng));
      }
    }
  }
  const openLog: SagaBattleEvent[] = [];
  applyWarband(party, enemies, rules, openLog);
  return {
    nodeIndex,
    nodeName: node.name,
    boss: node.kind === "boss",
    rules,
    round: 1,
    phase: "select",
    party,
    enemies,
    playerFormation: state.save.formation,
    enemyFormation: node.enemyFormation,
    target: 0,
    log: openLog,
    lastEvents: [],
    rngState,
    rewardGold: node.rewardGold,
    rewardExp: node.rewardExp,
    pendingRecruits: [],
    recruitOffers: [],
  };
}

function consumeItem(state: SagaReplayState, itemId: string): boolean {
  if ((state.inventory.bonus[itemId] ?? 0) > 0) {
    state.inventory.bonus[itemId] -= 1;
    if (state.inventory.bonus[itemId] <= 0) delete state.inventory.bonus[itemId];
    return true;
  }
  if ((state.save.bag[itemId] ?? 0) > 0) {
    state.save.bag[itemId] -= 1;
    if (state.save.bag[itemId] <= 0) delete state.save.bag[itemId];
    return true;
  }
  return false;
}

/**
 * 攻击力口径：普攻结算、战斗面板与头顶标签共用一份，
 * 免得界面上标的攻和实际打出来的伤害对不上。
 */
export function battleAttackPower(actor: SagaBattleGeneral): number {
  if (actor.side === "player") {
    return actor.force + actor.weaponAtk + actor.level * 2;
  }
  return Math.round(actor.force * 1.15) + actor.level * 3 + actor.weaponAtk;
}

function defenderDef(target: SagaBattleGeneral): number {
  return target.defense + target.armorDef + Math.floor(target.level * 0.8);
}

function dealDamage(
  battle: SagaBattleState,
  actor: SagaBattleGeneral,
  target: SagaBattleGeneral,
  events: SagaBattleEvent[],
): void {
  const attackerFormation = actor.side === "player" ? battle.playerFormation : battle.enemyFormation;
  const defenderFormation = actor.side === "player" ? battle.enemyFormation : battle.playerFormation;
  // v3 起普攻先判定命中：智力被压制的一方更容易被闪开。
  if (battle.rules >= 3 && roll(battle) > hitChance(actor, target)) {
    events.push({
      kind: "miss",
      side: actor.side,
      actor: actor.name,
      target: target.name,
      text: `${target.name} 看破攻势，${actor.name} 这一击落空`,
    });
    return;
  }
  const base = Math.max(
    8,
    battleAttackPower(actor) - Math.round(defenderDef(target) * 0.65),
  );
  const variance = 0.85 + roll(battle) * 0.3;
  const buffed = actor.buff > 0 ? 1.2 : 1;
  const guarded = target.guard ? 0.5 : 1;
  const attackPct = 1 + traitTotal(actor, "attackPct") + actor.bondAtk;
  const cut = 1 - Math.min(0.5, traitTotal(target, "damageCut") + target.bondCut);
  const corps = corpsCounterFactor(battle.rules, actor.corps, target.corps);
  const skill = battle.rules >= 3 ? skillFactor(actor.level) : 1;
  let damage = Math.max(
    4,
    Math.round(
      base *
        formationAtk(attackerFormation) *
        formationDef(defenderFormation) *
        counterMod(attackerFormation, defenderFormation) *
        buffed *
        guarded *
        attackPct *
        cut *
        corps *
        skill *
        variance,
    ),
  );
  const critChance = traitTotal(actor, "crit");
  const crit = critChance > 0 && roll(battle) < critChance;
  if (crit) damage = Math.round(damage * 1.7);
  target.troops = Math.max(0, target.troops - damage);
  const suffix = `${crit ? "（暴击）" : ""}${target.guard ? "（格挡）" : ""}${
    corps > 1 ? "（兵种克制）" : corps < 1 ? "（兵种受制）" : ""
  }`;
  events.push({
    kind: "attack",
    side: actor.side,
    actor: actor.name,
    target: target.name,
    amount: damage,
    crit,
    text: `${actor.name} 攻击 ${target.name}，-${damage} 兵力${suffix}`,
  });
  // 会心之外的第二段：无双 / 神速可按概率追击，追击按七成伤害结算。
  const extra = traitTotal(actor, "extraAttack");
  if (!target.downed && extra > 0 && roll(battle) < extra) {
    const extraDamage = Math.max(2, Math.round(damage * 0.7));
    target.troops = Math.max(0, target.troops - extraDamage);
    events.push({
      kind: "attack",
      side: actor.side,
      actor: actor.name,
      target: target.name,
      amount: extraDamage,
      text: `${actor.name} 乘势追击 ${target.name}，-${extraDamage} 兵力`,
    });
  }
  if (target.troops <= 0 && !target.downed) {
    target.downed = true;
    events.push({
      kind: "down",
      side: target.side,
      actor: target.name,
      target: target.name,
      text: `${target.name} 败退`,
    });
  }
}

/**
 * 计策结算：按计策表里的 `kind` 分家族走，威力取 `power`，
 * 结束统一按 `cost` 扣策略值。入门四计（炼火 / 赤心 / 疑心 / 鼓舞）系数为 1，
 * 与旧版战报的数值口径一致，旧行军重放不会翻账。
 */
function executeTactic(
  battle: SagaBattleState,
  actor: SagaBattleGeneral,
  tactic: TacticId,
  requestedTarget: number | undefined,
  events: SagaBattleEvent[],
): void {
  const def = SAGA_TACTIC_BY_ID.get(tactic);
  const allies = actor.side === "player" ? battle.party : battle.enemies;
  const foes = actor.side === "player" ? battle.enemies : battle.party;
  const foeFormation = actor.side === "player" ? battle.enemyFormation : battle.playerFormation;
  const allyFormation = actor.side === "player" ? battle.playerFormation : battle.enemyFormation;
  const tacticPct = 1 + traitTotal(actor, "tacticPct");
  const power = def?.power ?? 1;
  const name = def?.name ?? tacticName(tactic);
  const kind = def?.kind ?? "fire";

  const hitFoe = (foe: SagaBattleGeneral, raw: number, countered: number, allowHalf: boolean, skill: number) => {
    const resist = foe.intellect * (kind === "water" ? 0.5 : 0.4);
    const variance = 0.85 + roll(battle) * 0.3;
    let damage = Math.max(6, Math.round((raw - resist) * variance * countered * tacticPct * skill));
    if (allowHalf && roll(battle) < 0.22) damage = Math.round(damage * 0.5);
    foe.troops = Math.max(0, foe.troops - damage);
    events.push({
      kind: "tactic",
      side: actor.side,
      actor: actor.name,
      target: foe.name,
      amount: damage,
      text: `${actor.name} 施放${name}，${foe.name} -${damage} 兵力`,
    });
    if (foe.troops <= 0 && !foe.downed) {
      foe.downed = true;
      events.push({
        kind: "down",
        side: foe.side,
        actor: foe.name,
        target: foe.name,
        text: `${foe.name} 败退`,
      });
    }
  };

  switch (kind) {
    case "fire": {
      // 火系：打全体，吃阵形克制。
      const base = power * (actor.intellect * 0.6 + actor.level * 2);
      const skill = battle.rules >= 3 ? skillFactor(actor.level) : 1;
      for (const foe of living(foes)) {
        if (battle.rules >= 3 && roll(battle) > hitChance(actor, foe)) {
          events.push({
            kind: "miss",
            side: actor.side,
            actor: actor.name,
            target: foe.name,
            text: `${foe.name} 避开火势，未受${name}所伤`,
          });
          continue;
        }
        hitFoe(foe, base, counterMod(allyFormation, foeFormation), true, skill);
      }
      break;
    }
    case "water": {
      // 水系：打全体，水分开道路，不受阵形克制影响。
      const base = power * (actor.intellect * 0.55 + actor.level * 2);
      const skill = battle.rules >= 3 ? skillFactor(actor.level) : 1;
      for (const foe of living(foes)) {
        if (battle.rules >= 3 && roll(battle) > hitChance(actor, foe)) {
          events.push({
            kind: "miss",
            side: actor.side,
            actor: actor.name,
            target: foe.name,
            text: `${foe.name} 抢先避开水流，未受${name}所伤`,
          });
          continue;
        }
        hitFoe(foe, base, 1, true, skill);
      }
      break;
    }
    case "rock": {
      // 石系：砸单体，本作里单体最重，失去拒敌加成。
      const candidates = living(foes);
      const target =
        (typeof requestedTarget === "number" ? candidates[requestedTarget] : null) ??
        candidates.sort((a, b) => b.troops - a.troops)[0];
      if (!target) break;
      const chance = clamp(55 + (actor.intellect - target.intellect) / 2, 20, 90);
      if (roll(battle) * 100 >= chance) {
        events.push({
          kind: "miss",
          side: actor.side,
          actor: actor.name,
          target: target.name,
          text: `${target.name} 躲开落石，未受${name}所伤`,
        });
        break;
      }
      const base = power * (actor.intellect * 0.8 + actor.level * 3);
      hitFoe(target, base, counterMod(allyFormation, foeFormation), false, 1);
      break;
    }
    case "heal": {
      const candidates = living(allies).sort((a, b) => a.troops / a.maxTroops - b.troops / b.maxTroops);
      const target = candidates[0];
      if (target) {
        const heal = Math.max(20, Math.round(power * (actor.intellect * 0.8 + actor.level * 2 + 30) * tacticPct));
        const before = target.troops;
        target.troops = Math.min(target.maxTroops, target.troops + heal);
        events.push({
          kind: "heal",
          side: actor.side,
          actor: actor.name,
          target: target.name,
          amount: target.troops - before,
          text: `${actor.name} 施放${name}，${target.name} +${target.troops - before} 兵力`,
        });
      }
      break;
    }
    case "healAll": {
      const heal = Math.max(20, Math.round(power * (actor.intellect * 0.6 + actor.level * 2 + 20) * tacticPct));
      for (const ally of living(allies)) {
        const before = ally.troops;
        ally.troops = Math.min(ally.maxTroops, ally.troops + heal);
        const gained = ally.troops - before;
        if (gained <= 0) continue;
        events.push({
          kind: "heal",
          side: actor.side,
          actor: actor.name,
          target: ally.name,
          amount: gained,
          text: `${actor.name} 施放${name}，${ally.name} +${gained} 兵力`,
        });
      }
      break;
    }
    case "confuse": {
      const candidates = living(foes);
      const target =
        (typeof requestedTarget === "number" ? candidates[requestedTarget] : null) ??
        candidates.sort((a, b) => b.force + b.intellect - (a.force + a.intellect))[0];
      if (target) {
        const chance = clamp(50 + (actor.intellect - target.intellect) / 2, 20, 85);
        if (roll(battle) * 100 < chance) {
          const turns = Math.max(1, def?.turns ?? 2);
          target.confused = turns;
          events.push({
            kind: "confuse",
            side: actor.side,
            actor: actor.name,
            target: target.name,
            text: `${actor.name} 施放${name}，${target.name} 陷入混乱`,
          });
        } else {
          events.push({
            kind: "miss",
            side: actor.side,
            actor: actor.name,
            target: target.name,
            text: `${target.name} 看破了${name}`,
          });
        }
      }
      break;
    }
    case "trap": {
      const candidates = living(foes);
      const target =
        (typeof requestedTarget === "number" ? candidates[requestedTarget] : null) ??
        candidates.sort((a, b) => b.troops - a.troops)[0];
      if (target) {
        const chance = clamp(55 + (actor.intellect - target.intellect) / 2, 20, 88);
        if (roll(battle) * 100 < chance) {
          const loss = Math.max(6, Math.round(target.troops * power));
          target.troops = Math.max(0, target.troops - loss);
          events.push({
            kind: "tactic",
            side: actor.side,
            actor: actor.name,
            target: target.name,
            amount: loss,
            text: `${actor.name} 施放${name}，${target.name} 折损 ${loss} 兵力`,
          });
          if (target.troops <= 0 && !target.downed) {
            target.downed = true;
            events.push({
              kind: "down",
              side: target.side,
              actor: target.name,
              target: target.name,
              text: `${target.name} 败退`,
            });
          }
        } else {
          events.push({
            kind: "miss",
            side: actor.side,
            actor: actor.name,
            target: target.name,
            text: `${target.name} 察觉了${name}，未曾上当`,
          });
        }
      }
      break;
    }
    case "break": {
      // 解阵计：把敌军阵形打回散开（v12 起才有效）；敌军本来就散开时只算落空。
      if (actor.side === "player") {
        const broken = battle.enemyFormation;
        if (broken === "yulin") {
          events.push({
            kind: "miss",
            side: actor.side,
            actor: actor.name,
            text: `敌军本就没有布阵，${name}落空`,
          });
        } else {
          battle.enemyFormation = "yulin";
          events.push({
            kind: "buff",
            side: actor.side,
            actor: actor.name,
            text: `${actor.name} 施放${name}，敌军阵形散开`,
          });
        }
      } else {
        const broken = battle.playerFormation;
        if (broken !== "yulin") {
          battle.playerFormation = "yulin";
          events.push({
            kind: "buff",
            side: actor.side,
            actor: actor.name,
            text: `${actor.name} 施放${name}，我军阵形被破`,
          });
        }
      }
      break;
    }
    case "assassin": {
      // 暗杀计：单体即死，成算随智力差走，最高四成半。
      const candidates = living(foes);
      const target =
        (typeof requestedTarget === "number" ? candidates[requestedTarget] : null) ??
        candidates.sort((a, b) => b.troops - a.troops)[0];
      if (target) {
        const chance = clamp(12 + (actor.intellect - target.intellect) / 4, 4, 45);
        if (roll(battle) * 100 < chance) {
          const lost = target.troops;
          target.troops = 0;
          target.downed = true;
          events.push({
            kind: "down",
            side: target.side,
            actor: actor.name,
            target: target.name,
            amount: lost,
            text: `${actor.name} 施放${name}，${target.name} 当场毙命`,
          });
        } else {
          events.push({
            kind: "miss",
            side: actor.side,
            actor: actor.name,
            target: target.name,
            text: `${target.name} 逃过${name}`,
          });
        }
      }
      break;
    }
    case "buff": {
      for (const ally of living(allies)) ally.buff = Math.max(ally.buff, 3);
      events.push({
        kind: "buff",
        side: actor.side,
        actor: actor.name,
        text: `${actor.name} 擂鼓${name}，全队攻击提升`,
      });
      break;
    }
  }
  actor.tacticPoints = Math.max(0, actor.tacticPoints - (def?.cost ?? 1));
}

function executeItem(
  battle: SagaBattleState,
  actor: SagaBattleGeneral,
  item: SagaItemDef,
  state: SagaReplayState,
  events: SagaBattleEvent[],
): boolean {
  if (!consumeItem(state, item.id)) return false;
  if (item.supply === "revive") {
    const target = battle.party
      .filter((g) => g.downed)
      .sort((a, b) => b.maxTroops - a.maxTroops)[0];
    if (!target) {
      events.push({ kind: "miss", side: actor.side, actor: actor.name, text: "没有需要复活的武将" });
      return true;
    }
    target.downed = false;
    target.troops = Math.max(1, Math.round(target.maxTroops * 0.4));
    events.push({
      kind: "heal",
      side: actor.side,
      actor: actor.name,
      target: target.name,
      amount: target.troops,
      text: `${actor.name} 使用兵符，${target.name} 以 ${target.troops} 兵力归队`,
    });
    return true;
  }
  const candidates = living(battle.party).sort((a, b) => a.troops / a.maxTroops - b.troops / b.maxTroops);
  const target = candidates[0];
  if (!target) return false;
  const heal = item.supply === "heal" || item.id === "secret_medicine"
    ? target.maxTroops
    : battle.rules >= 9
      ? item.heal ?? 0
      : LEGACY_HEAL[item.id] ?? item.heal ?? 0;
  const before = target.troops;
  target.troops = Math.min(target.maxTroops, target.troops + heal);
  events.push({
    kind: "heal",
    side: actor.side,
    actor: actor.name,
    target: target.name,
    amount: target.troops - before,
    text: `${actor.name} 使用${item.name}，${target.name} +${target.troops - before} 兵力`,
  });
  return true;
}

function executeRecruit(
  battle: SagaBattleState,
  actor: SagaBattleGeneral,
  requestedTarget: number | undefined,
  events: SagaBattleEvent[],
): void {
  // v7 及更早：只有兵力 ≤ 35% 的敌将才可劝降（营寨时代的口径，旧战报按这个重放）。
  // v8 起：野外头目随时可以劝降，成功率随其剩余兵力递减——野外头目血少，
  // 「压到 35%」这个窗口常常被一击跨过，按旧门槛根本招不到人。
  const candidates = living(battle.enemies).filter(
    (enemy) => enemy.recruitable && (battle.rules >= 8 || enemy.troops <= enemy.maxTroops * 0.35),
  );
  const target =
    (typeof requestedTarget === "number" ? candidates[requestedTarget] : null) ??
    candidates.sort((a, b) => a.troops - b.troops)[0];
  if (!target) {
    events.push({ kind: "miss", side: actor.side, actor: actor.name, text: "没有可以招降的敌将" });
    return;
  }
  const base = 30 + (actor.level - target.level) * 4 + Math.floor((actor.intellect - target.intellect) / 2);
  const ratio = target.maxTroops > 0 ? target.troops / target.maxTroops : 1;
  const factor = battle.rules >= 8 && ratio > 0.35 ? (1 - ratio) / 0.65 : 1;
  const raw = base - (target.recruitHard ? 25 : 0);
  // v7 及更早仍按「5~80」的概率区间（旧战报要一模一样重放）。
  const chance =
    battle.rules >= 8 ? clamp(Math.round(raw * factor), 0, 80) : clamp(raw, 5, 80);
  if (chance > 0 && roll(battle) * 100 < chance) {
    target.downed = true;
    target.troops = 0;
    battle.pendingRecruits.push(target.id);
    events.push({
      kind: "recruit",
      side: actor.side,
      actor: actor.name,
      target: target.name,
      text: `${actor.name} 劝降成功，${target.name} 愿意归顺`,
    });
  } else {
    events.push({
      kind: "miss",
      side: actor.side,
      actor: actor.name,
      target: target.name,
      text: `${target.name} 拒绝归降`,
    });
  }
}

function aiCommand(battle: SagaBattleState, actor: SagaBattleGeneral): SagaRoundCommand {
  const playersAlive = living(battle.party);
  const enemiesAlive = living(battle.enemies);
  const target = playersAlive
    .map((g, index) => ({ index, ratio: g.troops / g.maxTroops }))
    .sort((a, b) => a.ratio - b.ratio)[0]?.index ?? 0;
  // 只挑策略值付得起的计策，按系别分工：先救急、再输出、最后才控制。
  const affordable = actor.tactics.filter((id) => (SAGA_TACTIC_BY_ID.get(id)?.cost ?? 1) <= actor.tacticPoints);
  if (affordable.length > 0 && roll(battle) < 0.34) {
    const healId = affordable
      .filter((id) => {
        const kind = SAGA_TACTIC_BY_ID.get(id)?.kind;
        return kind === "heal" || kind === "healAll";
      })
      .sort((a, b) => (SAGA_TACTIC_BY_ID.get(b)?.cost ?? 0) - (SAGA_TACTIC_BY_ID.get(a)?.cost ?? 0))[0];
    if (healId && enemiesAlive.some((g) => g.troops / g.maxTroops < 0.45)) {
      return { g: actor.id, a: "tactic", t: healId, target };
    }
    const damageId = affordable
      .filter((id) => {
        const kind = SAGA_TACTIC_BY_ID.get(id)?.kind;
        return kind === "rock" || kind === "fire" || kind === "water";
      })
      .sort((a, b) => (SAGA_TACTIC_BY_ID.get(b)?.cost ?? 0) - (SAGA_TACTIC_BY_ID.get(a)?.cost ?? 0))[0];
    if (damageId && playersAlive.length >= 2) return { g: actor.id, a: "tactic", t: damageId, target };
    const confuseId = affordable.find((id) => SAGA_TACTIC_BY_ID.get(id)?.kind === "confuse");
    if (confuseId && playersAlive.some((g) => g.confused === 0)) {
      return { g: actor.id, a: "tactic", t: confuseId, target };
    }
    const buffId = affordable.find((id) => SAGA_TACTIC_BY_ID.get(id)?.kind === "buff");
    if (buffId && enemiesAlive.every((g) => g.buff === 0)) {
      return { g: actor.id, a: "tactic", t: buffId };
    }
  }
  return { g: actor.id, a: "attack", target };
}

function executeCommand(
  battle: SagaBattleState,
  actor: SagaBattleGeneral,
  command: SagaRoundCommand,
  state: SagaReplayState,
  events: SagaBattleEvent[],
): void {
  if (command.a === "guard") {
    actor.guard = true;
    events.push({ kind: "guard", side: actor.side, actor: actor.name, text: `${actor.name} 举盾防守` });
    return;
  }
  if (command.a === "formation") {
    // 变阵已在回合开始前统一结算，轮到该将时本回合只做布阵动作、不再出手。
    return;
  }
  if (command.a === "tactic") {
    const tactic = command.t;
    const def = tactic ? SAGA_TACTIC_BY_ID.get(tactic) : null;
    if (tactic && actor.tactics.includes(tactic) && def && actor.tacticPoints >= def.cost) {
      executeTactic(battle, actor, tactic, command.target, events);
      return;
    }
  }
  if (command.a === "item" && actor.side === "player") {
    const item = command.i ? SAGA_ITEM_BY_ID.get(command.i) : null;
    if (item && (item.kind === "consumable" || item.kind === "supply") && executeItem(battle, actor, item, state, events)) {
      return;
    }
  }
  if (command.a === "recruit" && actor.side === "player") {
    executeRecruit(battle, actor, command.target, events);
    return;
  }
  const foes = actor.side === "player" ? battle.enemies : battle.party;
  const choices = living(foes);
  if (choices.length === 0) return;
  const target =
    (typeof command.target === "number" ? foes[command.target] : null) && !foes[command.target!]?.downed
      ? foes[command.target!]
      : choices[0];
  dealDamage(battle, actor, target, events);
}

function checkBattleEnd(battle: SagaBattleState): void {
  if (battle.phase !== "select") return;
  if (living(battle.enemies).length === 0) battle.phase = "won";
  else if (living(battle.party).length === 0) battle.phase = "lost";
}

/** v11：胜利后按本场种子滚出归降提议（标价金、聘礼与成功率都由种子确定）。 */
function buildRecruitOffers(battle: SagaBattleState, state: SagaReplayState): void {
  if (battle.rules < 11) return;
  const partyIntel = battle.party.length
    ? battle.party.reduce((sum, g) => sum + g.intellect, 0) / battle.party.length
    : 0;
  const partyLevel = battle.party.length
    ? battle.party.reduce((sum, g) => sum + g.level, 0) / battle.party.length
    : 1;
  for (const enemy of battle.enemies) {
    if (!SAGA_GENERAL_BY_ID.has(enemy.id)) continue;
    if (enemy.boss) continue;
    if (findGeneral(state.save, enemy.id)) continue;
    if (state.save.met.includes(enemy.id)) continue;
    if (roll(battle) >= 0.55) continue;
    const hard = enemy.recruitHard;
    const chance = clamp(
      45 + (partyIntel - enemy.intellect) * 0.8 - (enemy.level - partyLevel) * 3 - (hard ? 20 : 0),
      10,
      90,
    );
    const goldCost = 100 + enemy.level * 20 + (hard ? 220 : 0) + Math.round(enemy.force * 0.8);
    battle.recruitOffers.push({
      generalId: enemy.id,
      name: enemy.name,
      title: enemy.title,
      level: enemy.level,
      goldCost,
      itemId: null,
      itemCount: 0,
      chance: Math.round(chance),
      hard,
    });
  }
}

export interface RecruitOfferResult {
  ok: boolean;
  joined: "party" | "reserve" | null;
  text: string;
}

/**
 * v11：接受 / 婉拒一条胜利后的归降提议。接受才扣聘金，再按成功率掷一次；
 * 失败不入队、聘金不退。提议必须来自本场战报，旧存档没有提议时直接忽略。
 */
export function applyRecruitOffer(
  state: SagaReplayState,
  battle: SagaBattleState,
  generalId: string,
  accept: boolean,
): RecruitOfferResult {
  const offer = battle.recruitOffers.find((item) => item.generalId === generalId);
  if (!offer) return { ok: false, joined: null, text: "没有这条归降提议" };
  if (!accept) return { ok: true, joined: null, text: `${offer.name} 婉拒了归降` };
  if (state.save.gold < offer.goldCost) {
    return { ok: false, joined: null, text: `金不足，无法礼聘 ${offer.name}` };
  }
  state.save.gold -= offer.goldCost;
  if (roll(battle) * 100 >= offer.chance) {
    return { ok: false, joined: null, text: `${offer.name} 婉拒归降，聘金未退` };
  }
  const result = recruitToSave(state.save, generalId);
  if (result.ok) {
    state.recruited.push(generalId);
    if (result.joined === "party") {
      const saved = state.save.party.find((g) => g.id === generalId);
      if (saved) {
        const stats = generalStats(saved, state.save.gearLevels, battle.rules);
        state.partyTroops[generalId] = Math.round(
          stats.maxTroops * (1 + state.buffs.troopPct / 100),
        );
      }
    }
    return { ok: true, joined: result.joined, text: `${offer.name} 加入${result.joined === "party" ? "队伍" : "后备"}` };
  }
  return {
    ok: false,
    joined: null,
    text: `${offer.name} 未能入队：${result.reason ?? "队伍与后备已满"}`,
  };
}

function finishBattle(
  battle: SagaBattleState,
  state: SagaReplayState,
  events: SagaBattleEvent[],
): void {
  battle.phase = living(battle.enemies).length === 0 ? "won" : "lost";
  if (battle.phase === "won") {
    state.save.gold += battle.rewardGold;
    state.goldGained += battle.rewardGold;
    state.expGained += battle.rewardExp;
    state.battlesWon += 1;
    events.push({
      kind: "buff",
      side: "player",
      actor: "战报",
      text: `战斗胜利，获得 ${battle.rewardGold} 金、${battle.rewardExp} 经验`,
    });
    for (const saved of state.save.party) {
      const def = SAGA_GENERAL_BY_ID.get(saved.id);
      const name = def?.name ?? saved.id;
      const before = tacticsFor(def, saved.level);
      const levels = grantGeneralExp(saved, battle.rewardExp);
      if (levels > 0) {
        events.push({
          kind: "level",
          side: "player",
          actor: name,
          text: `${name} 升至 ${saved.level} 级`,
        });
        const learned =
          battle.rules >= 2
            ? tacticsFor(def, saved.level).filter((id) => !before.includes(id))
            : [];
        if (learned.length > 0) {
          events.push({
            kind: "buff",
            side: "player",
            actor: name,
            text: `${name} 领悟「${learned.map(tacticName).join("」「")}」`,
          });
        }
      }
    }
    buildRecruitOffers(battle, state);
    for (const enemy of battle.enemies) {
      // 杂兵与临时士兵位不在武将表里，图鉴只收真正的武将。
      if (!SAGA_GENERAL_BY_ID.has(enemy.id)) continue;
      state.save.met = [...new Set([...state.save.met, enemy.id])];
    }
    for (const id of battle.pendingRecruits) {
      const result = recruitToSave(state.save, id);
      const name = SAGA_GENERAL_BY_ID.get(id)?.name ?? id;
      if (result.ok) {
        state.recruited.push(id);
        if (result.joined === "party") {
          const saved = state.save.party.find((g) => g.id === id);
          if (saved) {
            const stats = generalStats(saved, state.save.gearLevels, battle.rules);
            state.partyTroops[id] = Math.round(stats.maxTroops * (1 + state.buffs.troopPct / 100));
          }
        }
        events.push({
          kind: "recruit",
          side: "player",
          actor: name,
          text: `${name} 加入${result.joined === "party" ? "队伍" : "后备"}`,
        });
      } else if (result.reason) {
        events.push({ kind: "miss", side: "player", actor: name, text: `${name} 未能入队：${result.reason}` });
      }
    }
    for (const general of battle.party) {
      if (general.downed) {
        general.troops = Math.max(1, Math.round(general.maxTroops * 0.2));
        general.downed = false;
      } else {
        general.troops = Math.min(
          general.maxTroops,
          general.troops + Math.round(general.maxTroops * 0.1),
        );
      }
      state.partyTroops[general.id] = general.troops;
    }
  } else {
    for (const general of battle.party) {
      state.partyTroops[general.id] = general.downed ? 0 : general.troops;
    }
    events.push({ kind: "down", side: "player", actor: "战报", text: "全军败退，回城休整" });
  }
}

/**
 * v12：战斗内变阵。变阵要在所有武将行动之前统一结算，
 * 否则会被速度顺序当成一次普攻打出去。下令的人活着的、阵形解锁了、
 * 策略值够付的才算布成；没布成的人本回合照常出手。
 */
function resolveFormationCommands(
  battle: SagaBattleState,
  roundCommands: SagaRoundCommand[],
  events: SagaBattleEvent[],
): SagaRoundCommand[] {
  if (battle.rules < 12) return roundCommands;
  const maxLevel = battle.party.reduce((top, general) => Math.max(top, general.level), 0);
  return roundCommands.map((command) => {
    if (command.a !== "formation") return command;
    const general = battle.party.find((unit) => unit.id === command.g);
    const next = command.f ? SAGA_FORMATION_BY_ID.get(command.f) : null;
    if (!general || general.downed || !next) return { g: command.g, a: "attack", target: battle.target };
    if (next.level > maxLevel) {
      events.push({
        kind: "miss",
        side: "player",
        actor: general.name,
        text: `${general.name} 修为还不到 ${next.level} 级，布不下${next.name}阵`,
      });
      return { g: command.g, a: "attack", target: battle.target };
    }
    if (general.tacticPoints < next.cost) {
      events.push({
        kind: "miss",
        side: "player",
        actor: general.name,
        text: `${general.name} 策略值不足 ${next.cost} 点，布不下${next.name}阵`,
      });
      return { g: command.g, a: "attack", target: battle.target };
    }
    general.tacticPoints -= next.cost;
    const before = battle.playerFormation;
    battle.playerFormation = next.id;
    events.push({
      kind: "buff",
      side: "player",
      actor: general.name,
      text:
        before === next.id
          ? `${general.name} 重整${next.name}阵，耗策略 ${next.cost}`
          : `${general.name} 变阵为${next.name}阵，耗策略 ${next.cost}`,
    });
    return command;
  });
}

export function resolveBattleRound(
  battle: SagaBattleState,
  roundCommands: SagaRoundCommand[],
  state: SagaReplayState,
): void {
  if (battle.phase !== "select") return;
  const events: SagaBattleEvent[] = [];
  const commands = resolveFormationCommands(battle, roundCommands, events);
  const byId = new Map(commands.map((command) => [command.g, command]));
  const actors = battleTurnOrder(battle);
  for (const actor of actors) {
    if (battle.phase !== "select") break;
    if (actor.downed) continue;
    if (actor.guard) actor.guard = false;
    if (actor.confused > 0) {
      actor.confused -= 1;
      if (roll(battle) < 0.45) {
        events.push({
          kind: "confuse",
          side: actor.side,
          actor: actor.name,
          text: `${actor.name} 混乱中，无法行动`,
        });
        continue;
      }
    }
    const command =
      actor.side === "player"
        ? byId.get(actor.id) ?? { g: actor.id, a: "attack" as const, target: battle.target }
        : aiCommand(battle, actor);
    executeCommand(battle, actor, command, state, events);
    checkBattleEnd(battle);
  }
  if (battle.phase === "select") {
    battle.round += 1;
    for (const general of [...battle.party, ...battle.enemies]) {
      if (general.buff > 0) general.buff -= 1;
    }
  } else {
    finishBattle(battle, state, events);
  }
  battle.lastEvents = events;
  battle.log = [...battle.log, ...events].slice(-48);
  const target = battle.enemies.findIndex((enemy) => !enemy.downed);
  if (target >= 0) battle.target = target;
}
