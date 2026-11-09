import { useState } from "react";
import type { Session, Todo } from "../lib/types";

export function Sidebar({
  sessions,
  activeId,
  todos,
  config,
  onSelect,
  onNew,
  onDelete,
  onOpenSettings,
  onToggleWorkspace,
  workspaceOpen,
  onClose,
}: {
  sessions: Session[];
  activeId: string | null;
  todos: Todo[];
  config: { model: string; workdir: string; provider: string } | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
  onToggleWorkspace: () => void;
  workspaceOpen: boolean;
  onClose?: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = sessions.filter((s) => s.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-zinc-800/70 bg-[#0d0d0f]">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[13px] font-bold text-black">
          O
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-zinc-100">OpenCode Agent</div>
          <div className="truncate text-[10.5px] text-zinc-500">Termux Edition</div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 lg:hidden"
            aria-label="Close sidebar"
          >
            ✕
          </button>
        )}
      </div>

      <div className="px-3 pt-1">
        <button
          onClick={onNew}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-[13px] font-medium text-black transition hover:bg-zinc-200 active:scale-[0.98]"
        >
          <span className="text-[15px] leading-none">＋</span> New chat
        </button>
        <div className="mt-2 flex gap-2">
          <button
            onClick={onToggleWorkspace}
            className={`flex-1 rounded-lg border px-2 py-1.5 text-[12px] transition ${
              workspaceOpen
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-zinc-800 text-zinc-400 hover:bg-zinc-800/50"
            }`}
          >
            Workspace
          </button>
          <button
            onClick={onOpenSettings}
            className="flex-1 rounded-lg border border-zinc-800 px-2 py-1.5 text-[12px] text-zinc-400 transition hover:bg-zinc-800/50"
          >
            ⚙ Settings
          </button>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search sessions…"
          className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-1.5 text-[12.5px] text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-600"
        />
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <div className="px-2 py-1 text-[10.5px] font-medium uppercase tracking-wider text-zinc-600">
          Sessions
        </div>
        {filtered.map((s) => (
          <div
            key={s.id}
            className={`group flex items-center gap-1 rounded-lg px-2 py-2 text-[13px] ${
              s.id === activeId ? "bg-zinc-800/80 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/40"
            }`}
          >
            <button
              onClick={() => onSelect(s.id)}
              className="min-w-0 flex-1 truncate text-left"
              title={s.title}
            >
              {s.title}
            </button>
            <button
              onClick={() => onDelete(s.id)}
              className="opacity-0 transition group-hover:opacity-100 rounded p-1 text-zinc-500 hover:text-red-400"
              aria-label={`Delete session ${s.title}`}
            >
              🗑
            </button>
          </div>
        ))}
        {!filtered.length && (
          <div className="px-2 py-3 text-[12px] text-zinc-600">No sessions yet.</div>
        )}

        {todos.length > 0 && (
          <>
            <div className="mt-4 px-2 py-1 text-[10.5px] font-medium uppercase tracking-wider text-zinc-600">
              Todo
            </div>
            <ul className="space-y-1 px-1">
              {todos.map((t) => (
                <li key={t.id} className="flex items-start gap-2 rounded px-1.5 py-1 text-[12px]">
                  <span
                    className={
                      t.status === "completed"
                        ? "text-emerald-400"
                        : t.status === "in_progress"
                          ? "text-amber-300"
                          : "text-zinc-600"
                    }
                  >
                    {t.status === "completed" ? "☑" : t.status === "in_progress" ? "◐" : "○"}
                  </span>
                  <span
                    className={`flex-1 ${
                      t.status === "completed" ? "text-zinc-600 line-through" : "text-zinc-400"
                    }`}
                  >
                    {t.content}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="border-t border-zinc-800/70 px-4 py-2.5 text-[11px] text-zinc-500">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <span className="truncate">{config?.model || "not set"}</span>
        </div>
        <div className="mt-0.5 truncate" title={config?.workdir}>
          {config?.workdir || "…"}
        </div>
      </div>
    </aside>
  );
}
