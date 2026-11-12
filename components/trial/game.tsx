"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  Crown,
  FlaskConical,
  Flame,
  Gem,
  Loader2,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Timer,
  Trophy,
  Wind,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CouponCount } from "@/components/activity/coupon-badge";
import { formatCredits } from "@/lib/billing/credits";
import { cn } from "@/lib/utils";
import {
  TRIAL_RELICS,
  TRIAL_SKILLS,
  simulateTrialDungeon,
  type TrialAction,
  type TrialDungeon,
  type TrialIntent,
  type TrialRelicId,
  type TrialRoom,
  type TrialRoomKind,
  type TrialSkillId,
  type TrialTurn,
} from "@/lib/trial/dungeon";
import { startTrialAction, submitTrialAction } from "@/app/(dashboard)/trial/actions";
import { TrialHeroArt, TrialMonsterArt } from "./art";

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

const SKILL_ICONS: Record<TrialSkillId, typeof Swords> = {
  slash: Swords,
  arc: Wind,
  guard: Shield,
  burst: Zap,
};

const INTENT_META: Record<TrialIntent | "heavy", { label: string; icon: typeof Swords; tone: string }> = {
  attack: { label: "攻击", icon: Swords, tone: "text-rose-400 border-rose-400/40 bg-rose-500/10" },
  charge: { label: "蓄力 · 下次重击", icon: Zap, tone: "text-amber-300 border-amber-300/40 bg-amber-400/10" },
  heavy: { label: "重击！", icon: Flame, tone: "text-orange-300 border-orange-400/50 bg-orange-500/15" },
  guard: { label: "举盾 · 获得护盾", icon: Shield, tone: "text-sky-300 border-sky-400/40 bg-sky-500/10" },
};

const ROOM_META: Record<TrialRoomKind, { label: string; icon: typeof Swords; tone: string }> = {
  fight: { label: "野区", icon: Swords, tone: "from-slate-500/15 text-slate-200 border-slate-400/30" },
  elite: { label: "精英", icon: Skull, tone: "from-violet-500/20 text-violet-200 border-violet-400/40" },
  treasure: { label: "宝箱", icon: Gem, tone: "from-amber-400/20 text-amber-200 border-amber-400/40" },
  rest: { label: "营地", icon: Flame, tone: "from-emerald-500/20 text-emerald-200 border-emerald-400/40" },
};

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function turnSummary(turn: TrialTurn): string {
  if (turn.roomCleared) return `击破「${turn.roomName}」，回复 ${turn.healed} 生命`;
  const parts: string[] = [];
  if (turn.action === "item") parts.push("使用回复结晶");
  if (turn.dealt > 0) parts.push(`造成 ${turn.dealt} 伤害`);
  if (turn.blocked > 0) parts.push(`格挡 ${turn.blocked}`);
  if (turn.taken > 0) parts.push(`受到 ${turn.taken} 伤害`);
  if (turn.healed > 0 && (turn.action === "guard" || turn.action === "item")) {
    parts.push(`回复 ${turn.healed}`);
  }
  return parts.join(" · ");
}

function refineActions(raw: string | null): TrialAction[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const allowed: TrialSkillId[] = ["slash", "arc", "guard", "burst"];
    return value
      .filter((item) => item && typeof item === "object")
      .filter(
        (item) =>
          (item.t === "enter" && Number.isFinite(Number(item.i))) ||
          item.t === "boss" ||
          item.t === "item" ||
          (item.t === "skill" && allowed.includes(item.s as TrialSkillId)),
      )
      .slice(0, 600)
      .map((item) => {
        if (item.t === "enter") return { t: "enter" as const, i: Math.trunc(Number(item.i)) };
        if (item.t === "boss") return { t: "boss" as const };
        if (item.t === "item") return { t: "item" as const };
        return { t: "skill" as const, s: item.s as TrialSkillId };
      });
  } catch {
    return [];
  }
}

function subscribeToNothing(): () => void {
  return () => {};
}

function Bar({
  value,
  max,
  tone,
}: {
  value: number;
  max: number;
  tone: "hero" | "monster" | "exp";
}) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-full bg-black/40 ring-1 ring-white/10",
        tone === "exp" ? "h-1.5" : "h-2.5",
      )}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500 ease-out",
          tone === "hero"
            ? "bg-gradient-to-r from-emerald-400 to-teal-300"
            : tone === "monster"
              ? "bg-gradient-to-r from-rose-500 to-orange-400"
              : "bg-gradient-to-r from-cyan-400 to-sky-300",
        )}
        style={{ width: `${Math.round(ratio * 100)}%` }}
      />
    </div>
  );
}

