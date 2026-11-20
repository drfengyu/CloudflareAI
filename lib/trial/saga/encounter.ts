/**
 * 野外遭遇战：行军大地图上随机撞见的散兵、山贼、海贼与盗贼。
 *
 * 编成只由「行军种子 + 本次第几场遭遇」推出，客户端即时开战、服务端收兵重放都用
 * 同一份纯函数，随机多少队、有没有将领都不需要上传。遭遇不设场次上限，也不设战后冷却，
 * 只要跨入新的野外格子就可能再撞上；出城后官道、草地、海边滩涂与树林都会遇敌，
 * 只有城墙、城门洞与城内校场安全。
 */

import {
  SAGA_CHAPTERS,
  SAGA_FORMATIONS,
  SAGA_GENERAL_BY_ID,
  tacticsFor,
  traitStats,
  traitsForRules,
} from "./data";
import {
  SAGA_MAX_COMMANDS,
  SAGA_MAX_LEVEL,
  SAGA_STAT_CAP,
  sagaV18Speed,
  sagaV18Stat,
  type SagaEnemy,
  type SagaFieldBattleContext,
  type SagaNode,
  type SagaRun,
} from "./types";
import { troopBaseline } from "./state";

interface FoeTemplate {
  key: "soldier" | "bandit" | "pirate" | "thief";
  name: string;
  title: string;
  group: string;
  blurb: string;
  force: number;
  intellect: number;
  defense: number;
  speed: number;
  baseTroops: number;
  growth: number;
  color: string;
  accent: string;
}

/** 三类杂兵：兵士守得稳、山贼攻得狠、盗贼跑得快。 */
const FOES: FoeTemplate[] = [
  {
    key: "soldier",
    name: "兵士",
    title: "散兵",
    group: "散兵游勇",
    blurb: "一队溃散兵士在野地里游荡，撞上便是一场厮杀。",
    force: 60,
    intellect: 26,
    defense: 62,
    speed: 50,
    baseTroops: 95,
    growth: 7,
    color: "#475569",
    accent: "#e2e8f0",
  },
  {
    key: "bandit",
    name: "山贼",
    title: "落草",
    group: "山贼拦路",
    blurb: "山贼从林间杀出，横刀拦路，摆明了要劫这趟行军。",
    force: 72,
    intellect: 20,
    defense: 48,
    speed: 54,
    baseTroops: 100,
    growth: 7,
    color: "#a16207",
    accent: "#fde68a",
  },
  {
    key: "thief",
    name: "盗贼",
    title: "飞贼",
    group: "盗贼伏击",
    blurb: "盗贼摸进行军路线，想趁队伍不备劫走粮草辎重。",
    force: 58,
    intellect: 36,
    defense: 40,
    speed: 74,
    baseTroops: 80,
    growth: 6,
    color: "#7c3aed",
    accent: "#ddd6fe",
  },
];

/** v4 起的第四类杂兵：海边滩涂登岸的海贼。 */
const PIRATE: FoeTemplate = {
  key: "pirate",
  name: "海贼",
  title: "水匪",
  group: "海贼劫掠",
  blurb: "海贼趁潮水登岸，抢完粮船又来劫这趟行军的辎重。",
  force: 66,
  intellect: 18,
  defense: 46,
  speed: 58,
  baseTroops: 92,
  growth: 7,
  color: "#0e7490",
  accent: "#cffafe",
};

/** v4 之前的编成只在这三类里抽，旧行军重放时结果与改版前一致。 */
const FOES_V4: FoeTemplate[] = [...FOES, PIRATE];

const SQUAD_MARKS = ["甲", "乙", "丙", "丁"];

const clampInt = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.trunc(value)));

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

