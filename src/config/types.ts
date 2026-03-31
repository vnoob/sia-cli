export type ProviderType = "openai-compatible";

export interface ProviderConfig {
  type: ProviderType;
  /** Base URL including /v1 if required by the server (e.g. http://127.0.0.1:11434/v1). */
  baseURL: string;
  /** Read API key from this environment variable name; omit or empty for no key. */
  apiKeyEnv?: string;
  model: string;
}

export interface EmbeddingConfig {
  /** Provider name key into `providers` for chat-compatible embedding endpoint, or same shape via override. */
  provider?: string;
  baseURL?: string;
  apiKeyEnv?: string;
  model: string;
}

export interface MentionConfig {
  maxFileBytes: number;
  /** Only these env var names may be injected via `@env:NAME`. */
  envAllowlist: string[];
  /** Optional extra roots (absolute) allowed for `@` file reads beyond cwd. */
  allowedRoots: string[];
}

export interface RagConfig {
  enabled: boolean;
  topK: number;
}

export interface SiaConfig {
  defaultProvider: string;
  providers: Record<string, ProviderConfig>;
  embedding?: EmbeddingConfig;
  mentions: MentionConfig;
  rag: RagConfig;
}

export const defaultConfig: SiaConfig = {
  defaultProvider: "local",
  providers: {
    local: {
      type: "openai-compatible",
      baseURL: "http://127.0.0.1:11434/v1",
      model: "llama3.2",
    },
  },
  embedding: {
    provider: "local",
    model: "nomic-embed-text",
  },
  mentions: {
    maxFileBytes: 100_000,
    envAllowlist: [],
    allowedRoots: [],
  },
  rag: {
    enabled: false,
    topK: 5,
  },
};
