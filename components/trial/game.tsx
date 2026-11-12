"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Flame, FlaskConical, Loader2, Shield, Sparkles, Swords, Timer, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CouponCount } from "@/components/activity/coupon-badge";
import { formatCredits } from "@/lib/billing/credits";
import { cn } from "@/lib/utils";
import {
  TRIAL_INPUT,
  TRIAL_MAX_FRAMES,
  TRIAL_RELICS,
  TRIAL_TICK_MS,
  TRIAL_VIEW_H,
  TRIAL_VIEW_W,
  expToNext,
  replayTrialGame,
  stepTrialGame,
  trialInteractTarget,
  type TrialDungeon,
  type TrialGameState,
  type TrialRelicId,
} from "@/lib/trial/dungeon";
import { startTrialAction, submitTrialAction } from "@/app/(dashboard)/trial/actions";
import {
  drawTrialScene,
  focusCamera,
  smoothCamera,
  spawnTrialFx,
  updateTrialFx,
  type TrialFx,
} from "./renderer";
import { TrialHeroArt } from "./art";

interface TrialRun {
  runId: string;
  dungeon: TrialDungeon;
  startedAt: number;
  expiresAt: number;
}

interface TrialSettlement {
  floorsCleared: number;
  totalFloors: number;
  reward: number;
  expired: boolean;
  already: boolean;
  victory: boolean;
  durationMs: number;
}

interface TrialGameProps {
  initialRun: TrialRun | null;
  runsToday: number;
  dailyRuns: number;
  floorCount: number;
  timeLimitSeconds: number;
  priceTickets: number;
  couponTickets: number;
  unitCredits: number;
  rewardValidDays: number;
  maxReward: number;
}

/** 动作键位：一套键盘、一套触屏，都折算成同一帧的输入掩码。 */
const KEYS = {
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  jump: ["KeyW", "ArrowUp", "Space"],
  attack: ["KeyJ", "KeyZ"],
  heavy: ["KeyK", "KeyX"],
  burst: ["KeyL", "KeyC"],
  guard: ["KeyS", "ArrowDown"],
  potion: ["KeyE"],
  interact: ["KeyF", "Enter"],
} as const;

