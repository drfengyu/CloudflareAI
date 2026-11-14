"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Coins,
  Flag,
  Home,
  ScrollText,
  Sparkles,
  Swords,
  Ticket,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SoundToggle } from "@/components/activity/sound-toggle";
import { CouponShop } from "@/components/activity/coupon-shop";
import { cn } from "@/lib/utils";
import { formatCredits } from "@/lib/billing/credits";
import { gameAudio } from "@/lib/game/audio";
import {
  SAGA_CHAPTERS,
  SAGA_FORMATIONS,
  SAGA_GENERAL_BY_ID,
  SAGA_ITEM_BY_ID,
  SAGA_ITEMS,
  SAGA_TACTIC_BY_ID,
  SAGA_TRAIT_BY_ID,
  tacticsFor,
} from "@/lib/trial/saga/data";
import {
  resolveBattleRound,
  startBattle,
  startEncounterBattle,
} from "@/lib/trial/saga/battle";
import { SAGA_MAX_ENCOUNTERS } from "@/lib/trial/saga/encounter";
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
  generateSagaField,
  sagaFieldFor,
  type FieldHotspot,
} from "@/lib/trial/saga/map";
import { expToNext, generalStats, partyPower } from "@/lib/trial/saga/state";
import { SAGA_COUPON_ITEM_ID, bankCreditsForGold, couponGoldCost, couponsForGold, type SagaBankPolicy } from "@/lib/trial/saga/bank";
import { SAGA_INN_ITEM_ID, SAGA_INN_PRICE_TICKETS } from "@/lib/trial/saga/inn";
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
  campScene,
  chapterIntroScene,
  chapterVictoryScene,
  councilScene,
  poiScene,
  tavernScene,
  type SagaScene,
} from "@/lib/trial/saga/story";
import {
  sagaNextQuest,
  sagaQuestContext,
  sagaQuestsFor,
  type SagaQuest,
} from "@/lib/trial/saga/quests";
import type {
  FormationId,
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
import type { ActivityCouponView } from "@/lib/activity/coupons";
import {
  autoSaveTrialAction,
  buyTrialCouponsAction,
  buyTrialItemAction,
  startTrialAction,
  upgradeTrialGearAction,
} from "@/app/(dashboard)/trial/actions";
import {
  DEFAULT_VIEW,
  FIELD_FACILITIES,
  battleEnemyAtPoint,
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
  QuestBoard,
  SagaPortrait,
  SceneCanvas,
  TownScene,
} from "./scenes";

type PanelId = FieldFacilityId | "camp" | "army" | "status" | "dex" | null;
type BattleAction = "attack" | "guard" | "tactic" | "item" | "recruit";

interface BattlePick {
  a: BattleAction;
  t?: TacticId;
  i?: string;
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
  /** 当前活动券视图：城中的活动券礼包入口直接复用，也用来随余额刷新。 */
  coupon: ActivityCouponView;
  /** 钱庄汇率：没有进行中的行军时按后台当前配置展示。 */
  bank: Pick<SagaBankPolicy, "goldPerTcr" | "maxGoldPerRun">;
  nodeCount: number;
  maxReward: number;
  rewardValidDays: number;
}

const HUD_CELL = "flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs";
const PANEL_CLASS = "absolute inset-x-3 bottom-3 top-14 z-20 flex flex-col overflow-hidden rounded-xl border border-border bg-card/97 shadow-2xl backdrop-blur sm:inset-x-6";
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
  ]);
  const list: { id: string; name: string; count: number }[] = [];
  for (const id of ids) {
    const def = SAGA_ITEM_BY_ID.get(id);
    if (!def || (def.kind !== "consumable" && def.kind !== "supply")) continue;
    const count = (state.inventory.bonus[id] ?? 0) + (state.save.bag[id] ?? 0);
    if (count > 0) list.push({ id, name: def.name, count });
  }
  return list;
}

