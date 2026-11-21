/**
 * 每日试炼·三国讨逆传：大地图自由行军 + 回合制五将战斗的共享类型。
 *
 * 存档与战果都由服务端按指令重放得出：客户端只上传「编制 / 购物 / 打的是哪座营」，
 * 不直接上报金币、等级或胜负。剧情地点与敌将配置随出城落库，随机数由种子推进。
 */

import type { SagaBankPolicy } from "./bank";

export const SAGA_RUN_VERSION = 7;
export const SAGA_SAVE_VERSION = 1;

/**
 * 战斗规则版本：v2 起武将固有特性、按等级成长策略点与领悟计策生效；
 * v3 起营寨随机增兵、敌将带装备、命中与伤害按智力 / 等级浮动；
 * v4 起杂兵（兵士 / 山贼 / 海贼 / 盗贼）也按等级带装备，但比同级敌将低一档；
 * v5 起敌方装备每 5 级升一档并带随机强化，招降只收人、不带随身装备；
 * v6 起杂兵装备比同级敌将低两档（v4/v5 低一档），野外杂兵等级也整体下调；
 * v7 起招降只在野外遭遇：营寨 / 精锐 / 攻城里的敌将一律不可招，野外头目按武将资料开放招降；
 * v8 起野外头目不再看武将资料的白名单（有名有姓的头目都能劝降，杂兵与「黄巾力士」除外），
 * 且取消「兵力 ≤ 35% 才可劝降」的硬门槛：野外头目血少，35% 窗口常被一击跨过，
 * 改成随时可劝降、成功率按剩余兵力打折（≤35% 时仍是原来的概率公式）。
 * v9 起成长与兵力换口径：四维每级成长翻三倍、四维封顶 255（基础属性不动），
 * 兵力（双方）翻一倍、药品回复按两倍兵力口径同步，敌将四维同吃这套成长。
 * v10 起兵种相克与名将连携：兵种按武将底子推（骑 > 弓 > 枪 > 骑），
 * 同一侧凑齐连携需要的名将即整队加成；v10 之前的行军仍按旧账重放。
 * v11 起取消战斗内劝降指令：战斗胜利后按概率弹出归降提议，标价金（或物品）与成功率，
 * 玩家接受后扣资源、再掷一次概率决定是否入队；v10 及更早的行军仍按旧战报重放。
 * v12 起策略与阵形按等级领悟：计策分等级与策略值消耗，高级阵形要练到等级才能换，
 * 战斗内可发变阵指令（消耗下令武将的策略值）；v11 及更早的行军仍按旧账重放。
 * v13 起敌军兵力按「同等级我方基准 × 1.2~6 倍」给（营寨 / 精锐 / 本阵 / 野外各占一档），
 * 不再用武将自身 baseTroops 的旧曲线；v12 及更早的行军仍按旧账重放。
 * v14 起等级封顶抬到 50、兵力改几何曲线（1 级 100 兵 → 50 级 20000 兵），
 * 每级四维成长由 ×3 收到 ×2；v13 及更早的行军仍按旧账重放。
 * v17 起等级封顶抬到 100，兵力改「小幅线性 + 二次成长」（1 级 100 兵 → 100 级 40294 兵），
 * v18 起武力 / 智力 / 速度固定不随等级成长，攻击 / 防御改成长值并含装备封顶 255；
 * 智决定 SP 与计策伤害，速决定命中 / 暴击 / 爆伤，SP 随等级最高 255。
 * 旧行军仍按各自版本的成长与兵力口径重放。
 * 旧行军没有这个字段，重放时按 v1 走，避免改版把还没收兵的对局打乱。
 */
export const SAGA_RULESET = 18;

/**
 * v19：新开行军使用的“原作口径”规则档。
 * 面板攻击只显示兵器值、防御只显示装备值；物理与计策走原作公式；
 * 兵力上限抬到 99999，开局可选简单 / 普通 / 困难三档敌方伤害。
 * 旧 v18 行军仍用 `SAGA_RULESET` 重放，互不翻账。
 */
export const SAGA_RULESET_V19 = 19;

/** v19 的装备上限：兵器 255、五件防具合计 255。 */
export const SAGA_WEAPON_CAP_V19 = 255;
export const SAGA_GEAR_DEF_CAP_V19 = 255;

/** v19 兵力上限：原作 9999 的十倍，方便在 100 级框架里继续拉长。 */
export const SAGA_TROOP_CAP_V19 = 99_999;

