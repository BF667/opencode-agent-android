import { useState } from "react";
import type { ToolState } from "../lib/types";

const TOOL_META: Record<string, { icon: string; label: string; argKey: string }> = {
  bash: { icon: "⌘", label: "Shell", argKey: "command" },
  read: { icon: "📄", label: "Read", argKey: "path" },
  write: { icon: "✏️", label: "Write", argKey: "path" },
  edit: { icon: "🔧", label: "Edit", argKey: "path" },
  glob: { icon: "🗂", label: "Glob", argKey: "pattern" },
  grep: { icon: "🔍", label: "Grep", argKey: "pattern" },
  todowrite: { icon: "☑️", label: "Todo", argKey: "todos" },
};

export function ToolCard({ tool, state }: { tool: string; state: ToolState }) {
  const [open, setOpen] = useState(false);
  const meta = TOOL_META[tool] || { icon: "🛠", label: tool, argKey: "" };
  const args = (state.input || {}) as Record<string, unknown>;
  const preview =
    typeof args[meta.argKey] === "string"
      ? String(args[meta.argKey]).slice(0, 90)
      : JSON.stringify(args).slice(0, 90);

  const statusDot =
    state.status === "running" ? (
      <span className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-zinc-500 border-t-transparent" />
    ) : state.status === "error" ? (
      <span className="text-red-400">✕</span>
    ) : (
      <span className="text-emerald-400">✓</span>
    );

  return (
    <div className="my-1.5 overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/60">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-zinc-800/40"
        aria-expanded={open}
      >
        {statusDot}
        <span className="font-medium text-zinc-200">{meta.label}</span>
        <code className="min-w-0 flex-1 truncate text-left text-[12px] text-zinc-500">{preview}</code>
        {typeof state.durationMs === "number" && (
          <span className="text-[11px] text-zinc-600">{(state.durationMs / 1000).toFixed(1)}s</span>
        )}
        <span className="text-zinc-600">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="border-t border-zinc-800/80 px-3 py-2">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">Input</div>
          <pre className="mb-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-950 p-2 font-mono text-[11.5px] text-zinc-400">
            {JSON.stringify(args, null, 2)}
          </pre>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">
            {state.status === "error" ? "Error" : "Output"}
          </div>
          <pre
            className={`max-h-64 overflow-auto whitespace-pre-wrap rounded-lg p-2 font-mono text-[11.5px] ${
              state.status === "error" ? "bg-red-950/40 text-red-300" : "bg-zinc-950 text-zinc-400"
            }`}
          >
            {state.status === "error" ? state.error : state.output || "(empty)"}
          </pre>
        </div>
      )}
    </div>
  );
}
