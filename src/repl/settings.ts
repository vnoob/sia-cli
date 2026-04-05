import type readline from "node:readline";
import { describeChatStack } from "../config/provider-label.js";
import type { SiaConfig } from "../config/types.js";
import { agentPresets, presetToProviderConfig, type AgentPreset } from "../config/agent-presets.js";
import { loadConfig, saveConfig } from "../config/load.js";
import { question, withReadlineIdle } from "./readline.js";

export interface SettingsResult {
  changed: boolean;
  config: SiaConfig;
  providerName: string;
}

interface TokenValidationResult {
  valid: boolean;
  error?: string;
}

const MAX_VALIDATION_BODY_CHARS = 16_384;

/** Full provider response for debugging (pretty JSON when possible). */
function formatValidationFailure(status: number, body: string): string {
  const header = `HTTP ${status}`;
  const trimmed = body.trim();
  if (!trimmed) {
    return header;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return `${header}\n${JSON.stringify(parsed, null, 2)}`;
  } catch {
    const text =
      trimmed.length > MAX_VALIDATION_BODY_CHARS
        ? `${trimmed.slice(0, MAX_VALIDATION_BODY_CHARS)}… (truncated)`
        : trimmed;
    return `${header}\n${text}`;
  }
}

async function validateToken(baseURL: string, model: string, apiKey: string): Promise<TokenValidationResult> {
  const url = `${baseURL.replace(/\/+$/, "")}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  const body = {
    model,
    messages: [{ role: "user", content: "hi" }],
    max_tokens: 1,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (res.ok) {
      return { valid: true };
    }

    const text = await res.text().catch(() => "");
    return { valid: false, error: formatValidationFailure(res.status, text) };
  } catch (e) {
    if (e instanceof Error) {
      if (e.name === "AbortError") {
        return { valid: false, error: "Request timed out (15s)" };
      }
      return { valid: false, error: e.message };
    }
    return { valid: false, error: String(e) };
  }
}

function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "..." + key.slice(-4);
}

/** Strip bracketed-paste OSC sequences, CRLF, and use first line (password managers often add a trailing newline). */
function normalizePastedApiKey(raw: string): string {
  let s = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  s = s.replace(/\x1b\[\?2004[hl]/g, "");
  s = s.replace(/\x1b\[200~/g, "").replace(/\x1b\[201~/g, "");
  s = s.trim();
  const first = s.split("\n")[0]?.trim() ?? "";
  return first;
}

async function handleTokenPrompt(
  rl: readline.Interface,
  apiKeyEnv: string,
  baseURL: string,
  model: string,
): Promise<{ key: string | undefined; changed: boolean }> {
  const existingKey = process.env[apiKeyEnv]?.trim();

  if (existingKey) {
    withReadlineIdle(rl, () => {
      console.log(`\n  Current token: ${maskKey(existingKey)} (from ${apiKeyEnv})`);
      console.log(`  What would you like to do?`);
      console.log(`    1. Keep current token`);
      console.log(`    2. Change token`);
      console.log(`    3. Clear token\n`);
    });

    const choice = await question(rl, "Choice [1]: ");
    const num = parseInt(choice.trim(), 10);

    if (num === 2) {
      const newKey = await promptAndValidateToken(rl, apiKeyEnv, baseURL, model);
      if (newKey) {
        process.env[apiKeyEnv] = newKey;
        withReadlineIdle(rl, () => console.log(`  Token updated for this session.`));
        return { key: newKey, changed: true };
      }
      withReadlineIdle(rl, () => console.log(`  Keeping existing token.`));
      return { key: existingKey, changed: false };
    }

    if (num === 3) {
      delete process.env[apiKeyEnv];
      withReadlineIdle(rl, () => console.log(`  Token cleared for this session.`));
      return { key: undefined, changed: true };
    }

    withReadlineIdle(rl, () => console.log(`  Keeping current token.`));
    return { key: existingKey, changed: false };
  }

  withReadlineIdle(rl, () => console.log(`\n  No token found for ${apiKeyEnv}.`));
  const newKey = await promptAndValidateToken(rl, apiKeyEnv, baseURL, model);
  if (newKey) {
    process.env[apiKeyEnv] = newKey;
    withReadlineIdle(rl, () => console.log(`  Token applied for this session.`));
    return { key: newKey, changed: true };
  }

  return { key: undefined, changed: false };
}

async function promptAndValidateToken(
  rl: readline.Interface,
  apiKeyEnv: string,
  baseURL: string,
  model: string,
): Promise<string | undefined> {
  const keyInput = await question(rl, `  Paste API key for ${apiKeyEnv} (Enter to skip): `);
  const trimmed = normalizePastedApiKey(keyInput);

  if (!trimmed) {
    return undefined;
  }

  withReadlineIdle(rl, () => console.log(`  Validating token...`));
  const result = await validateToken(baseURL, model, trimmed);

  if (result.valid) {
    withReadlineIdle(rl, () => console.log(`  Token is valid.`));
    return trimmed;
  }

  withReadlineIdle(rl, () => {
    console.log(`  Token validation failed:`);
    for (const line of (result.error ?? "").split("\n")) {
      console.log(`  ${line}`);
    }
  });
  const retry = await question(rl, `  Try another token? (y/N): `);
  if (retry.trim().toLowerCase() === "y") {
    return promptAndValidateToken(rl, apiKeyEnv, baseURL, model);
  }

  const useAnyway = await question(rl, `  Use this token anyway? (y/N): `);
  if (useAnyway.trim().toLowerCase() === "y") {
    return trimmed;
  }

  return undefined;
}

export async function runSettingsMenu(
  rl: readline.Interface,
  configPath: string,
  currentConfig: SiaConfig,
  currentProviderName: string,
): Promise<SettingsResult> {
  withReadlineIdle(rl, () => {
    console.log("\nSelect an AI agent provider:\n");
    console.log(`  Current: ${describeChatStack(currentConfig, currentProviderName)}\n`);
    for (let i = 0; i < agentPresets.length; i++) {
      const p = agentPresets[i];
      const marker = currentProviderName === p.providerKey ? " (current)" : "";
      console.log(`  ${i + 1}. ${p.label}${marker}`);
    }
    console.log(`  ${agentPresets.length + 1}. Custom (OpenAI-compatible URL)`);
    console.log(`  0. Cancel\n`);
  });

  const choice = await question(rl, "Choice [0]: ");
  const num = parseInt(choice.trim(), 10);

  if (!num || num === 0 || isNaN(num)) {
    withReadlineIdle(rl, () => console.log("Cancelled."));
    return { changed: false, config: currentConfig, providerName: currentProviderName };
  }

  if (num >= 1 && num <= agentPresets.length) {
    const preset = agentPresets[num - 1];
    return applyPreset(rl, configPath, currentConfig, preset);
  }

  if (num === agentPresets.length + 1) {
    return applyCustomProvider(rl, configPath, currentConfig);
  }

  withReadlineIdle(rl, () => console.log("Invalid choice."));
  return { changed: false, config: currentConfig, providerName: currentProviderName };
}

async function applyPreset(
  rl: readline.Interface,
  configPath: string,
  currentConfig: SiaConfig,
  preset: AgentPreset,
): Promise<SettingsResult> {
  withReadlineIdle(rl, () => {
    console.log(`\nConfiguring ${preset.label}...`);
    console.log(`  Base URL: ${preset.baseURL}`);
    console.log(`  Model: ${preset.defaultModel}`);
    console.log(`  API key env: ${preset.apiKeyEnv}`);
  });

  const tokenResult = await handleTokenPrompt(rl, preset.apiKeyEnv, preset.baseURL, preset.defaultModel);

  const config = loadConfig(configPath);
  config.providers[preset.providerKey] = presetToProviderConfig(preset);
  config.defaultProvider = preset.providerKey;
  saveConfig(configPath, config);

  withReadlineIdle(rl, () => {
    console.log(`\nProvider "${preset.providerKey}" saved as default in config.json.`);
    if (!tokenResult.key) {
      console.log(`\n  WARNING: No API key set for ${preset.apiKeyEnv}.`);
      console.log(`  Chat will fail until you set the environment variable or run /settings again.`);
      console.log(`  Example: set ${preset.apiKeyEnv}=your-api-key-here\n`);
    }
  });

  return { changed: true, config, providerName: preset.providerKey };
}

async function applyCustomProvider(
  rl: readline.Interface,
  configPath: string,
  currentConfig: SiaConfig,
): Promise<SettingsResult> {
  withReadlineIdle(rl, () => console.log("\nCustom OpenAI-compatible provider:\n"));

  const providerKey = (await question(rl, "Provider key (e.g. myserver): ")).trim();
  if (!providerKey) {
    withReadlineIdle(rl, () => console.log("Cancelled (no key entered)."));
    return { changed: false, config: currentConfig, providerName: currentConfig.defaultProvider };
  }

  const baseURL = (await question(rl, "Base URL (e.g. http://localhost:11434/v1): ")).trim();
  if (!baseURL) {
    withReadlineIdle(rl, () => console.log("Cancelled (no URL entered)."));
    return { changed: false, config: currentConfig, providerName: currentConfig.defaultProvider };
  }

  const model = (await question(rl, "Model name (e.g. llama3.2): ")).trim() || "default";

  const apiKeyEnv = (await question(rl, "API key env var name (Enter if none): ")).trim() || undefined;

  let tokenResult: { key: string | undefined; changed: boolean } = { key: undefined, changed: false };
  if (apiKeyEnv) {
    tokenResult = await handleTokenPrompt(rl, apiKeyEnv, baseURL, model);
  }

  const config = loadConfig(configPath);
  config.providers[providerKey] = {
    type: "openai-compatible",
    baseURL,
    model,
    ...(apiKeyEnv ? { apiKeyEnv } : {}),
  };
  config.defaultProvider = providerKey;
  saveConfig(configPath, config);

  withReadlineIdle(rl, () => {
    console.log(`\nProvider "${providerKey}" saved as default in config.json.`);
    if (apiKeyEnv && !tokenResult.key) {
      console.log(`\n  WARNING: No API key set for ${apiKeyEnv}.`);
      console.log(`  Chat will fail until you set the environment variable or run /settings again.`);
      console.log(`  Example: set ${apiKeyEnv}=your-api-key-here\n`);
    }
  });

  return { changed: true, config, providerName: providerKey };
}