/** 开局难度：只改敌方伤害公式，不改兵力与装备。 */
export type SagaDifficulty = "easy" | "normal" | "hard";
export const SAGA_DEFAULT_DIFFICULTY: SagaDifficulty = "normal";
export const SAGA_DIFFICULTY_LABEL: Record<SagaDifficulty, string> = {
  easy: "简单",
  normal: "普通",
  hard: "困难",
};
export const SAGA_DIFFICULTY_DESC: Record<SagaDifficulty, string> = {
  easy: "敌军伤害最低，敌方防御按等级额外加成 1.5 倍，适合先看剧情。",
  normal: "原作公式：我方打敌方不吃等级惩罚，敌方打我方防御要加等级，伤害再叠 0.35 阻尼。",
  hard: "敌军不再吃“防御+等级”惩罚，伤害系数上调，正面硬拼压力最大。",
};

/** 难度对应的敌方伤害参数：防御等级系数与伤害倍率。 */
export const SAGA_DIFFICULTY_ENEMY: Record<
  SagaDifficulty,
  { defenseLevelScale: number; damageScale: number }
> = {
  easy: { defenseLevelScale: 1.5, damageScale: 0.7 },
  normal: { defenseLevelScale: 1, damageScale: 1 },
  hard: { defenseLevelScale: 0, damageScale: 1.8 },
};

export function normalizeSagaDifficulty(value: unknown): SagaDifficulty {
  return value === "easy" || value === "hard" ? value : "normal";
}

/**
 * v19 敌方伤害阻尼：原作乘除公式在 99999 兵线上会把“武力 × 兵力 × 兵器”顶得过高，
 * 这里给敌方单独乘 0.35，保留不公平公式的等级惩罚，又不至于首战三回合被打空。
 */
export const SAGA_ENEMY_DAMAGE_DAMP = 0.35;

/**
 * 属性上限：255。
 * v18 起武力 / 智力 / 速度是固定基础值，不随等级成长；旧表按 2.5 倍铺进 255 区间见
 * `SAGA_STAT_BASE_SCALE`。攻击 / 防御才是成长值，
 * 由武力底子 + 等级成长 + 装备实时叠加，含装备一起封顶 255。
 */
export const SAGA_STAT_CAP = 255;

/**
 * v18 基础三维换算倍率：旧表按 0~100 写人物底子，直接搬进 255 上限会显得「满格 255、
 * 名将只有 70」，所以 v18 起把武力 / 智力按 2.5 倍铺满区间（吕布 100 → 255、刘备 70 → 175）。
 * 旧规则不换算，重放数值不翻账。
 */
export const SAGA_STAT_BASE_SCALE = 2.5;

/** v18 的基础三维取值：旧表底子 × 2.5，再叠特性并封顶 255。 */
export function sagaV18Stat(raw: number, bonus = 0): number {
  return Math.min(SAGA_STAT_CAP, Math.round(raw * SAGA_STAT_BASE_SCALE + bonus));
}

/**
 * v18 速度单独走 0~210 区间：旧表最高 86（吕布）× 2.4 → 206，赵云 187、张飞 132，
 * 不再占满 255；命中 / 暴击 / 爆伤结算时再按同一倍率折回旧刻度。
 */
export const SAGA_SPEED_CAP = 210;
export const SAGA_SPEED_BASE_SCALE = 2.4;

/** v18 的固定速度：旧表底子 × 2.4，叠特性后封顶 210。 */
export function sagaV18Speed(raw: number, bonus = 0): number {
  return Math.min(SAGA_SPEED_CAP, Math.round(raw * SAGA_SPEED_BASE_SCALE + bonus));
}

/** 上阵队伍上限：v15 起从 5 人抬到 7 人，战场两列排开一起上。 */
/** 上阵 7 人，但每场最多 5 人出战，其余两人留作替补。 */
export const SAGA_PARTY_SIZE = 7;
/** 每场战斗实际上阵人数。 */
export const SAGA_DEPLOY_SIZE = 5;
/** 兼容旧代码：敌军席位数与上阵人数共用同一上限。 */
export const SAGA_BATTLE_SIZE = SAGA_DEPLOY_SIZE;
/** 待命席上限：12 张卡就会把「移出在队武将」堵死，v15 起放宽到 120，招降的人都有地方放。 */
export const SAGA_RESERVE_SIZE = 120;
/** 每名武将最多携带 8 种不同道具，同种道具叠数量。 */
export const SAGA_CARRY_LIMIT = 8;
/** 武将等级封顶：v17 起从 50 抬到 100（兵力二次成长 1 级 100 兵 → 100 级 40294 兵）。 */
export const SAGA_MAX_LEVEL = 100;

