#!/data/data/com.termux/files/usr/bin/bash
# setup-termux.sh — installer OpenCode Agent (Termux Edition)
# Port of anomalyco/opencode packages/agent for Android/Termux only.
# Usage: bash setup-termux.sh

set -e

BOLD='\033[1m'; DIM='\033[2m'; GREEN='\033[32m'; YELLOW='\033[33m'; RESET='\033[0m'
say() { echo -e "${GREEN}▸${RESET} $1"; }
warn() { echo -e "${YELLOW}▸${RESET} $1"; }

cd "$(dirname "$0")"

echo -e "${BOLD}"
cat <<'LOGO'
  ┌─────────────────────────────────────────────┐
  │   OpenCode Agent — Termux Edition           │
  │   agent package · vite webui · no TUI       │
  └─────────────────────────────────────────────┘
LOGO
echo -e "${RESET}"

# 1. Termux packages
if command -v pkg >/dev/null 2>&1; then
  say "Update Termux packages (nodejs-lts, git)…"
  pkg update -y && pkg upgrade -y || true
  pkg install -y nodejs-lts git || { warn "pkg install failed — check your internet connection"; exit 1; }
else
  warn "pkg not found — assuming non-Termux environment, using system node."
  command -v node >/dev/null || { echo "Node.js >= 18 is required"; exit 1; }
fi

node -v
say "Node $(node -v) ready."

# 2. Build WebUI (skip if the bundled dist still exists)
if [ -f web/dist/index.html ]; then
  say "Bundled WebUI found — skipping build. (delete web/dist/ to rebuild)"
else
  say "Installing WebUI dependencies + building (one-time, ~1-2 min)…"
  npm install --prefix web --no-audit --no-fund
  npm --prefix web run build
fi

# 3. Config awal
if [ ! -f "$HOME/.opencode-agent/config.json" ]; then
  say "Creating initial config at $HOME/.opencode-agent/config.json"
  mkdir -p "$HOME/.opencode-agent"
  cat > "$HOME/.opencode-agent/config.json" <<'CFG'
{
  "provider": "openai-compatible",
  "baseUrl": "https://api.z.ai/api/paas/v4",
  "apiKey": "",
  "model": "glm-4.6",
  "workdir": "PLACEHOLDER_HOME"
}
CFG
  sed -i "s|PLACEHOLDER_HOME|$HOME|" "$HOME/.opencode-agent/config.json"
  warn "API key is still empty! Edit the config file or open Settings in the WebUI."
  warn "Without an API key you can still try the demo mode: provider = \"mock\"."
fi

# 4. Start (skipped when OPENCODE_AGENT_NO_RUN=1, e.g. from install.sh)
if [ "${OPENCODE_AGENT_NO_RUN:-0}" = "1" ]; then
  say "Setup complete (OPENCODE_AGENT_NO_RUN=1) — start the server with: npm start"
  exit 0
fi

say "Checking handset type (optional)…"
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock || true

say "Starting server…"
echo -e "${BOLD}"
echo "  Open on this phone:   http://localhost:3010"
echo "  Open from PC/Laptop:  http://<phone-ip>:3010   (same Wi-Fi)"
echo "  Stop server: Ctrl+C   |  Run again: npm start"
echo -e "${RESET}"

OPENCODE_AGENT_PORT="${OPENCODE_AGENT_PORT:-3010}" node server/index.js
