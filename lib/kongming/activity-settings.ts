import { getSetting } from "@/lib/settings";
import {
  KONGMING_ACTIVITY_CONFIG_KEY,
  sanitizeKongmingActivityConfig,
  type KongmingActivityConfig,
} from "./activity-config";

/** 读活动配置（`option.kongming_config`）；后台表不可用时退回默认配置，游戏本身仍可进入。 */
export async function getKongmingActivityConfig(): Promise<KongmingActivityConfig> {
  try {
    const raw = await getSetting<KongmingActivityConfig | null>(
      KONGMING_ACTIVITY_CONFIG_KEY,
      null,
    );
    return sanitizeKongmingActivityConfig(raw);
  } catch (error) {
    console.warn("[kongming] activity config unavailable, using defaults", error);
    return sanitizeKongmingActivityConfig(null);
  }
}
