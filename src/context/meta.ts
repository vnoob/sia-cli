import { openDatabaseReadOnly } from "../db/client.js";
import type { SiaDatabase } from "../db/types.js";

const META_TABLE = "agent_context_meta";

function hasTable(db: SiaDatabase, name: string): boolean {
  const row = db
    .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(name) as { ok: number } | undefined;
  return !!row;
}

export type AgentContextMetaRow = {
  display_summary: string;
  created_at: string;
  updated_at: string;
};

export function getAgentContextMeta(db: SiaDatabase): AgentContextMetaRow | null {
  if (!hasTable(db, META_TABLE)) return null;
  const row = db
    .prepare(
      `SELECT display_summary, created_at, updated_at FROM ${META_TABLE} WHERE id = 1`,
    )
    .get() as AgentContextMetaRow | undefined;
  return row ?? null;
}

export function setAgentDisplaySummary(db: SiaDatabase, summary: string): void {
  db.prepare(
    `UPDATE ${META_TABLE} SET display_summary = ?, updated_at = datetime('now') WHERE id = 1`,
  ).run(summary);
}

/** First user message in DB (any session), for list fallback when summary is empty. */
export function getFirstUserSnippet(db: SiaDatabase): string | null {
  if (!hasTable(db, "messages")) return null;
  const row = db
    .prepare(
      `SELECT content FROM messages WHERE role = 'user' ORDER BY sort_order ASC LIMIT 1`,
    )
    .get() as { content: string } | undefined;
  return row?.content ?? null;
}

export function summarizeForDisplay(raw: string, maxLen = 120): string {
  const oneLine = raw.replace(/\s+/g, " ").trim();
  if (!oneLine) return "";
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen - 1)}…`;
}

/** Latest user message text for this session (for rolling summary). */
export function getLatestUserContent(db: SiaDatabase, sessionId: string): string | null {
  const row = db
    .prepare(
      `SELECT content FROM messages WHERE session_id = ? AND role = 'user'
       ORDER BY sort_order DESC LIMIT 1`,
    )
    .get(sessionId) as { content: string } | undefined;
  return row?.content ?? null;
}

export function refreshAgentDisplaySummary(db: SiaDatabase, sessionId: string): void {
  if (!getAgentContextMeta(db)) return;
  const latest = getLatestUserContent(db, sessionId);
  if (!latest) return;
  setAgentDisplaySummary(db, summarizeForDisplay(latest));
}

/** Read-only peek for startup listing (no migrations). */
export function readAgentContextListRow(dbPath: string): {
  created_at: string;
  lineSummary: string;
} {
  const db = openDatabaseReadOnly(dbPath);
  try {
    const meta = getAgentContextMeta(db);
    let lineSummary = meta?.display_summary?.trim() ?? "";
    if (!lineSummary) {
      const fallback = getFirstUserSnippet(db);
      lineSummary = fallback ? summarizeForDisplay(fallback) : "(no summary yet)";
    }
    const created_at = meta?.created_at?.trim() || "(unknown time)";
    return { created_at, lineSummary };
  } finally {
    db.close();
  }
}
