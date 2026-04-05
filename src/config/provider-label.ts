import type { SiaConfig } from "./types.js";

const LABELS: Record<string, string> = {
  openai: "OpenAI",
  gemini: "Google Gemini",
  claude: "Anthropic Claude",
  local: "Local (Ollama)",
};

/** Human-readable name for a provider key from config. */
export function providerLabel(providerKey: string): string {
  return LABELS[providerKey] ?? providerKey;
}

/** Provider name and chat model for UI (e.g. startup menu, REPL banner). */
export function describeChatStack(config: SiaConfig, providerKey?: string): string {
  const key = providerKey ?? config.defaultProvider;
  const model = config.providers[key]?.model;
  const label = providerLabel(key);
  return model ? `${label} — ${model}` : label;
}
