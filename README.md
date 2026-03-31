# sia-cli

A local-first, extensible command-line AI interface: REPL chat, `@` / `#` mention-driven context, SQLite session storage, optional local RAG over embedded knowledge, OpenAI-compatible providers (Ollama, LM Studio, cloud APIs behind explicit config), and a plugin system for tools.

## Requirements

- Node.js 20+
- A running OpenAI-compatible server for chat (default config targets [Ollama](https://ollama.com/) at `http://127.0.0.1:11434/v1`)

## Install

```bash
npm install
npm run build
npm link   # optional: makes `sia` available globally
```

Or run without linking:

```bash
npm run dev
node dist/cli.js
```

## First run

On first launch, `sia` creates a data directory and default `config.json`:

| Platform | Default data dir |
|----------|------------------|
| Windows  | `%LOCALAPPDATA%\sia-cli` |
| Linux/macOS | `~/.local/share/sia-cli` (or `$XDG_DATA_HOME/sia-cli`) |

Override with environment variable `SIA_HOME`.

Files created:

- `config.json` — providers, embedding model, mention limits, RAG toggle
- `sia.db` — SQLite: sessions, messages, memory slots, knowledge chunk embeddings

## CLI options

```
sia [--config <path>] [--provider <name>] [--session <uuid>] [--no-plugins] [--cwd <path>]
```

- **`--provider`** — Key under `providers` in `config.json` (default: `defaultProvider`).
- **`--session`** — Resume a session UUID (otherwise a new session is started; the id is printed at REPL startup).
- **`--no-plugins`** — Skip `SIA_HOME/plugins` and `.sia/plugins` (built-in tools still load).
- **`--cwd`** — Base directory for `@` file paths and plugin discovery.

## Mention syntax

Mentions are expanded **before** the message is sent to the model. Blocks are appended to your text with clear `--- mention: ... ---` delimiters.

| Syntax | Meaning |
|--------|---------|
| `@path/to/file` | Inline file contents (UTF-8 text only; must stay under `mentions.maxFileBytes` and inside cwd or `mentions.allowedRoots`) |
| `@env:VAR` | Value of `VAR` only if `VAR` is listed in `mentions.envAllowlist` (default: none, to avoid leaking secrets) |
| `#last` | Content of the **previous** user message in this session |
| `#session` | All memory slots for this session (plus global slots with `session_id` null) |
| `#<id>` | Content of memory slot id (see tool `sia_memory_save`) |

Paths are resolved from `--cwd` (default: process cwd).

## REPL commands

| Command | Description |
|---------|-------------|
| `/help` | Short help |
| `/ingest <path>` | Chunk file, call embeddings API, store vectors locally (needs `config.embedding`) |
| `/rag on` / `/rag off` | Enable or disable RAG for **this process only** (does not rewrite `config.json`) |
| `/session` | Print current session id |
| `/exit`, `exit`, `quit` | Leave the REPL |

**Ctrl+C** aborts the in-flight HTTP stream; you can continue with a new line.

## Config (`config.json`)

Default provider points at local Ollama. Add cloud endpoints explicitly; set `apiKeyEnv` to an environment variable **name** that holds the key (never commit keys).

```json
{
  "defaultProvider": "local",
  "providers": {
    "local": {
      "type": "openai-compatible",
      "baseURL": "http://127.0.0.1:11434/v1",
      "model": "llama3.2"
    },
    "openai": {
      "type": "openai-compatible",
      "baseURL": "https://api.openai.com/v1",
      "apiKeyEnv": "OPENAI_API_KEY",
      "model": "gpt-4o-mini"
    }
  },
  "embedding": {
    "provider": "local",
    "model": "nomic-embed-text"
  },
  "mentions": {
    "maxFileBytes": 100000,
    "envAllowlist": [],
    "allowedRoots": []
  },
  "rag": {
    "enabled": false,
    "topK": 5
  }
}
```

- **`embedding.provider`** — Which `providers` entry supplies `baseURL` / `apiKeyEnv` for `/v1/embeddings` (unless you set `embedding.baseURL` / `embedding.apiKeyEnv`).
- **`rag.enabled`** — When true, each user turn embeds the user text and prepends top-`topK` chunks from the local index to the model prompt (RAG block is not stored in the DB user row).

## Privacy and data flow

- **Chat history, memory slots, and knowledge chunks** stay under `SIA_HOME` on disk.
- **Network**: Whatever you configure under `providers` receives prompts and tool metadata. Local Ollama keeps traffic on your machine; cloud providers send data to that vendor.
- **Embeddings** for `/ingest` and RAG use the configured embedding endpoint (often the same machine as Ollama).

## Plugins

Plugins live in subfolders of:

1. `SIA_HOME/plugins/<name>/`
2. `.sia/plugins/<name>/` (under `--cwd`)

Later directories in that order **override** tools with the same name.

Each plugin needs `sia-plugin.json`:

```json
{
  "name": "myplugin",
  "main": "./index.mjs"
}
```

The entry module’s **default export** is an async function `(api) => { ... }` that calls `api.registerTool({ name, description, parameters, handler })`.

- `parameters` must be a JSON Schema–style object (`type`, `properties`, etc.).
- `handler` is `async (args, ctx) => string` where `ctx` has `cwd`, `sessionId`, `db`, and `signal`. Return a **string** (usually JSON) for the model.

Plugins run with full Node.js privileges—only install code you trust.

See [examples/plugin-demo/](examples/plugin-demo/) for a minimal plugin.

## Built-in tools

| Tool | Purpose |
|------|---------|
| `sia_echo` | Debug tool wiring |
| `sia_memory_save` | Upsert a memory slot (`id`, `label`, `content`) for the current session; reference later with `#id` |

## Development

```bash
npm run dev      # tsx src/cli.ts
npm run build    # tsc -> dist/
npm test         # vitest
```

