import { env } from "@/lib/env";

/**
 * Workers AI inference helpers.
 *
 * Two endpoint families:
 *  - `/ai/run/{model}`      universal; JSON envelope for text, raw bytes for
 *                           image/audio outputs.
 *  - `/ai/v1/*`             OpenAI-compatible (chat/completions, embeddings).
 *
 * Streaming routes return the raw {@link Response} so callers can pipe the SSE
 * body straight through to the client.
 */

function aiBase(): string {
  return `${env.cloudflare.apiBase}/accounts/${env.cloudflare.accountId}/ai`;
}

function authHeaders(extra?: HeadersInit): HeadersInit {
  return {
    Authorization: `Bearer ${env.cloudflare.apiToken}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

/** Run a model that returns the standard JSON envelope (text tasks). */
export async function runModelJSON<T>(
  model: string,
  input: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(`${aiBase()}/run/${model}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
    signal,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || (body && body.success === false)) {
    const msg =
      body?.errors?.map((e: { message: string }) => e.message).join("; ") ||
      `Model run failed (${res.status})`;
    throw new Error(msg);
  }
  return body.result as T;
}

/**
 * Run a model that returns raw bytes (text-to-image, text-to-speech).
 * Returns the raw Response so the caller can stream/forward the body.
 */
export async function runModelBinary(
  model: string,
  input: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  const res = await fetch(`${aiBase()}/run/${model}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Model run failed (${res.status})`);
  }
  return res;
}

/**
 * Run a model that requires `multipart/form-data` input (FLUX.2 family).
 *
 * Unlike most Workers AI image models, FLUX.2 rejects the JSON envelope and
 * requires real multipart fields — even for a text-only prompt. The REST `/run`
 * endpoint parses the form and returns the standard JSON envelope with the
 * generated image as a base64 string (`result.image`). We let `fetch`/FormData
 * set the `Content-Type` boundary itself, so we must NOT send our JSON headers.
 *
 * Returns `{ image: base64, neuronsHeader }`.
 */
export async function runModelMultipart(
  model: string,
  fields: Record<string, string>,
  signal?: AbortSignal,
): Promise<{ image: string; neuronsHeader: string | null }> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    form.append(k, v);
  }

  const res = await fetch(`${aiBase()}/run/${model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.cloudflare.apiToken}` },
    body: form,
    signal,
  });

  const body = await res.json().catch(() => null);
  if (!res.ok || (body && body.success === false)) {
    const msg =
      body?.errors?.map((e: { message: string }) => e.message).join("; ") ||
      `Model run failed (${res.status})`;
    throw new Error(msg);
  }

  const image = body?.result?.image as string | undefined;
  if (!image) {
    throw new Error("FLUX.2 response missing image data");
  }
  return { image, neuronsHeader: res.headers.get("x-cf-ai-usage-neurons") };
}

/**
 * Proxy to an OpenAI-compatible endpoint (`/ai/v1/...`). Returns the raw
 * Response — works for both JSON and streaming (SSE) responses.
 */
export async function openaiCompatible(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(`${aiBase()}/v1/${path.replace(/^\//, "")}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
    signal,
  });
}
