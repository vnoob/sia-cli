import fs from "node:fs";
import path from "node:path";
import { defaultConfig, type SiaConfig } from "./types.js";

function deepMerge<T extends Record<string, unknown>>(base: T, patch: Record<string, unknown>): T {
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    const baseVal = base[k];
    const isPlainObject = (x: unknown) =>
      typeof x === "object" && x !== null && !Array.isArray(x);
    if (v !== undefined && isPlainObject(v) && isPlainObject(baseVal)) {
      out[k] = deepMerge(baseVal as Record<string, unknown>, v as Record<string, unknown>);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}

export function loadConfig(filePath: string): SiaConfig {
  if (!fs.existsSync(filePath)) {
    return structuredClone(defaultConfig);
  }
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
  return deepMerge(structuredClone(defaultConfig) as unknown as Record<string, unknown>, raw) as unknown as SiaConfig;
}

export function resolveProvider(
  config: SiaConfig,
  name: string,
  configPath?: string,
): { key: string; cfg: SiaConfig["providers"][string] } {
  const key = name || config.defaultProvider;
  const cfg = config.providers[key];
  if (!cfg) {
    const hint = configPath ? path.resolve(configPath) : "config.json";
    throw new Error(`Unknown provider "${key}". Define it under providers in ${hint}.`);
  }
  return { key, cfg };
}

export function getApiKey(apiKeyEnv?: string): string | undefined {
  if (!apiKeyEnv?.trim()) return undefined;
  return process.env[apiKeyEnv]?.trim();
}
