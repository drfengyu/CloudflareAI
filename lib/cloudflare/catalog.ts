import { cfFetch } from "@/lib/cloudflare/client";
import { categoryForTask, type CategoryId } from "@/lib/categories";
import { metaForId, logoForAuthor } from "@/lib/cloudflare/model-meta.zh";

/**
 * Workers AI model catalog: fetch from `/ai/models/search`, normalize the
 * loosely-typed Cloudflare payload into a stable shape, and classify each model
 * into one of our product categories.
 */

export interface ModelPrice {
  unit: string;
  price: number;
  currency: string;
}

export interface NormalizedModel {
  /** Model identifier used in inference calls, e.g. `@cf/meta/llama-4-scout`. */
  id: string;
  /** Human-friendly label derived from the id. */
  name: string;
  description: string;
  /** Raw Cloudflare task name, e.g. "Text Generation". */
  task: string;
  category: CategoryId;
  /** hosted = Cloudflare GPUs (neuron free tier applies); proxied = third-party billing. */
  source: "hosted" | "proxied";
  beta: boolean;
  contextWindow?: number;
  functionCalling: boolean;
  pricing: ModelPrice[];
  /** 厂商/作者（来自中文元数据覆盖层）。 */
  author?: string;
  /** 中文描述（来自中文元数据覆盖层，优先于英文 description 展示）。 */
  descriptionZh?: string;
  /** 中文能力标签（函数调用 / 推理 / 视觉 / 已弃用 等）。 */
  tags?: string[];
  /** 厂商 Logo（SVG）URL。 */
  logo?: string;
}

// ── Raw payload shapes (defensive: Cloudflare's fields are loosely typed) ──
interface RawProperty {
  property_id: string;
  value: unknown;
}
interface RawModel {
  id?: string;
  name?: string;
  description?: string;
  source?: string | number;
  task?: { id?: string; name?: string } | string;
  properties?: RawProperty[];
}

function taskName(task: RawModel["task"]): string {
  if (!task) return "";
  return typeof task === "string" ? task : (task.name ?? "");
}

function normSource(raw: RawModel["source"]): "hosted" | "proxied" {
  // Catalog encodes partner/third-party models as "proxied" (or source code 2).
  if (typeof raw === "string") {
    return raw.toLowerCase().includes("proxied") ? "proxied" : "hosted";
  }
  if (typeof raw === "number") return raw === 2 ? "proxied" : "hosted";
  return "hosted";
}

function friendlyName(id: string): string {
  const seg = id.split("/").pop() ?? id;
  return seg
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseProps(props: RawProperty[] = []) {
  const map = new Map(props.map((p) => [p.property_id, p.value]));
  const truthy = (v: unknown) =>
    v === true || v === "true" || v === 1 || v === "1";

  const contextRaw = map.get("context_window") ?? map.get("max_total_tokens");
  const contextWindow =
    contextRaw != null ? Number(contextRaw) || undefined : undefined;

  const priceRaw = map.get("price");
  const pricing: ModelPrice[] = Array.isArray(priceRaw)
    ? (priceRaw as Record<string, unknown>[]).map((p) => ({
        unit: String(p.unit ?? ""),
        price: Number(p.price ?? 0),
        currency: String(p.currency ?? "USD"),
      }))
    : [];

  return {
    contextWindow,
    functionCalling: truthy(map.get("function_calling")),
    beta: truthy(map.get("beta")),
    pricing,
  };
}

function normalize(raw: RawModel): NormalizedModel | null {
  const id = raw.name ?? raw.id;
  if (!id || typeof id !== "string") return null;
  const task = taskName(raw.task);
  const meta = metaForId(id);
  return {
    id,
    name: friendlyName(id),
    description: raw.description ?? "",
    task,
    category: categoryForTask(task),
    source: normSource(raw.source),
    author: meta?.author,
    descriptionZh: meta?.zh,
    tags: meta?.tags,
    logo: logoForAuthor(meta?.author),
    ...parseProps(raw.properties),
  };
}

/**
 * Fetch and normalize the full model catalog (paginated). Cached for one hour
 * via the Next.js data cache.
 */
export async function fetchModelCatalog(): Promise<NormalizedModel[]> {
  const perPage = 100;
  const all: NormalizedModel[] = [];
  let page = 1;

  for (;;) {
    const { result, info } = await cfFetch<RawModel[]>(
      `/ai/models/search?per_page=${perPage}&page=${page}`,
      { revalidate: 3600 },
    );
    const batch = (result ?? []).map(normalize).filter(Boolean) as NormalizedModel[];
    all.push(...batch);

    const total = info?.total_count ?? all.length;
    if (all.length >= total || batch.length === 0) break;
    page += 1;
    if (page > 20) break; // safety stop
  }

  return all.sort((a, b) => a.id.localeCompare(b.id));
}

export function groupByCategory(
  models: NormalizedModel[],
): Record<CategoryId, NormalizedModel[]> {
  const groups = {} as Record<CategoryId, NormalizedModel[]>;
  for (const m of models) {
    (groups[m.category] ??= []).push(m);
  }
  return groups;
}
