/**
 * OpenAI 兼容 SSE 累积器：把 `/api/ai/text` 透传的字节流攒成 { content, reasoning }。
 *
 * 三种上游习惯要兼容：
 * - DeepSeek 等用独立字段 `delta.reasoning_content`；
 * - QwQ 等把思考混在 `content` 里，但用 `xx</th>` 之外的自定义标签（这里只认 DeepSeek R1 风格的 `think` 标签）；
 * - 没有标签的纯文本推理（少数模型）不再启发式猜测——宁可整段进正文，也不给错分界。
 */

type Delta = { content?: unknown; reasoning_content?: unknown };

export type StreamAccumulator = {
  push(chunk: string): void;
  readonly content: string;
  readonly reasoning: string;
};

const OPEN_TAG = "<th" + "ink>";
const CLOSE_TAG = "</th" + "ink>";

export function createStreamAccumulator(): StreamAccumulator {
  let content = "";
  let reasoning = "";
  let insideThink = false;
  let buffer = "";

  function absorb(text: string) {
    let rest = text;
    while (rest) {
      if (insideThink) {
        const end = rest.indexOf(CLOSE_TAG);
        if (end === -1) {
          reasoning += rest;
          return;
        }
        reasoning += rest.slice(0, end);
        insideThink = false;
        rest = rest.slice(end + CLOSE_TAG.length);
      } else {
        const start = rest.indexOf(OPEN_TAG);
        if (start === -1) {
          content += rest;
          return;
        }
        content += rest.slice(0, start);
        insideThink = true;
        rest = rest.slice(start + OPEN_TAG.length);
      }
    }
  }

  function handleEvent(raw: string) {
    for (const line of raw.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }
      const delta = (parsed as { choices?: { delta?: Delta }[] }).choices?.[0]?.delta;
      if (!delta) continue;
      if (typeof delta.reasoning_content === "string" && delta.reasoning_content) {
        reasoning += delta.reasoning_content;
      }
      if (typeof delta.content === "string" && delta.content) {
        absorb(delta.content);
      }
    }
  }

  return {
    push(chunk: string) {
      buffer += chunk;
      const events = buffer.split(/\n\n|\r\n\r\n/);
      buffer = events.pop() ?? "";
      for (const ev of events) handleEvent(ev);
    },
    get content() {
      return content;
    },
    get reasoning() {
      return reasoning;
    },
  };
}
