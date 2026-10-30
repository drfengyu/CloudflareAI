"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Coins,
  Gamepad2,
  ListOrdered,
  ScrollText,
  Swords,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCredits } from "@/lib/billing/credits";
import { formatCnDateTime } from "@/lib/date";
import {
  loadoutCost,
  RAIDEN_STAGES,
  stageRewardFor,
  type RaidenActivityStatus,
  type RaidenConfig,
  type RaidenLoadout,
} from "@/lib/raiden/config";
import type {
  BigWinRow,
  LeaderboardRow,
  MyRaidenSummary,
} from "@/lib/raiden/records";
import { LoadoutShop } from "./loadout-shop";

type Tab = "loadout" | "records" | "rank" | "rules";

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "loadout", label: "装备", icon: Gamepad2 },
  { key: "records", label: "记录", icon: ScrollText },
  { key: "rank", label: "排行", icon: ListOrdered },
  { key: "rules", label: "规则", icon: Swords },
];

const STATUS_LABEL: Record<RaidenActivityStatus, string> = {
  active: "进行中",
  pending: "未开始",
  disabled: "未开启",
  ended: "已结束",
};

/** 全屏准备界面：装备、记录、排行、规则都在游戏画面内。 */
export function StartScreen({
  config,
  status,
  balance,
  runsLeft,
  summary,
  leaderboard,
  firstClears,
  loadout,
  onLoadoutChange,
  starting,
  onStart,
  muted,
  onToggleMute,
}: {
  config: RaidenConfig;
  status: RaidenActivityStatus;
  balance: number;
  runsLeft: number;
  summary: MyRaidenSummary;
  leaderboard: LeaderboardRow[];
  firstClears: BigWinRow[];
  loadout: RaidenLoadout;
  onLoadoutChange: (loadout: RaidenLoadout) => void;
  starting: boolean;
  onStart: () => void;
  muted: boolean;
  onToggleMute: () => void;
}) {
  const [tab, setTab] = useState<Tab>("loadout");
  const cost = loadoutCost(config, loadout);
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
            <Link
              href="/"
              aria-label="返回控制台"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-white/5 text-white/60 transition hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </Link>
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

      <div className="flex shrink-0 gap-1 px-3 pt-2">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] transition",
                active
                  ? "border-cyan-400/45 bg-cyan-400/12 text-cyan-200"
                  : "border-transparent text-white/45 hover:bg-white/5 hover:text-white/70",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
        {tab === "loadout" ? (
          <div className="space-y-3">
            <LoadoutShop config={config} loadout={loadout} onChange={onLoadoutChange} />
            <MissionBrief config={config} />
          </div>
        ) : tab === "records" ? (
          <RecordsPanel summary={summary} />
        ) : tab === "rank" ? (
          <RankPanel leaderboard={leaderboard} firstClears={firstClears} />
        ) : (
          <RulesPanel config={config} />
        )}
      </div>

      <div className="shrink-0 border-t border-white/10 bg-black/60 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 text-[10px] text-white/50">
            <p className="truncate">
              装备合计{" "}
              <span className="font-mono text-sm font-semibold text-white">{formatCredits(cost)}</span>{" "}
              cr
            </p>
            <p className={cn("mt-0.5 truncate", hint ? "text-amber-300/80" : "text-white/35")}>
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
        <p className="text-[10px] font-medium text-white/50">行动简报</p>
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

