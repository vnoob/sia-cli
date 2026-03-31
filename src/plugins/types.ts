import type { SiaDatabase } from "../db/types.js";

export interface ToolContext {
  cwd: string;
  sessionId: string;
  db: SiaDatabase;
  signal?: AbortSignal;
}

export type ToolHandler = (args: unknown, ctx: ToolContext) => Promise<string>;

export interface RegisteredTool {
  name: string;
  description: string;
  /** JSON Schema object for parameters */
  parameters: Record<string, unknown>;
  handler: ToolHandler;
  source?: string;
}

export interface PluginApi {
  registerTool(tool: Omit<RegisteredTool, "source">): void;
}
