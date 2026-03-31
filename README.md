# sia-cli

Terminal-based AI assistant designed for developers who want IDE-like AI features without leaving the command line. It provides an interactive chat interface with intelligent context targeting, ensuring your data remains completely local and private.

## Features

- **Interactive Chat** — Continuous, line-by-line conversational interface directly in your terminal.
- **Intelligent Context Tagging** — Use `@` or `#` to instantly inject specific files, directories, or system context into your prompt, mirroring the workflow of modern AI IDEs.
- **Private Local Knowledge** — Conversation history and user preferences are stored entirely locally as flat files. No telemetry, no forced cloud sync.
- **Extensible Tooling** — Built-in hooks for shell commands and file search. API keys are stored securely in your OS keychain (or AES-256-encrypted local fallback).
- **Multiple AI Providers** — Works with OpenAI (GPT-4o, GPT-4-turbo, etc.) and local [Ollama](https://ollama.ai) models.

## Installation

```bash
npm install -g .
```

Or run directly without installing:

```bash
npm run build
node dist/index.js
```

## Quick Start

```bash
# Start interactive chat (default command)
sia

# Or explicitly:
sia chat
```

## Usage

### Interactive Chat

Once inside the chat session, type your message and press Enter. Use `/help` to see all available commands.

```
╔══════════════════════════════════╗
║  Sia - Terminal AI Assistant      ║
╚══════════════════════════════════╝

Provider: openai | Model: gpt-4o
Type /help for commands, /exit to quit

you> Hello! What can you help me with?
sia> I'm Sia, your terminal AI assistant. I can help with code reviews,
     debugging, answering questions, and much more...
```

### Context Tagging

Inject context directly into your message using `@` (files) and `#` (directories/system):

| Tag | Description | Example |
|-----|-------------|---------|
| `@<file>` | Inject file content | `@src/index.ts explain this` |
| `#<dir>` | Inject directory listing | `#src what files are here?` |
| `#system` | System info (OS, CPU, RAM) | `#system what OS am I on?` |
| `#env` | Environment variables | `#env what is my PATH?` |
| `#git` | Git status and recent log | `#git review my changes` |
| `#cwd` | Current working directory | `#cwd where am I?` |

**Example:**
```
you> @src/chat/session.ts #git can you review my recent changes to this file?
```
This injects the file contents and git status into the prompt before sending it to the AI.

### In-Chat Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands and context tags |
| `/clear` | Clear the screen |
| `/history` | List recent conversation sessions |
| `/new` | Start a new conversation session |
| `/model <name>` | Switch AI model (e.g., `/model gpt-4-turbo`) |
| `/provider <name>` | Switch provider (`openai` or `ollama`) |
| `/key <name>` | Securely set an API key |
| `/keys` | List stored API key names |
| `/prefs` | Show current preferences |
| `/exit` | Exit Sia |

## CLI Commands

### `sia config`

View or update configuration:

```bash
# Show current config
sia config --show

# Set provider and model
sia config --provider openai --model gpt-4o

# Use local Ollama
sia config --provider ollama --model llama3 --ollama-url http://localhost:11434

# Update system prompt
sia config --system-prompt "You are a concise coding assistant."

# Toggle streaming
sia config --stream false
```

### `sia key`

Manage API keys from the command line:

```bash
# List stored keys
sia key list

# Store a key (value provided as argument)
sia key set openai sk-your-key-here

# Delete a key
sia key delete openai
```

> **Note:** Keys set via `/key` inside the chat are entered interactively with hidden input (no echo).

### `sia history`

```bash
# List recent sessions
sia history --list

# Clear all history
sia history --clear
```

## Configuration

All configuration and data are stored in `~/.sia-cli/`:

```
~/.sia-cli/
├── preferences.json   # User preferences (provider, model, etc.)
├── keys.enc           # Encrypted API keys (fallback if keytar unavailable)
└── history/           # Conversation sessions (JSON files)
    ├── session_*.json
    └── ...
```

### Default Preferences

| Key | Default | Description |
|-----|---------|-------------|
| `provider` | `openai` | AI provider (`openai` or `ollama`) |
| `model` | `gpt-4o` | Model name |
| `ollamaBaseUrl` | `http://localhost:11434` | Ollama server URL |
| `maxContextMessages` | `20` | Max messages sent to AI |
| `streamResponse` | `true` | Stream tokens as they arrive |
| `systemPrompt` | (developer-focused) | System instruction for the AI |
| `theme` | `dark` | Terminal color theme |

## API Key Security

Sia stores API keys using your operating system's native keychain ([keytar](https://github.com/atom/node-keytar)) when available. If keytar is not available (e.g., in CI environments), keys fall back to AES-256-CBC encrypted local storage at `~/.sia-cli/keys.enc`, derived from a machine-specific identifier.

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Run with ts-node (no build required)
npm run dev
```

## Architecture

```
src/
├── index.ts              # CLI entry point (commander)
├── chat/
│   ├── interface.ts      # Interactive readline REPL
│   └── session.ts        # Chat session (context resolution + message flow)
├── context/
│   ├── parser.ts         # @ and # tag parser
│   ├── files.ts          # File/directory reader
│   └── system.ts         # System/git/env context
├── storage/
│   ├── history.ts        # Conversation history (local JSON)
│   ├── preferences.ts    # User preferences (local JSON)
│   └── keys.ts           # API key storage (keytar / AES-256 fallback)
├── providers/
│   ├── base.ts           # Abstract provider interface
│   ├── openai.ts         # OpenAI provider (streaming + non-streaming)
│   └── ollama.ts         # Ollama local provider
└── tools/
    ├── registry.ts       # Tool registry
    ├── types.ts          # Tool interfaces
    └── builtins/
        ├── shell.ts      # Shell command execution tool
        └── search.ts     # File content search tool
```

## License

MIT