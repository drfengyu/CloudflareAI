import {
  SAGA_CHAPTERS,
  SAGA_FORMATION_BY_ID,
  SAGA_GENERAL_BY_ID,
  SAGA_ITEM_BY_ID,
  SAGA_STARTER_IDS,
  gearSlotOf,
  traitStats,
  weaponTypesFor,
} from "./data";
import {
  SAGA_CARRY_LIMIT,
  SAGA_LEGACY_MAX_LEVEL,
  SAGA_MAX_LEVEL,
  SAGA_PARTY_SIZE,
  SAGA_RESERVE_SIZE,
  SAGA_RULESET,
  SAGA_SAVE_VERSION,
  SAGA_STAT_CAP,
  type FormationId,
  type GearSlot,
  type SagaGeneralState,
  type TrialSave,
} from "./types";
import { forgeStat, normalizeGearLevels } from "./forge";

/**
 * 兵力基准的参照武将 `baseTroops`（张飞 210，全表最高）。
 * v17 起「1 级 100 兵 → 100 级 40294 兵」的二次成长基准以它为 1.0，其余武将按 baseTroops 比例微调。
 */
export const SAGA_TROOP_REF_BASE = 210;

export function createGeneralState(id: string, level = 1): SagaGeneralState {
  return {
    id,
    level: Math.max(1, Math.min(SAGA_MAX_LEVEL, Math.trunc(level))),
    exp: 0,
    weapon: null,
    armor: null,
    helmet: null,
    belt: null,
    pendant: null,
    boots: null,
    mount: null,
    items: {},
  };
}

export function initialTrialSave(): TrialSave {
  const liubei = createGeneralState("liubei");
  liubei.weapon = "iron_sword";
  liubei.armor = "cloth";
  liubei.items = { herb: 2, zhaohun_dan: 1 };
  const guanyu = createGeneralState("guanyu");
  guanyu.weapon = "blade";
  const zhangfei = createGeneralState("zhangfei");
  zhangfei.weapon = "spear";
  return {
    version: SAGA_SAVE_VERSION,
    chapter: 0,
    clears: 0,
    gold: 80,
    formation: "yulin",
    party: [liubei, guanyu, zhangfei],
    reserve: [],
    bag: {},
    gear: {},
    gearLevels: {},
    met: [...SAGA_STARTER_IDS],
    recruited: [...SAGA_STARTER_IDS],
    stats: { runs: 0, wins: 0, battlesWon: 0, bestCleared: 0, recruited: 0 },
  };
}

export function cloneSave(save: TrialSave): TrialSave {
  return JSON.parse(JSON.stringify(save)) as TrialSave;
}

const clampInt = (value: unknown, min: number, max: number, fallback = min): number => {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

function normalizeItemMap(raw: unknown, allowed: (id: string) => boolean): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, count] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed(id)) continue;
    const n = clampInt(count, 0, 999, 0);
    if (n > 0) out[id] = n;
  }
  return out;
}

function normalizeGeneral(raw: unknown): SagaGeneralState | null {
  if (!raw || typeof raw !== "object") return null;
  const it = raw as Partial<SagaGeneralState>;
  const def = SAGA_GENERAL_BY_ID.get(String(it.id ?? ""));
  if (!def || def.enemyOnly) return null;
  const state = createGeneralState(def.id, Number(it.level));
  state.exp = clampInt(it.exp, 0, 999_999, 0);
  for (const slot of ["weapon", "armor", "helmet", "belt", "pendant", "boots", "mount"] as GearSlot[]) {
    const id = it[slot];
    if (typeof id !== "string") continue;
    const item = SAGA_ITEM_BY_ID.get(id);
    if (item && gearSlotOf(item) === slot) state[slot] = item.id;
  }
  const items: Record<string, number> = {};
  if (it.items && typeof it.items === "object") {
    for (const [id, count] of Object.entries(it.items as Record<string, unknown>)) {
      const item = SAGA_ITEM_BY_ID.get(id);
      if (!item || item.kind !== "consumable") continue;
      const n = clampInt(count, 0, 999, 0);
      if (n > 0 && Object.keys(items).length < SAGA_CARRY_LIMIT) items[id] = n;
    }
  }
  state.items = items;
  const troops = clampInt(it.troops, 0, 99_999, 0);
  if (troops > 0) state.troops = troops;
  return state;
}

