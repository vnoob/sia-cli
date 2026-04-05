# sia-cli

A local-first, extensible command-line AI interface: REPL chat, `@` / `#` mention-driven context, SQLite session storage, optional local RAG over embedded knowledge, OpenAI-compatible providers (Ollama, LM Studio, cloud APIs behind explicit config), and a plugin system for tools.

## Requirements

- Node.js 22.13+ (`node:sqlite`; avoids native `better-sqlite3` addons blocked by some Windows policies)
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

On first launch in an interactive terminal, `sia` shows a startup menu:

```
=== sia-cli ===

  1. Start conversation
  2. Settings: Local (Ollama) — llama3.2
  0. Exit
```

- **Option 1** begins the chat REPL with the current provider
- **Option 2** opens the settings menu to select or configure an AI provider (OpenAI, Gemini, Claude, or custom)
- **Option 0** exits without starting

The menu shows the configured provider and **chat model** (same pattern on the REPL banner after start). The `/settings` menu prints a **Current:** line with that pair. Use `--provider <name>` to skip the menu and start directly with a specific provider.

`sia` also ensures a **config home** directory and writes default `config.json` if missing:

| Platform | Default config / plugin home (`SIA_HOME`) |
|----------|-------------------------------------------|
| Windows  | `%LOCALAPPDATA%\sia-cli` |
| Linux/macOS | `~/.local/share/sia-cli` (or `$XDG_DATA_HOME/sia-cli`) |

Override with environment variable `SIA_HOME`.

**Per-agent context** (chat history, memory slots, and RAG knowledge) lives in separate SQLite files under a **contexts directory**:

- Default directory: `SIA_HOME/contexts` (same cross-platform root as above).
- **Interactive terminal**: you are prompted for the contexts directory (press Enter to accept the default). If matching files already exist, they are listed as `datetime: one-line summary`, then you pick a number or `n` for a new agent context.
- **Non-interactive** (no TTY): contexts directory is `--contexts-dir` if set, else `SIA_CONTEXTS_DIR`, else the default above; opens the most recently modified agent file, or creates a new one if none exist.

Each agent file is named `{uuid}_{timestamp}.db`. A small `agent_context_meta` table stores `display_summary` (updated from the latest user message after each completed turn) for the startup list.

Files under `SIA_HOME`:

- `config.json` — providers, embedding model, mention limits, RAG toggle

Files under your contexts directory:

- `{uuid}_{timestamp}.db` — SQLite: sessions, messages, memory slots, knowledge chunk embeddings for that agent only

## CLI options

```
sia [--config <path>] [--provider <name>] [--session <uuid>]
    [--contexts-dir <path>] [--context-db <path>] [--new-context]
    [--no-plugins] [--cwd <path>]
```

- **`--provider`** — Key under `providers` in `config.json` (default: `defaultProvider`).
- **`--session`** — Resume a session UUID **within the current agent context DB** (otherwise a new session is started; the id is printed at REPL startup).
- **`--contexts-dir`** — Directory for agent `*.db` files (overrides `SIA_CONTEXTS_DIR` when both are set).
- **`--context-db`** — Open this SQLite file directly; skips the contexts-directory prompt and the agent list prompt.
- **`--new-context`** — Always create a new agent context file in the resolved contexts directory.
- **`--no-plugins`** — Skip `SIA_HOME/plugins` and `.sia/plugins` (built-in tools still load).
- **`--cwd`** — Base directory for `@` file paths and plugin discovery.

Environment:

- **`SIA_CONTEXTS_DIR`** — Default directory for agent context databases (see `--contexts-dir`).

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
| `/settings` | Interactive menu to select AI provider (OpenAI, Gemini, Claude, or custom); saves to `config.json` |
| `/plugins` | List available plugins, their load status, and browse tools |
| `/ingest <path>` | Chunk file, call embeddings API, store vectors locally (needs `config.embedding`) |
| `/rag on` / `/rag off` | Enable or disable RAG for **this process only** (does not rewrite `config.json`) |
| `/session` | Print current session id |
| `/context new` | Start a **new** agent (new `{uuid}_{timestamp}.db` next to the current file, new session, empty history) |
| `/exit`, `exit`, `quit` | Leave the REPL |

**Ctrl+C** aborts the in-flight HTTP stream; you can continue with a new line.

### Provider setup with `/settings`

Run `/settings` in the REPL to configure your AI provider interactively. Choose from:

1. **OpenAI** — uses `OPENAI_API_KEY`
2. **Google Gemini** — uses `GEMINI_API_KEY`; default chat model is `gemini-2.5-flash` (stable, supports tools; Gemini 3.x requires thought_signature handling not yet implemented)
3. **Anthropic Claude** — uses `ANTHROPIC_API_KEY`
4. **Custom** — any OpenAI-compatible endpoint (Ollama, LM Studio, Azure, OpenRouter, etc.)

The menu saves the provider to `config.json` and sets it as default.

**Token management:** When you select a provider, the wizard checks if a token already exists:
- **No token found** — prompts you to paste one; validates it before applying
- **Token exists** — offers three choices: keep, change, or clear
- **Invalid/expired token** — shows the error reason (e.g. "Invalid or unauthorized API key", "Rate limited or quota exceeded") and lets you retry or use it anyway

