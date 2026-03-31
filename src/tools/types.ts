export interface Tool {
  name: string;
  description: string;
  execute: (args: string[], context?: Record<string, string>) => Promise<string>;
}

export interface ToolRegistry {
  register(tool: Tool): void;
  get(name: string): Tool | undefined;
  list(): Tool[];
  execute(name: string, args: string[], context?: Record<string, string>): Promise<string>;
}
