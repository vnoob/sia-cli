import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface ConversationSession {
  id: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

export class HistoryStorage {
  private historyDir: string;

  constructor(baseDir?: string) {
    this.historyDir = path.join(baseDir || os.homedir(), '.sia-cli', 'history');
    this.ensureDir();
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.historyDir)) {
      fs.mkdirSync(this.historyDir, { recursive: true });
    }
  }

  private sessionPath(id: string): string {
    return path.join(this.historyDir, `${id}.json`);
  }

  createSession(): ConversationSession {
    const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const session: ConversationSession = {
      id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: []
    };
    this.saveSession(session);
    return session;
  }

  saveSession(session: ConversationSession): void {
    session.updatedAt = Date.now();
    fs.writeFileSync(this.sessionPath(session.id), JSON.stringify(session, null, 2), 'utf-8');
  }

  loadSession(id: string): ConversationSession | null {
    const filePath = this.sessionPath(id);
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      return null;
    }
  }

  listSessions(): ConversationSession[] {
    const files = fs.readdirSync(this.historyDir).filter(f => f.endsWith('.json'));
    return files
      .map(f => {
        try {
          return JSON.parse(fs.readFileSync(path.join(this.historyDir, f), 'utf-8')) as ConversationSession;
        } catch {
          return null;
        }
      })
      .filter((s): s is ConversationSession => s !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  deleteSession(id: string): boolean {
    const filePath = this.sessionPath(id);
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  }

  clearAll(): void {
    const files = fs.readdirSync(this.historyDir).filter(f => f.endsWith('.json'));
    files.forEach(f => fs.unlinkSync(path.join(this.historyDir, f)));
  }
}