function leaderEnemy(
  leaderId: string,
  chapterIndex: number,
  ordinal: number,
  level: number,
  troops: number,
  rules: number,
): SagaEnemy {
  const def = SAGA_GENERAL_BY_ID.get(leaderId) ?? SAGA_GENERAL_BY_ID.get("huangjin_lishi")!;
  const bonus = traitStats(def, rules);
  if (rules >= 18) {
    // v18：武 / 智按 2.5 倍铺进 255 区间，速仍按旧刻度；攻防成长与装备在 buildBattle 里结算。
    const force = sagaV18Stat(def.force, bonus.force);
    const intellect = sagaV18Stat(def.intellect, bonus.intellect);
    const speed = sagaV18Speed(def.speed, bonus.speed);
    return {
      id: def.id,
      name: def.name,
      title: def.title,
      level,
      troops,
      maxTroops: troops,
      force,
      intellect,
      defense: Math.min(SAGA_STAT_CAP, Math.round(force * 0.8 + bonus.defense)),
      speed,
      tactics: tacticsFor(def, level),
      traits: traitsForRules(def, rules),
      color: def.color,
      accent: def.accent,
      recruitable: false,
      recruitHard: false,
      boss: false,
    };
  }
  // v13 起野外领头的敌将也按「同等级我方基准 × 1.3~2.3」给兵；旧规则仍走原曲线重放。
  const scaledLevel =
    rules >= 17
      ? 1 + chapterIndex * 13 + Math.floor(ordinal / 3)
      : 1 + chapterIndex * 4 + Math.floor(ordinal / 3);
  const legacyLevel =
    rules >= 17 ? Math.min(SAGA_MAX_LEVEL, scaledLevel, level) : Math.min(SAGA_MAX_LEVEL, scaledLevel);
  const legacyTroops =
    rules >= 13
      ? Math.round(
          troopBaseline(legacyLevel, rules) *
            (rules >= 17
              ? 1.0 + 0.5 * Math.min(1, Math.max(0, (def.baseTroops - 120) / 140))
              : 1.3 + 1.0 * Math.min(1, Math.max(0, (def.baseTroops - 120) / 140))),
        )
      : Math.max(50, Math.round((def.baseTroops + legacyLevel * def.growth) * (1 + chapterIndex * 0.05) * 0.8));
  return {
    id: def.id,
    name: def.name,
    title: def.title,
    level: legacyLevel,
    troops: legacyTroops,
    maxTroops: legacyTroops,
    force: Math.min(SAGA_STAT_CAP, def.force + bonus.force + Math.floor(legacyLevel * 1.3)),
    intellect: Math.min(
      SAGA_STAT_CAP,
      def.intellect + bonus.intellect + Math.floor(legacyLevel * 0.9),
    ),
    defense: Math.min(
      SAGA_STAT_CAP,
      def.defense + bonus.defense + Math.floor(legacyLevel * 1.1),
    ),
    speed: Math.min(SAGA_STAT_CAP, def.speed + bonus.speed + Math.floor(legacyLevel * 0.6)),
    tactics: tacticsFor(def, legacyLevel),
    traits: def.traits,
    color: def.color,
    accent: def.accent,
    // 编成里先记「不可招」：v7 起由 `buildBattle` 按野外遭遇判定开放（营寨 / 攻城一律不可招），
    // 旧规则（v6 及更早）重放时仍按这份编成，已经打过的仗不会因为改版翻盘。
    recruitable: false,
    recruitHard: false,
    boss: false,
  };
}

