import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createAgentDbFileName } from "../context/files.js";
import { refreshAgentDisplaySummary } from "../context/meta.js";
import type { SiaDatabase } from "../db/types.js";
import { describeChatStack } from "../config/provider-label.js";
import type { SiaConfig } from "../config/types.js";
import { defaultConfig } from "../config/types.js";
import { appendMessage, createSession, listMessages, nextSortOrder, openDatabase } from "../db/client.js";
import { getLogger } from "../logging.js";
import { parseMentions, resolveMentions } from "../mentions/index.js";
import { builtinTools, discoverPlugins, ToolRegistry } from "../plugins/index.js";
import { globalPluginsDir, projectPluginsDir } from "../paths.js";
import { runPluginsMenu } from "./plugins-menu.js";
import { rowsToChatMessages } from "./history.js";
import { readUserBlock, createRl } from "./readline.js";
import { ingestPath, runAssistantTurn } from "./runTurn.js";
import { runSettingsMenu } from "./settings.js";

export interface ReplOptions {
  db: SiaDatabase;
  /** Absolute path to the open agent context SQLite file. */
  dbPath: string;
  /** Directory where new agent context files are created (e.g. /context new). */
  contextStoreDir: string;
  config: SiaConfig;
  configPath: string;
  providerName: string;
  sessionId: string;
  cwd: string;
  noPlugins: boolean;
}

function ensureSession(db: SiaDatabase, sessionId: string): void {
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

  let history = rowsToChatMessages(listMessages(opts.db, opts.sessionId));

  const rl = createRl();
  let currentAbort = new AbortController();
  const onSigint = () => {
    currentAbort.abort();
    process.stderr.write("\n[sia] Interrupted (new turn).\n");
  };
  process.on("SIGINT", onSigint);

  const logContextLine = () => {
    console.log(`sia-cli — ${opts.dbPath}`);
    console.log(`session ${opts.sessionId}`);
    console.log(describeChatStack(opts.config, opts.providerName));
    const toolCount = tools.list().length;
    const pluginTools = tools.list().filter((t) => t.source?.startsWith("plugin:")).length;
    console.log(`Tools: ${toolCount} total (${pluginTools} from plugins)`);
  };
  logContextLine();
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
  /help            Show this help
  /settings        Configure AI provider (OpenAI, Gemini, Claude, or custom)
  /plugins         List available plugins and their tools
  /tools-test      Test that tools are working (creates a test file)
  /logs [n]        Show log file path and last n lines (default: 20)
  /ingest <path>   Chunk+embed a file into local knowledge (needs config.embedding)
  /rag on|off      Toggle rag.enabled in memory for this process only (not persisted)
  /session         Print current session id
  /context new     New agent context (new DB file, new session, empty history)
  exit | /exit     Quit`);
          continue;
        }
        if (cmd === "exit" || cmd === "quit") {
          break;
        }
        if (cmd === "session") {
          console.log(opts.sessionId);
          continue;
        }
        if (cmd === "context") {
          const sub = arg.toLowerCase();
          if (sub !== "new") {
            console.error("Usage: /context new");
            continue;
          }
          opts.db.close();
          const name = createAgentDbFileName();
          const newPath = path.join(opts.contextStoreDir, name);
          opts.db = openDatabase(newPath);
          opts.dbPath = newPath;
          opts.contextStoreDir = path.dirname(newPath);
          opts.sessionId = crypto.randomUUID();
          ensureSession(opts.db, opts.sessionId);
          history = rowsToChatMessages(listMessages(opts.db, opts.sessionId));
          console.log(`Switched to new agent context: ${newPath}`);
          logContextLine();
          console.log("");
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
        if (cmd === "settings") {
          const result = await runSettingsMenu(rl, opts.configPath, opts.config, opts.providerName);
          if (result.changed) {
            opts.config = result.config;
            opts.providerName = result.providerName;
          }
          continue;
        }
        if (cmd === "plugins") {
          await runPluginsMenu({
            rl,
            globalPluginsDir: globalPluginsDir(),
            projectPluginsDir: projectPluginsDir(opts.cwd),
            tools,
            noPlugins: opts.noPlugins,
          });
          continue;
        }
        if (cmd === "tools-test") {
          console.log("\nTesting tools...\n");
          const allTools = tools.list();
          console.log(`Registered tools (${allTools.length}):`);
          for (const t of allTools) {
            console.log(`  - ${t.name} [${t.source ?? "unknown"}]`);
          }
          console.log("");

          const fsList = allTools.filter((t) => t.name.startsWith("sia_fs_"));
          if (fsList.length === 0) {
            console.log("WARNING: No filesystem tools found!");
            console.log("Install the fs plugin:");
            console.log(`  Copy-Item -Recurse examples\\plugin-fs "$env:LOCALAPPDATA\\sia-cli\\plugins\\fs"`);
            console.log("");
            continue;
          }

          const testFile = ".sia-tools-test.txt";
          const testContent = `Tools test - ${new Date().toISOString()}`;
          const ctx = { cwd: opts.cwd, sessionId: opts.sessionId, db: opts.db, signal: currentAbort.signal };

          console.log(`Testing sia_fs_write: Creating ${testFile}...`);
          const writeResult = await tools.invoke("sia_fs_write", { path: testFile, content: testContent }, ctx);
          const writeJson = JSON.parse(writeResult);
          if (writeJson.ok) {
            console.log(`  SUCCESS: Created ${testFile}`);
          } else {
            console.log(`  FAILED: ${writeJson.error}`);
            continue;
          }

          console.log(`Testing sia_fs_read: Reading ${testFile}...`);
          const readResult = await tools.invoke("sia_fs_read", { path: testFile }, ctx);
          const readJson = JSON.parse(readResult);
          if (readJson.content === testContent) {
            console.log(`  SUCCESS: Content matches`);
          } else if (readJson.error) {
            console.log(`  FAILED: ${readJson.error}`);
          } else {
            console.log(`  FAILED: Content mismatch`);
          }

          console.log(`Testing sia_fs_delete: Removing ${testFile}...`);
          const delResult = await tools.invoke("sia_fs_delete", { path: testFile }, ctx);
          const delJson = JSON.parse(delResult);
          if (delJson.ok) {
            console.log(`  SUCCESS: Deleted ${testFile}`);
          } else {
            console.log(`  FAILED: ${delJson.error}`);
          }

          console.log("\nAll filesystem tools are working correctly!");
          console.log("The AI should now be able to create files and directories.\n");
          continue;
        }
        if (cmd === "logs") {
          const logger = getLogger();
          const logPath = logger.getLogPath();
          console.log(`\nLog file: ${logPath}\n`);

          if (!fs.existsSync(logPath)) {
            console.log("(Log file does not exist yet)\n");
            continue;
          }

          const lineCount = parseInt(arg, 10) || 20;
          const content = fs.readFileSync(logPath, "utf8");
          const lines = content.trim().split("\n");
          const lastLines = lines.slice(-lineCount);

          console.log(`Last ${Math.min(lineCount, lines.length)} lines:\n`);
          for (const line of lastLines) {
            console.log(line);
          }
          console.log("");
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
        refreshAgentDisplaySummary(opts.db, opts.sessionId);
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
