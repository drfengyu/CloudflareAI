"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  Coins,
  Flag,
  Home,
  MessageSquare,
  Package,
  ScrollText,
  Search,
  Sparkles,
  Swords,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SoundToggle } from "@/components/activity/sound-toggle";
import { CouponShop } from "@/components/activity/coupon-shop";
import { CouponIcon } from "@/components/activity/coupon-badge";
import { cn } from "@/lib/utils";
import { formatCredits } from "@/lib/billing/credits";
import { gameAudio } from "@/lib/game/audio";
import {
  SAGA_CHAPTERS,
  SAGA_FORMATION_BY_ID,
  SAGA_FORMATIONS,
  SAGA_GENERAL_BY_ID,
  SAGA_ITEM_BY_ID,
  SAGA_ITEMS,
  SAGA_TACTIC_BY_ID,
  SAGA_TACTICS,
  SAGA_WEAPON_QUALITY_LABEL,
  SAGA_TRAIT_BY_ID,
  SAGA_CORPS_LABEL,
  gearSlotOf,
  sagaCorpsOf,
  shopStock,
  tacticsFor,
  traitStats,
  weaponProfileText,
  weaponTypesFor,
} from "@/lib/trial/saga/data";
import {
  battleAttackPower,
  battleCritRate,
  battleEffectiveSpeed,
  battleHitRate,
  battleTacticRate,
  battleTurnOrder,
  resolveBattleRound,
  startBattle,
  startEncounterBattle,
} from "@/lib/trial/saga/battle";
import {
  autoBattleRounds,
  canEngageNode,
  openNodes,
  replaySagaRun,
  sanitizeSagaCommands,
} from "@/lib/trial/saga/run";
import {
  fieldEncounterChanceAt,
  fieldHitsSolid,
  fieldHotspotNear,
  fieldSpeedAt,
  fieldWalkPoint,
  generateSagaField,
  sagaFieldFor,
  type FieldHotspot,
} from "@/lib/trial/saga/map";
import { expToNext, generalStats, partyPower, canCarryItem, carrySlots } from "@/lib/trial/saga/state";
import { SAGA_COUPON_ITEM_ID, bankCreditsForGold, couponGoldCost, couponsForGold, type SagaBankPolicy } from "@/lib/trial/saga/bank";
import {
  SAGA_FREE_INN_PER_DAY,
  SAGA_INN_ITEM_ID,
  SAGA_INN_PRICE_TICKETS,
  freeInnAvailable,
  trialDayKey,
} from "@/lib/trial/saga/inn";
import {
  SAGA_FORGE_MAX_LEVEL,
  forgeCost,
  forgeStat,
  gearLevel,
} from "@/lib/trial/saga/forge";
import {
  SAGA_TRAINING_ITEM_ID,
  SAGA_TRAINING_TICKETS_PER_LEVEL,
  trainingCost,
  trainingLevelCap,
} from "@/lib/trial/saga/training";
import {
  SAGA_CARRY_LIMIT,
  SAGA_DEPLOY_SIZE,
  SAGA_PARTY_SIZE,
  SAGA_SPEED_CAP,
  sagaMaxLevel,
  sagaV18Speed,
  sagaV18Stat,
} from "@/lib/trial/saga/types";
import {
  campScene,
  chapterIntroScene,
  chapterVictoryScene,
  councilScene,
  poiScene,
  tavernScene,
  type SagaScene,
} from "@/lib/trial/saga/story";
import {
  sagaQuestContext,
} from "@/lib/trial/saga/quests";
import type {
  FormationId,
  GearSlot,
  SagaBattleEvent,
  SagaBattleState,
  SagaCommand,
  SagaField,
  SagaReplayState,
  SagaRoundCommand,
  SagaRun,
  SagaRunResult,
  TacticId,
  TrialSave,
} from "@/lib/trial/saga/types";
import type { ActiveTrialRun, TrialSettlement } from "@/lib/trial/store";
import { SAGA_RULESET } from "@/lib/trial/saga/types";
import {
  SAGA_MAINTENANCE,
  SAGA_NOTICE_VERSION,
  latestNoticeId,
  maintenancePhaseAt,
  updateGiftTickets,
  visibleNotices,
} from "@/lib/trial/saga/notice";
import type { ActivityCouponView } from "@/lib/activity/coupons";
import {
  autoSaveTrialAction,
  buyTrialCouponsAction,
  buyTrialItemAction,
  settleTrialArchiveAction,
  startTrialAction,
  upgradeTrialGearAction,
} from "@/app/(dashboard)/trial/actions";
import {
  DEFAULT_VIEW,
  FIELD_FACILITIES,
  battleEnemyAtPoint,
  BATTLE_FLOAT_MS,
  makeSagaView,
  paintBattle,
  paintField,
  VIEW_H,
  VIEW_W,
  type BattleAnimation,
  type FieldFacilityId,
  type FieldFacing,
  type SagaView,
} from "./renderer";
import {
  CampBanner,
  DialogueOverlay,
  NpcIntro,
  PartyStrip,
  SagaPortrait,
  SceneCanvas,
} from "./scenes";
import { WalkTown } from "./town";
import { settlementFor, type Settlement } from "./settlement";

type PanelId = FieldFacilityId | "camp" | "army" | "status" | "dex" | "notice" | "archive" | "site" | "cave" | "strategy" | null;

/** 公告已读标记：按「最新一条公告 id」记在本机。 */
const NOTICE_SEEN_KEY = "trial-saga-notice-seen";
const NOTICE_SEEN_EVENT = "trial-saga-notice-seen-change";

/** 本机还没读过最新一条公告。 */
function noticeUnreadSnapshot(): boolean {
  try {
    const latest = latestNoticeId();
    if (!latest) return false;
    return window.localStorage.getItem(NOTICE_SEEN_KEY) !== latest;
  } catch {
    return false;
  }
}

function subscribeNoticeSeen(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(NOTICE_SEEN_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(NOTICE_SEEN_EVENT, onChange);
  };
}

/** 打开公告即记已读；存不了本机也照常看公告。 */
function markNoticeSeen(): void {
  try {
    const latest = latestNoticeId();
    if (latest) window.localStorage.setItem(NOTICE_SEEN_KEY, latest);
  } catch {
    // 隐私模式下 localStorage 会抛，忽略即可。
  }
  window.dispatchEvent(new Event(NOTICE_SEEN_EVENT));
}
type BattleAction = "attack" | "guard" | "tactic" | "item" | "formation";

interface BattlePick {
  a: BattleAction;
  t?: TacticId;
  i?: string;
  f?: FormationId;
  target?: number;
}

interface BattleSession {
  battle: SagaBattleState;
  scratch: SagaReplayState;
  rounds: SagaRoundCommand[][];
  picks: Record<string, BattlePick>;
  /** 打的是地图上哪座营；野外遭遇为 -1。 */
  node: number;
  /** 野外随机遇敌：结束后按 skirmish 上传，不占营地进度。 */
  encounter: boolean;
}

export interface TrialGameProps {
  initialRun: ActiveTrialRun | null;
  save: TrialSave;
  initialTickets: number;
  /** 服务端是否已经有存档（含未收兵的行军）：入口封面据此决定「继续游戏」能不能点。 */
  hasSave: boolean;
  /** 当前活动券视图：城中的活动券礼包入口直接复用，也用来随余额刷新。 */
  coupon: ActivityCouponView;
  /** 钱庄汇率：没有进行中的行军时按后台当前配置展示。 */
  bank: Pick<SagaBankPolicy, "goldPerTcr" | "maxGoldPerRun">;
  nodeCount: number;
  maxReward: number;
  rewardValidDays: number;
}

const HUD_CELL = "flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs";
// 手机竖屏时画布只有约 200px 高，弹层改钉在视口上才够放内容；sm 起回到画布内。
// 层级顺序：面板 50/30 > 开场卡 40/20；结算卡 60/40 压在最上面，对话浮层固定 z-50。
const PANEL_CLASS = "fixed inset-x-3 bottom-3 top-14 z-50 flex flex-col overflow-hidden rounded-xl border border-border bg-card/97 shadow-2xl backdrop-blur sm:absolute sm:inset-x-6 sm:z-30";
const PANEL_BODY = "min-h-0 flex-1 overflow-y-auto p-3 sm:p-4";

function generalName(id: string): string {
  return SAGA_GENERAL_BY_ID.get(id)?.name ?? id;
}

function itemName(id: string): string {
  return SAGA_ITEM_BY_ID.get(id)?.name ?? id;
}

