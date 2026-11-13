"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  BadgeCheck,
  BookOpen,
  Coins,
  Heart,
  Loader2,
  Lock,
  Map,
  Package,
  PawPrint,
  RotateCcw,
  Shield,
  Sparkles,
  Swords,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CouponCount } from "@/components/activity/coupon-badge";
import { formatCredits } from "@/lib/billing/credits";
import { cn } from "@/lib/utils";
import {
  WORKSHOP_TIER_COUNT,
  workshopTierName,
  type WorkshopMilestone,
} from "@/lib/workshop/config";
import {
  WORKSHOP_MAX_LEVEL,
  WORKSHOP_PARTY_SIZE,
  expToNext,
  petName,
  petStats,
  type WorkshopPet,
} from "@/lib/workshop/pets";
import {
  movesFor,
  typeMultiplier,
  type WorkshopArea,
  type WorkshopBattleAction,
  type WorkshopBattleEvent,
  type WorkshopGym,
} from "@/lib/workshop/battle";
import { highestTier, type WorkshopState } from "@/lib/workshop/state";
import { workshopFieldFor } from "@/lib/workshop/field";
import {
  chooseWorkshopStarterAction,
  challengeWorkshopGymAction,
  claimWorkshopMilestonesAction,
  enterWorkshopFieldAction,
  leaveWorkshopFieldAction,
  mergeWorkshopAction,
  moveWorkshopPetAction,
  restWorkshopPartyAction,
  setWorkshopActivePetAction,
  drinkWorkshopPotionAction,
  walkWorkshopFieldAction,
  workshopBattleAction,
} from "@/app/(dashboard)/workshop/actions";
import type { WorkshopWalkPath } from "@/lib/workshop/run";
import { PixelPet } from "./pixel-pet";
import { WorkshopFieldCanvas, type WorkshopWalkResult } from "./field-canvas";

interface BoardLine {
  key: string;
  name: string;
  tiers: string[];
}

interface WorkshopBoardProps {
  initial: WorkshopState;
  version: number;
  lines: BoardLine[];
  areas: WorkshopArea[];
  gyms: WorkshopGym[];
  milestones: WorkshopMilestone[];
  grantedTiers: number[];
  dailyExplores: number;
  dailyGyms: number;
  /** 一趟探险的步数 / 遇敌上限。 */
  runLimits: { maxSteps: number; maxEncounters: number };
  exploreTickets: number;
  gymTickets: number;
  couponTickets: number;
}

type TabKey = "adventure" | "team" | "dex";
type BattleStatus = "ongoing" | "won" | "lost" | "captured" | "fled";

const TAB_LABEL: Record<TabKey, string> = {
  adventure: "冒险",
  team: "队伍",
  dex: "图鉴",
};

const LINE_BLURB: Record<string, string> = {
  ember: "火系 · 攻击成长最高，本系技克制森语鹿。",
  tide: "水系 · 体力成长最高，本系技克制焰尾狐。",
  verdant: "草系 · 防御成长最高，本系技克制潮汐鲸。",
};

function lineName(lines: BoardLine[], key: string): string {
  return lines.find((line) => line.key === key)?.name ?? key;
}

function areaName(areas: WorkshopArea[], key: string): string {
  return areas.find((area) => area.key === key)?.name ?? "野外";
}

function toneClass(tone?: WorkshopBattleEvent["tone"]): string {
  if (tone === "good") return "text-success";
  if (tone === "bad") return "text-destructive";
  return "text-muted-foreground";
}

