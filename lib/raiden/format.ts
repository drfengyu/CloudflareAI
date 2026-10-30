/** 游戏页与作战面板共用的展示格式。 */

export function formatStageTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function scoreText(score: number): string {
  return String(Math.max(0, Math.round(score))).padStart(7, "0");
}
