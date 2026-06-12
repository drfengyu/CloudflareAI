/**
 * Centralized environment configuration.
 *
 * Cloudflare credentials are platform-level (one CF account behind the whole
 * app); per-user quota is enforced internally in D1. Accessing D1/KV from
 * Vercel is done over Cloudflare's REST API, so we need the account id, a
 * scoped API token, and the D1 database / KV namespace ids.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    // Throw lazily at call sites rather than at import time so the app can
    // still boot (e.g. for pages that don't touch Cloudflare).
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  cloudflare: {
    get accountId() {
      return required("CF_ACCOUNT_ID");
    },
    get apiToken() {
      return required("CF_API_TOKEN");
    },
    get d1DatabaseId() {
      return required("CF_D1_DATABASE_ID");
    },
    get kvNamespaceId() {
      return required("CF_KV_NAMESPACE_ID");
    },
    /** Base for all Cloudflare client v4 REST calls. */
    apiBase: "https://api.cloudflare.com/client/v4",
  },
  auth: {
    get secret() {
      return required("AUTH_SECRET");
    },
    githubId: optional("AUTH_GITHUB_ID"),
    githubSecret: optional("AUTH_GITHUB_SECRET"),
  },
  /** Public base URL of the deployed app (used in API docs / examples). */
  appUrl: optional("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
} as const;

/** Cloudflare Workers AI pricing: USD per 1000 neurons. */
export const USD_PER_1K_NEURONS = 0.011;
/** Daily free neuron allocation (resets 00:00 UTC). */
export const DAILY_FREE_NEURONS = 10_000;
