/**
 * Intercept an OpenAI-compatible SSE stream: forward every byte to the client
 * unchanged, while parsing each `data: ...` event to extract the terminal
 * `usage` block (Cloudflare emits it even without `stream_options.include_usage`)
 * and accumulate the full assistant response text from `choices[].delta.content`.
 *
 * Usage:
 *   const { stream, done } = interceptOpenAIStream(upstreamBody);
 *   // forward `stream` to the client
 *   done.then(({ usage, content, usageFinal }) => { ... persist usage + transcript ... });
 *
 * Behavior:
 * - Pipes bytes through unmodified (consumer sees the original event stream).
 * - Buffers across chunk boundaries; SSE events are delimited by `\n\n`.
 * - Tolerates the OpenAI `data: [DONE]` sentinel and non-JSON lines.
 * - Keeps the peak of every `usage` counter seen, since Cloudflare repeats a
 *   cumulative block on each chunk and zeroes the counters it has not advanced
 *   — keeping only the last chunk would bill the call with no input tokens.
 * - Concatenates every `choices[0].delta.content` string into `content`.
 *   Empty/missing delta-content chunks are skipped.
 * - Reports `usageFinal` so callers can tell whether the **output** counter is
 *   trustworthy (see the field doc below). Note the two counters are not
 *   symmetric: `promptTokens` is counted by the provider up front, so it stays
 *   billable even on a truncated stream, while `completionTokens` is only
 *   trustworthy once the terminal block arrived.
 */
export interface StreamInterceptResult {
  usage: { promptTokens: number; completionTokens: number } | null;
  content: string;
  /**
   * `usage.completionTokens` 是否为可信的**终态**计数。
   *
   * 实测 Cloudflare 的 OpenAI 兼容流里，中间 chunk 的 usage 全是占位桩：
   * chunk 1 带真实 prompt_tokens + completion_tokens=0，随后每个 chunk 恒为
   * `{prompt:0, completion:1}`（生成 200 个 token 也只出到 1），finish_reason
   * 那个 chunk 是 `{0,0}`，真正的 `{52,200}` 落在 finish 之后的 `choices: []` 尾块。
   * 所以流一旦被截断（客户端断开 / 上游 reset / 长停顿后被取消），峰值里的
   * completion 就只是桩值，不能当真实用量写进账单：调用方应据此把 output 记 0。
   *
   * 但 prompt 不对称：provider 在首块就把 input 算清了，所以即使流截断，
   * `usage.promptTokens` 仍是它自己数出来的真实值，可以照计（不臆造）。
   *
   * 判定为 true 的两个信号（都要求**非零**终态计数，不接受全零前导块）：
   * 收到 `data: [DONE]`；或 usage 落在 `choices` 为空/缺失的终态尾块上且计数非零。
   * 「上游 body 被正常读完」不再算证据：实测有干净关闭却只收到占位桩的流。
   */
  usageFinal: boolean;
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
      done: Promise.resolve({ usage: null, content: "", usageFinal: true }),
    };
  }

  let resolveDone: (v: StreamInterceptResult) => void;
  const done = new Promise<StreamInterceptResult>((resolve) => {
    resolveDone = resolve;
  });

  let peakUsage: { promptTokens: number; completionTokens: number } | null =
    null;
  let content = "";
  let buffer = "";
  // 终态信号：见 StreamInterceptResult.usageFinal 注释
  let sawDoneSentinel = false;
  let sawTerminalUsage = false;
  const decoder = new TextDecoder("utf-8", { fatal: false });

  /** 收口：done 只会被 resolve 一次（finally 与 cancel 互斥，后到者为空操作）。 */
  function settle(): StreamInterceptResult {
    return {
      usage: peakUsage,
      content,
      usageFinal: sawDoneSentinel || sawTerminalUsage,
    };
  }

  /** 逐字段保留历史峰值：某个计数变 0 不代表它真的没消耗。 */
  function peakCount(value: unknown, peak: number | undefined): number {
    const current = typeof value === "number" && value > 0 ? value : 0;
    return Math.max(current, peak ?? 0);
  }

  function processBuffer(flush = false) {
    // SSE events 以 \n\n 分隔；也兼容 \r\n\r\n。
    const events = buffer.split(/\n\n|\r\n\r\n/);
    buffer = flush ? "" : (events.pop() ?? "");

    for (const ev of events) {
      for (const line of ev.split(/\r?\n/)) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        if (payload === "[DONE]") {
          // SSE 正常收尾的哨兵：到这儿累计到的峰值就是完整用量
          sawDoneSentinel = true;
          continue;
        }
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
            // usage 逐字段取峰值，理由见文件头
            if (obj.usage) {
              const u = obj.usage;
              const prompt =
                typeof u.prompt_tokens === "number" && u.prompt_tokens > 0
                  ? u.prompt_tokens
                  : 0;
              const completion =
                typeof u.completion_tokens === "number" &&
                u.completion_tokens > 0
                  ? u.completion_tokens
                  : 0;
              // OpenAI/Cloudflare 约定：终态 usage 落在 choices 为空的尾块上。
              // 但只有**非零**的尾块才算数——全零的 `choices: []` 前导桩证明不了
              // 流已收口，拿它当终止证据会把截断流误判成完整流。
              const choices = obj.choices;
              const terminalBlock =
                !Array.isArray(choices) || choices.length === 0;
              if ((prompt > 0 || completion > 0) && terminalBlock) {
                sawTerminalUsage = true;
              }
              const promptTokens = peakCount(
                prompt,
                peakUsage?.promptTokens,
              );
              const completionTokens = peakCount(
                completion,
                peakUsage?.completionTokens,
              );
              if (promptTokens > 0 || completionTokens > 0) {
                peakUsage = { promptTokens, completionTokens };
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
        resolveDone(settle());
        try {
          reader.releaseLock();
        } catch {
          // ignore
        }
      }
    },
    cancel(reason) {
      // 客户端断开 → 这里只做收尾。注意 `upstream.cancel()` 在此处基本必然抛
      // TypeError（reader 仍被上面的读循环占用），所以真正掐断上游靠路由把
      // `req.signal` 透传给 `openaiCompatible()`——断开由客户端信号驱动，不靠这里。
      upstream.cancel(reason).catch(() => undefined);
      resolveDone(settle());
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