/** v14~v16 的旧等级封顶：这些版本的行军仍按 50 级口径重放，不能跟着新档一起抬到 100。 */
export const SAGA_LEGACY_MAX_LEVEL = 50;

/** 按行军规则取等级上限：v17 起 100，v14~v16 仍 50。 */
export function sagaMaxLevel(rules: number = SAGA_RULESET): number {
  return rules >= 17 ? SAGA_MAX_LEVEL : SAGA_LEGACY_MAX_LEVEL;
}

/** 行军大地图：俯视格网，镜头跟随主角在图上自由行走。 */
export const SAGA_FIELD_COLS = 76;
export const SAGA_FIELD_ROWS = 48;
export const SAGA_FIELD_TILE = 32;

export const SAGA_TILE_GRASS = 0;
export const SAGA_TILE_ROAD = 1;
export const SAGA_TILE_FOREST = 2;
export const SAGA_TILE_MOUNTAIN = 3;
export const SAGA_TILE_WATER = 4;
export const SAGA_TILE_WALL = 5;
export const SAGA_TILE_YARD = 6;

/** 主角脚底碰撞盒（世界像素，半宽 / 半高）。 */
export const SAGA_HIT_HALF_W = 9;
export const SAGA_HIT_HALF_H = 6;

export type SagaTerrainFlavor = "plain" | "mountain" | "river" | "forest";

export interface SagaFieldCamp {
  /** 对应 `run.nodes` 的下标。 */
  node: number;
  tx: number;
  ty: number;
  /** 营地中心世界坐标（像素）。 */
  x: number;
  y: number;
}

/** 行军途中的乡野点位：可走近交谈，只讲剧情，不参与结算。 */
export type SagaFieldPoiKind = "village" | "shrine" | "ferry" | "cave";

export interface SagaFieldPoi {
  kind: SagaFieldPoiKind;
  name: string;
  tx: number;
  ty: number;
  x: number;
  y: number;
}

export interface SagaFieldCity {
  chapter: number;
  name: string;
  /** 城墙外框左上角与尺寸（格）。 */
  tx: number;
  ty: number;
  w: number;
  h: number;
  gateTx: number;
  gateTy: number;
  /** 城门外的交互点（像素）。 */
  x: number;
  y: number;
}

/** 大地图上的区域块（一章一块）。 */
export interface SagaFieldRegion {
  chapter: number;
  name: string;
  tx: number;
  ty: number;
  w: number;
  h: number;
}

/** 两区之间的关卡：前区本阵被破后才开闸，双向通行。 */
export interface SagaFieldGate {
  from: number;
  to: number;
  /** 闸门占的格（画一道横墙）。 */
  tx: number;
  ty: number;
  w: number;
  h: number;
  x: number;
  y: number;
  open: boolean;
}

/** 两区之间的渡口：花船票直达隔壁，回走也行。 */
export interface SagaFieldFerry {
  from: number;
  to: number;
  name: string;
  /** 船票（金币）。 */
  tickets: number;
  /** 本区上船点（像素）。 */
  x: number;
  y: number;
  /** 对岸落点（像素）。 */
  toX: number;
  toY: number;
}

export interface SagaField {
  cols: number;
  rows: number;
  tile: number;
  worldW: number;
  worldH: number;
  /** 每格地形，取 `SAGA_TILE_*`。 */
  terrain: number[];
  flavor: SagaTerrainFlavor;
  city: {
    /** 城墙外框左上角与尺寸（格）。 */
    tx: number;
    ty: number;
    w: number;
    h: number;
    gateTx: number;
    gateTy: number;
    /** 城门外的交互点（像素）。 */
    x: number;
    y: number;
  };
  /** 八区大图上各区域与州治；单区图只有一条。 */
  regions: SagaFieldRegion[];
  cities: SagaFieldCity[];
  gates: SagaFieldGate[];
  ferries: SagaFieldFerry[];
  spawn: { x: number; y: number };
  camps: SagaFieldCamp[];
  pois: SagaFieldPoi[];
}

/** 渡口船票（金币）：水路是捷径，不是白坐。 */
export const SAGA_FERRY_TICKETS = 120;

export const SAGA_MAX_COMMANDS = 4000;export const SAGA_MAX_ROUNDS_PER_BLOCK = 200;
export const SAGA_MAX_TOTAL_ROUNDS = 2400;

