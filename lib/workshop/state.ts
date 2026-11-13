import { cnDateString } from "@/lib/date";
import { WORKSHOP_LINES, WORKSHOP_TIER_COUNT } from "./config";
import {
  WORKSHOP_BOX_SIZE,
  WORKSHOP_PARTY_SIZE,
  WORKSHOP_START_BALLS,
  WORKSHOP_START_POTIONS,
  createPet,
  dexKey,
  normalizePet,
  petDexKeys,
  petStats,
  type WorkshopPet,
} from "./pets";

/**
 * 灵宠工坊的存档结构（整体存 `workshop_state.state` JSON）。
 *
 * 这里只有纯数据与纯函数，不碰数据库：页面、服务端动作、单测都从这里读口径，
 * 旧版「每条线各阶数量」的存档会在 normalize 时换算成灵宠个体，进度不丢。
 */

export interface WorkshopEncounter {
  kind: "wild" | "gym";
  /** wild 用区域 key，gym 固定为 `gym`。 */
  areaKey: string;
  lineKey: string;
  tier: number;
  level: number;
  hp: number;
  maxHp: number;
  turn: number;
  /** 道馆战才有；对应 WORKSHOP_GYMS.stage。 */
  gymStage?: number;
}

export interface WorkshopInventory {
  ball: number;
  potion: number;
}

/**
 * 进行中的一趟探险：只存「在哪个区域、哪张图、光标在哪格、走了多少步、遇了几次」。
 * 地图形状由 `areaKey + seed` 复现，所以这里存的这点数据就是服务端权威状态。
 */
export interface WorkshopRun {
  areaKey: string;
  seed: number;
  /** 服务端权威光标（格坐标）。 */
  tx: number;
  ty: number;
  /** 本次进图已走过的有效步数。 */
  steps: number;
  /** 本次进图已触发的野生遇敌数（道馆不计）。 */
  encounters: number;
  startedAt: number;
}

export interface WorkshopState {
  /** 北京日期；换天后进图/道馆次数重置。 */
  day: string;
  entersToday: number;
  gymsToday: number;
  /** 初始三选一选中的养成线；null = 还没选。 */
  starter: string | null;
  party: WorkshopPet[];
  box: WorkshopPet[];
  /** 图鉴：`line:tier`。 */
  dex: string[];
  items: WorkshopInventory;
  /** 工坊金币：野外/道馆战利品，只在本活动里流通，可在工坊商店买补给。 */
  gold: number;
  /** 已获得的道馆徽章数 0~3。 */
  badges: number;
  activePetId: string | null;
  /** 进行中的探险（野外走位）；null = 不在地图里。 */
  run: WorkshopRun | null;
  /** 进行中的遭遇；null = 不在战斗里。 */
  encounter: WorkshopEncounter | null;
  /** 最近一次「休息」的北京日期，每天一次。 */
  restDay: string;
}

export const WORKSHOP_GYM_COUNT = 3;

export function emptyInventory(): WorkshopInventory {
  return { ball: WORKSHOP_START_BALLS, potion: WORKSHOP_START_POTIONS };
}

export function emptyWorkshopState(day = cnDateString()): WorkshopState {
  return {
    day,
    entersToday: 0,
    gymsToday: 0,
    starter: null,
    party: [],
    box: [],
    dex: [],
    items: emptyInventory(),
    gold: 0,
    badges: 0,
    activePetId: null,
    run: null,
    encounter: null,
    restDay: "",
  };
}

function clampCount(value: unknown, max = 99_999): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n > 0 ? Math.min(max, n) : 0;
}

function normalizeDex(raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw : [];
  const valid = new Set<string>();
  for (const item of arr) {
    if (typeof item !== "string") continue;
    const [lineKey, tierText] = item.split(":");
    const tier = Math.trunc(Number(tierText));
    if (!WORKSHOP_LINES.some((line) => line.key === lineKey)) continue;
    if (!Number.isInteger(tier) || tier < 1 || tier > WORKSHOP_TIER_COUNT) continue;
    valid.add(dexKey(lineKey, tier));
  }
  return [...valid].sort();
}

function normalizePets(raw: unknown, max: number): WorkshopPet[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const pets: WorkshopPet[] = [];
  for (const item of raw) {
    const pet = normalizePet(item);
    if (!pet || seen.has(pet.id)) continue;
    seen.add(pet.id);
    pets.push(pet);
    if (pets.length >= max) break;
  }
  return pets;
}

