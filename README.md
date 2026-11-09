# OpenCode Agent — Termux Edition 📱

A port of the **agent package** from [anomalyco/opencode](https://github.com/anomalyco/opencode) (v2.2.5, MIT), rebuilt **exclusively for Android/Termux**, with a **fullstack Vite WebUI** styled after the Z.ai Agent — **no more CLI/TUI**.

> The original repo was cloned via `git clone https://github.com/anomalyco/opencode`, then the agent package architecture (`packages/core`, `packages/ai`, `packages/server`) was ported to a pure Node.js runtime with zero native dependencies, and `packages/tui` was dropped and replaced by the WebUI.

## What was ported from opencode

| Original package (opencode) | Port here | Notes |
| --- | --- | --- |
| `packages/core/src/session` (Bun + drizzle/SQLite) | `server/store.js` (append-only JSONL) | opencode-style message part format (`text`, `tool`, state machine) |
| `packages/ai/src/loop.ts` (Effect runtime) | `server/agent.js` (async generator) | Multi-round tool calling, abortable per session |
| `packages/ai/src/providers/*` | `server/providers.js` | OpenAI-compatible (Z.ai GLM, OpenRouter, DeepSeek, Ollama) + Anthropic + Mock |
| `packages/core/src/tool/*` | `server/tools.js` | `bash`, `read`, `write`, `edit`, `glob`, `grep`, `todowrite` — no native dependencies |
| `packages/server` (Hono) | `server/index.js` (node:http) | 1 port for both API + static WebUI |
| `packages/tui` (OpenTUI) | ❌ **removed** → `web/` (Vite + React) | Dark theme similar to the Z.ai agent |

## WebUI features (similar to Z.ai Agent)

- 💬 SSE streaming chat with **markdown + collapsible reasoning**
- 🛠 **Tool call cards** — live status (running ✓/✕), collapsible input/output, duration
- ☑️ Agent **todo list** in the sidebar (from the `todowrite` tool)
- 📁 **Workspace panel** — file browser + file viewer + quick terminal exec
- ⚙️ **Settings** — provider, base URL, API key, model, workdir + quick presets (Z.ai / OpenRouter / DeepSeek / Ollama)
- 📱 Mobile-first (drawer sidebar, touch-friendly) — designed for phones
- 🌐 Accessible from the phone's own browser **or** from a PC on the same Wi-Fi

## Installing on Termux

> The production `web/dist/` bundle **is included** in this package — `setup-termux.sh` skips the build if dist already exists, so installation takes just a few seconds. Delete `web/dist/` if you want to rebuild from source.

```bash
pkg install git
git clone <this repo/package> opencode-agent
cd opencode-agent
bash setup-termux.sh
```

The script automatically: installs `nodejs-lts` via `pkg` → builds the WebUI (once) → creates the config → starts the server at **http://localhost:3010** (binds `0.0.0.0`, reachable from other devices).

### Configuration

Edit `~/.opencode-agent/config.json`, or use the WebUI → **⚙ Settings**. Environment variables (override the config) also work:

```bash
OPENCODE_AGENT_PROVIDER=openai-compatible \
OPENCODE_AGENT_BASE_URL=https://api.z.ai/api/paas/v4 \
OPENCODE_AGENT_API_KEY=sk-xxxx \
OPENCODE_AGENT_MODEL=glm-4.6 \
OPENCODE_AGENT_WORKDIR=$HOME/projects \
npm start
```

The `mock` provider is available for demo/testing without an API key.

### Termux tips

- Run `termux-wake-lock` before long sessions so Android does not kill the process.
- No root account needed. No native dependencies (no better-sqlite3/node-pty) → clean build on ARM.
- Access from PC: find the phone's IP (`ifconfig` in Termux), then open `http://<phone-ip>:3010`.
- The agent runs `bash` without a sandbox inside `workdir` — treat it like the original opencode: trust the model, review changes with `git`.

## Running from source

```bash
npm run setup        # build web/dist once
npm start            # server :3010 + serve WebUI
# or dev mode (frontend hot reload):
node server/index.js &  # API :3010
npm run web:dev         # Vite :5173 (proxies /api)
```

## API

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/health` | GET | server status (termux?, version) |
| `/api/config` | GET/POST | provider/model/workdir configuration |
| `/api/sessions` | GET/POST | list / create sessions |
| `/api/sessions/:id` | GET/DELETE | detail (messages+todos) / delete |
| `/api/sessions/:id/run` | POST | send message → **SSE stream** of events |
| `/api/sessions/:id/stop` | POST | abort a run |
| `/api/exec` | POST | run a quick command (terminal panel) |
| `/api/files` `/api/file` | GET | file tree & preview |

SSE events: `user-message`, `message-start`, `text-delta`, `think-delta`, `tool-start`, `tool-end`, `todo`, `usage`, `done`, `error`.

## License

MIT — following the upstream [opencode](https://github.com/anomalyco/opencode) project.
