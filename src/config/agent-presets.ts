import type { ProviderConfig } from "./types.js";

export interface AgentPreset {
  id: string;
  label: string;
  providerKey: string;
  baseURL: string;
  defaultModel: string;
  apiKeyEnv: string;
}

export const agentPresets: AgentPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    providerKey: "openai",
    baseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    apiKeyEnv: "OPENAI_API_KEY",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    providerKey: "gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    defaultModel: "gemini-2.0-flash",
    apiKeyEnv: "GEMINI_API_KEY",
  },
  {
    id: "claude",
    label: "Anthropic Claude",
    providerKey: "claude",
    baseURL: "https://api.anthropic.com/v1/",
    defaultModel: "claude-sonnet-4-20250514",
    apiKeyEnv: "ANTHROPIC_API_KEY",
  },
];

export function presetToProviderConfig(preset: AgentPreset): ProviderConfig {
  return {
    type: "openai-compatible",
    baseURL: preset.baseURL,
    model: preset.defaultModel,
    apiKeyEnv: preset.apiKeyEnv,
  };
}
