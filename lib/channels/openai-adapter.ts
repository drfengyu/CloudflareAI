import type { ChannelAdapter } from "./adapter";

/**
 * OpenAI 渠道适配器
 * 支持：直通 OpenAI API、健康检查、模型列表获取
 */
export class OpenAIAdapter implements ChannelAdapter {
  id = "openai";
  name = "OpenAI";
  type = "openai";

  async route(path: string, request: Request, context: Record<string, unknown>): Promise<Response> {
    return this.forward(path, request, context);
  }

  async forward(
    path: string,
    request: Request,
    context: Record<string, unknown>,
  ): Promise<Response> {
    const config = (context.config || {}) as Record<string, string>;
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY || "";
    const baseUrl = config.baseUrl || "https://api.openai.com/v1";

    if (!apiKey) {
      return Response.json({ error: "OpenAI 渠道缺少 API Key" }, { status: 500 });
    }

    const targetUrl = `${baseUrl.replace(/\/$/, "")}${path}`;
    const body = await request.text();

    const headers: Record<string, string> = {
      "Content-Type": request.headers.get("Content-Type") || "application/json",
      Authorization: `Bearer ${apiKey}`,
    };
    if (config.organizationId) {
      headers["OpenAI-Organization"] = config.organizationId;
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
      const apiKey = config.apiKey || process.env.OPENAI_API_KEY || "";
      if (!apiKey) return { ok: false, message: "缺少 API Key" };

      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) return { ok: true, message: "连接正常" };
      if (res.status === 401) return { ok: false, message: "API Key 无效" };
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
      const apiKey = config.apiKey || process.env.OPENAI_API_KEY || "";
      const baseUrl = config.baseUrl || "https://api.openai.com/v1";

      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) return [];

      const data = (await res.json()) as { data: { id: string; object: string }[] };
      return (data.data || []).map((m) => ({ id: m.id, object: m.object || "model" }));
    } catch {
      return [];
    }
  }
}