const GAME_CODES = new Set<string>(Object.values(KEYS).flat());
const SCROLL_CODES = new Set(["Space", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);

const TOUCH_BUTTONS: { label: string; hint: string; mask: number }[] = [
  { label: "左", hint: "A", mask: TRIAL_INPUT.left },
  { label: "右", hint: "D", mask: TRIAL_INPUT.right },
  { label: "跳", hint: "W", mask: TRIAL_INPUT.jump },
  { label: "斩", hint: "J", mask: TRIAL_INPUT.attack },
  { label: "弧", hint: "K", mask: TRIAL_INPUT.heavy },
  { label: "星", hint: "L", mask: TRIAL_INPUT.burst },
  { label: "盾", hint: "S", mask: TRIAL_INPUT.guard },
  { label: "药", hint: "E", mask: TRIAL_INPUT.potion },
  { label: "门", hint: "F", mask: TRIAL_INPUT.interact },
];

const CONTROLS: { keys: string; label: string }[] = [
  { keys: "A / D", label: "移动" },
  { keys: "W / 空格", label: "跳跃" },
  { keys: "J", label: "斩击" },
  { keys: "K", label: "弧斩" },
  { keys: "L", label: "星屑" },
  { keys: "S", label: "格挡" },
  { keys: "E", label: "结晶" },
  { keys: "F", label: "进门" },
];

interface TrialHud {
  floor: number;
  totalFloors: number;
  hp: number;
  maxHp: number;
  level: number;
  exp: number;
  expToNext: number;
  potions: number;
  combo: number;
  guarding: boolean;
  arcCd: number;
  burstCd: number;
  relics: TrialRelicId[];
  prompt: string;
}

function readMask(keys: Set<string>, touchMask: number): number {
  const down = (codes: readonly string[]) => codes.some((code) => keys.has(code));
  let mask = touchMask;
  if (down(KEYS.left)) mask |= TRIAL_INPUT.left;
  if (down(KEYS.right)) mask |= TRIAL_INPUT.right;
  if (down(KEYS.jump)) mask |= TRIAL_INPUT.jump;
  if (down(KEYS.attack)) mask |= TRIAL_INPUT.attack;
  if (down(KEYS.heavy)) mask |= TRIAL_INPUT.heavy;
  if (down(KEYS.burst)) mask |= TRIAL_INPUT.burst;
  if (down(KEYS.guard)) mask |= TRIAL_INPUT.guard;
  if (down(KEYS.potion)) mask |= TRIAL_INPUT.potion;
  if (down(KEYS.interact)) mask |= TRIAL_INPUT.interact;
  return mask;
}

function buildHud(state: TrialGameState): TrialHud {
  const target = trialInteractTarget(state);
  return {
    floor: Math.min(state.floorIndex + 1, state.dungeon.floors.length),
    totalFloors: state.dungeon.floors.length,
    hp: Math.max(0, state.hero.hp),
    maxHp: state.hero.maxHp,
    level: state.hero.level,
    exp: state.hero.exp,
    expToNext: expToNext(state.hero.level),
    potions: state.hero.potions,
    combo: state.hero.combo,
    guarding: state.hero.guarding,
    arcCd: state.hero.cooldownArc,
    burstCd: state.hero.cooldownBurst,
    relics: [...state.hero.relics],
    prompt:
      state.phase === "fight"
        ? "J 斩击 · K 弧斩 · L 星屑 · S 格挡 · 跳跃躲横斩"
        : target
          ? `按 F 进入「${target.title}」`
          : state.fieldCleared
            ? "野区已探索 · 前往右侧层主门"
            : "左右移动寻找门 · 门边按 F 进入",
  };
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function percent(value: number, max: number): number {
  return max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
}

function RelicChips({ relics, compact }: { relics: TrialRelicId[]; compact?: boolean }) {
  if (relics.length === 0) {
    return compact ? null : (
      <span className="text-xs text-muted-foreground">还没有装备：宝箱与精英怪会给。</span>
    );
  }
  const counts = new Map<TrialRelicId, number>();
  for (const relic of relics) counts.set(relic, (counts.get(relic) ?? 0) + 1);
  return (
    <div className={cn("flex flex-wrap gap-1", compact ? "justify-end" : "gap-1.5")}>
      {[...counts.entries()].map(([id, count]) => {
        const relic = TRIAL_RELICS[id];
        return (
          <span
            key={id}
            title={relic.desc}
            className={cn(
              "inline-flex items-center gap-1 rounded border border-amber-300/25 bg-amber-400/10 text-amber-100",
              compact ? "px-1 py-0.5 text-[9px]" : "px-2 py-0.5 text-xs",
            )}
          >
            <Sparkles className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
            {relic.name}
            {count > 1 ? <b className="tabular-nums">×{count}</b> : null}
          </span>
        );
      })}
    </div>
  );
}

function SettlementCard({
  settlement,
  floorCount,
  rewardValidDays,
}: {
  settlement: TrialSettlement;
  floorCount: number;
  rewardValidDays: number;
}) {
  const title = settlement.expired
    ? "沙漏耗尽"
    : settlement.victory
      ? "登顶"
      : settlement.floorsCleared > 0
        ? `倒在 ${settlement.floorsCleared + 1}F`
        : "攻略失败";
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        settlement.victory
          ? "border-amber-400/40 bg-gradient-to-br from-amber-500/15 to-transparent"
          : "border-border bg-muted/30",
      )}
    >
      <p className="flex items-center gap-2 text-base font-medium">
        <Trophy className={cn("h-4 w-4", settlement.victory ? "text-amber-400" : "text-muted-foreground")} />
        {title}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        通关 {settlement.floorsCleared} / {settlement.totalFloors || floorCount} 层
        {settlement.durationMs > 0 ? ` · 用时 ${Math.round(settlement.durationMs / 1000)} 秒` : ""}
      </p>
      <p className="mt-1 text-sm">
        {settlement.reward > 0 ? (
          <span className="font-medium text-success">
            获得 {formatCredits(settlement.reward)} tcr，{rewardValidDays} 天内有效
          </span>
        ) : settlement.already ? (
          <span className="text-muted-foreground">这一局之前已经结算过了。</span>
        ) : settlement.expired ? (
          <span className="text-muted-foreground">超时交卷不发奖励，下一局注意沙漏。</span>
        ) : (
          <span className="text-muted-foreground">没有命中奖励档位，再挑战一次吧。</span>
        )}
      </p>
    </div>
  );
}

