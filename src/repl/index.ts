import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type Database from "better-sqlite3";
import type { SiaConfig } from "../config/types.js";
import { defaultConfig } from "../config/types.js";
import { appendMessage, createSession, listMessages, nextSortOrder } from "../db/client.js";
import { parseMentions, resolveMentions } from "../mentions/index.js";
import { builtinTools, discoverPlugins, ToolRegistry } from "../plugins/index.js";
import { globalPluginsDir, projectPluginsDir } from "../paths.js";
import { rowsToChatMessages } from "./history.js";
import { readUserBlock, createRl } from "./readline.js";
import { ingestPath, runAssistantTurn } from "./runTurn.js";

export interface ReplOptions {
  db: Database.Database;
  config: SiaConfig;
  configPath: string;
  providerName: string;
  sessionId: string;
  cwd: string;
  noPlugins: boolean;
}

function ensureSession(db: Database.Database, sessionId: string): void {
  const row = db.prepare("SELECT id FROM sessions WHERE id = ?").get(sessionId) as { id: string } | undefined;
  if (!row) createSession(db, sessionId);
}

export async function runRepl(opts: ReplOptions): Promise<void> {
  ensureSession(opts.db, opts.sessionId);

  const tools = new ToolRegistry();
  for (const t of builtinTools()) tools.register(t);
  if (!opts.noPlugins) {
    const loaded = await discoverPlugins(globalPluginsDir(), projectPluginsDir(opts.cwd));
    tools.merge(loaded);
  }

  const rows = listMessages(opts.db, opts.sessionId);
  const history = rowsToChatMessages(rows);

  const rl = createRl();
  let currentAbort = new AbortController();
  const onSigint = () => {
    currentAbort.abort();
    process.stderr.write("\n[sia] Interrupted (new turn).\n");
  };
  process.on("SIGINT", onSigint);

  console.log(`sia-cli — session ${opts.sessionId}`);
  console.log("Type /help for commands. Ctrl+C aborts the current stream.\n");

  try {
    while (true) {
      const line = await readUserBlock(rl);
      currentAbort = new AbortController();
      const input = line.trim();
      if (!input) continue;

      if (input.startsWith("/")) {
        const [cmd, ...rest] = input.slice(1).split(/\s+/);
        const arg = rest.join(" ").trim();
        if (cmd === "help" || cmd === "h") {
          console.log(`Commands:
  /help          Show this help
  /ingest <path> Chunk+embed a file into local knowledge (needs config.embedding)
  /rag on|off    Toggle rag.enabled in memory for this process only (not persisted)
  /session       Print current session id
  exit | /exit   Quit`);
          continue;
        }
        if (cmd === "exit" || cmd === "quit") {
          break;
        }
        if (cmd === "session") {
          console.log(opts.sessionId);
          continue;
        }
        if (cmd === "ingest") {
          if (!arg) {
            console.error("Usage: /ingest <path>");
            continue;
          }
          try {
            const n = await ingestPath({ db: opts.db, config: opts.config, filePath: arg, signal: currentAbort.signal });
            console.log(`Ingested ${n} chunk(s) from ${arg}`);
          } catch (e) {
            console.error(e instanceof Error ? e.message : String(e));
          }
          continue;
        }
        if (cmd === "rag") {
          const v = arg.toLowerCase();
          if (v === "on") opts.config.rag.enabled = true;
          else if (v === "off") opts.config.rag.enabled = false;
          else {
            console.error("Usage: /rag on|off");
            continue;
          }
          console.log(`RAG ${opts.config.rag.enabled ? "enabled" : "disabled"} (this session only).`);
          continue;
        }
        console.error(`Unknown command: /${cmd}. Try /help.`);
        continue;
      }

      if (input === "exit" || input === "quit") break;

      const mentions = parseMentions(input);
      const { expanded, warnings } = resolveMentions({
        input,
        mentions,
        mentionConfig: opts.config.mentions,
        cwd: opts.cwd,
        db: opts.db,
        sessionId: opts.sessionId,
      });
      for (const w of warnings) process.stderr.write(`[sia] ${w}\n`);

      const sortOrder = nextSortOrder(opts.db, opts.sessionId);
      const userMsgId = crypto.randomUUID();
      appendMessage(opts.db, {
        id: userMsgId,
        session_id: opts.sessionId,
        role: "user",
        content: expanded,
        tool_calls: null,
        tool_call_id: null,
        name: null,
        sort_order: sortOrder,
      });
      history.push({ role: "user", content: expanded });

      try {
        await runAssistantTurn({
          db: opts.db,
          config: opts.config,
          configPath: opts.configPath,
          providerName: opts.providerName,
          sessionId: opts.sessionId,
          cwd: opts.cwd,
          tools,
          history,
          signal: currentAbort.signal,
        });
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          process.stderr.write("[sia] Request aborted.\n");
        } else {
          console.error(e instanceof Error ? e.message : String(e));
        }
      }
    }
  } finally {
    process.off("SIGINT", onSigint);
    rl.close();
  }
}

export function writeDefaultConfigIfMissing(configPath: string): void {
  if (fs.existsSync(configPath)) return;
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), "utf8");
}
