import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { HistoryStorage } from '../../src/storage/history';

describe('HistoryStorage', () => {
  let tmpDir: string;
  let storage: HistoryStorage;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sia-test-'));
    storage = new HistoryStorage(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create a new session', () => {
    const session = storage.createSession();
    expect(session.id).toMatch(/^session_/);
    expect(session.messages).toHaveLength(0);
    expect(session.createdAt).toBeLessThanOrEqual(Date.now());
  });

  it('should save and load a session', () => {
    const session = storage.createSession();
    session.messages.push({ role: 'user', content: 'Hello', timestamp: Date.now() });
    storage.saveSession(session);

    const loaded = storage.loadSession(session.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.messages).toHaveLength(1);
    expect(loaded!.messages[0].content).toBe('Hello');
  });

  it('should list sessions sorted by updatedAt descending', () => {
    const s1 = storage.createSession();
    s1.messages.push({ role: 'user', content: 'First', timestamp: Date.now() });
    storage.saveSession(s1);

    // Small delay to ensure different timestamps
    const s2 = storage.createSession();
    s2.messages.push({ role: 'user', content: 'Second', timestamp: Date.now() + 1 });
    storage.saveSession(s2);

    const sessions = storage.listSessions();
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    expect(sessions[0].updatedAt).toBeGreaterThanOrEqual(sessions[1].updatedAt);
  });

  it('should delete a session', () => {
    const session = storage.createSession();
    expect(storage.loadSession(session.id)).not.toBeNull();

    const deleted = storage.deleteSession(session.id);
    expect(deleted).toBe(true);
    expect(storage.loadSession(session.id)).toBeNull();
  });

  it('should return false when deleting non-existent session', () => {
    const result = storage.deleteSession('non-existent');
    expect(result).toBe(false);
  });

  it('should clear all sessions', () => {
    storage.createSession();
    storage.createSession();
    storage.createSession();

    expect(storage.listSessions().length).toBe(3);
    storage.clearAll();
    expect(storage.listSessions().length).toBe(0);
  });
});
