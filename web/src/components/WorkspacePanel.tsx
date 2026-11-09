import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { FileEntry } from "../lib/types";

export function WorkspacePanel({
  onClose,
  workdir,
}: {
  onClose: () => void;
  workdir: string;
}) {
  const [tab, setTab] = useState<"files" | "shell">("files");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [dir, setDir] = useState("");
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [filePath, setFilePath] = useState("");
  const [cmd, setCmd] = useState("");
  const [termOut, setTermOut] = useState("");
  const termRef = useRef<HTMLPreElement>(null);

  const loadDir = (d: string) => {
    api<{ entries: FileEntry[] }>(`/api/files?dir=${encodeURIComponent(d)}`)
      .then((r) => {
        setEntries(r.entries);
        setDir(d);
      })
      .catch(() => setEntries([]));
  };

  useEffect(() => {
    loadDir("");
  }, [workdir]);
  useEffect(() => {
    termRef.current?.scrollTo({ top: 1e6 });
  }, [termOut]);

  const openFile = async (p: string) => {
    const r = await api<{ content: string }>(`/api/file?path=${encodeURIComponent(p)}`);
    setFilePath(p);
    setFileContent(r.content);
  };

  const execCmd = async () => {
    if (!cmd.trim()) return;
    setTermOut((o) => o + `$ ${cmd}\n`);
    const r = await api<{ output: string }>("/api/exec", {
      method: "POST",
      body: JSON.stringify({ command: cmd }),
    });
    setTermOut((o) => o + (r.output || "") + "\n");
    setCmd("");
  };

  return (
    <div className="flex h-full w-full flex-col border-l border-zinc-800/70 bg-[#0d0d0f] lg:w-[380px]">
      <div className="flex items-center gap-2 border-b border-zinc-800/70 px-3 py-2">
        {(["files", "shell"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium ${
              tab === t ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t === "files" ? "📁 Files" : "⌘ Terminal"}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300" aria-label="Tutup panel">
          ✕
        </button>
      </div>

      {tab === "files" && (
        <div className="flex min-h-0 flex-1">
          <div className="min-h-0 w-1/2 overflow-y-auto border-r border-zinc-800/50 p-2">
            {dir && (
              <button
                onClick={() => loadDir(dir.split("/").slice(0, -1).join("/"))}
                className="block w-full rounded px-2 py-1 text-left text-[12px] text-zinc-500 hover:bg-zinc-800/50"
              >
                ↩ ..
              </button>
            )}
            {entries.map((e) => (
              <button
                key={e.path}
                onClick={() => (e.dir ? loadDir(e.path) : openFile(e.path))}
                className="block w-full truncate rounded px-2 py-1 text-left text-[12.5px] text-zinc-400 hover:bg-zinc-800/50"
                title={e.path}
              >
                {e.dir ? "📁 " : "📄 "}
                {e.name}
              </button>
            ))}
          </div>
          <div className="min-h-0 w-1/2 overflow-auto bg-zinc-950/60 p-2">
            {fileContent ? (
              <>
                <div className="mb-1 truncate text-[11px] font-medium text-zinc-500">{filePath}</div>
                <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-zinc-400">
                  {fileContent}
                </pre>
              </>
            ) : (
              <div className="p-2 text-[12px] text-zinc-600">Pilih file untuk dilihat.</div>
            )}
          </div>
        </div>
      )}

      {tab === "shell" && (
        <div className="flex min-h-0 flex-1 flex-col p-2">
          <pre
            ref={termRef}
            className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11.5px] leading-relaxed text-zinc-400"
          >
            {termOut || "Terminal workdir kamu. Semua perintah dijalankan tanpa sandbox — hati-hati."}
          </pre>
          <div className="mt-2 flex gap-2">
            <input
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && execCmd()}
              placeholder="ls -la"
              className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-[12.5px] text-zinc-200 outline-none focus:border-zinc-600"
            />
            <button
              onClick={execCmd}
              className="rounded-lg bg-zinc-800 px-3 py-2 text-[12.5px] text-zinc-200 hover:bg-zinc-700"
            >
              Run
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
