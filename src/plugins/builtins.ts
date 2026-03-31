import { upsertMemorySlot } from "../db/client.js";
import type { RegisteredTool } from "./types.js";

export function builtinTools(): RegisteredTool[] {
  return [
    {
      name: "sia_echo",
      description: "Echo back JSON args for debugging plugins and tool wiring.",
      parameters: {
        type: "object",
        properties: { message: { type: "string", description: "Text to echo" } },
        required: ["message"],
      },
      source: "builtin",
      async handler(args) {
        const a = args as { message?: string };
        return JSON.stringify({ echoed: a.message ?? "" });
      },
    },
    {
      name: "sia_memory_save",
      description:
        "Save or update a local memory slot for this session (referenced via #id in future messages).",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Stable id, e.g. my-note" },
          label: { type: "string", description: "Short human label" },
          content: { type: "string", description: "Content to store" },
        },
        required: ["id", "label", "content"],
      },
      source: "builtin",
      async handler(args, ctx) {
        const a = args as { id: string; label: string; content: string };
        upsertMemorySlot(ctx.db, a.id, a.label, a.content, ctx.sessionId);
        return JSON.stringify({ ok: true, id: a.id });
      },
    },
  ];
}