/** 脏存档一律归一：未知武将剔除、重复上阵去重、装备与道具回落到合法项。 */
export function normalizeTrialSave(raw: unknown): TrialSave {
  const base = initialTrialSave();
  if (!raw || typeof raw !== "object") return base;
  const it = raw as Partial<TrialSave>;
  const seen = new Set<string>();
  const party: SagaGeneralState[] = [];
  for (const item of Array.isArray(it.party) ? it.party : []) {
    const g = normalizeGeneral(item);
    if (!g || seen.has(g.id) || party.length >= SAGA_PARTY_SIZE) continue;
    seen.add(g.id);
    party.push(g);
  }
  const reserve: SagaGeneralState[] = [];
  for (const item of Array.isArray(it.reserve) ? it.reserve : []) {
    const g = normalizeGeneral(item);
    if (!g || seen.has(g.id) || reserve.length >= SAGA_RESERVE_SIZE) continue;
    seen.add(g.id);
    reserve.push(g);
  }
  if (party.length === 0) {
    for (const id of SAGA_STARTER_IDS) {
      if (party.length >= SAGA_PARTY_SIZE) break;
      if (seen.has(id)) {
        const found = reserve.find((g) => g.id === id);
        if (found) {
          reserve.splice(reserve.indexOf(found), 1);
          party.push(found);
          continue;
        }
      }
      seen.add(id);
      party.push(createGeneralState(id));
    }
  }
  if (party.length === 0) {
    for (const def of SAGA_GENERAL_BY_ID.values()) {
      if (def.enemyOnly) continue;
      party.push(createGeneralState(def.id));
      if (party.length >= 3) break;
    }
  }

  const formation = SAGA_FORMATION_BY_ID.get(String(it.formation ?? "") as FormationId)?.id ?? base.formation;
  const chapter = clampInt(it.chapter, 0, SAGA_CHAPTERS.length - 1, 0);
  const bagAllowed = (id: string) => SAGA_ITEM_BY_ID.get(id)?.kind === "consumable";
  const gearAllowed = (id: string) => Boolean(gearSlotOf(SAGA_ITEM_BY_ID.get(id)));
  const met = new Set(
    (Array.isArray(it.met) ? it.met : []).filter(
      (id): id is string => typeof id === "string" && Boolean(SAGA_GENERAL_BY_ID.get(id)),
    ),
  );
  const recruited = new Set(
    (Array.isArray(it.recruited) ? it.recruited : []).filter(
      (id): id is string => typeof id === "string" && Boolean(SAGA_GENERAL_BY_ID.get(id)),
    ),
  );
  for (const g of [...party, ...reserve]) {
    met.add(g.id);
    recruited.add(g.id);
  }
  const stats = (it.stats && typeof it.stats === "object" ? it.stats : {}) as Partial<TrialSave["stats"]>;
  const save: TrialSave = {
    version: SAGA_SAVE_VERSION,
    chapter,
    clears: clampInt(it.clears, 0, 999, 0),
    gold: clampInt(it.gold, 0, 9_999_999, base.gold),
    formation,
    party,
    reserve,
    bag: normalizeItemMap(it.bag, bagAllowed),
    gear: normalizeItemMap(it.gear, gearAllowed),
    gearLevels: normalizeGearLevels(it.gearLevels),
    met: [...met],
    recruited: [...recruited],
    stats: {
      runs: clampInt(stats.runs, 0, 9_999_999, 0),
      wins: clampInt(stats.wins, 0, 9_999_999, 0),
      battlesWon: clampInt(stats.battlesWon, 0, 9_999_999, 0),
      bestCleared: clampInt(stats.bestCleared, 0, 999, 0),
      recruited: clampInt(stats.recruited, 0, 9_999, 0),
    },
  };
  redistributeBag(save);
  return save;
}

