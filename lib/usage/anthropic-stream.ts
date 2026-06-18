import { interceptOpenAIStream } from "@/lib/usage/stream-intercept";
import { type StreamInterceptResult } from "@/lib/usage/stream-intercept";
import { finishReasonToStopReason } from "@/lib/relay/anthropic";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * 将 OpenAI 格式 SSE 流转换为 Anthropic Messages API SSE 格式，**支持工具调用**。
 *
 * Anthropic SSE 事件序列：
 *   message_start
 *   content_block_start  (text 或 tool_use)
 *   content_block_delta  (text_delta 或 input_json_delta)
 *   content_block_stop
 *   message_delta        ({stop_reason, usage})
 *   message_stop
 *
 * OpenAI 流式工具调用以 delta.tool_calls[] 增量到达：
 *   首块带 {index, id, function:{name, arguments:""}}，后续块只带 {index, function:{arguments:"..."}}。
 * 对应 Anthropic：每个工具是独立 content block（tool_use），参数走 input_json_delta。
 *
 * 块索引管理：文本块与每个工具块各占一个递增的 Anthropic index。OpenAI 的 tool_call
 * index 映射到 Anthropic block index。切换块前必须先 content_block_stop 当前块。
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

  function sse(event: string, data: unknown): Uint8Array {
    return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

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

  const transformed = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(messageStart);

      // 块状态机
      let nextIndex = 0;
      // 当前打开的块：{ kind:"text"|"tool", index }
      let current: { kind: "text" | "tool"; index: number } | null = null;
      // OpenAI tool_call index → Anthropic block index
      const toolBlocks = new Map<number, number>();
      let outputTokens = 0;
      let stopReason = "end_turn";
      let sawFinish = false;

      const openTextBlock = () => {
        if (current?.kind === "text") return;
        closeCurrent();
        const index = nextIndex++;
        current = { kind: "text", index };
        controller.enqueue(
          sse("content_block_start", {
            type: "content_block_start",
            index,
            content_block: { type: "text", text: "" },
          }),
        );
      };

      const closeCurrent = () => {
        if (current) {
          controller.enqueue(
            sse("content_block_stop", { type: "content_block_stop", index: current.index }),
          );
          current = null;
        }
      };

      const reader = tapped.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: false });
      let buffer = "";

      const handleObj = (obj: any) => {
        const choice = obj.choices?.[0];
        if (!choice) {
          // 末尾纯 usage chunk（无 choices）
          if (obj.usage?.completion_tokens) outputTokens = obj.usage.completion_tokens;
          return;
        }
        const delta = choice.delta || {};

        // 1) 文本增量
        const text = delta.content ?? delta.reasoning_content;
        if (typeof text === "string" && text) {
          openTextBlock();
          controller.enqueue(
            sse("content_block_delta", {
              type: "content_block_delta",
              index: current!.index,
              delta: { type: "text_delta", text },
            }),
          );
        }

        // 2) 工具调用增量
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const ti = typeof tc.index === "number" ? tc.index : 0;
            if (!toolBlocks.has(ti)) {
              // 新工具块
              closeCurrent();
              const index = nextIndex++;
              toolBlocks.set(ti, index);
              current = { kind: "tool", index };
              controller.enqueue(
                sse("content_block_start", {
                  type: "content_block_start",
                  index,
                  content_block: {
                    type: "tool_use",
                    id: tc.id || `toolu_${opts.messageId}_${ti}`,
                    name: tc.function?.name || "",
                    input: {},
                  },
                }),
              );
            }
            const index = toolBlocks.get(ti)!;
            const args = tc.function?.arguments;
            if (typeof args === "string" && args) {
              controller.enqueue(
                sse("content_block_delta", {
                  type: "content_block_delta",
                  index,
                  delta: { type: "input_json_delta", partial_json: args },
                }),
              );
            }
          }
        }

        // 3) finish_reason
        if (choice.finish_reason) {
          stopReason = finishReasonToStopReason(choice.finish_reason);
          sawFinish = true;
        }

        // 累积 usage（部分上游在含 choices 的 chunk 上带 usage）
        if (obj.usage?.completion_tokens) outputTokens = obj.usage.completion_tokens;
      };

      try {
        while (true) {
          const { value, done: streamDone } = await reader.read();
          if (streamDone) break;
          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const ev of events) {
            for (const line of ev.split(/\r?\n/)) {
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (!payload || payload === "[DONE]") continue;
              try {
                handleObj(JSON.parse(payload));
              } catch {
                // 非 JSON 忽略
              }
            }
          }
        }

        // 收尾：关闭当前块 + message_delta + message_stop
        closeCurrent();
        controller.enqueue(
          sse("message_delta", {
            type: "message_delta",
            delta: { stop_reason: sawFinish ? stopReason : "end_turn", stop_sequence: null },
            usage: { output_tokens: outputTokens },
          }),
        );
        controller.enqueue(sse("message_stop", { type: "message_stop" }));
      } catch (err) {
        controller.error(err);
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
        try {
          reader.releaseLock();
        } catch {
          // ignore
        }
      }
    },
  });

  return { stream: transformed, done };
}

/**
 * 从一个完整的 Anthropic message 对象合成 SSE 事件流。
 *
 * 用于「流式 + 工具」场景：Cloudflare 的流式端点会把工具调用序列化进
 * delta.content（纯文本），不发结构化 tool_calls，因此无法边收边转。
 * 解决办法是有工具时改用非流式上游拿到结构化结果，再用本函数回放成
 * 标准 Anthropic SSE（含 tool_use content block + input_json_delta），
 * 让 Claude Code 等客户端正确识别工具调用。
 */
export function anthropicMessageToSSE(msg: {
  id: string;
  model: string;
  content: any[];
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const sse = (event: string, data: unknown): Uint8Array =>
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        sse("message_start", {
          type: "message_start",
          message: {
            id: msg.id,
            type: "message",
            role: "assistant",
            content: [],
            model: msg.model,
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: msg.usage.input_tokens, output_tokens: 0 },
          },
        }),
      );

      msg.content.forEach((block, index) => {
        if (block.type === "text") {
          controller.enqueue(
            sse("content_block_start", {
              type: "content_block_start",
              index,
              content_block: { type: "text", text: "" },
            }),
          );
          if (block.text) {
            controller.enqueue(
              sse("content_block_delta", {
                type: "content_block_delta",
                index,
                delta: { type: "text_delta", text: block.text },
              }),
            );
          }
        } else if (block.type === "tool_use") {
          controller.enqueue(
            sse("content_block_start", {
              type: "content_block_start",
              index,
              content_block: { type: "tool_use", id: block.id, name: block.name, input: {} },
            }),
          );
          controller.enqueue(
            sse("content_block_delta", {
              type: "content_block_delta",
              index,
              delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input ?? {}) },
            }),
          );
        }
        controller.enqueue(sse("content_block_stop", { type: "content_block_stop", index }));
      });

      controller.enqueue(
        sse("message_delta", {
          type: "message_delta",
          delta: { stop_reason: msg.stop_reason, stop_sequence: null },
          usage: { output_tokens: msg.usage.output_tokens },
        }),
      );
      controller.enqueue(sse("message_stop", { type: "message_stop" }));
      controller.close();
    },
  });
}
