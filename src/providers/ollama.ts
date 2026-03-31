import axios from 'axios';
import { BaseProvider, ChatMessage, ChatResponse, StreamChunk, ProviderConfig } from './base';

export class OllamaProvider extends BaseProvider {
  private baseUrl: string;

  constructor(config: ProviderConfig) {
    super(config);
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
  }

  async chat(messages: ChatMessage[]): Promise<ChatResponse> {
    const allMessages = this.config.systemPrompt
      ? [{ role: 'system' as const, content: this.config.systemPrompt }, ...messages]
      : messages;

    const response = await axios.post(
      `${this.baseUrl}/api/chat`,
      {
        model: this.config.model,
        messages: allMessages,
        stream: false
      }
    );

    return {
      content: response.data.message?.content || '',
      model: response.data.model || this.config.model
    };
  }

  async chatStream(messages: ChatMessage[], onChunk: (chunk: StreamChunk) => void): Promise<void> {
    const allMessages = this.config.systemPrompt
      ? [{ role: 'system' as const, content: this.config.systemPrompt }, ...messages]
      : messages;

    const response = await axios.post(
      `${this.baseUrl}/api/chat`,
      {
        model: this.config.model,
        messages: allMessages,
        stream: true
      },
      { responseType: 'stream' }
    );

    return new Promise((resolve, reject) => {
      let buffer = '';
      response.data.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            const delta = data.message?.content || '';
            if (delta) onChunk({ delta, done: false });
            if (data.done) onChunk({ delta: '', done: true });
          } catch {
            // Skip
          }
        }
      });
      response.data.on('end', () => resolve());
      response.data.on('error', reject);
    });
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`);
      return response.data.models?.map((m: any) => m.name) || [];
    } catch {
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await axios.get(`${this.baseUrl}/api/tags`, { timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }
}
