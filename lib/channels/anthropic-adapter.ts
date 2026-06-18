import type { ChannelAdapter } from "./adapter";

/**
 * Anthropic 渠道适配器
 * 支持：直通 Anthropic API、健康检查、模型列表获取
 */
export class AnthropicAdapter implements ChannelAdapter {
  id = "anthropic";
  name = "Anthropic";
  type = "anthropic";

  async route(path: string, request: Request, context: Record<string, unknown>): Promise<Response> {
    return this.forward(path, request, context);
  }

  async forward(
    path: string,
    request: Request,
    context: Record<string, unknown>,
  ): Promise<Response> {
    const config = (context.config || {}) as Record<string, string>;
    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || "";
    const baseUrl = config.baseUrl || "https://api.anthropic.com/v1";

    if (!apiKey) {
      return Response.json({ error: "Anthropic 渠道缺少 API Key" }, { status: 500 });
    }

    const targetUrl = `${baseUrl.replace(/\/$/, "")}${path.replace(/^\/v1/, "")}`;
    const body = await request.text();

    const upstreamResponse = await fetch(targetUrl, {
      method: request.method,
      headers: {
        "Content-Type": request.headers.get("Content-Type") || "application/json",
        "x-api-key": apiKey,
        "anthropic-version": config.apiVersion || "2023-06-01",
      },
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
      const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || "";
      if (!apiKey) return { ok: false, message: "缺少 API Key" };

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
      });
      if (res.ok || res.status === 400) return { ok: true, message: "连接正常" };
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
    // Anthropic doesn't have a public models endpoint, return common models
    const commonModels = [
      "claude-sonnet-4-20250514",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229",
      "claude-3-sonnet-20240229",
      "claude-3-haiku-20240307",
    ];
    return commonModels.map((id) => ({ id, object: "model" }));
  }
}
