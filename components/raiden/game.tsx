"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  Bomb,
  Coins,
  Crosshair,
  Gamepad2,
  Heart,
  LifeBuoy,
  Loader2,
  Pause,
  Play,
  Rocket,
  ShieldCheck,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCredits } from "@/lib/billing/credits";
import {
  EMPTY_LOADOUT,
  stageMeta,
  type RaidenActivityStatus,
  type RaidenConfig,
  type RaidenLoadout,
} from "@/lib/raiden/config";
import type { StartedRun, StageSettlement } from "@/lib/raiden/store";
import type { BigWinRow, LeaderboardRow, MyRaidenSummary } from "@/lib/raiden/records";
import {
  endRaidenRun as endRaidenRunAction,
  reviveRaidenRun as reviveRaidenRunAction,
  settleRaidenStage as settleRaidenStageAction,
  startRaidenRun as startRaidenRunAction,
} from "@/app/(dashboard)/raiden/actions";
import { RaidenEngine, type GameOverResult, type HudSnapshot, type StageClearResult } from "./engine";
import { StartScreen } from "./start-screen";

type SessionPhase = "idle" | "playing" | "stageclear" | "gameover" | "finished";

interface ClearState {
  result: StageClearResult;
  settlement: StageSettlement | null;
  settling: boolean;
  error: string | null;
}

interface OverState {
  result: GameOverResult;
  busy: boolean;
  error: string | null;
}

interface FinalState {
  reason: "cleared" | "failed" | "abandoned";
  score: number;
  stage: number;
  rewards: number;
  firstClears: number;
}

function formatStageTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function scoreText(score: number): string {
  return String(Math.max(0, Math.round(score))).padStart(7, "0");
}

const REASON_LABEL: Record<FinalState["reason"], { title: string; hint: string }> = {
  cleared: { title: "MISSION COMPLETE", hint: "三关全部通关，行动成功。" },
  failed: { title: "MISSION FAILED", hint: "机体全灭，行动终止。" },
  abandoned: { title: "行动中止", hint: "你主动退出了本次出击，未通关的得分不结算奖励。" },
};

