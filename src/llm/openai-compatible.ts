import type { LLMProvider, StreamChatOptions, StreamChatResult, ToolCall } from "./types.js";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function toOpenAIMessages(messages: StreamChatOptions["messages"]): unknown[] {
  return messages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "tool",
        content: m.content,
        tool_call_id: m.tool_call_id,
        ...(m.name ? { name: m.name } : {}),
      };
    }
    if (m.role === "assistant" && m.tool_calls?.length) {
      return {
        role: "assistant",
        content: m.content ?? "",
        tool_calls: m.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      };
    }
    return { role: m.role, content: m.role === "assistant" ? (m.content ?? "") : m.content };
  });
}

function parseSseLines(buffer: string): { events: string[]; rest: string } {
  const idx = buffer.lastIndexOf("\n\n");
  if (idx === -1) return { events: [], rest: buffer };
  const chunk = buffer.slice(0, idx);
  const rest = buffer.slice(idx + 2);
  const events = chunk.split("\n\n").filter(Boolean);
  return { events, rest };
}

function accumulateToolCallDelta(
  acc: Map<number, { id?: string; name?: string; arguments: string }>,
  delta: { index?: number; id?: string; type?: string; function?: { name?: string; arguments?: string } },
): void {
  const index = delta.index ?? 0;
  let slot = acc.get(index);
  if (!slot) {
    slot = { arguments: "" };
    acc.set(index, slot);
  }
  if (delta.id) slot.id = delta.id;
  if (delta.function?.name) slot.name = delta.function.name;
  if (delta.function?.arguments) slot.arguments += delta.function.arguments;
}

function accToToolCalls(acc: Map<number, { id?: string; name?: string; arguments: string }>): ToolCall[] {
  const sorted = [...acc.entries()].sort((a, b) => a[0] - b[0]);
  return sorted
    .map(([, v]) => {
      if (!v.id || !v.name) return null;
      return {
        id: v.id,
        type: "function" as const,
        function: { name: v.name, arguments: v.arguments || "{}" },
      };
    })
    .filter((x): x is ToolCall => x !== null);
}

export class OpenAICompatibleProvider implements LLMProvider {
  async streamChat(opts: StreamChatOptions): Promise<StreamChatResult> {
    const url = `${trimTrailingSlash(opts.baseURL)}/chat/completions`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;

    const body = {
      model: opts.model,
      messages: toOpenAIMessages(opts.messages),
      stream: true,
      ...(opts.tools?.length ? { tools: opts.tools } : {}),
    };

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Chat request failed ${res.status}: ${text.slice(0, 500)}`);
    }

    if (!res.body) {
      throw new Error("No response body");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    const toolAcc = new Map<number, { id?: string; name?: string; arguments: string }>();
    let finishReason: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseSseLines(buffer);
      buffer = rest;

      for (const ev of events) {
        for (const line of ev.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") continue;
          let json: {
            choices?: {
              delta?: { content?: string; tool_calls?: unknown[] };
              finish_reason?: string | null;
            }[];
          };
          try {
            json = JSON.parse(data) as typeof json;
          } catch {
            continue;
          }
          const choice = json.choices?.[0];
          if (choice?.finish_reason) finishReason = choice.finish_reason;
          const delta = choice?.delta;
          if (delta?.content) {
            fullContent += delta.content;
            opts.onDelta(delta.content);
          }
          const tcds = delta?.tool_calls as
            | { index?: number; id?: string; type?: string; function?: { name?: string; arguments?: string } }[]
            | undefined;
          if (tcds) {
            for (const t of tcds) {
              accumulateToolCallDelta(toolAcc, t);
            }
          }
        }
      }
    }

    const tail = buffer.trim();
    if (tail) {
      for (const line of tail.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data:")) {
          const data = trimmed.slice(5).trim();
          if (data && data !== "[DONE]") {
            try {
              const json = JSON.parse(data) as {
                choices?: { delta?: { content?: string; tool_calls?: unknown[] } }[];
              };
              const delta = json.choices?.[0]?.delta;
              if (delta?.content) {
                fullContent += delta.content;
                opts.onDelta(delta.content);
              }
            } catch {
              /* ignore */
            }
          }
        }
      }
    }

    return {
      content: fullContent,
      toolCalls: accToToolCalls(toolAcc),
      finishReason,
    };
  }
}