export type FormationId =
  | "sankai"
  | "yulin"
  | "heyi"
  | "fengshi"
  | "chongfang"
  | "baima"
  | "yizi"
  | "jingji"
  | "bagua"
  | "fangyuan"
  | "changshe"
  | "yanxing"
  | "hengzhe"
  | "beishui"
  | "bamen"
  | "chexuan";
export type TacticId =
  | "huoji"
  | "huifu"
  | "hunluan"
  | "guwu"
  | "yehuo"
  | "yanre"
  | "dare"
  | "huoshen"
  | "shutu"
  | "shuixing"
  | "shuilei"
  | "hongshui"
  | "shuilong"
  | "luomu"
  | "liushui"
  | "luoshi"
  | "toushi"
  | "jishi"
  | "tongxian"
  | "yinxian"
  | "wanfu"
  | "jinxian"
  | "fusha"
  | "xianjing"
  | "jiezhen"
  | "ansha"
  | "mianji"
  | "miance"
  | "zhaohun"
  | "xinluan";
export type SagaItemKind =
  | "weapon"
  | "armor"
  | "helmet"
  | "belt"
  | "pendant"
  | "boots"
  | "mount"
  | "consumable"
  | "supply";

/** 武将固有特性：数值、暴击与连击上的个人长板。 */
export type SagaTraitId =
  | "wushuang"
  | "zhisheng"
  | "huixin"
  | "mengjiang"
  | "tiebi"
  | "shensu"
  | "rende"
  | "xiaoxiong"
  | "ganglie"
  | "shendao"
  | "baizhan"
  | "zhenjun"
  | "xiaoyong"
  | "jizhi"
  | "tongshuai"
  | "xianfeng";

export interface SagaTraitDef {
  id: SagaTraitId;
  name: string;
  desc: string;
  force?: number;
  intellect?: number;
  defense?: number;
  speed?: number;
  /** 普攻暴击率（0~1），暴击伤害 ×1.7。 */
  crit?: number;
  /** 普攻追加一击的概率（0~1），追击按七成伤害结算。 */
  extraAttack?: number;
  /** 普攻伤害加成（0~1）。 */
  attackPct?: number;
  /** 受到伤害的减免（0~1）。 */
  damageCut?: number;
  /** 战斗开始时额外的计策点。 */
  tacticPoints?: number;
  /** 计策伤害与回复加成（0~1）。 */
  tacticPct?: number;
}

/** 兵种：骑克弓、弓克枪、枪克骑。 */
export type SagaCorps = "cavalry" | "spear" | "bow";

export interface SagaGeneralDef {
  id: string;
  name: string;
  title: string;
  force: number;
  intellect: number;
  defense: number;
  speed: number;
  tactics: TacticId[];
  /** 会使的兵器；不填按默认剑。 */
  arms?: WeaponType[];
  /** 智将随等级领悟的计策：达到等级后并入可用计策表。 */
  learn?: { level: number; tactic: TacticId }[];
  traits?: SagaTraitId[];
  baseTroops: number;
  growth: number;
  color: string;
  accent: string;
  recruitable?: boolean;
  recruitHard?: boolean;
  enemyOnly?: boolean;
}

export type WeaponType = "sword" | "axe" | "spear" | "bow" | "blade" | "halberd";

/** 兵器品质：木 → 铁 → 铜 → 银 → 钢 → 精钢 → 玄铁名器。 */
export type WeaponQuality = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type GearSlot = "weapon" | "armor" | "helmet" | "belt" | "pendant" | "boots" | "mount";

export interface SagaGeneralState {
  id: string;
  level: number;
  exp: number;
  weapon: string | null;
  armor: string | null;
  /** v0.96：新增护具与坐骑槽，未穿时为空。 */
  helmet?: string | null;
  belt?: string | null;
  pendant?: string | null;
  boots?: string | null;
  mount?: string | null;
  /** 每名武将随身最多 8 种道具，值为叠加数量。 */
  items?: Record<string, number>;
  /** 当前剩余兵力；0 表示阵亡，需招魂计或复活道具才归队。 */
  troops?: number;
  /** v18 起跨战斗保留的策略值；住宿、回气道具与战斗防御可补。 */
  sp?: number;
}

export interface SagaStats {
  runs: number;
  wins: number;
  battlesWon: number;
  bestCleared: number;
  recruited: number;
}

