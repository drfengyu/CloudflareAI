import type { ChannelAdapter } from "./adapter";
import { OpenAIAdapter } from "./openai-adapter";

/**
 * DeepSeek 渠道适配器
 * DeepSeek 使用 OpenAI 兼容 API，直接复用 OpenAI 适配器的转发逻辑。
 */
export class DeepSeekAdapter extends OpenAIAdapter {
  id = "deepseek";
  name = "DeepSeek";
  type = "deepseek";

  /** 健康检查 */
  async healthCheck(context: Record<string, unknown>): Promise<{ ok: boolean; message: string }> {
    try {
      const config = (context.config || {}) as Record<string, string>;
      const apiKey = config.apiKey || "";
      if (!apiKey) return { ok: false, message: "缺少 API Key" };

      const baseUrl = config.baseUrl || "https://api.deepseek.com/v1";
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) return { ok: true, message: "连接正常" };
      if (res.status === 401) return { ok: false, message: "API Key 无效" };
      return { ok: false, message: `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, message: `连接失败: ${(e as Error).message}` };
    }
  }

  /** 列出 DeepSeek 模型 */
  async listModels(
    context: Record<string, unknown>,
  ): Promise<{ id: string; object: string }[]> {
    try {
      const config = (context.config || {}) as Record<string, string>;
      const apiKey = config.apiKey || "";
      const baseUrl = config.baseUrl || "https://api.deepseek.com/v1";

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
