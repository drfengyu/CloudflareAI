import { WORKSHOP_LINES, WORKSHOP_TIER_COUNT } from "./config";
import {
  WORKSHOP_BOX_SIZE,
  WORKSHOP_MAX_LEVEL,
  WORKSHOP_PARTY_SIZE,
  WORKSHOP_POTION_HEAL,
  battleExp,
  createPet,
  gainExp,
  petName,
  petStats,
  petDexKeys,
  type WorkshopPet,
} from "./pets";
import {
  activePet,
  addPet,
  firstAlivePet,
  type WorkshopEncounter,
  type WorkshopState,
} from "./state";

/**
 * 红白机式遭遇战：区域刷野生灵宠、三个道馆按徽章顺序解锁。
 *
 * 客户端只发「这一回合做什么」，伤害、捕捉、掉落、经验全在服务端按这里的纯函数算，
 * 页面拿到的只是结算后的事件列表。随机数由调用方注入，单测可以固定序列。
 */

export type WorkshopMoveId = "tackle" | "signature";

export interface WorkshopMove {
  id: WorkshopMoveId;
  name: string;
  power: number;
  type: "normal" | string;
}

const SIGNATURE_MOVES: Record<string, string> = {
  ember: "火尾击",
  tide: "潮涌",
  verdant: "藤鞭",
};

const TYPE_ADVANTAGE: Record<string, string> = {
  ember: "verdant",
  verdant: "tide",
  tide: "ember",
};

export function movesFor(lineKey: string): WorkshopMove[] {
  return [
    { id: "tackle", name: "撞击", power: 35, type: "normal" },
    { id: "signature", name: SIGNATURE_MOVES[lineKey] ?? "本系技", power: 45, type: lineKey },
  ];
}

/** 本系技名字，图鉴/战斗里显示用。 */
export function signatureName(lineKey: string): string {
  return SIGNATURE_MOVES[lineKey] ?? "本系技";
}

export function typeMultiplier(attackType: string, defenderLine: string): number {
  if (attackType === "normal") return 1;
  if (TYPE_ADVANTAGE[attackType] === defenderLine) return 1.5;
  if (TYPE_ADVANTAGE[defenderLine] === attackType) return 0.67;
  return 1;
}

export interface WorkshopArea {
  key: string;
  name: string;
  desc: string;
  /** 需要的徽章数；0 = 开局就能去。 */
  unlockBadges: number;
  /** 第一条是本命线，出现概率 60%。 */
  lines: string[];
  tiers: [number, number];
  levels: [number, number];
}

export const WORKSHOP_AREAS: WorkshopArea[] = [
  {
    key: "ash",
    name: "灰烬原野",
    desc: "风里带着火星的枯草原，幼年灵宠在这里成群出没。",
    unlockBadges: 0,
    lines: ["ember", "verdant"],
    tiers: [1, 2],
    levels: [2, 6],
  },
  {
    key: "shore",
    name: "潮声浅滩",
    desc: "退潮后的礁石滩，海风把浪花推成一圈圈白线。",
    unlockBadges: 1,
    lines: ["tide", "ember"],
    tiers: [2, 4],
    levels: [6, 14],
  },
  {
    key: "grove",
    name: "苔语密林",
    desc: "树冠遮住天空的老林，藤蔓间有发光的脚印。",
    unlockBadges: 2,
    lines: ["verdant", "tide"],
    tiers: [4, 6],
    levels: [14, 24],
  },
  {
    key: "spire",
    name: "星陨高地",
    desc: "陨石砸出的环形高地，只有集齐三枚徽章才敢深入。",
    unlockBadges: 3,
    lines: ["ember", "tide", "verdant"],
    tiers: [6, 8],
    levels: [24, 40],
  },
];

export interface WorkshopGym {
  stage: number;
  name: string;
  leader: string;
  lineKey: string;
  tier: number;
  level: number;
  badge: string;
  desc: string;
}

