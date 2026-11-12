import { getSetting } from "@/lib/settings";
import {
  COLLECTION_CONFIG_KEY,
  sanitizeCollectionConfig,
  type CollectionConfig,
} from "./config";

/** 读活动配置（`option.collection_config`）。 */
export async function getCollectionConfig(): Promise<CollectionConfig> {
  const raw = await getSetting<CollectionConfig | null>(COLLECTION_CONFIG_KEY, null);
  return sanitizeCollectionConfig(raw);
}