export function normalizeEncounter(raw: unknown): WorkshopEncounter | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<WorkshopEncounter>;
  const lineKey = row.lineKey;
  if (row.kind !== "wild" && row.kind !== "gym") return null;
  if (typeof lineKey !== "string" || !WORKSHOP_LINES.some((line) => line.key === lineKey)) return null;
  const tier = Math.trunc(Number(row.tier));
  const level = Math.trunc(Number(row.level));
  if (!Number.isInteger(tier) || tier < 1 || tier > WORKSHOP_TIER_COUNT) return null;
  if (!Number.isInteger(level) || level < 1 || level > 50) return null;
  const maxHp = petStats(tier, level).maxHp;
  const hp = Math.min(maxHp, Math.max(0, Math.trunc(Number(row.hp) || 0)));
  if (hp <= 0) return null;
  const gymStage = Math.trunc(Number(row.gymStage));
  return {
    kind: row.kind,
    areaKey: typeof row.areaKey === "string" ? row.areaKey : "",
    lineKey,
    tier,
    level,
    hp,
    maxHp,
    turn: Math.max(0, Math.trunc(Number(row.turn) || 0)),
    ...(row.kind === "gym" && Number.isInteger(gymStage) && gymStage >= 1 && gymStage <= WORKSHOP_GYM_COUNT
      ? { gymStage }
      : {}),
  };
}

interface LegacyItems {
  [lineKey: string]: unknown;
}

function isLegacyItems(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const row = raw as LegacyItems;
  return WORKSHOP_LINES.some((line) => Array.isArray(row[line.key]));
}

/**
 * 旧存档（三条线各阶数量）换算成灵宠个体。
 *
 * 等级按阶数给 `tier × 4`，保证老玩家不会因为改版从 1 级重练；
 * 只保留队伍 + 仓库上限内的灵宠，数量越多越先转高阶。
 */
export function migrateLegacyItems(rawItems: unknown): WorkshopPet[] {
  const source = (rawItems && typeof rawItems === "object" ? rawItems : {}) as LegacyItems;
  const pets: WorkshopPet[] = [];
  const cap = WORKSHOP_PARTY_SIZE + WORKSHOP_BOX_SIZE;
  for (const line of WORKSHOP_LINES) {
    const counts = Array.isArray(source[line.key]) ? (source[line.key] as unknown[]) : [];
    for (let index = 0; index < WORKSHOP_TIER_COUNT && pets.length < cap; index += 1) {
      const count = Math.min(99, clampCount(counts[index]));
      for (let i = 0; i < count && pets.length < cap; i += 1) {
        const tier = index + 1;
        pets.push(
          createPet({
            id: `legacy-${line.key}-${tier}-${i}`,
            lineKey: line.key,
            tier,
            level: Math.min(50, tier * 4),
          }),
        );
      }
    }
  }
  return pets.sort((a, b) => b.tier - a.tier || b.level - a.level || a.id.localeCompare(b.id));
}

/**
 * 探险 run 的结构校验：只保证字段是有限整数与合法区域 key，
 * 格坐标是否真在这张图上要问 `run.ts`（它才知道地图长什么样）。
 */
export function normalizeWorkshopRunShape(raw: unknown): WorkshopRun | null {
  if (!raw || typeof raw !== "object") return null;
  const it = raw as Partial<WorkshopRun>;
  if (typeof it.areaKey !== "string" || !it.areaKey) return null;
  const num = (value: unknown, fallback: number, max: number): number => {
    const n = Math.trunc(Number(value));
    return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : fallback;
  };
  const seed = Math.trunc(Number(it.seed));
  if (!Number.isFinite(seed) || seed < 0) return null;
  return {
    areaKey: it.areaKey,
    seed,
    tx: num(it.tx, 0, 9_999),
    ty: num(it.ty, 0, 9_999),
    steps: num(it.steps, 0, 10_000_000),
    encounters: num(it.encounters, 0, 10_000),
    startedAt: num(it.startedAt, Date.now(), Number.MAX_SAFE_INTEGER),
  };
}

function normalizeInventory(raw: unknown): WorkshopInventory {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyInventory();
  const row = raw as Partial<WorkshopInventory>;
  return {
    ball: clampCount(row.ball),
    potion: clampCount(row.potion),
  };
}

/**
 * 脏 JSON 兜回可用状态：补图鉴、夹血量、换天重置每日次数。
 * 没有 `party` 字段但还留着旧版 `items` 数组时，走一次旧存档迁移。
 */
