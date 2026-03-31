import type { OpenAIToolDefinition } from "../llm/types.js";
import type { RegisteredTool, ToolContext } from "./types.js";

export class ToolRegistry {
  private readonly map = new Map<string, RegisteredTool>();

  register(tool: RegisteredTool): void {
    this.map.set(tool.name, tool);
  }

  merge(other: ToolRegistry): void {
    for (const t of other.list()) {
      this.map.set(t.name, t);
    }
  }

  list(): RegisteredTool[] {
    return [...this.map.values()];
  }

  toOpenAITools(): OpenAIToolDefinition[] {
    return this.list().map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  async invoke(name: string, args: unknown, ctx: ToolContext, timeoutMs = 120_000): Promise<string> {
    const tool = this.map.get(name);
    if (!tool) return JSON.stringify({ error: `Unknown tool: ${name}` });

    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal =
      ctx.signal && typeof AbortSignal.any === "function"
        ? AbortSignal.any([ctx.signal, timeoutSignal])
        : ctx.signal ?? timeoutSignal;

    try {
      return await tool.handler(args, { ...ctx, signal });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return JSON.stringify({ error: msg });
    }
  }
}
