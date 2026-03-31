import type { ChatMessage, ToolCall } from "../llm/types.js";
import type { MessageRow } from "../db/client.js";

export function rowsToChatMessages(rows: MessageRow[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const row of rows) {
    if (row.role === "system" || row.role === "user") {
      out.push({ role: row.role, content: row.content });
      continue;
    }
    if (row.role === "assistant") {
      let tool_calls: ToolCall[] | undefined;
      if (row.tool_calls) {
        try {
          tool_calls = JSON.parse(row.tool_calls) as ToolCall[];
        } catch {
          tool_calls = undefined;
        }
      }
      out.push({
        role: "assistant",
        content: row.content.length ? row.content : null,
        tool_calls,
      });
      continue;
    }
    if (row.role === "tool" && row.tool_call_id) {
      out.push({
        role: "tool",
        content: row.content,
        tool_call_id: row.tool_call_id,
        name: row.name ?? undefined,
      });
    }
  }
  return out;
}