export const WORKSHOP_GYMS: WorkshopGym[] = [
  {
    stage: 1,
    name: "岩砾道馆",
    leader: "花岗",
    lineKey: "verdant",
    tier: 4,
    level: 12,
    badge: "岩砾徽章",
    desc: "用藤蔓与硬岩磨出来的防守型道馆，第一课是「别硬碰」。",
  },
  {
    stage: 2,
    name: "潮汐道馆",
    leader: "澜",
    lineKey: "tide",
    tier: 6,
    level: 20,
    badge: "潮汐徽章",
    desc: "涨潮时地板会没入水中，节奏一乱就会被浪卷走。",
  },
  {
    stage: 3,
    name: "熔心道馆",
    leader: "炽",
    lineKey: "ember",
    tier: 8,
    level: 28,
    badge: "熔心徽章",
    desc: "终章道馆，馆主的炎心狐已经把火尾磨成了刀。",
  },
];

export function areaByKey(key: string): WorkshopArea | null {
  return WORKSHOP_AREAS.find((area) => area.key === key) ?? null;
}

export function gymByStage(stage: number): WorkshopGym | null {
  return WORKSHOP_GYMS.find((gym) => gym.stage === Math.trunc(stage)) ?? null;
}

export function nextGym(badges: number): WorkshopGym | null {
  return WORKSHOP_GYMS.find((gym) => gym.stage === Math.trunc(badges) + 1) ?? null;
}

function randomInt(random: () => number, min: number, max: number): number {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return low + Math.floor(Math.min(0.999999, Math.max(0, random())) * (high - low + 1));
}

function pickAreaLine(area: WorkshopArea, random: () => number): string {
  if (area.lines.length <= 1) return area.lines[0] ?? WORKSHOP_LINES[0].key;
  if (random() < 0.6) return area.lines[0];
  const rest = area.lines.slice(1);
  return rest[Math.floor(Math.min(0.999999, Math.max(0, random())) * rest.length)] ?? area.lines[0];
}

function encounterFor(input: {
  kind: "wild" | "gym";
  areaKey: string;
  lineKey: string;
  tier: number;
  level: number;
  gymStage?: number;
}): WorkshopEncounter {
  const tier = Math.min(WORKSHOP_TIER_COUNT, Math.max(1, Math.trunc(input.tier)));
  const level = Math.min(WORKSHOP_MAX_LEVEL, Math.max(1, Math.trunc(input.level)));
  const maxHp = petStats(tier, level).maxHp;
  return {
    kind: input.kind,
    areaKey: input.areaKey,
    lineKey: input.lineKey,
    tier,
    level,
    hp: maxHp,
    maxHp,
    turn: 0,
    ...(input.kind === "gym" && input.gymStage ? { gymStage: input.gymStage } : {}),
  };
}

export function createWildEncounter(
  areaKey: string,
  random: () => number = Math.random,
): WorkshopEncounter | null {
  const area = areaByKey(areaKey);
  if (!area) return null;
  return encounterFor({
    kind: "wild",
    areaKey: area.key,
    lineKey: pickAreaLine(area, random),
    tier: randomInt(random, area.tiers[0], area.tiers[1]),
    level: randomInt(random, area.levels[0], area.levels[1]),
  });
}

export function createGymEncounter(stage: number): WorkshopEncounter | null {
  const gym = gymByStage(stage);
  if (!gym) return null;
  return encounterFor({
    kind: "gym",
    areaKey: "gym",
    lineKey: gym.lineKey,
    tier: gym.tier,
    level: gym.level,
    gymStage: gym.stage,
  });
}

export function captureChance(
  encounter: Pick<WorkshopEncounter, "hp" | "maxHp" | "tier">,
): number {
  const ratio = encounter.maxHp > 0 ? encounter.hp / encounter.maxHp : 0;
  const raw = 0.12 + (1 - ratio) * 0.68 - (encounter.tier - 1) * 0.05;
  return Math.min(0.92, Math.max(0.05, raw));
}

