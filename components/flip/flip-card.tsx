"use client";

import { flipRewardTickets, formatFlipReward } from "@/lib/flip/config";
import { CouponCount } from "@/components/activity/coupon-badge";
import { Money } from "@/components/currency/money";
import { Loader2 } from "lucide-react";

export interface FlipCardProps {
  /** 牌桌上的第几张（0 起），只用于展示编号。 */
  position: number;
  /** 这张牌的中奖金额；翻开前服务端不会给，null = 还没揭晓。 */
  reward: number | null;
  /** 1 张活动券 = 多少 cr；面值正好整张时牌面显示券图标 × 张数。 */
  unitCredits: number;
  /** 用户翻的是不是这一张。 */
  picked: boolean;
  /** 正在等服务端翻牌结果的是不是这一张。 */
  loading?: boolean;
  disabled: boolean;
  onPick: () => void;
}

/**
 * 一张牌：背面是纯装饰，翻开才写字。
 *
 * 牌背刻意做得一模一样、不给任何「这张看起来更大」的暗示——赔率只由开局那次洗牌决定，
 * 界面不该给出误导挑选的线索。
 */
export function FlipCard({ position, reward, unitCredits, picked, loading = false, disabled, onPick }: FlipCardProps) {
  const revealed = reward !== null;
  const tickets = revealed ? flipRewardTickets(reward, unitCredits) : null;
  const label = revealed ? formatFlipReward(reward, tickets) : "";
  const winning = revealed && reward > 0;

  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled || revealed}
      aria-busy={loading}
      aria-label={loading ? `正在翻开第 ${position + 1} 张` : revealed ? `第 ${position + 1} 张：${label}` : `翻开第 ${position + 1} 张`}
      className="group relative aspect-[3/4] rounded-xl border border-border bg-card transition-shadow disabled:cursor-default"
    >
      <span
        className="absolute inset-0 rounded-xl transition-transform duration-500 [transform-style:preserve-3d]"
        style={{
          transform: revealed ? "rotateY(180deg)" : undefined,
          transitionDelay: revealed ? `${position * 45}ms` : "0ms",
        }}
      >
        <span className="absolute inset-0 flex items-center justify-center rounded-xl [backface-visibility:hidden] group-hover:bg-secondary/70">
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : (
            <span className="text-lg text-muted-foreground/50">✦</span>
          )}
        </span>
        <span
          className={[
            "absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-xl border [backface-visibility:hidden] [transform:rotateY(180deg)]",
            winning ? "border-success/50 bg-success/10" : "border-border bg-secondary/60",
            picked ? "ring-2 ring-primary/70" : "",
          ].join(" ")}
        >
          <span
            className={[
              "text-sm font-semibold tabular-nums",
              winning ? "text-success" : "text-muted-foreground",
            ].join(" ")}
          >
            {tickets !== null ? (
              <CouponCount kind="flip" count={tickets} />
            ) : revealed && reward > 0 ? (
              <Money value={reward} unit="tcr" signed />
            ) : (
              label
            )}
          </span>
          {picked ? <span className="text-[10px] text-muted-foreground">本局所选</span> : null}
        </span>
      </span>
      <span className="absolute right-1 top-1 text-[10px] tabular-nums text-muted-foreground/70">
        {position + 1}
      </span>
    </button>
  );
}