function RecordsPanel({ summary }: { summary: MyRaidenSummary }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="单局最高分" value={summary.bestScore.toLocaleString("en-US")} />
        <Stat label="累计首通" value={`${summary.firstClears} / ${RAIDEN_STAGES.length} 关`} />
        <Stat label="累计通关奖励" value={`${formatCredits(summary.totalReward)} cr`} />
        <Stat label="累计出击" value={`${summary.totalRuns} 次`} />
      </div>

      <div className="space-y-1.5">
        {summary.stages.map((stage) => {
          const meta = RAIDEN_STAGES.find((s) => s.no === stage.stage);
          return (
            <div
              key={stage.stage}
              className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium text-white/85">
                  STAGE {stage.stage} · {meta?.name ?? stage.name}
                </p>
                <p className="truncate text-[10px] text-white/40">
                  {stage.firstClearedAt
                    ? `首通 ${formatCnDateTime(stage.firstClearedAt, {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`
                    : "尚未通关"}
                  {stage.bestScore > 0 ? ` · 最高 ${stage.bestScore.toLocaleString("en-US")} 分` : ""}
                </p>
              </div>
              <Badge tone={stage.firstClearedAt ? "success" : "muted"}>
                {stage.clears > 0 ? `通关 ${stage.clears} 次` : "未通关"}
              </Badge>
            </div>
          );
        })}
      </div>

      {summary.recentRuns.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[10px] font-medium text-white/45">最近出击</p>
          {summary.recentRuns.map((run) => (
            <div
              key={run.id}
              className="flex items-center justify-between gap-2 text-[10px] text-white/45"
            >
              <span>
                {formatCnDateTime(run.startedAt, {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span>
                STAGE {Math.max(1, run.stage)} · {run.score.toLocaleString("en-US")} 分
              </span>
              <Badge
                tone={
                  run.status === "cleared"
                    ? "success"
                    : run.status === "failed"
                      ? "danger"
                      : run.status === "active"
                        ? "info"
                        : "muted"
                }
              >
                {runStatusText(run.status)}
              </Badge>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-4 text-center text-[10px] text-white/35">
          还没有出击记录。第一次出击会写进这里。
        </p>
      )}
    </div>
  );
}

function runStatusText(status: string): string {
  if (status === "cleared") return "通关";
  if (status === "failed") return "阵亡";
  if (status === "active") return "进行中";
  if (status === "abandoned") return "放弃";
  return status;
}

function RankPanel({
  leaderboard,
  firstClears,
}: {
  leaderboard: LeaderboardRow[];
  firstClears: BigWinRow[];
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-[10px] font-medium text-white/45">最高分排行榜</p>
        {leaderboard.length === 0 ? (
          <p className="rounded-md border border-white/10 bg-white/[0.03] py-5 text-center text-[10px] text-white/35">
            还没有人完成出击，榜首席位等你来拿。
          </p>
        ) : (
          <div className="space-y-1">
            {leaderboard.map((row) => (
              <div
                key={row.userId}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[11px]",
                  row.isMe ? "bg-cyan-400/10 text-white" : "text-white/55",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "w-4 text-center font-mono",
                      row.rank <= 3 && "font-bold text-amber-400",
                    )}
                  >
                    {row.rank}
                  </span>
                  <span className="truncate">{row.label}</span>
                  {row.isMe ? <Badge tone="info">我</Badge> : null}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-mono">{row.score.toLocaleString("en-US")}</span>
                  <span className="text-[9px] text-white/35">
                    {row.clearedAll ? "全通" : `ST${row.stage}`}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-medium text-white/45">最新首通播报</p>
        {firstClears.length === 0 ? (
          <p className="rounded-md border border-white/10 bg-white/[0.03] py-4 text-center text-[10px] text-white/35">
            还没有首通记录。
          </p>
        ) : (
          <div className="space-y-1.5">
            {firstClears.map((row, index) => (
              <div
                key={`${row.label}-${row.createdAt}-${index}`}
                className="flex items-center justify-between gap-2 text-[11px]"
              >
                <span className="truncate text-white/70">
                  {row.label}
                  <span className="text-white/35"> 首通 STAGE {row.stageNo}</span>
                </span>
                <span className="shrink-0 font-mono text-amber-400/90">
                  +{formatCredits(row.reward)} cr
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RulesPanel({ config }: { config: RaidenConfig }) {
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-white/10">
        <table className="w-full text-left text-[10px]">
          <thead className="bg-white/[0.05] text-white/40">
            <tr>
              <th className="px-2.5 py-1.5 font-medium">关卡</th>
              <th className="px-2.5 py-1.5 font-medium">Boss</th>
              <th className="px-2.5 py-1.5 text-right font-medium">首通</th>
              <th className="px-2.5 py-1.5 text-right font-medium">重复</th>
            </tr>
          </thead>
          <tbody>
            {RAIDEN_STAGES.map((stage) => {
              const reward = stageRewardFor(config, stage.no);
              return (
                <tr key={stage.no} className="border-t border-white/5">
                  <td className="px-2.5 py-1.5">
                    <span className="font-mono text-[9px] text-white/35">ST{stage.no}</span>
                    <p className="text-white/80">{stage.name}</p>
                  </td>
                  <td className="px-2.5 py-1.5 text-white/45">{stage.boss}</td>
                  <td className="px-2.5 py-1.5 text-right font-mono text-amber-400/90">
                    {formatCredits(reward.firstClear)}
                  </td>
                  <td className="px-2.5 py-1.5 text-right font-mono text-white/40">
                    {formatCredits(reward.repeat)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="space-y-1 text-[10px] leading-relaxed text-white/50">
        <li>· 每天最多出击 {config.dailyRuns} 次，装备费在出击时从余额扣除。</li>
        <li>
          · 首通奖励仅发放一次；重复通关奖励每日封顶 {formatCredits(config.repeatDailyCap)} cr。
        </li>
        <li>· 奖励以临时余额发放，有效期 {config.rewardValidDays} 天，可正常抵扣消费。</li>
        <li>
          · 阵亡后可花 {formatCredits(config.revivePriceCredits)} cr 原地复活，单局最多{" "}
          {config.maxRevives} 次。
        </li>
        <li>· 掉落 W 提升火力，S 增加散射，M 增加追踪导弹，B 补充炸弹。</li>
        <li>· 开局携带的护盾为 8 秒；关卡顺序与用时由服务端校验。</li>
        <li>· 排行榜按每位玩家的单局最高分排序，未通关的分数没有奖励。</li>
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
      <p className="text-[9px] text-white/40">{label}</p>
      <p className="mt-0.5 truncate font-mono text-sm font-semibold text-white/90">{value}</p>
    </div>
  );
}
