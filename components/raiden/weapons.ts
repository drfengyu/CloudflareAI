/**
 * 雷电行动的武器系统：7 种子弹类型，战机同时装备 2 槽，每种类型的等级各自独立。
 *
 * 规则是「持有即保留」：吃到没学过的字母会解锁该类型（有空槽就自动装上），
 * 吃到已持有的字母只给它自己升级；`Q` / `E` 分别在主槽、副槽里循环换装。
 * 引擎的弹道参数与界面文案都从这里取，避免两处各写一份数字。
 */

export type BulletType = "W" | "S" | "M" | "L" | "P" | "T" | "R";

export const BULLET_TYPES: BulletType[] = ["W", "S", "M", "L", "P", "T", "R"];

/** 同时装备的武器槽数量（主槽 + 副槽，各自独立冷却、同时开火）。 */
export const WEAPON_SLOTS = 2;

/** 槽位的中文名，用于 HUD、提示与换装按钮。 */
export const SLOT_LABEL = ["主槽", "副槽"] as const;

/** 换装按键：与引擎的 keydown 分支一致，写在文案里的也用它。 */
export const SLOT_KEYS = ["Q", "E"] as const;

/** 等级上限：出击商店买满 10 份火力强化即机炮 Lv11，关卡内捡到同字母继续 +1。 */
export const MAX_WEAPON_LEVEL = 11;
export const MIN_WEAPON_LEVEL = 1;

/** 满级后再吃到同字母不再升级，折算成分数。 */
export const MAX_LEVEL_SCORE = 1500;

/** 电链单跳的搜索半径（px）。 */
export const CHAIN_RANGE = 132;

export interface WeaponMeta {
  type: BulletType;
  /** HUD 与面板显示的中文名。 */
  name: string;
  /** 英文代号，配合中文小字号用。 */
  callsign: string;
  /** 掉落字母、弹体与尾焰的主色。 */
  color: string;
  /** 特性一句话说明。 */
  hint: string;
}

export const WEAPONS: Record<BulletType, WeaponMeta> = {
  W: {
    type: "W",
    name: "机炮",
    callsign: "VULCAN",
    color: "#ffe066",
    hint: "直射机炮：等级越高枪管越多、射速越快，单体 DPS 最稳。",
  },
  S: {
    type: "S",
    name: "散射",
    callsign: "SCATTER",
    color: "#4fd6ff",
    hint: "扇形弹片：升级加宽张角与弹片数，贴脸命中时总伤最高。",
  },
  M: {
    type: "M",
    name: "导弹",
    callsign: "MISSILE",
    color: "#ff9d5c",
    hint: "追踪导弹：自动锁定最近目标，升级加挂载数与威力，绕后也能打。",
  },
  L: {
    type: "L",
    name: "激光",
    callsign: "LASER",
    color: "#c58cff",
    hint: "穿透光束：一条线打穿编队，升级加光束数与穿透次数。",
  },
  P: {
    type: "P",
    name: "榴弹",
    callsign: "SHELL",
    color: "#ff6f6f",
    hint: "溅射榴弹：命中即爆，升级加弹数、威力与爆炸半径，清群最强。",
  },
  T: {
    type: "T",
    name: "电链",
    callsign: "CHAIN",
    color: "#8ef05a",
    hint: "闪电链：命中后向附近目标跳跃放电，升级加跳数与单跳伤害。",
  },
  R: {
    type: "R",
    name: "火箭",
    callsign: "ROCKET",
    color: "#ff7a1a",
    hint: "抛物线火箭：升空后划出弧线并在落点炸开，升级加弹数与爆幅。",
  },
};

/** 炸弹补给与战利品箱的颜色：和七种子弹字母明显区分。 */
export const BOMB_PICKUP_COLOR = "#7ee08a";
export const LOOT_PICKUP_COLOR = "#ffd75e";

export function clampWeaponLevel(level: number): number {
  if (!Number.isFinite(level)) return MIN_WEAPON_LEVEL;
  return Math.min(MAX_WEAPON_LEVEL, Math.max(MIN_WEAPON_LEVEL, Math.trunc(level)));
}

export function isBulletType(value: unknown): value is BulletType {
  return typeof value === "string" && (BULLET_TYPES as string[]).includes(value);
}

/** 掉落字母随机改写用：排除指定字母，保证「打一下就会变」。 */
export function randomBulletType(exclude?: BulletType): BulletType {
  const pool = BULLET_TYPES.filter((t) => t !== exclude);
  return pool[Math.floor(Math.random() * pool.length)] ?? "W";
}

/**
 * 补给掉落池：已装备的两种权重更高，让玩家能顺着当前双武器升级，
 * 同时保留足够多的其它字母，解锁新类型的机会一直在。
 */
export function rollSupplyDrop(equipped: BulletType[], bombAvailable: boolean): BulletType | "B" {
  const pool: (BulletType | "B")[] = [...BULLET_TYPES];
  for (const t of equipped) pool.push(t, t);
  if (bombAvailable) pool.push("B");
  return pool[Math.floor(Math.random() * pool.length)] ?? "W";
}