export function normalizeWorkshopState(raw: unknown, day = cnDateString()): WorkshopState {
  const base = emptyWorkshopState(day);
  if (!raw || typeof raw !== "object") return base;
  const it = raw as Partial<WorkshopState> & {
    items?: unknown;
    gathersToday?: unknown;
    exploresToday?: unknown;
  };
  const sameDay = typeof it.day === "string" && it.day === day;

  let party = normalizePets(it.party, WORKSHOP_PARTY_SIZE);
  let box = normalizePets(it.box, WORKSHOP_BOX_SIZE);
  let starter = typeof it.starter === "string" && WORKSHOP_LINES.some((line) => line.key === it.starter)
    ? it.starter
    : null;

  if (!Array.isArray(it.party) && isLegacyItems(it.items)) {
    const legacy = migrateLegacyItems(it.items);
    party = legacy.slice(0, WORKSHOP_PARTY_SIZE);
    box = legacy.slice(WORKSHOP_PARTY_SIZE, WORKSHOP_PARTY_SIZE + WORKSHOP_BOX_SIZE);
    starter = party[0]?.lineKey ?? null;
    base.items = emptyInventory();
  } else {
    base.items = normalizeInventory(it.items);
  }

  base.party = party;
  base.box = box;
  base.starter = starter;
  base.gold = clampCount(it.gold);
  base.badges = Math.min(WORKSHOP_GYM_COUNT, clampCount(it.badges));
  base.entersToday = sameDay
    ? Math.min(1_000_000, clampCount(it.entersToday ?? it.exploresToday ?? it.gathersToday))
    : 0;
  base.gymsToday = sameDay ? Math.min(1_000_000, clampCount(it.gymsToday)) : 0;
  base.restDay = typeof it.restDay === "string" ? it.restDay : "";

  const dex = new Set(normalizeDex(it.dex));
  for (const pet of [...party, ...box]) {
    for (const key of petDexKeys(pet)) dex.add(key);
  }
  base.dex = [...dex].sort();

  base.encounter = normalizeEncounter(it.encounter);
  base.run = normalizeWorkshopRunShape(it.run);
  if (base.encounter && (party.length === 0 || !party.some((pet) => pet.hp > 0))) {
    base.encounter = null;
  }

  const requested = typeof it.activePetId === "string" ? it.activePetId : null;
  const active = party.find((pet) => pet.id === requested);
  base.activePetId =
    active?.id ?? party.find((pet) => pet.hp > 0)?.id ?? party[0]?.id ?? null;
  return base;
}

export function findPet(
  state: WorkshopState,
  petId: string,
): { pet: WorkshopPet; where: "party" | "box" } | null {
  const inParty = state.party.find((pet) => pet.id === petId);
  if (inParty) return { pet: inParty, where: "party" };
  const inBox = state.box.find((pet) => pet.id === petId);
  if (inBox) return { pet: inBox, where: "box" };
  return null;
}

export function activePet(state: WorkshopState): WorkshopPet | null {
  return state.party.find((pet) => pet.id === state.activePetId) ?? state.party[0] ?? null;
}

export function firstAlivePet(state: WorkshopState): WorkshopPet | null {
  return state.party.find((pet) => pet.hp > 0) ?? null;
}

/** 把出战位指向一只还活着的灵宠；全灭时保留第一只，交给战斗层判负。 */
export function ensureActivePet(state: WorkshopState): void {
  if (state.party.some((pet) => pet.id === state.activePetId && pet.hp > 0)) return;
  state.activePetId = state.party[0]?.id ?? null;
}

/** 收进队伍（未满）或仓库；都满返回 false。 */
export function addPet(state: WorkshopState, pet: WorkshopPet): "party" | "box" | null {
  if (state.party.length < WORKSHOP_PARTY_SIZE) {
    state.party.push(pet);
    if (!state.activePetId) state.activePetId = pet.id;
    return "party";
  }
  if (state.box.length < WORKSHOP_BOX_SIZE) {
    state.box.push(pet);
    return "box";
  }
  return null;
}

export function removePet(state: WorkshopState, petId: string): WorkshopPet | null {
  const partyIndex = state.party.findIndex((pet) => pet.id === petId);
  if (partyIndex >= 0) {
    const [pet] = state.party.splice(partyIndex, 1);
    if (state.activePetId === petId) {
      state.activePetId = state.party.find((item) => item.hp > 0)?.id ?? state.party[0]?.id ?? null;
    }
    return pet;
  }
  const boxIndex = state.box.findIndex((pet) => pet.id === petId);
  if (boxIndex >= 0) {
    const [pet] = state.box.splice(boxIndex, 1);
    return pet;
  }
  return null;
}

export function healAllParty(state: WorkshopState): number {
  let healed = 0;
  state.party = state.party.map((pet) => {
    const maxHp = petStats(pet.tier, pet.level).maxHp;
    if (pet.hp >= maxHp) return pet;
    healed += maxHp - pet.hp;
    return { ...pet, hp: maxHp };
  });
  return healed;
}

/** 任意一条线达到过的最高阶（图鉴 + 当前灵宠），用于里程碑。 */
export function highestTier(state: WorkshopState): number {
  let max = 0;
  for (const key of state.dex) {
    const tier = Math.trunc(Number(key.split(":")[1]));
    if (Number.isFinite(tier)) max = Math.max(max, tier);
  }
  for (const pet of [...state.party, ...state.box]) {
    max = Math.max(max, pet.tier);
  }
  return Math.min(WORKSHOP_TIER_COUNT, max);
}

export function partyAlive(state: WorkshopState): boolean {
  return state.party.some((pet) => pet.hp > 0);
}

export function inventoryTotal(items: WorkshopInventory): number {
  return items.ball + items.potion;
}
