// HTTP server + REST/SSE API — replaces opencode's packages/server (Hono) with a
// zero-dependency Node http server, and packages/tui (terminal UI) with the
// bundled Vite WebUI. Single port serves both API and built frontend, ideal for
// Termux (one process, no reverse proxy).

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { store, newId } from "./store.js";
import { runAgent, stopRun, isRunning } from "./agent.js";
import { exec } from "node:child_process";
import os from "node:os";

const PORT = Number(process.env.OPENCODE_AGENT_PORT || process.env.PORT || 3010);
const HOST = process.env.OPENCODE_AGENT_HOST || "0.0.0.0";
const WEB_DIST = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "web",
  "dist",
);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function sseInit(res) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  res.write(":ok\n\n");
}

function serveStatic(req, res, urlPath) {
  let file = path.join(WEB_DIST, urlPath === "/" ? "index.html" : urlPath);
  if (!file.startsWith(WEB_DIST)) return json(res, 403, { error: "forbidden" });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(WEB_DIST, "index.html"); // SPA fallback
  }
  if (!fs.existsSync(file)) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(
      `<!doctype html><html><head><meta charset="utf-8"><title>OpenCode Agent</title></head>
<body style="background:#0a0a0a;color:#e5e5e5;font-family:system-ui;padding:40px">
<h1>WebUI belum di-build</h1><p>Jalankan: <code>npm run setup</code> lalu restart server.</p></body></html>`,
    );
  }
  const ext = path.extname(file);
  res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

// ---------- termux helpers ----------
function isTermux() {
  return Boolean(process.env.TERMUX_VERSION) || (process.env.PREFIX || "").includes("com.termux");
}

