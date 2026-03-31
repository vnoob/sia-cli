#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";
import { resolveAgentContextDb, resolveContextsDir } from "./context/pick.js";
import { loadConfig } from "./config/load.js";
import {
  defaultConfigPath,
  defaultContextsDir,
  ensureDir,
  getSiaHome,
} from "./paths.js";
import { runRepl, writeDefaultConfigIfMissing } from "./repl/index.js";

function parseArgs(argv: string[]): {
  configPath: string;
  provider: string;
  session: string | null;
  noPlugins: boolean;
  cwd: string;
  contextsDir: string;
  contextDb: string;
  newContext: boolean;
} {
  let configPath = "";
  let provider = "";
  let session: string | null = null;
  let noPlugins = false;
  let cwd = process.cwd();
  let contextsDir = "";
  let contextDb = "";
  let newContext = false;

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--config" && argv[i + 1]) {
      configPath = path.resolve(argv[++i]);
    } else if (a === "--provider" && argv[i + 1]) {
      provider = argv[++i];
    } else if (a === "--session" && argv[i + 1]) {
      session = argv[++i];
    } else if (a === "--no-plugins") {
      noPlugins = true;
    } else if (a === "--cwd" && argv[i + 1]) {
      cwd = path.resolve(argv[++i]);
    } else if (a === "--contexts-dir" && argv[i + 1]) {
      contextsDir = argv[++i];
    } else if (a === "--context-db" && argv[i + 1]) {
      contextDb = argv[++i];
    } else if (a === "--new-context") {
      newContext = true;
    } else if (a === "-h" || a === "--help") {
      console.log(`sia-cli — local-first AI REPL

Usage: sia [options]

Options:
  --config <path>       Path to config.json (default: SIA_HOME/config.json)
  --provider <name>     Provider key from config.providers
  --session <uuid>      Resume session id within this agent context (default: new session)
  --contexts-dir <path> Directory for agent context DB files (non-TTY default; overrides SIA_CONTEXTS_DIR)
  --context-db <path>   Open this SQLite file directly (skips context list prompt)
  --new-context         Create a new agent context file in the contexts directory
  --no-plugins          Skip loading plugins from SIA_HOME/plugins and .sia/plugins
  --cwd <path>          Working directory for @ file mentions and plugins
  -h, --help            Show help

Environment:
  SIA_HOME              Config/plugins directory (default: %LOCALAPPDATA%/sia-cli on Windows)
  SIA_CONTEXTS_DIR      Default directory for per-agent context *.db files (see --contexts-dir)
`);
      process.exit(0);
    }
  }

  return { configPath, provider, session, noPlugins, cwd, contextsDir, contextDb, newContext };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const home = getSiaHome();
  ensureDir(home);

  const configPath = args.configPath || defaultConfigPath(home);
  writeDefaultConfigIfMissing(configPath);
  const config = loadConfig(configPath);

  const isTTY = Boolean(process.stdin.isTTY);
  const defaultCtxDir = defaultContextsDir(home);
  const contextsDir = await resolveContextsDir({
    defaultDir: defaultCtxDir,
    flagDir: args.contextsDir,
    envDir: process.env.SIA_CONTEXTS_DIR,
    isTTY: isTTY && !args.contextDb,
  });

  const contextDbPathResolved = args.contextDb ? path.resolve(args.contextDb) : null;
  const { dbPath, db } = await resolveAgentContextDb({
    contextsDir,
    contextDbPath: contextDbPathResolved,
    newContext: args.newContext,
    isTTY: isTTY && !args.contextDb && !args.newContext,
  });

  const sessionId = args.session ?? crypto.randomUUID();
  const providerName = args.provider || config.defaultProvider;
  const contextStoreDir = path.dirname(dbPath);

  process.chdir(args.cwd);

  await runRepl({
    db,
    dbPath,
    contextStoreDir,
    config,
    configPath,
    providerName,
    sessionId,
    cwd: args.cwd,
    noPlugins: args.noPlugins,
  });

  db.close();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
