#!/data/data/com.termux/files/usr/bin/bash
# install.sh — one-liner installer for OpenCode Agent (Termux Edition)
#
# Usage (inside Termux):
#   curl -fsSL https://raw.githubusercontent.com/BF667/opencode-agent-android/main/install.sh | bash
#
# What it does:
#   1. Installs git + nodejs-lts via pkg (Termux only)
#   2. Clones this repo to ~/opencode-agent
#   3. Runs setup-termux.sh (installs deps, builds WebUI, creates config)
#   4. Installs the `ocagent` launcher command (start/stop/restart/status)
#
# After install, run:  ocagent start

set -e

BOLD='\033[1m'; DIM='\033[2m'; GREEN='\033[32m'; YELLOW='\033[33m'; RED='\033[31m'; RESET='\033[0m'
say()   { echo -e "${GREEN}▸${RESET} $1"; }
warn()  { echo -e "${YELLOW}▸${RESET} $1"; }
die()   { echo -e "${RED}✗${RESET} $1"; exit 1; }

REPO_URL="https://github.com/BF667/opencode-agent-android.git"
INSTALL_DIR="$HOME/opencode-agent"

echo -e "${BOLD}"
cat <<'LOGO'
  ┌──────────────────────────────────────────────────┐
  │   OpenCode Agent — Termux one-line installer     │
  │   agent package · vite webui · no TUI            │
  └──────────────────────────────────────────────────┘
LOGO
echo -e "${RESET}"

# ---------- 0. Environment check ----------
if command -v pkg >/dev/null 2>&1 && [ -n "${TERMUX_VERSION:-}" ] && [ -d "/data/data/com.termux" ]; then
  say "Termux detected ✓"
elif command -v pkg >/dev/null 2>&1; then
  say "pkg available — assuming Termux ✓"
else
  warn "pkg not found — this installer targets Android/Termux."
  if command -v apt-get >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then
    warn "Linux + Node.js detected — continuing with system node (best effort)."
  else
    die "Install Termux from F-Droid first: https://f-droid.org/packages/com.termux"
  fi
fi

# ---------- 1. Base packages ----------
say "Installing git + nodejs-lts…"
if command -v pkg >/dev/null 2>&1; then
  pkg update -y >/dev/null 2>&1 || true
  pkg install -y git nodejs-lts || die "pkg install failed — check your internet connection"
else
  command -v git >/dev/null 2>&1 || die "git is required"
  command -v node >/dev/null 2>&1 || die "Node.js >= 18 is required"
fi

command -v node >/dev/null 2>&1 || die "node not found after install"
node -v
say "Node $(node -v) ready."

# ---------- 2. Clone / update the repo ----------
if [ -d "$INSTALL_DIR/.git" ]; then
  say "Existing installation found at $INSTALL_DIR — updating…"
  git -C "$INSTALL_DIR" pull --ff-only || warn "git pull failed, keeping local copy"
else
  if [ -d "$INSTALL_DIR" ]; then
    warn "$INSTALL_DIR exists but is not a git repo — removing it."
    rm -rf "$INSTALL_DIR"
  fi
  say "Cloning $REPO_URL → $INSTALL_DIR"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR" || die "git clone failed — check your internet connection"
fi

# ---------- 3. Run in-repo setup (deps + build + config) ----------
say "Running setup-termux.sh (installs WebUI deps, builds if needed, creates config)…"
cd "$INSTALL_DIR"
OPENCODE_AGENT_NO_RUN=1 bash setup-termux.sh || die "setup failed — see the output above"

# ---------- 4. Install the `ocagent` launcher ----------
say "Installing the ocagent launcher command…"
if [ -n "${TERMUX_VERSION:-}" ] && [ -d "/data/data/com.termux" ] && [ -w "${PREFIX:-}" ]; then
  BIN_DIR="$PREFIX/bin"
  SHEBANG="#!/data/data/com.termux/files/usr/bin/bash"
else
  BIN_DIR="$HOME/.local/bin"
  SHEBANG="#!/usr/bin/env bash"
fi
mkdir -p "$BIN_DIR"

{
  echo "$SHEBANG"
  cat <<'LAUNCHER'
# ocagent — manage the OpenCode Agent server
DIR="$HOME/opencode-agent"
PIDFILE="$DIR/.server.pid"
PORT="${OPENCODE_AGENT_PORT:-3010}"

pid() { [ -f "$PIDFILE" ] && cat "$PIDFILE" 2>/dev/null || true; }

ip() {
  ifconfig 2>/dev/null | awk '/inet (192|10|172)/{print $2; exit}' \
    || hostname -I 2>/dev/null | awk '{print $1}' \
    || echo "<phone-ip>"
}

status() {
  P="$(pid)"
  if [ -n "$P" ] && kill -0 "$P" 2>/dev/null; then
    echo "● running (pid $P) — http://localhost:$PORT"
  else
    echo "○ stopped — start it with: ocagent start"
  fi
}

start() {
  P="$(pid)"
  if [ -n "$P" ] && kill -0 "$P" 2>/dev/null; then
    echo "Already running (pid $P) — http://localhost:$PORT"
    return
  fi
  command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock || true
  cd "$DIR" || exit 1
  nohup node server/index.js > "$DIR/server.log" 2>&1 &
  echo $! > "$PIDFILE"
  sleep 1
  if kill -0 "$(pid)" 2>/dev/null; then
    echo "● started (pid $(pid)) — http://localhost:$PORT"
    echo "  open from PC on same Wi-Fi: http://$(ip):$PORT"
    echo "  logs: ocagent log | stop: ocagent stop"
  else
    echo "✗ failed to start — check: ocagent log"
  fi
}

stop() {
  P="$(pid)"
  if [ -n "$P" ] && kill -0 "$P" 2>/dev/null; then
    kill "$P" && rm -f "$PIDFILE"
    echo "○ stopped"
  else
    echo "Not running."
  fi
}

case "${1:-}" in
  start)   start ;;
  stop)    stop ;;
  restart) stop; sleep 1; start ;;
  status)  status ;;
  log)     tail -n 30 -f "$DIR/server.log" 2>/dev/null || echo "No log yet." ;;
  *)       echo "usage: ocagent {start|stop|restart|status|log}" ;;
esac
LAUNCHER
} > "$BIN_DIR/ocagent"
chmod +x "$BIN_DIR/ocagent"
say "ocagent installed ✓ ($BIN_DIR/ocagent)"

# ---------- Done ----------
echo -e "${BOLD}"
cat <<'DONE'

  Installation complete 🎉

  Start the agent:        ocagent start
  Open on this phone:     http://localhost:3010
  Open from PC (Wi-Fi):   http://<phone-ip>:3010
  Manage:                 ocagent {start|stop|restart|status|log}

  Configure provider:     WebUI → ⚙ Settings
  Demo without API key:   provider = "mock"
DONE
echo -e "${RESET}"