function damage(
  atk: number,
  power: number,
  stab: boolean,
  type: number,
  random: () => number,
  extra = 1,
): number {
  const variance = 0.85 + random() * 0.15;
  return Math.max(1, Math.floor((atk * power / 50) * (stab ? 1.5 : 1) * type * variance * extra));
}

export type WorkshopBattleAction =
  | { kind: "move"; moveId: WorkshopMoveId }
  | { kind: "guard" }
  | { kind: "ball" }
  | { kind: "potion" }
  | { kind: "switch"; petId: string }
  | { kind: "run" };

export interface WorkshopBattleEvent {
  text: string;
  tone?: "info" | "good" | "bad";
}

export interface WorkshopBattleResult {
  state: WorkshopState;
  events: WorkshopBattleEvent[];
  status: "ongoing" | "won" | "lost" | "captured" | "fled";
  expGained: number;
  levelUps: { petId: string; name: string; level: number }[];
  evolved: { petId: string; name: string }[];
  captured?: { name: string; tier: number; to: "party" | "box" };
  drops: { ball: number; potion: number; gold: number };
}

/** 胜利掉金：野生按阶数与等级给，道馆按关卡给一大笔，用来在工坊商店买补给。 */
export function workshopVictoryGold(encounter: Pick<WorkshopEncounter, "kind" | "tier" | "level" | "gymStage">): number {
  if (encounter.kind === "gym") return 100 * Math.max(1, Math.trunc(encounter.gymStage ?? 1));
  return 10 + encounter.tier * 4 + encounter.level;
}

function cloneState(state: WorkshopState): WorkshopState {
  return JSON.parse(JSON.stringify(state)) as WorkshopState;
}

/**
 * 结算一个回合。会修改 `state` 的副本并返回，不碰入参。
 *
 * 规则错误（没有战斗、没球、满血喝药）抛普通 Error，由 store 转成用户提示；
 * 伤害判定失败不会发生，命中率只在捕捉与逃跑上。
 */