export interface TrialSave {
  version: number;
  /** v19 起记录本档使用的规则版本；旧档缺省按 v18。 */
  rules?: number;
  /** v19 起记录开局难度；旧档缺省普通。 */
  difficulty?: SagaDifficulty;
  chapter: number;
  clears: number;
  gold: number;
  formation: FormationId;
  party: SagaGeneralState[];
  reserve: SagaGeneralState[];
  bag: Record<string, number>;
  gear: Record<string, number>;
  /** 铁匠铺强化等级：按装备 ID 记 1~5 级，0 级不入表。 */
  gearLevels: Record<string, number>;
  met: string[];
  recruited: string[];
  /** 每日免费住宿：上次住的自然日（Asia/Shanghai）与当天已用次数，最多两次。 */
  innFreeDate?: string;
  innFreeUsed?: number;
  stats: SagaStats;
}

export interface SagaItemDef {
  id: string;
  name: string;
  kind: SagaItemKind;
  /** 活动券价：城内所有买卖都只收活动券，服务端购买时实时扣。 */
  priceTickets: number;
  atk?: number;
  def?: number;
  speed?: number;
  /** 使用后回复的兵力。 */
  heal?: number;
  /** 使用后回复的策略值（v18 起）。 */
  sp?: number;
  /** 复活：按目标兵力上限的比例回兵，0 表示不是复活道具。 */
  revive?: number;
  /** 攻击类武器的兵种；武将只能装备自己会使的兵器。 */
  weaponType?: WeaponType;
  /** 兵器品质：只影响分城货架与说明，攻击值直接写在 atk。 */
  quality?: WeaponQuality;
  /** 坐骑 / 护具的装备槽；不填时按 kind 推断。 */
  slot?: GearSlot;
  /** 上架章节：后面的城才卖更好的货。 */
  chapter?: number;
  desc: string;
  /** 军需品效果：passive 在出城后生效，consumable 进这次行军的行囊。 */
  supply?: "troops" | "attack" | "speed" | "tactic" | "revive" | "heal";
  /** 可否重复购买；默认消耗品可叠、装备与军需各限一次。 */
  stack?: boolean;
}

export interface SagaFormationDef {
  id: FormationId;
  name: string;
  desc: string;
  atk: number;
  def: number;
  spd: number;
  beats: FormationId;
  /** 解锁等级：队伍里有武将练到这个等级，才能在编成所换上。 */
  level: number;
  /** 战斗内变阵消耗的策略值（由下令武将出）。 */
  cost: number;
  /** 旧版自拟阵，仍可被老存档 / 老行军重放引用，但不再出现在变阵菜单。 */
  legacy?: boolean;
  /** 静寂阵：布阵期间己方不能再用回复系计策。 */
  noHeal?: boolean;
}

export interface SagaChapterDef {
  index: number;
  name: string;
  subtitle: string;
  town: string;
  blurb: string;
  /** 剧情梗概（原创文案，按演义主线推进），客户端在当前地点入口展示。 */
  story: string[];
  /** 节点地名，按行军顺序取用。 */
  stages: string[];
  /** 行军大地图上的三处乡野点位：村落 / 古庙 / 渡口。 */
  landmarks: [string, string, string];
  /** 行军大地图的地貌风味：决定山、水、林的疏密。 */
  terrain: SagaTerrainFlavor;
  field: string[];
  elite: string[];
  boss: string;
  guards: string[];
  /**
   * 本章岔路：两处营地只能打一处，敌将 / 名称 / 文案 / 奖励各不相同。
   * 一条偏「守正」（护民、护粮，多给金币），一条偏「奇袭」（截粮、劫营，多给经验）。
   */
  branch?: {
    a: { name: string; blurb: string; pool: string[]; bonus: "gold" | "exp" };
    b: { name: string; blurb: string; pool: string[]; bonus: "gold" | "exp" };
  };
  unlock: string | null;
}

/**
 * 计策定义：按吞食天地那套分火 / 水 / 石 / 回复 / 特殊几系，
 * 每阶有威力系数、习得等级与策略值消耗。
 */