export interface SagaGeneralStats {
  force: number;
  intellect: number;
  defense: number;
  speed: number;
  maxTroops: number;
  weaponAtk: number;
  armorDef: number;
  /** 坐骑 / 靴 / 吊坠带来的速度加成。 */
  gearSpeed: number;
}

/** 武将属性；传入存档的 `gearLevels` 时，兵器 / 甲胄按铁匠铺强化等级加成。 */
export function generalStats(
  state: SagaGeneralState,
  gearLevels?: Record<string, number>,
  rules = SAGA_RULESET,
): SagaGeneralStats {
  const def = SAGA_GENERAL_BY_ID.get(state.id);
  if (!def) {
    return {
      force: 1,
      intellect: 1,
      defense: 1,
      speed: 1,
      maxTroops: 1,
      weaponAtk: 0,
      armorDef: 0,
      gearSpeed: 0,
    };
  }
  const maxLevel = rules >= 17 ? SAGA_MAX_LEVEL : SAGA_LEGACY_MAX_LEVEL;
  const level = clampInt(state.level, 1, maxLevel, 1);
  const weapon = state.weapon ? SAGA_ITEM_BY_ID.get(state.weapon) : null;
  const armor = state.armor ? SAGA_ITEM_BY_ID.get(state.armor) : null;
  const bonus = traitStats(def);
  // v9 起每级成长翻三倍、四维封顶 255，兵力翻一倍；v14 起等级封顶 50、每级成长 ×2；
  // v17 起等级封顶 100，每级成长收到 ×1.05（100 级吕布武力 255、庞统智力约 220），
  // 旧行军仍按各自版本的成长与兵力口径重放。
  const growth = rules >= 17 ? 1.05 : rules >= 14 ? 2 : rules >= 9 ? 3 : 1;
  const troopScale = rules >= 9 ? 2 : 1;
  const cap = (value: number): number => Math.min(SAGA_STAT_CAP, Math.round(value));
  const maxTroops =
    rules >= 14
      ? Math.round((troopBaseline(level, rules) * def.baseTroops) / SAGA_TROOP_REF_BASE)
      : (def.baseTroops + (level - 1) * def.growth) * troopScale;
  const extraDef = (["helmet", "belt", "pendant", "boots"] as const).reduce((sum, slot) => {
    const item = state[slot] ? SAGA_ITEM_BY_ID.get(state[slot] as string) : null;
    return sum + (item ? forgeStat(item.id, gearLevels?.[item.id] ?? 0) : 0);
  }, 0);
  const gearSpeed = (["mount", "boots", "pendant"] as const).reduce((sum, slot) => {
    const item = state[slot] ? SAGA_ITEM_BY_ID.get(state[slot] as string) : null;
    return sum + (item?.speed ?? 0);
  }, 0);
  return {
    force: cap(def.force + bonus.force + Math.floor((level - 1) * 1.5 * growth)),
    intellect: cap(def.intellect + bonus.intellect + Math.floor((level - 1) * 1.2 * growth)),
    defense: cap(def.defense + bonus.defense + Math.floor((level - 1) * 1.3 * growth)),
    speed: cap(def.speed + bonus.speed + Math.floor((level - 1) * 0.8 * growth)),
    maxTroops,
    weaponAtk: weapon ? forgeStat(weapon.id, gearLevels?.[weapon.id] ?? 0) : 0,
    armorDef: armor ? forgeStat(armor.id, gearLevels?.[armor.id] ?? 0) + extraDef : extraDef,
    gearSpeed,
  };
}

export function expToNext(level: number): number {
  return 30 + Math.max(1, level) * 25;
}

/**
 * 同等级我方兵力基准。
 *
 * - v13（旧的线性口径）：1 级 400、30 级 1096，敌军按它 × 1.2~6。
 * - v14（50 级封顶）：几何曲线，1 级 100 → 50 级 20000（每级约 ×1.113），
 *   `generalStats` 再按武将自身 `baseTroops / 210` 微调强弱（张飞满级 20000、庞统约 14286）；
 *   敌军同样按这条基准 × 1.2~6，两边口径永远对齐。
 * - v17（100 级封顶）：不再用几何曲线，改「小幅线性 + 二次成长」：
 *   `100 + 10 × (level-1) + 4 × (level-1)^2`，1 级 100、10 级 514、50 级 10194、
 *   100 级 40294（不设 20000 上限），前期不会一百多兵就被营中步卒压死。
 *   v14~v16 的旧行军仍按 50 级几何分母重放。
 */
