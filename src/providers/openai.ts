import axios from 'axios';
import { BaseProvider, ChatMessage, ChatResponse, StreamChunk, ProviderConfig } from './base';

export class OpenAIProvider extends BaseProvider {
  private baseUrl: string;

  constructor(config: ProviderConfig) {
    super(config);
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  async chat(messages: ChatMessage[]): Promise<ChatResponse> {
    const allMessages = this.config.systemPrompt
      ? [{ role: 'system' as const, content: this.config.systemPrompt }, ...messages]
      : messages;

    const response = await axios.post(
      `${this.baseUrl}/chat/completions`,
      {
        model: this.config.model,
        messages: allMessages,
        stream: false
      },
      { headers: this.getHeaders() }
    );

    const choice = response.data.choices[0];
    return {
      content: choice.message.content,
      model: response.data.model,
      usage: {
        promptTokens: response.data.usage?.prompt_tokens || 0,
        completionTokens: response.data.usage?.completion_tokens || 0,
        totalTokens: response.data.usage?.total_tokens || 0
      }
    };
  }

  async chatStream(messages: ChatMessage[], onChunk: (chunk: StreamChunk) => void): Promise<void> {
    const allMessages = this.config.systemPrompt
      ? [{ role: 'system' as const, content: this.config.systemPrompt }, ...messages]
      : messages;

    const response = await axios.post(
      `${this.baseUrl}/chat/completions`,
      {
        model: this.config.model,
        messages: allMessages,
        stream: true
      },
      {
        headers: this.getHeaders(),
        responseType: 'stream'
      }
    );

    return new Promise((resolve, reject) => {
      let buffer = '';
      response.data.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') {
            if (trimmed === 'data: [DONE]') {
              onChunk({ delta: '', done: true });
            }
            continue;
          }
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const delta = data.choices?.[0]?.delta?.content || '';
              if (delta) {
                onChunk({ delta, done: false });
              }
            } catch {
              // Skip malformed chunks
            }
          }
        }
      });
      response.data.on('end', () => resolve());
      response.data.on('error', reject);
    });
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/models`, {
        headers: this.getHeaders()
      });
      return response.data.data
        .filter((m: any) => m.id.includes('gpt'))
        .map((m: any) => m.id);
    } catch {
      return ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'];
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.config.apiKey) return false;
    try {
      await axios.get(`${this.baseUrl}/models`, {
        headers: this.getHeaders(),
        timeout: 5000
      });
      return true;
    } catch {
      return false;
    }
  }
}