function squadEnemy(
  foe: FoeTemplate,
  chapterIndex: number,
  ordinal: number,
  slot: number,
  withLeader: boolean,
  rules: number,
  partyLevel: number,
  level: number,
  troops: number,
): SagaEnemy {
  if (rules >= 18) {
    return {
      id: `foe_${foe.key}_${ordinal}_${slot}`,
      name: `${foe.name}${SQUAD_MARKS[slot] ?? slot + 1}`,
      title: foe.title,
      level,
      troops,
      maxTroops: troops,
      force: sagaV18Stat(foe.force),
      intellect: sagaV18Stat(foe.intellect),
      defense: Math.min(SAGA_STAT_CAP, Math.round(foe.force * 0.8)),
      speed: sagaV18Speed(foe.speed),
      tactics: [],
      poor: true,
      color: foe.color,
      accent: foe.accent,
      recruitable: false,
      recruitHard: false,
      boss: false,
    };
  }
  // v6 起野外杂兵整体降到「章节 × 2 + 场次 / 3」，比旧规则的「章节 × 3 + 场次 / 2」低一截；
  // v17 起主线拉长到 100 级，杂兵改为「章节 × 8」，但最高不超过队伍最高级，避免越打越离谱。
  const scaledLevel =
    rules >= 17
      ? 1 + chapterIndex * 8 + Math.floor(ordinal / 3)
      : rules >= 6
        ? 1 + chapterIndex * 2 + Math.floor(ordinal / 3)
        : 1 + chapterIndex * 3 + Math.floor(ordinal / 2);
  const legacyLevel =
    rules >= 17
      ? Math.min(SAGA_MAX_LEVEL, scaledLevel, partyLevel)
      : scaledLevel;
  const legacyTroops =
    rules >= 13
      ? Math.round(
          troopBaseline(legacyLevel, rules) *
            (rules >= 17
              ? 0.9 + 0.3 * Math.min(1, Math.max(0, (foe.baseTroops - 60) / 120))
              : 1.2 + 0.5 * Math.min(1, Math.max(0, (foe.baseTroops - 60) / 120))) *
            (withLeader ? 1.05 : 1),
        )
      : Math.max(
          40,
          Math.round(
            (foe.baseTroops + legacyLevel * foe.growth) *
              (1 + chapterIndex * 0.07) *
              (withLeader ? 0.9 : 1),
          ),
        );
  return {
    id: `foe_${foe.key}_${ordinal}_${slot}`,
    name: `${foe.name}${SQUAD_MARKS[slot] ?? slot + 1}`,
    title: foe.title,
    level: legacyLevel,
    troops: legacyTroops,
    maxTroops: legacyTroops,
    force: Math.min(SAGA_STAT_CAP, foe.force + Math.floor(legacyLevel * 1.1)),
    intellect: Math.min(SAGA_STAT_CAP, foe.intellect + Math.floor(legacyLevel * 0.6)),
    defense: Math.min(SAGA_STAT_CAP, foe.defense + Math.floor(legacyLevel * 1)),
    speed: Math.min(SAGA_STAT_CAP, foe.speed + Math.floor(legacyLevel * 0.5)),
    tactics: [],
    // 杂兵的兵器甲胄比同级敌将低两档（v6 起；v4/v5 低一档），见 `buildBattle` 的装备档位。
    poor: true,
    color: foe.color,
    accent: foe.accent,
    recruitable: false,
    recruitHard: false,
    boss: false,
  };
}

/**
 * 第 ordinal 场野外遭遇（从 0 起）的敌军编成；同种子同序号结果固定。
 * 1~4 队：可能全是兵士 / 山贼 / 海贼 / 盗贼，也可能由一名本章敌将领头。
 * v4 之前只有前三种杂兵，旧行军按原编成重放；
 * v6 起杂兵等级降为「章节 × 2 + 场次 / 3」，v5 及更早仍按原等级重放。
 * v17 起野外按队伍最高等级封顶：10 级前后只放 1 队、15 级 2 队、30 级 3 队、45 级以后才放满 4 队。
 */