export function troopBaseline(level: number, rules = SAGA_RULESET): number {
  const maxLevel = rules >= 17 ? SAGA_MAX_LEVEL : SAGA_LEGACY_MAX_LEVEL;
  const lv = Math.min(maxLevel, Math.max(1, Math.trunc(level)));
  if (rules >= 17) {
    const step = lv - 1;
    return 100 + step * 10 + step * step * 4;
  }
  if (rules >= 14) {
    return Math.round(100 * Math.pow(200, (lv - 1) / (SAGA_LEGACY_MAX_LEVEL - 1)));
  }
  return 400 + (lv - 1) * 24;
}

export function grantGeneralExp(
  state: SagaGeneralState,
  amount: number,
  maxLevel = SAGA_MAX_LEVEL,
): number {
  const gain = Math.max(0, Math.trunc(amount));
  if (gain <= 0) return 0;
  state.exp += gain;
  let levels = 0;
  while (state.level < maxLevel && state.exp >= expToNext(state.level)) {
    state.exp -= expToNext(state.level);
    state.level += 1;
    levels += 1;
  }
  if (state.level >= maxLevel) state.exp = 0;
  return levels;
}

export function findGeneral(save: TrialSave, id: string): SagaGeneralState | null {
  return (
    save.party.find((g) => g.id === id) ??
    save.reserve.find((g) => g.id === id) ??
    null
  );
}

export interface RecruitResult {
  ok: boolean;
  joined: "party" | "reserve" | null;
  reason?: string;
}

export function recruitToSave(save: TrialSave, id: string): RecruitResult {
  const def = SAGA_GENERAL_BY_ID.get(id);
  if (!def) return { ok: false, joined: null, reason: "查无此人" };
  if (findGeneral(save, id)) return { ok: false, joined: null, reason: "已在麾下" };
  save.met = [...new Set([...save.met, id])];
  if (save.party.length < SAGA_PARTY_SIZE) {
    save.party.push(createGeneralState(id));
    save.recruited = [...new Set([...save.recruited, id])];
    save.stats.recruited += 1;
    return { ok: true, joined: "party" };
  }
  if (save.reserve.length < SAGA_RESERVE_SIZE) {
    save.reserve.push(createGeneralState(id));
    save.recruited = [...new Set([...save.recruited, id])];
    save.stats.recruited += 1;
    return { ok: true, joined: "reserve" };
  }
  return { ok: false, joined: null, reason: "队伍与后备已满" };
}

export function applyChapterUnlock(save: TrialSave, unlock: string | null): string | null {
  if (!unlock) return null;
  if (findGeneral(save, unlock)) {
    save.met = [...new Set([...save.met, unlock])];
    return null;
  }
  const result = recruitToSave(save, unlock);
  return result.ok ? unlock : null;
}

/** 武将随身道具的已用格数。 */
export function carrySlots(g: SagaGeneralState): number {
  return Object.values(g.items ?? {}).filter((n) => n > 0).length;
}

/** 找一个还能再装一种道具的武将：先上阵，再待命。 */
export function carryRecipient(save: TrialSave, itemId: string): SagaGeneralState | null {
  const exists = (g: SagaGeneralState) => (g.items?.[itemId] ?? 0) > 0;
  for (const g of [...save.party, ...save.reserve]) {
    if (exists(g) || carrySlots(g) < SAGA_CARRY_LIMIT) return g;
  }
  return null;
}

/** 买药前先看有没有人能带，满了就让玩家去物品栏舍弃。 */
export function canCarryItem(save: TrialSave, itemId: string): boolean {
  const item = SAGA_ITEM_BY_ID.get(itemId);
  if (!item) return false;
  if (item.kind !== "consumable") return true;
  return Boolean(carryRecipient(save, itemId));
}

