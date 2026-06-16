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
            // 累积 assistant content
            const delta = obj.choices?.[0]?.delta;
            if (delta && typeof delta.content === "string" && delta.content) {
              content += delta.content;
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
 * Anthropic-format SSE events differ:
 *   event: message_start
 *   data: {"type": "message_start", "message": {"usage": {...}}}
 *   ...
 *   event: message_delta
 *   data: {"type": "message_delta", "usage": {"output_tokens": N}}
 *   ...
 *   event: message_stop
 *
 * For our `/api/anthropic/v1/messages` route we currently forward the upstream
 * OpenAI-format SSE without rewrapping (the route's stream branch returns
 * `res.body` directly), so input/output tokens are still parsable via the
 * OpenAI intercept above. If we ever wrap the response into proper Anthropic
 * SSE format, port the intercept logic.
 */