export function TrialGame(props: TrialGameProps) {
  const router = useRouter();
  const [run, setRun] = useState<TrialRun | null>(props.initialRun);
  const [runsToday, setRunsToday] = useState(props.runsToday);
  const [settlement, setSettlement] = useState<TrialSettlement | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [hud, setHud] = useState<TrialHud | null>(null);
  const [outcome, setOutcome] = useState<"won" | "dead" | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const framesRef = useRef<number[]>([]);
  const keysRef = useRef<Set<string>>(new Set());
  const touchMaskRef = useRef(0);
  const submittingRef = useRef(false);
  const settledRef = useRef(false);

  const remainingMs = run ? run.expiresAt - now : 0;
  const urgent = Boolean(run) && remainingMs <= 30_000;

  const submit = useCallback(
    async (frames: number[]) => {
      if (!run || submittingRef.current) return;
      submittingRef.current = true;
      setBusy(true);
      setSubmitError(null);
      try {
        const res = await submitTrialAction({ runId: run.runId, actions: frames.slice() });
        if (!res.success) {
          setSubmitError(res.error);
          toast.error(res.error);
          return;
        }
        settledRef.current = true;
        try {
          window.localStorage.removeItem(`trial-dungeon:${run.runId}`);
        } catch {
          // 私密模式下写不了本地存储，清理失败不影响结算。
        }
        setSettlement(res.data);
        setRun(null);
        setOutcome(null);
        setHud(null);
        if (res.data.reward > 0) {
          toast.success(
            `通关 ${res.data.floorsCleared} 层，获得 ${formatCredits(res.data.reward)} tcr`,
          );
        } else {
          toast.message(res.data.expired ? "已超时，本局不发奖励" : "本局没有命中奖励档位");
        }
        router.refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : "交卷失败，请重试";
        setSubmitError(message);
        toast.error(message);
      } finally {
        submittingRef.current = false;
        setBusy(false);
      }
    },
    [router, run],
  );

  // 主循环：60Hz 固定步长推进引擎，逐帧记录输入；渲染与 HUD 只读同一份状态。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!run || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const storageKey = `trial-dungeon:${run.runId}`;
    let frames: number[] = [];
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      if (Array.isArray(parsed)) {
        frames = parsed
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value))
          .map((value) => Math.max(0, Math.min(0xffff, Math.trunc(value))))
          .slice(0, TRIAL_MAX_FRAMES);
      }
    } catch {
      frames = [];
    }
    framesRef.current = frames;

    const state = replayTrialGame(run.dungeon, frames);
    const fx: TrialFx[] = [];
    let camera = -1;
    let last = performance.now();
    let accumulator = 0;
    let hudTicks = 0;
    let savedAt = 0;
    let finished = false;
    let disposed = false;
    let raf = 0;
    const keys = keysRef.current;
    keys.clear();
    touchMaskRef.current = 0;

    const save = () => {
      if (settledRef.current) return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(framesRef.current));
      } catch {
        // 存不下就只保留内存进度，交卷不受影响。
      }
    };

    const finish = (kind: "won" | "dead") => {
      if (finished) return;
      finished = true;
      setOutcome(kind);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!GAME_CODES.has(event.code)) return;
      if (SCROLL_CODES.has(event.code)) event.preventDefault();
      keys.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keys.delete(event.code);
    };
    const onBlur = () => keys.clear();
    const onHide = () => {
      if (document.hidden) save();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);

    const loop = (time: number) => {
      if (disposed) return;
      raf = window.requestAnimationFrame(loop);

      if (!finished && (state.phase === "over" || state.phase === "won")) {
        finish(state.phase === "won" ? "won" : "dead");
      }
      if (!finished && Date.now() >= run.expiresAt) {
        // 墙钟超时：停帧但保留画面，交卷由外层计时器触发。
        finished = true;
      }

      const dt = Math.min(120, Math.max(0, time - last));
      last = time;

      if (!finished) {
        accumulator = Math.min(accumulator + dt, TRIAL_TICK_MS * 10);
        while (accumulator >= TRIAL_TICK_MS) {
          accumulator -= TRIAL_TICK_MS;
          const mask = readMask(keys, touchMaskRef.current);
          frames.push(mask);
          stepTrialGame(state, mask);
          if (state.events.length > 0) spawnTrialFx(fx, state.events, state);
          hudTicks += 1;
          if (state.phase === "over" || state.phase === "won") break;
        }
        if (frames.length > TRIAL_MAX_FRAMES) frames.length = TRIAL_MAX_FRAMES;
        if (time - savedAt > 900) {
          savedAt = time;
          save();
        }
        if (hudTicks >= 6) {
          hudTicks = 0;
          setHud(buildHud(state));
        }
        if (state.phase === "over" || state.phase === "won") {
          finish(state.phase === "won" ? "won" : "dead");
        }
      }

      updateTrialFx(fx, dt);
      camera = smoothCamera(camera, focusCamera(state));
      drawTrialScene(ctx, state, fx, camera, time);
    };
    raf = window.requestAnimationFrame(loop);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      keys.clear();
      touchMaskRef.current = 0;
      save();
    };
  }, [run]);

  useEffect(() => {
    if (!run) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [run]);

  // 打完收工：先让最后一击的演出播完，再交卷。
  useEffect(() => {
    if (!run || !outcome || submitError) return;
    const timer = window.setTimeout(
      () => void submit(framesRef.current),
      outcome === "won" ? 1700 : 1300,
    );
    return () => window.clearTimeout(timer);
  }, [outcome, run, submit, submitError]);

  // 超时直接交卷：服务端按 expired 记 0 层。
  useEffect(() => {
    if (!run || remainingMs > 0 || submitError) return;
    void submit(framesRef.current);
  }, [remainingMs, run, submit, submitError]);

  async function handleStart() {
    setBusy(true);
    setSettlement(null);
    setOutcome(null);
    setSubmitError(null);
    setHud(null);
    const res = await startTrialAction();
    setBusy(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    settledRef.current = false;
    setRun({
      runId: res.data.runId,
      dungeon: res.data.dungeon,
      startedAt: res.data.startedAt,
      expiresAt: res.data.expiresAt,
    });
    setRunsToday(res.data.runsToday);
    setNow(Date.now());
    router.refresh();
  }

  function pressTouch(mask: number, pressed: boolean) {
    if (pressed) touchMaskRef.current |= mask;
    else touchMaskRef.current &= ~mask;
  }

  if (!run) {
    const canStart = runsToday < props.dailyRuns && props.couponTickets >= props.priceTickets;
    return (
      <div className="space-y-4">
        {settlement ? (
          <SettlementCard
            settlement={settlement}
            floorCount={props.floorCount}
            rewardValidDays={props.rewardValidDays}
          />
        ) : null}

        <div className="relative overflow-hidden rounded-xl border border-cyan-400/25 bg-[radial-gradient(circle_at_15%_20%,rgba(34,211,238,0.18),transparent_55%),radial-gradient(circle_at_85%_80%,rgba(99,102,241,0.2),transparent_50%)] p-4">
          <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(148,163,184,0.25)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.25)_1px,transparent_1px)] [background-size:28px_28px]" />
          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="h-20 w-20 shrink-0 sm:h-24 sm:w-24">
              <TrialHeroArt hurt={false} />
            </div>
            <div className="min-w-0 space-y-2 text-sm">
              <p className="font-display text-base font-semibold tracking-wide text-cyan-100">
                浮游城 · 像素攻略
              </p>
              <p className="text-muted-foreground">
                共 {props.floorCount} 层：先在两扇野区门里探路（战斗 / 精英 / 宝箱 / 营地），
                再挑战层主；生命跨房间保留，击破升级。抬手的「!」是出招预警，跳起来能躲开横斩。
              </p>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {CONTROLS.map((item) => (
                  <span
                    key={item.label}
                    className="rounded border border-white/10 bg-black/25 px-2 py-0.5 text-muted-foreground"
                  >
                    <b className="text-cyan-200">{item.keys}</b> {item.label}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                交卷只上传每帧按键序列，服务端用同一套 60Hz 引擎重放判定，改存档无效。
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            单局限时 {props.timeLimitSeconds} 秒；本局票价{" "}
            <CouponCount kind="trial" count={props.priceTickets} />，最高可得{" "}
            {formatCredits(props.maxReward)} tcr。
          </p>
          <Button
            type="button"
            onClick={() => void handleStart()}
            disabled={busy || !canStart}
            className="font-display tracking-[0.18em]"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}
            进入浮游城
          </Button>
        </div>
        {!canStart ? (
          <p className="text-xs text-muted-foreground">
            {runsToday >= props.dailyRuns
              ? `今日 ${props.dailyRuns} 局已用完，明天再来。`
              : `试炼券不足：需要 ${props.priceTickets} 张，当前 ${props.couponTickets} 张，请在上方兑换。`}
          </p>
        ) : null}
      </div>
    );
  }

  const totalFloors = hud?.totalFloors ?? run.dungeon.floors.length;
  const floorNo = hud?.floor ?? 1;
  const overlay = Boolean(outcome) || busy || Boolean(submitError);

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl border border-cyan-400/25 bg-[#050914]">
        <canvas
          ref={canvasRef}
          width={TRIAL_VIEW_W}
          height={TRIAL_VIEW_H}
          className="block w-full touch-none [image-rendering:pixelated]"
          aria-label="每日试炼动作场景"
        />

        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between gap-2 p-2 sm:p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1 text-[10px] sm:text-xs">
              <span className="rounded bg-black/55 px-1.5 py-0.5 font-display tracking-widest text-cyan-200 ring-1 ring-cyan-400/30">
                {floorNo}F / {totalFloors}F
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded bg-black/55 px-1.5 py-0.5 tabular-nums ring-1",
                  urgent ? "text-rose-300 ring-rose-400/40" : "text-slate-200 ring-white/10",
                )}
              >
                <Timer className="h-3 w-3" />
                {formatClock(remainingMs)}
              </span>
              {hud ? (
                <span className="rounded bg-black/55 px-1.5 py-0.5 text-amber-200 ring-1 ring-amber-300/20">
                  Lv.{hud.level}
                </span>
              ) : null}
              {hud && hud.combo > 0 ? (
                <span className="inline-flex items-center gap-1 rounded bg-amber-400/20 px-1.5 py-0.5 text-amber-200 ring-1 ring-amber-300/40">
                  <Flame className="h-3 w-3" />×{hud.combo}
                </span>
              ) : null}
              {hud?.guarding ? (
                <span className="inline-flex items-center gap-1 rounded bg-sky-500/20 px-1.5 py-0.5 text-sky-200 ring-1 ring-sky-300/40">
                  <Shield className="h-3 w-3" />
                  格挡
                </span>
              ) : null}
            </div>
          </div>

          <div className="space-y-1">
            <p className="mx-auto w-fit max-w-full truncate rounded bg-black/45 px-2 py-0.5 text-center text-[10px] text-cyan-100/85 sm:text-xs">
              {hud?.prompt ?? "…"}
            </p>
            <div className="flex items-end justify-between gap-2">
              <div className="w-44 space-y-1 rounded bg-black/35 px-1.5 py-1 sm:w-64">
                <div className="flex items-center justify-between text-[9px] text-slate-200 sm:text-[10px]">
                  <span className="inline-flex items-center gap-1">
                    <Swords className="h-3 w-3 text-emerald-300" />
                    {hud ? `${hud.hp} / ${hud.maxHp}` : "…"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <FlaskConical className="h-3 w-3 text-cyan-200" />×{hud?.potions ?? 0}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-sm bg-black/60 ring-1 ring-white/15">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-400 to-teal-300 transition-[width] duration-200"
                    style={{ width: `${percent(hud?.hp ?? 0, hud?.maxHp ?? 1)}%` }}
                  />
                </div>
                <div className="h-1 overflow-hidden rounded-sm bg-black/60">
                  <div
                    className="h-full bg-cyan-400"
                    style={{ width: `${percent(hud?.exp ?? 0, hud?.expToNext ?? 1)}%` }}
                  />
                </div>
              </div>

              <div className="flex max-w-[52%] flex-col items-end gap-1">
                <div className="flex flex-wrap justify-end gap-1 text-[9px]">
                  <span
                    className={cn(
                      "rounded px-1 py-0.5 ring-1",
                      (hud?.arcCd ?? 0) > 0
                        ? "bg-black/60 text-slate-400 ring-white/10"
                        : "bg-cyan-500/15 text-cyan-200 ring-cyan-400/30",
                    )}
                  >
                    弧斩 {(hud?.arcCd ?? 0) > 0 ? `${((hud?.arcCd ?? 0) / 60).toFixed(1)}s` : "就绪"}
                  </span>
                  <span
                    className={cn(
                      "rounded px-1 py-0.5 ring-1",
                      (hud?.burstCd ?? 0) > 0
                        ? "bg-black/60 text-slate-400 ring-white/10"
                        : "bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-400/30",
                    )}
                  >
                    星屑 {(hud?.burstCd ?? 0) > 0 ? `${((hud?.burstCd ?? 0) / 60).toFixed(1)}s` : "就绪"}
                  </span>
                </div>
                <RelicChips relics={hud?.relics ?? []} compact />
              </div>
            </div>
          </div>
        </div>

        {overlay ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-slate-950/70 p-4 text-center">
            {submitError ? (
              <>
                <p className="text-sm text-rose-300">{submitError}</p>
                <Button type="button" size="sm" onClick={() => setSubmitError(null)}>
                  重新交卷
                </Button>
              </>
            ) : (
              <>
                <p className="font-display text-lg font-semibold tracking-widest text-cyan-100">
                  {outcome === "won" ? "登顶" : outcome === "dead" ? "力尽" : "沙漏耗尽"}
                </p>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  正在结算…
                </p>
              </>
            )}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-5 gap-1.5 sm:hidden">
        {TOUCH_BUTTONS.map((button) => (
          <button
            key={button.label}
            type="button"
            disabled={overlay}
            className="select-none rounded-lg border border-white/10 bg-secondary/40 py-2 text-sm font-medium text-foreground touch-none active:bg-cyan-500/25 disabled:opacity-50"
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              pressTouch(button.mask, true);
            }}
            onPointerUp={(event) => {
              event.preventDefault();
              pressTouch(button.mask, false);
            }}
            onPointerCancel={() => pressTouch(button.mask, false)}
            onPointerLeave={() => pressTouch(button.mask, false)}
            onContextMenu={(event) => event.preventDefault()}
          >
            {button.label}
            <span className="ml-0.5 text-[10px] text-muted-foreground">{button.hint}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="hidden sm:inline">
          A/D 移动 · W/空格 跳跃 · J 斩击 · K 弧斩 · L 星屑 · S 格挡 · E 结晶 · F 进门
        </span>
        <span>按键序列实时记录 · 交卷后服务端重放 60Hz 判定</span>
      </div>
    </div>
  );
}
