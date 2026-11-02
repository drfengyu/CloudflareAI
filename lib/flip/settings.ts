import { getSetting } from "@/lib/settings";
import { FLIP_CONFIG_KEY, sanitizeFlipConfig, type FlipConfig } from "./config";

/** 读活动配置（`option.flip_config`）。写入入口是 `/admin/settings` 的 `updateFlipSettings`。 */
export async function getFlipConfig(): Promise<FlipConfig> {
  const raw = await getSetting<FlipConfig | null>(FLIP_CONFIG_KEY, null);
  return sanitizeFlipConfig(raw);
}
