import { Message } from '../storage/history';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface StreamChunk {
  delta: string;
  done: boolean;
}

export interface ProviderConfig {
  model: string;
  apiKey?: string;
  baseUrl?: string;
  systemPrompt?: string;
}

export abstract class BaseProvider {
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  abstract chat(messages: ChatMessage[]): Promise<ChatResponse>;
  abstract chatStream(messages: ChatMessage[], onChunk: (chunk: StreamChunk) => void): Promise<void>;
  abstract listModels(): Promise<string[]>;
  abstract isAvailable(): Promise<boolean>;

  messagesToProvider(messages: Message[]): ChatMessage[] {
    return messages.map(m => ({ role: m.role, content: m.content }));
  }
}
