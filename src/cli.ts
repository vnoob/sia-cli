#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";
import { loadConfig } from "./config/load.js";
import { openDatabase } from "./db/client.js";
import {
  defaultConfigPath,
  defaultDbPath,
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
} {
  let configPath = "";
  let provider = "";
  let session: string | null = null;
  let noPlugins = false;
  let cwd = process.cwd();

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
    } else if (a === "-h" || a === "--help") {
      console.log(`sia-cli — local-first AI REPL

Usage: sia [options]

Options:
  --config <path>     Path to config.json (default: SIA_HOME/config.json)
  --provider <name>   Provider key from config.providers
  --session <uuid>    Resume session id (default: new session)
  --no-plugins        Skip loading plugins from SIA_HOME/plugins and .sia/plugins
  --cwd <path>        Working directory for @ file mentions and plugins
  -h, --help          Show help

Environment:
  SIA_HOME            Data directory (default: %LOCALAPPDATA%/sia-cli on Windows)
`);
      process.exit(0);
    }
  }

  return { configPath, provider, session, noPlugins, cwd };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const home = getSiaHome();
  ensureDir(home);

  const configPath = args.configPath || defaultConfigPath(home);
  writeDefaultConfigIfMissing(configPath);
  const config = loadConfig(configPath);

  const dbPath = defaultDbPath(home);
  const db = openDatabase(dbPath);

  const sessionId = args.session ?? crypto.randomUUID();
  const providerName = args.provider || config.defaultProvider;

  process.chdir(args.cwd);

  await runRepl({
    db,
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
