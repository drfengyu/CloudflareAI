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
import { cn } from "@/lib/utils";
import { formatCredits } from "@/lib/billing/credits";
import {
  SAGA_CHAPTERS,
  SAGA_FORMATIONS,
  SAGA_GENERAL_BY_ID,
  SAGA_ITEM_BY_ID,
  SAGA_ITEMS,
  SAGA_TACTIC_BY_ID,
} from "@/lib/trial/saga/data";
import { resolveBattleRound, startBattle } from "@/lib/trial/saga/battle";
import {
  autoBattleRounds,
  canEngageNode,
  openNodes,
  replaySagaRun,
  sanitizeSagaCommands,
} from "@/lib/trial/saga/run";
import {
  fieldHitsSolid,
  fieldHotspotNear,
  fieldSpeedAt,
  generateSagaField,
  sagaFieldFor,
  type FieldHotspot,
} from "@/lib/trial/saga/map";
import { expToNext, generalStats, partyPower } from "@/lib/trial/saga/state";
import {
  SAGA_BANK_GOLD_PER_TCR,
  SAGA_BANK_MAX_GOLD_PER_RUN,
  SAGA_GOLD_PACKS,
  bankCreditsForGold,
} from "@/lib/trial/saga/bank";
import type {
  FormationId,
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
import {
  buyTrialGoldAction,
  buyTrialSupplyAction,
  startTrialAction,
  submitTrialAction,
} from "@/app/(dashboard)/trial/actions";
import {
  DEFAULT_VIEW,
  FIELD_FACILITIES,
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

type PanelId = FieldFacilityId | "camp" | "army" | "dex" | null;
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
  /** 打的是地图上哪座营。 */
  node: number;
}

export interface TrialGameProps {
  initialRun: ActiveTrialRun | null;
  save: TrialSave;
  initialTickets: number;
  /** 当前可用 tcr（未过期的临时余额），钱庄换金用。 */
  initialTcr: number;
  priceTickets: number;
  unitCredits: number;
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

export function TrialGame(props: TrialGameProps) {
  const router = useRouter();
  const [runId, setRunId] = useState<string | null>(props.initialRun?.runId ?? null);
  const [run, setRun] = useState<SagaRun | null>(props.initialRun?.run ?? null);
  const [commands, setCommands] = useState<SagaCommand[]>(() =>
    props.initialRun ? loadStoredCommands(props.initialRun.runId, props.initialRun.run.seed) : [],
  );
  const [tickets, setTickets] = useState(props.initialTickets);
  const [tcr, setTcr] = useState(props.initialTcr);
  /** revalidate 后 props 带服务端最新余额（比如刚买完活动券），渲染期对齐一次，不放进 effect。 */
  const [syncedTickets, setSyncedTickets] = useState(props.initialTickets);
  if (props.initialTickets !== syncedTickets) {
    setSyncedTickets(props.initialTickets);
    setTickets(props.initialTickets);
  }
  const [syncedTcr, setSyncedTcr] = useState(props.initialTcr);
  if (props.initialTcr !== syncedTcr) {
    setSyncedTcr(props.initialTcr);
    setTcr(props.initialTcr);
  }
  const [panel, setPanel] = useState<PanelId>(null);
  const [hallTab, setHallTab] = useState<"party" | "gear" | "formation">("party");
  const [dexTab, setDexTab] = useState<"save" | "dex">("save");
  const [campNode, setCampNode] = useState<number | null>(null);
  const [battle, setBattle] = useState<BattleSession | null>(null);
  const [anim, setAnim] = useState<BattleAnimation | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [settlement, setSettlement] = useState<TrialSettlement | null>(null);
  const [banner, setBanner] = useState<{ kind: "won" | "lost"; name: string; gold: number; exp: number } | null>(null);
  const submitLock = useRef(false);

  const replay = useMemo(
    () => (run ? replaySagaRun(run, commands) : null),
    [run, commands],
  );
  const state = replay?.state ?? null;
  const save = state?.save ?? props.save;
  const storageKey = run && runId ? `trial-saga:${runId}:${run.seed}` : null;

  const heroDef = SAGA_GENERAL_BY_ID.get(save.party[0]?.id ?? "liubei");
  const chapter = SAGA_CHAPTERS[Math.min(SAGA_CHAPTERS.length - 1, save.chapter)];
  const finished = save.stats.wins >= SAGA_CHAPTERS.length;
  const bankedGold = state?.bankedGold ?? 0;
  const bankTcr = bankCreditsForGold(bankedGold);
  const bankRoom = Math.max(0, SAGA_BANK_MAX_GOLD_PER_RUN - bankedGold);

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

  const submit = useCallback(async () => {
    if (!runId || submitLock.current) return;
    submitLock.current = true;
    setBusy("submit");
    try {
      const result = await submitTrialAction({ runId, commands });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setSettlement(result.data);
      setBattle(null);
      setPanel(null);
      if (storageKey) window.localStorage.removeItem(storageKey);
      setRunId(null);
    } finally {
      setBusy(null);
      submitLock.current = false;
    }
  }, [commands, runId, storageKey]);

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
      setTickets((prev) => Math.max(0, prev - props.priceTickets));
      toast.success(`前往 ${SAGA_CHAPTERS[Math.min(SAGA_CHAPTERS.length - 1, data.run.startSave.chapter)].town}`);
    } finally {
      setBusy(null);
    }
  }, [props.priceTickets]);

  const buySupply = useCallback(
    async (itemId: string) => {
      if (!runId || !run) return;
      setBusy(`buy:${itemId}`);
      try {
        const purchaseId = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
        const result = await buyTrialSupplyAction({
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
        toast.success(`${itemName(itemId)}已备好`);
      } finally {
        setBusy(null);
      }
    },
    [commands.length, run, runId],
  );

  const bankGold = useCallback(
    (gold: number) => {
      if (!run) return;
      if (gold > bankRoom) {
        toast.error(`每次行军最多存 ${SAGA_BANK_MAX_GOLD_PER_RUN} 金`);
        return;
      }
      if (save.gold < gold) {
        toast.error("金币不够，再打几仗吧");
        return;
      }
      appendCommand({ k: "bank", g: gold });
      toast.success(`已存 ${gold} 金，收兵时到账 ${bankCreditsForGold(gold)} tcr`);
    },
    [appendCommand, bankRoom, run, save.gold],
  );

  const buyGoldPack = useCallback(
    async (packId: string) => {
      if (!runId || !run) return;
      setBusy(`gold:${packId}`);
      try {
        const purchaseId = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
        const result = await buyTrialGoldAction({
          runId,
          packId,
          purchaseId,
          cmdIndex: commands.length,
        });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        setRun((prev) => (prev ? { ...prev, purchases: result.data.purchases } : prev));
        setTcr(result.data.tcr);
        toast.success("金币已到账");
      } finally {
        setBusy(null);
      }
    },
    [commands.length, run, runId],
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
  }, [battle, anim]);

  useEffect(() => {
    settlementRef.current = Boolean(settlement);
  }, [settlement]);

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
  }, [field]);

  useEffect(() => {
    interactRef.current = (hotspot) => {
      if (settlementRef.current) return;
      if (hotspot.kind === "city") {
        setPanel("hall");
        return;
      }
      if (hotspot.camp) {
        setCampNode(hotspot.camp.node);
        setPanel("camp");
      }
    };
  }, []);

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
      let moving = false;
      if (map && !inBattle && !settlementRef.current) {
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
        map && hud.active && !inBattle && !settlementRef.current
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
      if (settlement || busy === "submit") return;
      const key = event.key.toLowerCase();
      if (key === "escape") {
        setPanel(null);
        return;
      }
      if (panel || battle) return;
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
  }, [battle, busy, panel, settlement, setMoveKey]);

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

  const openCamp = useCallback((node: number) => {
    setCampNode(node);
    setPanel("camp");
  }, []);


  // ---- 战斗 ----
  const beginBattle = useCallback(
    (node: number) => {
      if (!run || !state) return;
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
      };
      setBattle(session);
      setFocusId(Object.keys(session.picks)[0] ?? null);
      setAnim(null);
      setBanner(null);
      setPanel(null);
    },
    [run, state],
  );

  const commitBattle = useCallback(
    (session: BattleSession) => {
      appendCommand({ k: "battle", node: session.node, rounds: session.rounds });
      setBanner({
        kind: session.battle.phase === "won" ? "won" : "lost",
        name: session.battle.nodeName,
        gold: session.battle.rewardGold,
        exp: session.battle.rewardExp,
      });
      setBattle(null);
      setAnim(null);
      setFocusId(null);
    },
    [appendCommand],
  );

  const runRound = useCallback(
    (session: BattleSession, round: SagaRoundCommand[]) => {
      if (session.battle.phase !== "select") return;
      const next: BattleSession = { ...session, rounds: [...session.rounds, round] };
      resolveBattleRound(next.battle, round, next.scratch);
      setBattle(next);
      const events = next.battle.lastEvents;
      setAnim({ events, startedAt: performance.now(), stepMs: 460 });
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
      setBanner({
        kind: battleState.phase === "won" ? "won" : "lost",
        name: battleState.nodeName,
        gold: battleState.rewardGold,
        exp: battleState.rewardExp,
      });
      setPanel(null);
    },
    [appendCommand, run, state],
  );

  const retreatBattle = useCallback(() => {
    if (!battle) return;
    if (!window.confirm("撤退会立刻结束这次行军：阵亡与消耗不会返还，已攻克的营地存档保留。确定收兵？")) return;
    appendCommand({ k: "battle", node: battle.node, rounds: battle.rounds });
    setBattle(null);
    setAnim(null);
    setPanel(null);
    void submit();
  }, [appendCommand, battle, submit]);

  // ---- 面板动作 ----
  const buyGold = useCallback(
    (itemId: string) => {
      const item = SAGA_ITEM_BY_ID.get(itemId);
      if (!item) return;
      if (save.gold < (item.priceGold ?? 0)) {
        toast.error("金币不够，再打几仗吧");
        return;
      }
      appendCommand({ k: "shop", i: itemId });
    },
    [appendCommand, save.gold],
  );

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

  const battleLocked = Boolean(anim) || busy === "submit";
  const pressKey = useCallback(
    (dir: "up" | "down" | "left" | "right", pressed: boolean) => {
      keysRef.current[dir] = pressed;
    },
    [],
  );
  const inCityPanel = FIELD_FACILITIES.some((spot) => spot.id === panel);
  const panelTitle =
    panel === "dex"
      ? "武将图鉴"
      : panel === "camp"
        ? `敌营 · ${run?.nodes[campNode ?? 0]?.name ?? ""}`
        : panel === "army"
          ? "军情与收兵"
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
          <Coins className="h-3.5 w-3.5 text-emerald-500" />
          {formatCredits(tcr)} tcr
        </span>
        <span className={HUD_CELL}>
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          战力 {partyPower(save)}
        </span>
        <span className={HUD_CELL}>
          <Ticket className="h-3.5 w-3.5 text-violet-400" />
          {tickets} 张试炼券
        </span>
        <span className={cn(HUD_CELL, "ml-auto")}>
          {finished
            ? "全剧终"
            : run
              ? `营地 ${clearedNodes.length}/${run.nodes.length} · 尚余 ${openNodeList.length} 处可攻`
              : "整装待发"}
        </span>
      </div>

      <div className="relative -mx-5 overflow-hidden rounded-none border-y border-border bg-black sm:mx-0 sm:rounded-xl sm:border">
        <canvas
          ref={canvasRef}
          width={VIEW_W}
          height={VIEW_H}
          className="block aspect-video w-full cursor-pointer"
          onClick={(event) => {
            if (battle || settlement) return;
            const view = viewRef.current;
            const rect = event.currentTarget.getBoundingClientRect();
            const px = (event.clientX - rect.left) * (view.w / rect.width);
            const py = (event.clientY - rect.top) * (view.h / rect.height);
            const camX = Math.max(0, Math.min(field.worldW - view.w, playerRef.current.x - view.w / 2));
            const camY = Math.max(0, Math.min(field.worldH - view.h, playerRef.current.y - view.h / 2));
            const wx = px + camX;
            const wy = py + camY;
            const camp = field.camps.find((row) => Math.hypot(row.x - wx, row.y - wy) < 34);
            if (camp) {
              walkTo(camp.x, camp.y + 32, () => openCamp(camp.node));
              return;
            }
            if (Math.hypot(field.city.x - wx, field.city.y - wy) < 44) {
              walkTo(field.city.x, field.city.y, () => setPanel("hall"));
              return;
            }
            walkTo(wx, wy);
          }}
        />

        {battle ? (
          <div className="border-t border-border/70 bg-card p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium">
                {battle.battle.nodeName}
                <span className="ml-2 text-xs text-muted-foreground">
                  第 {battle.battle.round} 回合 · 敌军 {battle.battle.enemies.filter((unit) => !unit.downed).length} 将
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={allAttack} disabled={battleLocked}>
                  总攻击
                </Button>
                <Button size="sm" variant="outline" onClick={retreatBattle} disabled={battleLocked}>
                  撤退
                </Button>
                <Button size="sm" onClick={executeRound} disabled={battleLocked}>
                  执行本回合
                </Button>
              </div>
            </div>

            <div className="grid gap-2 lg:grid-cols-2">
              <div className="space-y-2">
                {battle.battle.party.map((unit) => {
                  const pick = battle.picks[unit.id];
                  const alive = !unit.downed;
                  return (
                    <div
                      key={unit.id}
                      className={cn(
                        "rounded-lg border px-2.5 py-2",
                        focusId === unit.id ? "border-primary/60 bg-primary/5" : "border-border",
                        !alive && "opacity-50",
                      )}
                      onClick={() => alive && setFocusId(unit.id)}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium">
                          {unit.name} <span className="text-muted-foreground">Lv{unit.level}</span>
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          兵力 {Math.max(0, unit.troops)}/{unit.maxTroops} · 计策点 {unit.tacticPoints}
                        </span>
                      </div>
                      {alive && pick ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {(
                            [
                              ["attack", "攻击"],
                              ["tactic", "计策"],
                              ["guard", "防守"],
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
                                  "rounded border px-2 py-0.5 text-[11px]",
                                  pick.a === action
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border hover:bg-muted",
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
                              className="rounded border border-border bg-background px-1 py-0.5 text-[11px]"
                            >
                              {battle.battle.enemies.map((enemy, index) =>
                                enemy.downed ? null : (
                                  <option key={enemy.id + index} value={index}>
                                    {enemy.name}
                                  </option>
                                ),
                              )}
                            </select>
                          ) : null}
                          {pick.a === "tactic" ? (
                            <span className="flex flex-wrap gap-1">
                              {unit.tactics.map((tactic) => (
                                <button
                                  key={tactic}
                                  type="button"
                                  onClick={() =>
                                    setBattle((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            picks: {
                                              ...prev.picks,
                                              [unit.id]: { a: "tactic", t: tactic },
                                            },
                                          }
                                        : prev,
                                    )
                                  }
                                  className={cn(
                                    "rounded border px-1.5 py-0.5 text-[11px]",
                                    pick.t === tactic ? "border-primary bg-primary/15" : "border-border",
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
                              className="rounded border border-border bg-background px-1 py-0.5 text-[11px]"
                            >
                              <option value="">选择道具</option>
                              {availableItems(battle.scratch).map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name} ×{item.count}
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                      ) : (
                        <p className="mt-1 text-[11px] text-destructive">已败退</p>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="space-y-2">
                {battle.battle.enemies.map((enemy, index) => (
                  <button
                    key={enemy.id + index}
                    type="button"
                    onClick={() => {
                      if (!focusId) return;
                      setBattle((prev) =>
                        prev
                          ? {
                              ...prev,
                              picks: {
                                ...prev.picks,
                                [focusId]: { ...prev.picks[focusId], a: "attack", target: index },
                              },
                            }
                          : prev,
                      );
                    }}
                    className={cn(
                      "w-full rounded-lg border px-2.5 py-2 text-left text-xs",
                      enemy.downed ? "border-border/40 opacity-40" : "border-border hover:border-primary/50",
                    )}
                  >
                    <span className="flex items-center justify-between">
                      <span className="font-medium">
                        {enemy.name}
                        {enemy.boss ? <span className="ml-1 text-[10px] text-destructive">首领</span> : null}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        兵力 {Math.max(0, enemy.troops)}/{enemy.maxTroops}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      Lv{enemy.level} · {enemy.title}
                      {enemy.recruitable && enemy.troops <= enemy.maxTroops * 0.35 ? " · 可招降" : ""}
                    </span>
                  </button>
                ))}
                {anim && anim.events.length > 0 ? (
                  <div className="rounded-lg border border-border bg-muted/40 p-2 text-[11px] text-muted-foreground">
                    {anim.events.slice(-3).map((event, index) => (
                      <p key={index}>{event.text}</p>
                    ))}
                  </div>
                ) : null}
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
                    <DexGrid save={save} />
                  )}
                </div>
              ) : null}

              {panel === "forge" || panel === "herb" ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    金币 {formatCredits(save.gold)} · 买入的装备进编成所穿戴，伤药在战斗中取用。
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {SAGA_ITEMS.filter((item) =>
                      panel === "forge" ? item.kind === "weapon" || item.kind === "armor" : item.kind === "consumable",
                    ).map((item) => {
                      const price = item.priceGold ?? 0;
                      const owned =
                        item.kind === "consumable" ? save.bag[item.id] ?? 0 : save.gear[item.id] ?? 0;
                      return (
                        <div key={item.id} className="rounded-lg border border-border p-2.5">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{item.name}</span>
                            <span className="tabular-nums text-muted-foreground">{formatCredits(price)} 金</span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">{item.desc} · 持有 {owned}</p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-1.5"
                            disabled={save.gold < price}
                            onClick={() => buyGold(item.id)}
                          >
                            购买
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    金币来自战斗战利品，走剧情时一直保留；装备可以换给任何武将。
                  </p>
                </div>
              ) : null}

              {panel === "supply" ? (
                <div className="space-y-3">
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
                            disabled={maxed || tickets < (item.priceTickets ?? 0) || busy === `buy:${item.id}`}
                            onClick={() => buySupply(item.id)}
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
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>存金在收兵时到账；换金即时入账，只扣 tcr。</span>
                    <span className="flex items-center gap-3 tabular-nums">
                      <span className="flex items-center gap-1">
                        <Coins className="h-3.5 w-3.5 text-amber-500" />
                        {formatCredits(save.gold)} 金
                      </span>
                      <span>{formatCredits(tcr)} tcr</span>
                    </span>
                  </div>

                  <section className="space-y-2 rounded-lg border border-border p-2.5">
                    <p className="text-sm font-medium">存金换 tcr</p>
                    <p className="text-xs text-muted-foreground">
                      100 金 = 1 tcr，每次行军最多 3 tcr（300 金），收兵时与通关奖励一起到账。
                      半途收兵刷来的金币换不回 5 cr 的军令钱。
                    </p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {[1, 2, 3].map((tier) => {
                        const gold = tier * SAGA_BANK_GOLD_PER_TCR;
                        return (
                          <Button
                            key={tier}
                            size="sm"
                            variant="outline"
                            disabled={save.gold < gold || bankRoom < gold}
                            onClick={() => bankGold(gold)}
                          >
                            存 {gold} 金 → {tier} tcr
                          </Button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      本次已存 {bankedGold} 金，收兵可得 {bankTcr} tcr，还可存 {bankRoom} 金。
                    </p>
                  </section>

                  <section className="space-y-2 rounded-lg border border-border p-2.5">
                    <p className="text-sm font-medium">tcr 换金</p>
                    <p className="text-xs text-muted-foreground">
                      1 tcr = 50 金，只扣未过期的 tcr，金币即刻入账。
                    </p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {SAGA_GOLD_PACKS.map((pack) => (
                        <Button
                          key={pack.id}
                          size="sm"
                          variant="outline"
                          disabled={tcr < pack.tcr || busy === `gold:${pack.id}`}
                          onClick={() => void buyGoldPack(pack.id)}
                        >
                          {busy === `gold:${pack.id}` ? "兑换中…" : `${pack.tcr} tcr → ${pack.gold} 金`}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      换来的金币能买装备与伤药；存金是 100 金换 1 tcr、换金是 1 tcr 买 50 金，
                      两边价差 2:1，来回倒不会多出钱。
                    </p>
                  </section>
                </div>
              ) : null}

              {panel === "hall" ? (
                <div className="space-y-3">
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

              {panel === "camp" ? (
                <CampPanel
                  run={run}
                  state={state}
                  node={campNode}
                  busy={busy}
                  maxReward={props.maxReward}
                  onBattle={beginBattle}
                  onAuto={autoBattle}
                  onSubmit={() => void submit()}
                  onClose={() => setPanel(null)}
                  onCity={() => walkTo(field.city.x, field.city.y, () => setPanel("hall"))}
                />
              ) : null}

              {panel === "army" ? (
                <ArmyPanel
                  run={run}
                  state={state}
                  field={field}
                  busy={busy}
                  maxReward={props.maxReward}
                  cleared={clearedNodes}
                  open={openNodeList}
                  onSubmit={() => void submit()}
                  onClose={() => setPanel(null)}
                  onVisit={(node) => {
                    const camp = field.camps.find((row) => row.node === node);
                    if (camp) walkTo(camp.x, camp.y + 32, () => openCamp(node));
                  }}
                  onCity={() => walkTo(field.city.x, field.city.y, () => setPanel("hall"))}
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
                : ""}
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
                    <span className={HUD_CELL}>{formatCredits(tcr)} tcr</span>
                    <span className={HUD_CELL}>战力 {partyPower(save)}</span>
                    <span className={HUD_CELL}>{tickets} 张试炼券</span>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    从{chapter.town}出城消耗 {props.priceTickets} 张试炼券。出城后是张俯视大地图，
                    方向键/WASD 自由行走，走到哪座营跟前就打哪座，主帅本阵要先拔尽其余 {props.nodeCount - 1} 座营；
                    营寨全部攻破、剧情才会推进到下一处地方。兵败可整备后再来，等级、金币、装备与招降武将都会保留。
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={() => void startRun()} disabled={busy === "start" || tickets < props.priceTickets}>
                      {busy === "start" ? "出发中…" : `从${chapter.town}出发（${props.priceTickets} 张券）`}
                    </Button>
                    <Button variant="outline" onClick={() => setPanel("record")}>
                      查看存档与图鉴
                    </Button>
                  </div>
                  {tickets < props.priceTickets ? (
                    <p className="mt-2 text-xs text-destructive">试炼券不足，先在下方兑换再用券出发。</p>
                  ) : null}
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
            priceTickets={props.priceTickets}
            tickets={tickets}
            busy={busy}
            onContinue={() => void startRun()}
            onClose={() => {
              setSettlement(null);
              setRun(null);
              setCommands([]);
              router.refresh();
            }}
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={Boolean(battle) || Boolean(settlement) || !run}
          onClick={() => walkTo(field.city.x, field.city.y, () => setPanel("hall"))}
        >
          <Home className="h-3.5 w-3.5" />
          回城整备
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={Boolean(battle) || Boolean(settlement) || !run}
          onClick={() => setPanel("army")}
        >
          <Flag className="h-3.5 w-3.5" />
          军情·收兵
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
              disabled={Boolean(battle) || Boolean(settlement) || !run}
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
          onClick={() => setPanel("dex")}
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
            disabled={!run || Boolean(battle) || Boolean(settlement)}
            onClick={() => {
              const spot = hotspotRef.current;
              if (spot) interactRef.current(spot);
            }}
          >
            交互
          </Button>
          <p className="max-w-md text-xs text-muted-foreground">
            操作：方向键 / WASD 或左侧摇杆四向行走，走到城门口、敌营旁按 E / 回车（或点「交互」）；
            也可以直接点击地图上的城池、营寨，或用上方按钮行军。战斗为回合制：逐将选择
            攻击 / 计策 / 防守 / 道具 / 招降，或按「总攻击」「自动战斗」速战。
            走位本身不影响任何数值：战报只上传编制、购物与「打哪座营、怎么打」的指令，
            服务端按种子重放判定；战斗指令存在本机，刷新页面可以接着打。
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

function PartyList({ save }: { save: TrialSave }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {[...save.party, ...save.reserve].map((member) => {
        const def = SAGA_GENERAL_BY_ID.get(member.id);
        const stats = generalStats(member);
        const active = save.party.some((row) => row.id === member.id);
        return (
          <div key={member.id} className="rounded-lg border border-border p-2 text-xs">
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
        );
      })}
    </div>
  );
}

function DexGrid({ save }: { save: TrialSave }) {
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
  busy,
  maxReward,
  onBattle,
  onAuto,
  onSubmit,
  onClose,
  onCity,
}: {
  run: SagaRun | null;
  state: SagaReplayState | null;
  node: number | null;
  busy: string | null;
  maxReward: number;
  onBattle: (node: number) => void;
  onAuto: (node: number) => void;
  onSubmit: () => void;
  onClose: () => void;
  onCity: () => void;
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
            此行攻克 {state.clearedNodes.length}/{run.nodes.length} 座营。收兵后剧情推进到下一处地方，
            与此地剧情相关的武将会加入麾下。
          </p>
          <Button size="sm" className="mt-2" onClick={onSubmit} disabled={busy === "submit"}>
            <Flag className="h-3.5 w-3.5" />
            {busy === "submit" ? "收兵中…" : "收兵结算"}
          </Button>
        </div>
      ) : null}

      {lost ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3">
          <p className="font-medium">全军败退</p>
          <p className="mt-1 text-xs text-muted-foreground">
            已攻克的营寨与获得的经验、金币、招降武将都会保留；回城整备后再来。
          </p>
          <Button size="sm" className="mt-2" onClick={onSubmit} disabled={busy === "submit"}>
            <Home className="h-3.5 w-3.5" />
            {busy === "submit" ? "收兵中…" : "收兵回城"}
          </Button>
        </div>
      ) : null}

      {!won && !lost ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onSubmit} disabled={busy === "submit"}>
            <Flag className="h-3.5 w-3.5" />
            {busy === "submit" ? "收兵中…" : "收兵结算"}
          </Button>
          <p className="w-full text-xs text-muted-foreground">
            收兵：只有拔尽此行营寨才发通关奖励，钱庄存金照常结算；等级、金币与剧情进度立即写入存档，
            还在进行的战斗不会计入。
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ArmyPanel({
  run,
  state,
  field,
  busy,
  maxReward,
  cleared,
  open,
  onSubmit,
  onClose,
  onVisit,
  onCity,
}: {
  run: SagaRun | null;
  state: SagaReplayState | null;
  field: SagaField;
  busy: string | null;
  maxReward: number;
  cleared: number[];
  open: number[];
  onSubmit: () => void;
  onClose: () => void;
  onVisit: (node: number) => void;
  onCity: () => void;
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
            拔营之后即可收兵：剧情推进到下一处地方，与此地剧情相关的武将会加入麾下。
          </p>
          <Button size="sm" className="mt-2" onClick={onSubmit} disabled={busy === "submit"}>
            <Flag className="h-3.5 w-3.5" />
            {busy === "submit" ? "收兵中…" : "收兵结算"}
          </Button>
        </div>
      ) : lost ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3">
          <p className="font-medium">全军败退</p>
          <p className="mt-1 text-xs text-muted-foreground">
            已攻克的营寨与获得的经验、金币、招降武将都会保留；收兵回城整备后再来。
          </p>
          <Button size="sm" className="mt-2" onClick={onSubmit} disabled={busy === "submit"}>
            <Home className="h-3.5 w-3.5" />
            {busy === "submit" ? "收兵中…" : "收兵回城"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onSubmit} disabled={busy === "submit"}>
            <Flag className="h-3.5 w-3.5" />
            {busy === "submit" ? "收兵中…" : "收兵结算"}
          </Button>
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
  priceTickets,
  tickets,
  busy,
  onContinue,
  onClose,
}: {
  settlement: TrialSettlement;
  priceTickets: number;
  tickets: number;
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
            <Button onClick={onContinue} disabled={busy === "start" || tickets < priceTickets}>
              {busy === "start" ? "出发中…" : `前往${next.town}（${priceTickets} 张券）`}
            </Button>
          ) : null}
          {retry ? (
            <Button onClick={onContinue} disabled={busy === "start" || tickets < priceTickets}>
              {busy === "start" ? "出发中…" : `再走${city}（${priceTickets} 张券）`}
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            回到城镇
          </Button>
        </div>
        {!finale && tickets < priceTickets ? (
          <p className="mt-2 text-xs text-muted-foreground">试炼券不足，先兑换后再出发。</p>
        ) : null}
      </div>
    </div>
  );
}
