import { env } from "@/lib/env";
import { cfRequest } from "@/lib/cloudflare/http";

/**
 * Cloudflare KV access over the REST API. Used for caching (model catalog) and
 * rate-limit counters. Value GET/PUT/DELETE return raw bodies (not the standard
 * Cloudflare envelope), so responses are read here rather than unwrapped.
 */

function kvUrl(key: string): string {
  return `${env.cloudflare.apiBase}/accounts/${env.cloudflare.accountId}/storage/kv/namespaces/${env.cloudflare.kvNamespaceId}/values/${encodeURIComponent(key)}`;
}

const authHeader = () => ({ Authorization: `Bearer ${env.cloudflare.apiToken}` });

export async function kvGet(key: string): Promise<string | null> {
  const res = await cfRequest(kvUrl(key), { headers: authHeader(), label: "KV" }, false);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`KV get failed (${res.status})`);
  return res.text();
}

export async function kvGetJSON<T>(key: string): Promise<T | null> {
  const raw = await kvGet(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Store a value, optionally with a TTL in seconds (min 60 per Cloudflare). */
export async function kvPut(
  key: string,
  value: string,
  ttlSeconds?: number,
): Promise<void> {
  const url = ttlSeconds
    ? `${kvUrl(key)}?expiration_ttl=${Math.max(60, Math.floor(ttlSeconds))}`
    : kvUrl(key);
  const res = await cfRequest(
    url,
    { method: "PUT", headers: authHeader(), body: value, label: "KV" },
    true,
  );
  if (!res.ok) throw new Error(`KV put failed (${res.status})`);
}

export function kvPutJSON(key: string, value: unknown, ttlSeconds?: number) {
  return kvPut(key, JSON.stringify(value), ttlSeconds);
}

export async function kvDelete(key: string): Promise<void> {
  // DELETE 重复执行结果相同，可以放心重试
  const res = await cfRequest(
    kvUrl(key),
    { method: "DELETE", headers: authHeader(), label: "KV" },
    false,
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`KV delete failed (${res.status})`);
  }
}
