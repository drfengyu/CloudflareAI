import type { ChannelAdapter } from "./adapter";

/**
 * OpenAI 兼容渠道适配器（通用）
 * 支持所有 OpenAI 兼容的 API，如 Vercel AI Gateway、SiliconFlow 等
 * 必须配置 baseUrl
 */
export class OpenAICompatibleAdapter implements ChannelAdapter {
  id = "openai-compatible";
  name = "OpenAI Compatible";
  type = "openai-compatible";

  async route(path: string, request: Request, context: Record<string, unknown>): Promise<Response> {
    return this.forward(path, request, context);
  }

  async forward(
    path: string,
    request: Request,
    context: Record<string, unknown>,
  ): Promise<Response> {
    const config = (context.config || {}) as Record<string, string>;
    const apiKey = config.apiKey || "";
    const baseUrl = config.baseUrl || "";

    if (!baseUrl) {
      return Response.json({ error: "OpenAI 兼容渠道缺少 baseUrl 配置" }, { status: 500 });
    }

    const targetUrl = `${baseUrl.replace(/\/$/, "")}${path}`;
    const body = await request.text();

    const headers: Record<string, string> = {
      "Content-Type": request.headers.get("Content-Type") || "application/json",
    };

    // 如果有 API Key 则添加，有些免费网关不需要
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const upstreamResponse = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: body || undefined,
    });

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: {
        "Content-Type": upstreamResponse.headers.get("Content-Type") || "application/json",
        "Cache-Control": "no-cache",
      },
    });
  }

  /** Health check */
  async healthCheck(context: Record<string, unknown>): Promise<{ ok: boolean; message: string }> {
    try {
      const config = (context.config || {}) as Record<string, string>;
      const baseUrl = config.baseUrl || "";
      const apiKey = config.apiKey || "";

      if (!baseUrl) return { ok: false, message: "缺少 baseUrl 配置" };

      const headers: Record<string, string> = {};
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
        headers,
      });

      if (res.ok) return { ok: true, message: "连接正常" };
      if (res.status === 401) return { ok: false, message: "API Key 无效" };
      if (res.status === 404) return { ok: false, message: "端点不存在（请检查 baseUrl）" };
      return { ok: false, message: `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, message: `连接失败: ${(e as Error).message}` };
    }
  }

  /** List available models */
  async listModels(
    context: Record<string, unknown>,
  ): Promise<{ id: string; object: string }[]> {
    try {
      const config = (context.config || {}) as Record<string, string>;
      const baseUrl = config.baseUrl || "";
      const apiKey = config.apiKey || "";

      if (!baseUrl) return [];

      const headers: Record<string, string> = {};
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
        headers,
      });

      if (!res.ok) return [];

      const data = (await res.json()) as { data: { id: string; object?: string }[] };
      return (data.data || []).map((m) => ({ id: m.id, object: m.object || "model" }));
    } catch {
      return [];
    }
  }
}
