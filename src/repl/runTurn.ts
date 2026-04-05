import crypto from "node:crypto";
import type { SiaDatabase } from "../db/types.js";
import type { SiaConfig } from "../config/types.js";
import { getApiKey, resolveProvider } from "../config/load.js";
import { appendMessage, nextSortOrder } from "../db/client.js";
import { buildRagPrefix } from "../knowledge/rag.js";
import { chunkText, insertKnowledgeChunk } from "../knowledge/index.js";
import { fetchEmbedding } from "../llm/embeddings.js";
import { OpenAICompatibleProvider } from "../llm/openai-compatible.js";
import { getLogger } from "../logging.js";
import type { ChatMessage, ToolCall } from "../llm/types.js";
import type { ToolRegistry } from "../plugins/registry.js";

const DEFAULT_SYSTEM = `You are sia-cli, a powerful local development assistant with tool capabilities.

IMPORTANT: You have access to tools that let you interact with the filesystem and perform actions. When the user asks you to create files, directories, projects, or modify content, you MUST use your tools to actually do it — do not just describe what you would do.

Guidelines:
- When asked to create a project, file, or directory: USE the filesystem tools (sia_fs_mkdir, sia_fs_write, etc.) to create them.
- When asked to generate code: WRITE the code to files using sia_fs_write, don't just show it.
- Break complex tasks into steps: create directories first, then write files.
- Be proactive: if the user wants something created, create it.
- Be concise in explanations, but thorough in execution.

You are not limited to advice — you can take action. Use your tools.`;

export interface RunTurnOptions {
  db: SiaDatabase;
  config: SiaConfig;
  configPath: string;
  providerName: string;
  sessionId: string;
  cwd: string;
  tools: ToolRegistry;
  /** Full thread including the latest user message (expanded mentions; RAG added only for this call). */
  history: ChatMessage[];
  signal?: AbortSignal;
}

export async function runAssistantTurn(opts: RunTurnOptions): Promise<void> {
  const log = getLogger();
  const last = opts.history[opts.history.length - 1];
  if (!last || last.role !== "user") {
    throw new Error("history must end with a user message");
  }

  log.info("chat", "User turn", { sessionId: opts.sessionId, contentLength: last.content.length });

  const { cfg } = resolveProvider(opts.config, opts.providerName, opts.configPath);
  const apiKey = getApiKey(cfg.apiKeyEnv);
  const provider = new OpenAICompatibleProvider();

  let ragBlock: string | null = null;
  try {
    ragBlock = await buildRagPrefix({
      db: opts.db,
      config: opts.config,
      query: last.content,
      signal: opts.signal,
    });
  } catch (e) {
    console.error(`[sia] RAG skipped: ${e instanceof Error ? e.message : String(e)}`);
  }

  const userForModel = ragBlock ? `${ragBlock}\n\n${last.content}` : last.content;
  const messages: ChatMessage[] = [
    { role: "system", content: DEFAULT_SYSTEM },
    ...opts.history.slice(0, -1),
    { role: "user", content: userForModel },
  ];

  const toolDefs = opts.tools.toOpenAITools();

  while (true) {
    if (opts.signal?.aborted) {
      const e = new Error("Aborted");
      e.name = "AbortError";
      throw e;
    }

    const result = await provider.streamChat({
      baseURL: cfg.baseURL,
      apiKey,
      model: cfg.model,
      messages,
      tools: toolDefs.length ? toolDefs : undefined,
      signal: opts.signal,
      onDelta: (t) => {
        process.stdout.write(t);
      },
    });

    process.stdout.write("\n");

    const toolCalls: ToolCall[] = result.toolCalls;
    const sortBase = nextSortOrder(opts.db, opts.sessionId);
    const assistantId = crypto.randomUUID();
    appendMessage(opts.db, {
      id: assistantId,
      session_id: opts.sessionId,
      role: "assistant",
      content: result.content,
      tool_calls: toolCalls.length ? JSON.stringify(toolCalls) : null,
      tool_call_id: null,
      name: null,
      sort_order: sortBase,
    });

    const assistantMsg: ChatMessage = {
      role: "assistant",
      content: result.content || null,
      tool_calls: toolCalls.length ? toolCalls : undefined,
    };
    opts.history.push(assistantMsg);
    messages.push(assistantMsg);

    if (!toolCalls.length) {
      log.info("chat", "Assistant response (no tools)", { contentLength: result.content.length });
      break;
    }

    log.info("chat", "Assistant requested tools", { count: toolCalls.length, tools: toolCalls.map((t) => t.function.name) });

    const ctx = {
      cwd: opts.cwd,
      sessionId: opts.sessionId,
      db: opts.db,
      signal: opts.signal,
    };

    let order = sortBase + 1;
    for (const tc of toolCalls) {
      let args: unknown = {};
      try {
        args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
      } catch {
        args = {};
      }
      log.debug("tool", `Invoking ${tc.function.name}`, { args });
      const startTime = Date.now();
      const output = await opts.tools.invoke(tc.function.name, args, ctx);
      const duration = Date.now() - startTime;
      log.info("tool", `Tool completed: ${tc.function.name}`, { duration, outputLength: output.length });
      appendMessage(opts.db, {
        id: crypto.randomUUID(),
        session_id: opts.sessionId,
        role: "tool",
        content: output,
        tool_calls: null,
        tool_call_id: tc.id,
        name: tc.function.name,
        sort_order: order++,
      });
      const toolMsg: ChatMessage = {
        role: "tool",
        content: output,
        tool_call_id: tc.id,
        name: tc.function.name,
      };
      opts.history.push(toolMsg);
      messages.push(toolMsg);
    }
  }
}

export async function ingestPath(opts: {
  db: SiaDatabase;
  config: SiaConfig;
  filePath: string;
  signal?: AbortSignal;
}): Promise<number> {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const abs = path.resolve(opts.filePath);
  const text = fs.readFileSync(abs, "utf8");
  const chunks = chunkText(text);
  const { embedding: embCfg, defaultProvider, providers } = opts.config;
  if (!embCfg?.model) throw new Error("config.embedding.model is required for /ingest");
  const providerKey = embCfg.provider ?? defaultProvider;
  const p = providers[providerKey];
  if (!p) throw new Error(`Unknown embedding provider "${providerKey}"`);
  const baseURL = embCfg.baseURL ?? p.baseURL;
  const apiKey = getApiKey(embCfg.apiKeyEnv ?? p.apiKeyEnv);

  let n = 0;
  for (const c of chunks) {
    const vec = await fetchEmbedding({
      baseURL,
      apiKey,
      model: embCfg.model,
      input: c,
      signal: opts.signal,
    });
    insertKnowledgeChunk(opts.db, abs, c, vec);
    n++;
  }
  return n;
}
