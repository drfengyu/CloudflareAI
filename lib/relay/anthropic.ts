/**
 * Anthropic Messages API ⇆ OpenAI Chat Completions 转换层。
 *
 * 本项目把 Anthropic `/v1/messages` 请求转发到 Cloudflare 的 OpenAI 兼容端点，
 * 因此需要双向转换。参考 new-api `relay/channel/claude/relay-claude.go` 的字段映射。
 *
 * 关键点（修复 Claude Code 工具调用失败 / 400 / 流式解析错误）：
 *  - 请求：tool_use（assistant）→ OpenAI tool_calls；tool_result（user）→ 独立的
 *    `role:"tool"` 消息；image block → image_url；tools / tool_choice 正确转换。
 *  - 响应：OpenAI tool_calls → Anthropic tool_use content block；finish_reason →
 *    stop_reason。
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | any[] | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

/** content block 数组里取纯文本（用于余额估算等）。 */
export function flattenAnthropicContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) =>
        typeof b === "string"
          ? b
          : typeof (b as any)?.text === "string"
            ? (b as any).text
            : "",
      )
      .join("");
  }
  return "";
}

/** Anthropic image source → OpenAI image_url 字符串。 */
function imageSourceToUrl(source: any): string | null {
  if (!source || typeof source !== "object") return null;
  // base64：{ type:"base64", media_type, data }
  if (source.type === "base64" && source.data) {
    const mt = source.media_type || "image/png";
    return `data:${mt};base64,${source.data}`;
  }
  // url：{ type:"url", url }
  if (source.type === "url" && source.url) return source.url;
  if (typeof source.url === "string") return source.url;
  return null;
}

/**
 * 把单条 Anthropic 消息（可能含多个 content block）转换为一条或多条 OpenAI 消息。
 *
 * - tool_result block 在 OpenAI 里必须是独立的 `role:"tool"` 消息，因此一条 Anthropic
 *   user 消息可能拆成多条 OpenAI 消息（先 tool 消息，再 user 文本/图片消息）。
 * - assistant 的 tool_use block 合并到该 assistant 消息的 `tool_calls`。
 */
function convertMessage(role: string, content: unknown): OpenAIMessage[] {
  // 纯字符串内容
  if (typeof content === "string") {
    return [{ role: role as any, content }];
  }
  if (!Array.isArray(content)) {
    return [{ role: role as any, content: flattenAnthropicContent(content) }];
  }

  const out: OpenAIMessage[] = [];
  const textParts: any[] = []; // OpenAI content part 数组（文本 + 图片）
  const toolCalls: OpenAIMessage["tool_calls"] = [];
  let plainText = "";

  for (const block of content) {
    if (typeof block === "string") {
      plainText += block;
      textParts.push({ type: "text", text: block });
      continue;
    }
    const type = (block as any)?.type;
    if (type === "text") {
      const t = (block as any).text ?? "";
      plainText += t;
      textParts.push({ type: "text", text: t });
    } else if (type === "image") {
      const url = imageSourceToUrl((block as any).source);
      if (url) textParts.push({ type: "image_url", image_url: { url } });
    } else if (type === "tool_use") {
      // assistant 调用工具
      toolCalls.push({
        id: (block as any).id || "",
        type: "function",
        function: {
          name: (block as any).name || "",
          arguments: JSON.stringify((block as any).input ?? {}),
        },
      });
    } else if (type === "tool_result") {
      // 工具返回 → 独立 tool 消息。先把它 flush 出去。
      const resultContent = (block as any).content;
      let text: string;
      if (typeof resultContent === "string") {
        text = resultContent;
      } else if (Array.isArray(resultContent)) {
        // tool_result.content 可以是 content block 数组（含 text / image）
        text = resultContent
          .map((c: any) => (typeof c === "string" ? c : c?.text ?? ""))
          .join("");
      } else {
        text = resultContent != null ? JSON.stringify(resultContent) : "";
      }
      out.push({
        role: "tool",
        tool_call_id: (block as any).tool_use_id || "",
        content: text,
      });
    }
    // 其它 block（thinking 等）忽略
  }

  // 组装该消息本体（tool_result 已单独 push 到 out 前面/后面，保持顺序）
  if (role === "assistant") {
    // Cloudflare 要求 content 必须是字符串（不接受 null），即使只有 tool_calls。
    const msg: OpenAIMessage = {
      role: "assistant",
      content: plainText,
    };
    if (toolCalls.length > 0) msg.tool_calls = toolCalls;
    // 只有当有文本或工具调用时才加入（避免空 assistant 消息）
    if (plainText || (msg.tool_calls && msg.tool_calls.length > 0)) {
      out.push(msg);
    }
  } else {
    // user / system：有图片时用 part 数组，否则用纯文本
    const hasImage = textParts.some((p) => p.type === "image_url");
    if (textParts.length > 0) {
      out.push({
        role: role as any,
        content: hasImage ? textParts : plainText,
      });
    }
  }

  return out;
}

