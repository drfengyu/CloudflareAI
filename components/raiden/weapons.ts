/**
 * 雷电行动的武器系统：5 种子弹类型共用一条等级线（Lv1~Lv11）。
 *
 * 规则是「单一类型 + 单条等级」：吃到与当前类型不同的字母会清空等级并切换，
 * 吃到相同字母才升级；因此升级前用子弹把掉落物打成想要的字母是核心操作。
 * 引擎的弹道参数与界面文案都从这里取，避免两处各写一份数字。
 */

export type BulletType = "W" | "S" | "M" | "L" | "P";

export const BULLET_TYPES: BulletType[] = ["W", "S", "M", "L", "P"];

/** 等级上限：出击商店买满 10 份火力强化即 Lv11，关卡内捡到同字母继续 +1。 */
export const MAX_WEAPON_LEVEL = 11;
export const MIN_WEAPON_LEVEL = 1;

/** 满级后再吃到同字母不再升级，折算成分数。 */
export const MAX_LEVEL_SCORE = 1500;

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
};

/** 炸弹补给与战利品箱的颜色：和五种子弹字母明显区分。 */
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
 * 补给掉落池：当前类型权重更高，让玩家能顺着现有 build 升级，
 * 同时保留足够多的其它字母，切换类型的选择权始终在玩家手里。
 */
export function rollSupplyDrop(current: BulletType, bombAvailable: boolean): BulletType | "B" {
  const pool: (BulletType | "B")[] = [];
  for (const t of BULLET_TYPES) pool.push(t);
  pool.push(current, current);
  if (bombAvailable) pool.push("B");
  return pool[Math.floor(Math.random() * pool.length)] ?? current;
}

export interface Ballistics {
  /** 齐射间隔（秒），越小射速越快。 */
  interval: number;
  /** 一次齐射发出的弹体数（弹片 / 导弹 / 光束 / 榴弹）。 */
  streams: number;
  /** 单发伤害。 */
  dmg: number;
  /** 弹速（px/s）。 */
  speed: number;
  /** 机炮 / 散射的总张角（弧度）。 */
  arc: number;
  /** 激光的穿透次数。 */
  pierce: number;
  /** 榴弹 / 导弹的爆炸半径（px）。 */
  blastR: number;
}

/**
 * 弹道表：Lv1 是「能玩但明显偏弱」，Lv11 是满配；每种类型在不同维度上成长，
 * 保证切换类型会带来真实的打法变化而不只是数字变化。
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
      };
  }
}

/** 面板里的一句话数值：让玩家看清当前等级给到什么。 */
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
  }
}
