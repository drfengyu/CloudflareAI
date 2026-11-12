/**
 * 每日试炼·三国讨逆传：城镇行走 + 回合制五将战斗的共享类型。
 *
 * 存档与战果都由服务端按指令重放得出：客户端只上传「编制 / 购物 / 战斗指令」，
 * 不直接上报金币、等级或胜负。剧情地点与敌将配置随出城落库，随机数由种子推进。
 */

export const SAGA_RUN_VERSION = 6;
export const SAGA_SAVE_VERSION = 1;

export const SAGA_PARTY_SIZE = 5;
export const SAGA_RESERVE_SIZE = 12;
export const SAGA_MAX_LEVEL = 30;

export const SAGA_VIEW_W = 480;
export const SAGA_VIEW_H = 270;
export const SAGA_TILE = 16;
export const SAGA_TOWN_COLS = 30;
export const SAGA_TOWN_ROWS = 17;
export const SAGA_INTERACT_RADIUS = 26;

export const SAGA_MAX_COMMANDS = 4000;
export const SAGA_MAX_ROUNDS_PER_BLOCK = 200;
export const SAGA_MAX_TOTAL_ROUNDS = 2400;

export type FormationId = "yulin" | "heyi" | "fengshi" | "fangyuan" | "changshe";
export type TacticId = "huoji" | "huifu" | "hunluan" | "guwu";
export type SagaItemKind = "weapon" | "armor" | "consumable" | "supply";

export interface SagaGeneralDef {
  id: string;
  name: string;
  title: string;
  force: number;
  intellect: number;
  defense: number;
  speed: number;
  tactics: TacticId[];
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
  met: string[];
  recruited: string[];
  stats: SagaStats;
}

export interface SagaItemDef {
  id: string;
  name: string;
  kind: SagaItemKind;
  priceGold?: number;
  priceTickets?: number;
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
  at: number;
  /** 购买时已经执行过的指令数：军需从下一条指令起生效。 */
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
  expGained: number;
  /** 本次行军在钱庄存下的金币；收兵时按 bank.ts 的汇率折成 tcr。 */
  bankedGold: number;
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
  | { k: "shop"; i: string }
  | { k: "equip"; g: string; slot: "weapon" | "armor"; i: string | null }
  | { k: "party"; active: string[] }
  /** 钱庄存金：按 100 金一档扣，收兵时统一折成 tcr 发放。 */
  | { k: "bank"; g: number }
  | { k: "leave" }
  | { k: "battle"; rounds: SagaRoundCommand[][] };

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
  tacticPoints: number;
  weaponAtk: number;
  armorDef: number;
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
  scene: "town" | "battle" | "won" | "lost";
  nodeIndex: number;
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
  recruited: string[];
  battlesWon: number;
}

export interface SagaReplayResult {
  state: SagaReplayState;
  cleared: number;
  victory: boolean;
}
