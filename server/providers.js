// LLM providers — ported from opencode packages/ai/src/providers (Effect-based)
// to plain Node streaming. Supports any OpenAI-compatible endpoint (Z.ai GLM,
// OpenRouter, DeepSeek, Ollama, ...) and Anthropic native. Plus a mock provider
// used for offline demo / self-testing on Termux without an API key.

const MOCK_SCRIPT = [
  { kind: "text", value: "Alright, let me take a look at the working directory first. 📱 *(Demo/mock mode — no real API calls)*" },
  { kind: "tool", tool: "bash", args: { command: "ls -la" } },
];
// Final text is sent only in the second round (once the tool result is in history)
const MOCK_FINAL =
  "That is the content of your working directory. To use a real model, open **Settings** (the gear icon in the sidebar) and fill in:\n\n- **Base URL** — Z.ai example: `https://api.z.ai/api/paas/v4`\n- **Model** — example: `glm-4.6`\n- **API Key** from your provider's dashboard\n\nAnything else you want me to do?";

function sseLine(line) {
  return line.startsWith("data:") ? line.slice(5).trim() : null;
}

async function* openaiStream(cfg, body, signal) {
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Provider HTTP ${res.status}: ${text.slice(0, 800)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const toolCalls = new Map(); // index -> {id, name, args}
  while (true) {
    const { done, value } = reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      const payload = sseLine(line.trim());
      if (!payload || payload === "[DONE]") continue;
      let json;
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }
      const delta = json.choices?.[0]?.delta || {};
      if (json.usage) {
        yield {
          type: "usage",
          input: json.usage.prompt_tokens || 0,
          output: json.usage.completion_tokens || 0,
        };
      }
      if (delta.content) yield { type: "text-delta", delta: delta.content };
      if (delta.reasoning_content) yield { type: "think-delta", delta: delta.reasoning_content };
      for (const tc of delta.tool_calls || []) {
        const i = tc.index ?? 0;
        const cur = toolCalls.get(i) || { id: tc.id || `call_${i}`, name: "", args: "" };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name = tc.function.name;
        if (tc.function?.arguments) cur.args += tc.function.arguments;
        toolCalls.set(i, cur);
      }
      if (json.choices?.[0]?.finish_reason) {
        for (const [, tc] of toolCalls) {
          let parsed = {};
          try {
            parsed = JSON.parse(tc.args || "{}");
          } catch {}
          yield { type: "tool-call", id: tc.id, tool: tc.name, args: parsed };
        }
      }
    }
  }
}

async function* anthropicStream(cfg, body, signal) {
  const base = cfg.baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
  const res = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ ...body, stream: true, max_tokens: body.max_tokens || 8192 }),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Provider HTTP ${res.status}: ${text.slice(0, 800)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      const payload = sseLine(line.trim());
      if (!payload) continue;
      let json;
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }
      if (json.type === "content_block_start" && json.content_block?.type === "tool_use") {
        yield {
          type: "tool-call-pending",
          id: json.content_block.id,
          name: json.content_block.name,
        };
      }
      if (json.type === "content_block_delta") {
        if (json.delta?.type === "text_delta") yield { type: "text-delta", delta: json.delta.text };
        if (json.delta?.type === "thinking_delta")
          yield { type: "think-delta", delta: json.delta.thinking };
        if (json.delta?.type === "input_json_delta")
          yield { type: "tool-args-delta", delta: json.delta.partial_json };
      }
      if (json.type === "content_block_stop") yield { type: "tool-call-flush" };
      if (json.type === "usage" || (json.message && json.message.usage)) {
        const u = json.message?.usage || json.usage || {};
        if (u.input_tokens || u.output_tokens)
          yield { type: "usage", input: u.input_tokens || 0, output: u.output_tokens || 0 };
      }
      if (json.type === "error") throw new Error(json.error?.message || "anthropic stream error");
    }
  }
}

async function* mockStream(cfg, body, signal) {
  // If a tool result already exists in history (second round+), reply with the
  // final text only so the loop stops — mirroring real provider behavior.
  const hasToolResult = (body.messages || []).some((m) => m.role === "tool");
  const script = hasToolResult
    ? [{ kind: "text", value: MOCK_FINAL }]
    : MOCK_SCRIPT;
  for (const step of script) {
    if (signal?.aborted) return;
    if (step.kind === "text") {
      for (const chunk of step.value.match(/.{1,24}/gs) || []) {
        yield { type: "text-delta", delta: chunk };
        await new Promise((r) => setTimeout(r, 12));
      }
    } else if (step.kind === "tool") {
      yield { type: "tool-call", id: `mock_${Math.random().toString(36).slice(2, 8)}`, tool: step.tool, args: step.args };
    }
  }
}

/** Unified streaming entry. Yields provider events; agent.js normalizes them. */
export function streamChat({ cfg, messages, tools, signal }) {
  const body = {
    model: cfg.model,
    messages,
    tools: tools.length
      ? tools.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.parameters },
        }))
      : undefined,
    temperature: 0.7,
  };
  if (cfg.provider === "anthropic") return anthropicStream(cfg, body, signal);
  if (cfg.provider === "mock") return mockStream(cfg, body, signal);
  return openaiStream(cfg, body, signal);
}
