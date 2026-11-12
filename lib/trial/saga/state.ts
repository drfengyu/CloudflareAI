import {
  SAGA_CHAPTERS,
  SAGA_FORMATION_BY_ID,
  SAGA_GENERAL_BY_ID,
  SAGA_ITEM_BY_ID,
  SAGA_STARTER_IDS,
} from "./data";
import {
  SAGA_MAX_LEVEL,
  SAGA_PARTY_SIZE,
  SAGA_RESERVE_SIZE,
  SAGA_SAVE_VERSION,
  type FormationId,
  type SagaGeneralState,
  type TrialSave,
} from "./types";

export function createGeneralState(id: string, level = 1): SagaGeneralState {
  return { id, level: Math.max(1, Math.min(SAGA_MAX_LEVEL, Math.trunc(level))), exp: 0, weapon: null, armor: null };
}

export function initialTrialSave(): TrialSave {
  const liubei = createGeneralState("liubei");
  liubei.armor = "cloth";
  const guanyu = createGeneralState("guanyu");
  guanyu.weapon = "iron_sword";
  const zhangfei = createGeneralState("zhangfei");
  zhangfei.weapon = "iron_sword";
  return {
    version: SAGA_SAVE_VERSION,
    chapter: 0,
    clears: 0,
    gold: 80,
    formation: "yulin",
    party: [liubei, guanyu, zhangfei],
    reserve: [],
    bag: { herb: 2 },
    gear: {},
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
  const weapon = typeof it.weapon === "string" ? SAGA_ITEM_BY_ID.get(it.weapon) : null;
  if (weapon?.kind === "weapon") state.weapon = weapon.id;
  const armor = typeof it.armor === "string" ? SAGA_ITEM_BY_ID.get(it.armor) : null;
  if (armor?.kind === "armor") state.armor = armor.id;
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
  const gearAllowed = (id: string) => ["weapon", "armor"].includes(SAGA_ITEM_BY_ID.get(id)?.kind ?? "");
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
  return {
    version: SAGA_SAVE_VERSION,
    chapter,
    clears: clampInt(it.clears, 0, 999, 0),
    gold: clampInt(it.gold, 0, 9_999_999, base.gold),
    formation,
    party,
    reserve,
    bag: normalizeItemMap(it.bag, bagAllowed),
    gear: normalizeItemMap(it.gear, gearAllowed),
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
}

export interface SagaGeneralStats {
  force: number;
  intellect: number;
  defense: number;
  speed: number;
  maxTroops: number;
  weaponAtk: number;
  armorDef: number;
}

export function generalStats(state: SagaGeneralState): SagaGeneralStats {
  const def = SAGA_GENERAL_BY_ID.get(state.id);
  if (!def) {
    return { force: 1, intellect: 1, defense: 1, speed: 1, maxTroops: 1, weaponAtk: 0, armorDef: 0 };
  }
  const level = clampInt(state.level, 1, SAGA_MAX_LEVEL, 1);
  const weapon = state.weapon ? SAGA_ITEM_BY_ID.get(state.weapon) : null;
  const armor = state.armor ? SAGA_ITEM_BY_ID.get(state.armor) : null;
  return {
    force: def.force + Math.floor((level - 1) * 1.5),
    intellect: def.intellect + Math.floor((level - 1) * 1.2),
    defense: def.defense + Math.floor((level - 1) * 1.3),
    speed: def.speed + Math.floor((level - 1) * 0.8),
    maxTroops: def.baseTroops + (level - 1) * def.growth,
    weaponAtk: weapon?.atk ?? 0,
    armorDef: armor?.def ?? 0,
  };
}

export function expToNext(level: number): number {
  return 30 + Math.max(1, level) * 25;
}

export function grantGeneralExp(state: SagaGeneralState, amount: number): number {
  const gain = Math.max(0, Math.trunc(amount));
  if (gain <= 0) return 0;
  state.exp += gain;
  let levels = 0;
  while (state.level < SAGA_MAX_LEVEL && state.exp >= expToNext(state.level)) {
    state.exp -= expToNext(state.level);
    state.level += 1;
    levels += 1;
  }
  if (state.level >= SAGA_MAX_LEVEL) state.exp = 0;
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

export function buyGoldItem(save: TrialSave, itemId: string): boolean {
  const item = SAGA_ITEM_BY_ID.get(itemId);
  if (!item || item.kind === "supply" || !item.priceGold) return false;
  if (save.gold < item.priceGold) return false;
  save.gold -= item.priceGold;
  if (item.kind === "consumable") {
    save.bag[item.id] = (save.bag[item.id] ?? 0) + 1;
  } else {
    save.gear[item.id] = (save.gear[item.id] ?? 0) + 1;
  }
  return true;
}

export function equipGeneral(
  save: TrialSave,
  generalId: string,
  slot: "weapon" | "armor",
  itemId: string | null,
): boolean {
  const general = findGeneral(save, generalId);
  if (!general) return false;
  if (itemId === null) {
    const current = slot === "weapon" ? general.weapon : general.armor;
    if (current) {
      save.gear[current] = (save.gear[current] ?? 0) + 1;
      if (slot === "weapon") general.weapon = null;
      else general.armor = null;
    }
    return true;
  }
  const item = SAGA_ITEM_BY_ID.get(itemId);
  if (!item || item.kind !== slot) return false;
  if ((save.gear[item.id] ?? 0) <= 0) return false;
  const current = slot === "weapon" ? general.weapon : general.armor;
  if (current) save.gear[current] = (save.gear[current] ?? 0) + 1;
  save.gear[item.id] = (save.gear[item.id] ?? 0) - 1;
  if (save.gear[item.id] <= 0) delete save.gear[item.id];
  if (slot === "weapon") general.weapon = item.id;
  else general.armor = item.id;
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
