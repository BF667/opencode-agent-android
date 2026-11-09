import { useCallback, useEffect, useRef, useState } from "react";
import { api, runStream } from "./lib/api";
import type { AgentConfig, Message, RunEvent, Session, Todo } from "./lib/types";
import { Sidebar } from "./components/Sidebar";
import { ChatView } from "./components/ChatView";
import { Composer } from "./components/Composer";
import { SettingsModal } from "./components/SettingsModal";
import { WorkspacePanel } from "./components/WorkspacePanel";

function Welcome({ termux }: { termux: boolean }) {
  const suggestions = [
    "Jelaskan struktur project di direktori ini",
    "Bikin script Python hello world lalu jalankan",
    "Cari semua file .sh di home dan ringkas isinya",
    "Buat todo list buat bikin REST API sederhana",
  ];
  return (
    <div className="flex flex-col items-center pt-[14vh] text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[20px] font-bold text-black">
        O
      </div>
      <h1 className="text-[22px] font-semibold text-zinc-100">
        OpenCode Agent <span className="text-zinc-500">· Termux</span>
      </h1>
      <p className="mt-1 max-w-md text-[13.5px] leading-relaxed text-zinc-500">
        Coding agent berjalan lokal di {termux ? "Android Termux kamu" : "perangkat ini"} — bisa
        bash, baca/tulis file, dan menjaga todo list. Tidak ada TUI, semuanya dari browser.
      </p>
      <div className="mt-6 grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
        {suggestions.map((s) => (
          <div
            key={s}
            className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 px-3.5 py-2.5 text-left text-[12.5px] text-zinc-400"
          >
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [running, setRunning] = useState(false);
  const [input, setInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const refreshSessions = useCallback(async () => {
    const r = await api<{ sessions: Session[] }>("/api/sessions");
    setSessions(r.sessions);
  }, []);

  const loadSession = useCallback(async (id: string) => {
    const r = await api<{ session: Session; messages: Message[]; todos: Todo[]; running: boolean }>(
      `/api/sessions/${id}`,
    );
    setActiveId(id);
    setMessages(r.messages);
    setTodos(r.todos);
    setRunning(r.running);
    setDrawerOpen(false);
  }, []);

  useEffect(() => {
    api<AgentConfig>("/api/config").then(setConfig).catch(() => {});
    refreshSessions();
  }, [refreshSessions]);

  const applyEvent = (e: RunEvent) => {
    (window as never as Record<string, number>).__events = ((window as never as Record<string, number>).__events || 0) + 1;
    if ((window as never as Record<string, number>).__events < 10) console.log("[evt]", e.type);
    switch (e.type) {
      case "user-message":
        setMessages((m) => [...m, e.message]);
        break;
      case "message-start":
        setMessages((m) => [...m, { id: e.messageId, role: "assistant", parts: [], createdAt: Date.now() }]);
        break;
      case "text-delta":
        setMessages((m) =>
          m.map((msg) => {
            if (msg.id !== e.messageId) return msg;
            const parts = [...msg.parts];
            const last = parts[parts.length - 1];
            if (last && last.type === "text") parts[parts.length - 1] = { type: "text", text: last.text + e.delta };
            else parts.push({ type: "text", text: e.delta });
            return { ...msg, parts };
          }),
        );
        break;
      case "think-delta":
        setMessages((m) =>
          m.map((msg) => {
            if (msg.id !== e.messageId) return msg;
            const parts = [...msg.parts];
            const last = parts[parts.length - 1];
            if (last && last.type === "think") parts[parts.length - 1] = { type: "think", text: last.text + e.delta };
            else parts.push({ type: "think", text: e.delta });
            return { ...msg, parts };
          }),
        );
        break;
      case "tool-start":
        setMessages((m) =>
          m.map((msg) =>
            msg.id === e.messageId
              ? {
                  ...msg,
                  parts: [
                    ...msg.parts,
                    { type: "tool", callId: e.callId, tool: e.tool, state: { status: "running", input: e.args } },
                  ],
                }
              : msg,
          ),
        );
        break;
      case "tool-end":
        setMessages((m) =>
          m.map((msg) =>
            msg.id === e.messageId
              ? {
                  ...msg,
                  parts: msg.parts.map((p) =>
                    p.type === "tool" && p.callId === e.callId ? { ...p, state: e.state } : p,
                  ),
                }
              : msg,
          ),
        );
        break;
      case "todo":
        setTodos(e.todos);
        break;
      case "usage":
        setMessages((m) =>
          m.map((msg, i) => (i === m.length - 1 ? { ...msg, usage: { input: e.input, output: e.output } } : msg)),
        );
        break;
      case "done":
        setRunning(false);
        abortRef.current = null;
        refreshSessions();
        if (activeId) loadSession(activeId); // resync dengan server
        break;
      case "error":
        setRunning(false);
        setError(e.message);
        break;
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    setError("");
    setInput("");
    try {
      let sid = activeId;
      if (!sid) {
        const r = await api<{ session: Session }>("/api/sessions", { method: "POST", body: JSON.stringify({ title: text.slice(0, 48) }) });
        sid = r.session.id;
        setActiveId(sid);
        setMessages([]);
        setTodos([]);
        refreshSessions();
      }
      const ac = new AbortController();
      abortRef.current = ac;
      setRunning(true);
      await runStream(sid, text, applyEvent, ac.signal);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(String((e as Error).message));
        setRunning(false);
      }
    }
  };

  const stop = async () => {
    abortRef.current?.abort();
    if (activeId) await api(`/api/sessions/${activeId}/stop`, { method: "POST" }).catch(() => {});
    setRunning(false);
  };

  const newChat = () => {
    setActiveId(null);
    setMessages([]);
    setTodos([]);
    setDrawerOpen(false);
  };

  const deleteSession = async (id: string) => {
    await api(`/api/sessions/${id}`, { method: "DELETE" }).catch(() => {});
    refreshSessions();
    if (id === activeId) newChat();
  };

  const hasKey = config?.hasKey || config?.provider === "mock";

  return (
    <div className="flex h-full overflow-hidden">
      {/* backdrop mobile */}
      {drawerOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setDrawerOpen(false)} />
      )}

      {/* sidebar: drawer di mobile */}
      <div
        className={`fixed inset-y-0 left-0 z-40 transition-transform lg:relative lg:z-auto lg:translate-x-0 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar
          sessions={sessions}
          activeId={activeId}
          todos={todos}
          config={config}
          onSelect={loadSession}
          onNew={newChat}
          onDelete={deleteSession}
          onOpenSettings={() => {
            setShowSettings(true);
            setDrawerOpen(false);
          }}
          onToggleWorkspace={() => {
            setShowWorkspace((v) => !v);
            setDrawerOpen(false);
          }}
          workspaceOpen={showWorkspace}
          onClose={() => setDrawerOpen(false)}
        />
      </div>

      {/* main */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-zinc-800/70 px-3 py-2.5 lg:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            className="rounded-lg p-2 text-zinc-300 hover:bg-zinc-800"
            aria-label="Buka menu"
          >
            ☰
          </button>
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-white text-[11px] font-bold text-black">
            O
          </div>
          <div className="min-w-0 flex-1 truncate text-[13px] font-medium text-zinc-200">
            {sessions.find((s) => s.id === activeId)?.title || "OpenCode Agent"}
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800"
            aria-label="Pengaturan"
          >
            ⚙
          </button>
        </header>

        {error && (
          <div className="mx-auto mt-2 w-full max-w-3xl px-4">
            <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-[12.5px] text-red-300">
              {error}
            </div>
          </div>
        )}

        <ChatView
          messages={messages}
          running={running}
          todos={todos}
          emptyHint={
            config ? (
              <Welcome termux={Boolean(config.termux)} />
            ) : (
              <div className="p-6 text-center text-zinc-500">Memuat…</div>
            )
          }
        />

        <Composer value={input} onChange={setInput} onSend={send} onStop={stop} running={running} disabled={false} />

        {!hasKey && (
          <button
            onClick={() => setShowSettings(true)}
            className="pb-2 text-center text-[11.5px] text-amber-400/90 underline underline-offset-2"
          >
            API key belum diset — klik untuk konfigurasi (atau pakai mode mock)
          </button>
        )}
      </main>

      {/* workspace panel */}
      {showWorkspace && (
        <div className="fixed inset-0 z-30 bg-[#0d0d0f] lg:relative lg:z-auto lg:w-[380px]">
          <WorkspacePanel onClose={() => setShowWorkspace(false)} workdir={config?.workdir || ""} />
        </div>
      )}

      {showSettings && config && (
        <SettingsModal config={config} onClose={() => setShowSettings(false)} onSaved={() => api<AgentConfig>("/api/config").then(setConfig)} />
      )}
    </div>
  );
}
