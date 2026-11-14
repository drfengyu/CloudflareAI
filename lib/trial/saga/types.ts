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
 * v5 起敌方装备每 5 级升一档并带随机强化，招降只收人、不带随身装备。
 * 旧行军没有这个字段，重放时按 v1 走，避免改版把还没收兵的对局打乱。
 */
export const SAGA_RULESET = 5;

export const SAGA_PARTY_SIZE = 5;
export const SAGA_RESERVE_SIZE = 12;
export const SAGA_MAX_LEVEL = 30;

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
export type SagaFieldPoiKind = "village" | "shrine" | "ferry";

export interface SagaFieldPoi {
  kind: SagaFieldPoiKind;
  name: string;
  tx: number;
  ty: number;
  x: number;
  y: number;
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
  spawn: { x: number; y: number };
  camps: SagaFieldCamp[];
  pois: SagaFieldPoi[];
}

export const SAGA_MAX_COMMANDS = 4000;
export const SAGA_MAX_ROUNDS_PER_BLOCK = 200;
export const SAGA_MAX_TOTAL_ROUNDS = 2400;

export type FormationId = "yulin" | "heyi" | "fengshi" | "fangyuan" | "changshe";
export type TacticId = "huoji" | "huifu" | "hunluan" | "guwu";
export type SagaItemKind = "weapon" | "armor" | "consumable" | "supply";

/** 武将固有特性：数值、暴击与连击上的个人长板。 */
export type SagaTraitId =
  | "wushuang"
  | "zhisheng"
  | "huixin"
  | "mengjiang"
  | "tiebi"
  | "shensu"
  | "rende";

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

export interface SagaGeneralDef {
  id: string;
  name: string;
  title: string;
  force: number;
  intellect: number;
  defense: number;
  speed: number;
  tactics: TacticId[];
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

export interface SagaGeneralState {
  id: string;
  level: number;
  exp: number;
  weapon: string | null;
  armor: string | null;
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
  heal?: number;
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
  unlock: string | null;
}

export interface SagaTacticDef {
  id: TacticId;
  name: string;
  desc: string;
  cost: number;
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
  /** 杂兵（兵士 / 山贼 / 海贼 / 盗贼）：装备比同级敌将低一档。 */
  poor?: boolean;
  color: string;
  accent: string;
  recruitable: boolean;
  recruitHard: boolean;
  boss: boolean;
}

export type SagaNodeKind = "town" | "battle" | "elite" | "boss";

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
  a: "attack" | "guard" | "tactic" | "item" | "recruit";
  t?: TacticId;
  i?: string;
  target?: number;
}

export type SagaCommand =
  | { k: "formation"; f: FormationId }
  | { k: "equip"; g: string; slot: "weapon" | "armor"; i: string | null }
  | { k: "party"; active: string[] }
  /** 钱庄存金：按本次行军的存金价整档扣，收兵时统一折成 tcr 发放。 */
  | { k: "bank"; g: number }
  | { k: "leave" }
  /** 撤退：打完已排的回合就收兵回城，战果与折损照算，行军进度不丢。 */
  | { k: "retreat" }
  /** 打的是图上哪座营：大地图上可以自由挑顺序，首领营要先破其余营。 */
  | { k: "battle"; node: number; rounds: SagaRoundCommand[][] }
  /** 野外遭遇战：不占营地进度，编成由种子与这是第几场遭遇推出。 */
  | { k: "skirmish"; rounds: SagaRoundCommand[][] };

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
  defense: number;
  speed: number;
  tactics: TacticId[];
  /** 武将固有特性，参与伤害、暴击与开场策略点结算。 */
  traits: SagaTraitId[];
  tacticPoints: number;
  weaponAtk: number;
  armorDef: number;
  /** 装备外观：立绘与战阵造型按穿戴的兵器 / 甲胄改变。 */
  weapon: string | null;
  armor: string | null;
  /** 敌方装备的随机强化等级（0 表示未强化），只影响本场攻防与敌情面板。 */
  weaponPlus?: number;
  armorPlus?: number;
  color: string;
  accent: string;
  guard: boolean;
  confused: number;
  buff: number;
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
  text: string;
}

export interface SagaBattleState {
  nodeIndex: number;
  nodeName: string;
  boss: boolean;
  /** 本场适用的战斗规则版本（见 `SAGA_RULESET`）。 */
  rules: number;
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
  /** 已攻克的营地节点下标，攻打的先后由玩家在地图上自由决定。 */
  clearedNodes: number[];
  completed: number;
  victory: boolean;
  save: TrialSave;
  inventory: SagaInventory;
  buffs: SagaRunBuffs;
  partyTroops: Record<string, number>;
  battle: SagaBattleState | null;
  goldGained: number;
  expGained: number;
  /** 已经存进钱庄、尚未在收兵时结算 tcr 的金币。 */
  bankedGold: number;
  encounters: number;
  recruited: string[];
  battlesWon: number;
}

export interface SagaReplayResult {
  state: SagaReplayState;
  cleared: number;
  victory: boolean;
}
