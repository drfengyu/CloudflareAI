import { getSetting } from "@/lib/settings";
import { TRIAL_CONFIG_KEY, sanitizeTrialConfig, type TrialConfig } from "./config";

/** 读活动配置（`option.trial_config`）。写入入口是 `/admin/settings` 的 `updateTrialSettings`。 */
export async function getTrialConfig(): Promise<TrialConfig> {
  const raw = await getSetting<TrialConfig | null>(TRIAL_CONFIG_KEY, null);
  return sanitizeTrialConfig(raw);
}
