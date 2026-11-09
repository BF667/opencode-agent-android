import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { AgentConfig, FileEntry } from "../lib/types";

export function SettingsModal({
  config,
  onClose,
  onSaved,
}: {
  config: AgentConfig;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [provider, setProvider] = useState(config.provider);
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [model, setModel] = useState(config.model);
  const [apiKey, setApiKey] = useState("");
  const [workdir, setWorkdir] = useState(config.workdir);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const presets: Record<string, { url: string; model: string }> = {
    "Z.ai (GLM)": { url: "https://api.z.ai/api/paas/v4", model: "glm-4.6" },
    OpenRouter: { url: "https://openrouter.ai/api/v1", model: "anthropic/claude-sonnet-4" },
    DeepSeek: { url: "https://api.deepseek.com/v1", model: "deepseek-chat" },
    "Ollama (lokal)": { url: "http://127.0.0.1:11434/v1", model: "qwen2.5-coder:7b" },
  };

  const save = async () => {
    setSaving(true);
    setErr("");
    try {
      await api("/api/config", {
        method: "POST",
        body: JSON.stringify({ provider, baseUrl, model, workdir, ...(apiKey ? { apiKey } : {}) }),
      });
      onSaved();
      onClose();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-[#111113] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-zinc-100">Pengaturan Agent</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300" aria-label="Tutup">
            ✕
          </button>
        </div>

        <label className="mb-1 block text-[11.5px] font-medium text-zinc-400">Provider</label>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="mb-3 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-[13px] text-zinc-200 outline-none focus:border-zinc-600"
        >
          <option value="openai-compatible">OpenAI-compatible (Z.ai, OpenRouter, dll)</option>
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="mock">Mock / Demo (tanpa API)</option>
        </select>

        <label className="mb-1 block text-[11.5px] font-medium text-zinc-400">Preset cepat</label>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {Object.entries(presets).map(([name, preset]) => (
            <button
              key={name}
              onClick={() => {
                setBaseUrl(preset.url);
                setModel(preset.model);
                if (name === "Z.ai (GLM)") setProvider("openai-compatible");
                if (name.startsWith("Ollama")) setProvider("openai-compatible");
                if (name === "OpenRouter" || name === "DeepSeek") setProvider("openai-compatible");
              }}
              className="rounded-full border border-zinc-800 px-2.5 py-1 text-[11.5px] text-zinc-400 hover:bg-zinc-800"
            >
              {name}
            </button>
          ))}
        </div>

        <label className="mb-1 block text-[11.5px] font-medium text-zinc-400">Base URL</label>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          className="mb-3 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-[12.5px] text-zinc-200 outline-none focus:border-zinc-600"
        />

        <label className="mb-1 block text-[11.5px] font-medium text-zinc-400">Model</label>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="mb-3 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-[12.5px] text-zinc-200 outline-none focus:border-zinc-600"
        />

        <label className="mb-1 block text-[11.5px] font-medium text-zinc-400">
          API Key {config.hasKey && <span className="text-emerald-400">(tersimpan)</span>}
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={config.hasKey ? "biarkan kosong untuk tetap pakai key lama" : "sk-…"}
          className="mb-3 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-[13px] text-zinc-200 outline-none focus:border-zinc-600"
        />

        <label className="mb-1 block text-[11.5px] font-medium text-zinc-400">Working directory</label>
        <input
          value={workdir}
          onChange={(e) => setWorkdir(e.target.value)}
          className="mb-4 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-[12.5px] text-zinc-200 outline-none focus:border-zinc-600"
        />

        {err && <div className="mb-3 rounded-lg bg-red-950/50 px-3 py-2 text-[12.5px] text-red-300">{err}</div>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-[13px] text-zinc-400 hover:bg-zinc-800">
            Batal
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-white px-4 py-2 text-[13px] font-medium text-black hover:bg-zinc-200 disabled:opacity-50"
          >
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}