export function RaidenGame({
  config,
  status,
  balance,
  runsLeft,
  summary,
  leaderboard,
  firstClears,
}: {
  config: RaidenConfig;
  status: RaidenActivityStatus;
  balance: number;
  runsLeft: number;
  summary: MyRaidenSummary;
  leaderboard: LeaderboardRow[];
  firstClears: BigWinRow[];
}) {
  const router = useRouter();
  const [loadout, setLoadout] = useState<RaidenLoadout>({ ...EMPTY_LOADOUT });
  const [phase, setPhase] = useState<SessionPhase>("idle");
  const [starting, setStarting] = useState(false);
  const [run, setRun] = useState<StartedRun | null>(null);
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [clear, setClear] = useState<ClearState | null>(null);
  const [over, setOver] = useState<OverState | null>(null);
  const [final, setFinal] = useState<FinalState | null>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [revivesUsed, setRevivesUsed] = useState(0);
  const [rewardTotal, setRewardTotal] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<RaidenEngine | null>(null);
  const runRef = useRef<StartedRun | null>(null);
  const rewardsRef = useRef(0);
  const firstClearsRef = useRef(0);
  const settledRef = useRef<Set<number>>(new Set());
  const mutedRef = useRef(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem("raiden-muted") === "1") {
        mutedRef.current = true;
        setMuted(true);
      }
    } catch {
      // 隐私模式下 localStorage 可能不可用，忽略即可
    }
  }, []);

  // 全屏游戏页：锁住背景滚动，退出时恢复原值。
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const finishRun = useCallback(
    (reason: FinalState["reason"], score: number, stage: number) => {
      setFinal({
        reason,
        score,
        stage,
        rewards: rewardsRef.current,
        firstClears: firstClearsRef.current,
      });
      setPhase("finished");
      runRef.current = null;
      setRun(null);
      setHud(null);
      setClear(null);
      setOver(null);
      setPaused(false);
      router.refresh();
    },
    [router],
  );

  const handleStageClear = useCallback(
    async (result: StageClearResult) => {
      setPhase("stageclear");
      setPaused(false);
      setClear({ result, settlement: null, settling: true, error: null });
      const current = runRef.current;
      if (!current) return;
      try {
        const res = await settleRaidenStageAction({
          runId: current.runId,
          stageNo: result.stage,
          score: result.stageScore,
          durationMs: result.durationMs,
        });
        if (!res.success) {
          setClear((prev) => (prev ? { ...prev, settling: false, error: res.error } : prev));
          return;
        }
        if (!settledRef.current.has(result.stage)) {
          settledRef.current.add(result.stage);
          rewardsRef.current += res.data.reward;
          setRewardTotal(rewardsRef.current);
          if (res.data.firstClear) firstClearsRef.current += 1;
        }
        setClear((prev) => (prev ? { ...prev, settlement: res.data, settling: false, error: null } : prev));
        router.refresh();
      } catch (error) {
        setClear((prev) =>
          prev
            ? {
                ...prev,
                settling: false,
                error: error instanceof Error ? error.message : "结算失败，请重试",
              }
            : prev,
        );
      }
    },
    [router],
  );

  // 引擎只依赖「当前这一局」创建一次；阶段变化、暂停、结算都不会重建它。
  useEffect(() => {
    if (!run || !canvasRef.current) return;
    const engine = new RaidenEngine({
      canvas: canvasRef.current,
      starting: run.starting,
      muted: mutedRef.current,
      callbacks: {
        onHud: setHud,
        onStageClear: (result) => {
          void handleStageClear(result);
        },
        onGameOver: (result) => {
          setPhase("gameover");
          setPaused(false);
          setOver({ result, busy: false, error: null });
        },
        onToast: (message) => toast(message, { id: "raiden-hud" }),
        onPauseChange: setPaused,
      },
    });
    // 引擎构造时不带出怪表，首关也要显式开局（通关后由 goNextStage 推进后续关卡）。
    engine.startStage(1);
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [run, handleStageClear]);

  const handleStart = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const res = await startRaidenRunAction(loadout);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      rewardsRef.current = 0;
      firstClearsRef.current = 0;
      settledRef.current.clear();
      setRevivesUsed(0);
      setRewardTotal(0);
      setHud(null);
      setClear(null);
      setOver(null);
      setFinal(null);
      setPaused(false);
      runRef.current = res.data;
      setRun(res.data);
      setPhase("playing");
      router.refresh();
    } finally {
      setStarting(false);
    }
  };

  const retrySettle = () => {
    if (!clear || clear.settling) return;
    void handleStageClear(clear.result);
  };

  const goNextStage = () => {
    const next = clear?.settlement?.nextStage;
    if (!next) return;
    engineRef.current?.startStage(next);
    setClear(null);
    setPaused(false);
    setPhase("playing");
  };

  const completeMission = () => {
    if (!clear) return;
    finishRun("cleared", clear.result.totalScore, clear.result.stage);
  };

  const handleRevive = async () => {
    if (!runRef.current || over?.busy) return;
    setOver((prev) => (prev ? { ...prev, busy: true, error: null } : prev));
    try {
      const res = await reviveRaidenRunAction(runRef.current.runId);
      if (!res.success) {
        setOver((prev) => (prev ? { ...prev, busy: false, error: res.error } : prev));
        return;
      }
      setRevivesUsed(res.data.revives);
      engineRef.current?.revive();
      setOver(null);
      setPaused(false);
      setPhase("playing");
      toast.success(`复活成功 · 本局剩余 ${Math.max(0, res.data.maxRevives - res.data.revives)} 次`);
      router.refresh();
    } catch (error) {
      setOver((prev) =>
        prev
          ? { ...prev, busy: false, error: error instanceof Error ? error.message : "复活失败" }
          : prev,
      );
    }
  };

  const handleGiveUp = async () => {
    const info = over?.result;
    const current = runRef.current;
    if (current) {
      const res = await endRaidenRunAction(current.runId, "failed").catch(() => null);
      if (res && !res.success) toast.error(res.error);
    }
    finishRun("failed", info?.totalScore ?? hud?.score ?? 0, info?.stage ?? hud?.stage ?? 1);
  };

  const handleQuit = async () => {
    const current = runRef.current;
    engineRef.current?.setPaused(true);
    if (current) {
      const res = await endRaidenRunAction(current.runId, "abandoned").catch(() => null);
      if (res && !res.success) toast.error(res.error);
    }
    finishRun("abandoned", hud?.score ?? 0, hud?.stage ?? 1);
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    engineRef.current?.setMuted(next);
    try {
      window.localStorage.setItem("raiden-muted", next ? "1" : "0");
    } catch {
      // ignore
    }
  };

  const battleHud = hud ?? {
    score: 0,
    lives: run?.starting.lives ?? 3,
    bombs: run?.starting.bombs ?? 3,
    power: run?.starting.power ?? 1,
    maxPower: 5,
    stage: 1,
    stageCount: 3,
    stageTime: 0,
    bossHp: null,
    bossName: null,
    paused: false,
    state: "playing" as const,
    shield: false,
    shieldTime: 0,
    spread: 0,
    missiles: 0,
    readyIn: 0,
  };

  const revivesLeft = Math.max(0, config.maxRevives - revivesUsed);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden overscroll-none bg-black">
      <div
        className="relative overflow-hidden bg-[#04070d]"
        style={{
          width: "min(100vw, calc(100dvh * 2 / 3))",
          height: "min(100dvh, calc(100vw * 3 / 2))",
          boxShadow: "0 0 140px -40px rgba(34, 211, 238, 0.55)",
        }}
      >
        {run ? (
          <>
            <canvas
              ref={canvasRef}
              className="absolute inset-0 block h-full w-full touch-none select-none"
              aria-label="雷电行动游戏画面"
            />

            <HudBar
              hud={battleHud}
              paused={paused}
              muted={muted}
              rewards={rewardTotal}
              revivesLeft={revivesLeft}
              maxRevives={config.maxRevives}
              onPause={() => engineRef.current?.togglePause()}
              onMute={toggleMute}
            />

            {battleHud.bossHp !== null && phase === "playing" && !paused ? (
              <div className="pointer-events-none absolute inset-x-4 top-[86px] z-10">
                <div className="mb-1 flex items-center justify-between text-[10px] font-medium tracking-wider text-rose-300">
                  <span>{battleHud.bossName ?? "BOSS"}</span>
                  <span>{Math.ceil(battleHud.bossHp * 100)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-400 transition-[width] duration-150"
                    style={{ width: `${Math.max(0, battleHud.bossHp * 100)}%` }}
                  />
                </div>
              </div>
            ) : null}

            <div className="pointer-events-none absolute bottom-2.5 left-2.5 z-10 text-[9px] leading-relaxed text-white/30">
              拖动画面移动 · 自动射击
              <br />
              X / K / 空格 炸弹 · P 暂停
            </div>

            <button
              type="button"
              aria-label="释放炸弹"
              onPointerDown={(event) => {
                event.preventDefault();
                engineRef.current?.useBomb();
              }}
              disabled={battleHud.state !== "playing" || paused || battleHud.bombs <= 0}
              className="absolute bottom-3 right-3 z-10 flex h-16 w-16 flex-col items-center justify-center rounded-full border-2 border-amber-300/70 bg-amber-400/15 text-amber-200 shadow-[0_0_24px_rgba(251,191,36,0.25)] backdrop-blur-sm transition active:scale-95 disabled:opacity-35"
            >
              <Bomb className="h-6 w-6" />
              <span className="mt-0.5 font-mono text-xs font-bold">{battleHud.bombs}</span>
            </button>

            {battleHud.state === "ready" ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-28 z-10 flex justify-center">
                <span className="rounded-full border border-cyan-400/40 bg-black/55 px-4 py-1 font-mono text-[11px] tracking-[0.3em] text-cyan-200 backdrop-blur">
                  GET READY {Math.max(1, Math.ceil(battleHud.readyIn))}
                </span>
              </div>
            ) : null}

            {paused && phase === "playing" ? (
              <Overlay>
                <p className="text-[10px] uppercase tracking-[0.35em] text-cyan-300/70">Paused</p>
                <h3 className="mt-2 font-mono text-2xl font-bold tracking-[0.2em] text-cyan-200">
                  已暂停
                </h3>
                <p className="mt-2 text-xs text-white/60">
                  切到后台会自动暂停。暂停期间游戏时间不流逝，结算用时不受影响。
                </p>
                <p className="mt-2 text-[11px] text-white/40">
                  本局装备{" "}
                  {run.cost > 0 ? `已付 ${formatCredits(run.cost)} cr` : "标准配备 · 0 cr"} · 复活{" "}
                  {revivesUsed}/{config.maxRevives} 次
                </p>
                <div className="mt-6 space-y-2">
                  <Button
                    type="button"
                    className="w-full bg-cyan-500 text-black hover:bg-cyan-400"
                    onClick={() => engineRef.current?.setPaused(false)}
                  >
                    <Play className="h-4 w-4" /> 继续作战
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-white/20 bg-white/5 text-white hover:bg-white/10"
                    onClick={toggleMute}
                  >
                    {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    {muted ? "音效已关闭" : "音效已开启"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-rose-400/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
                    onClick={handleQuit}
                  >
                    放弃出击
                  </Button>
                </div>
              </Overlay>
            ) : null}

            {phase === "stageclear" && clear ? (
              <Overlay>
                <p className="text-[10px] uppercase tracking-[0.35em] text-cyan-300/70">
                  {stageMeta(clear.result.stage).subtitle}
                </p>
                <h3 className="mt-2 font-mono text-2xl font-bold tracking-[0.18em] text-cyan-200">
                  STAGE {clear.result.stage} CLEAR
                </h3>
                <p className="mt-1 text-sm text-white/75">{stageMeta(clear.result.stage).name}</p>
                <div className="mt-4 grid grid-cols-2 gap-2 text-left">
                  <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
                    <p className="text-[10px] text-white/50">本关得分</p>
                    <p className="font-mono text-sm text-white">{scoreText(clear.result.stageScore)}</p>
                  </div>
                  <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
                    <p className="text-[10px] text-white/50">用时</p>
                    <p className="font-mono text-sm text-white">
                      {formatStageTime(clear.result.durationMs / 1000)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-md border border-cyan-400/25 bg-cyan-400/5 px-3 py-3">
                  {clear.settling ? (
                    <p className="flex items-center justify-center gap-2 text-xs text-cyan-100/80">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      正在结算奖励…
                    </p>
                  ) : clear.error ? (
                    <div className="space-y-2">
                      <p className="text-xs text-rose-300">{clear.error}</p>
                      <Button type="button" size="sm" variant="outline" onClick={retrySettle}>
                        重试结算
                      </Button>
                    </div>
                  ) : clear.settlement ? (
                    <div>
                      <div className="flex items-center justify-center gap-2">
                        <Coins className="h-4 w-4 text-amber-300" />
                        <span className="font-mono text-xl font-bold text-amber-200">
                          +{formatCredits(clear.settlement.reward)} cr
                        </span>
                        {clear.settlement.firstClear ? <Badge tone="warning">首通</Badge> : null}
                      </div>
                      <p className="mt-1 text-center text-[11px] text-white/55">
                        {clear.settlement.firstClear
                          ? "首通奖励已发放到临时余额"
                          : clear.settlement.reward > 0
                            ? "重复通关奖励已发放到临时余额"
                            : "今日重复通关奖励已达上限"}
                        {` · 有效期 ${config.rewardValidDays} 天`}
                      </p>
                      {clear.settlement.already ? (
                        <p className="mt-1 text-center text-[11px] text-white/40">
                          本关此前已结算，未重复发放
                        </p>
                      ) : null}
                      {clear.settlement.cappedRepeat ? (
                        <p className="mt-1 text-center text-[11px] text-amber-300/80">
                          已达到每日重复奖励上限，超出部分未发放
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {clear.settlement ? (
                  <div className="mt-4 space-y-2">
                    {clear.settlement.nextStage ? (
                      <Button
                        type="button"
                        className="w-full bg-cyan-500 text-black hover:bg-cyan-400"
                        onClick={goNextStage}
                      >
                        进入 STAGE {clear.settlement.nextStage}
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        className="w-full bg-cyan-500 text-black hover:bg-cyan-400"
                        onClick={completeMission}
                      >
                        <Trophy className="h-4 w-4" /> 领取奖励并完成行动
                      </Button>
                    )}
                    <p className="text-center text-[10px] text-white/35">
                      下一关需重新计算结算用时，请保持在线
                    </p>
                  </div>
                ) : clear.error ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4 w-full border-white/20 bg-white/5 text-white hover:bg-white/10"
                    onClick={handleQuit}
                  >
                    放弃本局并退出
                  </Button>
                ) : null}
              </Overlay>
            ) : null}

            {phase === "gameover" && over ? (
              <Overlay>
                <p className="text-[10px] uppercase tracking-[0.35em] text-rose-300/80">Ship Lost</p>
                <h3 className="mt-2 font-mono text-2xl font-bold tracking-[0.16em] text-rose-200">
                  MISSION FAILED
                </h3>
                <p className="mt-2 text-sm text-white/70">
                  机体全灭 · 抵达 STAGE {over.result.stage}「{stageMeta(over.result.stage).name}」
                </p>
                <div className="mt-3 flex items-center justify-center gap-2 text-xs text-white/60">
                  <span>本次得分</span>
                  <span className="font-mono text-base text-white">{scoreText(over.result.totalScore)}</span>
                </div>

                <div className="mt-5 rounded-md border border-white/10 bg-white/5 px-3 py-3">
                  {revivesLeft > 0 ? (
                    <>
                      <p className="text-sm font-medium text-cyan-100">
                        原地复活 · {formatCredits(config.revivePriceCredits)} cr
                      </p>
                      <p className="mt-1 text-[11px] leading-relaxed text-white/55">
                        复活后以 1 条命继续本关，获得 3 秒无敌并清除周围弹幕。本局还可复活{" "}
                        {revivesLeft} 次。
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-white/55">
                      本局复活次数已用完，或管理员关闭了复活功能。
                    </p>
                  )}
                  {over.error ? <p className="mt-2 text-xs text-rose-300">{over.error}</p> : null}
                </div>

                <div className="mt-4 space-y-2">
                  <Button
                    type="button"
                    className="w-full bg-cyan-500 text-black hover:bg-cyan-400"
                    disabled={over.busy || revivesLeft <= 0}
                    onClick={handleRevive}
                  >
                    {over.busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Heart className="h-4 w-4" />
                    )}
                    {revivesLeft > 0
                      ? `消耗 ${formatCredits(config.revivePriceCredits)} cr 复活`
                      : "无法继续复活"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-white/20 bg-white/5 text-white hover:bg-white/10"
                    disabled={over.busy}
                    onClick={handleGiveUp}
                  >
                    结束出击
                  </Button>
                </div>
              </Overlay>
            ) : null}
          </>
        ) : phase === "finished" && final ? (
          <ResultScreen
            final={final}
            runsLeft={runsLeft}
            onAgain={() => {
              setFinal(null);
              setPhase("idle");
              router.refresh();
            }}
          />
        ) : (
          <StartScreen
            config={config}
            status={status}
            balance={balance}
            runsLeft={runsLeft}
            summary={summary}
            leaderboard={leaderboard}
            firstClears={firstClears}
            loadout={loadout}
            onLoadoutChange={setLoadout}
            starting={starting}
            onStart={handleStart}
            muted={muted}
            onToggleMute={toggleMute}
          />
        )}
      </div>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="max-h-full w-full max-w-sm overflow-y-auto rounded-xl border border-cyan-400/30 bg-[#070d16]/95 p-5 text-center shadow-[0_0_60px_-12px_rgba(34,211,238,0.45)]">
        {children}
      </div>
    </div>
  );
}

function HudBar({
  hud,
  paused,
  muted,
  rewards,
  revivesLeft,
  maxRevives,
  onPause,
  onMute,
}: {
  hud: HudSnapshot;
  paused: boolean;
  muted: boolean;
  rewards: number;
  revivesLeft: number;
  maxRevives: number;
  onPause: () => void;
  onMute: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 bg-gradient-to-b from-black/85 via-black/45 to-transparent px-2.5 pb-8 pt-2.5">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <p className="font-mono text-lg font-bold leading-none tracking-widest text-white drop-shadow">
            {scoreText(hud.score)}
          </p>
          <span className="font-mono text-[10px] text-amber-300/90">
            +{formatCredits(rewards)} cr
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[10px] tracking-wider text-cyan-200/80">
          <span className="truncate">
            ST{hud.stage} · {stageMeta(hud.stage).name}
          </span>
          <span className="text-white/25">|</span>
          <span className="font-mono">{formatStageTime(hud.stageTime)}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-white/85">
          <span className="flex items-center gap-0.5">
            <Heart className="h-3 w-3 fill-rose-500 text-rose-500" />
            <span className="font-mono">×{hud.lives}</span>
          </span>
          <span className="flex items-center gap-0.5">
            <Bomb className="h-3 w-3 text-amber-300" />
            <span className="font-mono">×{hud.bombs}</span>
          </span>
          <span className="flex items-center gap-0.5">
            <Zap className="h-3 w-3 text-cyan-300" />
            <span className="font-mono">Lv{hud.power}</span>
          </span>
          {hud.spread > 0 ? (
            <span className="flex items-center gap-0.5 text-fuchsia-300">
              <Crosshair className="h-3 w-3" />
              <span className="font-mono">S{hud.spread}</span>
            </span>
          ) : null}
          {hud.missiles > 0 ? (
            <span className="flex items-center gap-0.5 text-orange-300">
              <Rocket className="h-3 w-3" />
              <span className="font-mono">M{hud.missiles}</span>
            </span>
          ) : null}
          {hud.shield ? (
            <span className="flex items-center gap-0.5 text-cyan-300">
              <ShieldCheck className="h-3 w-3" />
              <span className="font-mono">{Math.max(0, hud.shieldTime).toFixed(1)}s</span>
            </span>
          ) : null}
          {maxRevives > 0 ? (
            <span className="flex items-center gap-0.5 text-cyan-100/60">
              <LifeBuoy className="h-3 w-3" />
              <span className="font-mono">×{revivesLeft}</span>
            </span>
          ) : null}
        </div>
      </div>
      <div className="pointer-events-auto flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onMute}
          aria-label={muted ? "打开音效" : "关闭音效"}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-black/40 text-white/70 backdrop-blur-sm hover:text-white"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={onPause}
          disabled={hud.state !== "playing"}
          aria-label={paused ? "继续" : "暂停"}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-black/40 text-white/70 backdrop-blur-sm hover:text-white disabled:opacity-40"
        >
          {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function ResultScreen({
  final,
  runsLeft,
  onAgain,
}: {
  final: FinalState;
  runsLeft: number;
  onAgain: () => void;
}) {
  const label = REASON_LABEL[final.reason];
  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-[radial-gradient(circle_at_50%_18%,rgba(34,211,238,0.16),transparent_58%),linear-gradient(180deg,#050b14_0%,#03060b_100%)] text-white">
      <div className="flex min-h-full flex-col items-center justify-center gap-5 px-5 py-8 text-center">
        <div>
          <p className="text-[10px] uppercase tracking-[0.4em] text-cyan-300/70">Operation Report</p>
          <h3 className="mt-2 font-mono text-2xl font-bold tracking-[0.12em] text-white">
            {label.title}
          </h3>
          <p className="mt-2 text-xs text-white/55">{label.hint}</p>
        </div>

        <div className="grid w-full max-w-[300px] grid-cols-2 gap-2 text-left">
          <ResultStat label="总得分" value={scoreText(final.score)} mono />
          <ResultStat label="抵达关卡" value={`STAGE ${Math.max(1, final.stage)}`} />
          <ResultStat label="本次奖励" value={`${formatCredits(final.rewards)} cr`} />
          <ResultStat label="首通关卡" value={`${final.firstClears} 关`} />
        </div>

        <p className="max-w-[300px] text-[11px] leading-relaxed text-white/40">
          {final.rewards > 0
            ? "奖励已发放至临时余额，可在钱包中查看。"
            : "本次没有获得通关奖励。"}
          {runsLeft > 0 ? ` 今日还可出击 ${runsLeft} 次。` : " 今日出击次数已用完。"}
        </p>

        <div className="flex w-full max-w-[300px] flex-col gap-2">
          {runsLeft > 0 ? (
            <Button
              type="button"
              className="w-full bg-cyan-500 text-black hover:bg-cyan-400"
              onClick={onAgain}
            >
              <Gamepad2 className="h-4 w-4" /> 再次出击
            </Button>
          ) : (
            <Button type="button" className="w-full" variant="outline" onClick={onAgain}>
              返回出击准备
            </Button>
          )}
          <Button
            asChild
            variant="outline"
            className="w-full border-white/15 bg-white/5 text-white hover:bg-white/10"
          >
            <Link href="/wallet">
              <Coins className="h-4 w-4" /> 查看钱包记录
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="w-full border-white/15 bg-white/5 text-white hover:bg-white/10"
          >
            <Link href="/">返回控制台</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ResultStat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2">
      <p className="text-[10px] text-white/45">{label}</p>
      <p className={`text-sm text-white ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
