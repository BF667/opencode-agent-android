// Agent loop — ported from opencode packages/ai/src/loop.ts + packages/core/
// src/session/runner. Original drives an Effect runtime; this port is a plain
// async-generator loop with tool-calling rounds, abortable per session.

import { store, newId } from "./store.js";
import { buildTools } from "./tools.js";
import { streamChat } from "./providers.js";

const running = new Map(); // sessionId -> AbortController

export const isRunning = (sessionId) => running.has(sessionId);

export function stopRun(sessionId) {
  const ac = running.get(sessionId);
  if (ac) {
    ac.abort();
    running.delete(sessionId);
    return true;
  }
  return false;
}

const SYSTEM_PROMPT = (cfg) => `You are OpenCode Agent, a careful and concise coding agent running on Android/Termux (Linux, sh shell, ARM).
Working directory: ${cfg.workdir}
You can use tools: bash, read, write, edit, glob, grep, todowrite.
Rules:
- Answer in the same language as the user (default Indonesian if unsure).
- Use tools to inspect the real filesystem before making claims about files.
- Prefer small, verifiable steps; run commands to check your work.
- Keep answers short and practical; show diffs/paths for file changes.
- Paths in tools are relative to the working directory and cannot escape it.`;

// ---------- message -> provider format ----------
function toChatMessages(sessionId) {
  const msgs = [];
  for (const m of store.messages(sessionId)) {
    if (m.role === "user") {
      const text = m.parts.filter((p) => p.type === "text").map((p) => p.text).join("\n");
      msgs.push({ role: "user", content: text || "(empty)" });
    } else if (m.role === "assistant") {
      const text = m.parts
        .filter((p) => p.type === "text")
        .map((p) => p.text)
        .join("\n");
      const toolCalls = m.parts
        .filter((p) => p.type === "tool")
        .map((p) => ({
          id: p.callId,
          type: "function",
          function: { name: p.tool, arguments: JSON.stringify(p.state?.input ?? {}) },
        }));
      if (toolCalls.length) {
        msgs.push({ role: "assistant", content: text || null, tool_calls: toolCalls });
        for (const p of m.parts.filter((p) => p.type === "tool")) {
          msgs.push({
            role: "tool",
            tool_call_id: p.callId,
            content: (p.state?.error || p.state?.output || "(no output)").slice(0, 20_000),
          });
        }
      } else if (text) {
        msgs.push({ role: "assistant", content: text });
      }
    }
  }
  return msgs;
}

function toAnthropicMessages(sessionId) {
  const msgs = [];
  for (const m of store.messages(sessionId)) {
    if (m.role === "user") {
      const text = m.parts.filter((p) => p.type === "text").map((p) => p.text).join("\n");
      msgs.push({ role: "user", content: [{ type: "text", text: text || "(empty)" }] });
    } else if (m.role === "assistant") {
      const blocks = [];
      const text = m.parts.filter((p) => p.type === "text").map((p) => p.text).join("\n");
      if (text) blocks.push({ type: "text", text });
      const toolParts = m.parts.filter((p) => p.type === "tool");
      for (const p of toolParts)
        blocks.push({ type: "tool_use", id: p.callId, name: p.tool, input: p.state?.input ?? {} });
      if (blocks.length) msgs.push({ role: "assistant", content: blocks });
      if (toolParts.length) {
        const results = toolParts.map((p) => ({
          type: "tool_result",
          tool_use_id: p.callId,
          content: (p.state?.error || p.state?.output || "(no output)").slice(0, 20_000),
        }));
        msgs.push({ role: "user", content: results });
      }
    }
  }
  return msgs;
}

const buildMessagesFor = (cfg, sessionId) =>
  cfg.provider === "anthropic"
    ? toAnthropicMessages(sessionId)
    : toChatMessages(sessionId);

// ---------- the loop ----------
/**
 * Run the agent for a session. `emit(event)` receives live events:
 * message-start | text-delta | think-delta | tool-start | tool-end | todo |
 * usage | done | error
 */