export interface SagaTacticDef {
  id: TacticId;
  name: string;
  desc: string;
  /** 施放一次消耗的策略值。 */
  cost: number;
  /** 领悟等级：0 为入门计策，其余要练到这个等级才出现在计策表里。 */
  level: number;
  /** 计策系别，决定结算口径（火 / 水打全体，石打单体，回复与特殊各自一套）。
   *  `break` = 破阵（敌阵回散开），`assassin` = 单体即死。 */
  kind:
    | "fire"
    | "water"
    | "rock"
    | "heal"
    | "healAll"
    | "confuse"
    | "buff"
    | "trap"
    | "break"
    | "assassin"
    | "ward"
    | "wardTactic"
    | "revive"
    | "drain";
  /** 威力系数：火 / 水 / 石按它放大伤害，回复按它放大回兵量。 */
  power?: number;
  /** v19 原作口径的计策基数（已按 99999 兵力放大 10 倍），优先于 `power`。 */
  base?: number;
  /** 混乱 / 缚杀这类计策持续几回合。 */
  turns?: number;
}

export interface SagaEnemy {
  id: string;
  name: string;
  title: string;
  level: number;
  troops: number;
  maxTroops: number;
  force: number;
  intellect: number;
  defense: number;
  speed: number;
  tactics: TacticId[];
  /** 敌将若在武将表里有固有特性，出阵时一并带上。 */
  traits?: SagaTraitId[];
  /** 杂兵（兵士 / 山贼 / 海贼 / 盗贼）：v6 起装备比同级敌将低两档，v4/v5 低一档。 */
  poor?: boolean;
  color: string;
  accent: string;
  recruitable: boolean;
  recruitHard: boolean;
  boss: boolean;
}

export type SagaNodeKind = "town" | "battle" | "gate" | "siege" | "elite" | "boss";

export interface SagaNode {
  kind: SagaNodeKind;
  name: string;
  blurb: string;
  /** 城镇节点为 0。 */
  chapter: number;
  enemies: SagaEnemy[];
  rewardGold: number;
  rewardExp: number;
  enemyFormation: FormationId;
  /**
   * 岔路：同一 `group` 的两座营只能走一条。
   * 打通其中一条后，另一条自动闭营（写进 `clearedNodes`），不会卡住本阵解锁。
   */
  branch?: { group: number; option: 0 | 1 };
}

export interface SagaPurchase {
  id: string;
  itemId: string;
  tickets: number;
  /** 旧版 tcr 换金币的购买记录：这一笔换进游戏的金币数（`itemId` 为 `bank_gold`）。 */
  gold?: number;
  /** 钱庄金币换券：这一笔扣掉的行军金币与到账的试炼券张数（`itemId` 为 `coupon`）。 */
  goldCost?: number;
  coupons?: number;
  /** 训练场：受训武将与该次训练的目标等级。 */
  generalId?: string;
  targetLevel?: number;
  /** 铁匠铺：被强化的装备与强化后的等级（`itemId` 为 `forge`）。 */
  gearId?: string;
  at: number;
  /** 每日两次免费住宿：这一笔不扣券，并记下所属自然日。 */
  freeStay?: boolean;
  freeDay?: string;
  /** 购买时已经执行过的指令数：装备 / 军需 / 住店从下一步行动起生效。 */
  cmdIndex: number;
}

export interface SagaRunResult {
  cleared: number;
  total: number;
  victory: boolean;
  chapterBefore: number;
  chapterAfter: number;
  chapterName: string;
  goldGained: number;
  /** 平定此处额外加进存档的金币；存档里已含这笔，战报单独展示用。 */
  clearGold?: number;
  expGained: number;
  /** 本次行军在钱庄存下的金币；收兵时按 bank.ts 的汇率折成 tcr。 */
  bankedGold: number;
  /** 本次行军打过的野外遭遇战次数，战报展示用。 */
  encounters: number;
  recruited: string[];
  battlesWon: number;
  party: { id: string; name: string; level: number }[];
}

export interface SagaRun {
  version: number;
  kind: "saga";
  activityKey: string;
  seed: number;
  nodes: SagaNode[];
  startSave: TrialSave;
  purchases: SagaPurchase[];
  shopSeq: number;
  /** 出城时冻结的钱庄汇率：改后台设置不影响已经开出的行军。 */
  bank: SagaBankPolicy;
  /** 战斗规则版本，见 `SAGA_RULESET`；旧行军缺省按 1。 */
  rules?: number;
  /** v19 起开局的敌方伤害难度；旧行军缺省普通。 */
  difficulty?: SagaDifficulty;
  /**
   * 旧规则行军续玩时的分界：第几条指令起改用当前 `rules`。
   * 之前的指令仍按 `legacyRules` 重放，已经打过的仗不会因为改版翻盘。
   */
  rulesFrom?: number;
  /** 升级前这套行军使用的规则版本（`rulesFrom` 之前的指令生效）。 */
  legacyRules?: number;
  /**
   * 自动存档的指令进度：客户端每次生成指令就整段回传，服务端只保留与重放等价的副本，
   * 断线后从最近一次存档接着走，不再从头再来。
   */
  commands?: SagaCommand[];
  endSave?: TrialSave;
  result?: SagaRunResult;
}

