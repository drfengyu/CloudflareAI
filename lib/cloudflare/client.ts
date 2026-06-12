import { env } from "@/lib/env";

/**
 * Low-level Cloudflare REST client (client/v4 API).
 *
 * The app runs on Vercel and reaches Cloudflare — Workers AI, D1, KV and the
 * GraphQL analytics API — entirely over HTTPS. Every call is authenticated with
 * the platform API token.
 */

export class CloudflareError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors?: unknown,
  ) {
    super(message);
    this.name = "CloudflareError";
  }
}

interface CfEnvelope<T> {
  result: T;
  success: boolean;
  errors: { code: number; message: string }[];
  messages: unknown[];
  result_info?: {
    page: number;
    per_page: number;
    count: number;
    total_count: number;
  };
}

type CfFetchInit = RequestInit & {
  /** Next.js data-cache revalidation in seconds (omit for no caching). */
  revalidate?: number;
};

/** Absolute path under the account scope, e.g. `/ai/models/search`. */
export function accountPath(path: string): string {
  return `${env.cloudflare.apiBase}/accounts/${env.cloudflare.accountId}${path}`;
}

/**
 * Call a Cloudflare account-scoped endpoint and unwrap the standard envelope.
 * Throws {@link CloudflareError} on transport or API-level failure.
 */
export async function cfFetch<T>(
  path: string,
  init: CfFetchInit = {},
): Promise<{ result: T; info?: CfEnvelope<T>["result_info"] }> {
  const { revalidate, headers, ...rest } = init;
  const res = await fetch(accountPath(path), {
    ...rest,
    headers: {
      Authorization: `Bearer ${env.cloudflare.apiToken}`,
      "Content-Type": "application/json",
      ...headers,
    },
    ...(revalidate !== undefined ? { next: { revalidate } } : {}),
  });

  const text = await res.text();
  let body: CfEnvelope<T> | null = null;
  try {
    body = text ? (JSON.parse(text) as CfEnvelope<T>) : null;
  } catch {
    // Non-JSON body (e.g. gateway error page) — fall through to status check.
  }

  if (!res.ok || (body && body.success === false)) {
    const msg =
      body?.errors?.map((e) => e.message).join("; ") ||
      `Cloudflare request failed (${res.status})`;
    throw new CloudflareError(msg, res.status, body?.errors);
  }

  return { result: (body?.result as T) ?? (null as T), info: body?.result_info };
}