Tokens apply to the current process only (never written to `config.json`). To persist keys across sessions, set them as environment variables.

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

- **Chat history, memory slots, and knowledge chunks** stay in the **agent context** SQLite file you opened (under your chosen contexts directory, or the path passed to `--context-db`).
- **Config and plugins** stay under `SIA_HOME`.
- **Network**: Whatever you configure under `providers` receives prompts and tool metadata. Local Ollama keeps traffic on your machine; cloud providers send data to that vendor.
- **Embeddings** for `/ingest` and RAG use the configured embedding endpoint (often the same machine as Ollama).

## Plugins

Plugins extend sia-cli with custom tools that the AI can use. They live in subfolders of:

1. **Global:** `SIA_HOME/plugins/<name>/` — shared across all projects
2. **Project:** `.sia/plugins/<name>/` (under `--cwd`) — project-specific

Later directories **override** tools with the same name (project beats global).

### Quick start: Install a plugin

**Windows (PowerShell):**

```powershell
# Copy plugin-fs to global plugins (enables filesystem tools)
Copy-Item -Recurse examples\plugin-fs "$env:LOCALAPPDATA\sia-cli\plugins\fs"

# Or install in current project only
New-Item -ItemType Directory -Force -Path .sia\plugins
Copy-Item -Recurse examples\plugin-fs .sia\plugins\fs
```

**Linux/macOS:**

```bash
# Global install
cp -r examples/plugin-fs ~/.local/share/sia-cli/plugins/fs

# Or project-only
mkdir -p .sia/plugins && cp -r examples/plugin-fs .sia/plugins/fs
```

Restart sia-cli — the plugin loads automatically. Use `--no-plugins` to disable.

### Creating a plugin

Each plugin folder needs `sia-plugin.json`:

```json
{
  "name": "myplugin",
  "main": "./index.mjs"
}
```

The entry module's **default export** is an async function that registers tools:

```javascript
export default async function register(api) {
  api.registerTool({
    name: "my_tool",
    description: "What this tool does (shown to AI)",
    parameters: {
      type: "object",
      properties: {
        arg1: { type: "string", description: "First argument" },
      },
      required: ["arg1"],
    },
    async handler(args, ctx) {
      // args = parsed JSON from AI
      // ctx = { cwd, sessionId, db, signal }
      return JSON.stringify({ result: "..." }); // Must return string
    },
  });
}
```

**Key points:**
- `parameters` must be JSON Schema format (`type: "object"`, `properties`, etc.)
- `handler` receives `args` (from AI) and `ctx` (runtime context)
- `ctx.cwd` — working directory (use for safe path resolution)
- `ctx.db` — SQLite database for this agent context
- `ctx.signal` — AbortSignal for cancellation
- Return value **must be a string** (usually JSON) — this is what the AI sees

Plugins run with full Node.js privileges — only install code you trust.

### Example plugins

| Plugin | Location | Description |
|--------|----------|-------------|
| `plugin-demo` | [examples/plugin-demo/](examples/plugin-demo/) | Minimal example: single greeting tool |
| `plugin-fs` | [examples/plugin-fs/](examples/plugin-fs/) | Filesystem tools: read, write, list, mkdir, delete, rename |

### Filesystem plugin tools

The `plugin-fs` example provides tools for file operations (copy to enable):

| Tool | Description |
|------|-------------|
| `sia_fs_read` | Read file contents (max 512KB) |
| `sia_fs_write` | Write/create file (max 1MB) |
| `sia_fs_append` | Append to file |
| `sia_fs_list` | List directory contents |
| `sia_fs_mkdir` | Create directory |
| `sia_fs_delete` | Delete file or directory |
| `sia_fs_exists` | Check if path exists |
| `sia_fs_rename` | Rename/move file or directory |

**Security:** All paths are resolved relative to `--cwd` and cannot escape it.

## Built-in tools

These are always available (no plugin needed):

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

## Changelog

- 2026-03-31: Per-agent context SQLite files (`uuid_timestamp.db`), startup contexts-dir prompt and list, `SIA_CONTEXTS_DIR` / `--contexts-dir` / `--context-db` / `--new-context`, `/context new`, `agent_context_meta.display_summary` for list lines.
- 2026-03-31: SQLite via Node `node:sqlite` (Node ≥22.13); remove `better-sqlite3`; shared `SiaDatabase` type in `src/db/types.ts`.
- 2026-04-02: Interactive startup menu and `/settings` command for AI provider selection (OpenAI, Gemini, Claude, custom); token validation and management with keep/change/clear options; API key status warnings.
- 2026-04-04: Startup menu, REPL banner, and `/settings` show active provider and chat model (`describeChatStack`).
- 2026-04-04: Gemini preset default model changed to `gemini-2.5-flash` (stable, supports tools); Gemini 3.x requires thought_signature handling not yet implemented.
- 2026-04-04: Token validation now shows full API response body for easier debugging (e.g. quota details, model deprecation).
- 2026-04-04: Fix readline paste issues on Windows by pausing readline around console output; normalize pasted API keys.
- 2026-04-04: Added `plugin-fs` example with filesystem tools (read, write, list, mkdir, delete, rename, exists, append).
- 2026-04-04: Added `/plugins` command to list available plugins, their load status, and browse tool descriptions.