export interface SagaRoundCommand {
  g: string;
  a: "attack" | "guard" | "tactic" | "item" | "recruit" | "formation";
  t?: TacticId;
  /** 变阵指令要换的阵形。 */
  f?: FormationId;
  i?: string;
  target?: number;
}

export type SagaCommand =
  | { k: "formation"; f: FormationId }
  | { k: "equip"; g: string; slot: GearSlot; i: string | null }
  /** 非战斗时用道具：回复兵力、复活败将等。 */
  | { k: "use"; g: string; i: string; target?: string }
  /** 丢弃随身道具，给 8 件上限腾位置。 */
  | { k: "drop"; g: string; i: string }
  /** 把随身道具转交给队中另一名武将。 */
  | { k: "give"; from: string; to: string; i: string }
  /** 折价卖出装备或道具，按原价一半折成金币。 */
  | { k: "sell"; i: string; g?: string }
  | { k: "party"; active: string[] }
  /** 钱庄存金：按本次行军的存金价整档扣，收兵时统一折成 tcr 发放。 */
  | { k: "bank"; g: number }
  | { k: "leave" }
  /** 撤退：打完已排的回合就收兵回城，战果与折损照算，行军进度不丢。 */
  | { k: "retreat" }
  /** 打的是图上哪座营：大地图上可以自由挑顺序，首领营要先破其余营。 */
  | { k: "battle"; node: number; rounds: SagaRoundCommand[][] }
  /** 野外遭遇战：不占营地进度，编成由种子与这是第几场遭遇推出。 */
  | {
      k: "skirmish";
      rounds: SagaRoundCommand[][];
      /** 开打当时锁定的队伍快照；老战报没有，仍按旧口径重放。 */
      field?: SagaFieldBattleContext;
    }
  /** 胜利后的归降回应：accept=true 按标价付钱并再掷一次成功率，false 婉拒（无成本）。 */
  | {
      k: "recruit";
      general: string;
      accept: boolean;
      gold: number;
      itemId: string | null;
    }
  /** 乘船：在两区渡口之间摆渡，扣船票（金币）。走位本身不入指令，这里只管钱与关卡口径。 */
  | { k: "ferry"; to: number }
  /** 山洞宝箱：开启一次得装备 / 药品，按箱子 ID 去重，不能反复刷。 */
  | { k: "loot"; chest: string; item: string; qty?: number }
  /** 非战斗时施展回复计：每趟行军限三次，按施计者智力与等级回兵。 */
  | { k: "tactic"; g: string; t: string };

/**
 * 胜利后弹出的一条归降提议：由本场战斗的种子与战报确定标价、聘礼与成功率，
 * 玩家接受后服务端（重放）再掷一次概率决定是否入队。
 */
export interface RecruitOffer {
  generalId: string;
  name: string;
  title: string;
  level: number;
  goldCost: number;
  itemId: string | null;
  itemCount: number;
  /** 接受后的入队概率（0–100）。 */
  chance: number;
  /** 名将级难招：标价更高、基础概率更低。 */
  hard: boolean;
}

export interface SagaBattleGeneral {
  id: string;
  name: string;
  title: string;
  side: "player" | "enemy";
  level: number;
  troops: number;
  maxTroops: number;
  force: number;
  intellect: number;
  /** v18 起为「含装备后的总防御」；旧规则仍由 battle.ts 另行计算。 */
  defense: number;
  /** v18 起为「含装备后的总攻击」；旧规则仍走 battleAttackPower 的旧公式。 */
  attack: number;
  speed: number;
  tactics: TacticId[];
  /** 武将固有特性，参与伤害、暴击与开场策略点结算。 */
  traits: SagaTraitId[];
  /** 兵种（v10 起参与克制结算；旧规则一律按枪兵算）。 */
  corps: SagaCorps;
  /** 生效中的名将连携名字，只用于战报与面板展示。 */
  bonds: string[];
  /** 连携带来的攻击加成与减伤（0.1 表示 +10%）。 */
  bondAtk: number;
  bondCut: number;
  tacticPoints: number;
  /** v18 起策略值上限：防御回气与住宿补满都以此封顶。 */
  spMax: number;
  weaponAtk: number;
  armorDef: number;
  /** 装备外观：立绘与战阵造型按穿戴的兵器 / 甲胄改变。 */
  weapon: string | null;
  armor: string | null;
  /** v18 起敌将可能额外披挂的头盔、腰带、佩饰、靴与坐骑，只用于敌情展示与本场加成。 */
  helmet?: string | null;
  belt?: string | null;
  pendant?: string | null;
  boots?: string | null;
  mount?: string | null;
  /** 上述额外护具加起来的防御与速度。 */
  extraDef?: number;
  extraSpeed?: number;
  /** 敌方装备的随机强化等级（0 表示未强化），只影响本场攻防与敌情面板。 */
  weaponPlus?: number;
  armorPlus?: number;
  color: string;
  accent: string;
  guard: boolean;
  confused: number;
  buff: number;
  /** 免击计剩余回合：期间不受普攻伤害。 */
  ward: number;
  /** 免策计剩余回合：期间不受攻击计策伤害。 */
  wardTactic: number;
  downed: boolean;
  recruitable: boolean;
  recruitHard: boolean;
  boss: boolean;
}

