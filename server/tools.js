// Tools — ported from opencode packages/core/src/tool (bash/read/write/edit/glob/
// grep/todowrite). Original uses Bun APIs and Effect; here it is plain Node with
// child_process, zero native deps (Termux-safe). Path access is confined to the
// session workdir by default, mirroring opencode's filesystem guards.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";

function withinRoot(root, p) {
  const abs = path.resolve(root, p);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error(`Path escapes workdir: ${p}`);
  }
  return abs;
}

async function walk(root, dir, out, depth = 0) {
  if (depth > 12 || out.length > 4000) return;
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (["node_modules", ".git", "dist", ".cache"].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    out.push(e.isDirectory() ? full + "/" : full);
    if (e.isDirectory()) await walk(root, full, out, depth + 1);
  }
}

/** Translate a small glob subset (* ? **) to regex. */
function globToRegex(pattern) {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        re += ".*";
        i++;
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp("^" + re + "$");
}

const JSON_SCHEMA = (props, required = []) => ({
  type: "object",
  properties: props,
  required,
});

export function buildTools({ workdir, session, store }) {
  const root = path.resolve(workdir);

  const tools = [
    {
      name: "bash",
      description:
        "Run a shell command inside the session working directory (Termux shell: sh). Use for ls, git, npm, pip, etc. Timeout 120s.",
      parameters: JSON_SCHEMA({ command: { type: "string" } }, ["command"]),
      async run({ command }) {
        return new Promise((resolve, reject) => {
          exec(command, { cwd: root, timeout: 120_000, maxBuffer: 2 * 1024 * 1024, shell: "/bin/sh" }, (err, stdout, stderr) => {
            const out =
              (stdout ? String(stdout) : "") +
              (stderr ? "\n[stderr]\n" + String(stderr) : "");
            if (err && !out.trim()) return reject(new Error(err.message));
            resolve((out || "(no output)").slice(0, 24_000) + (err ? `\n[exit: ${err.code}]` : ""));
          });
        });
      },
    },
    {
      name: "read",
      description: "Read a text file relative to the working directory. Returns numbered lines.",
      parameters: JSON_SCHEMA(
        { path: { type: "string" }, offset: { type: "number" }, limit: { type: "number" } },
        ["path"],
      ),
      async run({ path: p, offset = 1, limit = 250 }) {
        const abs = withinRoot(root, p);
        const content = await fsp.readFile(abs, "utf8");
        const lines = content.split("\n");
        const start = Math.max(1, offset);
        const end = Math.min(lines.length, start + limit - 1);
        const body = lines
          .slice(start - 1, end)
          .map((l, i) => `${String(start + i).padStart(5)}  ${l}`)
          .join("\n");
        return `File: ${p} (${lines.length} lines)\n${body}`;
      },
    },
    {
      name: "write",
      description: "Create or overwrite a file with the given content (parent dirs auto-created).",
      parameters: JSON_SCHEMA({ path: { type: "string" }, content: { type: "string" } }, [
        "path",
        "content",
      ]),
      async run({ path: p, content }) {
        const abs = withinRoot(root, p);
        await fsp.mkdir(path.dirname(abs), { recursive: true });
        await fsp.writeFile(abs, content);
        return `Wrote ${p} (${Buffer.byteLength(content)} bytes)`;
      },
    },
    {
      name: "edit",
      description: "Replace an exact string in an existing file. old_string must match exactly and be unique.",
      parameters: JSON_SCHEMA(
        { path: { type: "string" }, old_string: { type: "string" }, new_string: { type: "string" } },
        ["path", "old_string", "new_string"],
      ),
      async run({ path: p, old_string, new_string }) {
        const abs = withinRoot(root, p);
        const content = await fsp.readFile(abs, "utf8");
        const count = content.split(old_string).length - 1;
        if (count === 0) throw new Error("old_string not found in file");
        if (count > 1) throw new Error(`old_string matches ${count} times; make it unique`);
        await fsp.writeFile(abs, content.replace(old_string, new_string));
        return `Edited ${p}`;
      },
    },
    {
      name: "glob",
      description: "Find files by glob pattern relative to the working directory, e.g. src/**/*.ts",
      parameters: JSON_SCHEMA({ pattern: { type: "string" } }, ["pattern"]),
      async run({ pattern }) {
        const files = [];
        await walk(root, root, files);
        const re = globToRegex(pattern.replace(/^\.\//, ""));
        const hits = files.filter((f) => re.test(f.replace(root + "/", ""))).slice(0, 200);
        return hits.length ? hits.join("\n") : "No matches";
      },
    },
    {
      name: "grep",
      description: "Search file contents with a case-insensitive regex. Returns file:line matches.",
      parameters: JSON_SCHEMA({ pattern: { type: "string" }, path: { type: "string" } }, [
        "pattern",
      ]),
      async run({ pattern, path: base = "." }) {
        const baseAbs = withinRoot(root, base);
        const files = [];
        await walk(root, baseAbs, files);
        const re = new RegExp(pattern, "i");
        const results = [];
        for (const f of files.filter((f) => !f.endsWith("/")).slice(0, 2000)) {
          if (f.split(".").pop().length > 5) continue;
          try {
            const content = fs.readFileSync(f, "utf8");
            const lines = content.split("\n");
            for (let i = 0; i < lines.length; i++) {
              if (re.test(lines[i])) {
                results.push(`${f.replace(root + "/", "")}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
                if (results.length >= 120) return results.join("\n");
              }
            }
          } catch {}
        }
        return results.length ? results.join("\n") : "No matches";
      },
    },
    {
      name: "todowrite",
      description: "Maintain a task checklist for the current session. Provide the full list each time.",
      parameters: JSON_SCHEMA(
        {
          todos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                content: { type: "string" },
                status: { type: "string", enum: ["pending", "in_progress", "completed"] },
              },
              required: ["id", "content", "status"],
            },
          },
        },
        ["todos"],
      ),
      async run({ todos }) {
        store.saveTodos(session.id, todos);
        return `Saved ${todos.length} todos`;
      },
      meta: true,
    },
  ];

  return tools;
}

export const toolSchemas = (tools) =>
  tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
