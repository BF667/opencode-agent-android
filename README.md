# OpenCode Agent — Termux Edition 📱

Porting **package agent** dari [anomalyco/opencode](https://github.com/anomalyco/opencode) (v2.2.5, MIT) yang dibuat **khusus Android/Termux**, dengan antarmuka **fullstack Vite WebUI** bergaya Z.ai Agent — **bukan CLI/TUI lagi**.

> Repo asli diambil via `git clone https://github.com/anomalyco/opencode`, lalu arsitektur package agent-nya (`packages/core`, `packages/ai`, `packages/server`) diporting ke runtime Node.js murni tanpa dependensi native, dan `packages/tui` dibuang dan diganti WebUI.

## Apa yang dipindahkan dari opencode

| Package asli (opencode) | Port di sini | Catatan |
| --- | --- | --- |
| `packages/core/src/session` (Bun + drizzle/SQLite) | `server/store.js` (JSONL append-only) | Format message part ala opencode (`text`, `tool`, state machine) |
| `packages/ai/src/loop.ts` (Effect runtime) | `server/agent.js` (async generator) | Multi-round tool calling, abortable per sesi |
| `packages/ai/src/providers/*` | `server/providers.js` | OpenAI-compatible (Z.ai GLM, OpenRouter, DeepSeek, Ollama) + Anthropic + Mock |
| `packages/core/src/tool/*` | `server/tools.js` | `bash`, `read`, `write`, `edit`, `glob`, `grep`, `todowrite` — tanpa dependensi native |
| `packages/server` (Hono) | `server/index.js` (node:http) | 1 port untuk API + WebUI statis |
| `packages/tui` (OpenTUI) | ❌ **dihapus** → `web/` (Vite + React) | Tema gelap mirip Z.ai agent |

## Fitur WebUI (mirip Z.ai Agent)

- 💬 Chat streaming SSE dengan **markdown + reasoning collapsible**
- 🛠 **Tool call cards** — status live (running ✓/✕), input/output collapsible, durasi
- ☑️ **Todo list** agent di sidebar (dari tool `todowrite`)
- 📁 **Workspace panel** — file browser + file viewer + terminal quick-exec
- ⚙️ **Settings** — provider, base URL, API key, model, workdir + preset cepat (Z.ai / OpenRouter / DeepSeek / Ollama)
- 📱 Mobile-first (drawer sidebar, touch-friendly) — memang buat HP
- 🌐 Bisa diakses dari browser HP sendiri **atau** dari PC dalam Wi-Fi yang sama

## Instalasi di Termux

> Bundle `web/dist/` versi produksi **sudah tersedia** di package ini — `setup-termux.sh` akan melewati build jika dist masih ada, jadi install bisa cuma beberapa detik. Hapus `web/dist/` kalau mau rebuild dari source.

```bash
pkg install git
git clone <repo/package ini> opencode-agent
cd opencode-agent
bash setup-termux.sh
```

Script otomatis: `pkg install nodejs-lts` → build WebUI (sekali saja) → buat config → jalankan server di **http://localhost:3010** (bind `0.0.0.0`, bisa dibuka dari device lain).

### Konfigurasi

Edit `~/.opencode-agent/config.json`, atau via WebUI → **⚙ Settings**. Bisa juga env var (menimpa config):

```bash
OPENCODE_AGENT_PROVIDER=openai-compatible \
OPENCODE_AGENT_BASE_URL=https://api.z.ai/api/paas/v4 \
OPENCODE_AGENT_API_KEY=sk-xxxx \
OPENCODE_AGENT_MODEL=glm-4.6 \
OPENCODE_AGENT_WORKDIR=$HOME/projects \
npm start
```

Provider `mock` tersedia untuk demo/tes tanpa API key.

### Tips Termux

- `termux-wake-lock` sebelum sesi panjang agar proses tidak dimatikan Android.
- Tanpa akun root. Tidak ada dependensi native (tanpa better-sqlite3/node-pty) → build bersih di ARM.
- Akses dari PC: cari IP HP (`ifconfig` di Termux) lalu buka `http://<ip-hp>:3010`.
- Agent menjalankan `bash` tanpa sandbox di `workdir` — gunakan sebagaimana opencode asli: percayai model, cek perubahan dengan `git`.

## Menjalankan dari source

```bash
npm run setup        # build web/dist sekali
npm start            # server :3010 + serve WebUI
# atau mode dev (hot reload frontend):
node server/index.js &  # API :3010
npm run web:dev         # Vite :5173 (proxy /api)
```

## API

| Endpoint | Method | Fungsi |
| --- | --- | --- |
| `/api/health` | GET | status server (termux?, versi) |
| `/api/config` | GET/POST | konfigurasi provider/model/workdir |
| `/api/sessions` | GET/POST | daftar / buat sesi |
| `/api/sessions/:id` | GET/DELETE | detail (messages+todos) / hapus |
| `/api/sessions/:id/run` | POST | kirim pesan → **SSE stream** event |
| `/api/sessions/:id/stop` | POST | batalkan run |
| `/api/exec` | POST | jalankan perintah cepat (panel terminal) |
| `/api/files` `/api/file` | GET | file tree & preview |

Event SSE: `user-message`, `message-start`, `text-delta`, `think-delta`, `tool-start`, `tool-end`, `todo`, `usage`, `done`, `error`.

## Lisensi

MIT — mengikuti proyek asal [opencode](https://github.com/anomalyco/opencode).
