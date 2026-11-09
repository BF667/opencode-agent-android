// Session storage — ported from opencode packages/core/src/session + storage.
// Original uses Bun + Effect + drizzle/SQLite; this port uses zero-dependency
// JSONL append-only files so it runs on plain Node inside Termux.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function dataHome() {
  if (process.env.OPENCODE_AGENT_HOME) return process.env.OPENCODE_AGENT_HOME;
  return path.join(process.env.HOME || process.cwd(), ".opencode-agent");
}

const now = () => Date.now();
const id = () => crypto.randomBytes(8).toString("hex") + crypto.randomBytes(4).toString("hex");

class Store {
  constructor() {
    this.root = dataHome();
    this.storageDir = path.join(this.root, "storage");
    this.sessionDir = path.join(this.storageDir, "session");
    this.indexFile = path.join(this.storageDir, "sessions.json");
    this.configFile = path.join(this.root, "config.json");
    fs.mkdirSync(this.sessionDir, { recursive: true });
    this._index = null;
  }

  // ---------- config ----------
  defaults() {
    return {
      provider: "openai-compatible", // openai-compatible | anthropic | mock
      baseUrl: "https://api.z.ai/api/paas/v4",
      apiKey: "",
      model: "glm-4.6",
      workdir: process.env.HOME || process.cwd(),
      maxRounds: 24,
      title: "OpenCode Agent (Termux)",
    };
  }

  envOverrides(cfg) {
    const env = process.env;
    const out = { ...cfg };
    if (env.OPENCODE_AGENT_PROVIDER) out.provider = env.OPENCODE_AGENT_PROVIDER;
    if (env.OPENCODE_AGENT_BASE_URL) out.baseUrl = env.OPENCODE_AGENT_BASE_URL;
    if (env.OPENCODE_AGENT_API_KEY) out.apiKey = env.OPENCODE_AGENT_API_KEY;
    if (env.OPENCODE_AGENT_MODEL) out.model = env.OPENCODE_AGENT_MODEL;
    if (env.OPENCODE_AGENT_WORKDIR) out.workdir = env.OPENCODE_AGENT_WORKDIR;
    return out;
  }

  config() {
    let cfg = this.defaults();
    try {
      cfg = { ...cfg, ...JSON.parse(fs.readFileSync(this.configFile, "utf8")) };
    } catch {}
    cfg = this.envOverrides(cfg);
    return cfg;
  }

  saveConfig(patch) {
    const cur = (() => {
      try {
        return { ...this.defaults(), ...JSON.parse(fs.readFileSync(this.configFile, "utf8")) };
      } catch {
        return this.defaults();
      }
    })();
    const next = { ...cur, ...patch };
    fs.writeFileSync(this.configFile, JSON.stringify(next, null, 2));
    return this.config();
  }

  // ---------- session index ----------
  _sessions() {
    if (!this._index) {
      try {
        this._index = JSON.parse(fs.readFileSync(this.indexFile, "utf8"));
      } catch {
        this._index = { sessions: [] };
      }
    }
    return this._index;
  }

  _flush() {
    fs.writeFileSync(this.indexFile, JSON.stringify(this._index, null, 2));
  }

  listSessions() {
    return this._sessions().sessions.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  }

  createSession(title) {
    const s = {
      id: `ses_${id()}`,
      title: title || "New session",
      createdAt: now(),
      updatedAt: now(),
    };
    this._sessions().sessions.unshift(s);
    this._flush();
    return s;
  }

  getSession(id) {
    return this._sessions().sessions.find((s) => s.id === id);
  }

  touchSession(id, patch = {}) {
    const s = this.getSession(id);
    if (!s) return undefined;
    Object.assign(s, patch, { updatedAt: now() });
    this._flush();
    return s;
  }

  deleteSession(id) {
    const i = this._sessions().sessions.findIndex((s) => s.id === id);
    if (i < 0) return false;
    this._sessions().sessions.splice(i, 1);
    this._flush();
    fs.rmSync(path.join(this.sessionDir, `${id}.jsonl`), { force: true });
    fs.rmSync(path.join(this.sessionDir, `${id}.todos.json`), { force: true });
    return true;
  }

  // ---------- messages (JSONL parts, opencode-style) ----------
  fileOf(sessionId) {
    return path.join(this.sessionDir, `${sessionId}.jsonl`);
  }

  messages(sessionId) {
    try {
      return fs
        .readFileSync(this.fileOf(sessionId), "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l));
    } catch {
      return [];
    }
  }

  appendMessage(sessionId, msg) {
    fs.appendFileSync(this.fileOf(sessionId), JSON.stringify(msg) + "\n");
    this.touchSession(sessionId);
    return msg;
  }

  replaceLast(sessionId, msg) {
    // used to persist the finalized assistant message after streaming
    const lines = (() => {
      try {
        return fs.readFileSync(this.fileOf(sessionId), "utf8").split("\n").filter(Boolean);
      } catch {
        return [];
      }
    })();
    const parsed = lines.map((l) => JSON.parse(l));
    const idx = parsed.findIndex((m) => m.id === msg.id);
    if (idx >= 0) parsed[idx] = msg;
    else parsed.push(msg);
    fs.writeFileSync(this.fileOf(sessionId), parsed.map((m) => JSON.stringify(m)).join("\n") + "\n");
  }

  removeMessage(sessionId, messageId) {
    const lines = fs.readFileSync(this.fileOf(sessionId), "utf8").split("\n").filter(Boolean);
    const parsed = lines.map((l) => JSON.parse(l)).filter((m) => m.id !== messageId);
    fs.writeFileSync(this.fileOf(sessionId), parsed.map((m) => JSON.stringify(m)).join("\n") + "\n");
  }

  // ---------- todos ----------
  todos(sessionId) {
    try {
      return JSON.parse(fs.readFileSync(path.join(this.sessionDir, `${sessionId}.todos.json`), "utf8"));
    } catch {
      return [];
    }
  }

  saveTodos(sessionId, todos) {
    fs.writeFileSync(
      path.join(this.sessionDir, `${sessionId}.todos.json`),
      JSON.stringify(todos, null, 2),
    );
    this.touchSession(sessionId);
  }
}

export const store = new Store();
export { id as newId };