export function resolveWorkshopBattle(
  input: WorkshopState,
  action: WorkshopBattleAction,
  random: () => number = Math.random,
): WorkshopBattleResult {
  const state = cloneState(input);
  const encounter = state.encounter;
  if (!encounter) throw new Error("当前没有进行中的战斗");

  const events: WorkshopBattleEvent[] = [];
  const found = activePet(state);
  if (!found) throw new Error("队伍里还没有灵宠");
  let pet: WorkshopPet = found;
  if (pet.hp <= 0) {
    const alive = firstAlivePet(state);
    if (!alive) throw new Error("队伍已全灭，先休息或使用药水");
    state.activePetId = alive.id;
    pet = alive;
  }

  const result: WorkshopBattleResult = {
    state,
    events,
    status: "ongoing",
    expGained: 0,
    levelUps: [],
    evolved: [],
    drops: { ball: 0, potion: 0, gold: 0 },
  };

  const enemyName = () => petName(encounter);
  const finish = () => {
    state.encounter = null;
  };

  const addDex = (petLike: { lineKey: string; tier: number }) => {
    const keys = new Set(state.dex);
    for (const key of petDexKeys(petLike)) keys.add(key);
    state.dex = [...keys].sort();
  };

  const enemyTurn = (guarding: boolean) => {
    if (!state.encounter) return;
    const move = random() < 0.5 ? movesFor(encounter.lineKey)[0] : movesFor(encounter.lineKey)[1];
    const stats = petStats(encounter.tier, encounter.level);
    const dealt = damage(
      stats.atk,
      move.power,
      move.type === encounter.lineKey,
      typeMultiplier(move.type, pet.lineKey),
      random,
      guarding ? 0.5 : 1,
    );
    const maxHp = petStats(pet.tier, pet.level).maxHp;
    pet.hp = Math.max(0, Math.min(maxHp, pet.hp) - dealt);
    events.push({
      text: `${enemyName()} 的${move.name}${guarding ? "被挡下一半，仍" : ""}造成 ${dealt} 伤害`,
      tone: "bad",
    });
    if (pet.hp > 0) return;
    events.push({ text: `${petName(pet)} 倒下了`, tone: "bad" });
    const next = state.party.find((item) => item.hp > 0);
    if (next) {
      state.activePetId = next.id;
      pet = next;
      events.push({ text: `派出 ${petName(next)}（Lv.${next.level}）` });
      return;
    }
    finish();
    result.status = "lost";
    // 就地扶起四分之一血并结束这趟探险：野外不能扎营，而每日一次的免费休息可能已经用掉，
    // 不收兵也不回血就会把玩家锁死在地图上（券白花、页面什么都干不了）。
    state.run = null;
    for (const item of state.party) {
      item.hp = Math.max(1, Math.floor(petStats(item.tier, item.level).maxHp / 4));
    }
    state.activePetId = state.party[0]?.id ?? state.activePetId;
    events.push({ text: "队伍全灭，被伙伴扶回营地休整", tone: "bad" });
  };

  const victory = () => {
    const exp = battleExp(encounter.tier, encounter.level, false);
    const grown = gainExp(pet, exp);
    const slots = state.party.map((item) => (item.id === grown.pet.id ? grown.pet : item));
    if (slots.every((item) => item.id !== grown.pet.id)) slots.push(grown.pet);
    state.party = slots;
    pet = grown.pet;
    if (grown.levels > 0) {
      events.push({
        text: `${petName(grown.pet)} 升到 Lv.${grown.pet.level}`,
        tone: "good",
      });
      result.levelUps.push({ petId: grown.pet.id, name: petName(grown.pet), level: grown.pet.level });
    }
    if (grown.toTier > grown.fromTier) {
      addDex(grown.pet);
      events.push({
        text: `${petName({ lineKey: grown.pet.lineKey, tier: grown.toTier })} 进化了！`,
        tone: "good",
      });
      result.evolved.push({ petId: grown.pet.id, name: petName(grown.pet) });
    }
    result.expGained = exp;
    events.push({ text: `获得 ${exp} 点经验`, tone: "good" });

    if (encounter.kind === "gym") {
      const gold = workshopVictoryGold(encounter);
      state.badges = Math.min(3, state.badges + 1);
      state.items = { ball: state.items.ball + 2, potion: state.items.potion + 2 };
      state.gold += gold;
      result.drops = { ball: 2, potion: 2, gold };
      const gym = gymByStage(encounter.gymStage ?? 0);
      events.push({
        text: `战胜${gym?.leader ?? "馆主"}，获得${gym?.badge ?? "徽章"}，补给 +2 球 +2 药水 +${gold} 金`,
        tone: "good",
      });
    } else {
      const ball = random() < 0.25 ? 1 : 0;
      const potion = random() < 0.15 ? 1 : 0;
      const gold = workshopVictoryGold(encounter);
      state.items = {
        ball: state.items.ball + ball,
        potion: state.items.potion + potion,
      };
      state.gold += gold;
      result.drops = { ball, potion, gold };
      events.push({
        text: `捡到 ${gold} 金${ball ? ` · 精灵球 ×${ball}` : ""}${potion ? ` · 药水 ×${potion}` : ""}`,
        tone: "good",
      });
    }

    finish();
    result.status = "won";
  };

  const attemptCapture = () => {
    if (encounter.kind === "gym") throw new Error("道馆战不能使用精灵球");
    if (state.items.ball <= 0) throw new Error("精灵球用完了，先休息或探索补充");
    if (
      state.party.length >= WORKSHOP_PARTY_SIZE &&
      state.box.length >= WORKSHOP_BOX_SIZE
    ) {
      throw new Error("队伍与仓库都满了，先整理再捕捉");
    }
    state.items = { ...state.items, ball: state.items.ball - 1 };
    if (random() < captureChance(encounter)) {
      const caught = createPet({
        lineKey: encounter.lineKey,
        tier: encounter.tier,
        level: encounter.level,
      });
      const to = addPet(state, caught);
      addDex(caught);
      result.captured = {
        name: petName(caught),
        tier: caught.tier,
        to: to ?? "box",
      };
      state.activePetId = state.activePetId ?? caught.id;
      events.push({
        text: `成功捕捉 ${petName(caught)}（Lv.${caught.level}），已放入${to === "party" ? "队伍" : "仓库"}`,
        tone: "good",
      });
      finish();
      result.status = "captured";
      return;
    }
    events.push({ text: "精灵球晃了两下，灵宠挣脱了", tone: "bad" });
    enemyTurn(false);
  };

  switch (action.kind) {
    case "run": {
      if (encounter.kind === "gym") throw new Error("道馆战不能逃跑");
      if (random() < 0.75) {
        events.push({ text: "顺利脱离了战斗", tone: "info" });
        finish();
        result.status = "fled";
      } else {
        events.push({ text: "没能甩掉它", tone: "bad" });
        enemyTurn(false);
      }
      break;
    }
    case "ball": {
      attemptCapture();
      break;
    }
    case "potion": {
      if (state.items.potion <= 0) throw new Error("药水用完了");
      const maxHp = petStats(pet.tier, pet.level).maxHp;
      if (pet.hp >= maxHp) throw new Error("当前灵宠血量已满");
      state.items = { ...state.items, potion: state.items.potion - 1 };
      const healed = Math.min(maxHp, pet.hp + WORKSHOP_POTION_HEAL);
      const amount = healed - pet.hp;
      pet.hp = healed;
      events.push({ text: `${petName(pet)} 回复了 ${amount} 点体力`, tone: "good" });
      enemyTurn(false);
      break;
    }
    case "switch": {
      const target = state.party.find((item) => item.id === action.petId);
      if (!target) throw new Error("这只灵宠不在队伍里");
      if (target.hp <= 0) throw new Error("它已经倒下了，先休息或用药水");
      if (target.id === pet.id) throw new Error("它已经在场上了");
      state.activePetId = target.id;
      pet = target;
      events.push({ text: `换上了 ${petName(target)}（Lv.${target.level}）`, tone: "info" });
      enemyTurn(false);
      break;
    }
    case "guard": {
      events.push({ text: `${petName(pet)} 摆出防御姿态，本回合受伤减半`, tone: "info" });
      enemyTurn(true);
      break;
    }
    case "move": {
      const move = movesFor(pet.lineKey).find((item) => item.id === action.moveId);
      if (!move) throw new Error("没有这个招式");
      const stats = petStats(pet.tier, pet.level);
      const dealt = damage(
        stats.atk,
        move.power,
        move.type === pet.lineKey,
        typeMultiplier(move.type, encounter.lineKey),
        random,
      );
      encounter.hp = Math.max(0, encounter.hp - dealt);
      events.push({
        text: `${petName(pet)} 的${move.name}造成 ${dealt} 伤害`,
        tone: "good",
      });
      if (encounter.hp > 0) {
        enemyTurn(false);
      } else {
        events.push({ text: `${enemyName()} 倒下了`, tone: "good" });
        victory();
      }
      break;
    }
    default:
      throw new Error("未知的战斗操作");
  }

  if (state.encounter) state.encounter.turn += 1;
  return result;
}

/** 图鉴里的一条线有几格已解锁。 */
export function dexUnlocked(state: WorkshopState, lineKey: string): Set<number> {
  const tiers = new Set<number>();
  for (const key of state.dex) {
    const [line, tierText] = key.split(":");
    if (line === lineKey) tiers.add(Math.trunc(Number(tierText)));
  }
  return tiers;
}