function canRecruit(battle: SagaBattleState): boolean {
  return battle.enemies.some(
    (enemy) => !enemy.downed && enemy.recruitable && enemy.troops <= enemy.maxTroops * 0.35,
  );
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
  const [depositGold, setDepositGold] = useState("");
  /** 钱庄换券：想换多少张试炼券。 */
  const [exchangeTickets, setExchangeTickets] = useState("");
  const [hallTab, setHallTab] = useState<"party" | "gear" | "formation">("party");
  const [dexTab, setDexTab] = useState<"save" | "dex">("save");
  const [campNode, setCampNode] = useState<number | null>(null);
  const [battle, setBattle] = useState<BattleSession | null>(null);
  const [anim, setAnim] = useState<BattleAnimation | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [settlement, setSettlement] = useState<TrialSettlement | null>(null);
  const [banner, setBanner] = useState<{ kind: "won" | "lost"; name: string; gold: number; exp: number } | null>(null);
  /** 城中街道场景：进城后把大地图盖住，铺子从街景里进。 */
  const [inTown, setInTown] = useState(false);
  /** 剧情对话浮层：开场、阵前、平定、乡野、酒馆与营帐议事都走这里。 */
  const [dialogue, setDialogue] = useState<SagaScene | null>(null);
  /** 纯前端见闻：走访过的乡野点位与看过的剧情，只存本机，不参与结算。 */
  const [visitedPois, setVisitedPois] = useState<string[]>([]);
  const [seenScenes, setSeenScenes] = useState<string[]>([]);
  /** 自动存档指示：saving 时 HUD 显示「存档中」，失败不挡玩法。 */
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
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
  /** 铁匠铺可强化的装备：库存里的 + 武将身上穿着的，按 ID 去重。 */
  const forgeGearIds = useMemo(() => {
    const ids = new Set(Object.keys(save.gear));
    for (const member of [...save.party, ...save.reserve]) {
      if (member.weapon) ids.add(member.weapon);
      if (member.armor) ids.add(member.armor);
    }
    return [...ids].filter((id) => {
      const kind = SAGA_ITEM_BY_ID.get(id)?.kind;
      return kind === "weapon" || kind === "armor";
    });
  }, [save]);

  /** 上阵武将当前兵力：没出城时就是满编；行军中的残兵来自重放状态。 */
  const troopRows = save.party.map((general) => {
    const stats = generalStats(general);
    const max = Math.max(1, Math.round(stats.maxTroops * (1 + (state?.buffs.troopPct ?? 0) / 100)));
    const current = Math.min(max, state?.partyTroops[general.id] ?? max);
    return { id: general.id, name: generalName(general.id), current, max };
  });
  const innNeedsRest = troopRows.some((row) => row.current < row.max);
  /** 客栈按钮的唯一禁用口径：场景 / 兵力 / 试炼券分开提示；兵败后允许住店重整。 */
  const innBlocked =
    !run || !state
      ? "行军途中才能住店"
      : state.scene === "won"
        ? "此地已平定，无需住店"
        : state.scene === "battle"
          ? "战斗尚未结束"
          : state.scene === "lost"
            ? tickets < SAGA_INN_PRICE_TICKETS
              ? `试炼券不足（${SAGA_INN_PRICE_TICKETS} 张）`
              : null
            : !innNeedsRest
              ? "兵力已满"
              : tickets < SAGA_INN_PRICE_TICKETS
                ? `试炼券不足（${SAGA_INN_PRICE_TICKETS} 张）`
                : null;
  const innLabel =
    innBlocked ??
    (state?.scene === "lost"
      ? `全军败退 · 住店重整（${SAGA_INN_PRICE_TICKETS} 张券）`
      : `住店（${SAGA_INN_PRICE_TICKETS} 张券）`);

  // 大地图按「章节 + 节点数 + 种子」纯函数复现：没开局时也画一张同一个地方的图当作预告。
  const field: SagaField = useMemo(
    () =>
      run
        ? sagaFieldFor(run)
        : generateSagaField({
            chapter: props.save.chapter,
            nodeCount: props.nodeCount,
            seed: (props.save.chapter + 1) * 7919,
          }),
    [run, props.save.chapter, props.nodeCount],
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

  const quests = useMemo(
    () =>
      run && state
        ? sagaQuestsFor(
            sagaQuestContext(run, state, {
              visitedPois: visitedPois.length,
              totalPois: field.pois.length,
            }),
          )
        : [],
    [run, state, visitedPois.length, field.pois.length],
  );
  const nextQuest = useMemo(() => sagaNextQuest(quests), [quests]);
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
          setSaveState("idle");
          return;
        }
        setSaveState("saved");
        if (result.data.settled) {
          if (result.data.settlement) finishRun(result.data.settlement);
          else router.refresh();
        }
      })();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [commands, finishRun, router, run, runId, settlement]);

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
      setCommands([]);
      setSettlement(null);
      setPanel(null);
      setCampNode(null);
      setInTown(false);
      setVisitedPois([]);
      setSeenScenes([]);
      setDialogue(chapterIntroScene(data.run.startSave.chapter));
      gameAudio.play("encounter");
      toast.success(`前往 ${SAGA_CHAPTERS[Math.min(SAGA_CHAPTERS.length - 1, data.run.startSave.chapter)].town}`);
    } finally {
      setBusy(null);
    }
  }, []);

  /** 城内所有买卖都走试炼券：装备、伤药、军需和客栈共用这一个入口。 */
  const buyItem = useCallback(
    async (itemId: string, successText?: string, sfx: "coin" | "heal" = "coin") => {
      if (!runId || !run || busy) return;
      const priceTickets =
        itemId === SAGA_INN_ITEM_ID
          ? SAGA_INN_PRICE_TICKETS
          : SAGA_ITEM_BY_ID.get(itemId)?.priceTickets ?? 0;
      if (priceTickets < 1) return;
      if (tickets < priceTickets) {
        toast.error(`试炼券不足（要 ${priceTickets} 张）`);
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
    [busy, commands.length, run, runId, tickets],
  );

  /** 训练场：目标等级由玩家填，价格按「当前等级 → 目标等级」算，服务端重放后核对。 */
  const trainTo = useCallback(
    async (generalId: string, currentLevel: number) => {
      if (!runId || !run || busy) return;
      const cap = trainingLevelCap(save);
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
        toast.error(`试炼券不足（要 ${cost} 张）`);
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
    [busy, commands, run, runId, save, tickets, trainTargets],
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
        toast.error(`试炼券不足（要 ${cost} 张）`);
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

  /** 钱庄换券：金币按券面单价折成试炼券，服务端即时入账，本趟行军马上能用。 */
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
        toast.success(`换到 ${count} 张试炼券，花了 ${cost} 金`);
      } finally {
        setBusy(null);
      }
    },
    [busy, commands, goldPerTicket, run, runId, save.gold],
  );

  // ---- 大地图行走与画布 ----
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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
  /** 行军中野外遇敌的触发入口；不在行军途中或已达上限时为空。 */
  const encounterTriggerRef = useRef<(() => void) | null>(null);
  /** 触发后先锁住走位，等战斗面板真正挂上再松开。 */
  const encounterLockRef = useRef(false);
  /** 走过多少格才允许下一次判定，避免刚打完又立刻撞上。 */
  const encounterCooldownRef = useRef(12);
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
  useEffect(() => {
    fieldRef.current = field;
    const player = playerRef.current;
    player.x = field.spawn.x;
    player.y = field.spawn.y;
    player.walkTo = null;
    player.stuck = 0;
    arriveRef.current = null;
    hotspotRef.current = null;
    encounterLockRef.current = false;
    encounterCooldownRef.current = 12;
    walkTileRef.current = null;
  }, [field]);

  useEffect(() => {
    interactRef.current = (hotspot) => {
      if (settlementRef.current) return;
      if (hotspot.kind === "city") {
        setInTown(true);
        return;
      }
      if (hotspot.kind === "poi" && hotspot.poi) {
        const poi = hotspot.poi;
        const key = `${poi.kind}:${poi.name}`;
        setVisitedPois((prev) => (prev.includes(key) ? prev : [...prev, key]));
        setDialogue(poiScene(run?.startSave.chapter ?? props.save.chapter, poi));
        return;
      }
      if (hotspot.camp) {
        setCampNode(hotspot.camp.node);
        setPanel("camp");
      }
    };
  }, [props.save.chapter, run]);

  /** 同一趟行军里，每个营的阵前喊话只自动播一次；之后可从营前画面重看。 */
  const markSceneSeen = useCallback((key: string): boolean => {
    if (seenScenes.includes(key)) return false;
    setSeenScenes((prev) => (prev.includes(key) ? prev : [...prev, key]));
    return true;
  }, [seenScenes]);

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
              if (encounterCooldownRef.current > 0) {
                encounterCooldownRef.current -= 1;
              } else {
                const trigger = encounterTriggerRef.current;
                const chance = fieldEncounterChanceAt(map, player.x, player.y);
                if (trigger && chance > 0 && Math.random() < chance) {
                  moving = false;
                  trigger();
                }
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
          target: focusTarget,
          animation: modeRef.current.anim,
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
      gameAudio.play("encounter");
    },
    [run, state],
  );

  /**
   * 行走撞上的野外遭遇：编成由种子与「这是第几场」推出，服务端重放时按同一序号生成。
   * 每趟最多 SAGA_MAX_ENCOUNTERS 场；战后不用回营，直接接着走。
   */
  const beginEncounter = useCallback(() => {
    if (!run || !state) return;
    if (battle || settlement || panel) return;
    if (state.scene !== "field" || state.encounters >= SAGA_MAX_ENCOUNTERS) return;
    encounterLockRef.current = true;
    playerRef.current.walkTo = null;
    arriveRef.current = null;
    encounterCooldownRef.current = 18;
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
    gameAudio.play("encounter");
    toast(`野外遇敌 · ${battleState.nodeName}`);
  }, [battle, panel, run, settlement, state]);

  useEffect(() => {
    const ready =
      Boolean(run) &&
      Boolean(state) &&
      state?.scene === "field" &&
      (state?.encounters ?? SAGA_MAX_ENCOUNTERS) < SAGA_MAX_ENCOUNTERS &&
      !battle &&
      !settlement &&
      !panel;
    encounterTriggerRef.current = ready ? beginEncounter : null;
  }, [battle, beginEncounter, panel, run, settlement, state]);

  const commitBattle = useCallback(
    (session: BattleSession) => {
      appendCommand(
        session.encounter
          ? { k: "skirmish", rounds: session.rounds }
          : { k: "battle", node: session.node, rounds: session.rounds },
      );
      const won = session.battle.phase === "won";
      gameAudio.play(won ? "win" : "lose");
      setBanner({
        kind: won ? "won" : "lost",
        name: session.battle.nodeName,
        gold: session.battle.rewardGold,
        exp: session.battle.rewardExp,
      });
      if (won && run && session.node >= 0 && run.nodes[session.node]?.kind === "boss") {
        const key = `victory:${run.startSave.chapter}`;
        if (markSceneSeen(key)) setDialogue(chapterVictoryScene(run.startSave.chapter));
      }
      setBattle(null);
      setAnim(null);
      setFocusId(null);
    },
    [appendCommand, markSceneSeen, run],
  );

  const runRound = useCallback(
    (session: BattleSession, round: SagaRoundCommand[]) => {
      if (session.battle.phase !== "select") return;
      const next: BattleSession = { ...session, rounds: [...session.rounds, round] };
      resolveBattleRound(next.battle, round, next.scratch);
      setBattle(next);
      const events = next.battle.lastEvents;
      setAnim({ events, startedAt: performance.now(), stepMs: 460 });
      playBattleSfx(events, 460);
      window.setTimeout(() => {
        setAnim(null);
        if (next.battle.phase !== "select") {
          commitBattle(next);
        } else {
          setBattle((prev) => (prev ? { ...prev, picks: defaultPicks(prev.battle) } : prev));
          setFocusId(next.battle.party.find((unit) => !unit.downed)?.id ?? null);
        }
      }, Math.max(1200, events.length * 460 + 260));
    },
    [commitBattle],
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
        const key = `victory:${run.startSave.chapter}`;
        if (markSceneSeen(key)) setDialogue(chapterVictoryScene(run.startSave.chapter));
      }
      setPanel(null);
    },
    [appendCommand, markSceneSeen, run, state],
  );

  const retreatBattle = useCallback(() => {
    if (!battle) return;
    if (!window.confirm("撤退只结束当前这场战斗，之前的战果与指令都已自动存档，行军不会中断。确定撤退？")) return;
    const block: SagaCommand = battle.encounter
      ? { k: "skirmish", rounds: battle.rounds }
      : { k: "battle", node: battle.node, rounds: battle.rounds };
    const retreat: SagaCommand = { k: "retreat" };
    const replayed = run ? replaySagaRun(run, [...commands, block, retreat]) : null;
    appendCommand(block);
    appendCommand(retreat);
    setBattle(null);
    setAnim(null);
    setPanel(null);
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
      revive
        ? `用 ${SAGA_INN_PRICE_TICKETS} 张试炼券住店，全军重整旗鼓`
        : `用 ${SAGA_INN_PRICE_TICKETS} 张试炼券歇脚，上阵武将兵力补满`,
      "heal",
    );
  }, [buyItem, run, state]);

  const equipItem = useCallback(
    (generalId: string, slot: "weapon" | "armor", itemId: string | null) => {
      appendCommand({ k: "equip", g: generalId, slot, i: itemId });
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

  const battleLocked = Boolean(anim);
  const pressKey = useCallback(
    (dir: "up" | "down" | "left" | "right", pressed: boolean) => {
      if (inTownRef.current) return;
      keysRef.current[dir] = pressed;
    },
    [],
  );
  const inCityPanel = FIELD_FACILITIES.some((spot) => spot.id === panel);
  const panelTitle =
    panel === "dex"
      ? "武将图鉴"
      : panel === "status"
        ? "军中一览"
        : panel === "camp"
          ? `敌营 · ${run?.nodes[campNode ?? 0]?.name ?? ""}`
          : panel === "army"
            ? "军情"
            : panel === "tavern"
              ? `${chapter.town} · 酒馆`
              : panel === "tent"
                ? "营帐议事"
                : panel === "train"
                  ? `${chapter.town} · 训练场`
                  : panel === "coupon"
                    ? `${chapter.town} · 活动券礼包`
                    : `${chapter.town}城 · 城中整备`;

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
        <span className={HUD_CELL}>
          <Ticket className="h-3.5 w-3.5 text-violet-400" />
          {tickets} 张试炼券
        </span>
        {run && nextQuest ? (
          <span className={HUD_CELL} title={nextQuest.desc}>
            <ScrollText className="h-3.5 w-3.5 text-amber-500" />
            军令 · {nextQuest.title}
            <span className="tabular-nums text-muted-foreground">
              {nextQuest.progress}/{nextQuest.target}
            </span>
          </span>
        ) : null}
        <span className={cn(HUD_CELL, "ml-auto")}>
          {finished
            ? "全剧终"
            : run
              ? `营地 ${clearedNodes.length}/${run.nodes.length} · 尚余 ${openNodeList.length} 处可攻 · 遭遇 ${state?.encounters ?? 0}/${SAGA_MAX_ENCOUNTERS}`
              : "整装待发"}
          {run ? (
            <span className="text-muted-foreground">
              {saveState === "saving" ? " · 存档中…" : saveState === "saved" ? " · 已自动存档" : ""}
            </span>
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
            if (Math.hypot(field.city.x - wx, field.city.y - wy) < 44) {
              enterTown();
              return;
            }
            // 野外点空白处：翻看队伍状态、道具、装备与编制。
            setPanel("status");
          }}
        />

        {inTown && run ? (
          <TownScene
            chapterIndex={run.startSave.chapter}
            tickets={tickets}
            onPick={(spot) => {
              if (spot === "gate") {
                setPanel(null);
                setInTown(false);
                return;
              }
              setPanel(spot);
            }}
          />
        ) : null}

        {battle ? (
          <div className="border-t border-amber-200/20 bg-[#14110d] px-2 py-2 sm:px-3">
            <div className="mx-auto w-full max-w-5xl text-xs text-amber-50">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-0.5 pb-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium">{battle.battle.nodeName}</span>
                  <span className="shrink-0 text-[11px] text-white/50">
                    第 {battle.battle.round} 回合 · 敌 {battle.battle.enemies.filter((unit) => !unit.downed).length}{" "}
                    {battle.encounter ? "队" : "将"}
                  </span>
                </span>
                <span className="flex shrink-0 gap-2">
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

              {/* 战报：动画中的事件优先，平时留最近三条 */}
              <div className="mt-2 min-h-[30px] rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-amber-100/80">
                {(anim && anim.events.length > 0 ? anim.events.slice(-3) : battle.battle.log.slice(-3)).map(
                  (event, index) => (
                    <p key={index} className="truncate">
                      {event.text}
                    </p>
                  ),
                )}
                {battle.battle.log.length === 0 && !anim ? (
                  <p className="text-white/45">点画布上的敌将可设为目标；逐将选好战术后执行，撤退只退出这一场。</p>
                ) : null}
              </div>

              <div className="mt-2 space-y-1.5">
                {battle.battle.party.map((unit) => {
                  const pick = battle.picks[unit.id];
                  const alive = !unit.downed;
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
                            : pick.a === "recruit"
                              ? "招降"
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
                        <span className="text-[11px] tabular-nums text-sky-200/80">
                          策 {unit.tacticPoints}
                        </span>
                        <span className="ml-auto text-[11px] text-amber-100/55">{order}</span>
                      </div>
                      {alive && pick ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {(
                            [
                              ["attack", "攻击"],
                              ["tactic", "计策"],
                              ["guard", "防御"],
                              ["item", "道具"],
                              ["recruit", "招降"],
                            ] as [BattleAction, string][]
                          ).map(([action, label]) => {
                            const disabled =
                              (action === "tactic" && (unit.tacticPoints <= 0 || unit.tactics.length === 0)) ||
                              (action === "item" && availableItems(battle.scratch).length === 0) ||
                              (action === "recruit" && !canRecruit(battle.battle));
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
                            <span className="flex flex-wrap gap-1.5">
                              {unit.tactics.map((tactic) => (
                                <button
                                  key={tactic}
                                  type="button"
                                  title={SAGA_TACTIC_BY_ID.get(tactic)?.desc}
                                  onClick={() =>
                                    setBattle((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            picks: {
                                              ...prev.picks,
                                              [unit.id]: { a: "tactic", t: tactic, target: prev.picks[unit.id]?.target },
                                            },
                                          }
                                        : prev,
                                    )
                                  }
                                  className={cn(
                                    "rounded-md border px-2 py-1 text-[11px]",
                                    pick.t === tactic ? "border-amber-300 bg-amber-300/20" : "border-white/15",
                                  )}
                                >
                                  {SAGA_TACTIC_BY_ID.get(tactic)?.name ?? tactic}
                                </button>
                              ))}
                            </span>
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

        {/* 弹层 */}
        {panel ? (
          <div className={PANEL_CLASS}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{panelTitle}</span>
                {inCityPanel ? (
                  <span className="flex flex-wrap gap-1">
                    {FIELD_FACILITIES.map((spot) => (
                      <button
                        key={spot.id}
                        type="button"
                        title={spot.hint}
                        onClick={() => setPanel(spot.id)}
                        className={cn(
                          "rounded border px-2 py-0.5 text-[11px]",
                          panel === spot.id
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border hover:bg-muted",
                        )}
                      >
                        {spot.label}
                      </button>
                    ))}
                  </span>
                ) : null}
              </span>
              <button type="button" onClick={() => setPanel(null)} className="rounded p-1 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className={PANEL_BODY}>
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
                      <PartyList save={save} />
                    </div>
                  ) : (
                    <DexGrid save={save} gearById={gearById} />
                  )}
                </div>
              ) : null}

              {panel === "forge" || panel === "herb" ? (
                <div className="space-y-3">
                  <NpcIntro npcId={panel === "forge" ? "blacksmith" : "herbalist"} />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>城内买卖一律用试炼券，金币在钱庄可存成 tcr，也可直接换成试炼券。</span>
                    <span className="flex items-center gap-1">
                      <Ticket className="h-3.5 w-3.5 text-violet-400" />
                      {tickets} 张
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {SAGA_ITEMS.filter((item) =>
                      panel === "forge" ? item.kind === "weapon" || item.kind === "armor" : item.kind === "consumable",
                    ).map((item) => {
                      const price = item.priceTickets;
                      const owned =
                        item.kind === "consumable" ? save.bag[item.id] ?? 0 : save.gear[item.id] ?? 0;
                      return (
                        <div key={item.id} className="rounded-lg border border-border p-2.5">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{item.name}</span>
                            <span className="flex items-center gap-1 tabular-nums text-muted-foreground">
                              <Ticket className="h-3 w-3 text-violet-400" />
                              {price} 张
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">{item.desc} · 持有 {owned}</p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-1.5"
                            disabled={!run || tickets < price || busy === `buy:${item.id}`}
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
                        强化：每级提升两成基础属性，最高 +{SAGA_FORGE_MAX_LEVEL} 级；换将、卸装都不掉级。
                      </p>
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
                                        <Ticket className="h-3 w-3 text-violet-400" />
                                        {cost} 张
                                      </>
                                    )}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={!run || maxed || tickets < cost || working}
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
                    </div>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    买入的装备进编成所穿戴，伤药在战斗中取用；装备可以换给任何武将。
                  </p>
                </div>
              ) : null}

              {panel === "supply" ? (
                <div className="space-y-3">
                  <NpcIntro npcId="quartermaster" />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>用试炼券购买，只在这次行军中生效；被动军需每次限一份。</span>
                    <span className="flex items-center gap-1">
                      <Ticket className="h-3.5 w-3.5 text-violet-400" />
                      {tickets} 张
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {SAGA_ITEMS.filter((item) => item.kind === "supply").map((item) => {
                      const bought = run?.purchases.filter((purchase) => purchase.itemId === item.id) ?? [];
                      const passive = item.supply !== "heal" && item.supply !== "revive";
                      const maxed = passive && bought.length > 0;
                      return (
                        <div key={item.id} className="rounded-lg border border-border p-2.5">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{item.name}</span>
                            <span className="flex items-center gap-1 tabular-nums text-muted-foreground">
                              <Ticket className="h-3 w-3 text-violet-400" />
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
                            disabled={maxed || tickets < item.priceTickets || busy === `buy:${item.id}`}
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
                    <span>钱庄两桩生意：金币存成 tcr 等平定到账，也可以直接换成试炼券当场用。</span>
                    <span className="flex items-center gap-1 tabular-nums">
                      <Coins className="h-3.5 w-3.5 text-amber-500" />
                      {formatCredits(save.gold)} 金
                    </span>
                  </div>

                  <section className="space-y-2 rounded-lg border border-border p-2.5">
                    <p className="text-sm font-medium">金币 → tcr</p>
                    <p className="text-xs text-muted-foreground">
                      每 {bank.goldPerTcr} 金换 1 tcr（按整档收），平定此地时与通关奖励一起到账；
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
                          save.gold < depositGoldAmount
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
                      <span>金币 → 试炼券</span>
                      <span className="flex items-center gap-1 text-xs font-normal tabular-nums text-muted-foreground">
                        <Ticket className="h-3.5 w-3.5 text-violet-400" />
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
                          busy === "bank:coupon"
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
                        disabled={!run || goldPerTicket <= 0 || exchangeMax < 1 || busy === "bank:coupon"}
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
                    金币存成 tcr 在平定此地时结算；换成试炼券则立刻到账，用来买装备、伤药、军需、住店或训练。
                  </p>
                </div>
              ) : null}

              {panel === "inn" ? (
                <div className="space-y-3">
                  <NpcIntro npcId="innkeeper" />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>住一次收 {SAGA_INN_PRICE_TICKETS} 张试炼券，住下就把上阵武将的兵力补满。</span>
                    <span className="flex items-center gap-1 tabular-nums">
                      <Ticket className="h-3.5 w-3.5 text-violet-400" />
                      每次 {SAGA_INN_PRICE_TICKETS} 张券
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
                    disabled={innBlocked !== null || busy === `buy:${SAGA_INN_ITEM_ID}`}
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
                    <Button size="sm" variant={hallTab === "formation" ? "primary" : "outline"} onClick={() => setHallTab("formation")}>
                      阵型
                    </Button>
                  </div>

                  {hallTab === "party" ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        上阵最多 {5} 人；后备 {save.reserve.length}/12。点击「上阵/移出」调整，阵亡只在战斗中发生，换代后兵力自动补满。
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {[...save.party, ...save.reserve].map((member) => {
                          const def = SAGA_GENERAL_BY_ID.get(member.id);
                          const stats = generalStats(member);
                          const active = save.party.some((row) => row.id === member.id);
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
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium">
                                      {def?.name ?? member.id}
                                      <span className="ml-1.5 text-xs text-muted-foreground">Lv{member.level}</span>
                                    </span>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={active ? save.party.length <= 1 : save.party.length >= 5}
                                      onClick={() =>
                                        setActiveParty(
                                          active
                                            ? save.party.filter((row) => row.id !== member.id).map((row) => row.id)
                                            : [...save.party.map((row) => row.id), member.id],
                                        )
                                      }
                                    >
                                      {active ? "移出" : "上阵"}
                                    </Button>
                                  </div>
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    武 {stats.force} · 智 {stats.intellect} · 防 {stats.defense} · 速 {stats.speed} · 兵力 {stats.maxTroops}
                                  </p>
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    {def?.title} · {def?.tactics.map((tactic) => SAGA_TACTIC_BY_ID.get(tactic)?.name).join(" / ") || "无计策"}
                                  </p>
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    武器 {member.weapon ? itemName(member.weapon) : "无"} · 防具 {member.armor ? itemName(member.armor) : "无"}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
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
                            </p>
                            <div className="mt-1 grid gap-2 sm:grid-cols-2">
                              {(["weapon", "armor"] as const).map((slot) => {
                                const worn = slot === "weapon" ? member.weapon : member.armor;
                                const options = SAGA_ITEMS.filter((item) => item.kind === slot);
                                return (
                                  <label key={slot} className="flex items-center gap-1.5 text-xs">
                                    <span className="w-8 text-muted-foreground">{slot === "weapon" ? "武器" : "防具"}</span>
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
                                            {item.name}（{slot === "weapon" ? `攻+${item.atk}` : `防+${item.def}`}）
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

                  {hallTab === "formation" ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {SAGA_FORMATIONS.map((formation) => {
                        const active = save.formation === formation.id;
                        const beats = SAGA_FORMATIONS.find((row) => row.id === formation.beats)?.name ?? "";
                        return (
                          <button
                            key={formation.id}
                            type="button"
                            onClick={() => setFormation(formation.id)}
                            className={cn(
                              "rounded-lg border p-2.5 text-left text-sm",
                              active ? "border-primary/70 bg-primary/5" : "border-border hover:border-primary/40",
                            )}
                          >
                            <span className="flex items-center justify-between font-medium">
                              {formation.name}
                              {active ? <span className="text-[11px] text-primary">当前</span> : null}
                            </span>
                            <p className="mt-0.5 text-xs text-muted-foreground">{formation.desc}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">克制 {beats}</p>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {panel === "train" ? (
                <div className="space-y-3">
                  <NpcIntro npcId="trainer" />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      每级 {SAGA_TRAINING_TICKETS_PER_LEVEL} 张试炼券，一次练到目标等级；
                      训练场上限 {trainingLevelCap(save)} 级（每平定一处地方 +3，最高 30 级）。
                    </span>
                    <span className="flex items-center gap-1 tabular-nums">
                      <Ticket className="h-3.5 w-3.5 text-violet-400" />
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
                      const cap = trainingLevelCap(save);
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
                              <Ticket className="h-3 w-3 text-violet-400" />
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
                    <span>兑换活动券或买珍宝礼包，到账后右上角的试炼券数量实时刷新。</span>
                    <span className="flex items-center gap-1 tabular-nums">
                      <Ticket className="h-3.5 w-3.5 text-violet-400" />
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
                <StatusPanel save={save} state={state} rules={run?.rules ?? 2} />
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
                    <p className="mb-1.5 text-sm font-medium">军令</p>
                    <QuestBoard quests={quests} />
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
                  maxReward={props.maxReward}
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

              {panel === "army" ? (
                <ArmyPanel
                  run={run}
                  state={state}
                  field={field}
                  maxReward={props.maxReward}
                  cleared={clearedNodes}
                  open={openNodeList}
                  quests={quests}
                  onClose={() => setPanel(null)}
                  onVisit={(node) => {
                    const camp = field.camps.find((row) => row.node === node);
                    if (camp) walkTo(camp.x, camp.y + 32, () => openCamp(node));
                  }}
                  onCity={() => enterTown()}
                  onInn={goInn}
                />
              ) : null}
            </div>
          </div>
        ) : null}

        {banner ? (
          <div className="absolute inset-x-3 top-3 z-30 flex items-center justify-between gap-2 rounded-lg border border-border bg-card/95 px-3 py-2 text-sm shadow-lg">
            <span>
              {banner.kind === "won" ? "战斗胜利" : "战斗失利"} · {banner.name}
              {banner.kind === "won"
                ? ` · +${banner.gold} 金 / +${banner.exp} 经验`
                : " · 回城住店可重整旗鼓"}
            </span>
            <button type="button" onClick={() => setBanner(null)} className="rounded p-1 hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {!run && !settlement ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-2xl">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">三国讨逆传</p>
              <h3 className="mt-1 text-xl font-semibold">
                {chapter.town} · {chapter.name}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">{chapter.blurb}</p>
              <div className="mt-2 space-y-1 border-l-2 border-primary/40 pl-2 text-xs text-muted-foreground">
                {chapter.story.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
              {finished ? (
                <div className="mt-3 rounded-lg border border-primary/40 bg-primary/5 p-3 text-xs">
                  <p className="text-sm font-medium">全剧终</p>
                  <p className="mt-1 text-muted-foreground">
                    八处地方皆定，讨逆之路已经走完。武将、图鉴与战史都留在存档里。
                  </p>
                </div>
              ) : (
                <>
                  <p className="mt-2 text-xs text-muted-foreground">
                    行军一线：{chapter.stages.join(" · ")}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className={HUD_CELL}>{save.party.length} 将上阵</span>
                    <span className={HUD_CELL}>{formatCredits(save.gold)} 金</span>
                    <span className={HUD_CELL}>战力 {partyPower(save)}</span>
                    <span className={HUD_CELL}>{tickets} 张试炼券</span>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    从{chapter.town}出城免费。出城前可在城中街景里逛铁匠铺、药铺、军需帐、客栈、钱庄、
                    酒馆、营帐、训练场、活动券与桃园碑，铺子里都有掌柜招呼，买卖仍用试炼券。
                    出城后是张俯视大地图，方向键/WASD 自由行走，沿官道会路过村庄、祠堂与渡口，
                    走过去能听一段本地故事、记一条军令；走到哪座营跟前就打哪座，
                    主帅本阵要先拔尽其余 {props.nodeCount - 1} 座营。营寨全部攻破、剧情才会推进到下一处地方。
                    官道、草地、海边滩涂与树林会随机杀出散兵、山贼、盗贼，每趟最多 {SAGA_MAX_ENCOUNTERS} 场，
                    只有城墙内与城门洞不会遇敌。每一步都会自动存档：撤退只结束当前这一场仗，
                    兵败也能回城住店重整，等级、金币、装备与招降武将都不会丢。
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={() => void startRun()} disabled={busy === "start"}>
                      {busy === "start" ? "出发中…" : `从${chapter.town}出发`}
                    </Button>
                    <Button variant="outline" onClick={() => setPanel("record")}>
                      查看存档与图鉴
                    </Button>
                  </div>
                </>
              )}
              {finished ? (
                <div className="mt-4">
                  <Button variant="outline" onClick={() => setPanel("record")}>
                    查看存档与图鉴
                  </Button>
                </div>
              ) : null}
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
        {(run ? field.camps : []).map((camp) => {
          const name = run?.nodes[camp.node]?.name ?? "敌营";
          const done = clearedNodes.includes(camp.node);
          const available = openNodeList.includes(camp.node);
          return (
            <Button
              key={camp.node}
              variant="outline"
              size="sm"
              disabled={Boolean(battle) || Boolean(settlement) || !run || inTown}
              onClick={() => walkTo(camp.x, camp.y + 32, () => openCamp(camp.node))}
            >
              <Swords className="h-3.5 w-3.5" />
              {done ? "已破" : available ? "可攻" : "未可"} · {name}
            </Button>
          );
        })}
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
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="grid grid-cols-3 gap-1">
          <span />
          <PadButton label="↑" dir="up" onKey={pressKey} />
          <span />
          <PadButton label="←" dir="left" onKey={pressKey} />
          <PadButton label="↓" dir="down" onKey={pressKey} />
          <PadButton label="→" dir="right" onKey={pressKey} />
        </div>
        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!run || Boolean(battle) || Boolean(settlement) || inTown}
            onClick={() => {
              const spot = hotspotRef.current;
              if (spot) interactRef.current(spot);
            }}
          >
            交互
          </Button>
          <p className="max-w-md text-xs text-muted-foreground">
            操作：方向键 / WASD 或左侧摇杆四向行走，走到城门口、敌营、乡野点位旁按 E / 回车（或点「交互」）；
            也可以直接点击地图上的城池、营寨、村庄与渡口。点城池进城中街景，从街景点铺子办事、
            从城门出城。战斗为回合制：逐将选择攻击 / 计策 / 防守 / 道具 / 招降，或按「总攻击」「自动战斗」速战。
            野外草地、树林会随机遇敌，敌军编成由种子与第几场遭遇推出。
            走位本身不影响任何数值：战报只上传编制、购物与「打哪座营、打不打这场遭遇、怎么打」的指令，
            服务端按种子重放判定；战斗指令存在本机，刷新页面可以接着打。剧情对话、军令与走访记录只在本机，
            不参与结算。
          </p>
        </div>
      </div>
    </div>
  );
}

function PadButton({
  label,
  dir,
  onKey,
}: {
  label: string;
  dir: "up" | "down" | "left" | "right";
  onKey: (dir: "up" | "down" | "left" | "right", pressed: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-label={dir}
      onPointerDown={(event) => {
        event.preventDefault();
        onKey(dir, true);
      }}
      onPointerUp={() => onKey(dir, false)}
      onPointerLeave={() => onKey(dir, false)}
      onPointerCancel={() => onKey(dir, false)}
      className="h-11 w-11 rounded-lg border border-border bg-card text-lg leading-none select-none active:bg-muted"
    >
      {label}
    </button>
  );
}

/** 野外点空地翻出来的行囊页：武将状态、道具、装备与队伍一屏看完。 */
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
        <StatusRoster members={save.party} active state={state} rules={rules} />
      </section>

      {save.reserve.length > 0 ? (
        <section className="space-y-2">
          <p className="text-sm font-medium">后备武将</p>
          <StatusRoster members={save.reserve} active={false} state={state} rules={rules} />
        </section>
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
        <p className="text-sm font-medium">队伍</p>
        <div className="flex flex-wrap gap-1.5">
          {[...save.party, ...save.reserve].map((member) => (
            <span
              key={member.id}
              className={cn(
                "rounded border px-2 py-0.5 text-xs",
                save.party.some((row) => row.id === member.id)
                  ? "border-primary/50 bg-primary/5"
                  : "border-border text-muted-foreground",
              )}
            >
              {generalName(member.id)} Lv{member.level}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatusRoster({
  members,
  active,
  state,
  rules,
}: {
  members: TrialSave["party"];
  active: boolean;
  state: SagaReplayState | null;
  rules: number;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {members.map((member) => {
        const def = SAGA_GENERAL_BY_ID.get(member.id);
        const stats = generalStats(member);
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
                width={44}
                height={55}
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
                  武 {stats.force} · 智 {stats.intellect} · 防 {stats.defense} · 速 {stats.speed}
                </p>
                <div className="mt-1 h-1.5 overflow-hidden rounded bg-muted">
                  <div
                    className={cn("h-full", ratio <= 0.35 ? "bg-red-500" : "bg-emerald-500")}
                    style={{ width: `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%` }}
                  />
                </div>
                <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                  兵力 {current}/{max} · 经验 {member.exp}/{expToNext(member.level)}
                </p>
                {rules >= 2 && (def?.traits?.length ?? 0) > 0 ? (
                  <p className="mt-0.5 flex flex-wrap gap-1 text-[11px]">
                    <span className="text-muted-foreground">特性</span>
                    {(def?.traits ?? []).map((traitId) => {
                      const trait = SAGA_TRAIT_BY_ID.get(traitId);
                      return (
                        <span key={traitId} title={trait?.desc} className="rounded bg-primary/10 px-1 text-primary">
                          {trait?.name ?? traitId}
                        </span>
                      );
                    })}
                  </p>
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

function PartyList({ save }: { save: TrialSave }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {[...save.party, ...save.reserve].map((member) => {
        const def = SAGA_GENERAL_BY_ID.get(member.id);
        const stats = generalStats(member);
        const active = save.party.some((row) => row.id === member.id);
        return (
          <div key={member.id} className="rounded-lg border border-border p-2 text-xs">
            <div className="flex gap-2">
              <SagaPortrait
                generalId={member.id}
                gear={{ weapon: member.weapon, armor: member.armor }}
                width={38}
                height={48}
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-center justify-between text-sm font-medium">
                  <span>
                    {def?.name ?? member.id} <span className="text-muted-foreground">Lv{member.level}</span>
                  </span>
                  <span className="text-[11px] text-muted-foreground">{active ? "上阵" : "后备"}</span>
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  武 {stats.force} · 智 {stats.intellect} · 防 {stats.defense} · 速 {stats.speed} · 兵力 {stats.maxTroops}
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  经验 {member.exp}/{expToNext(member.level)} · {def?.title}
                </p>
                <p className="mt-0.5 text-muted-foreground">
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

function DexGrid({
  save,
  gearById,
}: {
  save: TrialSave;
  gearById: Record<string, { weapon: string | null; armor: string | null }>;
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
                    width={42}
                    height={52}
                  />
                ) : (
                  <span className="flex h-[52px] w-[42px] shrink-0 items-center justify-center rounded-md border border-border/40 bg-muted/20 text-lg text-muted-foreground">
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
                        武 {def.force} · 智 {def.intellect} · 防 {def.defense} · 速 {def.speed}
                      </p>
                      <p className="mt-0.5 text-muted-foreground">
                        {def.tactics.length > 0
                          ? def.tactics.map((tactic) => SAGA_TACTIC_BY_ID.get(tactic)?.name).join(" / ")
                          : "无计策"}
                      </p>
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
  maxReward,
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
  maxReward: number;
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
            {target.kind === "boss" ? "主帅本阵" : target.kind === "elite" ? "精锐营" : "野战营"}
          </span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{target.blurb}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          已破 {state.clearedNodes.length}/{run.nodes.length} 座营 · 此行金币 +{state.goldGained} ·
          先破其余营寨，才能直取主帅本阵
        </p>
      </div>

      <div className="rounded-lg border border-border p-3">
        <p className="text-xs text-muted-foreground">
          敌将：{target.enemies.map((enemy) => `${enemy.name}（Lv${enemy.level}，兵力 ${enemy.troops}）`).join("、")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          战利品约 {target.rewardGold} 金 / {target.rewardExp} 经验；平定此处最高 {formatCredits(maxReward)} tcr（未平定不发）。
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

function ArmyPanel({
  run,
  state,
  field,
  maxReward,
  cleared,
  open,
  quests,
  onClose,
  onVisit,
  onCity,
  onInn,
}: {
  run: SagaRun | null;
  state: SagaReplayState | null;
  field: SagaField;
  maxReward: number;
  cleared: number[];
  open: number[];
  quests: SagaQuest[];
  onClose: () => void;
  onVisit: (node: number) => void;
  onCity: () => void;
  onInn: () => void;
}) {
  if (!run || !state) {
    return <p className="text-sm text-muted-foreground">还没有进行中的行军。</p>;
  }
  const chapter = SAGA_CHAPTERS[Math.min(SAGA_CHAPTERS.length - 1, run.nodes[0]?.chapter ?? 0)];
  const total = run.nodes.length;
  const won = state.scene === "won";
  const lost = state.scene === "lost";
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-lg border border-border p-3">
        <p className="font-medium">
          {chapter?.town ?? "此地"} · {chapter?.name ?? "行军"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{chapter?.blurb}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          行军大地图上可自由走位，先打哪座营由你决定 · 已破 {cleared.length}/{total} 座，
          当前可攻 {open.length} 座 · 平定此地最高 {formatCredits(maxReward)} tcr
        </p>
      </div>

      <div className="rounded-lg border border-border p-3">
        <p className="font-medium">这一趟的军令</p>
        <div className="mt-2">
          <QuestBoard quests={quests} />
        </div>
      </div>

      <div className="space-y-1">
        {run.nodes.map((node, index) => {
          const done = cleared.includes(index);
          const available = open.includes(index);
          const camp = field.camps.find((row) => row.node === index);
          const li = camp ? Math.max(1, Math.round((camp.x - field.city.x) / field.tile)) : 0;
          return (
            <div
              key={index}
              className={cn(
                "flex items-center justify-between gap-2 rounded border px-2.5 py-1.5 text-xs",
                available ? "border-primary/60 bg-primary/5" : "border-border",
                done && "opacity-65",
              )}
            >
              <span>
                {node.kind === "boss" ? "首领" : node.kind === "elite" ? "精英" : "野战"} · {node.name}
                <span className="ml-1.5 text-muted-foreground">{camp ? `城东南约 ${li} 里` : ""}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
                {done ? "已破" : available ? "可攻" : "未可"}
                {!done && !lost && !won ? (
                  <Button size="sm" variant="outline" onClick={() => onVisit(index)} disabled={!available}>
                    前往
                  </Button>
                ) : null}
              </span>
            </div>
          );
        })}
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
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
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
            <p className="text-xs text-muted-foreground">通关奖励</p>
            <p className="tabular-nums font-medium">{formatCredits(settlement.clearReward)} tcr</p>
          </div>
        </div>
        {settlement.bankTcr > 0 ? (
          <p className="mt-2 text-sm">
            钱庄存金：
            <span className="font-medium text-primary">
              {settlement.bankGold} 金 → +{formatCredits(settlement.bankTcr)} tcr
            </span>
            <span className="ml-2 text-xs text-muted-foreground">与通关奖励一起到账</span>
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
            未平定此处不发通关奖励；钱庄存金仍会到账。等级、金币、装备与招降武将都保留，整备后可再走一遍。
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
