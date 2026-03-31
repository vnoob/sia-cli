export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string; name?: string };

export interface OpenAIToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface StreamChatOptions {
  baseURL: string;
  apiKey?: string;
  model: string;
  messages: ChatMessage[];
  tools?: OpenAIToolDefinition[];
  signal?: AbortSignal;
  onDelta: (text: string) => void;
}

export interface StreamChatResult {
  content: string;
  toolCalls: ToolCall[];
  finishReason: string | null;
}

export interface LLMProvider {
  streamChat(opts: StreamChatOptions): Promise<StreamChatResult>;
}
