/**
 * Intercept an OpenAI-compatible SSE stream: forward every byte to the client
 * unchanged, while parsing each `data: ...` event to extract the terminal
 * `usage` block (Cloudflare emits it even without `stream_options.include_usage`)
 * and accumulate the full assistant response text from `choices[].delta.content`.
 *
 * Usage:
 *   const { stream, done } = interceptOpenAIStream(upstreamBody);
 *   // forward `stream` to the client
 *   done.then(({ usage, content }) => { ... persist usage + transcript ... });
 *
 * Behavior:
 * - Pipes bytes through unmodified (consumer sees the original event stream).
 * - Buffers across chunk boundaries; SSE events are delimited by `\n\n`.
 * - Tolerates the OpenAI `data: [DONE]` sentinel and non-JSON lines.
 * - Keeps the LAST seen `usage` value, since some providers (Cloudflare)
 *   emit multiple `usage` chunks back-to-back.
 * - Concatenates every `choices[0].delta.content` string into `content`.
 *   Empty/missing delta-content chunks are skipped.
 */
export interface StreamInterceptResult {
  usage: { promptTokens: number; completionTokens: number } | null;
  content: string;
}

export function interceptOpenAIStream(
  upstream: ReadableStream<Uint8Array> | null,
): {
  stream: ReadableStream<Uint8Array>;
  done: Promise<StreamInterceptResult>;
} {
  if (!upstream) {
    return {
      stream: new ReadableStream(),
      done: Promise.resolve({ usage: null, content: "" }),
    };
  }

  let resolveDone: (v: StreamInterceptResult) => void;
  const done = new Promise<StreamInterceptResult>((resolve) => {
    resolveDone = resolve;
  });

  let lastUsage: { promptTokens: number; completionTokens: number } | null =
    null;
  let content = "";
  let buffer = "";
  const decoder = new TextDecoder("utf-8", { fatal: false });

  function processBuffer(flush = false) {
    // SSE events 以 \n\n 分隔；也兼容 \r\n\r\n。
    const events = buffer.split(/\n\n|\r\n\r\n/);
    buffer = flush ? "" : (events.pop() ?? "");

    for (const ev of events) {
      for (const line of ev.split(/\r?\n/)) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const obj = JSON.parse(payload);
          if (obj && typeof obj === "object") {
            // 累积 assistant content：兼容 OpenAI content 和部分模型的 reasoning_content
            const delta = obj.choices?.[0]?.delta;
            if (delta) {
              // 优先取 content，次之 reasoning_content（智谱 glm 系列）
              const deltaContent = delta.content || delta.reasoning_content;
              if (typeof deltaContent === "string" && deltaContent) {
                content += deltaContent;
              }
            }
            // 抓最后一个非空 usage
            if (obj.usage) {
              const u = obj.usage;
              const promptTokens =
                typeof u.prompt_tokens === "number" ? u.prompt_tokens : 0;
              const completionTokens =
                typeof u.completion_tokens === "number"
                  ? u.completion_tokens
                  : 0;
              if (promptTokens > 0 || completionTokens > 0) {
                lastUsage = { promptTokens, completionTokens };
              }
            }
          }
        } catch {
          // 非 JSON 行（罕见），忽略
        }
      }
    }
  }

  const transformed = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.getReader();
      try {
        while (true) {
          const { value, done: streamDone } = await reader.read();
          if (streamDone) break;
          if (value) {
            controller.enqueue(value);
            buffer += decoder.decode(value, { stream: true });
            processBuffer();
          }
        }
        buffer += decoder.decode();
        processBuffer(true);
      } catch (err) {
        controller.error(err);
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
        resolveDone({ usage: lastUsage, content });
        try {
          reader.releaseLock();
        } catch {
          // ignore
        }
      }
    },
    cancel(reason) {
      // 客户端取消 → 上游也取消（避免连接挂着）
      upstream.cancel(reason).catch(() => undefined);
      resolveDone({ usage: lastUsage, content });
    },
  });

  return { stream: transformed, done };
}

/**
 * 从完整的 OpenAI 非流式 chat.completion 响应合成 chat.completion.chunk SSE 流。
 *
 * 用于「流式 + 工具」场景：Cloudflare 流式端点把工具调用序列化进 delta.content
 * 文本、不发结构化 tool_calls deltas。有工具时改用非流式上游拿到结构化结果，
 * 再用本函数回放成标准 OpenAI SSE（含 tool_calls deltas + finish_reason + usage），
 * 让 OpenAI SDK 客户端正确识别工具调用。
 */
export function openAIResponseToSSE(data: any): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const choice = data?.choices?.[0] || {};
  const message = choice.message || {};
  const base = {
    id: data?.id || `chatcmpl-${Date.now().toString(36)}`,
    object: "chat.completion.chunk",
    created: data?.created || Math.floor(Date.now() / 1000),
    model: data?.model || "",
  };
  const emit = (obj: unknown): Uint8Array =>
    encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

  return new ReadableStream<Uint8Array>({
    start(controller) {
      // 1) role
      controller.enqueue(
        emit({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }] }),
      );
      // 2) 文本内容
      const content = message.content;
      if (typeof content === "string" && content) {
        controller.enqueue(
          emit({ ...base, choices: [{ index: 0, delta: { content }, finish_reason: null }] }),
        );
      }
      // 3) 工具调用
      if (Array.isArray(message.tool_calls)) {
        message.tool_calls.forEach((tc: any, index: number) => {
          controller.enqueue(
            emit({
              ...base,
              choices: [
                {
                  index: 0,
                  delta: {
                    tool_calls: [
                      {
                        index,
                        id: tc.id,
                        type: "function",
                        function: { name: tc.function?.name || "", arguments: tc.function?.arguments ?? "" },
                      },
                    ],
                  },
                  finish_reason: null,
                },
              ],
            }),
          );
        });
      }
      // 4) finish_reason
      controller.enqueue(
        emit({ ...base, choices: [{ index: 0, delta: {}, finish_reason: choice.finish_reason || "stop" }] }),
      );
      // 5) usage（含 choices:[] 的尾块，兼容 OpenAI include_usage 约定）
      if (data?.usage) {
        controller.enqueue(emit({ ...base, choices: [], usage: data.usage }));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}
