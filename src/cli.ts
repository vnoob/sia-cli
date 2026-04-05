#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";
import readline from "node:readline";
import { resolveAgentContextDb, resolveContextsDir } from "./context/pick.js";
import { loadConfig } from "./config/load.js";
import { describeChatStack } from "./config/provider-label.js";
import type { SiaConfig } from "./config/types.js";
import { initLogger, getLogger } from "./logging.js";
import {
  defaultConfigPath,
  defaultContextsDir,
  ensureDir,
  getSiaHome,
} from "./paths.js";
import { runRepl, writeDefaultConfigIfMissing } from "./repl/index.js";
import { withReadlineIdle } from "./repl/readline.js";
import { runSettingsMenu } from "./repl/settings.js";

function parseArgs(argv: string[]): {
  configPath: string;
  provider: string;
  session: string | null;
  noPlugins: boolean;
  cwd: string;
  contextsDir: string;
  contextDb: string;
  newContext: boolean;
  debug: boolean;
} {
  let configPath = "";
  let provider = "";
  let session: string | null = null;
  let noPlugins = false;
  let cwd = process.cwd();
  let contextsDir = "";
  let contextDb = "";
  let newContext = false;
  let debug = false;

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
    } else if (a === "--debug") {
      debug = true;
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
  --debug               Enable debug logging to console
  -h, --help            Show help

Environment:
  SIA_HOME              Config/plugins directory (default: %LOCALAPPDATA%/sia-cli on Windows)
  SIA_CONTEXTS_DIR      Default directory for per-agent context *.db files (see --contexts-dir)
`);
      process.exit(0);
    }
  }

  return { configPath, provider, session, noPlugins, cwd, contextsDir, contextDb, newContext, debug };
}

function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

function checkApiKeyStatus(config: SiaConfig): { hasKey: boolean; envVar?: string } {
  const provider = config.providers[config.defaultProvider];
  if (!provider?.apiKeyEnv) {
    return { hasKey: true };
  }
  const key = process.env[provider.apiKeyEnv]?.trim();
  return { hasKey: Boolean(key), envVar: provider.apiKeyEnv };
}

async function showStartupMenu(
  rl: readline.Interface,
  config: SiaConfig,
  configPath: string,
): Promise<{ config: SiaConfig; providerName: string; action: "chat" | "exit" }> {
  let currentConfig = config;
  let providerName = config.defaultProvider;

  while (true) {
    const stack = describeChatStack(currentConfig);
    const keyStatus = checkApiKeyStatus(currentConfig);
    const keyWarning = keyStatus.hasKey ? "" : " (no API key!)";
    
    withReadlineIdle(rl, () => {
      console.log("\n=== sia-cli ===\n");
      console.log("  1. Start conversation");
      console.log(`  2. Settings: ${stack}${keyWarning}`);
      console.log("  0. Exit\n");
      if (!keyStatus.hasKey) {
        console.log(`  Note: ${keyStatus.envVar} is not set. Configure it in Settings or set the env var.\n`);
      }
    });

    const choice = await question(rl, "Choice [1]: ");
    const num = choice.trim() === "" ? 1 : parseInt(choice.trim(), 10);

    if (num === 0) {
      return { config: currentConfig, providerName, action: "exit" };
    }

    if (num === 1 || isNaN(num)) {
      if (!keyStatus.hasKey) {
        withReadlineIdle(rl, () => console.log(`\n  WARNING: No API key found for ${keyStatus.envVar}.`));
        const proceed = await question(rl, "  Start anyway? (y/N): ");
        if (proceed.trim().toLowerCase() !== "y") {
          continue;
        }
      }
      return { config: currentConfig, providerName, action: "chat" };
    }

    if (num === 2) {
      const result = await runSettingsMenu(rl, configPath, currentConfig, providerName);
      if (result.changed) {
        currentConfig = result.config;
        providerName = result.providerName;
      }
      continue;
    }

    withReadlineIdle(rl, () => console.log("Invalid choice."));
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const home = getSiaHome();
  ensureDir(home);

  const logger = initLogger({
    minLevel: args.debug ? "debug" : "info",
    console: args.debug,
  });
  logger.info("cli", "sia-cli starting", { home, cwd: args.cwd, debug: args.debug });

  const configPath = args.configPath || defaultConfigPath(home);
  writeDefaultConfigIfMissing(configPath);
  let config = loadConfig(configPath);
  logger.info("cli", "Config loaded", { configPath, defaultProvider: config.defaultProvider });

  const isTTY = Boolean(process.stdin.isTTY);

  let providerName = args.provider || config.defaultProvider;

  if (isTTY && !args.provider) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      const menuResult = await showStartupMenu(rl, config, configPath);
      config = menuResult.config;
      providerName = menuResult.providerName;
      if (menuResult.action === "exit") {
        rl.close();
        return;
      }
    } finally {
      rl.close();
    }
  }

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
