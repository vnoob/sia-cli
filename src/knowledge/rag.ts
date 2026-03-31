import type { SiaDatabase } from "../db/types.js";
import type { SiaConfig } from "../config/types.js";
import { getApiKey } from "../config/load.js";
import { fetchEmbedding } from "../llm/embeddings.js";
import { searchTopK } from "./store.js";

export async function buildRagPrefix(opts: {
  db: SiaDatabase;
  config: SiaConfig;
  query: string;
  signal?: AbortSignal;
}): Promise<string | null> {
  const { rag, embedding: embCfg, defaultProvider, providers } = opts.config;
  if (!rag.enabled || !embCfg?.model) return null;

  const providerKey = embCfg.provider ?? defaultProvider;
  const p = providers[providerKey];
  if (!p) throw new Error(`RAG embedding provider "${providerKey}" not found in config.providers`);
  const baseURL = embCfg.baseURL ?? p.baseURL;
  const apiKey = getApiKey(embCfg.apiKeyEnv ?? p.apiKeyEnv);

  const qEmb = await fetchEmbedding({
    baseURL,
    apiKey,
    model: embCfg.model,
    input: opts.query,
    signal: opts.signal,
  });

  const hits = searchTopK(opts.db, qEmb, rag.topK);
  if (!hits.length) return null;

  const lines = hits.map((h, i) => `[${i + 1}] (${h.source_uri}) score=${h.score.toFixed(4)}\n${h.text}`);
  return `### Retrieved local knowledge (RAG)\n${lines.join("\n\n")}`;
}
