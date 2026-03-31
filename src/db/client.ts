import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS } from "./migrations.js";
import type { SiaDatabase } from "./types.js";

export type { SiaDatabase } from "./types.js";

export function openDatabase(dbPath: string): SiaDatabase {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

/** Open existing DB read-only (no migrations). For listing agent contexts. */
export function openDatabaseReadOnly(dbPath: string): SiaDatabase {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

function migrate(db: SiaDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY
    );
  `);
  const appliedRows = db.prepare("SELECT version FROM schema_migrations").all() as { version: number }[];
  const have = new Set(appliedRows.map((r) => r.version));

  for (const m of MIGRATIONS) {
    if (have.has(m.version)) continue;
    db.exec(m.sql);
    db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(m.version);
  }
}

export type MessageRow = {
  id: string;
  session_id: string;
  role: string;
  content: string;
  tool_calls: string | null;
  tool_call_id: string | null;
  name: string | null;
  sort_order: number;
  created_at: string;
};

export function createSession(db: SiaDatabase, id: string, title?: string): void {
  db.prepare("INSERT INTO sessions (id, title) VALUES (?, ?)").run(id, title ?? null);
}

export function appendMessage(
  db: SiaDatabase,
  row: Omit<MessageRow, "created_at"> & { created_at?: string },
): void {
  db.prepare(
    `INSERT INTO messages (id, session_id, role, content, tool_calls, tool_call_id, name, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.session_id,
    row.role,
    row.content,
    row.tool_calls ?? null,
    row.tool_call_id ?? null,
    row.name ?? null,
    row.sort_order,
  );
}

export function listMessages(db: SiaDatabase, sessionId: string): MessageRow[] {
  return db
    .prepare(
      `SELECT id, session_id, role, content, tool_calls, tool_call_id, name, sort_order, created_at
       FROM messages WHERE session_id = ? ORDER BY sort_order ASC`,
    )
    .all(sessionId) as MessageRow[];
}

export function nextSortOrder(db: SiaDatabase, sessionId: string): number {
  const row = db
    .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM messages WHERE session_id = ?")
    .get(sessionId) as { n: number };
  return row.n;
}

export function upsertMemorySlot(
  db: SiaDatabase,
  id: string,
  label: string,
  content: string,
  sessionId: string | null,
): void {
  db.prepare(
    `INSERT INTO memory_slots (id, session_id, label, content, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       content = excluded.content,
       label = excluded.label,
       session_id = excluded.session_id,
       updated_at = datetime('now')`,
  ).run(id, sessionId, label, content);
}

export function getMemorySlot(db: SiaDatabase, id: string): { content: string; label: string } | null {
  const row = db.prepare("SELECT content, label FROM memory_slots WHERE id = ?").get(id) as
    | { content: string; label: string }
    | undefined;
  return row ?? null;
}

export function listMemorySlotsBySession(
  db: SiaDatabase,
  sessionId: string,
): { id: string; label: string; content: string }[] {
  return db
    .prepare(
      `SELECT id, label, content FROM memory_slots WHERE session_id = ? OR session_id IS NULL ORDER BY label`,
    )
    .all(sessionId) as { id: string; label: string; content: string }[];
}