function safeExec(command, cwd, cb) {
  exec(command, { cwd, timeout: 120_000, maxBuffer: 1024 * 1024, shell: "/bin/sh" }, cb);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  const cfg = store.config();

  // CORS for dev (vite dev server on :5173 proxies /api anyway)
  if (p.startsWith("/api/")) {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-methods", "GET,POST,DELETE,OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");
    if (req.method === "OPTIONS") return res.end();
  }

  try {
    // ----- health / meta -----
    if (p === "/api/health") {
      return json(res, 200, {
        ok: true,
        version: "1.0.0",
        termux: isTermux(),
        node: process.version,
        platform: `${os.platform()}/${os.arch()}`,
        running: [...isRunningSessions()],
      });
    }

    // ----- config -----
    if (p === "/api/config" && req.method === "GET") {
      return json(res, 200, {
        provider: cfg.provider,
        baseUrl: cfg.baseUrl,
        model: cfg.model,
        workdir: cfg.workdir,
        hasKey: Boolean(cfg.apiKey),
        termux: isTermux(),
      });
    }
    if (p === "/api/config" && req.method === "POST") {
      const body = await readBody(req);
      const patch = {};
      for (const k of ["provider", "baseUrl", "model", "workdir", "apiKey"]) {
        if (typeof body[k] === "string" && body[k] !== "") patch[k] = body[k];
        if (k === "apiKey" && typeof body[k] === "string") patch[k] = body[k]; // may be "" to keep
      }
      if (patch.apiKey === "") delete patch.apiKey;
      const next = store.saveConfig(patch);
      return json(res, 200, {
        provider: next.provider,
        baseUrl: next.baseUrl,
        model: next.model,
        workdir: next.workdir,
        hasKey: Boolean(next.apiKey),
      });
    }

    // ----- sessions -----
    if (p === "/api/sessions" && req.method === "GET") {
      return json(res, 200, { sessions: store.listSessions() });
    }
    if (p === "/api/sessions" && req.method === "POST") {
      const body = await readBody(req);
      const s = store.createSession((body.title || "").slice(0, 80) || undefined);
      return json(res, 200, { session: s });
    }

    let m = p.match(/^\/api\/sessions\/([^/]+)(\/.*)?$/);
    if (m) {
      const [, sid, action = ""] = m;
      const s = store.getSession(sid);
      if (!s) return json(res, 404, { error: "session not found" });

      if (action === "" && req.method === "GET") {
        return json(res, 200, {
          session: s,
          messages: store.messages(sid),
          todos: store.todos(sid),
          running: isRunning(sid),
        });
      }
      if (action === "" && req.method === "DELETE") {
        stopRun(sid);
        store.deleteSession(sid);
        return json(res, 200, { ok: true });
      }
      if (action === "/title" && req.method === "POST") {
        const body = await readBody(req);
        store.touchSession(sid, { title: (body.title || "").slice(0, 80) || s.title });
        return json(res, 200, { ok: true });
      }
      if (action === "/run" && req.method === "POST") {
        if (isRunning(sid)) return json(res, 409, { error: "session is busy" });
        const body = await readBody(req);
        const text = String(body.text || "").slice(0, 32_000);
        if (!text.trim()) return json(res, 400, { error: "empty message" });
        if (!store.messages(sid).length) store.touchSession(sid, { title: text.slice(0, 48) });
        store.appendMessage(sid, {
          id: `msg_${newId()}`,
          role: "user",
          parts: [{ type: "text", text }],
          createdAt: Date.now(),
        });

        sseInit(res);
        const send = (event) => {
          try {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
          } catch {}
        };
        // replay the user's message first so the client renders it
        send({
          type: "user-message",
          message: store.messages(sid).filter((x) => x.role === "user").slice(-1)[0],
        });
        await runAgent({ sessionId: sid, emit: send });
        return res.end();
      }
      if (action === "/stop" && req.method === "POST") {
        return json(res, 200, { stopped: stopRun(sid) });
      }
      if (action === "/messages" && req.method === "GET") {
        return json(res, 200, { messages: store.messages(sid) });
      }
    }

    // ----- quick terminal (Z.ai-like side panel) -----
    if (p === "/api/exec" && req.method === "POST") {
      const body = await readBody(req);
      const cwd = String(body.cwd || cfg.workdir);
      safeExec(String(body.command || "").slice(0, 2000), cwd, (err, stdout, stderr) => {
        json(res, 200, {
          ok: !err || Boolean(stdout || stderr),
          output:
            (stdout ? String(stdout) : "") +
            (stderr ? (stdout ? "\n" : "") + String(stderr) : "") +
            (err && err.code && !stdout && !stderr ? `\n[exit ${err.code}]` : ""),
        });
      });
      return;
    }

    // ----- workspace file tree -----
    if (p === "/api/files" && req.method === "GET") {
      const root = path.resolve(cfg.workdir);
      const dirParam = url.searchParams.get("dir") || "";
      const target = path.resolve(root, dirParam);
      if (target !== root && !target.startsWith(root + path.sep))
        return json(res, 403, { error: "forbidden" });
      try {
        const entries = fs
          .readdirSync(target, { withFileTypes: true })
          .filter((e) => !["node_modules", ".git", "dist"].includes(e.name))
          .slice(0, 300)
          .map((e) => ({
            name: e.name,
            dir: e.isDirectory(),
            path: path.relative(root, path.join(target, e.name)),
          }))
          .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
        return json(res, 200, { root, cwd: target, entries });
      } catch (e) {
        return json(res, 400, { error: e.message });
      }
    }

    // ----- read single file (for workspace viewer) -----
    if (p === "/api/file" && req.method === "GET") {
      const root = path.resolve(cfg.workdir);
      const file = url.searchParams.get("path") || "";
      const target = path.resolve(root, file);
      if (target !== root && !target.startsWith(root + path.sep))
        return json(res, 403, { error: "forbidden" });
      try {
        const stat = fs.statSync(target);
        if (stat.size > 200_000) return json(res, 200, { path: file, content: "(file too large to preview)", truncated: true });
        return json(res, 200, { path: file, content: fs.readFileSync(target, "utf8"), truncated: false });
      } catch (e) {
        return json(res, 400, { error: e.message });
      }
    }

    if (p.startsWith("/api/")) return json(res, 404, { error: "not found" });

    // ----- static WebUI -----
    serveStatic(req, res, p);
  } catch (e) {
    try {
      json(res, 500, { error: String(e.message || e) });
    } catch {}
  }
});

function* isRunningSessions() {}

server.listen(PORT, HOST, () => {
  const cfg = store.config();
  console.log(`
  ┌─────────────────────────────────────────────────┐
  │  OpenCode Agent — Termux Edition                │
  └─────────────────────────────────────────────────┘
  WebUI      : http://localhost:${PORT}
  LAN access : http://<phone-ip>:${PORT}   (same Wi-Fi)
  Provider   : ${cfg.provider}
  Model      : ${cfg.model}
  Workdir    : ${cfg.workdir}
  Termux     : ${isTermux() ? "yes" : "no (generic Linux)"}
  Storage    : ${store.root}
`);
});
