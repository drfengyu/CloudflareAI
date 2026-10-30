import { getSetting } from "@/lib/settings";
import { RAIDEN_CONFIG_KEY, sanitizeRaidenConfig, type RaidenConfig } from "./config";

/** 读活动配置（`option.raiden_config`）。写入入口是 `/admin/settings` 的 `updateRaidenSettings`。 */
export async function getRaidenConfig(): Promise<RaidenConfig> {
  const raw = await getSetting<RaidenConfig | null>(RAIDEN_CONFIG_KEY, null);
  return sanitizeRaidenConfig(raw);
}