/** 用活动券买下的装备 / 药品：券已在服务端扣过，重放只负责入库。 */
export function grantItem(save: TrialSave, itemId: string): boolean {
  const item = SAGA_ITEM_BY_ID.get(itemId);
  if (!item || item.kind === "supply") return false;
  if (item.kind === "consumable") {
    const owner = carryRecipient(save, item.id);
    if (!owner) return false;
    owner.items = { ...(owner.items ?? {}), [item.id]: (owner.items?.[item.id] ?? 0) + 1 };
  } else {
    save.gear[item.id] = (save.gear[item.id] ?? 0) + 1;
  }
  return true;
}

/** 把旧存档的共用行囊拆给各武将，每人最多 8 种。 */
export function redistributeBag(save: TrialSave): void {
  for (const [id, count] of Object.entries(save.bag)) {
    const item = SAGA_ITEM_BY_ID.get(id);
    if (!item || item.kind !== "consumable" || count <= 0) continue;
    let left = count;
    while (left > 0) {
      const owner = carryRecipient(save, id);
      if (!owner) break;
      owner.items = { ...(owner.items ?? {}), [id]: (owner.items?.[id] ?? 0) + 1 };
      left -= 1;
    }
    if (left > 0) save.bag[id] = left;
    else delete save.bag[id];
  }
}

export function equipGeneral(
  save: TrialSave,
  generalId: string,
  slot: GearSlot,
  itemId: string | null,
): boolean {
  const general = findGeneral(save, generalId);
  if (!general) return false;
  const current = general[slot] ?? null;
  if (itemId === null) {
    if (current) {
      save.gear[current] = (save.gear[current] ?? 0) + 1;
      general[slot] = null;
    }
    return true;
  }
  const item = SAGA_ITEM_BY_ID.get(itemId);
  if (!item || gearSlotOf(item) !== slot) return false;
  if (slot === "weapon" && item.weaponType) {
    const def = SAGA_GENERAL_BY_ID.get(general.id);
    if (!weaponTypesFor(def).includes(item.weaponType)) return false;
  }
  if ((save.gear[item.id] ?? 0) <= 0) return false;
  if (current) save.gear[current] = (save.gear[current] ?? 0) + 1;
  save.gear[item.id] = (save.gear[item.id] ?? 0) - 1;
  if (save.gear[item.id] <= 0) delete save.gear[item.id];
  general[slot] = item.id;
  return true;
}

export function setActiveParty(save: TrialSave, activeIds: string[]): boolean {
  const wanted = activeIds.map(String).slice(0, SAGA_PARTY_SIZE);
  if (wanted.length === 0) return false;
  if (new Set(wanted).size !== wanted.length) return false;
  const all = [...save.party, ...save.reserve];
  const active: SagaGeneralState[] = [];
  for (const id of wanted) {
    const found = all.find((g) => g.id === id);
    if (!found) return false;
    active.push(found);
  }
  const activeSet = new Set(wanted);
  const reserve = all.filter((g) => !activeSet.has(g.id));
  if (reserve.length > SAGA_RESERVE_SIZE) return false;
  save.party = active;
  save.reserve = reserve;
  return true;
}

export function setFormation(save: TrialSave, formation: FormationId): boolean {
  if (!SAGA_FORMATION_BY_ID.get(formation)) return false;
  save.formation = formation;
  return true;
}

export function addToBag(save: TrialSave, itemId: string, count: number): void {
  const item = SAGA_ITEM_BY_ID.get(itemId);
  if (!item || item.kind !== "consumable") return;
  save.bag[item.id] = (save.bag[item.id] ?? 0) + Math.max(0, Math.trunc(count));
}

export function partyPower(save: TrialSave): number {
  return save.party.reduce((sum, g) => {
    const s = generalStats(g);
    return sum + s.force + s.intellect + s.defense + s.speed + Math.floor(s.maxTroops / 10);
  }, 0);
}

export function chapterName(index: number): string {
  return SAGA_CHAPTERS[Math.max(0, Math.min(SAGA_CHAPTERS.length - 1, index))].name;
}
