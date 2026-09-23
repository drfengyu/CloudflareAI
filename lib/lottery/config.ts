import { getSetting } from "@/lib/settings";
import { LOTTERY_CONFIG_KEY, sanitizeLotteryConfig, type LotteryConfig } from "./prize-math";

/**
 * 读活动配置（`option` 表的 `lottery_config`）。
 *
 * 纯计算与类型在 `./prize-math`，这样后台表单能在浏览器里实时算返还率而不把
 * 读库依赖引进客户端包。写入入口是 `/admin/settings` 的 `updateLotterySettings`。
 */
export async function getLotteryConfig(): Promise<LotteryConfig> {
  const raw = await getSetting<LotteryConfig | null>(LOTTERY_CONFIG_KEY, null);
  return sanitizeLotteryConfig(raw);
}