function HpBar({ hp, maxHp, className }: { hp: number; maxHp: number; className?: string }) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, Math.round((hp / maxHp) * 100))) : 0;
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn(
          "h-full rounded-full transition-all",
          pct > 50 ? "bg-success" : pct > 20 ? "bg-amber-500" : "bg-destructive",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ExpBar({ pet }: { pet: WorkshopPet }) {
  const need = expToNext(pet.level);
  const pct = pet.level >= WORKSHOP_MAX_LEVEL ? 100 : Math.round((pet.exp / need) * 100);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

export function WorkshopBoard(props: WorkshopBoardProps) {
  const router = useRouter();
  const [state, setState] = useState<WorkshopState>(props.initial);
  const [granted, setGranted] = useState<number[]>(props.grantedTiers);
  const [tab, setTab] = useState<TabKey>("adventure");
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<WorkshopBattleEvent[]>([]);
  const [lastStatus, setLastStatus] = useState<BattleStatus | null>(null);

  const active = state.party.find((pet) => pet.id === state.activePetId) ?? state.party[0] ?? null;
  const alive = state.party.some((pet) => pet.hp > 0);
  const hurt = state.party.some((pet) => pet.hp < petStats(pet.tier, pet.level).maxHp);
  const reached = highestTier(state);
  const claimable = props.milestones.filter(
    (item) => item.tier <= reached && item.reward > 0 && !granted.includes(item.tier),
  );
  const nextGym = props.gyms.find((gym) => gym.stage === state.badges + 1) ?? null;

  function acceptData(data: {
    state: WorkshopState;
    milestoneReward: number;
    milestoneTiers: number[];
  }) {
    setState(data.state);
    if (data.milestoneTiers.length > 0) {
      setGranted((prev) => [...new Set([...prev, ...data.milestoneTiers])]);
      if (data.milestoneReward > 0) {
        toast.success(
          `达成 ${data.milestoneTiers.join(" / ")} 阶，获得 ${formatCredits(data.milestoneReward)} tcr`,
        );
      }
    }
  }

  async function chooseStarter(lineKey: string) {
    if (busy) return;
    setBusy(`starter-${lineKey}`);
    const res = await chooseWorkshopStarterAction(lineKey);
    setBusy(null);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    acceptData(res.data);
    toast.success("伙伴已就位，去灰烬原野进图吧");
    router.refresh();
  }

  async function enter(areaKey: string) {
    if (busy) return;
    setBusy(`enter-${areaKey}`);
    const res = await enterWorkshopFieldAction(areaKey);
    setBusy(null);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    acceptData(res.data);
    setLastStatus(null);
    setLog([
      {
        text: `进入${props.areas.find((area) => area.key === areaKey)?.name ?? "野外"}，从营地出发`,
        tone: "info",
      },
    ]);
    router.refresh();
  }

  /** 走位：把这段路径交给服务端重放，返回值就是权威光标；失败由 toast 说原因。 */
  async function walk(path: WorkshopWalkPath): Promise<WorkshopWalkResult | null> {
    const res = await walkWorkshopFieldAction(path);
    if (!res.success) {
      toast.error(res.error);
      return null;
    }
    acceptData(res.data);
    const walkResult = res.data.walk;
    if (walkResult.kind === "encounter") {
      setLastStatus(null);
      setLog([{ text: "草丛里窜出一只灵宠！", tone: "bad" }]);
    } else if (walkResult.kind === "capped") {
      setLog([
        {
          text:
            walkResult.reason === "steps"
              ? "这趟已经走满了步数，探险结束"
              : "遇敌次数用尽，这趟到此为止",
          tone: "info",
        },
      ]);
    }
    return walkResult;
  }

  async function leaveField() {
    if (busy) return;
    setBusy("leave");
    const res = await leaveWorkshopFieldAction();
    setBusy(null);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    acceptData(res.data);
    toast.message("已回到营地，这趟探险结束");
    router.refresh();
  }

  function fieldInteract(kind: "camp" | "gym") {
    if (kind === "camp") {
      void leaveField();
      return;
    }
    void challengeGym();
  }

  async function challengeGym() {
    if (busy) return;
    setBusy("gym");
    const res = await challengeWorkshopGymAction();
    setBusy(null);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    acceptData(res.data);
    setLastStatus(null);
    const encounter = res.data.state.encounter;
    setLog(
      encounter
        ? [{ text: `道馆战开始：${petName(encounter)}（Lv.${encounter.level}）`, tone: "info" }]
        : [],
    );
    router.refresh();
  }

  async function act(action: WorkshopBattleAction) {
    if (busy) return;
    setBusy(`battle-${action.kind}`);
    const res = await workshopBattleAction(action);
    setBusy(null);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    acceptData(res.data);
    setLog((prev) => [...prev, ...res.data.battle.events].slice(-24));
    setLastStatus(res.data.battle.status);
    if (res.data.battle.status === "captured") {
      toast.success(
        res.data.battle.captured ? `捕捉到 ${res.data.battle.captured.name}` : "捕捉成功",
      );
    }
    if (res.data.battle.status === "won") toast.success("战斗胜利");
    if (res.data.battle.status === "lost") toast.error("队伍全灭，被伙伴扶回营地休整");
    if (res.data.battle.status !== "ongoing") router.refresh();
  }

  async function rest() {
    if (busy) return;
    setBusy("rest");
    const res = await restWorkshopPartyAction();
    setBusy(null);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    acceptData(res.data);
    toast.success(`休息后回复 ${res.data.healed} 点体力`);
    router.refresh();
  }

  async function drinkPotion(petId: string) {
    if (busy) return;
    setBusy(`potion-${petId}`);
    const res = await drinkWorkshopPotionAction(petId);
    setBusy(null);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    acceptData(res.data);
    toast.success(`回复了 ${res.data.healed} 点体力`);
  }

  async function setActive(petId: string) {
    if (busy) return;
    setBusy(`active-${petId}`);
    const res = await setWorkshopActivePetAction(petId);
    setBusy(null);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    acceptData(res.data);
    toast.success("已更换出战灵宠");
  }

  async function movePet(petId: string, target: "party" | "box") {
    if (busy) return;
    setBusy(`move-${petId}`);
    const res = await moveWorkshopPetAction({ petId, target });
    setBusy(null);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    acceptData(res.data);
  }

  async function merge(lineKey: string, tier: number) {
    if (busy) return;
    setBusy(`merge-${lineKey}-${tier}`);
    const res = await mergeWorkshopAction({ lineKey, tier });
    setBusy(null);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    acceptData(res.data);
    toast.success(`合成出 ${res.data.merged.name}`);
    router.refresh();
  }

  async function claimMilestones() {
    if (busy) return;
    setBusy("claim");
    const res = await claimWorkshopMilestonesAction();
    setBusy(null);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    if (res.data.reward > 0) {
      toast.success(`补领 ${formatCredits(res.data.reward)} tcr`);
      setGranted((prev) => [...new Set([...prev, ...res.data.tiers])]);
      router.refresh();
    } else {
      toast.message("没有可补领的里程碑");
    }
  }

  if (!state.starter && state.party.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-4 text-center">
          <p className="text-sm font-medium">选择你的第一个伙伴</p>
          <p className="mt-1 text-xs text-muted-foreground">
            三选一，Lv.5 起步；三条线都能在野外遇到，不必担心选错。
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {props.lines.map((line) => {
            const stats = petStats(1, 5);
            const loading = busy === `starter-${line.key}`;
            return (
              <div
                key={line.key}
                className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 text-center"
              >
                <PixelPet lineKey={line.key} tier={1} size={96} />
                <p className="text-sm font-semibold">{line.name}</p>
                <p className="text-xs text-muted-foreground">{LINE_BLURB[line.key]}</p>
                <p className="text-xs text-muted-foreground">
                  初始形态 {line.tiers[0]} · HP {stats.maxHp} · 攻 {stats.atk} · 防 {stats.def}
                </p>
                <Button
                  type="button"
                  className="mt-1 w-full"
                  disabled={busy !== null}
                  onClick={() => void chooseStarter(line.key)}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PawPrint className="h-4 w-4" />}
                  选择{line.name}
                </Button>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          属性克制：焰尾狐 → 森语鹿 → 潮汐鲸 → 焰尾狐（克制 ×1.5，被克 ×0.67）。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
        <span className="flex items-center gap-1.5">
          <Trophy className="h-4 w-4 text-amber-500" /> 徽章 {state.badges} / 3
        </span>
        <span className="flex items-center gap-1.5">
          <Package className="h-4 w-4" /> 精灵球 {state.items.ball}
        </span>
        <span className="flex items-center gap-1.5">
          <Heart className="h-4 w-4" /> 药水 {state.items.potion}
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Map className="h-4 w-4" /> 进图 {state.entersToday}/{props.dailyExplores}
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Swords className="h-4 w-4" /> 道馆 {state.gymsToday}/{props.dailyGyms}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={
            busy !== null ||
            !!state.encounter ||
            state.party.length === 0 ||
            (alive && !hurt)
          }
          onClick={() => void rest()}
        >
          {busy === "rest" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          {alive ? "休息（每日一次）" : "紧急休整"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["adventure", "team", "dex"] as TabKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm transition-colors",
              tab === key
                ? "border-primary bg-primary/10 font-medium text-foreground"
                : "border-border text-muted-foreground hover:bg-secondary",
            )}
          >
            {TAB_LABEL[key]}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          {active ? `出战：${petName(active)} Lv.${active.level}` : "没有可出战的灵宠"}
          {state.encounter ? " · 战斗中" : ""}
        </span>
      </div>

      {tab === "adventure" ? (
        state.encounter ? (
          <BattlePanel state={state} busy={busy} log={log} onAction={(action) => void act(action)} />
        ) : (
          <AdventurePanel
            state={state}
            lines={props.lines}
            areas={props.areas}
            gyms={props.gyms}
            milestones={props.milestones}
            granted={granted}
            claimable={claimable.length}
            reached={reached}
            busy={busy}
            alive={alive}
            dailyExplores={props.dailyExplores}
            dailyGyms={props.dailyGyms}
            runLimits={props.runLimits}
            exploreTickets={props.exploreTickets}
            gymTickets={props.gymTickets}
            couponTickets={props.couponTickets}
            nextGym={nextGym ?? undefined}
            log={log}
            lastStatus={lastStatus}
            activePet={active}
            onEnter={(areaKey) => void enter(areaKey)}
            onWalk={walk}
            onFieldInteract={fieldInteract}
            onLeaveField={() => void leaveField()}
            onGym={() => void challengeGym()}
            onClaim={() => void claimMilestones()}
            onDismissLog={() => {
              setLog([]);
              setLastStatus(null);
            }}
          />
        )
      ) : null}

      {tab === "team" ? (
        <TeamPanel
          state={state}
          lines={props.lines}
          busy={busy}
          onActive={(petId) => void setActive(petId)}
          onPotion={(petId) => void drinkPotion(petId)}
          onMove={(petId, target) => void movePet(petId, target)}
          onMerge={(lineKey, tier) => void merge(lineKey, tier)}
        />
      ) : null}

      {tab === "dex" ? <DexPanel state={state} lines={props.lines} /> : null}
    </div>
  );
}

interface BattlePanelProps {
  state: WorkshopState;
  busy: string | null;
  log: WorkshopBattleEvent[];
  onAction: (action: WorkshopBattleAction) => void;
}

function BattlePanel({ state, busy, log, onAction }: BattlePanelProps) {
  const [switchOpen, setSwitchOpen] = useState(false);
  const encounter = state.encounter;
  if (!encounter) return null;
  const active = state.party.find((pet) => pet.id === state.activePetId) ?? state.party[0];
  if (!active) return null;
  const maxHp = petStats(active.tier, active.level).maxHp;
  const moves = movesFor(active.lineKey);
  const disabled = busy !== null;
  const enemyName = workshopTierName(encounter.lineKey, encounter.tier);
  const canSwitch = state.party.some((pet) => pet.id !== active.id && pet.hp > 0);

  return (
    <div className="overflow-hidden rounded-lg border-2 border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {enemyName}
            <span className="ml-1 text-xs text-muted-foreground">Lv.{encounter.level}</span>
            {encounter.kind === "gym" ? (
              <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-600">
                道馆战
              </span>
            ) : null}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <HpBar hp={encounter.hp} maxHp={encounter.maxHp} className="max-w-56" />
            <span className="text-xs text-muted-foreground tabular-nums">
              {encounter.hp}/{encounter.maxHp}
            </span>
          </div>
        </div>
        <PixelPet lineKey={encounter.lineKey} tier={encounter.tier} size={72} />
      </div>

      <div className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_220px]">
        <div className="space-y-2">
          <div className="h-32 space-y-0.5 overflow-y-auto rounded border border-border bg-muted/20 p-2 text-xs leading-relaxed">
            {log.map((event, index) => (
              <p key={`${index}-${event.text}`} className={toneClass(event.tone)}>
                {event.text}
              </p>
            ))}
            {log.length === 0 ? <p className="text-muted-foreground">战斗继续，选择指令。</p> : null}
          </div>
          <div className="rounded border border-border p-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium">
                {petName(active)}
                <span className="ml-1 text-xs text-muted-foreground">Lv.{active.level}</span>
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {active.hp}/{maxHp}
              </span>
            </div>
            <HpBar hp={active.hp} maxHp={maxHp} className="mt-1" />
            <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>EXP {active.exp}/{active.level >= WORKSHOP_MAX_LEVEL ? "MAX" : expToNext(active.level)}</span>
              <span>攻 {petStats(active.tier, active.level).atk} · 防 {petStats(active.tier, active.level).def}</span>
            </div>
            <ExpBar pet={active} />
          </div>
        </div>

        <div className="space-y-2">
          {moves.map((move) => {
            const mult = typeMultiplier(move.type, encounter.lineKey);
            return (
              <Button
                key={move.id}
                type="button"
                variant="outline"
                className="w-full justify-between"
                disabled={disabled}
                onClick={() => onAction({ kind: "move", moveId: move.id })}
              >
                <span className="flex items-center gap-1.5">
                  <Swords className="h-3.5 w-3.5" />
                  {move.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {move.power}
                  {mult > 1 ? " · 克制" : mult < 1 ? " · 被克" : ""}
                </span>
              </Button>
            );
          })}
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" disabled={disabled} onClick={() => onAction({ kind: "guard" })}>
              <Shield className="h-3.5 w-3.5" /> 守住
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={disabled || encounter.kind === "gym"}
              onClick={() => onAction({ kind: "ball" })}
            >
              <Coins className="h-3.5 w-3.5" /> 球 ×{state.items.ball}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={disabled || state.items.potion <= 0}
              onClick={() => onAction({ kind: "potion" })}
            >
              <Heart className="h-3.5 w-3.5" /> 药 ×{state.items.potion}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={disabled || !canSwitch}
              onClick={() => setSwitchOpen((open) => !open)}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" /> 换宠
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="col-span-2"
              disabled={disabled || encounter.kind === "gym"}
              onClick={() => onAction({ kind: "run" })}
            >
              逃跑
            </Button>
          </div>
          {switchOpen ? (
            <div className="space-y-1 rounded border border-border p-2">
              {state.party
                .filter((pet) => pet.id !== active.id)
                .map((pet) => (
                  <Button
                    key={pet.id}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    disabled={disabled || pet.hp <= 0}
                    onClick={() => {
                      setSwitchOpen(false);
                      onAction({ kind: "switch", petId: pet.id });
                    }}
                  >
                    <PawPrint className="h-3.5 w-3.5" />
                    {petName(pet)} Lv.{pet.level}（{pet.hp}/{petStats(pet.tier, pet.level).maxHp}）
                  </Button>
                ))}
              {!canSwitch ? <p className="text-xs text-muted-foreground">没有其他还能战斗的灵宠。</p> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface AdventurePanelProps {
  state: WorkshopState;
  lines: BoardLine[];
  areas: WorkshopArea[];
  gyms: WorkshopGym[];
  milestones: WorkshopMilestone[];
  granted: number[];
  claimable: number;
  reached: number;
  busy: string | null;
  alive: boolean;
  dailyExplores: number;
  dailyGyms: number;
  runLimits: { maxSteps: number; maxEncounters: number };
  exploreTickets: number;
  gymTickets: number;
  couponTickets: number;
  nextGym: WorkshopGym | undefined;
  log: WorkshopBattleEvent[];
  lastStatus: BattleStatus | null;
  activePet: WorkshopPet | null;
  onEnter: (areaKey: string) => void;
  onWalk: (path: WorkshopWalkPath) => Promise<WorkshopWalkResult | null>;
  onFieldInteract: (kind: "camp" | "gym") => void;
  onLeaveField: () => void;
  onGym: () => void;
  onClaim: () => void;
  onDismissLog: () => void;
}

const HERO_COLORS: Record<string, { color: string; accent: string }> = {
  ember: { color: "#b34a1f", accent: "#f0a33c" },
  tide: { color: "#1f5f8b", accent: "#4fb3d9" },
  verdant: { color: "#2f7a3e", accent: "#7ac74f" },
};

function AdventurePanel(props: AdventurePanelProps) {
  const { state, busy } = props;
  const hero = HERO_COLORS[props.activePet?.lineKey ?? ""] ?? HERO_COLORS.verdant;
  const canExploreBase =
    props.alive &&
    !state.encounter &&
    !state.run &&
    state.entersToday < props.dailyExplores &&
    props.couponTickets >= props.exploreTickets;
  // 在地图里就得真走到道馆门口，服务端也是这么判的；按钮先灰掉，省一次必退券的空请求
  const run = state.run;
  const field = run ? workshopFieldFor(run.areaKey, run.seed) : null;
  const nearGym =
    !field ||
    !run ||
    (Math.abs(run.tx - field.gym.tx) <= 1 && Math.abs(run.ty - field.gym.ty) <= 1);
  const canGym =
    props.alive &&
    !state.encounter &&
    state.gymsToday < props.dailyGyms &&
    props.couponTickets >= props.gymTickets &&
    !!props.nextGym &&
    nearGym;

  return (
    <div className="space-y-4">
      {props.log.length > 0 && props.lastStatus && props.lastStatus !== "ongoing" ? (
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {props.lastStatus === "won"
                ? "战斗胜利"
                : props.lastStatus === "captured"
                  ? "捕捉成功"
                  : props.lastStatus === "lost"
                    ? "队伍全灭"
                    : "撤离战斗"}
            </p>
            <Button type="button" size="sm" variant="ghost" onClick={props.onDismissLog}>
              收起
            </Button>
          </div>
          <div className="mt-1 max-h-24 space-y-0.5 overflow-y-auto text-xs">
            {props.log.map((event, index) => (
              <p key={`${index}-${event.text}`} className={toneClass(event.tone)}>
                {event.text}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
          <Map className="h-4 w-4" /> {state.run ? "野外探险" : "野外探索"}
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            今日 {state.entersToday}/{props.dailyExplores} · 单次{" "}
            <CouponCount kind="workshop" count={props.exploreTickets} />
          </span>
        </p>
        {state.run ? (
          <WorkshopFieldCanvas
            areaKey={state.run.areaKey}
            seed={state.run.seed}
            areaName={areaName(props.areas, state.run.areaKey)}
            run={{
              tx: state.run.tx,
              ty: state.run.ty,
              steps: state.run.steps,
              encounters: state.run.encounters,
            }}
            limits={props.runLimits}
            badges={state.badges}
            partyColor={hero.color}
            partyAccent={hero.accent}
            locked={Boolean(state.encounter)}
            busy={busy !== null}
            onWalk={props.onWalk}
            onInteract={props.onFieldInteract}
            onLeave={props.onLeaveField}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {props.areas.map((area) => {
              const locked = state.badges < area.unlockBadges;
              const canGo = !locked && canExploreBase && busy === null;
              return (
                <div
                  key={area.key}
                  className={cn(
                    "flex flex-col gap-2 rounded-lg border p-3",
                    locked ? "border-border bg-muted/20 opacity-70" : "border-primary/25 bg-primary/5",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      {locked ? <Lock className="h-3.5 w-3.5" /> : <Map className="h-3.5 w-3.5" />}
                      {area.name}
                    </p>
                    <span className="text-[11px] text-muted-foreground">
                      {area.tiers[0]}~{area.tiers[1]} 阶 · Lv.{area.levels[0]}~{area.levels[1]}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{area.desc}</p>
                  <p className="text-[11px] text-muted-foreground">
                    出没：{area.lines.map((key) => lineName(props.lines, key)).join(" / ")}
                    （{lineName(props.lines, area.lines[0])} 更常见）
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    一次进图能走 {props.runLimits.maxSteps} 步、最多遇 {props.runLimits.maxEncounters} 只野生灵宠
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    className="mt-auto w-full"
                    disabled={!canGo}
                    onClick={() => props.onEnter(area.key)}
                  >
                    {busy === `enter-${area.key}` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : locked ? (
                      <Lock className="h-3.5 w-3.5" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {locked
                      ? `需要 ${area.unlockBadges} 枚徽章`
                      : state.entersToday >= props.dailyExplores
                        ? "今日进图次数已用完"
                        : props.couponTickets < props.exploreTickets
                          ? "活动券不足"
                          : "进图探险"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
          <Swords className="h-4 w-4" /> 道馆挑战
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            今日 {state.gymsToday}/{props.dailyGyms} · 单次{" "}
            <CouponCount kind="workshop" count={props.gymTickets} />
          </span>
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {props.gyms.map((gym) => {
            const cleared = state.badges >= gym.stage;
            const current = state.badges + 1 === gym.stage;
            return (
              <div
                key={gym.stage}
                className={cn(
                  "flex flex-col gap-2 rounded-lg border p-3",
                  cleared
                    ? "border-success/30 bg-success/5"
                    : current
                      ? "border-amber-500/40 bg-amber-500/5"
                      : "border-border bg-muted/20 opacity-70",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{gym.name}</p>
                  {cleared ? (
                    <BadgeCheck className="h-4 w-4 text-success" />
                  ) : current ? (
                    <Swords className="h-4 w-4 text-amber-500" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{gym.desc}</p>
                <p className="text-[11px] text-muted-foreground">
                  馆主 {gym.leader} · {workshopTierName(gym.lineKey, gym.tier)} Lv.{gym.level}
                </p>
                <p className="text-[11px] text-muted-foreground">胜利：{gym.badge} + 2 球 + 2 药</p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-auto w-full"
                  variant={current ? "primary" : "outline"}
                  disabled={!current || !canGym || busy !== null}
                  onClick={props.onGym}
                >
                  {busy === "gym" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : cleared ? (
                    <BadgeCheck className="h-3.5 w-3.5" />
                  ) : (
                    <Swords className="h-3.5 w-3.5" />
                  )}
                  {cleared
                    ? "已通关"
                    : current
                      ? state.gymsToday >= props.dailyGyms
                        ? "今日挑战次数已用完"
                        : nearGym
                          ? "挑战道馆"
                          : "先走到道馆门口"
                      : `先取得 ${gym.stage - 1} 枚徽章`}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">里程碑（任意一条线达到即发 tcr）</p>
          {props.claimable > 0 ? (
            <Button type="button" size="sm" disabled={busy !== null} onClick={props.onClaim}>
              {busy === "claim" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              补领 {props.claimable} 档
            </Button>
          ) : null}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {props.milestones.map((item) => {
            const done = props.granted.includes(item.tier);
            const reachedThis = props.reached >= item.tier;
            return (
              <div
                key={item.tier}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm",
                  done ? "border-success/30 bg-success/5" : "border-border bg-card",
                )}
              >
                <p className="flex items-center justify-between gap-2">
                  <span>{item.tier} 阶</span>
                  <span className={done ? "text-success" : "text-muted-foreground"}>
                    {done ? "已领取" : `${formatCredits(item.reward)} tcr`}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {done ? "本轮已发放" : reachedThis ? "已达成，可补领" : "进化或捕捉到该阶即可"}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface TeamPanelProps {
  state: WorkshopState;
  lines: BoardLine[];
  busy: string | null;
  onActive: (petId: string) => void;
  onPotion: (petId: string) => void;
  onMove: (petId: string, target: "party" | "box") => void;
  onMerge: (lineKey: string, tier: number) => void;
}

function TeamPanel(props: TeamPanelProps) {
  const { state, busy } = props;
  const counts = useMemo(() => {
    const map: Record<string, number[]> = {};
    for (const line of props.lines) map[line.key] = Array(WORKSHOP_TIER_COUNT).fill(0);
    for (const pet of [...state.party, ...state.box]) {
      if (map[pet.lineKey]) map[pet.lineKey][pet.tier - 1] += 1;
    }
    return map;
  }, [props.lines, state.party, state.box]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm font-medium">
            队伍 {state.party.length}/{WORKSHOP_PARTY_SIZE}
          </p>
          {state.party.map((pet) => {
            const maxHp = petStats(pet.tier, pet.level).maxHp;
            const isActive = pet.id === state.activePetId;
            return (
              <div key={pet.id} className="flex gap-3 rounded-lg border border-border bg-card p-2">
                <PixelPet lineKey={pet.lineKey} tier={pet.tier} size={48} className="mt-1" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">
                      {petName(pet)}
                      <span className="ml-1 text-xs text-muted-foreground">Lv.{pet.level}</span>
                      {isActive ? (
                        <span className="ml-1.5 rounded bg-primary/15 px-1 py-0.5 text-[10px] text-primary">
                          出战
                        </span>
                      ) : null}
                    </p>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {pet.hp}/{maxHp}
                    </span>
                  </div>
                  <HpBar hp={pet.hp} maxHp={maxHp} />
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>
                      EXP {pet.exp}/{pet.level >= WORKSHOP_MAX_LEVEL ? "MAX" : expToNext(pet.level)}
                    </span>
                    <span>
                      攻 {petStats(pet.tier, pet.level).atk} · 防 {petStats(pet.tier, pet.level).def}
                    </span>
                  </div>
                  <ExpBar pet={pet} />
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isActive || pet.hp <= 0 || busy !== null}
                      onClick={() => props.onActive(pet.id)}
                    >
                      出战
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pet.hp >= maxHp || state.items.potion <= 0 || busy !== null}
                      onClick={() => props.onPotion(pet.id)}
                    >
                      <Heart className="h-3 w-3" /> 药水
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={state.party.length <= 1 || busy !== null}
                      onClick={() => props.onMove(pet.id, "box")}
                    >
                      入仓
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">仓库 {state.box.length}/60</p>
          <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-1">
            {state.box.map((pet) => {
              const maxHp = petStats(pet.tier, pet.level).maxHp;
              return (
                <div key={pet.id} className="flex gap-2 rounded-lg border border-border bg-card p-2">
                  <PixelPet lineKey={pet.lineKey} tier={pet.tier} size={28} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                      {petName(pet)} <span className="text-muted-foreground">Lv.{pet.level}</span>
                    </p>
                    <HpBar hp={pet.hp} maxHp={maxHp} className="mt-1 h-1.5" />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="mt-1 h-6 px-1.5 text-[11px]"
                      disabled={state.party.length >= WORKSHOP_PARTY_SIZE || busy !== null}
                      onClick={() => props.onMove(pet.id, "party")}
                    >
                      入队
                    </Button>
                  </div>
                </div>
              );
            })}
            {state.box.length === 0 ? (
              <p className="col-span-2 rounded border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                仓库是空的，去野外捕捉灵宠吧。
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Package className="h-3.5 w-3.5" /> 精灵球 {state.items.ball}
            </span>
            <span className="flex items-center gap-1">
              <Heart className="h-3.5 w-3.5" /> 药水 {state.items.potion}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border p-3">
        <p className="text-sm font-medium">同阶合成（不花券）</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          两只同阶合成一只高一阶，优先消耗等级最低的两只；第 9 阶是终点。
        </p>
        <div className="mt-2 space-y-3">
          {props.lines.map((line) => (
            <div key={line.key}>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{line.name}</p>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                {Array.from({ length: WORKSHOP_TIER_COUNT - 1 }, (_, index) => index + 1).map((tier) => {
                  const count = counts[line.key]?.[tier - 1] ?? 0;
                  const can = count >= 2 && busy === null;
                  return (
                    <button
                      key={tier}
                      type="button"
                      disabled={!can}
                      onClick={() => props.onMerge(line.key, tier)}
                      className={cn(
                        "rounded border px-2 py-1 text-left text-[11px] transition-colors",
                        can
                          ? "border-primary/40 bg-primary/5 hover:bg-primary/10"
                          : "border-border bg-card opacity-60",
                      )}
                    >
                      <span className="flex items-center justify-between gap-1">
                        <span className="tabular-nums">
                          {tier} 阶 ×{count}
                        </span>
                        {busy === `merge-${line.key}-${tier}` ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : null}
                      </span>
                      <span className="text-muted-foreground">
                        {count >= 2 ? `→ ${line.tiers[tier]}` : "需要 2 只"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DexPanel({ state, lines }: { state: WorkshopState; lines: BoardLine[] }) {
  const unlocked = new Set(state.dex);
  const total = lines.length * WORKSHOP_TIER_COUNT;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <BookOpen className="h-4 w-4" /> 灵宠图鉴
        </p>
        <p className="text-xs text-muted-foreground">
          已发现 {state.dex.length} / {total}
        </p>
      </div>
      {lines.map((line) => {
        const owned = line.tiers.filter((_, index) => unlocked.has(`${line.key}:${index + 1}`)).length;
        return (
          <div key={line.key}>
            <p className="mb-2 text-sm font-medium">
              {line.name}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                {owned}/{WORKSHOP_TIER_COUNT}
              </span>
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-9">
              {line.tiers.map((name, index) => {
                const tier = index + 1;
                const has = unlocked.has(`${line.key}:${tier}`);
                return (
                  <div
                    key={name}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border p-2 text-center",
                      has ? "border-primary/30 bg-primary/5" : "border-border bg-muted/20",
                    )}
                  >
                    <PixelPet lineKey={line.key} tier={tier} size={40} silhouette={!has} />
                    <p className={cn("text-[11px] leading-tight", has ? "font-medium" : "text-muted-foreground")}>
                      {has ? name : "？？？"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{tier} 阶</p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">
        图鉴记录的是「到达过的阶级」：捕捉、进化或合成出更高阶都会点亮，不会因为合成消耗而熄灭。
      </p>
    </div>
  );
}
