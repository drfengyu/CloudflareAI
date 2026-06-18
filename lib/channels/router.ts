import { db } from "@/lib/db/d1-http";
import { channels } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * 渠道路由器：根据 channelId 查找渠道配置，分发到对应适配器。
 * 当前支持的渠道类型：cloudflare（内置）、openai（直通）、anthropic（直通）。
 *
 * 使用方式：在 /v1/* 路由中，验证 API Key 后调用 routeToChannel(channelId, request)。
 */

interface ChannelConfig {
  id: string;
  name: string;
  type: string | null;
  status: number;
  config: string | null;
}

/**
 * 解析渠道 config JSON 字段
 */
function parseChannelConfig(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * 根据 channelId 获取渠道配置。
 * 返回 null 表示渠道不存在或已禁用。
 */
export async function getChannelConfig(channelId: string): Promise<ChannelConfig | null> {
  const rows = await db
    .select()
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);

  const channel = rows[0];
  if (!channel || channel.status !== 1) return null;
  return channel;
}

/**
 * 渠道路由：将请求转发到对应上游。
 * - cloudflare：使用内置 Cloudflare Workers AI API
 * - openai：直通到 OpenAI API（需要 config.apiKey）
 * - anthropic：直通到 Anthropic API（需要 config.apiKey）
 *
 * 返回 Response 直接返回给客户端。
 */
export async function routeToChannel(
  channelId: string,
  path: string,
  request: Request,
): Promise<Response | null> {
  const channel = await getChannelConfig(channelId);
  if (!channel || !channel.type) return null;

  const config = parseChannelConfig(channel.config);

  switch (channel.type) {
    case "openai":
      return forwardToOpenAI(path, request, config);
    case "anthropic":
      return forwardToAnthropic(path, request, config);
    case "cloudflare":
      // Cloudflare 是内置渠道，不在此路由。
      // 调用方应直接使用现有的 Cloudflare 逻辑。
      return null;
    default:
      return null;
  }
}

/**
 * 转发请求到 OpenAI 兼容 API
 */
async function forwardToOpenAI(
  path: string,
  request: Request,
  config: Record<string, string>,
): Promise<Response> {
  const apiKey = config.apiKey;
  if (!apiKey) {
    return Response.json(
      { error: "Channel configuration missing: apiKey" },
      { status: 500 },
    );
  }

  const baseUrl = config.baseUrl || "https://api.openai.com/v1";
  const targetUrl = `${baseUrl}${path}`;
  const body = await request.text();

  const headers: Record<string, string> = {
    "Content-Type": request.headers.get("Content-Type") || "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  // 转发流式请求
  const upstreamResponse = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: body || undefined,
  });

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: {
      "Content-Type": upstreamResponse.headers.get("Content-Type") || "application/json",
      "Cache-Control": "no-cache",
    },
  });
}

/**
 * 转发请求到 Anthropic API
 * 注意：我们的网关接受 OpenAI 格式，但 Anthropic 使用自己的格式。
 * 这里做 OpenAI → Anthropic 的请求格式转换。
 */
async function forwardToAnthropic(
  path: string,
  request: Request,
  config: Record<string, string>,
): Promise<Response> {
  const apiKey = config.apiKey;
  if (!apiKey) {
    return Response.json(
      { error: "Channel configuration missing: apiKey" },
      { status: 500 },
    );
  }

  const baseUrl = config.baseUrl || "https://api.anthropic.com/v1";
  const body = await request.json() as Record<string, unknown>;

  // OpenAI chat/completions → Anthropic messages 格式转换
  if (path.includes("chat/completions")) {
    const anthropicBody = convertOpenAIToAnthropic(body);
    const targetUrl = `${baseUrl}/messages`;

    const upstreamResponse = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthropicBody),
    });

    const result = await upstreamResponse.json() as Record<string, unknown>;
    const openaiResponse = convertAnthropicToOpenAI(result);

    return Response.json(openaiResponse);
  }

  // 其他路径直接透传
  const targetUrl = `${baseUrl}${path.replace(/^\/v1\/chat\/completions/, "")}`;
  const upstreamResponse = await fetch(targetUrl, {
    method: request.method,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  return Response.json(await upstreamResponse.json());
}

/**
 * OpenAI → Anthropic 请求格式转换
 */
function convertOpenAIToAnthropic(body: Record<string, unknown>): Record<string, unknown> {
  const messages = (body.messages as Array<Record<string, unknown>>) || [];
  const systemMsgs = messages.filter((m) => m.role === "system");
  const nonSystemMsgs = messages.filter((m) => m.role !== "system");

  return {
    model: body.model,
    max_tokens: body.max_tokens || 4096,
    ...(systemMsgs.length > 0
      ? { system: systemMsgs.map((m) => m.content).join("\n") }
      : {}),
    messages: nonSystemMsgs.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
  };
}

/**
 * Anthropic → OpenAI 响应格式转换
 */
function convertAnthropicToOpenAI(anthropicRes: Record<string, unknown>): Record<string, unknown> {
  const content = (anthropicRes.content as Array<Record<string, unknown>>) || [];
  const textContent = content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("");

  const usage = (anthropicRes.usage as Record<string, number>) || {};
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;

  return {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: anthropicRes.model || "claude-3-sonnet",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: textContent,
        },
        finish_reason: anthropicRes.stop_reason === "end_turn" ? "stop" : "length",
      },
    ],
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    },
  };
}
