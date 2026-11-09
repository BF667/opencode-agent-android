import { useRef, useEffect } from "react";

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  running,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  running: boolean;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, [value]);

  const send = () => {
    if (!value.trim() || running || disabled) return;
    onSend();
  };

  return (
    <div className="border-t border-zinc-800/70 bg-[#0a0a0b] px-4 pt-2 pb-3">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-end gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-2 focus-within:border-zinc-600">
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Tanya apa pun… (Enter kirim, Shift+Enter baris baru)"
            className="max-h-44 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[14px] leading-relaxed text-zinc-100 placeholder-zinc-600 outline-none"
            disabled={disabled}
          />
          {running ? (
            <button
              onClick={onStop}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-700 text-zinc-100 transition hover:bg-zinc-600"
              aria-label="Stop"
            >
              <span className="block h-3 w-3 rounded-[3px] bg-current" />
            </button>
          ) : (
            <button
              onClick={send}
              disabled={!value.trim() || disabled}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-black transition enabled:hover:bg-zinc-200 disabled:opacity-30"
              aria-label="Kirim"
            >
              ↑
            </button>
          )}
        </div>
        <div className="mt-1.5 text-center text-[10.5px] text-zinc-600">
          OpenCode Agent (Termux) · agent dapat menjalankan bash di workdir kamu
        </div>
      </div>
    </div>
  );
}