/** 换装时在某槽里循环到下一个已持有、且没被另一槽占用的类型。 */
export function nextOwnedType(
  owned: BulletType[],
  current: BulletType | null,
  reserved: BulletType | null,
): BulletType | null {
  const candidates = owned.filter((t) => t !== reserved);
  if (candidates.length === 0) return null;
  const at = current ? candidates.indexOf(current) : -1;
  return candidates[(at + 1) % candidates.length] ?? candidates[0] ?? null;
}

export interface Ballistics {
  /** 齐射间隔（秒），越小射速越快。 */
  interval: number;
  /** 一次齐射发出的弹体数（弹片 / 导弹 / 光束 / 榴弹 / 电弧 / 火箭）。 */
  streams: number;
  /** 单发伤害。 */
  dmg: number;
  /** 弹速（px/s）。 */
  speed: number;
  /** 直射 / 散射 / 榴弹 / 火箭的总张角（弧度）。 */
  arc: number;
  /** 激光的穿透次数。 */
  pierce: number;
  /** 榴弹 / 导弹 / 火箭的爆炸半径（px）。 */
  blastR: number;
  /** 电链命中后的额外跳跃次数。 */
  chain: number;
}

/**
 * 弹道表：Lv1 是「能玩但明显偏弱」，Lv11 是满配；每种类型在不同维度上成长，
 * 保证换装会带来真实的打法变化而不只是数字变化。
 */
export function ballistics(type: BulletType, rawLevel: number): Ballistics {
  const lv = clampWeaponLevel(rawLevel);
  switch (type) {
    case "W":
      return {
        interval: 0.115 - 0.002 * (lv - 1),
        streams: Math.min(7, 1 + Math.ceil(lv / 2)),
        dmg: 1.4 + lv * 0.16,
        speed: 940,
        arc: 0.022 + lv * 0.005,
        pierce: 0,
        blastR: 0,
        chain: 0,
      };
    case "S":
      return {
        interval: 0.175 - 0.003 * (lv - 1),
        streams: 3 + Math.ceil(lv * 0.8),
        dmg: 0.9 + lv * 0.075,
        speed: 700 + lv * 8,
        arc: 0.34 + lv * 0.05,
        pierce: 0,
        blastR: 0,
        chain: 0,
      };
    case "M":
      return {
        interval: 0.72 - 0.022 * (lv - 1),
        streams: 1 + Math.floor(lv / 3),
        dmg: 8 + lv * 1.9,
        speed: 300 + lv * 20,
        arc: 0,
        pierce: 0,
        blastR: 26 + lv,
        chain: 0,
      };
    case "L":
      return {
        interval: 0.24 - 0.006 * (lv - 1),
        streams: 1 + (lv >= 5 ? 1 : 0) + (lv >= 9 ? 1 : 0),
        dmg: 5 + lv * 0.75,
        speed: 1000,
        arc: 0,
        pierce: 2 + Math.floor(lv / 3),
        blastR: 0,
        chain: 0,
      };
    case "P":
      return {
        interval: 0.46 - 0.008 * (lv - 1),
        streams: 1 + Math.floor(lv / 5),
        dmg: 7 + lv * 0.9,
        speed: 520,
        arc: 0.06 + lv * 0.012,
        pierce: 0,
        blastR: 44 + lv * 2.6,
        chain: 0,
      };
    case "T":
      return {
        interval: 0.5 - 0.02 * (lv - 1),
        streams: 1 + Math.floor(lv / 4),
        dmg: 6 + lv * 1.2,
        speed: 660,
        arc: 0.05 + lv * 0.01,
        pierce: 0,
        blastR: 0,
        chain: 1 + Math.floor(lv / 3),
      };
    case "R":
      return {
        interval: 1.05 - 0.032 * (lv - 1),
        streams: 1 + Math.floor(lv / 4),
        dmg: 16 + lv * 2.2,
        speed: 430 + lv * 8,
        arc: 0.05 + lv * 0.014,
        pierce: 0,
        blastR: 58 + lv * 3,
        chain: 0,
      };
  }
}

/** 面板里的一句话数值：让玩家看清每种类型当前等级给到什么。 */
export function describeWeapon(type: BulletType, level: number): string {
  const b = ballistics(type, level);
  switch (type) {
    case "W":
      return `${b.streams} 管 · 单发 ${b.dmg.toFixed(1)} · ${(1 / b.interval).toFixed(1)} 发/秒`;
    case "S":
      return `${b.streams} 片 · 张角 ${Math.round((b.arc * 180) / Math.PI)}° · 单发 ${b.dmg.toFixed(1)}`;
    case "M":
      return `${b.streams} 枚追踪 · 单发 ${b.dmg.toFixed(0)} · 爆炸半径 ${Math.round(b.blastR)}`;
    case "L":
      return `${b.streams} 道光束 · 穿透 ${b.pierce} 次 · 单发 ${b.dmg.toFixed(1)}`;
    case "P":
      return `${b.streams} 发榴弹 · 单发 ${b.dmg.toFixed(0)} · 溅射半径 ${Math.round(b.blastR)}`;
    case "T":
      return `${b.streams} 道电弧 · 跳 ${b.chain} 次 · 单跳 ${b.dmg.toFixed(0)}`;
    case "R":
      return `${b.streams} 枚火箭 · 单发 ${b.dmg.toFixed(0)} · 爆幅 ${Math.round(b.blastR)}`;
  }
}
