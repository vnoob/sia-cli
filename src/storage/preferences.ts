import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface Preferences {
  provider: 'openai' | 'ollama';
  model: string;
  ollamaBaseUrl: string;
  maxContextMessages: number;
  streamResponse: boolean;
  systemPrompt: string;
  theme: 'dark' | 'light';
}

const DEFAULT_PREFERENCES: Preferences = {
  provider: 'openai',
  model: 'gpt-4o',
  ollamaBaseUrl: 'http://localhost:11434',
  maxContextMessages: 20,
  streamResponse: true,
  systemPrompt: 'You are Sia, a helpful terminal-based AI assistant for developers. Be concise and technical.',
  theme: 'dark'
};

export class PreferencesStorage {
  private prefsPath: string;
  private prefs: Preferences;

  constructor(baseDir?: string) {
    const dir = path.join(baseDir || os.homedir(), '.sia-cli');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.prefsPath = path.join(dir, 'preferences.json');
    this.prefs = this.load();
  }

  private load(): Preferences {
    if (!fs.existsSync(this.prefsPath)) {
      return { ...DEFAULT_PREFERENCES };
    }
    try {
      const saved = JSON.parse(fs.readFileSync(this.prefsPath, 'utf-8'));
      return { ...DEFAULT_PREFERENCES, ...saved };
    } catch {
      return { ...DEFAULT_PREFERENCES };
    }
  }

  get<K extends keyof Preferences>(key: K): Preferences[K] {
    return this.prefs[key];
  }

  set<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
    this.prefs[key] = value;
    this.save();
  }

  getAll(): Preferences {
    return { ...this.prefs };
  }

  save(): void {
    fs.writeFileSync(this.prefsPath, JSON.stringify(this.prefs, null, 2), 'utf-8');
  }

  reset(): void {
    this.prefs = { ...DEFAULT_PREFERENCES };
    this.save();
  }
}
