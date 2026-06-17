import { interceptOpenAIStream } from "@/lib/usage/stream-intercept";
import { type StreamInterceptResult } from "@/lib/usage/stream-intercept";

/**
 * 将 OpenAI 格式 SSE 流转换为 Anthropic Messages API SSE 格式。
 *
 * Anthropic SSE 事件序列：
 *   event: message_start   →  {"type":"message_start","message":{...}}
 *   event: content_block_start → {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}
 *   event: content_block_delta → {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"..."}}
 *   event: content_block_stop  → {"type":"content_block_stop","index":0}
 *   event: message_delta   → {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":N}}
 *   event: message_stop    → {"type":"message_stop"}
 *
 * 输入是 OpenAI chat.completion.chunk 事件流：
 *   data: {"choices":[{"delta":{"content":"..."},"role":"assistant"}],...}
 *
 * 两层流：外层拦截上游（计费用），内层吃 OpenAI、吐 Anthropic。
 */
export function convertToAnthropicStream(
  upstream: ReadableStream<Uint8Array> | null,
  opts: {
    model: string;
    messageId: string;
    inputTokens: number;
  },
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

  // 先拦截上游——计费 + 累积 content
  const { stream: tapped, done } = interceptOpenAIStream(upstream);

  const encoder = new TextEncoder();
  let outputTokenAccum = 0;
  let blockStarted = false;
  let blockStopped = false;

  function sse(event: string, data: unknown): Uint8Array {
    return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  // 发射 Anthropic 事件序列
  const messageStart = sse("message_start", {
    type: "message_start",
    message: {
      id: opts.messageId,
      type: "message",
      role: "assistant",
      content: [],
      model: opts.model,
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: opts.inputTokens, output_tokens: 0 },
    },
  });

  const contentBlockStart = sse("content_block_start", {
    type: "content_block_start",
    index: 0,
    content_block: { type: "text", text: "" },
  });

  const contentBlockStop = sse("content_block_stop", {
    type: "content_block_stop",
    index: 0,
  });

  const messageStop = sse("message_stop", { type: "message_stop" });

  const transformed = new ReadableStream<Uint8Array>({
    async start(controller) {
      // 先发 message_start + content_block_start
      controller.enqueue(messageStart);
      controller.enqueue(contentBlockStart);
      blockStarted = true;

      const reader = tapped.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: false });
      let buffer = "";

      try {
        while (true) {
          const { value, done: streamDone } = await reader.read();
          if (streamDone) break;

          buffer += decoder.decode(value, { stream: true });

          // 拆分 SSE 事件（\n\n 分隔）
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const ev of events) {
            for (const line of ev.split(/\r?\n/)) {
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (!payload || payload === "[DONE]") continue;

              try {
                const obj = JSON.parse(payload);
                const delta = obj.choices?.[0]?.delta;
                if (!delta) continue;

                // 处理 content delta
                const text = delta.content || delta.reasoning_content;
                if (typeof text === "string" && text) {
                  controller.enqueue(
                    sse("content_block_delta", {
                      type: "content_block_delta",
                      index: 0,
                      delta: { type: "text_delta", text },
                    }),
                  );
                }

                // 处理 finish_reason → 发射 message_delta + content_block_stop
                if (obj.choices?.[0]?.finish_reason && !blockStopped) {
                  controller.enqueue(contentBlockStop);
                  blockStopped = true;

                  // 从 usage 取 output_tokens，或从上游 usage 累积
                  const outTokens = obj.usage?.completion_tokens ?? 0;
                  outputTokenAccum += outTokens;

                  controller.enqueue(
                    sse("message_delta", {
                      type: "message_delta",
                      delta: {
                        stop_reason: obj.choices[0].finish_reason === "length" ? "max_tokens" : "end_turn",
                        stop_sequence: null,
                      },
                      usage: { output_tokens: outputTokenAccum },
                    }),
                  );
                }

                // 累积 usage
                if (obj.usage?.completion_tokens) {
                  outputTokenAccum = obj.usage.completion_tokens;
                }
              } catch {
                // 非 JSON 忽略
              }
            }
          }
        }

        // 清理剩余 buffer
        buffer += decoder.decode();
        if (buffer.trim()) {
          // 尝试处理尾巴
          for (const line of buffer.split(/\r?\n/)) {
            if (line.trim() === "data: [DONE]") continue;
            if (!line.startsWith("data:")) continue;
          }
        }

        // 如果没收到 finish_reason（上游异常结尾），补发关闭事件
        if (blockStarted && !blockStopped) {
          controller.enqueue(contentBlockStop);
          controller.enqueue(
            sse("message_delta", {
              type: "message_delta",
              delta: { stop_reason: "end_turn", stop_sequence: null },
              usage: { output_tokens: outputTokenAccum },
            }),
          );
        }

        controller.enqueue(messageStop);
      } catch (err) {
        controller.error(err);
      } finally {
        try { controller.close(); } catch {}
        try { reader.releaseLock(); } catch {}
      }
    },
  });

  return { stream: transformed, done };
}
