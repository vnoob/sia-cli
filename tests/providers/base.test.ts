import { BaseProvider, ChatMessage, ChatResponse, StreamChunk } from '../../src/providers/base';

class TestProvider extends BaseProvider {
  async chat(messages: ChatMessage[]): Promise<ChatResponse> {
    return { content: 'test response', model: 'test-model' };
  }
  
  async chatStream(messages: ChatMessage[], onChunk: (chunk: StreamChunk) => void): Promise<void> {
    onChunk({ delta: 'test ', done: false });
    onChunk({ delta: 'response', done: false });
    onChunk({ delta: '', done: true });
  }
  
  async listModels(): Promise<string[]> {
    return ['test-model-1', 'test-model-2'];
  }
  
  async isAvailable(): Promise<boolean> {
    return true;
  }
}

describe('BaseProvider', () => {
  let provider: TestProvider;

  beforeEach(() => {
    provider = new TestProvider({
      model: 'test-model',
      systemPrompt: 'You are a test assistant.'
    });
  });

  it('should implement chat method', async () => {
    const response = await provider.chat([{ role: 'user', content: 'Hello' }]);
    expect(response.content).toBe('test response');
    expect(response.model).toBe('test-model');
  });

  it('should implement chatStream method', async () => {
    const chunks: string[] = [];
    await provider.chatStream(
      [{ role: 'user', content: 'Hello' }],
      (chunk) => { if (!chunk.done) chunks.push(chunk.delta); }
    );
    expect(chunks.join('')).toBe('test response');
  });

  it('should list models', async () => {
    const models = await provider.listModels();
    expect(models).toContain('test-model-1');
  });

  it('should check availability', async () => {
    const available = await provider.isAvailable();
    expect(available).toBe(true);
  });

  it('should convert messages to provider format', () => {
    const messages = [
      { role: 'user' as const, content: 'Hello', timestamp: Date.now() },
      { role: 'assistant' as const, content: 'Hi there!', timestamp: Date.now() }
    ];
    const chatMessages = provider.messagesToProvider(messages);
    expect(chatMessages).toHaveLength(2);
    expect(chatMessages[0]).toEqual({ role: 'user', content: 'Hello' });
    expect(chatMessages[1]).toEqual({ role: 'assistant', content: 'Hi there!' });
  });
});