/**
 * Anthropic messages + system → OpenAI messages 数组。
 */
export function anthropicToOpenAIMessages(
  messages: Array<{ role: string; content: unknown }>,
  system?: unknown,
): OpenAIMessage[] {
  const out: OpenAIMessage[] = [];
  const systemText = system != null ? flattenAnthropicContent(system) : "";
  if (systemText) out.push({ role: "system", content: systemText });
  for (const m of messages) {
    out.push(...convertMessage(m.role, m.content));
  }
  return out;
}

/**
 * Anthropic tools → OpenAI tools。
 * Anthropic：{ name, description, input_schema }
 * OpenAI：   { type:"function", function:{ name, description, parameters } }
 * 跳过内置工具（web_search 等，Cloudflare 不支持）。
 */
export function anthropicToolsToOpenAI(tools: unknown): any[] | undefined {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  const out: any[] = [];
  for (const t of tools) {
    const tool = t as any;
    // 只转换自定义函数工具（有 name + input_schema）
    if (tool?.name && tool?.input_schema) {
      out.push({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description || "",
          parameters: tool.input_schema,
        },
      });
    }
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Anthropic tool_choice → OpenAI tool_choice。
 *   {type:"auto"} → "auto"
 *   {type:"any"}  → "required"
 *   {type:"tool", name} → {type:"function", function:{name}}
 *   {type:"none"} → "none"
 */
export function anthropicToolChoiceToOpenAI(choice: unknown): any | undefined {
  if (!choice || typeof choice !== "object") return undefined;
  const c = choice as any;
  switch (c.type) {
    case "auto":
      return "auto";
    case "any":
      return "required";
    case "none":
      return "none";
    case "tool":
      return c.name
        ? { type: "function", function: { name: c.name } }
        : undefined;
    default:
      return undefined;
  }
}

/** OpenAI finish_reason → Anthropic stop_reason。 */
export function finishReasonToStopReason(reason: string | null | undefined): string {
  switch (reason) {
    case "length":
      return "max_tokens";
    case "tool_calls":
    case "function_call":
      return "tool_use";
    case "content_filter":
      return "end_turn";
    case "stop":
    default:
      return "end_turn";
  }
}

/**
 * OpenAI 非流式响应 → Anthropic Messages 响应。
 * 把 message.content 转成 text block，tool_calls 转成 tool_use block。
 */
export function openAIResponseToAnthropic(
  data: any,
  fallbackModel: string,
): {
  id: string;
  type: "message";
  role: "assistant";
  content: any[];
  model: string;
  stop_reason: string;
  stop_sequence: null;
  usage: { input_tokens: number; output_tokens: number };
} {
  const choice = data?.choices?.[0] || {};
  const message = choice.message || {};
  const usage = data?.usage || {};
  const content: any[] = [];

  // 文本（兼容部分模型的 reasoning_content）
  const text = message.content || message.reasoning_content || "";
  if (typeof text === "string" && text) {
    content.push({ type: "text", text });
  }

  // 工具调用
  const toolCalls = message.tool_calls;
  if (Array.isArray(toolCalls)) {
    for (const tc of toolCalls) {
      let input: unknown = {};
      try {
        input = tc?.function?.arguments
          ? JSON.parse(tc.function.arguments)
          : {};
      } catch {
        // 参数不是合法 JSON → 原样包一层，避免丢失
        input = { _raw: tc?.function?.arguments ?? "" };
      }
      content.push({
        type: "tool_use",
        id: tc?.id || `toolu_${Math.random().toString(36).slice(2)}`,
        name: tc?.function?.name || "",
        input,
      });
    }
  }

  // 至少要有一个 block（Anthropic 客户端不接受空 content）
  if (content.length === 0) {
    content.push({ type: "text", text: "" });
  }

  return {
    id: data?.id || `msg_${Date.now().toString(36)}`,
    type: "message",
    role: "assistant",
    content,
    model: data?.model || fallbackModel,
    stop_reason: finishReasonToStopReason(choice.finish_reason),
    stop_sequence: null,
    usage: {
      input_tokens: usage.prompt_tokens || 0,
      output_tokens: usage.completion_tokens || 0,
    },
  };
}
