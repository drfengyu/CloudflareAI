import { getSetting } from "@/lib/settings";
import { WORKSHOP_CONFIG_KEY, sanitizeWorkshopConfig, type WorkshopConfig } from "./config";

/** 读活动配置（`option.workshop_config`）。写入入口是 `/admin/settings` 的 `updateWorkshopSettings`。 */
export async function getWorkshopConfig(): Promise<WorkshopConfig> {
  const raw = await getSetting<WorkshopConfig | null>(WORKSHOP_CONFIG_KEY, null);
  return sanitizeWorkshopConfig(raw);
}