function loadStoredCommands(runId: string, seed: number): SagaCommand[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(`trial-saga:${runId}:${seed}`);
    if (!raw) return [];
    return sanitizeSagaCommands(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** 刷新页面时优先用服务端自动存档，本机较长的进度（还没赶上自动存档）优先。 */
function initialCommands(run: ActiveTrialRun): SagaCommand[] {
  const local = loadStoredCommands(run.runId, run.run.seed);
  const server = sanitizeSagaCommands(run.run.commands ?? []);
  return local.length > server.length ? local : server;
}

function defaultPicks(battle: SagaBattleState): Record<string, BattlePick> {
  const target = Math.max(0, battle.enemies.findIndex((enemy) => !enemy.downed));
  const picks: Record<string, BattlePick> = {};
  for (const general of battle.party) {
    if (general.downed) continue;
    picks[general.id] = { a: "attack", target };
  }
  return picks;
}

function availableItems(state: SagaReplayState): { id: string; name: string; count: number }[] {
  const ids = new Set([
    ...Object.keys(state.inventory.bonus),
    ...Object.keys(state.save.bag),
    ...state.save.party.flatMap((general) => Object.keys(general.items ?? {})),
  ]);
  const list: { id: string; name: string; count: number }[] = [];
  for (const id of ids) {
    const def = SAGA_ITEM_BY_ID.get(id);
    if (!def || (def.kind !== "consumable" && def.kind !== "supply")) continue;
    const carried = state.save.party.reduce((sum, general) => sum + (general.items?.[id] ?? 0), 0);
    const count = (state.inventory.bonus[id] ?? 0) + (state.save.bag[id] ?? 0) + carried;
    if (count > 0) list.push({ id, name: def.name, count });
  }
  return list;
}

/** 战斗事件按动画节拍逐条配音：画面上谁动，耳朵里就响什么。 */
function playBattleSfx(events: SagaBattleEvent[], stepMs: number): void {
  events.forEach((event, index) => {
    window.setTimeout(() => {
      switch (event.kind) {
        case "attack":
          gameAudio.play("hit");
          break;
        case "tactic":
        case "buff":
          gameAudio.play("cast");
          break;
        case "heal":
          gameAudio.play("heal");
          break;
        case "guard":
          gameAudio.play("guard");
          break;
        case "down":
          gameAudio.play("down");
          break;
        case "recruit":
          gameAudio.play("capture");
          break;
        case "miss":
        case "confuse":
          gameAudio.play("miss");
          break;
        case "level":
          gameAudio.play("coin");
          break;
        default:
          break;
      }
    }, index * stepMs);
  });
}

export function TrialGame(props: TrialGameProps) {
  const router = useRouter();
  const [runId, setRunId] = useState<string | null>(props.initialRun?.runId ?? null);
  const [run, setRun] = useState<SagaRun | null>(props.initialRun?.run ?? null);
  const [commands, setCommands] = useState<SagaCommand[]>(() =>
    props.initialRun ? initialCommands(props.initialRun) : [],
  );
  const [tickets, setTickets] = useState(props.initialTickets);
  /** revalidate 后 props 带服务端最新余额（比如刚买完活动券），渲染期对齐一次，不放进 effect。 */
  const [syncedTickets, setSyncedTickets] = useState(props.initialTickets);
  if (props.initialTickets !== syncedTickets) {
    setSyncedTickets(props.initialTickets);
    setTickets(props.initialTickets);
  }
  const [panel, setPanel] = useState<PanelId>(null);
  /** 武库分柜：兵器 / 甲胄 / 盔带 / 马市，各卖各的货。 */
  const [shopTab, setShopTab] = useState<"weapon" | "armor" | "gear" | "mount">("weapon");
  /** 强化时选定的武将：只让玩家强化此人身上的装备。 */
  const [forgeOwner, setForgeOwner] = useState<string | null>(null);
  const [depositGold, setDepositGold] = useState("");
  /** 钱庄换券：想换多少张活动券。 */
  const [exchangeTickets, setExchangeTickets] = useState("");
  const [hallTab, setHallTab] = useState<"party" | "gear" | "items" | "formation">("party");
  const [dexTab, setDexTab] = useState<"save" | "dex">("save");
  const [campNode, setCampNode] = useState<number | null>(null);
  const [battle, setBattle] = useState<BattleSession | null>(null);
  /** 敌情面板：战斗中查看敌将四维、装备、计策与特性。 */
  const [showEnemyInfo, setShowEnemyInfo] = useState(false);
  /** 部将面板：战斗中同时查看我军当前 SP、计策列表、装备与四维。 */
  const [showPartyInfo, setShowPartyInfo] = useState(false);
  const [anim, setAnim] = useState<BattleAnimation | null>(null);
  /** 战斗演出倍速：只改动画节拍与配音间隔，结算结果不受影响。 */
  const [battleSpeed, setBattleSpeed] = useState<1 | 2>(1);
  const [focusId, setFocusId] = useState<string | null>(null);
  /** 胜利后的归降提议面板：接受 / 婉拒逐条记录，随本场战斗指令一起落档。 */
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerDecisions, setOfferDecisions] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [settlement, setSettlement] = useState<TrialSettlement | null>(null);
  const [banner, setBanner] = useState<{
    kind: "won" | "lost";
    name: string;
    gold: number;
    exp: number;
    learned?: string[];
  } | null>(null);
  /** 公告红点：只读本机已读记录，服务端渲染时按已读处理。 */
  const noticeUnread = useSyncExternalStore(subscribeNoticeSeen, noticeUnreadSnapshot, () => false);
  /** 入口封面：进页面先停在封面，选「继续游戏 / 新的征途」再进关；结算完也回到这里。 */
  const [coverOpen, setCoverOpen] = useState(true);
  /** 档案商店：结算确认（问「是否结算所有金币为 tcr、结束游戏并清空存档」）。 */
  const [settleAsk, setSettleAsk] = useState(false);
  /** 本机刚结算过存档：服务端刷新回来之前先把「继续游戏」收起来，免得点到空档。 */
  const [saveCleared, setSaveCleared] = useState(false);
  /** 城中街道场景：进城后把大地图盖住，铺子从街景里进。 */
  const [inTown, setInTown] = useState(false);
  /** 其他州治与野外村庄：按地方与种子现生成聚落，铺面与乡人每次一致、各地不同。 */
  const [site, setSite] = useState<Settlement | null>(null);
  /** 聚落里点乡人说话：只在本机显示，不进剧情存档。 */
  const [siteLine, setSiteLine] = useState<string | null>(null);
  /** 山洞迷宫：按当前地图点位与种子生成，宝箱开启记录在重放状态里。 */
  const [caveName, setCaveName] = useState<string | null>(null);
  /** 打开版本公告：先把城景/战场让开，再记已读。 */
  const openNotice = () => {
    setInTown(false);
    setPanel("notice");
    markNoticeSeen();
  };
  /** 剧情对话浮层：开场、阵前、平定、乡野、酒馆与营帐议事都走这里。 */
  const [dialogue, setDialogue] = useState<SagaScene | null>(null);
  /** 纯前端见闻：走访过的乡野点位与看过的剧情，只存本机，不参与结算。 */
  const [visitedPois, setVisitedPois] = useState<string[]>([]);
  const [seenScenes, setSeenScenes] = useState<string[]>([]);
  /** 自动存档指示：saving 时 HUD 显示「存档中」，失败不挡玩法。 */
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  /** 存档失败后点重试会 +1，让自动存档 effect 用同一批指令再跑一次。 */
  const [saveRetry, setSaveRetry] = useState(0);
  /** 训练场里每个武将输入的目标等级。 */
  const [trainTargets, setTrainTargets] = useState<Record<string, string>>({});
  const saveSeq = useRef(0);

  const replay = useMemo(
    () => (run ? replaySagaRun(run, commands) : null),
    [run, commands],
  );
  const state = replay?.state ?? null;
  const save = state?.save ?? props.save;
  const storageKey = run && runId ? `trial-saga:${runId}:${run.seed}` : null;
  const townKey = run && runId ? `trial-saga-town:${runId}:${run.seed}` : null;

  const heroDef = SAGA_GENERAL_BY_ID.get(save.party[0]?.id ?? "liubei");
  const chapter = SAGA_CHAPTERS[Math.min(SAGA_CHAPTERS.length - 1, save.chapter)];
  const finished = save.stats.wins >= SAGA_CHAPTERS.length;
  /** 入口封面用：服务端有存档，或者这一局还没结算、本机也没刚清档。 */
  const saveExists = props.hasSave && !saveCleared;
  /** 档案商店的结算预览：整份存档金币按后台钱庄汇率折 tcr（与服务端同一口径）。 */
  const archiveTcrPreview = Math.floor(
    Math.max(0, Math.trunc(save.gold || 0)) / Math.max(1, props.bank.goldPerTcr),
  );
  /** 进行中的行军用出城时冻结的汇率；没出城时按后台当前配置预览。 */
  const bank: SagaBankPolicy = useMemo(
    () => run?.bank ?? { ...props.bank, goldPerTcrBuy: 0 },
    [run, props.bank],
  );
  const bankedGold = state?.bankedGold ?? 0;
  const bankTcr = bankCreditsForGold(bankedGold, bank);
  const bankRoom = Math.max(0, bank.maxGoldPerRun - bankedGold);
  const depositGoldValue = Math.trunc(Number(depositGold) || 0);
  const depositTcr = Math.floor(depositGoldValue / bank.goldPerTcr);
  const depositGoldAmount = depositTcr * bank.goldPerTcr;
  /** 金币换券汇率与「tcr 换券」一致：1 张券 = couponUnitCredits 金。 */
  const goldPerTicket = props.coupon.unitCredits;
  const exchangeCount = Math.trunc(Number(exchangeTickets) || 0);
  const exchangeCost = couponGoldCost(exchangeCount, goldPerTicket);
  const exchangeMax = couponsForGold(save.gold, goldPerTicket);
  const exchangedTickets = (run?.purchases ?? []).reduce(
    (sum, purchase) => (purchase.itemId === SAGA_COUPON_ITEM_ID ? sum + (purchase.coupons ?? 0) : sum),
    0,
  );
  /** 铁匠铺可强化的装备：当前选中的武将身上的 + 库存，按 ID 去重。 */
  const forgeGearIds = useMemo(() => {
    const ids = new Set(Object.keys(save.gear));
    const members = forgeOwner
      ? [...save.party, ...save.reserve].filter((member) => member.id === forgeOwner)
      : [...save.party, ...save.reserve];
    for (const member of members) {
      for (const slot of ["weapon", "armor", "helmet", "belt", "pendant", "boots", "mount"] as GearSlot[]) {
        const id = member[slot];
        if (id) ids.add(id);
      }
    }
    return [...ids].filter((id) => Boolean(gearSlotOf(SAGA_ITEM_BY_ID.get(id))));
  }, [forgeOwner, save]);

  /** 武库分柜的现货：不同章节的城只卖当年到货的兵器、甲胄、盔带与坐骑。 */
  const shopItems = useMemo(() => {
    if (panel === "forge") {
      if (shopTab === "weapon") return shopStock("weapon", save.chapter);
      const kinds =
        shopTab === "armor"
          ? ["armor" as const]
          : shopTab === "mount"
            ? ["mount" as const]
            : (["helmet", "belt", "pendant", "boots"] as const);
      return SAGA_ITEMS.filter(
        (item) => kinds.some((kind) => kind === item.kind) && (item.chapter ?? 0) <= save.chapter,
      );
    }
    if (panel === "herb") {
      return SAGA_ITEMS.filter(
        (item) => item.kind === "consumable" && (item.chapter ?? 0) <= save.chapter,
      );
    }
    return [];
  }, [panel, save.chapter, shopTab]);

  /** 界面上的属性 / 兵力一律按当前对局的规则档算：图鉴、编队、出战面板与战场不能各说各话。 */
  const uiRules = state?.rules ?? run?.rules ?? SAGA_RULESET;
  const uiMaxLevel = sagaMaxLevel(uiRules);

  /** 上阵武将当前兵力：没出城时就是满编；行军中的残兵来自重放状态。 */
  const troopRows = save.party.map((general) => {
    const stats = generalStats(general, save.gearLevels, uiRules);
    const max = Math.max(1, Math.round(stats.maxTroops * (1 + (state?.buffs.troopPct ?? 0) / 100)));
    const current = Math.min(max, state?.partyTroops[general.id] ?? max);
    return { id: general.id, name: generalName(general.id), current, max };
  });
  const innNeedsRest = troopRows.some((row) => row.current < row.max);
  const innSave = state?.save ?? save;
  const innDay = trialDayKey();
  const innFreeUsed = innSave.innFreeDate === innDay ? (innSave.innFreeUsed ?? 0) : 0;
  const innFreeLeft = Math.max(0, SAGA_FREE_INN_PER_DAY - innFreeUsed);
  const innIsFree = freeInnAvailable(innSave);
  const innPrice = innIsFree ? 0 : SAGA_INN_PRICE_TICKETS;
  const innTicketBlocked = (): string | null =>
    innPrice > 0 && tickets < innPrice ? `活动券不足（${innPrice} 张）` : null;
  /** 客栈按钮的唯一禁用口径：场景 / 兵力 / 活动券分开提示；兵败后允许住店重整。 */
  const innBlocked =
    !run || !state
      ? "行军途中才能住店"
      : state.scene === "won"
        ? "此地已平定，无需住店"
        : state.scene === "battle"
          ? "战斗尚未结束"
          : state.scene === "lost"
            ? innTicketBlocked()
            : !innNeedsRest
              ? "兵力已满"
              : innTicketBlocked();
  const innLabel =
    innBlocked ??
    (state?.scene === "lost"
      ? innIsFree
        ? `全军败退 · 今日免费住宿（余 ${innFreeLeft} 次）`
        : `全军败退 · 住店重整（${SAGA_INN_PRICE_TICKETS} 张券）`
      : innIsFree
        ? `住店（今日免费，余 ${innFreeLeft} 次）`
        : `住店（${SAGA_INN_PRICE_TICKETS} 张券）`);

  // 已平定的区：破掉本区本阵就算，关卡随之开闸、渡口照常摆渡。
  const pacifiedChapters = useMemo(() => {
    if (!run || !state) return [];
    const out: number[] = [];
    run.nodes.forEach((node, index) => {
      if (node.kind === "boss" && state.clearedNodes.includes(index) && !out.includes(node.chapter)) {
        out.push(node.chapter);
      }
    });
    return out;
  }, [run, state]);
  const pacifiedKey = pacifiedChapters.join(",");

  // 大地图按「章节 + 节点数 + 种子」纯函数复现：没开局时也画一张同一个地方的图当作预告。
  const field: SagaField = useMemo(
    () =>
      run
        ? sagaFieldFor(run, pacifiedChapters)
        : generateSagaField({
            chapter: props.save.chapter,
            nodeCount: props.nodeCount,
            seed: (props.save.chapter + 1) * 7919,
          }),
    // pacifiedKey 并入依赖：开闸会让地形换一次，但同一份缓存的图对象不变，走位不会被打回城门。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [run, props.save.chapter, props.nodeCount, pacifiedKey],
  );
  const clearedNodes = useMemo(() => state?.clearedNodes ?? [], [state]);
  const openNodeList = useMemo(
    () => (run && state ? openNodes(run, state) : []),
    [run, state],
  );
  useEffect(() => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(commands));
    } catch {
      // 存储满了就放弃持久化，不影响这次行军继续。
    }
  }, [storageKey, commands]);

  // 走访与剧情的本机记录：换一趟行军就重读，没记录就当作全新的。
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!townKey) {
        setVisitedPois([]);
        setSeenScenes([]);
        return;
      }
      try {
        const raw = window.localStorage.getItem(townKey);
        const data = raw ? (JSON.parse(raw) as { pois?: unknown; scenes?: unknown }) : null;
        setVisitedPois(Array.isArray(data?.pois) ? (data.pois as string[]) : []);
        setSeenScenes(Array.isArray(data?.scenes) ? (data.scenes as string[]) : []);
      } catch {
        setVisitedPois([]);
        setSeenScenes([]);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [townKey]);

  const townSaveReady = useRef<string | null>(null);
  useEffect(() => {
    if (!townKey) return;
    // 读完存档后的第一轮不要用空状态覆盖本机记录。
    if (townSaveReady.current !== townKey) {
      townSaveReady.current = townKey;
      return;
    }
    try {
      window.localStorage.setItem(townKey, JSON.stringify({ pois: visitedPois, scenes: seenScenes }));
    } catch {
      // 存不下就算了，顶多下次要重新走一遍乡野。
    }
  }, [townKey, visitedPois, seenScenes]);

  const gearById = useMemo(() => {
    const rows: Record<string, { weapon: string | null; armor: string | null }> = {};
    for (const member of [...save.party, ...save.reserve]) {
      rows[member.id] = { weapon: member.weapon, armor: member.armor };
    }
    return rows;
  }, [save.party, save.reserve]);

  /** 平定之后不再手动收兵：服务端重放到「此地尽拔」就在自动存档那一步结算。 */
  const finishRun = useCallback(
    (result: TrialSettlement) => {
      setSettlement(result);
      setBattle(null);
      setPanel(null);
      setInTown(false);
      setDialogue(null);
      setVisitedPois([]);
      setSeenScenes([]);
      if (storageKey) window.localStorage.removeItem(storageKey);
      if (townKey) window.localStorage.removeItem(townKey);
      setRunId(null);
    },
    [storageKey, townKey],
  );

  /** 每推进一步就把整段指令回传服务端；这是唯一的进度来源，刷新或撤退都不会丢。 */
  useEffect(() => {
    if (!runId || !run || settlement) return;
    const seq = ++saveSeq.current;
    const timer = window.setTimeout(() => {
      setSaveState("saving");
      void (async () => {
        const result = await autoSaveTrialAction({ runId, commands });
        if (seq !== saveSeq.current) return;
        if (!result.success) {
          // 存档失败不能装作没事：进度只在服务端，这里标红并让玩家点重试。
          setSaveState("error");
          return;
        }
        // 乐观锁冲突时服务端会把已落库的指令回传；清洗后比本地长就对齐过去，
        // 不然下一次存档可能拿短的一截把别处已经写进去的进度盖掉。
        // 先清洗再比长度：旧版页面的清洗规则与服务器不一致时也不会来回覆盖。
        if (!result.data.settled) {
          const serverCommands = sanitizeSagaCommands(result.data.commands);
          if (serverCommands.length > commands.length) {
            setCommands(serverCommands);
            return;
          }
        }
        setSaveState("saved");
        if (result.data.settled) {
          if (result.data.settlement) finishRun(result.data.settlement);
          else router.refresh();
        }
      })();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [commands, finishRun, router, run, runId, saveRetry, settlement]);

  const appendCommand = useCallback((command: SagaCommand) => {
    setCommands((prev) => [...prev, command]);
  }, []);

  const startRun = useCallback(async () => {
    setBusy("start");
    try {
      const result = await startTrialAction();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      const data = result.data;
      setRunId(data.runId);
      setRun(data.run);
      // 服务端可能直接复用还没收兵的那次行军，本地缓存里也可能有更长的进度；
      // 一律从两者中取更长的一份，不能拿空数组把服务端的进度盖掉。
      setCommands(initialCommands(data));
      setSettlement(null);
      setPanel(null);
      setCampNode(null);
      setInTown(false);
      setVisitedPois([]);
      setSeenScenes([]);
      setDialogue(chapterIntroScene(data.run.startSave.chapter));
      setCoverOpen(false);
      gameAudio.play("encounter");
      toast.success(`前往 ${SAGA_CHAPTERS[Math.min(SAGA_CHAPTERS.length - 1, data.run.startSave.chapter)].town}`);
    } finally {
      setBusy(null);
    }
  }, []);

  /** 档案商店「结算并结束」：金币折 tcr 发到钱包、服务端清空存档，本机缓存一并清掉。 */
  const settleArchive = useCallback(async () => {
    if (busy) return;
    setBusy("settle");
    try {
      const result = await settleTrialArchiveAction(
        runId ? { runId, commands } : undefined,
      );
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (run && runId) {
        try {
          window.localStorage.removeItem(`trial-saga:${runId}:${run.seed}`);
          window.localStorage.removeItem(`trial-saga-town:${runId}:${run.seed}`);
        } catch {
          // 隐私模式下 localStorage 会抛，忽略即可。
        }
      }
      setRun(null);
      setRunId(null);
      setCommands([]);
      setSettlement(null);
      setBanner(null);
      setDialogue(null);
      setPanel(null);
      setInTown(false);
      setCampNode(null);
      setVisitedPois([]);
      setSeenScenes([]);
      setSettleAsk(false);
      setSaveCleared(true);
      setCoverOpen(true);
      toast.success(
        result.data.tcr > 0
          ? `已结算 ${formatCredits(result.data.gold)} 金 → ${result.data.tcr} tcr，存档已清空`
          : "存档已清空",
      );
      router.refresh();
    } finally {
      setBusy(null);
    }
  }, [busy, commands, run, runId, router]);

  /** 城内所有买卖都走活动券：装备、伤药、军需和客栈共用这一个入口。 */
  const buyItem = useCallback(
    async (itemId: string, successText?: string, sfx: "coin" | "heal" = "coin") => {
      if (!runId || !run || busy) return;
      const priceTickets =
        itemId === SAGA_INN_ITEM_ID
          ? innIsFree
            ? 0
            : SAGA_INN_PRICE_TICKETS
          : SAGA_ITEM_BY_ID.get(itemId)?.priceTickets ?? 0;
      if (itemId !== SAGA_INN_ITEM_ID && priceTickets < 1) return;
      if (SAGA_ITEM_BY_ID.get(itemId)?.kind === "consumable" && !canCarryItem(save, itemId)) {
        toast.error(`每名武将最多带 ${SAGA_CARRY_LIMIT} 种道具，先到物品栏舍弃一件再买`);
        return;
      }
      if (tickets < priceTickets) {
        toast.error(`活动券不足（要 ${priceTickets} 张）`);
        return;
      }
      setBusy(`buy:${itemId}`);
      try {
        const purchaseId = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
        const result = await buyTrialItemAction({
          runId,
          itemId,
          purchaseId,
          cmdIndex: commands.length,
        });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        setRun((prev) => (prev ? { ...prev, purchases: result.data.purchases } : prev));
        setTickets(result.data.tickets);
        gameAudio.play(sfx);
        toast.success(successText ?? `${itemName(itemId)}已备好`);
      } finally {
        setBusy(null);
      }
    },
    [busy, commands.length, innIsFree, run, runId, save, tickets],
  );

  /** 训练场：目标等级由玩家填，价格按「当前等级 → 目标等级」算，服务端重放后核对。 */
  const trainTo = useCallback(
    async (generalId: string, currentLevel: number) => {
      if (!runId || !run || busy) return;
      const cap = trainingLevelCap(save, uiRules);
      const target = Math.trunc(Number(trainTargets[generalId] ?? currentLevel + 1) || 0);
      if (target <= currentLevel) {
        toast.error("目标等级要高于当前等级");
        return;
      }
      if (target > cap) {
        toast.error(`训练场上限为 ${cap} 级，先平定更多地方`);
        return;
      }
      const cost = trainingCost(currentLevel, target);
      if (tickets < cost) {
        toast.error(`活动券不足（要 ${cost} 张）`);
        return;
      }
      setBusy(`train:${generalId}`);
      try {
        const purchaseId = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
        const result = await buyTrialItemAction({
          runId,
          itemId: SAGA_TRAINING_ITEM_ID,
          purchaseId,
          cmdIndex: commands.length,
          generalId,
          targetLevel: target,
          commands,
        });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        setRun((prev) => (prev ? { ...prev, purchases: result.data.purchases } : prev));
        setTickets(result.data.tickets);
        setTrainTargets((prev) => {
          const next = { ...prev };
          delete next[generalId];
          return next;
        });
        gameAudio.play("coin");
        toast.success(`${generalName(generalId)} 练到 ${target} 级，花了 ${cost} 张券`);
      } finally {
        setBusy(null);
      }
    },
    [busy, commands, run, runId, save, tickets, trainTargets, uiRules],
  );

  /** 铁匠铺强化：一次一级，价格随等级递增；服务端重放核对当前等级后再扣券。 */
  const forgeGear = useCallback(
    async (gearId: string) => {
      if (!runId || !run || busy) return;
      const level = gearLevel(save, gearId);
      if (level >= SAGA_FORGE_MAX_LEVEL) {
        toast.error(`${itemName(gearId)} 已强化到顶`);
        return;
      }
      const cost = forgeCost(gearId, level);
      if (cost <= 0) return;
      if (tickets < cost) {
        toast.error(`活动券不足（要 ${cost} 张）`);
        return;
      }
      setBusy(`forge:${gearId}`);
      try {
        const purchaseId = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
        const result = await upgradeTrialGearAction({
          runId,
          gearId,
          purchaseId,
          cmdIndex: commands.length,
          commands,
        });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        setRun((prev) => (prev ? { ...prev, purchases: result.data.purchases } : prev));
        setTickets(result.data.tickets);
        gameAudio.play("coin");
        toast.success(`${itemName(gearId)} 强化到 +${result.data.level}，花了 ${cost} 张券`);
      } finally {
        setBusy(null);
      }
    },
    [busy, commands, run, runId, save, tickets],
  );

  const bankGold = useCallback(
    (gold: number) => {
      if (!run) return;
      if (gold > bankRoom) {
        toast.error(`每次行军最多存 ${bank.maxGoldPerRun} 金`);
        return;
      }
      if (save.gold < gold) {
        toast.error("金币不够，再打几仗吧");
        return;
      }
      appendCommand({ k: "bank", g: gold });
      gameAudio.play("coin");
      toast.success(`已存 ${gold} 金，平定此地时到账 ${bankCreditsForGold(gold, bank)} tcr`);
    },
    [appendCommand, bank, bankRoom, run, save.gold],
  );

  /** 钱庄换券：金币按券面单价折成活动券，服务端即时入账，本趟行军马上能用。 */
  const exchangeCoupons = useCallback(
    async (count: number) => {
      if (!runId || !run || busy) return;
      if (count < 1) {
        toast.error("至少换 1 张");
        return;
      }
      if (!(goldPerTicket > 0)) {
        toast.error("钱庄未开放金币换券");
        return;
      }
      const cost = couponGoldCost(count, goldPerTicket);
      if (save.gold < cost) {
        toast.error(`金币不足（要 ${cost} 金）`);
        return;
      }
      setBusy("bank:coupon");
      try {
        const purchaseId = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
        const result = await buyTrialCouponsAction({
          runId,
          tickets: count,
          purchaseId,
          cmdIndex: commands.length,
          commands,
        });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        setRun((prev) => (prev ? { ...prev, purchases: result.data.purchases } : prev));
        setTickets(result.data.tickets);
        setExchangeTickets("");
        gameAudio.play("coin");
        toast.success(`换到 ${count} 张活动券，花了 ${cost} 金`);
      } finally {
        setBusy(null);
      }
    },
    [busy, commands, goldPerTicket, run, runId, save.gold],
  );

  // ---- 大地图行走与画布 ----
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** 回合动画的收尾定时器：开新回合或卸载时清掉，避免迟到的结算覆盖新回合。 */
  const animTimerRef = useRef<number | null>(null);
  /** 逻辑 960x540 → 实际位图的放大倍率，让画面在大屏和高分屏上都锐利。 */
  const viewScaleRef = useRef(1);
  /** 逻辑视野：宽恒 960，高跟着画布实际比例走。 */
  const viewRef = useRef<SagaView>(DEFAULT_VIEW);
  const playerRef = useRef({
    x: 0,
    y: 0,
    facing: "down" as FieldFacing,
    moving: false,
    walkTo: null as { x: number; y: number } | null,
    stuck: 0,
  });
  const arriveRef = useRef<(() => void) | null>(null);
  const keysRef = useRef({ up: false, down: false, left: false, right: false });
  const modeRef = useRef<{ battle: BattleSession | null; anim: BattleAnimation | null }>({ battle: null, anim: null });
  const fieldRef = useRef<SagaField | null>(null);
  const hotspotRef = useRef<FieldHotspot | null>(null);
  const interactRef = useRef<(hotspot: FieldHotspot) => void>(() => undefined);
  const settlementRef = useRef(false);
  const focusIdRef = useRef<string | null>(null);
  /** 行军中野外遇敌的触发入口；不在行军途中时为空。 */
  const encounterTriggerRef = useRef<(() => void) | null>(null);
  /** 触发后先锁住走位，等战斗面板真正挂上再松开。 */
  const encounterLockRef = useRef(false);
  const walkTileRef = useRef<string | null>(null);
  const inTownRef = useRef(false);
  const dialogueRef = useRef(false);
  const heroColorRef = useRef({ color: "#3f6212", accent: "#bef264" });
  const hudRef = useRef({
    active: false,
    chapterIndex: 0,
    chapterName: "",
    townName: "",
    gold: 0,
    power: 0,
    cleared: [] as number[],
    open: [] as number[],
    nodeNames: [] as string[],
  });

  useEffect(() => {
    modeRef.current = { battle, anim };
    if (battle) encounterLockRef.current = false;
  }, [battle, anim]);

  useEffect(() => {
    settlementRef.current = Boolean(settlement);
  }, [settlement]);

  useEffect(() => {
    inTownRef.current = inTown;
    if (!inTown) return;
    // 进城的瞬间把走位松开，免得回到大地图后角色自己往前冲。
    playerRef.current.walkTo = null;
    arriveRef.current = null;
    keysRef.current = { up: false, down: false, left: false, right: false };
  }, [inTown]);

  useEffect(() => {
    dialogueRef.current = Boolean(dialogue);
  }, [dialogue]);

  // 换地方或开局：把主角放回城门外，走过的路不做记录（进度只看指令）。
  // 关卡开闸时地形会换一份新图，但那不是「换地方」，走位不能被打回城门。
  const fieldIdentity = `${run?.seed ?? -1}:${run?.startSave.chapter ?? props.save.chapter}`;
  const fieldIdentityRef = useRef("");
  useEffect(() => {
    fieldRef.current = field;
    if (fieldIdentityRef.current === fieldIdentity) return;
    fieldIdentityRef.current = fieldIdentity;
    const player = playerRef.current;
    player.x = field.spawn.x;
    player.y = field.spawn.y;
    player.walkTo = null;
    player.stuck = 0;
    arriveRef.current = null;
    hotspotRef.current = null;
    encounterLockRef.current = false;
    walkTileRef.current = null;
  }, [field, fieldIdentity]);

  useEffect(() => {
    interactRef.current = (hotspot) => {
      if (settlementRef.current) return;
      if (hotspot.kind === "ferry" && hotspot.ferry) {
        const ferry = hotspot.ferry;
        const canForward = pacifiedChapters.includes(ferry.from);
        const canBack = pacifiedChapters.includes(ferry.to);
        if (!canForward && !canBack) {
          toast.error("前一区还没平定，关卡与渡口都不放行");
          return;
        }
        if ((state?.save.gold ?? 0) < ferry.tickets) {
          toast.error(`船票要 ${ferry.tickets} 金，金子不够`);
          return;
        }
        const name = SAGA_CHAPTERS[ferry.to]?.name ?? "对岸";
        if (!window.confirm(`乘船去第 ${ferry.to + 1} 区·${name}？船票 ${ferry.tickets} 金。`)) return;
        appendCommand({ k: "ferry", to: ferry.to });
        const player = playerRef.current;
        player.x = ferry.toX;
        player.y = ferry.toY;
        player.walkTo = null;
        player.stuck = 0;
        return;
      }
      if (hotspot.kind === "gate" && hotspot.gate) {
        toast.error(
          hotspot.gate.open
            ? "关卡已开，直接走过去即可"
            : "关卡闭着：先破本区本阵，闸门才会双向通行",
        );
        return;
      }
      if (hotspot.kind === "city") {
        const cityChapter = hotspot.city?.chapter ?? chapter.index;
        const name =
          hotspot.city?.name ?? SAGA_CHAPTERS[cityChapter]?.town ?? `第 ${cityChapter + 1} 区州治`;
        const key = `city:${cityChapter}:${name}`;
        const chapterWon = clearedNodes.some(
          (index) => run?.nodes[index]?.chapter === cityChapter,
        );
        const unlocked =
          cityChapter === chapter.index || chapterWon || visitedPois.includes(key);
        if (!unlocked) {
          toast.error(`${name}尚未平定：先在这一区打赢一场，才能进城`);
          return;
        }
        setVisitedPois((prev) => (prev.includes(key) ? prev : [...prev, key]));
        // 本区州治才走完整街景；别的州治与属县走生成的聚落，铺面与乡人各不相同。
        if (cityChapter === chapter.index) {
          setInTown(true);
          return;
        }
        setSite(
          settlementFor({
            kind: "town",
            name,
            chapter: cityChapter,
            seed: run?.seed ?? 0,
          }),
        );
        setSiteLine(null);
        setInTown(false);
        setPanel("site");
        return;
      }
      if (hotspot.kind === "poi" && hotspot.poi) {
        const poi = hotspot.poi;
        const key = `${poi.kind}:${poi.name}`;
        const chapterWon = clearedNodes.some(
          (index) => run?.nodes[index]?.chapter === (run?.startSave.chapter ?? props.save.chapter),
        );
        if (!chapterWon && !visitedPois.includes(key)) {
          toast.error(`${poi.name}村口还有乱兵：先打赢一场，才能进村`);
          return;
        }
        setVisitedPois((prev) => (prev.includes(key) ? prev : [...prev, key]));
        // 山洞另开一层迷宫实景：宝箱里的装备 / 药品进存档，开过的箱子不能反复刷。
        if (poi.kind === "cave") {
          setCaveName(poi.name);
          setPanel("cave");
          return;
        }
        // 野外村庄能推门进去：宿店、药棚与乡人按村子现生成；祠堂与渡口仍是问路对话。
        if (poi.kind === "village") {
          setSite(
            settlementFor({
              kind: "village",
              name: poi.name,
              chapter: run?.startSave.chapter ?? props.save.chapter,
              seed: run?.seed ?? 0,
            }),
          );
          setSiteLine(null);
          setInTown(false);
          setPanel("site");
          return;
        }
        setDialogue(poiScene(run?.startSave.chapter ?? props.save.chapter, poi));
        return;
      }
      if (hotspot.camp) {
        setCampNode(hotspot.camp.node);
        setPanel("camp");
      }
    };
  }, [appendCommand, chapter.index, clearedNodes, pacifiedChapters, props.save.chapter, run, state, visitedPois]);

  /** 同一趟行军里，每个营的阵前喊话只自动播一次；之后可从营前画面重看。 */
  const markSceneSeen = useCallback((key: string): boolean => {
    if (seenScenes.includes(key)) return false;
    setSeenScenes((prev) => (prev.includes(key) ? prev : [...prev, key]));
    return true;
  }, [seenScenes]);

  /** 画面外的「谈话」：优先与身边的乡人 / 敌将对阵前喊话，荒野里就说一段本地风闻。 */
  const fieldTalk = useCallback(() => {
    const chapterIndex = run?.startSave.chapter ?? props.save.chapter;
    const hotspot = hotspotRef.current;
    if (hotspot?.kind === "poi" && hotspot.poi) {
      setDialogue(poiScene(chapterIndex, hotspot.poi));
      return;
    }
    if (hotspot?.camp && run) {
      const node = run.nodes[hotspot.camp.node];
      if (node) {
        setDialogue(campScene(chapterIndex, node, node.enemies[0]?.id));
        return;
      }
    }
    const chapter = SAGA_CHAPTERS[Math.min(SAGA_CHAPTERS.length - 1, chapterIndex)];
    setDialogue({
      id: `field-talk-${chapterIndex}`,
      title: `${chapter?.name ?? "此地"}风闻`,
      backdrop: "field",
      lines: [
        { side: "narrator", speaker: "旁白", text: chapter?.blurb ?? "风穿过旷野，远处有零星的号角声。" },
        { side: "narrator", speaker: "旁白", text: "路边百姓说，附近还有没拔掉的营寨，走远了容易撞上乱兵。" },
      ],
    });
  }, [props.save.chapter, run]);

  /** 画面外的「调查」：在脚下这块地找隐藏物品；同一格只能翻一次。 */
  const investigateField = useCallback(() => {
    if (!run || !state || state.scene !== "field") {
      toast.error("此刻无法调查");
      return;
    }
    const fieldNow = fieldRef.current;
    if (!fieldNow) {
      toast.error("此刻无法调查");
      return;
    }
    const player = playerRef.current;
    const tx = Math.floor(player.x / fieldNow.tile);
    const ty = Math.floor(player.y / fieldNow.tile);
    const chestId = `dig:${run.seed}:${tx}:${ty}`;
    if (state.lootedChests.includes(chestId)) {
      toast.error("这一处已经翻过了");
      return;
    }
    const chapterIndex = run.startSave.chapter;
    const pool = chapterIndex >= 4 ? ["dahuan", "jinchuang", "lingzhi"] : ["herb", "medicine", "jinchuang"];
    const hash = (tx * 31 + ty * 17 + run.seed + chapterIndex * 7) >>> 0;
    if (hash % 9 !== 0) {
      toast("这里只有碎石与野草，没有藏东西");
      return;
    }
    const itemId = pool[hash % pool.length];
    const item = SAGA_ITEM_BY_ID.get(itemId);
    appendCommand({ k: "loot", chest: chestId, item: itemId, qty: 1 });
    toast.success(`在石缝里找到 ${item?.name ?? "一件旧物"}`);
  }, [appendCommand, run, state]);

  useEffect(() => {
    focusIdRef.current = focusId;
  }, [focusId]);

  useEffect(() => {
    heroColorRef.current = {
      color: heroDef?.color ?? "#3f6212",
      accent: heroDef?.accent ?? "#bef264",
    };
  }, [heroDef?.color, heroDef?.accent]);

  useEffect(() => {
    hudRef.current = {
      active: Boolean(run) && !settlement,
      chapterIndex: chapter.index,
      chapterName: chapter.name,
      townName: chapter.town,
      gold: save.gold,
      power: partyPower(save),
      cleared: clearedNodes,
      open: openNodeList,
      nodeNames: run
        ? run.nodes.map((node) => node.name)
        : field.camps.map((camp) => SAGA_CHAPTERS[chapter.index]?.stages[camp.node] ?? "敌营"),
    };
  }, [run, settlement, chapter.index, chapter.name, chapter.town, save, clearedNodes, openNodeList, field]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sync = () => {
      const cssWidth = canvas.clientWidth || VIEW_W;
      const dpr = window.devicePixelRatio || 1;
      const scale = Math.max(1, Math.min(2, dpr * (cssWidth / VIEW_W)));
      // 手机端画面只有半屏高太憋屈：窄屏把画幅拉高到约半屏，宽屏维持 16:9 不动。
      const wantedHeight =
        cssWidth < 640
          ? Math.min((cssWidth * 4) / 3, window.innerHeight * 0.5)
          : (cssWidth * 9) / 16;
      const view = makeSagaView((wantedHeight / cssWidth) * VIEW_W);
      const w = Math.round(view.w * scale);
      const h = Math.round(view.h * scale);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      // CSS 高度按视野比例给，逻辑像素与屏幕像素才是同一个比例，不会拉伸
      const cssHeight = `${Math.round((cssWidth * view.h) / view.w)}px`;
      if (canvas.style.height !== cssHeight) canvas.style.height = cssHeight;
      viewRef.current = view;
      viewScaleRef.current = scale;
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (animTimerRef.current !== null) window.clearTimeout(animTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const start = performance.now();
    let raf = 0;
    let last = start;

    // 逐轴推进：贴着一面墙也能滑过去，不会卡在山脚下。
    const step = (dx: number, dy: number): boolean => {
      const player = playerRef.current;
      const map = fieldRef.current;
      if (!map) return false;
      let moved = false;
      if (dx !== 0 && !fieldHitsSolid(map, player.x + dx, player.y)) {
        player.x += dx;
        moved = true;
      }
      if (dy !== 0 && !fieldHitsSolid(map, player.x, player.y + dy)) {
        player.y += dy;
        moved = true;
      }
      player.x = Math.max(6, Math.min(map.worldW - 6, player.x));
      player.y = Math.max(6, Math.min(map.worldH - 6, player.y));
      return moved;
    };

    const frame = (nowMs: number) => {
      const dt = Math.min(0.05, (nowMs - last) / 1000);
      last = nowMs;
      const player = playerRef.current;
      const map = fieldRef.current;
      const hud = hudRef.current;
      const inBattle = Boolean(modeRef.current.battle);
      const townOpen = inTownRef.current;
      let moving = false;
      if (map && !inBattle && !townOpen && !settlementRef.current && !encounterLockRef.current) {
        const keys = keysRef.current;
        let vx = 0;
        let vy = 0;
        if (keys.left) vx -= 1;
        if (keys.right) vx += 1;
        if (keys.up) vy -= 1;
        if (keys.down) vy += 1;
        if (vx === 0 && vy === 0 && player.walkTo) {
          const gx = player.walkTo.x - player.x;
          const gy = player.walkTo.y - player.y;
          if (Math.hypot(gx, gy) < 9) {
            player.walkTo = null;
            const arrive = arriveRef.current;
            arriveRef.current = null;
            arrive?.();
          } else {
            vx = gx;
            vy = gy;
          }
        } else if (vx !== 0 || vy !== 0) {
          player.walkTo = null;
          arriveRef.current = null;
        }
        if (vx !== 0 || vy !== 0) {
          const len = Math.hypot(vx, vy) || 1;
          const speed = 200 * fieldSpeedAt(map, player.x, player.y);
          moving = step((vx / len) * speed * dt, (vy / len) * speed * dt);
          player.facing =
            Math.abs(vx) >= Math.abs(vy) ? (vx > 0 ? "right" : "left") : vy > 0 ? "down" : "up";
          if (moving) {
            player.stuck = 0;
            // 每踏入一格判定一次野外遇敌：出城后官道、草地、海边与树林都有概率，只有城内与城门洞安全。
            const tileKey = `${Math.floor(player.x / map.tile)}:${Math.floor(player.y / map.tile)}`;
            if (walkTileRef.current !== tileKey) {
              walkTileRef.current = tileKey;
              const trigger = encounterTriggerRef.current;
              const chance = fieldEncounterChanceAt(map, player.x, player.y);
              if (trigger && chance > 0 && Math.random() < chance) {
                moving = false;
                trigger();
              }
            }
          } else {
            player.stuck += 1;
            if (player.stuck > 14) {
              player.walkTo = null;
              arriveRef.current = null;
              player.stuck = 0;
            }
          }
        }
      } else if (inBattle) {
        player.walkTo = null;
        arriveRef.current = null;
      }
      player.moving = moving;
      const spot =
        map && hud.active && !inBattle && !townOpen && !settlementRef.current
          ? fieldHotspotNear(map, player.x, player.y)
          : null;
      hotspotRef.current = spot;
      // 区域随人走：头顶显示站着的这一区，不因为破了本阵就把人当成已进了下一区。
      if (map?.regions?.length) {
        const tx = player.x / map.tile;
        const ty = player.y / map.tile;
        const region = map.regions.find(
          (item) => tx >= item.tx && tx < item.tx + item.w && ty >= item.ty && ty < item.ty + item.h,
        );
        if (region) {
          hudRef.current.chapterIndex = region.chapter;
          hudRef.current.chapterName = region.name;
          hudRef.current.townName = SAGA_CHAPTERS[region.chapter]?.town ?? region.name;
        }
      }

      const time = (nowMs - start) / 1000;
      ctx.setTransform(viewScaleRef.current, 0, 0, viewScaleRef.current, 0, 0);
      if (modeRef.current.battle) {
        const session = modeRef.current.battle;
        const focusTarget =
          (focusIdRef.current && session.picks[focusIdRef.current]?.target) ||
          session.picks[Object.keys(session.picks)[0] ?? ""]?.target ||
          0;
        paintBattle(ctx, {
          battle: session.battle,
          time,
          nowMs,
          target: focusTarget,
          animation: modeRef.current.anim,
          chapterIndex: hud.chapterIndex,
          view: viewRef.current,
        });
      } else if (map) {
        const label = spot
          ? spot.kind === "city"
            ? `${hud.townName}城门`
            : hud.nodeNames[spot.camp?.node ?? 0] ?? "敌营"
          : null;
        paintField(ctx, {
          field: map,
          time,
          x: player.x,
          y: player.y,
          facing: player.facing,
          moving,
          cleared: hud.cleared,
          open: hud.open,
          hotspot: spot,
          prompt: spot ? label : null,
          partyColor: heroColorRef.current.color,
          partyAccent: heroColorRef.current.accent,
          chapterIndex: hud.chapterIndex,
          chapterName: hud.chapterName,
          townName: hud.townName,
          gold: hud.gold,
          power: hud.power,
          view: viewRef.current,
        });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const setMoveKey = useCallback((key: string, pressed: boolean): boolean => {
    if (key === "arrowup" || key === "w") keysRef.current.up = pressed;
    else if (key === "arrowdown" || key === "s") keysRef.current.down = pressed;
    else if (key === "arrowleft" || key === "a") keysRef.current.left = pressed;
    else if (key === "arrowright" || key === "d") keysRef.current.right = pressed;
    else return false;
    return true;
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (settlement) return;
      // 对话浮层自己处理空格 / 回车 / Esc，这里别再抢键。
      if (dialogue) return;
      const key = event.key.toLowerCase();
      if (key === "escape") {
        if (panel) setPanel(null);
        else if (inTown) setInTown(false);
        return;
      }
      if (panel || battle || inTown) return;
      if (setMoveKey(key, true)) {
        event.preventDefault();
        return;
      }
      if (key === "e" || key === "enter") {
        const spot = hotspotRef.current;
        if (spot) {
          event.preventDefault();
          interactRef.current(spot);
        }
      }
    };
    const up = (event: KeyboardEvent) => {
      setMoveKey(event.key.toLowerCase(), false);
    };
    const reset = () => {
      keysRef.current.up = false;
      keysRef.current.down = false;
      keysRef.current.left = false;
      keysRef.current.right = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", reset);
    };
  }, [battle, busy, dialogue, inTown, panel, settlement, setMoveKey]);

  /** 走到一个点位再打开面板：地图上的点、下方按钮和点击画布都走这条路径。 */
  const walkTo = useCallback((x: number, y: number, onArrive?: () => void) => {
    const player = playerRef.current;
    if (Math.hypot(x - player.x, y - player.y) < 12) {
      onArrive?.();
      return;
    }
    player.walkTo = { x, y };
    player.stuck = 0;
    arriveRef.current = onArrive ?? null;
  }, []);

  const openCamp = useCallback(
    (node: number) => {
      setCampNode(node);
      setPanel("camp");
      if (!run) return;
      const target = run.nodes[node];
      if (!target) return;
      if (markSceneSeen(`camp:${node}`)) {
        setDialogue(campScene(run.startSave.chapter, target, target.enemies[0]?.id));
      }
    },
    [markSceneSeen, run],
  );

  /** 进城：大地图换成城中街景，铺子从街景点进去。 */
  const enterTown = useCallback((spot: FieldFacilityId | null = null) => {
    setInTown(true);
    setPanel(spot);
    setCampNode(null);
  }, []);

  /** 兵败面板直接回城住店，省得先找城中整备再点客栈。 */
  const goInn = useCallback(() => {
    enterTown("inn");
  }, [enterTown]);


  // ---- 战斗 ----
  const beginBattle = useCallback(
    (node: number) => {
      if (!run || !state) return;
      if (state.scene === "lost") {
        toast.error("全军败退，先回城住店重整再出兵");
        return;
      }
      if (!canEngageNode(run, state, node)) {
        toast.error("要先拔掉其余营地，才能直取主帅本阵");
        return;
      }
      const alive = save.party.filter((member) => (state.partyTroops[member.id] ?? 1) > 0).length;
      if (alive === 0) {
        toast.error("全队阵亡，先用招魂丹或回魂丹救人，再出兵");
        return;
      }
      const scratch = JSON.parse(JSON.stringify(state)) as SagaReplayState;
      const battleState = startBattle(run, node, scratch);
      const session: BattleSession = {
        battle: battleState,
        scratch,
        rounds: [],
        picks: defaultPicks(battleState),
        node,
        encounter: false,
      };
      setBattle(session);
      setFocusId(Object.keys(session.picks)[0] ?? null);
      setAnim(null);
      setBanner(null);
      setPanel(null);
      setShowEnemyInfo(false);
      gameAudio.play("encounter");
    },
    [run, save, state],
  );

  /**
   * 行走撞上的野外遭遇：编成由种子与「这是第几场」推出，服务端重放时按同一序号生成。
   * 遭遇不设场次上限与冷却；战后不用回营，直接接着走。
   */
  const beginEncounter = useCallback(() => {
    if (!run || !state) return;
    if (battle || settlement || panel) return;
    if (state.scene !== "field") return;
    const alive = save.party.filter((member) => (state.partyTroops[member.id] ?? 1) > 0).length;
    if (alive === 0) return;
    encounterLockRef.current = true;
    playerRef.current.walkTo = null;
    arriveRef.current = null;
    const scratch = JSON.parse(JSON.stringify(state)) as SagaReplayState;
    const battleState = startEncounterBattle(run, state.encounters, scratch);
    const session: BattleSession = {
      battle: battleState,
      scratch,
      rounds: [],
      picks: defaultPicks(battleState),
      node: -1,
      encounter: true,
    };
    setBattle(session);
    setFocusId(Object.keys(session.picks)[0] ?? null);
    setAnim(null);
    setBanner(null);
    setShowEnemyInfo(false);
    gameAudio.play("encounter");
    toast(`野外遇敌 · ${battleState.nodeName}`);
  }, [battle, panel, run, save, settlement, state]);

  useEffect(() => {
    const ready =
      Boolean(run) &&
      Boolean(state) &&
      state?.scene === "field" &&
      !battle &&
      !settlement &&
      !panel;
    encounterTriggerRef.current = ready ? beginEncounter : null;
  }, [battle, beginEncounter, panel, run, settlement, state]);

  const commitBattle = useCallback(
    (session: BattleSession, decisions: Record<string, boolean> = {}) => {
      appendCommand(
        session.encounter
          ? { k: "skirmish", rounds: session.rounds, field: session.battle.field }
          : { k: "battle", node: session.node, rounds: session.rounds },
      );
      const won = session.battle.phase === "won";
      const fallen = session.scratch.save.party.filter(
        (member) => (session.scratch.partyTroops[member.id] ?? 1) <= 0,
      );
      if (won && fallen.length > 0) {
        toast.error(
          `${fallen.map((member) => generalName(member.id)).join("、")} 阵亡，需招魂计或复活丹才归队`,
        );
      }
      const allFallen = session.scratch.save.party.every(
        (member) => (session.scratch.partyTroops[member.id] ?? 1) <= 0,
      );
      if (!won && allFallen) {
        toast(`全军覆没，已在最近的客栈醒来，各回两成兵力`);
      }
      // 胜利后的归降回应紧跟本场战斗指令：接受按标价扣聘金，婉拒无成本。
      if (won) {
        for (const offer of session.battle.recruitOffers) {
          appendCommand({
            k: "recruit",
            general: offer.generalId,
            accept: Boolean(decisions[offer.generalId]),
            gold: offer.goldCost,
            itemId: offer.itemId,
          });
        }
      }
      gameAudio.play(won ? "win" : "lose");
      setBanner({
        kind: won ? "won" : "lost",
        name: session.battle.nodeName,
        gold: session.battle.rewardGold,
        exp: session.battle.rewardExp,
        learned: session.battle.log
          .filter((event) => event.kind === "level" || event.text.includes("领悟"))
          .map((event) => event.text)
          .slice(-6),
      });
      if (won && run && session.node >= 0 && run.nodes[session.node]?.kind === "boss") {
        const chapter = run.nodes[session.node]?.chapter ?? run.startSave.chapter;
        const key = `victory:${chapter}`;
        if (markSceneSeen(key)) setDialogue(chapterVictoryScene(chapter));
      }
      setBattle(null);
      setAnim(null);
      setFocusId(null);
      setShowEnemyInfo(false);
      setOfferOpen(false);
      setOfferDecisions({});
    },
    [appendCommand, markSceneSeen, run],
  );

  /** 归降面板点「继续行军」：把本场战斗与逐条归降回应一起落档。 */
  const finishWithOffers = useCallback(() => {
    if (!battle) return;
    commitBattle(battle, offerDecisions);
  }, [battle, commitBattle, offerDecisions]);

  const runRound = useCallback(
    (session: BattleSession, round: SagaRoundCommand[]) => {
      if (session.battle.phase !== "select") return;
      const next: BattleSession = { ...session, rounds: [...session.rounds, round] };
      resolveBattleRound(next.battle, round, next.scratch);
      setBattle(next);
      const events = next.battle.lastEvents;
      const stepMs = Math.round(460 / battleSpeed);
      setAnim({ events, startedAt: performance.now(), stepMs });
      playBattleSfx(events, stepMs);
      if (animTimerRef.current !== null) window.clearTimeout(animTimerRef.current);
      animTimerRef.current = window.setTimeout(() => {
        animTimerRef.current = null;
        setAnim(null);
        if (next.battle.phase !== "select") {
          const offers = next.battle.recruitOffers;
          if (next.battle.phase === "won" && offers.length > 0) {
            // 先弹归降提议，玩家逐条接受 / 婉拒后再落本场战斗指令。
            setOfferDecisions({});
            setOfferOpen(true);
          } else {
            commitBattle(next);
          }
        } else {
          setBattle((prev) => (prev ? { ...prev, picks: defaultPicks(prev.battle) } : prev));
          setFocusId(next.battle.party.find((unit) => !unit.downed)?.id ?? null);
        }
      }, Math.max(1200, (events.length - 1) * stepMs + BATTLE_FLOAT_MS + 120));
    },
    [commitBattle, battleSpeed],
  );

  const executeRound = useCallback(() => {
    if (!battle) return;
    const commandsForRound: SagaRoundCommand[] = [];
    for (const unit of battle.battle.party) {
      if (unit.downed) continue;
      const pick = battle.picks[unit.id] ?? { a: "attack" as const, target: 0 };
      const command: SagaRoundCommand = { g: unit.id, a: pick.a };
      if (pick.t) command.t = pick.t;
      if (pick.i) command.i = pick.i;
      if (pick.f) command.f = pick.f;
      if (pick.target !== undefined) command.target = pick.target;
      commandsForRound.push(command);
    }
    runRound(battle, commandsForRound);
  }, [battle, runRound]);

  const allAttack = useCallback(() => {
    if (!battle) return;
    const target = Math.max(0, battle.battle.enemies.findIndex((enemy) => !enemy.downed));
    const round = battle.battle.party
      .filter((unit) => !unit.downed)
      .map((unit) => ({ g: unit.id, a: "attack" as const, target }));
    runRound(battle, round);
  }, [battle, runRound]);

  const autoBattle = useCallback(
    (node: number) => {
      if (!run || !state) return;
      if (state.scene === "lost") {
        toast.error("全军败退，先回城住店重整再出兵");
        return;
      }
      if (!canEngageNode(run, state, node)) {
        toast.error("要先拔掉其余营地，才能直取主帅本阵");
        return;
      }
      const rounds = autoBattleRounds(run, node, state);
      const scratch = JSON.parse(JSON.stringify(state)) as SagaReplayState;
      const battleState = startBattle(run, node, scratch);
      for (const round of rounds) {
        resolveBattleRound(battleState, round, scratch);
        if (battleState.phase !== "select") break;
      }
      appendCommand({ k: "battle", node, rounds });
      const won = battleState.phase === "won";
      setBanner({
        kind: won ? "won" : "lost",
        name: battleState.nodeName,
        gold: battleState.rewardGold,
        exp: battleState.rewardExp,
      });
      if (won && run.nodes[node]?.kind === "boss") {
        const chapter = run.nodes[node]?.chapter ?? run.startSave.chapter;
        const key = `victory:${chapter}`;
        if (markSceneSeen(key)) setDialogue(chapterVictoryScene(chapter));
      }
      setPanel(null);
    },
    [appendCommand, markSceneSeen, run, state],
  );

  const retreatBattle = useCallback(() => {
    if (!battle) return;
    if (!window.confirm("撤退只结束当前这场战斗，之前的战果与指令都已自动存档，行军不会中断。确定撤退？")) return;
    // 一回合没打就退的遭遇不落指令：遭遇按「第几场」复现，平白多记一场会让
    // 之后的野外战斗与服务端序号错位。营地战不受影响，空回合也照常留档。
    const block: SagaCommand | null =
      battle.rounds.length === 0
        ? null
        : battle.encounter
          ? { k: "skirmish", rounds: battle.rounds, field: battle.battle.field }
          : { k: "battle", node: battle.node, rounds: battle.rounds };
    const retreat: SagaCommand = { k: "retreat" };
    const next = block ? [...commands, block, retreat] : [...commands, retreat];
    const replayed = run ? replaySagaRun(run, next) : null;
    if (block) appendCommand(block);
    appendCommand(retreat);
    setBattle(null);
    setAnim(null);
    setPanel(null);
    setShowEnemyInfo(false);
    if (replayed?.state.scene === "lost") {
      setBanner({ kind: "lost", name: battle.battle.nodeName, gold: 0, exp: 0 });
      toast.error("全军败退，回城住店重整后再战");
    } else {
      gameAudio.play("miss");
      toast.success("已撤退，行军继续 · 战果已自动存档");
    }
  }, [appendCommand, battle, commands, run]);

  // ---- 面板动作 ----
  const stayAtInn = useCallback(() => {
    if (!run || !state) return;
    if (state.scene !== "field" && state.scene !== "lost") return;
    const revive = state.scene === "lost";
    void buyItem(
      SAGA_INN_ITEM_ID,
      revive ? "住店：全军重整旗鼓" : "住店歇脚：上阵武将兵力补满",
      "heal",
    );
  }, [buyItem, run, state]);

  const equipItem = useCallback(
    (generalId: string, slot: GearSlot, itemId: string | null) => {
      if (slot === "weapon" && itemId) {
        const item = SAGA_ITEM_BY_ID.get(itemId);
        const def = SAGA_GENERAL_BY_ID.get(generalId);
        if (item?.weaponType && !weaponTypesFor(def).includes(item.weaponType)) {
          toast.error(`${generalName(generalId)}不惯用${item.name}，只能装：${weaponProfileText(def)}`);
          return;
        }
      }
      appendCommand({ k: "equip", g: generalId, slot, i: itemId });
    },
    [appendCommand],
  );

  const applyInventoryItem = useCallback(
    (ownerId: string, itemId: string, targetId?: string) => {
      appendCommand({ k: "use", g: ownerId, i: itemId, target: targetId });
    },
    [appendCommand],
  );

  const dropInventoryItem = useCallback(
    (ownerId: string, itemId: string) => {
      appendCommand({ k: "drop", g: ownerId, i: itemId });
    },
    [appendCommand],
  );

  const giveInventoryItem = useCallback(
    (fromId: string, toId: string, itemId: string) => {
      if (fromId === toId) return;
      const target = [...save.party, ...save.reserve].find((entry) => entry.id === toId);
      const targetItems = target?.items ?? {};
      if (!targetItems[itemId] && Object.keys(targetItems).length >= SAGA_CARRY_LIMIT) {
        toast.error(`${generalName(toId)}身上已带满 ${SAGA_CARRY_LIMIT} 种道具`);
        return;
      }
      appendCommand({ k: "give", from: fromId, to: toId, i: itemId });
      toast.success(`把 ${itemName(itemId)} 转交给${generalName(toId)}`);
    },
    [appendCommand, save.party, save.reserve],
  );

  const sellInventoryItem = useCallback(
    (itemId: string, ownerId?: string) => {
      appendCommand({ k: "sell", i: itemId, g: ownerId });
      toast.success(`折价卖出 ${itemName(itemId)}`);
    },
    [appendCommand],
  );

  const setFormation = useCallback(
    (formation: FormationId) => {
      appendCommand({ k: "formation", f: formation });
    },
    [appendCommand],
  );

  const setActiveParty = useCallback(
    (active: string[]) => {
      appendCommand({ k: "party", active });
    },
    [appendCommand],
  );

  /** 胜利后归降面板开启时，战斗指令按钮一律锁定，避免误撤退 / 误执行。 */
  const offerActive = Boolean(battle && offerOpen && battle.battle.phase === "won");
  const battleLocked = Boolean(anim) || offerActive;
  /** 战斗头信息：行动顺序、阵型对抗与当前指挥目标，全部从当前战局推出。 */
  const battleView = (() => {
    if (!battle) return null;
    const current = battle.battle;
    const turnOrder = battleTurnOrder(current);
    const focusUnit =
      current.party.find((unit) => unit.id === focusId && !unit.downed) ??
      current.party.find((unit) => !unit.downed) ??
      null;
    const pick = focusUnit ? battle.picks[focusUnit.id] : null;
    const actionText = !pick
      ? "未下令"
      : pick.a === "attack"
        ? "攻击"
        : pick.a === "tactic"
          ? (pick.t ? SAGA_TACTIC_BY_ID.get(pick.t)?.name : "") || "计策"
          : pick.a === "item"
            ? `道具 · ${itemName(pick.i ?? "")}`
            : "防御";
    const targetName =
      pick?.a === "attack" ? (current.enemies[pick.target ?? 0]?.name ?? null) : null;
    const playerFormation = SAGA_FORMATION_BY_ID.get(current.playerFormation) ?? null;
    const enemyFormation = SAGA_FORMATION_BY_ID.get(current.enemyFormation) ?? null;
    const counter: "up" | "down" | "even" =
      playerFormation && enemyFormation
        ? playerFormation.beats === enemyFormation.id
          ? "up"
          : enemyFormation.beats === playerFormation.id
            ? "down"
            : "even"
        : "even";
    return { turnOrder, focusUnit, actionText, targetName, playerFormation, enemyFormation, counter };
  })();
  // 战报按「一轮次」完整展示：动画期间是这一轮全部事件，结束后沿用上一轮。
  const battleRoundEvents = battle
    ? anim && anim.events.length > 0
      ? anim.events
      : battle.battle.lastEvents.length > 0
        ? battle.battle.lastEvents
        : battle.battle.log.slice(-3)
    : [];
  const panelTitle =
    panel === "notice"
      ? "版本公告"
      : panel === "dex"
      ? "武将图鉴"
      : panel === "archive"
        ? "档案商店"
        : panel === "status"
        ? "军中一览"
        : panel === "camp"
          ? `敌营 · ${run?.nodes[campNode ?? 0]?.name ?? ""}`
          : panel === "army"
          ? "军情"
          : panel === "site"
            ? site
              ? `${site.name} · ${site.kind === "town" ? "城镇" : "村庄"}`
              : "聚落"
            : panel === "tavern"
              ? `${chapter.town} · 酒馆`
              : panel === "tent"
                ? "营帐议事"
                : panel === "train"
                  ? `${chapter.town} · 训练场`
                  : panel === "coupon"
                    ? `${chapter.town} · 活动券礼包`
                    : (FIELD_FACILITIES.find((spot) => spot.id === panel)?.label ??
                      `${chapter.town}城 · 城中整备`);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5">
          <Flag className="h-3.5 w-3.5 text-muted-foreground" />
          {chapter.town} · {chapter.name}
        </span>
        <span className={HUD_CELL}>
          <Coins className="h-3.5 w-3.5 text-amber-500" />
          {formatCredits(save.gold)} 金
        </span>
        <span className={HUD_CELL}>
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          战力 {partyPower(save)}
        </span>
        <button
          type="button"
          className={cn(HUD_CELL, "transition-colors hover:bg-muted")}
          title="打开活动券礼包"
          onClick={() => setPanel("coupon")}
        >
          <CouponIcon kind="trial" className="h-3.5 w-3.5" />
          {tickets} 张活动券
        </button>
        <span className={cn(HUD_CELL, "ml-auto")}>
          {finished
            ? "全剧终"
            : run
              ? `营地 ${clearedNodes.length}/${run.nodes.length} · 遭遇 ${state?.encounters ?? 0} 场`
              : "整装待发"}
          {run ? (
            saveState === "error" ? (
              <button
                type="button"
                onClick={() => setSaveRetry((prev) => prev + 1)}
                className="text-destructive underline decoration-dotted underline-offset-2 hover:text-destructive/80"
                title="进度尚未存到服务端，点这里重试"
              >
                {" "}
                · 存档失败，点此重试
              </button>
            ) : (
              <span className="text-muted-foreground">
                {saveState === "saving" ? " · 存档中…" : saveState === "saved" ? " · 已自动存档" : ""}
              </span>
            )
          ) : null}
        </span>
        <SoundToggle game="trial" battle={Boolean(battle)} />
      </div>

      <div className="relative -mx-5 overflow-hidden rounded-none border-y border-border bg-black sm:mx-0 sm:rounded-xl sm:border">
        <canvas
          ref={canvasRef}
          width={VIEW_W}
          height={VIEW_H}
          className={cn("block aspect-video w-full cursor-pointer", inTown && "hidden")}
          onClick={(event) => {
            if (settlement) return;
            const view = viewRef.current;
            const rect = event.currentTarget.getBoundingClientRect();
            const px = (event.clientX - rect.left) * (view.w / rect.width);
            const py = (event.clientY - rect.top) * (view.h / rect.height);
            if (battle) {
              // 战斗中点敌将就是设为目标，省得再去下拉框里找人。
              const index = battleEnemyAtPoint(view, battle.battle, px, py);
              const enemy = index >= 0 ? battle.battle.enemies[index] : null;
              if (!enemy || enemy.downed) return;
              const focus = focusId ?? battle.battle.party.find((row) => !row.downed)?.id;
              if (!focus) return;
              setFocusId(focus);
              setBattle((prev) =>
                prev && prev.picks[focus]
                  ? {
                      ...prev,
                      picks: {
                        ...prev.picks,
                        [focus]: { ...prev.picks[focus], a: "attack", target: index },
                      },
                    }
                  : prev,
              );
              return;
            }
            const camX = Math.max(0, Math.min(field.worldW - view.w, playerRef.current.x - view.w / 2));
            const camY = Math.max(0, Math.min(field.worldH - view.h, playerRef.current.y - view.h / 2));
            const wx = px + camX;
            const wy = py + camY;
            const camp = field.camps.find((row) => Math.hypot(row.x - wx, row.y - wy) < 34);
            if (camp) {
              walkTo(camp.x, camp.y + 32, () => openCamp(camp.node));
              return;
            }
            const poi = field.pois.find((row) => Math.hypot(row.x - wx, row.y - wy) < 30);
            if (poi) {
              walkTo(poi.x, poi.y + 26, () =>
                interactRef.current({ kind: "poi", poi, x: poi.x, y: poi.y, radius: 28 }),
              );
              return;
            }
            const city = (field.cities ?? [field.city]).find(
              (row) => Math.hypot(row.x - wx, row.y - wy) < 44,
            );
            if (city) {
              walkTo(city.x, city.y + 30, () =>
                interactRef.current({ kind: "city", city, x: city.x, y: city.y, radius: 44 }),
              );
              return;
            }
            // 野外点空地：直接走到那一点（落点在山 / 水 / 城墙里就吸到最近一格可走处）。
            // 不再弹「军中一览」，免得走位途中被打断；要看队伍走城里的编成所。
            const point = fieldWalkPoint(field, wx, wy);
            if (point) walkTo(point.x, point.y);
          }}
        />

        {inTown && run ? (
          <WalkTown
            chapterIndex={chapter.index}
            townName={chapter.town}
            tickets={tickets}
            active={!panel && !dialogue}
            partyColor={heroDef?.color ?? "#3f6212"}
            partyAccent={heroDef?.accent ?? "#bef264"}
            partyMembers={save.party.map((member) => {
              const def = SAGA_GENERAL_BY_ID.get(member.id);
              return { color: def?.color ?? "#3f6212", accent: def?.accent ?? "#bef264" };
            })}
            onFacility={(spot) => setPanel(spot)}
            onLeave={() => {
              setPanel(null);
              setInTown(false);
            }}
            onCouncil={() => setDialogue(councilScene(chapter.index, save.party.map((member) => member.id)))}
            onArmy={() => setPanel("army")}
          />
        ) : null}

        {battle && battleView ? (
          <div className="border-t border-amber-200/20 bg-[#14110d] px-2 py-2 sm:px-3">
            <div className="mx-auto w-full max-w-6xl text-xs text-amber-50">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-0.5 pb-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium">{battle.battle.nodeName}</span>
                  <span className="shrink-0 text-[11px] text-white/50">
                    第 {battle.battle.round} 回合 · 敌 {battle.battle.enemies.filter((unit) => !unit.downed).length}{" "}
                    {battle.encounter ? "队" : "将"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="flex overflow-hidden rounded-md border border-white/15">
                    {([1, 2] as const).map((speed) => (
                      <button
                        key={speed}
                        type="button"
                        onClick={() => setBattleSpeed(speed)}
                        className={cn(
                          "h-7 px-2 text-[11px] tabular-nums transition-colors",
                          battleSpeed === speed
                            ? "bg-amber-400/85 font-semibold text-[#20160c]"
                            : "text-white/60 hover:bg-white/10",
                        )}
                      >
                        {speed}×
                      </button>
                    ))}
                  </span>
                  <Button
                    size="sm"
                    variant={showEnemyInfo ? "primary" : "outline"}
                    className="h-7 px-2.5 text-xs"
                    onClick={() => setShowEnemyInfo((value) => !value)}
                  >
                    敌情
                  </Button>
                  <Button
                    size="sm"
                    variant={showPartyInfo ? "primary" : "outline"}
                    className="h-7 px-2.5 text-xs"
                    onClick={() => setShowPartyInfo((value) => !value)}
                  >
                    部将
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={allAttack} disabled={battleLocked}>
                    总攻击
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={retreatBattle} disabled={battleLocked}>
                    撤退
                  </Button>
                  <Button size="sm" className="h-7 px-2.5 text-xs" onClick={executeRound} disabled={battleLocked}>
                    执行回合
                  </Button>
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-[11px]">
                <span className="text-white/50">
                  阵型{" "}
                  <span className="text-amber-100">{battleView.playerFormation?.name ?? "—"}</span>
                  <span className="px-1 text-white/30">对</span>
                  <span className="text-rose-100">{battleView.enemyFormation?.name ?? "—"}</span>
                </span>
                <span
                  title={
                    battleView.counter === "up"
                      ? "我军阵型克制敌军：攻击更顺"
                      : battleView.counter === "down"
                        ? "我军阵型被克：攻击受阻，回城可换阵"
                        : "双方阵型互不克制"
                  }
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px]",
                    battleView.counter === "up"
                      ? "bg-emerald-400/15 text-emerald-200"
                      : battleView.counter === "down"
                        ? "bg-rose-400/15 text-rose-200"
                        : "bg-white/10 text-white/55",
                  )}
                >
                  {battleView.counter === "up" ? "克制" : battleView.counter === "down" ? "被克" : "均势"}
                </span>
                <span className="min-w-0 truncate text-white/50">
                  指挥{" "}
                  <span className="text-amber-100">{battleView.focusUnit?.name ?? "—"}</span>
                  <span className="px-1 text-white/30">·</span>
                  <span className="text-amber-100/85">{battleView.actionText}</span>
                  {battleView.targetName ? (
                    <>
                      <span className="px-1 text-white/30">→</span>
                      <span className="text-rose-100">{battleView.targetName}</span>
                    </>
                  ) : null}
                </span>
              </div>

              <div className="mt-1.5 flex items-center gap-1.5 overflow-x-auto rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
                <span className="shrink-0 text-[10px] text-white/45">行动顺序</span>
                {battleView.turnOrder.map((unit, index) => (
                  <span
                    key={`${unit.side}-${unit.id}`}
                    className={cn(
                      "flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px]",
                      unit.side === "player"
                        ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
                        : "border-rose-300/25 bg-rose-400/10 text-rose-100",
                    )}
                  >
                    <span className="tabular-nums text-white/40">{index + 1}</span>
                    {unit.name}
                  </span>
                ))}
              </div>

              {showPartyInfo ? (
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {battle.battle.party.map((unit) => {
                    const weapon = unit.weapon ? SAGA_ITEM_BY_ID.get(unit.weapon) : null;
                    const armor = unit.armor ? SAGA_ITEM_BY_ID.get(unit.armor) : null;
                    const speed = battleEffectiveSpeed(unit, battle.battle);
                    const hit = battleHitRate(unit, battle.battle.enemies[0] ?? unit, battle.battle);
                    const crit = battleCritRate(unit, battle.battle);
                    return (
                      <div
                        key={unit.id}
                        className="rounded-lg border border-amber-300/20 bg-amber-300/[0.04] px-2.5 py-1.5"
                      >
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[12px] font-medium text-amber-100">{unit.name}</span>
                          <span className="text-[10px] text-white/45">
                            {unit.title} · Lv{unit.level}
                          </span>
                          <span className="ml-auto text-[10px] tabular-nums text-white/65">
                            兵 {Math.max(0, unit.troops)}/{unit.maxTroops}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[10px] tabular-nums text-white/65">
                          武 {unit.force} · 智 {unit.intellect} · 防 {unit.defense} · 速{" "}
                          {Math.round(speed)} · 攻 {battleAttackPower(unit, battle.battle.rules)}
                        </p>
                        <p className="text-[10px] tabular-nums text-fuchsia-100/80">
                          SP {unit.tacticPoints}/{unit.spMax} · 命中 {Math.round(hit * 100)}% · 暴击{" "}
                          {Math.round(crit * 100)}%
                        </p>
                        <p className="text-[10px] text-white/55">
                          兵器 {weapon ? `${weapon.name}（+${unit.weaponAtk}）` : "无"} · 甲胄{" "}
                          {armor ? `${armor.name}（+${unit.armorDef}）` : "无"}
                        </p>
                        <p className="text-[10px] text-white/55">
                          计策{" "}
                          {unit.tactics.length > 0
                            ? unit.tactics
                                .map((tactic) => {
                                  const item = SAGA_TACTIC_BY_ID.get(tactic);
                                  return item ? `${item.name}(${item.cost}SP)` : tactic;
                                })
                                .join(" / ")
                            : "无"}
                        </p>
                        {unit.traits.length > 0 ? (
                          <p className="text-[10px] text-amber-100/60">
                            {unit.traits
                              .map((id) => {
                                const trait = SAGA_TRAIT_BY_ID.get(id);
                                return `${trait?.name ?? id}：${trait?.desc ?? ""}`;
                              })
                              .join("；")}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {showEnemyInfo ? (
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {battle.battle.enemies.map((enemy, index) => {
                    const weapon = enemy.weapon ? SAGA_ITEM_BY_ID.get(enemy.weapon) : null;
                    const armor = enemy.armor ? SAGA_ITEM_BY_ID.get(enemy.armor) : null;
                    const enemySpeed = battleEffectiveSpeed(enemy, battle.battle);
                    const enemyHit = battleHitRate(
                      enemy,
                      battle.battle.party[0] ?? enemy,
                      battle.battle,
                    );
                    const enemyCrit = battleCritRate(enemy, battle.battle);
                    return (
                      <div
                        key={`${enemy.id}-${index}`}
                        className={cn(
                          "rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5",
                          enemy.downed && "opacity-45",
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[12px] font-medium text-amber-100">{enemy.name}</span>
                          <span className="text-[10px] text-white/45">
                            {enemy.title} · Lv{enemy.level}
                          </span>
                          <span className="ml-auto text-[10px] tabular-nums text-white/65">
                            兵 {Math.max(0, enemy.troops)}/{enemy.maxTroops}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[10px] tabular-nums text-white/65">
                          武 {enemy.force} · 智 {enemy.intellect} · 防 {enemy.defense} · 速{" "}
                          {Math.round(enemySpeed)} · 攻 {battleAttackPower(enemy, battle.battle.rules)} · SP{" "}
                          {enemy.tacticPoints}
                        </p>
                        <p className="text-[10px] tabular-nums text-amber-100/55">
                          命中 {Math.round(enemyHit * 100)}% · 暴击 {Math.round(enemyCrit * 100)}%
                        </p>
                        <p className="text-[10px] text-white/55">
                          兵器{" "}
                          {weapon
                            ? `${weapon.name}${enemy.weaponPlus ? `+${enemy.weaponPlus}` : ""}（+${enemy.weaponAtk}）`
                            : "无"}{" "}
                          · 甲胄{" "}
                          {armor
                            ? `${armor.name}${enemy.armorPlus ? `+${enemy.armorPlus}` : ""}（+${enemy.armorDef}）`
                            : "无"}
                        </p>
                        {(() => {
                          const extras = (
                            [
                              ["helmet", enemy.helmet, "盔"],
                              ["belt", enemy.belt, "带"],
                              ["pendant", enemy.pendant, "饰"],
                              ["boots", enemy.boots, "靴"],
                              ["mount", enemy.mount, "骑"],
                            ] as const
                          )
                            .map(([, id, label]) => {
                              const item = id ? SAGA_ITEM_BY_ID.get(id) : null;
                              return item ? `${label} ${item.name}` : null;
                            })
                            .filter((line): line is string => Boolean(line));
                          return extras.length > 0 ? (
                            <p className="text-[10px] text-white/55">
                              护具 {extras.join(" · ")}
                              {enemy.extraDef ? `（防 +${enemy.extraDef}）` : ""}
                              {enemy.extraSpeed ? `（速 +${enemy.extraSpeed}）` : ""}
                            </p>
                          ) : null;
                        })()}
                        <p className="text-[10px] text-white/55">
                          计策{" "}
                          {enemy.tactics.length > 0
                            ? enemy.tactics
                                .map((tactic) => SAGA_TACTIC_BY_ID.get(tactic)?.name ?? tactic)
                                .join(" / ")
                            : "无"}
                        </p>
                        {enemy.traits.length > 0 ? (
                          <p className="text-[10px] text-amber-100/60">
                            {enemy.traits
                              .map((id) => {
                                const trait = SAGA_TRAIT_BY_ID.get(id);
                                return `${trait?.name ?? id}：${trait?.desc ?? ""}`;
                              })
                              .join("；")}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {/* 战报：一整轮的出招逐条列出，不再只留最近三条 */}
              <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-[11px] leading-relaxed text-amber-100/80">
                <p className="text-[10px] text-white/40">
                  {anim
                    ? "本轮战报 · 逐条播报中"
                    : battleRoundEvents.length > 0
                      ? `上一回合 · ${battleRoundEvents.length} 条`
                      : ""}
                </p>
                <div className="max-h-44 space-y-0.5 overflow-y-auto overscroll-contain pr-1">
                  {battleRoundEvents.map((event, index) => (
                    <p key={index} className="whitespace-pre-wrap">
                      {event.text}
                    </p>
                  ))}
                  {battle.battle.log.length === 0 && !anim ? (
                    <p className="text-white/45">
                      点画布上的敌将可设为目标；逐将选好战术后执行，撤退只退出这一场。
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-2 space-y-1.5">
                {battle.battle.party.map((unit) => {
                  const pick = battle.picks[unit.id];
                  const alive = !unit.downed;
                  const unitSpeed = battleEffectiveSpeed(unit, battle.battle);
                  const unitHit = battleHitRate(
                    unit,
                    battle.battle.enemies[0] ?? unit,
                    battle.battle,
                  );
                  const unitCrit = battleCritRate(unit, battle.battle);
                  const order = !alive
                    ? "已败退"
                    : !pick
                      ? "待命"
                      : pick.a === "attack"
                        ? `攻击 · ${battle.battle.enemies[pick.target ?? 0]?.name ?? "敌将"}`
                        : pick.a === "tactic"
                          ? (pick.t ? SAGA_TACTIC_BY_ID.get(pick.t)?.name : "") || "计策"
                          : pick.a === "item"
                          ? `道具 · ${itemName(pick.i ?? "")}`
                          : "防御";
                  return (
                    <div
                      key={unit.id}
                      className={cn(
                        "rounded-lg border px-2.5 py-1.5 transition-colors",
                        focusId === unit.id
                          ? "border-amber-300/70 bg-amber-300/10"
                          : "border-white/10 bg-white/[0.03]",
                        !alive && "opacity-45",
                      )}
                      onClick={() => alive && setFocusId(unit.id)}
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="min-w-[96px] text-[13px] font-medium">
                          {unit.name}{" "}
                          <span className="text-[11px] font-normal text-white/45">Lv{unit.level}</span>
                        </span>
                        <span className="text-[11px] tabular-nums text-white/65">
                          兵 {Math.max(0, unit.troops)}/{unit.maxTroops}
                        </span>
                        <span className="text-[11px] tabular-nums text-amber-100/80">
                          攻 {battleAttackPower(unit, battle.battle.rules)}
                        </span>
                        <span className="text-[11px] tabular-nums text-emerald-100/75">
                          防 {unit.defense}
                        </span>
                        <span className="text-[11px] tabular-nums text-sky-200/80">
                          速 {Math.round(unitSpeed)}
                        </span>
                        <span className="text-[11px] tabular-nums text-fuchsia-100/75">
                          SP {unit.tacticPoints}
                        </span>
                        <span className="text-[11px] tabular-nums text-white/55">
                          命中 {Math.round(unitHit * 100)}% · 暴击 {Math.round(unitCrit * 100)}%
                        </span>
                        <span className="ml-auto text-[11px] text-amber-100/55">{order}</span>
                      </div>
                      {unit.traits.length > 0 ? (
                        <p className="mt-0.5 text-[10px] text-amber-100/55">
                          {unit.traits
                            .map((id) => {
                              const trait = SAGA_TRAIT_BY_ID.get(id);
                              return `${trait?.name ?? id}：${trait?.desc ?? ""}`;
                            })
                            .join("；")}
                        </p>
                      ) : null}
                      {alive && pick ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {(
                            [
                              ["attack", "攻击"],
                              ["tactic", "计策"],
                              ["formation", "变阵"],
                              ["guard", "防御 +8SP"],
                              ["item", "道具"],
                            ] as [BattleAction, string][]
                          ).map(([action, label]) => {
                            const affordable = unit.tactics.filter(
                              (id) => (SAGA_TACTIC_BY_ID.get(id)?.cost ?? 1) <= unit.tacticPoints,
                            );
                            const usableFormations = SAGA_FORMATIONS.filter(
                              (row) =>
                                !row.legacy &&
                                row.level <= Math.max(...battle.battle.party.map((unit) => unit.level)) &&
                                row.cost <= unit.tacticPoints &&
                                row.id !== battle.battle.playerFormation,
                            );
                            const disabled =
                              (action === "tactic" && affordable.length === 0) ||
                              (action === "formation" && usableFormations.length === 0) ||
                              (action === "item" && availableItems(battle.scratch).length === 0);
                            return (
                              <button
                                key={action}
                                type="button"
                                disabled={disabled}
                                onClick={() =>
                                  setBattle((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          picks: {
                                            ...prev.picks,
                                            [unit.id]: {
                                              a: action,
                                              target:
                                                action === "attack"
                                                  ? Math.max(0, prev.battle.enemies.findIndex((enemy) => !enemy.downed))
                                                  : undefined,
                                            },
                                          },
                                        }
                                      : prev,
                                  )
                                }
                                className={cn(
                                  "rounded-md border px-2 py-1 text-[11px]",
                                  pick.a === action
                                    ? "border-amber-300 bg-amber-300 text-black"
                                    : "border-white/15 hover:bg-white/10",
                                  disabled && "cursor-not-allowed opacity-40",
                                )}
                              >
                                {label}
                              </button>
                            );
                          })}
                          {pick.a === "attack" ? (
                            <select
                              value={String(pick.target ?? 0)}
                              onChange={(event) =>
                                setBattle((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        picks: {
                                          ...prev.picks,
                                          [unit.id]: { ...prev.picks[unit.id], target: Number(event.target.value) },
                                        },
                                      }
                                    : prev,
                                )
                              }
                              className="h-6 rounded-md border border-white/15 bg-black/40 px-1 text-[11px] text-amber-50"
                            >
                              {battle.battle.enemies.map((enemy, index) =>
                                enemy.downed ? null : (
                                  <option key={enemy.id + index} value={index} className="bg-[#14110d]">
                                    {enemy.name}
                                  </option>
                                ),
                              )}
                            </select>
                          ) : null}
                          {pick.a === "tactic" ? (
                            <span className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto pr-1">
                              {unit.tactics.map((tactic) => {
                                const def = SAGA_TACTIC_BY_ID.get(tactic);
                                const cost = def?.cost ?? 1;
                                const short = unit.tacticPoints < cost;
                                const aliveFoes = battle.battle.enemies.filter((foe) => foe.troops > 0);
                                const foeIntellect = aliveFoes.length
                                  ? aliveFoes.reduce((sum, foe) => sum + foe.intellect, 0) / aliveFoes.length
                                  : unit.intellect;
                                const chance = Math.round(battleTacticRate(unit, foeIntellect, battle.battle) * 100);
                                const risky =
                                  def?.kind === "fire" ||
                                  def?.kind === "water" ||
                                  def?.kind === "rock" ||
                                  def?.kind === "drain";
                                return (
                                  <button
                                    key={tactic}
                                    type="button"
                                    disabled={short}
                                    title={`${def?.desc ?? ""}（耗策略 ${cost}${risky ? `，成算约 ${chance}%` : "，智力低也能施计"}）`}
                                    onClick={() =>
                                      setBattle((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              picks: {
                                                ...prev.picks,
                                                [unit.id]: {
                                                  a: "tactic",
                                                  t: tactic,
                                                  target: prev.picks[unit.id]?.target,
                                                },
                                              },
                                            }
                                          : prev,
                                      )
                                    }
                                    className={cn(
                                      "rounded-md border px-2 py-1 text-[11px]",
                                      pick.t === tactic ? "border-amber-300 bg-amber-300/20" : "border-white/15",
                                      short && "cursor-not-allowed opacity-40",
                                    )}
                                  >
                                    {def?.name ?? tactic}
                                    <span className="ml-1 text-[10px] text-sky-200/70">{cost}</span>
                                  </button>
                                );
                              })}
                            </span>
                          ) : null}
                          {pick.a === "formation" ? (
                            <select
                              value={pick.f ?? ""}
                              onChange={(event) =>
                                setBattle((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        picks: {
                                          ...prev.picks,
                                          [unit.id]: { a: "formation", f: event.target.value as FormationId },
                                        },
                                      }
                                    : prev,
                                )
                              }
                              className="h-6 rounded-md border border-white/15 bg-black/40 px-1 text-[11px] text-amber-50"
                            >
                              <option value="" className="bg-[#14110d]">选择阵形</option>
                              {SAGA_FORMATIONS.filter(
                                (row) =>
                                  !row.legacy &&
                                  row.level <= Math.max(...battle.battle.party.map((unit) => unit.level)) &&
                                  row.cost <= unit.tacticPoints &&
                                  row.id !== battle.battle.playerFormation,
                              ).map((row) => (
                                <option key={row.id} value={row.id} className="bg-[#14110d]">
                                  {row.name}阵（策 {row.cost}）
                                </option>
                              ))}
                            </select>
                          ) : null}
                          {pick.a === "item" ? (
                            <select
                              value={pick.i ?? ""}
                              onChange={(event) =>
                                setBattle((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        picks: {
                                          ...prev.picks,
                                          [unit.id]: { a: "item", i: event.target.value },
                                        },
                                      }
                                    : prev,
                                )
                              }
                              className="h-6 rounded-md border border-white/15 bg-black/40 px-1 text-[11px] text-amber-50"
                            >
                              <option value="" className="bg-[#14110d]">选择道具</option>
                              {availableItems(battle.scratch).map((item) => (
                                <option key={item.id} value={item.id} className="bg-[#14110d]">
                                  {item.name} ×{item.count}
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

        {offerActive && battle ? (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-xl border border-amber-300/30 bg-[#1d160c]/97 p-4 shadow-2xl">
              <p className="text-sm font-semibold text-amber-100">捷报 · 归降来投</p>
              <p className="mt-1 text-[11px] text-white/55">
                胜后有敌将愿受礼聘：接受需付聘金，再按成功率掷入麾下；未能入队时聘金不退。
              </p>
              <div className="mt-3 space-y-2">
                {battle.battle.recruitOffers.map((offer) => {
                  const decision = offerDecisions[offer.generalId];
                  const affordable = save.gold >= offer.goldCost;
                  return (
                    <div key={offer.generalId} className="rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-[13px] font-medium text-amber-50">{offer.name}</span>
                        <span className="text-[11px] text-white/45">
                          {offer.title} · Lv{offer.level}
                        </span>
                        {offer.hard ? (
                          <span className="rounded border border-rose-300/30 bg-rose-300/10 px-1 text-[10px] text-rose-200">
                            难招
                          </span>
                        ) : null}
                        <span className="ml-auto text-[11px] tabular-nums text-amber-200">
                          聘金 {formatCredits(offer.goldCost)}
                        </span>
                        <span className="text-[11px] tabular-nums text-sky-200">成功率 {offer.chance}%</span>
                      </div>
                      <div className="mt-2 flex gap-1.5">
                        <button
                          type="button"
                          disabled={!affordable || decision === true}
                          onClick={() =>
                            setOfferDecisions((prev) => ({ ...prev, [offer.generalId]: true }))
                          }
                          className={cn(
                            "rounded-md border px-2.5 py-1 text-[11px]",
                            decision === true
                              ? "border-amber-300 bg-amber-300 text-black"
                              : affordable
                                ? "border-amber-300/40 text-amber-100 hover:bg-amber-300/10"
                                : "cursor-not-allowed opacity-40",
                          )}
                        >
                          接受归降
                        </button>
                        <button
                          type="button"
                          disabled={decision === false}
                          onClick={() =>
                            setOfferDecisions((prev) => ({ ...prev, [offer.generalId]: false }))
                          }
                          className={cn(
                            "rounded-md border px-2.5 py-1 text-[11px]",
                            decision === false
                              ? "border-white/40 bg-white/10 text-white/80"
                              : "border-white/15 hover:bg-white/10",
                          )}
                        >
                          婉拒
                        </button>
                      </div>
                      {!affordable ? (
                        <p className="mt-1 text-[10px] text-rose-200/80">金币不足，无法礼聘</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <Button className="mt-3 w-full" onClick={finishWithOffers}>
                继续行军
              </Button>
            </div>
          </div>
        ) : null}

        {/* 弹层 */}
        {panel ? (
          <div className={PANEL_CLASS}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{panelTitle}</span>
              </span>
              <button type="button" onClick={() => setPanel(null)} className="rounded p-1 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className={PANEL_BODY}>
              {panel === "notice" ? <NoticeBoard /> : null}

              {panel === "archive" ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    档案里记着这一路的战功：谁离下一级还差多少经验、金币能折多少 tcr，都在这里看。
                    点「结算并结束」会把整份存档的金币折成 tcr 发到钱包，然后清空存档——
                    清空之后就没有「继续游戏」了，下次只能「新的征途」。
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-lg border border-border p-2">
                      <p className="text-xs text-muted-foreground">当前地方</p>
                      <p className="mt-0.5 text-sm font-medium">
                        {chapter.town} · {chapter.name}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border p-2">
                      <p className="text-xs text-muted-foreground">存档金币</p>
                      <p className="mt-0.5 text-sm font-medium tabular-nums">
                        {formatCredits(save.gold)} 金
                      </p>
                    </div>
                    <div className="rounded-lg border border-border p-2">
                      <p className="text-xs text-muted-foreground">可折 tcr</p>
                      <p className="mt-0.5 text-sm font-medium tabular-nums">
                        {archiveTcrPreview} tcr
                        <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                          （{props.bank.goldPerTcr} 金 = 1 tcr）
                        </span>
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-sm font-medium">升级经验</p>
                    <div className="space-y-1">
                      {[...save.party, ...save.reserve].map((member) => {
                        const need =
                          member.level >= uiMaxLevel ? 0 : expToNext(member.level) - member.exp;
                        return (
                          <div
                            key={member.id}
                            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded border border-border px-2 py-1.5 text-xs"
                          >
                            <span className="flex items-center gap-2">
                              <span className="font-medium">{generalName(member.id)}</span>
                              <span className="rounded border border-border px-1 tabular-nums text-muted-foreground">
                                Lv {member.level}
                              </span>
                            </span>
                            <span className="tabular-nums text-muted-foreground">
                              {member.level >= uiMaxLevel
                                ? `已到 ${uiMaxLevel} 级封顶`
                                : `经验 ${member.exp} / ${expToNext(member.level)} · 距下一级还差 ${Math.max(0, need)}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="rounded-lg border border-amber-500/35 bg-amber-500/5 p-3">
                    <p className="text-sm font-medium">结算并结束</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      把 {formatCredits(save.gold)} 金按 {props.bank.goldPerTcr} 金 = 1 tcr 折成{" "}
                      {archiveTcrPreview} tcr 发到钱包，然后清空这份存档、回到游戏入口。
                    </p>
                    {settleAsk ? (
                      <div className="mt-2 rounded border border-amber-500/40 bg-background/60 p-2.5">
                        <p className="text-sm font-medium">
                          是否结算所有金币为 tcr、结束游戏并清空存档？
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          选「是」结算并删档，回到入口，之后只能重新开始；选「否」继续游戏。
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === "settle"}
                            onClick={() => setSettleAsk(false)}
                          >
                            否，继续游戏
                          </Button>
                          <Button
                            size="sm"
                            disabled={busy === "settle"}
                            onClick={() => void settleArchive()}
                          >
                            {busy === "settle" ? "结算中…" : "是，结算并结束"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        disabled={Boolean(busy) || !saveExists}
                        onClick={() => setSettleAsk(true)}
                      >
                        <Coins className="h-3.5 w-3.5" />
                        结算并结束
                      </Button>
                    )}
                  </div>
                </div>
              ) : null}

              {panel === "record" ? (
                <div className="space-y-3">
                  <NpcIntro npcId="recordkeeper" />
                  <div className="flex gap-2">
                    <Button size="sm" variant={dexTab === "save" ? "primary" : "outline"} onClick={() => setDexTab("save")}>
                      存档
                    </Button>
                    <Button size="sm" variant={dexTab === "dex" ? "primary" : "outline"} onClick={() => setDexTab("dex")}>
                      武将图鉴
                    </Button>
                  </div>
                  {dexTab === "save" ? (
                    <div className="space-y-3 text-sm">
                      <div className="space-y-1">
                        {chapter.story.map((line) => (
                          <p key={line} className="text-xs text-muted-foreground">
                            {line}
                          </p>
                        ))}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <div className="rounded-lg border border-border p-2">
                          <p className="text-xs text-muted-foreground">行军 / 平定</p>
                          <p className="tabular-nums font-medium">{save.stats.runs} / {save.stats.wins}</p>
                        </div>
                        <div className="rounded-lg border border-border p-2">
                          <p className="text-xs text-muted-foreground">累计胜仗</p>
                          <p className="tabular-nums font-medium">{save.stats.battlesWon}</p>
                        </div>
                        <div className="rounded-lg border border-border p-2">
                          <p className="text-xs text-muted-foreground">单次最远</p>
                          <p className="tabular-nums font-medium">{save.stats.bestCleared} 座营寨</p>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {SAGA_CHAPTERS.map((row) => {
                          const cleared = row.index < save.chapter;
                          const current = !finished && row.index === save.chapter;
                          return (
                            <div
                              key={row.index}
                              className={cn(
                                "flex items-center justify-between rounded border px-2 py-1.5 text-xs",
                                current ? "border-primary/60 bg-primary/5" : "border-border",
                              )}
                            >
                              <span>
                                {cleared || current ? `${row.town} · ${row.name}` : "？？？"}
                              </span>
                              <span className="text-muted-foreground">
                                {cleared ? "已定" : current ? "剧情进行中" : "未至"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <PartyList save={save} rules={uiRules} />
                    </div>
                  ) : (
                    <DexGrid save={save} gearById={gearById} rules={uiRules} />
                  )}
                </div>
              ) : null}

              {panel === "forge" || panel === "herb" ? (
                <div className="space-y-3">
                  <NpcIntro npcId={panel === "forge" ? "blacksmith" : "herbalist"} />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>城内买卖一律用活动券，金币在钱庄可存成 tcr，也可直接换成活动券。</span>
                    <span className="flex items-center gap-1">
                      <CouponIcon kind="trial" className="h-3.5 w-3.5" />
                      {tickets} 张
                    </span>
                  </div>
                  {panel === "forge" ? (
                    <div className="flex flex-wrap gap-1.5">
                      {([
                        ["weapon", "兵器"],
                        ["armor", "甲胄"],
                        ["gear", "盔带"],
                        ["mount", "马市"],
                      ] as const).map(([id, label]) => (
                        <Button
                          key={id}
                          size="sm"
                          variant={shopTab === id ? "primary" : "outline"}
                          onClick={() => setShopTab(id)}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {shopItems.map((item) => {
                      const price = item.priceTickets;
                      const owned =
                        item.kind === "consumable"
                          ? [...save.party, ...save.reserve].reduce(
                              (sum, member) => sum + (member.items?.[item.id] ?? 0),
                              0,
                            ) + (save.bag[item.id] ?? 0)
                          : save.gear[item.id] ?? 0;
                      return (
                        <div key={item.id} className="rounded-lg border border-border p-2.5">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">
                              {item.kind === "weapon" && item.quality !== undefined
                                ? `${SAGA_WEAPON_QUALITY_LABEL[item.quality]}·`
                                : ""}
                              {item.name}
                            </span>
                            <span className="flex items-center gap-1 tabular-nums text-muted-foreground">
                              <CouponIcon kind="trial" className="h-3 w-3" />
                              {price} 张
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">{item.desc} · 持有 {owned}</p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-1.5"
                            disabled={!run || tickets < price || Boolean(busy)}
                            onClick={() => void buyItem(item.id)}
                          >
                            {busy === `buy:${item.id}` ? "购买中…" : "用券购买"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                  {panel === "forge" ? (
                    <div className="space-y-2 border-t border-border pt-3">
                      <p className="text-xs text-muted-foreground">
                        强化先选人：只给这名武将身上的兵器、甲胄与护具升级，换将卸装都不掉级。
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {[...save.party, ...save.reserve].slice(0, 12).map((member) => (
                          <Button
                            key={member.id}
                            size="sm"
                            variant={forgeOwner === member.id ? "primary" : "outline"}
                            onClick={() => setForgeOwner(member.id)}
                          >
                            {generalName(member.id)}
                          </Button>
                        ))}
                      </div>
                      {forgeGearIds.length === 0 ? (
                        <p className="rounded-lg border border-border p-2 text-xs text-muted-foreground">
                          先备一件兵器或甲胄，再来铁匠铺开炉。
                        </p>
                      ) : (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {forgeGearIds.map((gearId) => {
                            const level = gearLevel(save, gearId);
                            const maxed = level >= SAGA_FORGE_MAX_LEVEL;
                            const cost = forgeCost(gearId, level);
                            const stat = forgeStat(gearId, level);
                            const nextStat = maxed ? stat : forgeStat(gearId, level + 1);
                            const working = busy === `forge:${gearId}`;
                            return (
                              <div key={gearId} className="rounded-lg border border-border p-2.5">
                                <div className="flex items-center justify-between text-sm">
                                  <span className="font-medium">
                                    {itemName(gearId)}
                                    <span className="ml-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                                      +{level}
                                    </span>
                                  </span>
                                  <span className="text-xs tabular-nums text-muted-foreground">
                                    {SAGA_ITEM_BY_ID.get(gearId)?.kind === "weapon" ? "攻" : "防"} {stat}
                                    {maxed ? "" : ` → ${nextStat}`}
                                  </span>
                                </div>
                                <div className="mt-1.5 flex items-center justify-between gap-2">
                                  <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                                    {maxed ? (
                                      "已满级"
                                    ) : (
                                      <>
                                        <CouponIcon kind="trial" className="h-3 w-3" />
                                        {cost} 张
                                      </>
                                    )}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={!run || maxed || tickets < cost || Boolean(busy)}
                                    onClick={() => void forgeGear(gearId)}
                                  >
                                    {maxed ? "满级" : working ? "强化中…" : "强化"}
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {Object.keys(save.gear).length > 0 ? (
                        <div className="space-y-1.5 border-t border-border pt-2">
                          <p className="text-xs text-muted-foreground">
                            折价卖出：按原价一半折成金币，不合手的兵器也能卖回武库。
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(save.gear).map(([gearId, count]) => (
                              <Button
                                key={gearId}
                                size="sm"
                                variant="outline"
                                disabled={Boolean(busy)}
                                onClick={() => sellInventoryItem(gearId)}
                              >
                                卖 {itemName(gearId)} ×{count}
                              </Button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    买入的装备进武库穿戴；伤药、招魂丹按武将随身携带，每人最多 {SAGA_CARRY_LIMIT} 种，可在物品栏与战斗中使用。
                  </p>
                </div>
              ) : null}

              {panel === "supply" ? (
                <div className="space-y-3">
                  <NpcIntro npcId="quartermaster" />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>用活动券购买，只在这次行军中生效；被动军需每次限一份。</span>
                    <span className="flex items-center gap-1">
                      <CouponIcon kind="trial" className="h-3.5 w-3.5" />
                      {tickets} 张
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {SAGA_ITEMS.filter(
                      (item) =>
                        (item.kind === "supply" || (item.kind === "consumable" && Boolean(item.revive)))
                        && (item.chapter ?? 0) <= save.chapter,
                    ).map((item) => {
                      const bought = run?.purchases.filter((purchase) => purchase.itemId === item.id) ?? [];
                      const passive = item.kind === "supply" && item.supply !== "heal" && item.supply !== "revive";
                      const maxed = passive && bought.length > 0;
                      return (
                        <div key={item.id} className="rounded-lg border border-border p-2.5">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{item.name}</span>
                            <span className="flex items-center gap-1 tabular-nums text-muted-foreground">
                              <CouponIcon kind="trial" className="h-3 w-3" />
                              {item.priceTickets} 张
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {item.desc} · 已购 {bought.length}
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-1.5"
                            disabled={maxed || tickets < item.priceTickets || Boolean(busy)}
                            onClick={() => void buyItem(item.id)}
                          >
                            {maxed ? "此行已备" : busy === `buy:${item.id}` ? "购买中…" : "用券购买"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    购买从下一步行动开始生效：兵力 / 攻击 / 速度 / 计策点加成立刻反映在下一场战斗，秘药与兵符会加入战斗道具栏。
                  </p>
                </div>
              ) : null}

              {panel === "bank" ? (
                <div className="space-y-3">
                  <NpcIntro npcId="banker" />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>钱庄两桩生意：金币存成 tcr 等平定到账，也可以直接换成活动券当场用。</span>
                    <span className="flex items-center gap-1 tabular-nums">
                      <Coins className="h-3.5 w-3.5 text-amber-500" />
                      {formatCredits(save.gold)} 金
                    </span>
                  </div>

                  <section className="space-y-2 rounded-lg border border-border p-2.5">
                    <p className="text-sm font-medium">金币 → tcr</p>
                    <p className="text-xs text-muted-foreground">
                      每 {bank.goldPerTcr} 金换 1 tcr（按整档收），平定此地自动结算时折成 tcr 进钱包；
                      每次行军最多存 {bank.maxGoldPerRun} 金，本次还可存 {bankRoom} 金。
                    </p>
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                        存入金币
                        <Input
                          type="number"
                          min={0}
                          step={bank.goldPerTcr}
                          value={depositGold}
                          onChange={(event) => setDepositGold(event.target.value)}
                          className="w-32 tabular-nums"
                        />
                      </label>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          !run ||
                          depositTcr < 1 ||
                          depositGoldAmount > bankRoom ||
                          save.gold < depositGoldAmount ||
                          Boolean(busy)
                        }
                        onClick={() => bankGold(depositGoldAmount)}
                      >
                        {depositTcr < 1
                          ? `至少存 ${bank.goldPerTcr} 金`
                          : `存 ${depositGoldAmount} 金 → ${depositTcr} tcr`}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!run || Math.min(save.gold, bankRoom) < bank.goldPerTcr}
                        onClick={() =>
                          setDepositGold(String(Math.floor(Math.min(save.gold, bankRoom) / bank.goldPerTcr) * bank.goldPerTcr))
                        }
                      >
                        全部
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      本次已存 {bankedGold} 金，平定此地可得 {bankTcr} tcr。
                    </p>
                  </section>

                  <section className="space-y-2 rounded-lg border border-border p-2.5">
                    <p className="flex items-center justify-between gap-2 text-sm font-medium">
                      <span>金币 → 活动券</span>
                      <span className="flex items-center gap-1 text-xs font-normal tabular-nums text-muted-foreground">
                        <CouponIcon kind="trial" className="h-3.5 w-3.5" />
                        {tickets} 张
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {goldPerTicket > 0
                        ? `每 ${goldPerTicket} 金换 1 张 ${props.coupon.couponName}，兑换后立刻到账，本趟行军就能在城里花。`
                        : "当前活动未开放金币换券。"}
                      {exchangedTickets > 0 ? `本次已换 ${exchangedTickets} 张。` : ""}
                    </p>
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                        兑换张数
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          value={exchangeTickets}
                          onChange={(event) => setExchangeTickets(event.target.value)}
                          className="w-32 tabular-nums"
                        />
                      </label>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          !run ||
                          goldPerTicket <= 0 ||
                          exchangeCount < 1 ||
                          exchangeCost > save.gold ||
                          Boolean(busy)
                        }
                        onClick={() => void exchangeCoupons(exchangeCount)}
                      >
                        {busy === "bank:coupon"
                          ? "兑换中…"
                          : exchangeCount < 1
                            ? "至少换 1 张"
                            : `换 ${exchangeCount} 张（${exchangeCost} 金）`}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!run || goldPerTicket <= 0 || exchangeMax < 1 || Boolean(busy)}
                        onClick={() => setExchangeTickets(String(exchangeMax))}
                      >
                        全部
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {exchangeMax > 0
                        ? `现有金币最多换 ${exchangeMax} 张；兑换不限量，打完仗再来换也行。`
                        : `金币不足 ${goldPerTicket} 金，打几仗再来。`}
                    </p>
                  </section>

                  <p className="text-xs text-muted-foreground">
                    金币存成 tcr 在平定此地时结算；换成活动券则立刻到账，用来买装备、伤药、军需、住店或训练。
                  </p>
                </div>
              ) : null}

              {panel === "inn" ? (
                <div className="space-y-3">
                  <NpcIntro npcId="innkeeper" />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      每天前 {SAGA_FREE_INN_PER_DAY} 次免费，住下就把上阵武将的兵力补满；用完后每次{" "}
                      {SAGA_INN_PRICE_TICKETS} 张活动券。
                    </span>
                    <span className="flex items-center gap-1 tabular-nums">
                      <CouponIcon kind="trial" className="h-3.5 w-3.5" />
                      今日 {innIsFree ? "免费" : `${SAGA_INN_PRICE_TICKETS} 张券`} · 余 {innFreeLeft} 次
                    </span>
                  </div>
                  <div className="space-y-2">
                    {troopRows.map((row) => {
                      const ratio = row.max > 0 ? row.current / row.max : 1;
                      return (
                        <div key={row.id} className="rounded-lg border border-border p-2.5 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{row.name}</span>
                            <span className="tabular-nums text-muted-foreground">
                              兵力 {row.current}/{row.max}
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded bg-muted">
                            <div
                              className={cn("h-full", ratio <= 0.35 ? "bg-red-500" : "bg-emerald-500")}
                              style={{ width: `${Math.round(ratio * 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <Button
                    size="sm"
                    disabled={innBlocked !== null || Boolean(busy)}
                    onClick={stayAtInn}
                  >
                    {busy === `buy:${SAGA_INN_ITEM_ID}` ? "住店中…" : innLabel}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    战斗只掉兵力、不会自己回满；住一次店能接着往下一处打。
                    兵败后也能住店：全队拉回满编、已破营寨不会回退，可以直接重整再战；
                    每一步都会自动存档，不存在中途收兵清空进度这回事。
                  </p>
                </div>
              ) : null}

              {panel === "hall" ? (
                <div className="space-y-3">
                  <NpcIntro npcId="drillmaster" />
                  <div className="flex gap-2">
                    <Button size="sm" variant={hallTab === "party" ? "primary" : "outline"} onClick={() => setHallTab("party")}>
                      编队
                    </Button>
                    <Button size="sm" variant={hallTab === "gear" ? "primary" : "outline"} onClick={() => setHallTab("gear")}>
                      装备
                    </Button>
                    <Button size="sm" variant={hallTab === "items" ? "primary" : "outline"} onClick={() => setHallTab("items")}>
                      物品
                    </Button>
                    <Button size="sm" variant={hallTab === "formation" ? "primary" : "outline"} onClick={() => setHallTab("formation")}>
                      阵型
                    </Button>
                  </div>

                  {hallTab === "party" ? (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        上阵 {save.party.length}/{SAGA_PARTY_SIZE} 人（每场前 {SAGA_DEPLOY_SIZE} 人出战，其余
                        2 人替补）、待命{" "}
                        {save.reserve.filter((row) => !save.party.some((p) => p.id === row.id)).length} 人。
                        点「移出」把在队武将放回待命席，点「上阵」把待命武将补进队伍；
                        阵亡只在战斗中发生，换人之后按满编算。
                      </p>
                      {(
                        [
                          { key: "party", label: "上阵", active: true, members: save.party },
                          {
                            key: "reserve",
                            label: "待命",
                            active: false,
                            members: save.reserve.filter(
                              (row) => !save.party.some((p) => p.id === row.id),
                            ),
                          },
                        ] as const
                      ).map((group) => (
                        <section key={group.key} className="space-y-1.5">
                          <p className="text-sm font-medium">
                            {group.label}
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                              {group.members.length} 人
                              {group.active ? ` · 最多 ${SAGA_PARTY_SIZE} 人` : ""}
                            </span>
                          </p>
                          {group.members.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              {group.active ? "还没有上阵武将。" : "待命席空着，招降或平定地方会有新武将进来。"}
                            </p>
                          ) : (
                            <div className="grid gap-2 sm:grid-cols-2">
                              {group.members.map((member, index) => {
                                const def = SAGA_GENERAL_BY_ID.get(member.id);
                                const stats = generalStats(member, save.gearLevels, uiRules);
                                const need =
                                  member.level >= uiMaxLevel
                                    ? 0
                                    : expToNext(member.level) - member.exp;
                                return (
                                  <div key={member.id} className="rounded-lg border border-border p-2.5 text-sm">
                                    <div className="flex gap-2.5">
                                      <SagaPortrait
                                        generalId={member.id}
                                        gear={{ weapon: member.weapon, armor: member.armor }}
                                        width={44}
                                        height={55}
                                      />
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="truncate font-medium">
                                            {def?.name ?? member.id}
                                            <span className="ml-1.5 text-xs text-muted-foreground">
                                              Lv{member.level}
                                            </span>
                                            {group.active ? (
                                              <span className="ml-1.5 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                                                {index < SAGA_DEPLOY_SIZE ? "出战" : "替补"}
                                              </span>
                                            ) : null}
                                          </span>
                                          <span className="flex shrink-0 items-center gap-1">
                                            {group.active ? (
                                              <>
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  disabled={index === 0}
                                                  title="在队伍里往前挪一位"
                                                  onClick={() => {
                                                    const ids = save.party.map((row) => row.id);
                                                    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
                                                    setActiveParty(ids);
                                                  }}
                                                >
                                                  上移
                                                </Button>
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  disabled={index >= save.party.length - 1}
                                                  title="在队伍里往后挪一位"
                                                  onClick={() => {
                                                    const ids = save.party.map((row) => row.id);
                                                    [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
                                                    setActiveParty(ids);
                                                  }}
                                                >
                                                  下移
                                                </Button>
                                              </>
                                            ) : null}
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              disabled={
                                                group.active
                                                  ? save.party.length <= 1
                                                  : save.party.length >= SAGA_PARTY_SIZE
                                              }
                                              onClick={() =>
                                                setActiveParty(
                                                  group.active
                                                    ? save.party
                                                        .filter((row) => row.id !== member.id)
                                                        .map((row) => row.id)
                                                    : [...save.party.map((row) => row.id), member.id],
                                                )
                                              }
                                            >
                                              {group.active ? "移出" : "上阵"}
                                            </Button>
                                          </span>
                                        </div>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                          武 {stats.force} · 智 {stats.intellect} · 速 {stats.speedTotal} ·
                                          攻 {stats.attack} · 防 {stats.defense} · SP {stats.spMax} · 兵力{" "}
                                          {stats.maxTroops}
                                        </p>
                                        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                                          命中 {Math.round(stats.hitRate * 100)}% · 暴击{" "}
                                          {Math.round(stats.critRate * 100)}% · 爆伤{" "}
                                          {stats.critDamage.toFixed(2)}×
                                        </p>
                                        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                                          经验 {member.exp}/{expToNext(member.level)}
                                          {member.level >= uiMaxLevel
                                            ? " · 已满级"
                                            : ` · 距下一级还差 ${Math.max(0, need)}`}
                                        </p>
                                        {def ? (
                                          <p className="mt-0.5 text-xs text-sky-200/80">
                                            兵器特性：{weaponProfileText(def)}
                                            <span className="ml-1 text-muted-foreground">（只能装备这一类兵器）</span>
                                          </p>
                                        ) : null}
                                        {(def?.traits?.length ?? 0) > 0 ? (
                                          <p className="mt-0.5 text-xs text-primary/90">
                                            {(def?.traits ?? [])
                                              .map((traitId) => {
                                                const trait = SAGA_TRAIT_BY_ID.get(traitId);
                                                return `${trait?.name ?? traitId}：${trait?.desc ?? ""}`;
                                              })
                                              .join("；")}
                                          </p>
                                        ) : null}
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                          {(
                                            [
                                              ["weapon", "兵器"],
                                              ["armor", "甲胄"],
                                              ["helmet", "盔"],
                                              ["belt", "带"],
                                              ["pendant", "坠"],
                                              ["boots", "靴"],
                                              ["mount", "马"],
                                            ] as const
                                          )
                                            .map(([slot, label]) =>
                                              member[slot] ? `${label} ${itemName(member[slot] as string)}` : "",
                                            )
                                            .filter(Boolean)
                                            .join(" · ") || "未着装备"}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </section>
                      ))}
                    </div>
                  ) : null}

                  {hallTab === "gear" ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        点击槽位从库存换装；换下的装备会回到库存。库存：{Object.entries(save.gear).length === 0 ? "空" : ""}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(save.gear).map(([id, count]) => (
                          <span key={id} className="rounded border border-border px-1.5 py-0.5 text-[11px]">
                            {itemName(id)} ×{count}
                          </span>
                        ))}
                      </div>
                      <div className="space-y-2">
                        {[...save.party, ...save.reserve].map((member) => (
                          <div key={member.id} className="rounded-lg border border-border p-2.5 text-sm">
                            <p className="font-medium">
                              {generalName(member.id)} <span className="text-xs text-muted-foreground">Lv{member.level}</span>
                              <span className="ml-1 text-[11px] text-sky-200/80">
                                兵器特性 {weaponProfileText(SAGA_GENERAL_BY_ID.get(member.id))}
                              </span>
                            </p>
                            <div className="mt-1 grid gap-2 sm:grid-cols-2">
                              {(
                                [
                                  ["weapon", "兵器"],
                                  ["armor", "甲胄"],
                                  ["helmet", "盔"],
                                  ["belt", "腰带"],
                                  ["pendant", "吊坠"],
                                  ["boots", "靴"],
                                  ["mount", "坐骑"],
                                ] as const
                              ).map(([slot, label]) => {
                                const worn = member[slot] ?? null;
                                const def = SAGA_GENERAL_BY_ID.get(member.id);
                                const options = SAGA_ITEMS.filter(
                                  (item) =>
                                    gearSlotOf(item) === slot &&
                                    (slot !== "weapon" ||
                                      !item.weaponType ||
                                      weaponTypesFor(def).includes(item.weaponType)),
                                );
                                return (
                                  <label key={slot} className="flex items-center gap-1.5 text-xs">
                                    <span className="w-8 shrink-0 text-muted-foreground">{label}</span>
                                    <select
                                      value={worn ?? ""}
                                      onChange={(event) => equipItem(member.id, slot, event.target.value || null)}
                                      className="min-w-0 flex-1 rounded border border-border bg-background px-1 py-1"
                                    >
                                      <option value="">无</option>
                                      {options.map((item) => {
                                        const available = worn === item.id || (save.gear[item.id] ?? 0) > 0;
                                        return (
                                          <option key={item.id} value={item.id} disabled={!available}>
                                            {item.name}
                                            {item.atk ? `（攻+${item.atk}）` : ""}
                                            {item.def ? `（防+${item.def}）` : ""}
                                            {item.speed ? `（速+${item.speed}）` : ""}
                                            {worn === item.id ? " · 已装备" : ""}
                                          </option>
                                        );
                                      })}
                                    </select>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {hallTab === "items" ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        每名武将随身最多 {SAGA_CARRY_LIMIT} 种道具，同种叠数量。阵亡后可用招魂丹救回，
                        回魂丹回得更多；用不上的可以舍弃或折价卖出。
                      </p>
                      {[...save.party, ...save.reserve].map((member) => {
                        const stats = generalStats(member, save.gearLevels, uiRules);
                        const current = Math.min(
                          stats.maxTroops,
                          state?.partyTroops[member.id] ?? member.troops ?? stats.maxTroops,
                        );
                        const spNow = Math.max(0, Math.min(stats.spMax, member.sp ?? stats.spMax));
                        const entries = Object.entries(member.items ?? {}).filter(([, count]) => count > 0);
                        return (
                          <div key={member.id} className="rounded-lg border border-border p-2.5 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">
                                {generalName(member.id)}
                                <span className="ml-1.5 text-xs text-muted-foreground">
                                  {carrySlots(member)}/{SAGA_CARRY_LIMIT} 种
                                </span>
                              </span>
                              <span className={cn("text-xs tabular-nums", current <= 0 ? "text-red-500" : "text-muted-foreground")}>
                                {current <= 0 ? "阵亡" : `兵力 ${current}/${stats.maxTroops}`}
                                {` · SP ${spNow}/${stats.spMax}`}
                              </span>
                            </div>
                            {entries.length === 0 ? (
                              <p className="mt-1 text-xs text-muted-foreground">身上没有道具。</p>
                            ) : (
                              <div className="mt-1.5 space-y-1">
                                {entries.map(([itemId, count]) => {
                                  const item = SAGA_ITEM_BY_ID.get(itemId);
                                  if (!item) return null;
                                  const healNow = item.heal
                                    ? Math.max(0, Math.min(item.heal, stats.maxTroops - current))
                                    : 0;
                                  return (
                                    <div key={itemId} className="flex flex-wrap items-center gap-1.5 text-xs">
                                      <span className="min-w-24 font-medium">
                                        {item.name} ×{count}
                                      </span>
                                      <span className="flex-1 text-muted-foreground">
                                        {item.heal
                                          ? `至多回复 ${item.heal} 兵力 · 现在可回 ${healNow}`
                                          : item.sp
                                            ? `至多回复 ${item.sp} SP · 现在可回 ${Math.min(item.sp, stats.spMax - spNow)}`
                                            : item.desc}
                                      </span>
                                      {item.revive ? (
                                        save.party
                                          .filter(
                                            (target) =>
                                              (state?.partyTroops[target.id] ?? target.troops ?? 1) <= 0,
                                          )
                                          .map((target) => (
                                            <Button
                                              key={`revive-${target.id}`}
                                              size="sm"
                                              variant="outline"
                                              onClick={() => applyInventoryItem(member.id, itemId, target.id)}
                                            >
                                              救 {generalName(target.id)}
                                            </Button>
                                          ))
                                      ) : null}
                                      {item.heal ? (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          disabled={current <= 0 || healNow <= 0}
                                          onClick={() => applyInventoryItem(member.id, itemId)}
                                        >
                                          {healNow > 0 ? `用 · 回 ${healNow}` : "已满"}
                                        </Button>
                                      ) : null}
                                      {item.sp ? (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          disabled={spNow >= stats.spMax}
                                          onClick={() => applyInventoryItem(member.id, itemId)}
                                        >
                                          {spNow < stats.spMax ? `用 · 回 ${Math.min(item.sp, stats.spMax - spNow)} SP` : "SP 已满"}
                                        </Button>
                                      ) : null}
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => dropInventoryItem(member.id, itemId)}
                                      >
                                        弃
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => sellInventoryItem(itemId, member.id)}
                                      >
                                        卖
                                      </Button>
                                      <select
                                        value=""
                                        aria-label={`把${item.name}转交他人`}
                                        onChange={(event) => {
                                          const to = event.target.value;
                                          event.target.value = "";
                                          if (to) giveInventoryItem(member.id, to, itemId);
                                        }}
                                        className="h-7 rounded border border-border bg-background px-1 text-[11px] text-muted-foreground"
                                      >
                                        <option value="">转交</option>
                                        {[...save.party, ...save.reserve]
                                          .filter((target) => target.id !== member.id)
                                          .map((target) => {
                                            const full =
                                              carrySlots(target) >= SAGA_CARRY_LIMIT &&
                                              !(target.items?.[itemId] ?? 0);
                                            return (
                                              <option key={target.id} value={target.id} disabled={full}>
                                                {generalName(target.id)}
                                              </option>
                                            );
                                          })}
                                      </select>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {hallTab === "formation" ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        军师：{save.party
                          .map((member) => SAGA_GENERAL_BY_ID.get(member.id))
                          .filter((member): member is NonNullable<typeof member> => Boolean(member))
                          .sort((a, b) => b.intellect - a.intellect)[0]?.name ?? "—"}
                        （队中智力最高者出任；两人败退则阵势自动散开）
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {SAGA_FORMATIONS.filter((formation) => !formation.legacy).map((formation) => {
                        const active = save.formation === formation.id;
                        const beats = SAGA_FORMATIONS.find((row) => row.id === formation.beats)?.name ?? "";
                        const topLevel = save.party.reduce((top, member) => Math.max(top, member.level), 0);
                        const locked = topLevel < formation.level;
                        return (
                          <button
                            key={formation.id}
                            type="button"
                            disabled={locked}
                            onClick={() => setFormation(formation.id)}
                            className={cn(
                              "rounded-lg border p-2.5 text-left text-sm",
                              active ? "border-primary/70 bg-primary/5" : "border-border hover:border-primary/40",
                              locked && "cursor-not-allowed opacity-45",
                            )}
                          >
                            <span className="flex items-center justify-between font-medium">
                              {formation.name}
                              {active ? (
                                <span className="text-[11px] text-primary">当前</span>
                              ) : locked ? (
                                <span className="text-[11px] text-muted-foreground">Lv{formation.level} 解锁</span>
                              ) : null}
                            </span>
                            <p className="mt-0.5 text-xs text-muted-foreground">{formation.desc}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              克制 {beats} · 变阵耗策略 {formation.cost}
                            </p>
                          </button>
                        );
                      })}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {panel === "train" ? (
                <div className="space-y-3">
                  <NpcIntro npcId="trainer" />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      每级 {SAGA_TRAINING_TICKETS_PER_LEVEL} 张活动券，一次练到目标等级；
                      训练场上限 {trainingLevelCap(save, uiRules)} 级（每平定一处地方 +6，最高 {uiMaxLevel} 级）。
                    </span>
                    <span className="flex items-center gap-1 tabular-nums">
                      <CouponIcon kind="trial" className="h-3.5 w-3.5" />
                      {tickets} 张
                    </span>
                  </div>
                  {!run ? (
                    <p className="rounded-lg border border-border p-2 text-xs text-muted-foreground">
                      出城之后才能带着队伍来训练场练级。
                    </p>
                  ) : null}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[...save.party, ...save.reserve].map((member) => {
                      const def = SAGA_GENERAL_BY_ID.get(member.id);
                      const cap = trainingLevelCap(save, uiRules);
                      const target = Math.trunc(Number(trainTargets[member.id] ?? member.level + 1) || 0);
                      const targetValid = target > member.level && target <= cap;
                      const cost = targetValid ? trainingCost(member.level, target) : 0;
                      const training = busy === `train:${member.id}`;
                      return (
                        <div key={member.id} className="rounded-lg border border-border p-2.5 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">
                              {def?.name ?? member.id}{" "}
                              <span className="text-xs text-muted-foreground">Lv{member.level}</span>
                            </span>
                            <span className="text-[11px] text-muted-foreground">上限 Lv{cap}</span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="text-muted-foreground">练到</span>
                            <Input
                              type="number"
                              min={member.level + 1}
                              max={cap}
                              value={trainTargets[member.id] ?? String(member.level + 1)}
                              onChange={(event) =>
                                setTrainTargets((prev) => ({ ...prev, [member.id]: event.target.value }))
                              }
                              className="h-7 w-16 tabular-nums"
                            />
                            <span className="text-muted-foreground">级 ·</span>
                            <span className="flex items-center gap-1 tabular-nums text-muted-foreground">
                              <CouponIcon kind="trial" className="h-3 w-3" />
                              {targetValid ? `${cost} 张` : "—"}
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!run || !targetValid || tickets < cost || Boolean(busy)}
                              onClick={() => void trainTo(member.id, member.level)}
                            >
                              {training ? "训练中…" : "训练"}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    升级会涨兵力与四维，计策点上限也跟着提高；智将到达特定等级会自行领悟新的计策。
                    训练扣的券立刻到账，刷新页面也不会重复扣。
                  </p>
                </div>
              ) : null}

              {panel === "coupon" ? (
                <div className="space-y-3">
                  <NpcIntro npcId="couponkeeper" />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>兑换活动券或买珍宝礼包，到账后右上角的活动券数量实时刷新。</span>
                    <span className="flex items-center gap-1 tabular-nums">
                      <CouponIcon kind="trial" className="h-3.5 w-3.5" />
                      {props.coupon.tickets} 张
                    </span>
                  </div>
                  <CouponShop activities={[props.coupon]} />
                  <p className="text-xs text-muted-foreground">
                    活动券是城里的唯一通货：铁匠铺、药铺、军需帐、客栈、训练场与活动券礼包都以券计价。
                  </p>
                </div>
              ) : null}

              {panel === "status" ? (
                <StatusPanel save={save} state={state} rules={uiRules} />
              ) : null}

              {panel === "strategy" ? (
                <StrategyPanel
                  save={save}
                  state={state}
                  rules={uiRules}
                  onCast={(generalId, tacticId) =>
                    appendCommand({ k: "tactic", g: generalId, t: tacticId })
                  }
                />
              ) : null}

              {panel === "tavern" ? (
                <div className="space-y-3">
                  <SceneCanvas backdrop="tavern" height={230} className="rounded-lg border border-border" />
                  <NpcIntro npcId="tavernkeeper" />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setDialogue(tavernScene(chapter.index))}>
                      <ScrollText className="h-3.5 w-3.5" />
                      听一段旧事
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setInTown(false)}>
                      <Swords className="h-3.5 w-3.5" />
                      出城行军
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    说书人讲的是本地的旧事，听一段不花券，也不影响行军。
                  </p>
                </div>
              ) : null}

              {panel === "tent" ? (
                <div className="space-y-3">
                  <SceneCanvas backdrop="tent" height={230} className="rounded-lg border border-border" />
                  <NpcIntro npcId="tentkeeper" />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        setDialogue(councilScene(chapter.index, save.party.map((member) => member.id)))
                      }
                    >
                      <Users className="h-3.5 w-3.5" />
                      召集众将议事
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setPanel("army")}>
                      <Flag className="h-3.5 w-3.5" />
                      军情
                    </Button>
                  </div>
                  <div>
                    <p className="mb-1.5 text-sm font-medium">上阵武将</p>
                    <PartyStrip members={save.party} />
                  </div>
                </div>
              ) : null}

              {panel === "camp" ? (
                <CampPanel
                  run={run}
                  state={state}
                  node={campNode}
                  onBattle={beginBattle}
                  onAuto={autoBattle}
                  onClose={() => setPanel(null)}
                  onCity={() => enterTown()}
                  onInn={goInn}
                  onTalk={() => {
                    const node = campNode === null ? null : run?.nodes[campNode] ?? null;
                    if (run && node) {
                      setDialogue(campScene(run.startSave.chapter, node, node.enemies[0]?.id));
                    }
                  }}
                />
              ) : null}

              {panel === "site" && site ? (
                <SettlementBoard
                  site={site}
                  line={siteLine}
                  onTalk={(npc) => setSiteLine(`${npc.name}：${npc.line}`)}
                  onFacility={(id) => setPanel(id)}
                  onClose={() => {
                    setPanel(null);
                    setSite(null);
                    setSiteLine(null);
                  }}
                />
              ) : null}

              {panel === "cave" && caveName ? (
                <CaveBoard
                  name={caveName}
                  chapter={run?.startSave.chapter ?? props.save.chapter}
                  seed={run?.seed ?? 0}
                  looted={state?.lootedChests ?? []}
                  onLoot={(chest, item, qty) => appendCommand({ k: "loot", chest, item, qty })}
                  onClose={() => {
                    setPanel(null);
                    setCaveName(null);
                  }}
                />
              ) : null}

              {panel === "army" ? (
                <ArmyPanel
                  run={run}
                  state={state}
                  field={field}
                  onClose={() => setPanel(null)}
                  onCity={() => enterTown()}
                  onInn={goInn}
                  onSite={(kind, chapterIndex, name) => {
                    setSite(
                      settlementFor({
                        kind,
                        name,
                        chapter: chapterIndex,
                        seed: run?.seed ?? 0,
                      }),
                    );
                    setSiteLine(null);
                    setInTown(false);
                    setPanel("site");
                  }}
                />
              ) : null}
            </div>
          </div>
        ) : null}

        {banner ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center px-3 pt-3">
            <div
              className={cn(
                "trial-banner-in pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border px-3 py-2.5 shadow-2xl backdrop-blur",
                banner.kind === "won"
                  ? "border-amber-400/45 bg-[#1d160c]/95"
                  : "border-rose-500/40 bg-[#1a1010]/95",
              )}
            >
              <span
                className={cn(
                  "trial-seal-drop flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border-2 text-2xl font-semibold",
                  banner.kind === "won"
                    ? "border-amber-300/80 bg-amber-400/15 text-amber-200"
                    : "border-rose-400/70 bg-rose-500/15 text-rose-200",
                )}
                style={{ fontFamily: '"Noto Serif SC", "Songti SC", "STSong", serif' }}
              >
                {banner.kind === "won" ? "捷" : "败"}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "truncate text-sm font-semibold",
                    banner.kind === "won" ? "text-amber-100" : "text-rose-100",
                  )}
                >
                  {banner.kind === "won" ? "战斗胜利" : "战斗失利"} · {banner.name}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                  {banner.kind === "won" ? (
                    <>
                      <span className="rounded border border-amber-300/30 bg-amber-300/10 px-1.5 py-0.5 tabular-nums text-amber-200">
                        +{formatCredits(banner.gold)} 金
                      </span>
                      <span className="rounded border border-sky-300/25 bg-sky-300/10 px-1.5 py-0.5 tabular-nums text-sky-200">
                        +{banner.exp} 经验
                      </span>
                    </>
                  ) : (
                    <span className="text-rose-200/80">全灭会在就近客栈醒来，其余败退回城</span>
                  )}
                </div>
                {banner.learned && banner.learned.length > 0 ? (
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-amber-200/85">
                    {banner.learned.join(" · ")}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setBanner(null)}
                className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}

        {coverOpen && !settlement ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm sm:absolute sm:z-20">
            <div className="max-h-full w-full max-w-xl overflow-y-auto overscroll-contain rounded-xl border border-amber-700/45 bg-[#120f0a] shadow-2xl">
              <div className="relative">
                <SceneCanvas backdrop="field" height={150} className="rounded-t-xl opacity-90" />
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-black/60 via-black/45 to-[#120f0a] text-center">
                  <p className="text-[10px] uppercase tracking-[0.5em] text-amber-200/60">SANGUO TRIAL</p>
                  <h2
                    className="mt-1 text-3xl font-semibold tracking-[0.25em] text-amber-100"
                    style={{ fontFamily: '"Noto Serif SC", "Songti SC", "STSong", serif' }}
                  >
                    三国讨逆传
                  </h2>
                  <p className="mt-1.5 text-xs text-amber-200/70">
                    {chapter.town} · {chapter.name}
                  </p>
                </div>
              </div>
              <div className="space-y-3 p-5">
                <p className="text-sm text-muted-foreground">{chapter.blurb}</p>
                {finished ? (
                  <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-xs">
                    <p className="text-sm font-medium">全剧终</p>
                    <p className="mt-1 text-muted-foreground">
                      八处地方皆定，讨逆之路已经走完。武将、图鉴与战史都留在存档里，
                      可去档案商店把金币结算成 tcr 收个尾。
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1 border-l-2 border-primary/40 pl-2 text-xs text-muted-foreground">
                      {chapter.story.map((line) => (
                        <p key={line}>{line}</p>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      行军一线：{chapter.stages.join(" · ")}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className={HUD_CELL}>{save.party.length} 将上阵</span>
                      <span className={HUD_CELL}>{formatCredits(save.gold)} 金</span>
                      <span className={HUD_CELL}>战力 {partyPower(save)}</span>
                      <span className={HUD_CELL}>{tickets} 张活动券</span>
                    </div>
                  </>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    onClick={() => void startRun()}
                    disabled={busy === "start" || saveExists}
                    title={saveExists ? "已有存档：要重新开始，先在档案商店结算清空存档" : undefined}
                  >
                    <Swords className="h-4 w-4" />
                    {busy === "start" ? "出发中…" : "新的征途"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (run) {
                        setCoverOpen(false);
                        return;
                      }
                      void startRun();
                    }}
                    disabled={busy === "start" || !saveExists}
                  >
                    <ScrollText className="h-4 w-4" />
                    {busy === "start" ? "读取中…" : "继续游戏"}
                  </Button>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {saveExists
                    ? "已有存档：「继续游戏」接着走当前剧情；要重新开始，先去档案商店把金币结算成 tcr、清空存档。"
                    : "还没有存档：「继续游戏」要等有存档后才能用；点「新的征途」从桃园出发。"}
                </p>
                <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
                  <Button variant="ghost" size="sm" onClick={() => setPanel("archive")}>
                    <Coins className="h-3.5 w-3.5" />
                    档案商店
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setPanel("record")}>
                    <ScrollText className="h-3.5 w-3.5" />
                    存档与图鉴
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {settlement ? (
          <SettlementCard
            settlement={settlement}
            busy={busy}
            onContinue={() => void startRun()}
            onClose={() => {
              setSettlement(null);
              setRun(null);
              setCommands([]);
              setInTown(false);
              setVisitedPois([]);
              setSeenScenes([]);
              setCoverOpen(true);
              router.refresh();
            }}
          />
        ) : null}

        {dialogue ? (
          <DialogueOverlay
            key={dialogue.id}
            scene={dialogue}
            onClose={() => setDialogue(null)}
            gearById={gearById}
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={Boolean(battle) || Boolean(settlement) || !run}
          onClick={() => {
            if (inTown) {
              setPanel(null);
              setInTown(false);
              return;
            }
            enterTown();
          }}
        >
          {inTown ? <Swords className="h-3.5 w-3.5" /> : <Home className="h-3.5 w-3.5" />}
          {inTown ? "出城行军" : "回城整备"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={Boolean(battle) || Boolean(settlement) || !run}
          onClick={() => {
            setInTown(false);
            setPanel("army");
          }}
        >
          <Flag className="h-3.5 w-3.5" />
          军情
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={Boolean(battle) || Boolean(settlement)}
          onClick={() => {
            setInTown(false);
            setPanel("archive");
          }}
        >
          <Coins className="h-3.5 w-3.5" />
          档案
        </Button>
        {!inTown && run ? (
          <>
            <Button variant="outline" size="sm" disabled={Boolean(battle) || Boolean(settlement)} onClick={fieldTalk}>
              <MessageSquare className="h-3.5 w-3.5" />
              谈话
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={Boolean(battle) || Boolean(settlement)}
              onClick={investigateField}
            >
              <Search className="h-3.5 w-3.5" />
              调查
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={Boolean(battle) || Boolean(settlement)}
              onClick={() => {
                setHallTab("party");
                setInTown(false);
                setPanel("hall");
              }}
            >
              <Users className="h-3.5 w-3.5" />
              队伍 / 调整
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={Boolean(battle) || Boolean(settlement)}
              onClick={() => {
                setInTown(false);
                setPanel("status");
              }}
            >
              <ScrollText className="h-3.5 w-3.5" />
              武将详情 / 部将
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={Boolean(battle) || Boolean(settlement)}
              onClick={() => {
                setHallTab("items");
                setInTown(false);
                setPanel("hall");
              }}
            >
              <Package className="h-3.5 w-3.5" />
              物品 / 装备
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={Boolean(battle) || Boolean(settlement)}
              onClick={() => {
                setInTown(false);
                setPanel("strategy");
              }}
            >
              <Wand2 className="h-3.5 w-3.5" />
              谋略
            </Button>
          </>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          disabled={Boolean(battle) || Boolean(settlement) || !run}
          onClick={() => {
            setInTown(false);
            setPanel("dex");
          }}
        >
          <ScrollText className="h-3.5 w-3.5" />
          图鉴
        </Button>
        <Button variant="outline" size="sm" onClick={openNotice}>
          <Bell className="h-3.5 w-3.5" />
          公告
          {noticeUnread ? (
            <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-red-500" aria-label="有未读公告" />
          ) : null}
        </Button>
      </div>

      <p className="max-w-3xl text-xs text-muted-foreground">
        操作：方向键 / WASD 四向行走，走到城门口、敌营或乡野点位旁按回车交互；
        也可以直接点击地图上的城池、营寨、村庄与渡口。点城池走进城中街道，在街上四向走动，
        走到铺子 / 皇宫门口会自动进门，柜台前按回车与掌柜说话、办正事；皇宫里可以面见主公议事；从城门出城。
        战斗为回合制：逐将选择攻击 / 计策 / 防守 / 道具，或按「总攻击」「自动战斗」速战；胜后可礼聘归降。
        野外草地、树林会随机遇敌，敌军编成由种子与第几场遭遇推出。
        走位本身不影响任何数值：战报只上传编制、购物与「打哪座营、打不打这场遭遇、怎么打」的指令，
        服务端按种子重放判定；战斗指令存在本机，刷新页面可以接着打。剧情对话、军令与走访记录只在本机，
        不参与结算。
      </p>
    </div>
  );
}

/** 野外点空地翻出来的行囊页：武将状态、道具、装备与队伍一屏看完。 */
function StrategyPanel({
  save,
  state,
  rules,
  onCast,
}: {
  save: TrialSave;
  state: SagaReplayState | null;
  rules: number;
  onCast: (generalId: string, tacticId: string) => void;
}) {
  const used = state?.fieldTacticsUsed ?? 0;
  const left = Math.max(0, 3 - used);
  const rows: {
    member: TrialSave["party"][number];
    tactics: string[];
    sp: number;
    spMax: number;
  }[] = [];
  for (const member of save.party) {
    const def = SAGA_GENERAL_BY_ID.get(member.id);
    if (!def) continue;
    const stats = generalStats(member, save.gearLevels, rules);
    const sp = Math.max(0, Math.min(stats.spMax, member.sp ?? stats.spMax));
    const tactics = (tacticsFor(def, member.level) as string[]).filter((id) => {
      const tactic = SAGA_TACTICS.find((row) => row.id === id);
      return tactic?.kind === "heal" || tactic?.kind === "healAll";
    });
    if (tactics.length > 0) rows.push({ member, tactics, sp, spMax: stats.spMax });
  }
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-lg border border-border p-3">
        <p className="font-medium">行军途中的回复之计</p>
        <p className="mt-1 text-xs text-muted-foreground">
          非战斗时可直接施展已学会的回复计，每趟行军最多 3 次，并按计策消耗扣当前 SP；
          本趟已用 {used} 次，还剩 {left} 次。SP 只靠住店、回气道具或战斗内防御回复。
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">队中还没有人学会回复计，升到相应等级后会自动领悟。</p>
      ) : (
        <div className="space-y-2">
          {rows.map(({ member, tactics, sp, spMax }) => (
            <div key={member.id} className="rounded-lg border border-border p-2.5">
              <p className="font-medium">
                {generalName(member.id)} <span className="text-xs text-muted-foreground">Lv{member.level}</span>
                <span className="ml-1 text-[11px] tabular-nums text-sky-200/80">SP {sp}/{spMax}</span>
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {tactics.map((id) => {
                  const tactic = SAGA_TACTICS.find((row) => row.id === id);
                  if (!tactic) return null;
                  const shortSp = sp < tactic.cost;
                  return (
                    <Button
                      key={id}
                      size="sm"
                      variant="outline"
                      disabled={left <= 0 || shortSp}
                      title={`${tactic.desc}（耗 SP ${tactic.cost}）`}
                      onClick={() => onCast(member.id, id)}
                    >
                      {tactic.name} · 回兵 <span className="ml-1 text-[10px] text-muted-foreground">{tactic.cost} SP</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        非战斗施计与战斗共用同一份 SP；SP 用完只能住店补满、使用醒神散 / 聚气丹，或在战斗里选择防御回气。
      </p>
    </div>
  );
}

function StatusPanel({
  save,
  state,
  rules,
}: {
  save: TrialSave;
  state: SagaReplayState | null;
  rules: number;
}) {
  const items = state ? availableItems(state) : [];
  const gearRows = Object.entries(save.gear).filter(([, count]) => count > 0);
  const formation = SAGA_FORMATIONS.find((row) => row.id === save.formation);
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-xs text-muted-foreground">
        <span>
          阵型 {formation?.name ?? "未定"} · 上阵 {save.party.length} 人 · 后备 {save.reserve.length} 人
        </span>
        <span>点这里只是翻看；换人换装回城后到编成所办理。</span>
      </div>

      <section className="space-y-2">
        <p className="text-sm font-medium">上阵武将</p>
        <StatusRoster members={save.party} active state={state} rules={rules} gearLevels={save.gearLevels} />
      </section>

      {save.reserve.filter((row) => !save.party.some((p) => p.id === row.id)).length > 0 ? (
        <p className="text-xs text-muted-foreground">
          另有 {save.reserve.length} 名武将在待命席，军中一览不再展开；回城进编成所可以看详情、换人。
        </p>
      ) : null}

      <section className="space-y-1.5">
        <p className="text-sm font-medium">行囊道具</p>
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">行囊里没有伤药，药铺有金疮药与大还丹。</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {items.map((item) => (
              <span key={item.id} className="rounded border border-border px-2 py-0.5 text-xs">
                {item.name} ×{item.count}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-1.5">
        <p className="text-sm font-medium">装备库存</p>
        {gearRows.length === 0 ? (
          <p className="text-xs text-muted-foreground">库里没有空闲装备，铁匠铺可以现打。</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {gearRows.map(([id, count]) => (
              <span key={id} className="rounded border border-border px-2 py-0.5 text-xs">
                {itemName(id)} ×{count}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-1.5">
        <p className="text-sm font-medium">
          队伍
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
            上阵 {save.party.length}/{SAGA_PARTY_SIZE} 人
          </span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {save.party.map((member) => (
            <span
              key={member.id}
              className="rounded border border-primary/50 bg-primary/5 px-2 py-0.5 text-xs"
            >
              {generalName(member.id)} Lv{member.level}
            </span>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          待命 {save.reserve.length} 人 · 其余招降与来投的武将都在待命席，回城进编成所看详情、办入队出队。
        </p>
      </section>
    </div>
  );
}

function StatusRoster({
  members,
  active,
  state,
  rules,
  gearLevels,
}: {
  members: TrialSave["party"];
  active: boolean;
  state: SagaReplayState | null;
  rules: number;
  gearLevels: Record<string, number>;
}) {
  const maxLevel = sagaMaxLevel(rules);
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {members.map((member) => {
        const def = SAGA_GENERAL_BY_ID.get(member.id);
        const stats = generalStats(member, gearLevels, rules);
        const max = Math.max(1, Math.round(stats.maxTroops * (1 + (state?.buffs.troopPct ?? 0) / 100)));
        const current = Math.min(max, state?.partyTroops[member.id] ?? max);
        const ratio = max > 0 ? current / max : 1;
        const tactics = def ? (rules >= 2 ? tacticsFor(def, member.level) : def.tactics) : [];
        return (
          <div key={member.id} className="rounded-lg border border-border p-2.5 text-sm">
            <div className="flex gap-2.5">
              <SagaPortrait
                generalId={member.id}
                gear={{ weapon: member.weapon, armor: member.armor }}
                width={56}
                height={70}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {def?.name ?? member.id}
                    <span className="ml-1.5 text-xs text-muted-foreground">Lv{member.level}</span>
                  </span>
                  <span className="text-[11px] text-muted-foreground">{active ? "上阵" : "后备"}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  武 {stats.force} · 智 {stats.intellect} · 防 {stats.defense} · 速 {stats.speedTotal} · 攻 {stats.attack}
                </p>
                <div className="mt-1 h-1.5 overflow-hidden rounded bg-muted">
                  <div
                    className={cn("h-full", ratio <= 0.35 ? "bg-red-500" : "bg-emerald-500")}
                    style={{ width: `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%` }}
                  />
                </div>
                <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                  兵力 {current}/{max} · 经验 {member.exp}/{expToNext(member.level)}
                  {member.level >= maxLevel
                    ? " · 已满级"
                    : ` · 距下一级还差 ${Math.max(0, expToNext(member.level) - member.exp)}`}
                </p>
                {def ? (
                  <p className="mt-0.5 text-[11px] text-sky-200/80">
                    兵器特性 <span className="text-primary">{weaponProfileText(def)}</span>
                  </p>
                ) : null}
                {rules >= 2 && (def?.traits?.length ?? 0) > 0 ? (
                  <div className="mt-0.5 space-y-0.5 text-[11px]">
                    {(def?.traits ?? []).map((traitId) => {
                      const trait = SAGA_TRAIT_BY_ID.get(traitId);
                      return (
                        <p key={traitId}>
                          <span className="rounded bg-primary/10 px-1 text-primary">
                            {trait?.name ?? traitId}
                          </span>
                          <span className="ml-1 text-muted-foreground">{trait?.desc}</span>
                        </p>
                      );
                    })}
                  </div>
                ) : null}
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  计策 {tactics.length > 0 ? tactics.map((tactic) => SAGA_TACTIC_BY_ID.get(tactic)?.name).join(" / ") : "无"}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  武器 {member.weapon ? itemName(member.weapon) : "无"} · 防具 {member.armor ? itemName(member.armor) : "无"}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PartyList({ save, rules = SAGA_RULESET }: { save: TrialSave; rules?: number }) {
  const maxLevel = sagaMaxLevel(rules);
  // 队伍只展开上阵的这几人；待命席的人回城进编成所再看详情。
  const groups = [{ key: "party", label: "上阵", members: save.party }] as const;
  return (
    <div className="space-y-2">
      {groups.map((group) => (
        <div key={group.key} className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {group.label} · {group.members.length} 人
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {group.members.map((member) => {
              const def = SAGA_GENERAL_BY_ID.get(member.id);
              const stats = generalStats(member, save.gearLevels, rules);
              const active = group.key === "party";
              return (
                <div key={member.id} className="rounded-lg border border-border p-2 text-xs">
                  <div className="flex gap-2">
                    <SagaPortrait
                      generalId={member.id}
                      gear={{ weapon: member.weapon, armor: member.armor }}
                      width={48}
                      height={60}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center justify-between text-sm font-medium">
                        <span>
                          {def?.name ?? member.id}{" "}
                          <span className="text-muted-foreground">Lv{member.level}</span>
                        </span>
                        <span className="text-[11px] text-muted-foreground">{active ? "上阵" : "待命"}</span>
                      </p>
                      <p className="mt-0.5 text-muted-foreground">
                        武 {stats.force} · 智 {stats.intellect} · 防 {stats.defense} · 速 {stats.speedTotal} · 攻{" "}
                        {stats.attack} · 兵力 {stats.maxTroops}
                      </p>
                      <p className="mt-0.5 tabular-nums text-muted-foreground">
                        经验 {member.exp}/{expToNext(member.level)}
                        {member.level >= maxLevel
                          ? " · 已满级"
                          : ` · 距下一级还差 ${Math.max(0, expToNext(member.level) - member.exp)}`}
                        {" · "}
                        {def?.title}
                      </p>
                      {(def?.traits?.length ?? 0) > 0 ? (
                        <p className="mt-0.5 text-primary/90">
                          {(def?.traits ?? [])
                            .map((traitId) => {
                              const trait = SAGA_TRAIT_BY_ID.get(traitId);
                              return `${trait?.name ?? traitId}：${trait?.desc ?? ""}`;
                            })
                            .join("；")}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-muted-foreground">
                        武器 {member.weapon ? itemName(member.weapon) : "无"} · 防具{" "}
                        {member.armor ? itemName(member.armor) : "无"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {save.reserve.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          待命席另有 {save.reserve.length} 人，详情与入队出队请回城进编成所办理。
        </p>
      ) : null}
    </div>
  );
}

function DexGrid({
  save,
  gearById,
  rules = SAGA_RULESET,
}: {
  save: TrialSave;
  gearById: Record<string, { weapon: string | null; armor: string | null }>;
  rules?: number;
}) {
  const owned = new Set([...save.party, ...save.reserve].map((member) => member.id));
  const met = new Set(save.met);
  const rows = [...SAGA_GENERAL_BY_ID.values()].filter((def) => !def.enemyOnly || met.has(def.id));
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        收录 {owned.size} 将在麾下 · 已遇见 {met.size} 人 · 招降 {save.stats.recruited} 人（敌方专属武将只在战场上出现）
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((def) => {
          const known = met.has(def.id) || owned.has(def.id);
          // 麾下武将按实际等级、强化算实际属性与兵力；只见过没招到的仍看基础值。
          const member = owned.has(def.id)
            ? [...save.party, ...save.reserve].find((row) => row.id === def.id)
            : undefined;
          const stats = member ? generalStats(member, save.gearLevels, rules) : null;
          return (
            <div
              key={def.id}
              className={cn("rounded-lg border p-2 text-xs", known ? "border-border" : "border-border/40 opacity-50")}
            >
              <div className="flex gap-2">
                {known ? (
                  <SagaPortrait
                    generalId={def.id}
                    gear={gearById[def.id]}
                    width={48}
                    height={60}
                  />
                ) : (
                  <span className="flex h-[60px] w-[48px] shrink-0 items-center justify-center rounded-md border border-border/40 bg-muted/20 text-lg text-muted-foreground">
                    ？
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex items-center justify-between text-sm font-medium">
                    <span>
                      {known ? def.name : "？？"}
                      {owned.has(def.id) ? <span className="ml-1 text-[10px] text-primary">麾下</span> : null}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{known ? def.title : "未遇见"}</span>
                  </p>
                  {known ? (
                    <>
                      <p className="mt-0.5 text-muted-foreground">
                        {stats
                          ? `武 ${stats.force} · 智 ${stats.intellect} · 速 ${stats.speedTotal} · 攻 ${stats.attack} · 防 ${stats.defense} · SP ${stats.spMax} · 兵力 ${stats.maxTroops}`
                          : (() => {
                              const bonus = traitStats(def);
                              const force = sagaV18Stat(def.force, bonus.force);
                              const intellect = sagaV18Stat(def.intellect, bonus.intellect);
                              const speed = Math.min(SAGA_SPEED_CAP, sagaV18Speed(def.speed, bonus.speed));
                              const attack = Math.min(255, force);
                              const defense = Math.min(255, Math.max(0, Math.round(bonus.defense)));
                              return `武 ${force} · 智 ${intellect} · 速 ${speed} · 攻 ${attack} · 防 ${defense} · SP ${Math.min(255, 12 + Math.floor(intellect / 3))} · 兵力 ${def.baseTroops}（基础）`;
                            })()}
                        {` · ${SAGA_CORPS_LABEL[sagaCorpsOf(def)]}兵`}
                      </p>
                      <p className="mt-0.5 text-[10px] text-sky-200/80">
                        兵器特性：{weaponProfileText(def)}（只能装备这一类兵器）
                      </p>
                      {stats ? (
                        <>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            Lv{member?.level ?? 1} · 兵器 {stats.weaponAtk} · 甲胄 {stats.armorDef} · 命中{" "}
                            {Math.round(stats.hitRate * 100)}% · 暴击 {Math.round(stats.critRate * 100)}% · 爆伤{" "}
                            {stats.critDamage.toFixed(2)}×
                          </p>
                        </>
                      ) : null}
                      <p className="mt-0.5 text-muted-foreground">
                        {def.tactics.length > 0
                          ? def.tactics.map((tactic) => SAGA_TACTIC_BY_ID.get(tactic)?.name).join(" / ")
                          : "无计策"}
                      </p>
                      {(def.traits?.length ?? 0) > 0 ? (
                        <p className="mt-0.5 text-primary/90">
                          {(def.traits ?? [])
                            .map((traitId) => {
                              const trait = SAGA_TRAIT_BY_ID.get(traitId);
                              return `${trait?.name ?? traitId}：${trait?.desc ?? ""}`;
                            })
                            .join("；")}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="mt-0.5 text-muted-foreground">在战场或招降中遇见后解锁。</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CampPanel({
  run,
  state,
  node,
  onBattle,
  onAuto,
  onClose,
  onCity,
  onInn,
  onTalk,
}: {
  run: SagaRun | null;
  state: SagaReplayState | null;
  node: number | null;
  onBattle: (node: number) => void;
  onAuto: (node: number) => void;
  onClose: () => void;
  onCity: () => void;
  onInn: () => void;
  onTalk: () => void;
}) {
  if (!run || !state || node === null) {
    return <p className="text-sm text-muted-foreground">走到敌营跟前才能开战。</p>;
  }
  const target = run.nodes[node];
  if (!target) return <p className="text-sm text-muted-foreground">此处没有敌营。</p>;
  // 按实际开战编成预览：补进来的士兵位和敌方兵器甲胄都要能看到。
  const preview = startBattle(run, node, state);
  const cleared = state.clearedNodes.includes(node);
  const available = canEngageNode(run, state, node);
  const others = run.nodes
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => index !== node && !state.clearedNodes.includes(index));
  const won = state.scene === "won";
  const lost = state.scene === "lost";
  return (
    <div className="space-y-3 text-sm">
      <CampBanner node={target} onTalk={onTalk} />
      <div className="rounded-lg border border-border p-3">
        <p className="font-medium">
          {target.name}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {target.kind === "boss"
              ? "主帅本阵"
              : target.kind === "siege"
                ? "攻城战"
                : target.kind === "gate"
                  ? "关卡"
                  : target.kind === "elite"
                    ? "精锐营"
                    : "野战营"}
          </span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{target.blurb}</p>
        <p className="mt-2 text-xs text-muted-foreground">先破其余营寨与关卡，才能直取城池。</p>
      </div>

      <div className="rounded-lg border border-border p-3">
        <p className="text-xs text-muted-foreground">
          敌军：
          {preview.enemies
            .map((enemy) => {
              const weapon = enemy.weapon ? SAGA_ITEM_BY_ID.get(enemy.weapon) : null;
              const armor = enemy.armor ? SAGA_ITEM_BY_ID.get(enemy.armor) : null;
              const gear = [
                weapon ? `${weapon.name}${enemy.weaponPlus ? `+${enemy.weaponPlus}` : ""}` : "",
                armor ? `${armor.name}${enemy.armorPlus ? `+${enemy.armorPlus}` : ""}` : "",
              ]
                .filter(Boolean)
                .join(" / ");
              return `${enemy.name}（Lv${enemy.level}，兵力 ${enemy.troops}，${gear || "空手"}）`;
            })
            .join("、")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          战利品：经验 {target.rewardExp}。
        </p>
        {cleared ? (
          <p className="mt-2 text-xs text-success">此营已破，无需再攻。</p>
        ) : others.length > 0 && target.kind === "boss" && !available ? (
          <p className="mt-2 text-xs text-warning">
            主帅坚壁不出：要先拔掉 {others.map(({ item }) => item.name).join("、")}。
          </p>
        ) : null}
        {!cleared && !lost && !won ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onBattle(node)} disabled={!available}>
              <Swords className="h-3.5 w-3.5" />
              出战
            </Button>
            <Button size="sm" variant="outline" onClick={() => onAuto(node)} disabled={!available}>
              <Sparkles className="h-3.5 w-3.5" />
              自动战斗
            </Button>
            <Button size="sm" variant="outline" onClick={onClose}>
              <ArrowLeft className="h-3.5 w-3.5" />
              再看走位
            </Button>
            <Button size="sm" variant="outline" onClick={onCity}>
              <Home className="h-3.5 w-3.5" />
              回城整备
            </Button>
          </div>
        ) : null}
      </div>

      {won ? (
        <div className="rounded-lg border border-success/50 bg-success/5 p-3">
          <p className="font-medium">此地营寨尽拔</p>
          <p className="mt-1 text-xs text-muted-foreground">
            此行攻克 {state.clearedNodes.length}/{run.nodes.length} 座营。战报已自动上传结算，
            剧情会推进到下一处地方，与此地剧情相关的武将会加入麾下。
          </p>
        </div>
      ) : null}

      {lost ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3">
          <p className="font-medium">全军败退</p>
          <p className="mt-1 text-xs text-muted-foreground">
            已攻克的营寨与获得的经验、金币、招降武将都已自动存档。回城住店能把队伍拉回满编，
            接着再战；进度不会因为兵败丢失。
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={onInn}>
              <Home className="h-3.5 w-3.5" />
              回城住店
            </Button>
          </div>
        </div>
      ) : null}

      {!won && !lost ? (
        <p className="text-xs text-muted-foreground">
          每一步都会自动存档；拔尽此行的营寨后自动结算，不用再手动收兵。
        </p>
      ) : null}
    </div>
  );
}

function CaveBoard({
  name,
  chapter,
  seed,
  looted,
  onLoot,
  onClose,
}: {
  name: string;
  chapter: number;
  seed: number;
  looted: string[];
  onLoot: (chest: string, item: string, qty: number) => void;
  onClose: () => void;
}) {
  // 三个箱子按章节给不同档位，后面的山洞会开出击/防更高的装备与九转、仙丹。
  const pools =
    chapter >= 6
      ? [
          ["xuantie", "jiuzhuan", "longdan"],
          ["longwen_helm", "xiandan", "herb"],
          ["hanxue", "zhaohun_dan", "cloth"],
        ]
      : chapter >= 3
        ? [
            ["blade", "jiuzhuan", "herb"],
            ["spear", "zhaohun_dan", "cloth"],
            ["iron_sword", "herb", "zhaohun_dan"],
          ]
        : [
            ["iron_sword", "herb", "cloth"],
            ["blade", "herb", "zhaohun_dan"],
            ["spear", "cloth", "herb"],
          ];
  const chests = pools.map((pool, index) => {
    const itemId = pool[(seed + chapter + index) % pool.length];
    const item = SAGA_ITEM_BY_ID.get(itemId);
    return {
      id: `cave:${name}:${index}`,
      itemId,
      label: item?.name ?? "旧物",
      detail: item?.kind === "consumable" ? "药品" : item ? "装备" : "杂物",
      left: ["8%", "42%", "70%"][index],
      top: ["26%", "62%", "20%"][index],
    };
  });
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">洞里潮气很重，石壁后偶尔有火光。</p>
        </div>
        <Button size="sm" variant="outline" onClick={onClose}>
          <ArrowLeft className="h-3.5 w-3.5" />
          退出山洞
        </Button>
      </div>
      {/* 山洞实景：岩壁、苔痕、火把与三条岔道；宝箱直接点在石台上开。 */}
      <div
        className="relative h-[300px] overflow-hidden rounded-xl border border-stone-900/60 shadow-inner"
        style={{
          background:
            "radial-gradient(circle at 50% 8%, #5b4a34 0 8%, transparent 9%), linear-gradient(#2b2620 0 18%, #3d3429 18% 22%, #241f1a 22% 100%)",
        }}
      >
        <div className="absolute inset-x-0 top-[18%] h-2 bg-[#191512] shadow-[0_6px_10px_#0008]" />
        {[12, 30, 55, 78].map((left, index) => (
          <div
            key={left}
            className="absolute top-0 h-[28%] w-[10%] rounded-b-[40%] bg-[#161310]/85"
            style={{ left: `${left}%`, transform: `rotate(${index % 2 ? 3 : -3}deg)` }}
          />
        ))}
        <div className="absolute bottom-0 left-1/2 h-[78%] w-[22%] -translate-x-1/2 bg-[#4a3c2d]/55 blur-[1px]" />
        <div className="absolute bottom-0 left-[18%] h-[52%] w-[16%] rounded-t-full bg-[#1b1713]/80" />
        <div className="absolute bottom-0 right-[14%] h-[44%] w-[18%] rounded-t-full bg-[#1b1713]/80" />
        <div className="absolute left-[52%] top-[20%] h-3 w-3 rounded-full bg-orange-400 shadow-[0_0_18px_8px_#fb923c66]" />
        <div className="absolute left-[49.5%] top-[23%] h-9 w-1 bg-[#5b4630]" />
        {chests.map((chest) => {
          const opened = looted.includes(chest.id);
          return (
            <button
              key={chest.id}
              type="button"
              disabled={opened}
              onClick={() => {
                if (!opened) onLoot(chest.id, chest.itemId, 1);
              }}
              className={`absolute flex w-[64px] -translate-x-1/2 flex-col items-center rounded-md border p-1 text-[10px] transition ${
                opened
                  ? "border-stone-600/50 bg-stone-800/60 text-stone-400"
                  : "border-amber-500/60 bg-amber-900/50 text-amber-100 hover:-translate-y-0.5 hover:bg-amber-800/60"
              }`}
              style={{ left: chest.left, top: chest.top }}
              title={opened ? `${chest.label} 已取走` : `开启宝箱：${chest.label}`}
            >
              <span className="relative block h-6 w-10">
                <span className="absolute inset-x-0 bottom-0 h-4 rounded-sm border border-amber-900 bg-[#7c4a1e]" />
                <span className="absolute inset-x-1 top-0 h-2 rounded-t-sm border border-amber-900 bg-[#a56b2c]" />
                <span className="absolute left-1/2 top-1 h-1.5 w-2 -translate-x-1/2 rounded-sm bg-amber-300" />
              </span>
              <span className="mt-0.5">{opened ? "已开启" : chest.label}</span>
              <span className="text-[9px] opacity-70">{opened ? "空" : chest.detail}</span>
            </button>
          );
        })}
        <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[10px] text-amber-100/80">
          沿石道往里走 · 宝箱开一次进存档
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        箱子里的兵器、甲胄与药品直接进武库或物品栏；开启记录随战报重放，刷新后不会重复发放。
      </p>
    </div>
  );
}

function SettlementBoard({
  site,
  line,
  onTalk,
  onFacility,
  onClose,
}: {
  site: Settlement;
  line: string | null;
  onTalk: (npc: Settlement["npcs"][number]) => void;
  onFacility: (id: FieldFacilityId) => void;
  onClose: () => void;
}) {
  const isTown = site.kind === "town";
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2">
        <div>
          <p className="font-medium">
            {site.name}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {isTown ? "城镇" : "村庄"} · 第 {site.chapter + 1} 区
            </span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{site.blurb}</p>
        </div>
        <Button size="sm" variant="outline" onClick={onClose}>
          离开
        </Button>
      </div>

      {/* 聚落实景：夯土街面、木构铺面、村口老树与乡人都在场景里，不再用文字清单代替。 */}
      <div
        className="relative overflow-hidden rounded-xl border border-amber-950/40 shadow-inner"
        style={{
          background: isTown
            ? "linear-gradient(#8aa6b8 0 22%, #c9a86a 22% 27%, #9a7b4f 27% 100%)"
            : "linear-gradient(#9db7a1 0 26%, #b5c58b 26% 31%, #8a7048 31% 100%)",
        }}
      >
        <div className="absolute inset-x-0 top-0 h-[22%] opacity-80 [background:radial-gradient(circle_at_20%_30%,#fff8 0_8%,transparent_9%),radial-gradient(circle_at_75%_20%,#fff6_0_12%,transparent_13%)]" />
        <div className="absolute inset-x-0 top-[24%] h-2 bg-[#6f5636]/70 shadow" />
        <div className="absolute left-[6%] top-[34%] h-[52%] w-[3%] rounded-t-full bg-[#4b3821]/80" />
        <div className="absolute left-[2%] top-[31%] h-[19%] w-[12%] rounded-full bg-[#42603b]/90 blur-[1px]" />
        {!isTown ? (
          <div className="absolute right-[4%] top-[30%] h-[24%] w-[14%] rounded-full bg-[#355233]/90" />
        ) : null}

        <div className="relative z-10 grid grid-cols-2 gap-2 p-3 pt-6 sm:grid-cols-3 lg:grid-cols-4">
          {site.facilities.map((facility) => (
            <button
              key={facility.id}
              type="button"
              onClick={() => onFacility(facility.id)}
              className="group flex min-h-[92px] flex-col items-center justify-end rounded-md px-1 pb-1 text-center transition-transform hover:-translate-y-0.5 focus:outline-none"
              title={`${facility.label} · ${facility.npc}：${facility.line}`}
            >
              <span className="relative block w-[72px]">
                <span className="absolute -top-2 left-0 h-4 w-full skew-x-[-18deg] rounded-sm border border-[#4a2d18] bg-[#7b4c2a] shadow" />
                <span className="block h-11 w-full rounded-sm border border-[#5a3b23] bg-[#c6a06b] shadow-[inset_0_-8px_0_#8a6846]" />
                <span className="absolute inset-x-3 top-2 flex h-6 items-center justify-center rounded-sm border border-[#6b4a2c] bg-[#f0d9ae] text-[11px] font-semibold text-[#4b321d]">
                  {facility.sign}
                </span>
                <span className="absolute inset-x-1 bottom-[-1px] h-2 rounded-b bg-[#6a4b2d]" />
              </span>
              <span className="mt-1 rounded bg-black/45 px-1.5 py-0.5 text-[10px] leading-tight text-amber-50 shadow-sm group-hover:bg-black/60">
                {facility.label}
              </span>
            </button>
          ))}
        </div>

        <div className="relative z-10 mx-3 mb-3 rounded-md border border-white/15 bg-[#1c150e]/70 px-2 py-1.5 backdrop-blur-[1px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[10px] text-amber-100/55">乡人</span>
            {site.npcs.map((npc) => (
              <button
                key={npc.name}
                type="button"
                onClick={() => onTalk(npc)}
                className="rounded border border-amber-100/15 bg-amber-50/10 px-1.5 py-0.5 text-[10px] text-amber-50 hover:bg-amber-50/20"
                title={npc.title}
              >
                {npc.name}
              </button>
            ))}
            {line ? <span className="ml-1 text-[11px] text-amber-50/85">{line}</span> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ArmyPanel({
  run,
  state,
  field,
  onClose,
  onCity,
  onInn,
  onSite,
}: {
  run: SagaRun | null;
  state: SagaReplayState | null;
  field: SagaField;
  onClose: () => void;
  onCity: () => void;
  onInn: () => void;
  onSite: (kind: "town" | "village", chapter: number, name: string) => void;
}) {
  if (!run || !state) {
    return <p className="text-sm text-muted-foreground">还没有进行中的行军。</p>;
  }
  const ctx = sagaQuestContext(run, state);
  const chapter = SAGA_CHAPTERS[Math.min(SAGA_CHAPTERS.length - 1, ctx.chapter)];
  const won = state.scene === "won";
  const lost = state.scene === "lost";
  // 城门口有时被营寨 / 关卡挡在前面；军情里再给一份完整清单，保证每座州治与村落都进得去。
  const towns = Array.from(
    new Map(
      (field.cities ?? []).map((city) => [
        `${city.chapter}:${city.name}`,
        { chapter: city.chapter, name: city.name },
      ]),
    ).values(),
  );
  if (towns.length === 0) {
    const home = SAGA_CHAPTERS[Math.min(SAGA_CHAPTERS.length - 1, run.startSave.chapter)];
    towns.push({ chapter: run.startSave.chapter, name: home?.town ?? "州治" });
  }
  const villages = field.pois.filter((poi) => poi.kind === "village");
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-lg border border-border p-3">
        <p className="font-medium">
          {chapter?.town ?? "此地"} · {chapter?.name ?? "行军"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{chapter?.blurb}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          行军大地图上可自由走位，走到营前按交互开战；这里只列可进的州治与村落，不再单列可攻 / 未可地点。
        </p>
      </div>

      <div className="rounded-lg border border-border p-3">
        <p className="font-medium">州治与村落</p>
        <div className="mt-2 space-y-1">
          {towns.map((city) => {
            const isHome = city.chapter === ctx.chapter;
            return (
              <div
                key={`${city.chapter}:${city.name}`}
                className="flex items-center justify-between gap-2 rounded border border-border px-2.5 py-1.5 text-xs"
              >
                <span>
                  州治 · {city.name}
                  <span className="ml-1.5 text-muted-foreground">
                    {isHome ? "本区州治，可走街串巷" : "他州州治，铺面按地方生成"}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    isHome
                      ? onCity()
                      : onSite("town", city.chapter, city.name)
                  }
                >
                  {isHome ? "回城" : "进入"}
                </Button>
              </div>
            );
          })}
          {villages.map((poi) => (
            <div
              key={`village:${poi.name}`}
              className="flex items-center justify-between gap-2 rounded border border-border px-2.5 py-1.5 text-xs"
            >
              <span>
                村落 · {poi.name}
                <span className="ml-1.5 text-muted-foreground">宿店、药棚与乡人</span>
              </span>
              <Button size="sm" variant="outline" onClick={() => onSite("village", ctx.chapter, poi.name)}>
                进入
              </Button>
            </div>
          ))}
          {towns.length === 0 && villages.length === 0 ? (
            <p className="text-xs text-muted-foreground">这一带暂时没有可进的州治或村落。</p>
          ) : null}
        </div>
      </div>

      {won ? (
        <div className="rounded-lg border border-success/50 bg-success/5 p-3">
          <p className="font-medium">此地营寨尽拔</p>
          <p className="mt-1 text-xs text-muted-foreground">
            战报已自动上传结算：剧情推进到下一处地方，与此地剧情相关的武将会加入麾下。
          </p>
        </div>
      ) : lost ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3">
          <p className="font-medium">全军败退</p>
          <p className="mt-1 text-xs text-muted-foreground">
            已攻克的营寨与获得的经验、金币、招降武将都已自动存档。回城住店能把队伍拉回满编，
            接着再战；进度不会因为兵败丢失。
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={onInn}>
              <Home className="h-3.5 w-3.5" />
              回城住店
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onCity}>
            <Home className="h-3.5 w-3.5" />
            回城整备
          </Button>
          <Button size="sm" variant="outline" onClick={onClose}>
            <ArrowLeft className="h-3.5 w-3.5" />
            返回大地图
          </Button>
        </div>
      )}
    </div>
  );
}

function SettlementCard({
  settlement,
  busy,
  onContinue,
  onClose,
}: {
  settlement: TrialSettlement;
  busy: string | null;
  onContinue: () => void;
  onClose: () => void;
}) {
  const result: SagaRunResult | null = settlement.result;
  const lastIndex = SAGA_CHAPTERS.length - 1;
  const beforeIndex = Math.min(lastIndex, Math.max(0, result?.chapterBefore ?? 0));
  const before = SAGA_CHAPTERS[beforeIndex];
  const afterIndex = Math.min(lastIndex, Math.max(0, result?.chapterAfter ?? beforeIndex));
  const next = result?.victory && afterIndex > beforeIndex ? SAGA_CHAPTERS[afterIndex] : null;
  const finale = Boolean(result?.victory && beforeIndex === lastIndex);
  const retry = !settlement.victory && !finale;
  const city = before?.town ?? "此地";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm sm:absolute sm:z-40">
      <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">行军战报</p>
        <h3 className="mt-1 text-xl font-semibold">
          {finale ? "讨逆功成" : settlement.victory ? `${city}已定` : "兵败回城"}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {before ? `${before.town} · ${before.name}` : "三国讨逆传"}
          {settlement.already ? " · 这次行军此前已结算" : ""}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div className="rounded-lg border border-border p-2">
            <p className="text-xs text-muted-foreground">攻破营寨</p>
            <p className="tabular-nums font-medium">
              {settlement.cleared}/{settlement.total}
            </p>
          </div>
          <div className="rounded-lg border border-border p-2">
            <p className="text-xs text-muted-foreground">金币</p>
            <p className="tabular-nums font-medium">+{result?.goldGained ?? 0}</p>
          </div>
          <div className="rounded-lg border border-border p-2">
            <p className="text-xs text-muted-foreground">经验</p>
            <p className="tabular-nums font-medium">+{result?.expGained ?? 0}</p>
          </div>
          <div className="rounded-lg border border-border p-2">
            <p className="text-xs text-muted-foreground">平定奖励</p>
            <p className="tabular-nums font-medium">+{formatCredits(settlement.clearGold)} 金</p>
          </div>
        </div>
        {settlement.bankTcr > 0 ? (
          <p className="mt-2 text-sm">
            钱庄存金：
            <span className="font-medium text-primary">
              {settlement.bankGold} 金 → +{formatCredits(settlement.bankTcr)} tcr
            </span>
            <span className="ml-2 text-xs text-muted-foreground">折成 tcr 进钱包，按有效期到账</span>
          </p>
        ) : null}
        {result && result.encounters > 0 ? (
          <p className="mt-2 text-sm">
            野外遭遇：
            <span className="font-medium text-primary">{result.encounters} 场</span>
            <span className="ml-2 text-xs text-muted-foreground">缴获已计入金币与经验</span>
          </p>
        ) : null}
        {result && result.recruited.length > 0 ? (
          <p className="mt-2 text-sm">
            招降成功：
            <span className="text-primary">{result.recruited.join("、")}</span>
          </p>
        ) : null}
        {result && result.party.length > 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            队伍等级：{result.party.map((member) => `${member.name} Lv${member.level}`).join(" · ")}
            {next ? " · 剧情已推进" : finale ? " · 讨逆之路走完" : ""}
          </p>
        ) : null}
        {next ? (
          <div className="mt-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
            <p className="text-sm font-medium">
              剧情推进 · {next.town}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {next.name} · {next.subtitle}
              </span>
            </p>
            <div className="mt-1.5 space-y-1 border-l-2 border-primary/40 pl-2 text-xs text-muted-foreground">
              {next.story.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
        ) : null}
        {finale ? (
          <p className="mt-2 text-xs text-muted-foreground">
            八处地方皆定，讨逆之路走完；图鉴与战史仍可随时回看。
          </p>
        ) : null}
        {retry ? (
          <p className="mt-2 text-xs text-muted-foreground">
            未平定此处不发平定金币；钱庄存金折成的 tcr 仍会到账。等级、金币、装备与招降武将都保留，整备后可再走一遍。
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {next ? (
            <Button onClick={onContinue} disabled={busy === "start"}>
              {busy === "start" ? "出发中…" : `前往${next.town}`}
            </Button>
          ) : null}
          {retry ? (
            <Button onClick={onContinue} disabled={busy === "start"}>
              {busy === "start" ? "出发中…" : `再走${city}`}
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            回到城镇
          </Button>
        </div>
        {next ? (
          <p className="mt-2 text-xs text-muted-foreground">
            不急着出发也可以：点「回到城镇」整理装备，下次再出发仍从{next.town}开始，等级、金币与装备都已存好。
          </p>
        ) : null}
      </div>
    </div>
  );
}

const NOTICE_KIND_LABEL: Record<string, string> = {
  update: "版本更新",
  maintain: "维护",
  event: "活动",
};

const MAINTENANCE_PHASE_LABEL: Record<string, { text: string; className: string }> = {
  upcoming: { text: "计划中", className: "text-sky-500" },
  active: { text: "维护中", className: "text-red-500" },
  done: { text: "已结束", className: "text-muted-foreground" },
};

/** 版本公告：更新内容、维护安排与历史版本都收在这一页。 */
function NoticeBoard() {
  const phase = maintenancePhaseAt(new Date());
  const window = SAGA_MAINTENANCE;
  const moment = (iso: string): string => iso.replace("T", " ").slice(0, 16);
  const notices = visibleNotices();
  const latest = notices[0];
  const giftTickets = updateGiftTickets(latest);
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-lg border border-border p-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">维护安排</span>
          {phase ? (
            <span className={MAINTENANCE_PHASE_LABEL[phase].className}>
              {MAINTENANCE_PHASE_LABEL[phase].text}
            </span>
          ) : (
            <span className="text-muted-foreground">暂无计划</span>
          )}
        </div>
        {window ? (
          <>
            <p className="mt-1 text-xs tabular-nums text-muted-foreground">
              {moment(window.start)} ~ {moment(window.end)}（北京时间）
            </p>
            <p className="mt-1 text-xs">{window.note}</p>
          </>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            当前没有停机维护计划。真要停机，会提前在这里写明时间与影响；维护期间已存的战报与本地指令不会丢。
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        游戏内版本 v{SAGA_NOTICE_VERSION} · 公告与已读记录只存在本机，不参与结算。
      </p>

      <div className="space-y-2">
        {notices.map((entry) => (
          <div key={entry.id} className="rounded-lg border border-border p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-medium">
                <span className="mr-1.5 rounded bg-primary/10 px-1 text-[10px] text-primary">
                  {NOTICE_KIND_LABEL[entry.kind] ?? "公告"}
                </span>
                {entry.title}
              </span>
              <span className="text-muted-foreground">
                v{entry.version} · {entry.date}
              </span>
            </div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
              {entry.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {entry.id === latest?.id && giftTickets > 0 ? (
              <p className="mt-1.5 rounded bg-primary/5 px-2 py-1 text-[11px] text-primary">
                更新礼：本次公告共 {giftTickets} 项内容，已按一项一张发放 {giftTickets} 张当期活动券到站内信，请手动领取（活动结束后作废）。
              </p>
            ) : null}
          </div>
        ))}
        <p className="text-[11px] text-muted-foreground">
          这里只列最近三条更新，更早的版本收在仓库的 CHANGELOG 里。
        </p>
      </div>
    </div>
  );
}