export type SagaBattleEventKind =
  | "attack"
  | "tactic"
  | "heal"
  | "guard"
  | "down"
  | "recruit"
  | "buff"
  | "miss"
  | "confuse"
  | "level";

export interface SagaBattleEvent {
  kind: SagaBattleEventKind;
  side: "player" | "enemy";
  actor: string;
  target?: string;
  amount?: number;
  /** 这次普攻触发了暴击，动画用它加重飘字与震屏。 */
  crit?: boolean;
  text: string;
}

/** 野外遭遇开打时锁定的队伍快照，保证客户端即时开战与服务端重放同编成。 */
export interface SagaFieldBattleContext {
  level: number;
  avgTroops: number;
  partySize: number;
}

export interface SagaBattleState {
  nodeIndex: number;
  nodeName: string;
  boss: boolean;
  /** 本场适用的战斗规则版本（见 `SAGA_RULESET`）。 */
  rules: number;
  /** v19 起本场适用的敌方伤害难度。 */
  difficulty?: SagaDifficulty;
  round: number;
  phase: "select" | "won" | "lost";
  party: SagaBattleGeneral[];
  enemies: SagaBattleGeneral[];
  playerFormation: FormationId;
  enemyFormation: FormationId;
  target: number;
  log: SagaBattleEvent[];
  lastEvents: SagaBattleEvent[];
  rngState: number;
  rewardGold: number;
  rewardExp: number;
  pendingRecruits: string[];
  /** v11 起胜利后生成的归降提议；旧规则为空。 */
  recruitOffers: RecruitOffer[];
  /** 野外遭遇开打时锁定的队伍快照（营地战为空）。 */
  field?: SagaFieldBattleContext;
}

export interface SagaInventory {
  /** 行军中购买的药/兵符剩余次数，优先于存档里的消耗品使用。 */
  bonus: Record<string, number>;
}

export interface SagaRunBuffs {
  troopPct: number;
  attackPct: number;
  speed: number;
  tacticPoints: number;
}

export interface SagaReplayState {
  scene: "field" | "battle" | "won" | "lost";
  /** 本次行军适用的战斗规则版本（见 `SAGA_RULESET`）。 */
  rules: number;
  /** v19 起本次行军的敌方伤害难度。 */
  difficulty?: SagaDifficulty;
  /** 已攻克的营地节点下标，攻打的先后由玩家在地图上自由决定。 */
  clearedNodes: number[];
  completed: number;
  victory: boolean;
  save: TrialSave;
  inventory: SagaInventory;
  buffs: SagaRunBuffs;
  partyTroops: Record<string, number>;
  /** 全灭后已在就近客栈醒来：重放层据此把 scene 留在 field，而不是回城。 */
  wokeAtInn?: boolean;
  battle: SagaBattleState | null;
  goldGained: number;
  expGained: number;
  /** 已经存进钱庄、尚未在收兵时结算 tcr 的金币。 */
  bankedGold: number;
  encounters: number;
  recruited: string[];
  battlesWon: number;
  /** 已开过的山洞宝箱（按洞穴与箱子 ID 去重），同一条指令重放只发一次。 */
  lootedChests: string[];
  /** 非战斗回复计已用次数：每趟行军最多 3 次。 */
  fieldTacticsUsed: number;
}

export interface SagaReplayResult {
  state: SagaReplayState;
  cleared: number;
  victory: boolean;
}