export async function runAgent({ sessionId, emit }) {
  const cfg = store.config();
  const tools = buildTools({ workdir: cfg.workdir, session: { id: sessionId }, store });
  const ac = new AbortController();
  running.set(sessionId, ac);
  const signal = ac.signal;

  const assistant = store.appendMessage(sessionId, {
    id: `msg_${newId()}`,
    role: "assistant",
    parts: [],
    createdAt: Date.now(),
  });

  const finalize = () => {
    assistant.finishedAt = Date.now();
    store.replaceLast(sessionId, assistant);
  };

  emit({ type: "message-start", messageId: assistant.id });

  try {
    let rounds = 0;
    const maxRounds = cfg.maxRounds || 24;

    while (rounds < maxRounds) {
      rounds++;
      if (signal.aborted) break;

      const messages = buildMessagesFor(cfg, sessionId);
      const sys = SYSTEM_PROMPT(cfg);

      // pending tool-call accumulation (esp. for anthropic partial JSON)
      const pending = new Map(); // callId -> {id, name, args}

      const handleToolCall = async (call) => {
        const tool = tools.find((t) => t.name === call.tool);
        const part = {
          type: "tool",
          callId: call.id,
          tool: call.tool,
          state: { status: "running", input: call.args },
        };
        assistant.parts.push(part);
        emit({ type: "tool-start", messageId: assistant.id, callId: call.id, tool: call.tool, args: call.args });
        const t0 = Date.now();
        try {
          if (!tool) throw new Error(`Unknown tool: ${call.tool}`);
          const output = await tool.run(call.args, signal);
          part.state = { status: "done", input: call.args, output: String(output).slice(0, 24_000), durationMs: Date.now() - t0 };
        } catch (e) {
          if (signal.aborted) part.state = { status: "error", input: call.args, error: "aborted", durationMs: Date.now() - t0 };
          else part.state = { status: "error", input: call.args, error: String(e.message || e), durationMs: Date.now() - t0 };
        }
        emit({
          type: "tool-end",
          messageId: assistant.id,
          callId: call.id,
          ok: part.state.status === "done",
          state: part.state,
        });
        if (call.tool === "todowrite") {
          emit({ type: "todo", todos: store.todos(sessionId) });
        }
      };

      let emittedToolThisRound = false;
      const events = streamChat({
        cfg,
        messages: cfg.provider === "anthropic" ? messages : [{ role: "system", content: sys }, ...messages],
        tools,
        signal,
      });

      for await (const ev of events) {
        if (signal.aborted) break;
        switch (ev.type) {
          case "text-delta": {
            let part = assistant.parts[assistant.parts.length - 1];
            if (!part || part.type !== "text") {
              part = { type: "text", text: "" };
              assistant.parts.push(part);
            }
            part.text += ev.delta;
            emit({ type: "text-delta", messageId: assistant.id, delta: ev.delta });
            break;
          }
          case "think-delta": {
            let part = assistant.parts[assistant.parts.length - 1];
            if (!part || part.type !== "think") {
              part = { type: "think", text: "" };
              assistant.parts.push(part);
            }
            part.text += ev.delta;
            emit({ type: "think-delta", messageId: assistant.id, delta: ev.delta });
            break;
          }
          case "tool-call": {
            await handleToolCall(ev);
            emittedToolThisRound = true;
            break;
          }
          case "tool-call-pending": {
            pending.set(ev.id, { id: ev.id, name: ev.name, args: "" });
            break;
          }
          case "tool-args-delta": {
            const last = [...pending.values()].pop();
            if (last) last.args += ev.delta;
            break;
          }
          case "tool-call-flush": {
            const last = [...pending.values()].pop();
            if (last) {
              let parsed = {};
              try {
                parsed = JSON.parse(last.args || "{}");
              } catch {}
              await handleToolCall({ id: last.id, tool: last.name, args: parsed });
              pending.delete(last.id);
              emittedToolThisRound = true;
            }
            break;
          }
          case "usage": {
            assistant.usage = { input: (assistant.usage?.input || 0) + ev.input, output: (assistant.usage?.output || 0) + ev.output };
            emit({ type: "usage", ...assistant.usage });
            break;
          }
          default:
            break;
        }
      }

      finalize();

      if (!emittedToolThisRound) break; // pure text answer => done
      // else loop again so the model can react to tool results
    }

    emit({ type: "done", reason: signal.aborted ? "aborted" : "completed" });
  } catch (e) {
    if (signal.aborted) emit({ type: "done", reason: "aborted" });
    else {
      emit({ type: "error", message: String(e.message || e) });
      const part = { type: "text", text: `\n\n⚠️ ${e.message || e}` };
      assistant.parts.push(part);
      finalize();
    }
  } finally {
    running.delete(sessionId);
    finalize();
  }
}

export { store };
