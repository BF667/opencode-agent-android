export type Todo = { id: string; content: string; status: "pending" | "in_progress" | "completed" };

export type ToolState = {
  status: "running" | "done" | "error";
  input?: unknown;
  output?: string;
  error?: string;
  durationMs?: number;
};

export type Part =
  | { type: "text"; text: string }
  | { type: "think"; text: string }
  | { type: "tool"; callId: string; tool: string; state: ToolState };

export type Message = {
  id: string;
  role: "user" | "assistant";
  parts: Part[];
  createdAt: number;
  finishedAt?: number;
  usage?: { input: number; output: number };
};

export type Session = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export type AgentConfig = {
  provider: string;
  baseUrl: string;
  model: string;
  workdir: string;
  hasKey: boolean;
  termux: boolean;
};

export type FileEntry = { name: string; dir: boolean; path: string };

export type RunEvent =
  | { type: "user-message"; message: Message }
  | { type: "message-start"; messageId: string }
  | { type: "text-delta"; messageId: string; delta: string }
  | { type: "think-delta"; messageId: string; delta: string }
  | { type: "tool-start"; messageId: string; callId: string; tool: string; args: unknown }
  | { type: "tool-end"; messageId: string; callId: string; ok: boolean; state: ToolState }
  | { type: "todo"; todos: Todo[] }
  | { type: "usage"; input: number; output: number }
  | { type: "done"; reason: string }
  | { type: "error"; message: string };
