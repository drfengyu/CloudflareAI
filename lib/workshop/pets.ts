import {
  WORKSHOP_LINES,
  WORKSHOP_TIER_COUNT,
  workshopTierName,
} from "./config";

/**
 * 灵宠个体：阶级（1~9）+ 等级（1~50）+ 经验 + 当前血量。
 *
 * 阶级只由养成线决定（同名同线逐阶进化），等级提供面板成长；
 * 到达该阶进化等级后自动升阶，合成则是另一条「直接跳阶」的加速路径。
 * 所有函数都是纯函数，服务端结算与单测共用同一套公式。
 */

export const WORKSHOP_MAX_LEVEL = 50;
export const WORKSHOP_PARTY_SIZE = 3;
export const WORKSHOP_BOX_SIZE = 60;
export const WORKSHOP_STARTER_LEVEL = 5;
export const WORKSHOP_POTION_HEAL = 20;
export const WORKSHOP_START_BALLS = 5;
export const WORKSHOP_START_POTIONS = 3;

export interface WorkshopPet {
  id: string;
  lineKey: string;
  tier: number;
  level: number;
  exp: number;
  /** 当前血量；0 = 倒下，需要休息或药水。 */
  hp: number;
}

export interface PetStats {
  maxHp: number;
  atk: number;
  def: number;
}

export function petStats(tier: number, level: number): PetStats {
  const safeTier = Math.min(WORKSHOP_TIER_COUNT, Math.max(1, Math.trunc(tier)));
  const safeLevel = Math.min(WORKSHOP_MAX_LEVEL, Math.max(1, Math.trunc(level)));
  return {
    maxHp: 16 + safeTier * 6 + safeLevel * 5,
    atk: 5 + safeTier * 2 + Math.floor(safeLevel * 0.9),
    def: 3 + safeTier + Math.floor(safeLevel * 0.6),
  };
}

/** 升到下一级所需经验；按当前等级计算。 */
export function expToNext(level: number): number {
  return 12 + Math.min(WORKSHOP_MAX_LEVEL, Math.max(1, Math.trunc(level))) * 6;
}

/** 该阶需要达到多少级才能进化；第 9 阶没有进化。 */
export function evolveLevel(tier: number): number | null {
  const safe = Math.min(WORKSHOP_TIER_COUNT, Math.max(1, Math.trunc(tier)));
  if (safe >= WORKSHOP_TIER_COUNT) return null;
  return 6 + (safe - 1) * 4;
}

/** 1~9 阶的进化等级：6 / 10 / 14 / … / 34。 */
export const EVOLVE_LEVELS: (number | null)[] = Array.from(
  { length: WORKSHOP_TIER_COUNT },
  (_, index) => evolveLevel(index + 1),
);

export function petName(pet: Pick<WorkshopPet, "lineKey" | "tier">): string {
  return workshopTierName(pet.lineKey, pet.tier);
}

export function dexKey(lineKey: string, tier: number): string {
  return `${lineKey}:${Math.min(WORKSHOP_TIER_COUNT, Math.max(1, Math.trunc(tier)))}`;
}

/** 拥有某阶灵宠意味着图鉴里 1~该阶都见过。 */
export function petDexKeys(pet: Pick<WorkshopPet, "lineKey" | "tier">): string[] {
  const max = Math.min(WORKSHOP_TIER_COUNT, Math.max(1, Math.trunc(pet.tier)));
  return Array.from({ length: max }, (_, index) => dexKey(pet.lineKey, index + 1));
}

export interface CreatePetInput {
  lineKey: string;
  tier: number;
  level: number;
  id?: string;
  exp?: number;
  /** 不传则按满血创建。 */
  hp?: number;
}

export function createPet(input: CreatePetInput): WorkshopPet {
  const lineKey = WORKSHOP_LINES.some((line) => line.key === input.lineKey)
    ? input.lineKey
    : WORKSHOP_LINES[0].key;
  const tier = Math.min(WORKSHOP_TIER_COUNT, Math.max(1, Math.trunc(input.tier)));
  const level = Math.min(WORKSHOP_MAX_LEVEL, Math.max(1, Math.trunc(input.level)));
  const maxHp = petStats(tier, level).maxHp;
  const hp = typeof input.hp === "number" ? input.hp : maxHp;
  return {
    id: input.id?.trim() || crypto.randomUUID(),
    lineKey,
    tier,
    level,
    exp: Math.max(0, Math.trunc(input.exp ?? 0)),
    hp: Math.min(maxHp, Math.max(0, Math.trunc(hp))),
  };
}

/** 脏存档里的灵宠：线路/阶数/等级越界夹到边界，血量按当前面板重算。 */
export function normalizePet(raw: unknown): WorkshopPet | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<WorkshopPet>;
  if (typeof row.lineKey !== "string") return null;
  if (!WORKSHOP_LINES.some((line) => line.key === row.lineKey)) return null;
  const tier = Math.trunc(Number(row.tier));
  const level = Math.trunc(Number(row.level));
  if (!Number.isFinite(tier) || !Number.isFinite(level)) return null;
  return createPet({
    id: typeof row.id === "string" ? row.id : undefined,
    lineKey: row.lineKey,
    tier,
    level,
    exp: Number.isFinite(Number(row.exp)) ? Math.trunc(Number(row.exp)) : 0,
    hp: Number.isFinite(Number(row.hp)) ? Math.trunc(Number(row.hp)) : undefined,
  });
}

export interface GainExpResult {
  pet: WorkshopPet;
  levels: number;
  fromTier: number;
  toTier: number;
}

/**
 * 加经验并结算升级 / 自动进化。
 *
 * 升级会按面板差值补血量（不进战斗也能看到成长）；进化同理，且一次结算
 * 最多跨四级，不会出现连跳两阶的情况（进化门槛相隔 4 级）。
 */
export function gainExp(pet: WorkshopPet, amount: number): GainExpResult {
  const fromTier = pet.tier;
  let tier = pet.tier;
  let level = pet.level;
  let exp = Math.max(0, pet.exp) + Math.max(0, Math.trunc(amount));
  let hp = pet.hp;
  let levels = 0;

  while (level < WORKSHOP_MAX_LEVEL) {
    const need = expToNext(level);
    if (exp < need) break;
    exp -= need;
    const beforeLevel = petStats(tier, level).maxHp;
    level += 1;
    hp += petStats(tier, level).maxHp - beforeLevel;
    levels += 1;
    const needTier = evolveLevel(tier);
    if (needTier !== null && level >= needTier) {
      const beforeEvolve = petStats(tier, level).maxHp;
      tier += 1;
      hp += petStats(tier, level).maxHp - beforeEvolve;
    }
  }
  if (level >= WORKSHOP_MAX_LEVEL) exp = 0;

  return {
    pet: { ...pet, tier, level, exp, hp },
    levels,
    fromTier,
    toTier: tier,
  };
}

/** 战斗胜利给的经验；捕捉只给一半，避免「抓了就满级」。 */
export function battleExp(tier: number, level: number, captured: boolean): number {
  const base = Math.trunc(level) * 3 + Math.trunc(tier) * 6;
  return Math.max(1, Math.floor(base * (captured ? 0.5 : 1)));
}

/** 面板总评，用于「队伍/仓库」里的强弱排序提示。 */
export function petScore(pet: WorkshopPet): number {
  const stats = petStats(pet.tier, pet.level);
  return stats.maxHp + stats.atk * 4 + stats.def * 3;
}