function RelicChips({ relics }: { relics: TrialRelicId[] }) {
  if (relics.length === 0) {
    return <span className="text-xs text-muted-foreground">还没有装备：宝箱与精英怪会给。</span>;
  }
  const counts = new Map<TrialRelicId, number>();
  for (const relic of relics) counts.set(relic, (counts.get(relic) ?? 0) + 1);
  return (
    <div className="flex flex-wrap gap-1.5">
      {[...counts.entries()].map(([id, count]) => {
        const relic = TRIAL_RELICS[id];
        return (
          <span
            key={id}
            title={relic.desc}
            className="inline-flex items-center gap-1 rounded border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-xs text-cyan-100"
          >
            <Sparkles className="h-3 w-3" />
            {relic.name}
            {count > 1 ? <b className="tabular-nums">×{count}</b> : null}
          </span>
        );
      })}
    </div>
  );
}

function FloorTracker({
  total,
  cleared,
}: {
  total: number;
  cleared: number;
}) {
  return (
    <span className="flex items-center gap-1">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-4 rounded-full",
            i < cleared ? "bg-amber-400" : i === cleared ? "bg-cyan-400" : "bg-border",
          )}
        />
      ))}
    </span>
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
  const [sessionActions, setSessionActions] = useState<TrialAction[] | null>(null);
  const [settlement, setSettlement] = useState<TrialSettlement | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const submittingRef = useRef(false);

  const storageKey = run ? `trial-dungeon:${run.runId}` : null;
  // 刷新后从本地存储恢夆动作序列；服务端仍按同一串动作重算，改存档没用。
  const resumedRaw = useSyncExternalStore(
    subscribeToNothing,
    () => (storageKey ? window.localStorage.getItem(storageKey) ?? "" : ""),
    () => "",
  );
  const resumedActions = useMemo(
    () => (resumedRaw ? refineActions(resumedRaw) : []),
    [resumedRaw],
  );
  const actions = sessionActions ?? resumedActions;

  const dungeon = run?.dungeon ?? null;
  const result = useMemo(
    () => (dungeon ? simulateTrialDungeon(dungeon, actions) : null),
    [dungeon, actions],
  );
  const finished = result ? result.status === "cleared" || result.status === "dead" : false;
  const last = result?.lastTurn ?? null;

  useEffect(() => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(actions));
    } catch {
      // 私密模式下写不了本地存储，进度只保留在内存里，不影响结算。
    }
  }, [actions, storageKey]);

  useEffect(() => {
    if (!run) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [run]);

  const remainingMs = run ? run.expiresAt - now : 0;

  const submit = useCallback(
    async (payload: TrialAction[]) => {
      if (!run || submittingRef.current) return;
      submittingRef.current = true;
      setBusy(true);
      const res = await submitTrialAction({ runId: run.runId, actions: payload });
      setBusy(false);
      submittingRef.current = false;
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      try {
        window.localStorage.removeItem(`trial-dungeon:${run.runId}`);
      } catch {
        // 忽略本地存储清理失败。
      }
      setSettlement(res.data);
      setRun(null);
      setSessionActions(null);
      if (res.data.reward > 0) {
        toast.success(
          `通关 ${res.data.floorsCleared} 层，获得 ${formatCredits(res.data.reward)} tcr`,
        );
      } else {
        toast.message(res.data.expired ? "已超时，本局不发奖励" : "本局没有命中奖励档位");
      }
      router.refresh();
    },
    [router, run],
  );

  useEffect(() => {
    if (run && remainingMs <= 0 && !submittingRef.current) {
      void submit(actions);
    }
  }, [actions, remainingMs, run, submit]);

  useEffect(() => {
    if (!run || !finished || submittingRef.current) return;
    const timer = window.setTimeout(() => void submit(actions), 1100);
    return () => window.clearTimeout(timer);
  }, [actions, finished, run, submit]);

  async function handleStart() {
    setBusy(true);
    setSettlement(null);
    const res = await startTrialAction();
    setBusy(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    const started = res.data;
    setRun({
      runId: started.runId,
      dungeon: started.dungeon,
      startedAt: started.startedAt,
      expiresAt: started.expiresAt,
    });
    setRunsToday(started.runsToday);
    setSessionActions(null);
    setNow(Date.now());
    router.refresh();
  }

  function act(action: TrialAction) {
    if (!run || finished || busy || !result) return;
    if (action.t === "skill") {
      if (result.status !== "fighting") return;
      if (action.s === "arc" && result.cooldowns.arc > 0) return;
      if (action.s === "burst" && result.cooldowns.burst > 0) return;
    }
    if (action.t === "item") {
      if (result.status !== "fighting" || result.potions <= 0) return;
    }
    if (action.t === "boss" && result.status !== "choosing") return;
    if (action.t === "enter" && (result.status !== "choosing" || result.fieldCleared)) return;
    setSessionActions((prev) => [...(prev ?? resumedActions), action]);
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
          <div className="relative flex items-center gap-4">
            <div className="h-20 w-20 shrink-0">
              <TrialHeroArt hurt={false} />
            </div>
            <div className="min-w-0 text-sm">
              <p className="font-display text-base font-semibold tracking-wide text-cyan-100">
                浮游城 · 逐层攻略
              </p>
              <p className="mt-1 text-muted-foreground">
                共 {props.floorCount} 层。每层先在两扇野区门里探路（战斗 / 精英 / 宝箱 / 营地），
                再进入层主房；击败层主才能上楼。剑技有冷却，连击加伤，层主残血会狂暴。
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            单局限时 {props.timeLimitSeconds} 秒；本局票价 <CouponCount kind="trial" count={props.priceTickets} />，
            最高可得 {formatCredits(props.maxReward)} tcr。
          </p>
          <Button
            type="button"
            onClick={() => void handleStart()}
            disabled={busy || !canStart}
            className="font-display tracking-[0.18em]"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            LINK START
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

  if (!dungeon || !result) return null;

  const urgent = remainingMs <= 30_000;
  const floorNo = Math.min(result.floorIndex + 1, dungeon.floors.length);
  const floor = dungeon.floors[Math.min(result.floorIndex, dungeon.floors.length - 1)];
  const intent = result.current?.nextIntent ? INTENT_META[result.current.nextIntent] : null;
  const IntentIcon = intent?.icon;
  const lastTurnKey = result.log.length;
  const monsterHurt = Boolean(last && last.dealt > 0 && !last.roomCleared);
  const heroHurt = Boolean(last && last.taken > 0);
  const recentEvents = result.events.slice(-2).reverse();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          <span className="font-display text-base font-semibold tracking-wider text-cyan-200">
            {floorNo}F
          </span>
          <span className="text-xs">/ {dungeon.floors.length}F</span>
          <FloorTracker total={dungeon.floors.length} cleared={result.floorsCleared} />
          <span className="rounded border border-cyan-400/30 px-1.5 py-0.5 text-xs text-cyan-200">
            Lv.{result.level}
          </span>
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 tabular-nums",
            urgent ? "font-semibold text-destructive" : "text-muted-foreground",
          )}
        >
          <Timer className="h-4 w-4" />
          {formatClock(remainingMs)}
        </span>
      </div>

      <div className="space-y-2 rounded-xl border border-border bg-secondary/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            试炼者 Lv.{result.level} · 生命 {result.heroHp}/{result.heroMaxHp}
          </span>
          <span className="flex items-center gap-2">
            {result.combo > 0 ? (
              <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-amber-200">
                连击 ×{result.combo}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <FlaskConical className="h-3 w-3" />
              回复结晶 ×{result.potions}
            </span>
          </span>
        </div>
        <Bar value={result.heroHp} max={result.heroMaxHp} tone="hero" />
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="w-8 shrink-0">EXP</span>
          <Bar value={result.exp} max={result.expToNext} tone="exp" />
          <span className="tabular-nums">
            {result.exp}/{result.expToNext}
          </span>
        </div>
        <RelicChips relics={result.relics} />
        {recentEvents.length > 0 ? (
          <div className="space-y-0.5 text-xs text-muted-foreground">
            {recentEvents.map((event, i) => (
              <p key={`${event.floor}-${event.title}-${i}`} className="truncate">
                {event.floor}F · {event.title}
                {event.relic ? ` · 获得「${TRIAL_RELICS[event.relic].name}」` : ""}
                {event.healed > 0 ? ` · 回复 ${event.healed}` : ""}
                {event.xp > 0 ? ` · EXP +${event.xp}` : ""}
              </p>
            ))}
          </div>
        ) : null}
      </div>

      {result.status === "choosing" ? (
        <div className="space-y-2">
          {result.fieldCleared ? (
            <p className="text-sm text-muted-foreground">
              {floorNo}F 野区已探完，前往层主房继续上行。
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {floorNo}F · 选择一条野区路线（也可以直接去层主房）
              </p>
              <div className={cn("grid gap-2", floor.rooms.length > 1 && "sm:grid-cols-2")}>
                {floor.rooms.map((room, index) => (
                  <RoomDoor
                    key={`${result.floorIndex}-${index}`}
                    room={room}
                    disabled={busy}
                    onEnter={() => act({ t: "enter", i: index })}
                  />
                ))}
              </div>
            </>
          )}
          <BossDoor
            floorNo={floorNo}
            boss={floor.boss}
            isLast={result.floorIndex >= dungeon.floors.length - 1}
            disabled={busy}
            onEnter={() => act({ t: "boss" })}
          />
        </div>
      ) : null}

      {result.status === "fighting" && result.current ? (
        <>
          <div className="relative overflow-hidden rounded-2xl border border-cyan-400/20 bg-[radial-gradient(circle_at_20%_15%,rgba(34,211,238,0.18),transparent_55%),radial-gradient(circle_at_85%_80%,rgba(99,102,241,0.22),transparent_50%)] bg-slate-950/40 p-4">
            <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(rgba(255,255,255,0.35)_1px,transparent_1px)] [background-size:34px_34px]" />

            {result.current.boss ? (
              <p className="relative mb-2 text-center font-display text-xs tracking-[0.3em] text-rose-300">
                FLOOR BOSS
              </p>
            ) : null}

            <div className="relative grid grid-cols-[1fr_auto_1fr] items-end gap-2 sm:gap-4">
              <div className="space-y-2">
                <div className="relative mx-auto h-28 w-28 sm:h-36 sm:w-36">
                  <TrialHeroArt hurt={heroHurt} />
                  {last && last.healed > 0 ? (
                    <span
                      key={`heal-${lastTurnKey}`}
                      className="trial-float pointer-events-none absolute inset-x-0 top-2 text-center text-sm font-semibold text-emerald-300"
                    >
                      +{last.healed}
                    </span>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <p className="flex items-baseline justify-between text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Lv.{result.level}</span>
                    <span className="tabular-nums">
                      {result.heroHp} / {result.heroMaxHp}
                    </span>
                  </p>
                  <Bar value={result.heroHp} max={result.heroMaxHp} tone="hero" />
                </div>
              </div>

              <div className="pb-10 text-center">
                <p className="font-display text-lg font-semibold tracking-widest text-cyan-200/80">VS</p>
              </div>

              <div className="space-y-2">
                <div className="relative mx-auto h-28 w-28 sm:h-36 sm:w-36">
                  <div key={lastTurnKey} className="h-full w-full">
                    <TrialMonsterArt
                      shape={result.current.room.wave?.shape ?? "mire"}
                      hurt={monsterHurt}
                    />
                  </div>
                  {last && last.dealt > 0 ? (
                    <span
                      key={`dmg-${lastTurnKey}`}
                      className="trial-float pointer-events-none absolute inset-x-0 top-2 text-center text-lg font-bold text-rose-300 drop-shadow"
                    >
                      -{last.dealt}
                    </span>
                  ) : null}
                  {last && last.roomCleared ? (
                    <span
                      key={`clear-${lastTurnKey}`}
                      className="trial-float pointer-events-none absolute inset-x-0 top-2 text-center text-sm font-semibold text-amber-200"
                    >
                      击破！
                    </span>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <p className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate font-medium text-foreground">
                      {result.current.boss ? "层主 · " : ""}
                      {result.current.room.wave?.name ?? result.current.room.title}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {result.current.monsterHp} / {result.current.monsterMaxHp}
                    </span>
                  </p>
                  <Bar
                    value={result.current.monsterHp}
                    max={result.current.monsterMaxHp}
                    tone="monster"
                  />
                  <div className="flex flex-wrap items-center gap-1">
                    {result.current.monsterShield > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/40 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-300">
                        <Shield className="h-3 w-3" />
                        护盾 {result.current.monsterShield}
                      </span>
                    ) : null}
                    {result.current.enraged ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/50 bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-200">
                        <Flame className="h-3 w-3" />
                        狂暴 · 伤害 +35%
                      </span>
                    ) : null}
                    {intent && IntentIcon ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                          intent.tone,
                        )}
                      >
                        <IntentIcon className="h-3 w-3" />
                        下一步：{intent.label}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {last ? (
              <p className="relative mt-3 truncate rounded-lg bg-black/30 px-3 py-1.5 text-xs text-cyan-100/80">
                {turnSummary(last)}
              </p>
            ) : (
              <p className="relative mt-3 rounded-lg bg-black/30 px-3 py-1.5 text-xs text-cyan-100/80">
                {result.current.room.hint}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {TRIAL_SKILLS.map((skill) => {
              const Icon = SKILL_ICONS[skill.id];
              const cd = skill.id === "arc" ? result.cooldowns.arc : skill.id === "burst" ? result.cooldowns.burst : 0;
              return (
                <Button
                  key={skill.id}
                  type="button"
                  variant={skill.id === "burst" ? "primary" : "outline"}
                  className="h-auto flex-col items-start gap-1 py-2.5 text-left"
                  onClick={() => act({ t: "skill", s: skill.id })}
                  disabled={busy || cd > 0}
                >
                  <span className="flex w-full items-center justify-between text-sm font-medium">
                    {skill.name}
                    {cd > 0 ? <span className="text-xs opacity-70">冷却 {cd}</span> : <Icon className="h-3.5 w-3.5" />}
                  </span>
                  <span className="text-xs font-normal opacity-70">{skill.desc}</span>
                </Button>
              );
            })}
          </div>

          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => act({ t: "item" })}
            disabled={busy || result.potions <= 0}
          >
            <FlaskConical className="h-4 w-4" />
            使用回复结晶（剩余 {result.potions}，回复 32 生命）
          </Button>

          <p className="text-xs text-muted-foreground">
            连击每层 +2 伤害（最多 +10），受伤或防守会清空连击；层主残血进入狂暴。
            生命跨房间保留，升级会提升生命上限并回复 10。
          </p>
        </>
      ) : null}

      {finished ? (
        <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          对局结束，正在结算…
        </p>
      ) : null}
    </div>
  );
}

function RoomDoor({
  room,
  disabled,
  onEnter,
}: {
  room: TrialRoom;
  disabled: boolean;
  onEnter: () => void;
}) {
  const meta = ROOM_META[room.kind];
  const Icon = meta.icon;
  return (
    <button
      type="button"
      onClick={onEnter}
      disabled={disabled}
      className={cn(
        "group flex items-center gap-3 rounded-xl border bg-gradient-to-br to-transparent p-3 text-left transition",
        "hover:border-cyan-400/50 hover:shadow-[0_0_24px_-8px_rgba(34,211,238,0.65)] disabled:opacity-60",
        meta.tone,
      )}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-black/30 ring-1 ring-white/10">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 space-y-0.5">
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          {room.title}
          <span className="rounded-full border border-white/15 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {meta.label}
          </span>
        </span>
        <span className="block truncate text-xs text-muted-foreground">{room.hint}</span>
      </span>
    </button>
  );
}

function BossDoor({
  floorNo,
  boss,
  isLast,
  disabled,
  onEnter,
}: {
  floorNo: number;
  boss: TrialRoom;
  isLast: boolean;
  disabled: boolean;
  onEnter: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onEnter}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border border-rose-400/40 bg-gradient-to-r from-rose-500/20 via-rose-500/5 to-transparent p-3 text-left transition",
        "hover:border-rose-300/70 hover:shadow-[0_0_28px_-8px_rgba(244,63,94,0.7)] disabled:opacity-60",
      )}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-black/40 text-rose-200 ring-1 ring-rose-400/30">
        <Crown className="h-5 w-5" />
      </span>
      <span className="min-w-0 space-y-0.5">
        <span className="flex items-center gap-2 text-sm font-medium text-rose-100">
          层主房 · {boss.wave?.name ?? "层主"}
          <span className="rounded-full border border-rose-400/40 px-1.5 py-0.5 text-[10px] text-rose-200">
            {floorNo}F
          </span>
        </span>
        <span className="block truncate text-xs text-rose-200/70">
          {isLast ? "击败即登顶" : `击败后开启 ${floorNo + 1}F 的转移门`}
          {boss.wave ? ` · ${boss.wave.hp} 生命 / ${boss.wave.atk} 攻击` : ""}
        </span>
      </span>
    </button>
  );
}
