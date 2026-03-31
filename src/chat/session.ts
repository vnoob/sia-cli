import { HistoryStorage, Message, ConversationSession } from '../storage/history';
import { PreferencesStorage } from '../storage/preferences';
import { KeyStorage } from '../storage/keys';
import { BaseProvider, ChatMessage } from '../providers/base';
import { OpenAIProvider } from '../providers/openai';
import { OllamaProvider } from '../providers/ollama';
import { parseContextTags, ContextTag } from '../context/parser';
import { readFileContext, readDirectoryContext, buildContextBlock, ContextContent } from '../context/files';
import { getSystemContext } from '../context/system';

export class ChatSession {
  private history: HistoryStorage;
  private prefs: PreferencesStorage;
  private keys: KeyStorage;
  private session: ConversationSession;
  private provider!: BaseProvider;

  constructor() {
    this.history = new HistoryStorage();
    this.prefs = new PreferencesStorage();
    this.keys = new KeyStorage();
    this.session = this.history.createSession();
  }

  async initialize(): Promise<void> {
    await this.setupProvider();
  }

  private async setupProvider(): Promise<void> {
    const providerName = this.prefs.get('provider');
    const model = this.prefs.get('model');
    const systemPrompt = this.prefs.get('systemPrompt');

    if (providerName === 'openai') {
      const apiKey = await this.keys.getKey('openai');
      this.provider = new OpenAIProvider({
        model,
        apiKey: apiKey || undefined,
        systemPrompt
      });
    } else {
      const ollamaUrl = this.prefs.get('ollamaBaseUrl');
      this.provider = new OllamaProvider({
        model,
        baseUrl: ollamaUrl,
        systemPrompt
      });
    }
  }

  async resolveContext(tags: ContextTag[]): Promise<ContextContent[]> {
    return tags.map(tag => {
      if (tag.type === 'file') return readFileContext(tag);
      if (tag.type === 'directory') return readDirectoryContext(tag);
      return getSystemContext(tag);
    });
  }

  async sendMessage(
    input: string,
    onChunk?: (delta: string) => void
  ): Promise<string> {
    const { cleanInput, tags } = parseContextTags(input);
    
    let fullInput = cleanInput;
    if (tags.length > 0) {
      const contextContents = await this.resolveContext(tags);
      const contextBlock = buildContextBlock(contextContents);
      fullInput = cleanInput + contextBlock;
    }

    // Add user message to session
    const userMessage: Message = {
      role: 'user',
      content: fullInput,
      timestamp: Date.now()
    };
    this.session.messages.push(userMessage);

    // Build conversation for provider (limit context window)
    const maxMessages = this.prefs.get('maxContextMessages');
    const recentMessages = this.session.messages.slice(-maxMessages);
    const chatMessages: ChatMessage[] = recentMessages.map(m => ({
      role: m.role,
      content: m.content
    }));

    let responseContent = '';
    const shouldStream = this.prefs.get('streamResponse') && onChunk;

    if (shouldStream) {
      await this.provider.chatStream(chatMessages, (chunk) => {
        if (!chunk.done && chunk.delta) {
          responseContent += chunk.delta;
          onChunk(chunk.delta);
        }
      });
    } else {
      const response = await this.provider.chat(chatMessages);
      responseContent = response.content;
    }

    // Save assistant response
    const assistantMessage: Message = {
      role: 'assistant',
      content: responseContent,
      timestamp: Date.now()
    };
    this.session.messages.push(assistantMessage);
    this.history.saveSession(this.session);

    return responseContent;
  }

  getProvider(): BaseProvider {
    return this.provider;
  }

  getPrefs(): PreferencesStorage {
    return this.prefs;
  }

  getKeys(): KeyStorage {
    return this.keys;
  }

  getSession(): ConversationSession {
    return this.session;
  }

  async switchProvider(providerName: 'openai' | 'ollama'): Promise<void> {
    this.prefs.set('provider', providerName);
    await this.setupProvider();
  }

  setModel(model: string): void {
    this.prefs.set('model', model);
  }
}
