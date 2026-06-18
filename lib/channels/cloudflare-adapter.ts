import type { ChannelAdapter } from "./adapter";

/**
 * Cloudflare Workers AI 渠道适配器（占位）
 * 当前 Cloudflare 渠道使用内置逻辑（/v1/* 路由中直接调用 Workers AI API）
 * 未来可将内置逻辑迁移至此适配器。
 */
export class CloudflareAdapter implements ChannelAdapter {
  id = "default-cloudflare";
  name = "Cloudflare Workers AI";
  type = "cloudflare";

  async route(_path: string, _request: Request, _context: Record<string, unknown>): Promise<Response> {
    return new Response(JSON.stringify({ error: "Cloudflare 渠道使用内置逻辑，无需直通" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  async healthCheck(context: Record<string, unknown>): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: "Cloudflare 渠道使用内置逻辑" };
  }

  async listModels(
    _context: Record<string, unknown>,
  ): Promise<{ id: string; object: string }[]> {
    return [];
  }
}
