import type { Message, Todo } from "../lib/types";
import { Markdown } from "./Markdown";
import { ToolCard } from "./ToolCard";
import { useEffect, useRef } from "react";

function Thinking({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-1 rounded-lg border border-zinc-800/60 bg-zinc-900/40 px-3 py-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-[11.5px] font-medium uppercase tracking-wide text-zinc-500"
      >
        💭 Reasoning {open ? "▾" : "▸"}
      </button>
      {open && (
        <div className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-zinc-500">
          {text}
        </div>
      )}
    </div>
  );
}

function PartView({ part }: { part: Message["parts"][number] }) {
  if (part.type === "text")
    return part.text ? <Markdown text={part.text} /> : null;
  if (part.type === "think")
    return part.text ? <Thinking text={part.text} /> : null;
  return <ToolCard tool={part.tool} state={part.state} />;
}

export function ChatView({
  messages,
  running,
  todos,
  emptyHint,
}: {
  messages: Message[];
  running: boolean;
  todos: Todo[];
  emptyHint?: React.ReactNode;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, running]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        {!messages.length && emptyHint}
        {messages.map((m) => (
          <div key={m.id} className="mb-6">
            {m.role === "user" ? (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-zinc-800 px-4 py-2.5 text-[14px] leading-relaxed text-zinc-100 whitespace-pre-wrap">
                  {m.parts.filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join("\n")}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-start">
                <div className="mb-1.5 flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded-md bg-white text-[10px] font-bold text-black">
                    O
                  </div>
                  <span className="text-[12px] font-medium text-zinc-400">Agent</span>
                  {m.usage && (
                    <span className="text-[10.5px] text-zinc-600">
                      ↑{m.usage.input} ↓{m.usage.output} tok
                    </span>
                  )}
                </div>
                <div className="w-full space-y-0.5">
                  {m.parts.map((p, i) => (
                    <PartView key={i} part={p} />
                  ))}
                  {running && m.id === messages[messages.length - 1]?.id && (
                    <div className="flex items-center gap-1.5 py-1.5">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="typing-dot h-1.5 w-1.5 rounded-full bg-zinc-500"
                          style={{ animationDelay: `${i * 0.18}s` }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        {running && todos.some((t) => t.status === "in_progress") && (
          <div className="text-[12px] text-zinc-500">
            Sedang mengerjakan: {todos.find((t) => t.status === "in_progress")?.content}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
