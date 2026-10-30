"use client";

import { Bomb, Coins, Gamepad2, Heart, Trophy, Volume2, VolumeX, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCredits } from "@/lib/billing/credits";
import {
  describeLoadout,
  loadoutCost,
  RAIDEN_STAGES,
  startingStats,
  stageRewardFor,
  type RaidenActivityStatus,
  type RaidenConfig,
  type RaidenLoadout,
} from "@/lib/raiden/config";

const STATUS_LABEL: Record<RaidenActivityStatus, string> = {
  active: "进行中",
  pending: "未开始",
  disabled: "未开启",
  ended: "已结束",
};

/** 游戏画面内的出击准备页；装备、记录、排行与规则在旁边的作战面板。 */
export function StartScreen({
  config,
  status,
  balance,
  runsLeft,
  loadout,
  starting,
  onStart,
  muted,
  onToggleMute,
}: {
  config: RaidenConfig;
  status: RaidenActivityStatus;
  balance: number;
  runsLeft: number;
  loadout: RaidenLoadout;
  starting: boolean;
  onStart: () => void;
  muted: boolean;
  onToggleMute: () => void;
}) {
  const cost = loadoutCost(config, loadout);
  const initial = startingStats(loadout);
  const insufficient = cost > balance;
  const closed = status !== "active";
  const noRuns = runsLeft <= 0;
  const disabled = starting || closed || noRuns || insufficient;
  const hint = closed
    ? status === "disabled"
      ? "活动未开启，管理员开启后即可出击"
      : status === "pending"
        ? `活动尚未开始${config.startAt ? ` · ${config.startAt}` : ""}`
        : "活动已结束"
    : noRuns
      ? "今日出击次数已用完"
      : insufficient
        ? `余额不足，还差 ${formatCredits(cost - balance)} cr`
        : null;

  return (
    <div className="absolute inset-0 z-20 flex flex-col overflow-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.16),transparent_55%),linear-gradient(180deg,#050b14_0%,#03060b_100%)] text-white">
      <div className="shrink-0 border-b border-white/10 px-4 pb-2.5 pt-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[8px] uppercase tracking-[0.4em] text-cyan-300/70">Limited Operation</p>
            <h1 className="mt-0.5 font-mono text-[22px] font-black leading-none tracking-[0.14em] text-white drop-shadow-[0_0_18px_rgba(34,211,238,0.45)]">
              雷电行动 <span className="text-cyan-300/80">III</span>
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Badge tone={status === "active" ? "success" : "muted"}>{STATUS_LABEL[status]}</Badge>
            <TopIcon label={muted ? "打开音效" : "关闭音效"} onClick={onToggleMute}>
              {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </TopIcon>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-white/55">
          <span className="flex items-center gap-1">
            <Coins className="h-3 w-3 text-amber-300/80" />
            余额 <span className="font-mono font-semibold text-white/90">{formatCredits(balance)}</span> cr
          </span>
          <span>
            今日 <span className="font-mono text-white/90">{runsLeft}</span>/{config.dailyRuns} 次
          </span>
          <span className="text-cyan-200/50">首通奖励进入临时余额</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        <MissionBrief config={config} />

        <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/[0.04] px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium text-cyan-100/80">当前装备</p>
            <p className="shrink-0 font-mono text-xs text-amber-200">
              {cost > 0 ? `${formatCredits(cost)} cr` : "标准配备"}
            </p>
          </div>
          <p className="mt-1 truncate text-[11px] text-white/75">{describeLoadout(config, loadout)}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-white/45">
            <span className="flex items-center gap-1">
              <Heart className="h-3 w-3 text-rose-400/80" /> {initial.lives} 命
            </span>
            <span className="flex items-center gap-1">
              <Bomb className="h-3 w-3 text-amber-300/80" /> {initial.bombs} 弹
            </span>
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3 text-cyan-300/80" /> 机炮（W）Lv{initial.power}
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <Gamepad2 className="h-3.5 w-3.5 text-cyan-300/80" />
            <p className="text-[10px] font-medium text-white/70">作战面板</p>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-white/45">
            装备配置、出击记录、排行榜与规则都在
            <span className="hidden xl:inline">右侧面板</span>
            <span className="xl:hidden">下方面板</span>
            中；出击后会自动切换为实时战况。
            <a
              href="#raiden-console"
              className="ml-1 text-cyan-300/80 underline decoration-cyan-400/40 underline-offset-2 xl:hidden"
            >
              去配置
            </a>
          </p>
        </div>
      </div>

      <div className="shrink-0 border-t border-white/10 bg-black/60 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 text-[10px] text-white/50">
            <p className="truncate">
              装备合计{" "}
              <span className="font-mono text-sm font-semibold text-white">{formatCredits(cost)}</span>{" "}
              cr
            </p>
            <p className={hint ? "mt-0.5 truncate text-amber-300/80" : "mt-0.5 truncate text-white/35"}>
              {hint ?? "准备就绪，出击后自动射击"}
            </p>
          </div>
          <Button
            type="button"
            size="lg"
            onClick={onStart}
            disabled={disabled}
            className="h-10 min-w-28 shrink-0 bg-cyan-500 text-sm font-semibold text-black hover:bg-cyan-400"
          >
            {starting ? "出击中…" : closed ? "不可出击" : noRuns ? "次数用完" : "装备并出击"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TopIcon({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-white/5 text-white/60 transition hover:text-white"
    >
      {children}
    </button>
  );
}

function MissionBrief({ config }: { config: RaidenConfig }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-[10px] font-medium text-white/50">
          <Trophy className="h-3 w-3 text-amber-300/70" />
          行动简报
        </p>
        <p className="text-[9px] text-white/30">击破关卡 Boss 即可通关</p>
      </div>
      <div className="space-y-1">
        {RAIDEN_STAGES.map((stage) => {
          const reward = stageRewardFor(config, stage.no);
          return (
            <div key={stage.no} className="flex items-center gap-2 text-[10px]">
              <span className="w-8 shrink-0 font-mono text-cyan-300/70">ST{stage.no}</span>
              <span className="shrink-0 text-white/80">{stage.name}</span>
              <span className="min-w-0 flex-1 truncate text-white/35">{stage.brief}</span>
              <span className="shrink-0 font-mono text-amber-300/70">
                首通 {formatCredits(reward.firstClear)} cr
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
