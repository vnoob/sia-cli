import fs from "node:fs";
import path from "node:path";
import { createRl, question } from "../repl/readline.js";
import { ensureDir } from "../paths.js";
import { openDatabase } from "../db/client.js";
import { createAgentDbFileName, listAgentContextPaths } from "./files.js";
import { readAgentContextListRow } from "./meta.js";

export type PickContextOptions = {
  /** Resolved absolute path to contexts directory. */
  contextsDir: string;
  /** Open this DB directly (skips list prompt). */
  contextDbPath: string | null;
  /** Create a new agent DB in contextsDir. */
  newContext: boolean;
  /** When false, no readline prompts. */
  isTTY: boolean;
};

function formatListLine(absPath: string, index: number): string {
  let created: string;
  let summary: string;
  try {
    const row = readAgentContextListRow(absPath);
    created = row.created_at;
    summary = row.lineSummary;
  } catch {
    const st = fs.statSync(absPath);
    created = st.mtime.toISOString();
    summary = "(could not read context)";
  }
  return `  [${index}] ${created}: ${summary}`;
}

function pickMostRecentDb(contextsDir: string): string | null {
  const paths = listAgentContextPaths(contextsDir);
  if (!paths.length) return null;
  let best = paths[0];
  let bestM = fs.statSync(best).mtimeMs;
  for (const p of paths.slice(1)) {
    const m = fs.statSync(p).mtimeMs;
    if (m > bestM) {
      bestM = m;
      best = p;
    }
  }
  return best;
}

/**
 * Resolve which agent context DB to open. Caller closes the returned db when done.
 */
export async function resolveAgentContextDb(opts: PickContextOptions): Promise<{
  dbPath: string;
  db: import("../db/types.js").SiaDatabase;
}> {
  const { contextsDir, contextDbPath, newContext, isTTY } = opts;
  ensureDir(contextsDir);

  if (contextDbPath) {
    const resolved = path.resolve(contextDbPath);
    return { dbPath: resolved, db: openDatabase(resolved) };
  }

  if (newContext) {
    const name = createAgentDbFileName();
    const dbPath = path.join(contextsDir, name);
    return { dbPath, db: openDatabase(dbPath) };
  }

  const existing = listAgentContextPaths(contextsDir);

  if (isTTY && existing.length > 0) {
    const rl = createRl();
    try {
      console.log("Existing agent contexts:");
      existing.forEach((p, i) => console.log(formatListLine(p, i + 1)));
      console.log(`  [n] Create new context`);
      const raw = (await question(rl, "Select context [1] or n for new: ")).trim().toLowerCase();
      if (raw === "n" || raw === "new") {
        const name = createAgentDbFileName();
        const dbPath = path.join(contextsDir, name);
        return { dbPath, db: openDatabase(dbPath) };
      }
      if (raw === "") {
        const dbPath = existing[0];
        return { dbPath, db: openDatabase(dbPath) };
      }
      const n = parseInt(raw, 10);
      if (!Number.isFinite(n) || n < 1 || n > existing.length) {
        console.error(`Invalid choice: "${raw}". Using most recent context.`);
        const dbPath = existing[0];
        return { dbPath, db: openDatabase(dbPath) };
      }
      const dbPath = existing[n - 1];
      return { dbPath, db: openDatabase(dbPath) };
    } finally {
      rl.close();
    }
  }

  if (!isTTY && existing.length > 0) {
    const dbPath = pickMostRecentDb(contextsDir)!;
    return { dbPath, db: openDatabase(dbPath) };
  }

  const name = createAgentDbFileName();
  const dbPath = path.join(contextsDir, name);
  return { dbPath, db: openDatabase(dbPath) };
}

/**
 * Prompt for contexts directory when TTY; otherwise use default or env/flag override.
 */
export async function resolveContextsDir(opts: {
  defaultDir: string;
  flagDir: string;
  envDir: string | undefined;
  isTTY: boolean;
}): Promise<string> {
  const fromFlag = opts.flagDir.trim();
  if (fromFlag) return path.resolve(fromFlag);
  const fromEnv = opts.envDir?.trim();
  if (fromEnv) return path.resolve(fromEnv);

  if (!opts.isTTY) return path.resolve(opts.defaultDir);

  const rl = createRl();
  try {
    const hint = opts.defaultDir;
    const raw = (await question(rl, `Contexts directory [${hint}]: `)).trim();
    return raw ? path.resolve(raw) : path.resolve(opts.defaultDir);
  } finally {
    rl.close();
  }
}
