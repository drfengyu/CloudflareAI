"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { gameAudio, type GameTheme } from "@/lib/game/audio";

/**
 * 活动页的音乐 / 音效开关：默认关闭，开启前必须二次确认。
 *
 * 开关状态全站共用一份（localStorage），切到战斗时只换曲目，不重置玩家的选择。
 */
export function SoundToggle({
  game,
  battle = false,
  className,
}: {
  game: "trial" | "workshop";
  battle?: boolean;
  className?: string;
}) {
  const on = useSyncExternalStore(gameAudio.subscribe, gameAudio.getSnapshot, () => false);

  const theme: GameTheme = `${game}-${battle ? "battle" : "field"}`;

  useEffect(() => {
    if (!on) return;
    gameAudio.setTheme(theme);
    gameAudio.unlockOnGesture();
  }, [on, theme]);

  useEffect(() => {
    return () => {
      // 离开活动页就掐掉音乐，别让背景音乐跟到别的页面。
      gameAudio.setTheme(null);
    };
  }, []);

  function toggle() {
    if (on) {
      gameAudio.setEnabled(false);
      toast.message("背景音乐与音效已关闭");
      return;
    }
    const confirmed = window.confirm(
      "开启游戏背景音乐与战斗音效？\n\n音乐默认关闭，开启后会记住这次选择；随时可以再点这个按钮关掉。",
    );
    if (!confirmed) return;
    gameAudio.setEnabled(true);
    toast.success("背景音乐与音效已开启");
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={toggle}
      aria-pressed={on}
      className={cn("gap-1.5", className)}
    >
      {on ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
      {on ? "音乐 / 音效：开" : "开启音乐与音效"}
    </Button>
  );
}