export function sagaEncounterFor(
  run: SagaRun,
  ordinal: number,
  rules: number,
  context?: SagaFieldBattleContext,
): SagaNode {
  const index = clampInt(ordinal, 0, SAGA_MAX_COMMANDS - 1);
  const chapter =
    SAGA_CHAPTERS[clampInt(run.startSave.chapter, 0, SAGA_CHAPTERS.length - 1)];
  const fallbackPartyLevel = Math.max(
    1,
    ...run.startSave.party.map((general) => Math.max(1, Math.trunc(general.level))),
  );
  const partyLevel =
    context?.level ??
    (rules >= 18
      ? Math.max(
          1,
          Math.round(
            run.startSave.party.reduce(
              (sum, general) => sum + Math.max(1, Math.trunc(general.level)),
              0,
            ) / Math.max(1, run.startSave.party.length),
          ),
        )
      : fallbackPartyLevel);
  const avgTroops =
    context?.avgTroops ??
    Math.max(
      1,
      Math.round(
        troopBaseline(partyLevel, rules) *
          (run.startSave.party.reduce(
            (sum, general) =>
              sum +
              (SAGA_GENERAL_BY_ID.get(general.id)?.baseTroops ?? 180),
            0,
          ) /
            Math.max(1, run.startSave.party.length) /
            210),
      ),
    );
  const partySize = context?.partySize ?? run.startSave.party.length;
  const rng = mulberry32((run.seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0);
  const foe = pick(rng, rules >= 4 ? FOES_V4 : FOES);

  if (rules >= 18) {
    // v18：野外等级跟当前队伍平均等级走，不再看第几场；出战人数随机，
    // 前期不超过我方队伍人数，任何时期最多 5 人。
    const maxEnemies = Math.min(
      5,
      Math.max(1, partyLevel < 15 ? Math.min(5, partySize) : 5),
    );
    const enemyCount = 1 + Math.floor(rng() * maxEnemies);
    const hasLeader = enemyCount >= 2 ? rng() < 0.58 : rng() < 0.35;
    // 敌将兵力 = 我方平均兵力 × 0.8~6；权重大头压在低倍率，6 倍是少数硬仗。
    const anchorFactor = 0.8 + Math.pow(rng(), 1.8) * 5.2;
    const anchorTroops = Math.max(1, Math.round(avgTroops * anchorFactor));
    const enemies: SagaEnemy[] = [];
    let leaderName = "";
    if (hasLeader) {
      const leader = leaderEnemy(
        pick(rng, chapter.field),
        chapter.index,
        index,
        partyLevel,
        anchorTroops,
        rules,
      );
      leaderName = leader.name;
      enemies.push(leader);
    }
    // 杂兵严格低于敌方武将一半：18%~45% 锚点兵力。
    while (enemies.length < enemyCount) {
      const slot = enemies.filter((row) => row.poor).length;
      const mobTroops = Math.max(1, Math.round(anchorTroops * (0.18 + rng() * 0.27)));
      enemies.push(
        squadEnemy(
          foe,
          chapter.index,
          index,
          slot,
          hasLeader,
          rules,
          partyLevel,
          Math.min(SAGA_MAX_LEVEL, Math.max(1, partyLevel - 1)),
          mobTroops,
        ),
      );
    }
    const rewardGold =
      8 + chapter.index * 4 + enemies.length * 4 + (hasLeader ? 12 : 0) + Math.floor(index / 2) * 2;
    const rewardExp =
      8 + chapter.index * 3 + enemies.length * 3 + (hasLeader ? 10 : 0) + Math.floor(index / 2);
    const name = hasLeader ? `${foe.group}·${leaderName}` : foe.group;
    return {
      kind: "battle",
      name,
      blurb: `${foe.blurb}${hasLeader ? `领头的正是${leaderName}。` : ""}`.slice(0, 120),
      chapter: chapter.index,
      enemies,
      rewardGold,
      rewardExp,
      enemyFormation: pick(rng, SAGA_FORMATIONS).id,
    };
  }

  const hasLeader = rng() < 0.38;
  const squadCap =
    rules >= 17 ? (fallbackPartyLevel >= 45 ? 4 : fallbackPartyLevel >= 30 ? 3 : fallbackPartyLevel >= 15 ? 2 : 1) : 4;
  const squad = 1 + Math.floor(rng() * squadCap);
  const enemies: SagaEnemy[] = [];
  let leaderName = "";
  if (hasLeader) {
    const leader = leaderEnemy(
      pick(rng, chapter.field),
      chapter.index,
      index,
      fallbackPartyLevel,
      0,
      rules,
    );
    leaderName = leader.name;
    enemies.push(leader);
  }
  for (let slot = 0; slot < squad; slot++) {
    enemies.push(
      squadEnemy(
        foe,
        chapter.index,
        index,
        slot,
        hasLeader,
        rules,
        fallbackPartyLevel,
        0,
        0,
      ),
    );
  }
  const rewardGold =
    8 + chapter.index * 4 + enemies.length * 4 + (hasLeader ? 12 : 0) + Math.floor(index / 2) * 2;
  const rewardExp =
    8 + chapter.index * 3 + enemies.length * 3 + (hasLeader ? 10 : 0) + Math.floor(index / 2);
  const name = hasLeader ? `${foe.group}·${leaderName}` : foe.group;
  return {
    kind: "battle",
    name,
    blurb: `${foe.blurb}${hasLeader ? `领头的正是${leaderName}。` : ""}`.slice(0, 120),
    chapter: chapter.index,
    enemies,
    rewardGold,
    rewardExp,
    enemyFormation: pick(rng, SAGA_FORMATIONS).id,
  };
}
