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
  pkg install -y nodejs-lts git || { warn "pkg install gagal, cek koneksiinternet"; exit 1; }
else
  warn "pkg tidak ditemukan — diasumsikan bukan Termux, pakai node sistem."
  command -v node >/dev/null || { echo "Node.js >= 18 wajib terinstall"; exit 1; }
fi

node -v
say "Node $(node -v) siap."

# 2. Build WebUI (skip kalau dist bawaan masih ada)
if [ -f web/dist/index.html ]; then
  say "WebUI bawaan ditemukan — skip build. (hapus web/dist/ untuk rebuild)"
else
  say "Install dependensi WebUI + build (sekali saja, ~1-2 menit)…"
  npm install --prefix web --no-audit --no-fund
  npm --prefix web run build
fi

# 3. Config awal
if [ ! -f "$HOME/.opencode-agent/config.json" ]; then
  say "Buat konfigurasi awal di $HOME/.opencode-agent/config.json"
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
  warn "API key masih kosong! Edit file config atau buka Settings di WebUI."
  warn "Tanpa API key, kamu tetap bisa coba mode demo: provider = \"mock\"."
fi

# 4. Start
say "Cek tipe handset (opsional)…"
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock || true

say "Menjalankan server…"
echo -e "${BOLD}"
echo "  Buka di browser HP:   http://localhost:3010"
echo "  Buka dari PC/Laptop:  http://<ip-hp>:3010   (Wi-Fi sama)"
echo "  Stop server: Ctrl+C   |  Lari lagi: npm start"
echo -e "${RESET}"

OPENCODE_AGENT_PORT="${OPENCODE_AGENT_PORT:-3010}" node server/index.js
