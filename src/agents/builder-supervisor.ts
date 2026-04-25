import path from "node:path";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { createDeepAgent, FilesystemBackend } from "deepagents";
import { agentDebug } from "../lib/agent-debug";
import { makeLiteLocalSubagents, makeSpecialistSubagents } from "./specialist-runnables";
import { getBrowserLogsTool } from "../tools/browser-logs";
import { runBuild, runLint, runTypecheck, takeScreenshot } from "../tools/project-tools";
import { BUILDER_SUPERVISOR_PROMPT } from "../prompts/builder";
import { BUILDER_SUPERVISOR_PROMPT_COMPACT } from "../prompts/builder-local";

/**
 * Models often return MinGW-style "/C:/Users/.../file" on Windows. Node would treat that as
 * a normal absolute path and the runtime ends up on "C:\\C:\\Users\\..." — listing fails
 * with "No files found". Map that shape to a real `C:\...` path.
 *
 * They also emit Unix-style `/src/...`, `/public/...` meaning the repo root; on Windows that
 * becomes `C:\\src\\...` (ENOENT). Strip the leading slash for known project roots.
 */
function normalizeModelFsPath(p: string): string {
  if (!p) return p;
  const s = p.replace(/\\/g, "/");

  if (process.platform === "win32") {
    const mingw = s.match(/^\/+([A-Za-z]):\/?(.*)$/);
    if (mingw) {
      const rest = mingw[2] ?? "";
      return path.normalize(`${mingw[1].toUpperCase()}:${rest ? `/${rest}` : "/"}`);
    }
  }

  if (/^\/+(?:src|public|_[^/]+)(\/|$)/i.test(s)) {
    return s.replace(/^\/+/, "");
  }

  return p;
}

const PROTECTED_SNIPPETS = [
  "agent-chat",
  "AGENTS.md",
  "src/graph",
  "src/prompts",
  "src/agents",
];

function isProtectedPath(filePath: string) {
  return PROTECTED_SNIPPETS.some((p) => filePath.includes(p));
}

/**
 * Cap a tool output so it never dumps thousands of tokens into the LangGraph state.
 * Qwen3.5-9B@LM Studio has ~5k tokens of system prompt and re-processes the full message
 * history every turn; a 300-line file dump (~5.4k tokens) easily triples the prompt size
 * and turns each subsequent tool call into a 60-120 s prompt-eval stall.
 */
const MAX_TOOL_LINES = 80;
const MAX_TOOL_CHARS = 3_000;

function shortPath(p: string, n = 100): string {
  const s = p.replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function capToolOutput(raw: unknown): string {
  const text = typeof raw === "string" ? raw : raw == null ? "" : String(raw);
  if (!text) return text;
  const lines = text.split(/\r?\n/);
  let capped = text;
  let wasLineTrimmed = false;
  if (lines.length > MAX_TOOL_LINES) {
    capped = lines.slice(0, MAX_TOOL_LINES).join("\n");
    wasLineTrimmed = true;
  }
  if (capped.length > MAX_TOOL_CHARS) {
    capped = capped.slice(0, MAX_TOOL_CHARS);
  }
  if (wasLineTrimmed || capped.length < text.length) {
    return `${capped}\n\n[...output truncated by host. Use narrower offset/limit or grep for targeted reads...]`;
  }
  return capped;
}

/**
 * Filesystem backend factory with the same guardrails as the legacy chat agent:
 * block writes/edits to agent infrastructure and orchestration source, and cap
 * tool outputs so they don't balloon the agent's internal state.
 */
export function makeProtectedFilesystemBackend(rootDir: string) {
  return () => {
    const base = new FilesystemBackend({ rootDir }) as any;
    const originalResolve = base.resolvePath.bind(base) as (key: string) => string;
    base.resolvePath = (key: string) => {
      let k = normalizeModelFsPath(String(key));
      if (!base.virtualMode && (k === "/" || k === "")) {
        k = ".";
      }
      return originalResolve(k);
    };
    const originalWrite = base.write.bind(base);
    const originalEdit = base.edit.bind(base);
    const originalRead = typeof base.read === "function" ? base.read.bind(base) : null;
    const originalLs = typeof base.ls === "function" ? base.ls.bind(base) : null;
    const originalGlob = typeof base.glob === "function" ? base.glob.bind(base) : null;
    const originalGrep = typeof base.grep === "function" ? base.grep.bind(base) : null;

    base.write = async (file_path: string, content: string, ...rest: unknown[]) => {
      if (isProtectedPath(file_path)) return { error: "Permission Denied" };
      agentDebug("FS", "write_file", {
        path: shortPath(file_path),
        contentLen: content.length,
      });
      return originalWrite(file_path, content, ...rest);
    };
    base.edit = async (
      file_path: string,
      old_string: string,
      new_string: string,
      all?: boolean,
    ) => {
      if (isProtectedPath(file_path)) return { error: "Permission Denied" };
      agentDebug("FS", "edit_file", {
        path: shortPath(file_path),
        oldLen: old_string.length,
        newLen: new_string.length,
        replaceAll: Boolean(all),
      });
      return originalEdit(file_path, old_string, new_string, all);
    };

    if (originalRead) {
      base.read = async (...args: unknown[]) => {
        const pathArg = typeof args[0] === "string" ? args[0] : "";
        const out = await originalRead(...args);
        const capped = capToolOutput(out);
        agentDebug("FS", "read_file", {
          path: shortPath(pathArg),
          returnedChars: typeof capped === "string" ? capped.length : 0,
        });
        return capped;
      };
    }
    if (originalLs) {
      base.ls = async (...args: unknown[]) => {
        const pathArg = typeof args[0] === "string" ? args[0] : "";
        const out = await originalLs(...args);
        const capped = capToolOutput(out);
        agentDebug("FS", "ls", {
          path: shortPath(pathArg),
          returnedChars: typeof capped === "string" ? capped.length : 0,
        });
        return capped;
      };
    }
    if (originalGlob) {
      base.glob = async (...args: unknown[]) => {
        const pattern = typeof args[0] === "string" ? args[0] : "";
        const out = await originalGlob(...args);
        const capped = capToolOutput(out);
        agentDebug("FS", "glob", {
          pattern: shortPath(pattern, 80),
          returnedChars: typeof capped === "string" ? capped.length : 0,
        });
        return capped;
      };
    }
    if (originalGrep) {
      base.grep = async (...args: unknown[]) => {
        const pattern = typeof args[0] === "string" ? args[0] : "";
        const out = await originalGrep(...args);
        const capped = capToolOutput(out);
        agentDebug("FS", "grep", {
          pattern: shortPath(pattern, 80),
          returnedChars: typeof capped === "string" ? capped.length : 0,
        });
        return capped;
      };
    }

    return base;
  };
}

export type BuilderSupervisorOptions = {
  /** When true, enables token streaming from the chat model (UI chat). */
  streaming?: boolean;
  /** Model id as seen by the OpenAI-compatible server (LM Studio, vLLM, etc.). */
  modelName?: string;
  /**
   * OpenAI-compatible API root (e.g. LM Studio: `http://127.0.0.1:1234/v1`).
   * When set, requests go here instead of the default OpenAI cloud URL.
   */
  baseURL?: string;
};

/**
 * Deep Agent supervisor with Qwik specialists (see LangChain Deep Agents — subagents + task tool:
 * https://docs.langchain.com/oss/javascript/deepagents/overview ).
 */
function envString(key: string): string | undefined {
  const v = typeof process !== "undefined" ? process.env[key] : undefined;
  return v && v.trim() ? v.trim() : undefined;
}

function messageKind(m: BaseMessage): string {
  if (typeof (m as any)?._getType === "function") return String((m as any)._getType());
  const role = (m as any)?.role;
  return typeof role === "string" ? role : "";
}

/**
 * LM Studio Qwen templates require at least one user message and often reject ordering where the
 * first turn after system is assistant/tool-only. Normalize before every local completion call.
 */
function fixMessagesForLocalJinja(messages: BaseMessage[]): BaseMessage[] {
  let out = [...messages];

  const hasUser = out.some((m) => {
    const k = messageKind(m);
    return k === "human" || k === "user";
  });
  if (!hasUser) {
    agentDebug("SUPERVISOR", "jinja guard: appended synthetic user message", {
      priorMessageCount: out.length,
    });
    out = [...out, new HumanMessage("Continue.")];
    return out;
  }

  const firstNonSystem = out.findIndex((m) => messageKind(m) !== "system");
  if (firstNonSystem >= 0) {
    const k = messageKind(out[firstNonSystem]);
    if (k === "ai" || k === "assistant" || k === "tool") {
      agentDebug("SUPERVISOR", "jinja guard: inserted human before leading ai/tool turn", {
        leadingKind: k,
        priorMessageCount: messages.length,
      });
      out = [
        ...out.slice(0, firstNonSystem),
        new HumanMessage("(Conversation continues from summarized context.)"),
        ...out.slice(firstNonSystem),
      ];
    }
  }

  return out;
}

function attachLocalJinjaSafeguard(model: ChatOpenAI) {
  const m = model as unknown as {
    _generate?: (msgs: BaseMessage[], ...rest: unknown[]) => Promise<unknown>;
    _streamResponseChunks?: (
      msgs: BaseMessage[],
      ...rest: unknown[]
    ) => AsyncGenerator<unknown>;
  };

  const originalGenerate = typeof m._generate === "function" ? m._generate.bind(model) : null;
  if (originalGenerate) {
    m._generate = async (msgs: BaseMessage[], ...rest: unknown[]) =>
      originalGenerate(fixMessagesForLocalJinja(msgs), ...rest);
  }

  const originalStream =
    typeof m._streamResponseChunks === "function" ? m._streamResponseChunks.bind(model) : null;
  if (originalStream) {
    m._streamResponseChunks = async function* (msgs: BaseMessage[], ...rest: unknown[]) {
      yield* originalStream(fixMessagesForLocalJinja(msgs), ...rest);
    };
  }
}

export async function createBuilderSupervisor(
  rootDir: string,
  apiKey?: string,
  options?: BuilderSupervisorOptions,
) {
  const baseURL = options?.baseURL ?? envString("OPENAI_BASE_URL");
  const resolvedModel =
    options?.modelName ?? envString("OPENAI_MODEL") ?? "gpt-4o";
  const resolvedKey =
    apiKey ??
    envString("OPENAI_API_KEY") ??
    (baseURL ? "lm-studio" : undefined);

  /** Local OpenAI-compatible servers often use n_ctx=4096; full prompt + memory exceeds that. */
  const useFullSupervisorPrompt =
    !baseURL || envString("BUILDER_FULL_SUPERVISOR_PROMPT") === "true";
  const systemPrompt = useFullSupervisorPrompt
    ? BUILDER_SUPERVISOR_PROMPT
    : BUILDER_SUPERVISOR_PROMPT_COMPACT;

  const model = new ChatOpenAI({
    model: resolvedModel,
    temperature: 0,
    apiKey: resolvedKey,
    configuration: baseURL ? { baseURL } : undefined,
    streaming: options?.streaming ?? false,
  });

  /**
   * Qwen3.5 (and several open-weights llama.cpp templates served by LM Studio) reject
   * chat completions where *no* message has role=user with:
   *   "Error rendering prompt with jinja template: 'No user query found in messages.'"
   *
   * This happens inside the agent loop whenever the internal state ends up with only
   * system+tool+ai turns right before a model call (tool results + cancelled calls +
   * summarization `HumanMessage` stripped by some middlewares, etc.). We can't control
   * every middleware's output, so we add a defensive floor at the ChatOpenAI boundary:
   * if the outgoing message list has zero user messages, append a synthetic
   * `HumanMessage("Continue.")` so the template renders.
   */
  if (baseURL) {
    attachLocalJinjaSafeguard(model);
  }

  const checkpointer = new MemorySaver();

  const useLiteLocalStack =
    Boolean(baseURL) && envString("BUILDER_FULL_SUPERVISOR_PROMPT") !== "true";

  const subagents = useLiteLocalStack ? makeLiteLocalSubagents() : makeSpecialistSubagents();

  // With local baseURL: AGENTS.md memory OFF by default (saves thousands of tokens). Cloud: ON unless explicitly false.
  const includeAgentsMdMemory = baseURL
    ? envString("BUILDER_INCLUDE_AGENTS_MD_MEMORY") === "true"
    : envString("BUILDER_INCLUDE_AGENTS_MD_MEMORY") !== "false";
  const memory = includeAgentsMdMemory ? [path.join(rootDir, "AGENTS.md")] : [];

  const g = globalThis as unknown as { __BUILDER_LOCAL_LITE__?: boolean };
  if (baseURL) g.__BUILDER_LOCAL_LITE__ = true;
  try {
    agentDebug("SUPERVISOR", "createDeepAgent", {
      model: resolvedModel,
      baseURL: Boolean(baseURL),
      liteLocal: useLiteLocalStack,
      subagentCount: subagents.length,
      agentsMdMemory: memory.length > 0,
      fullPrompt: useFullSupervisorPrompt,
    });
    const agent = createDeepAgent({
      model: model as any,
      checkpointer,
      backend: makeProtectedFilesystemBackend(rootDir),
      memory,
      systemPrompt,
      tools: [getBrowserLogsTool, runLint, runTypecheck, runBuild, takeScreenshot] as any,
      subagents,
    });
    return { agent, checkpointer };
  } finally {
    if (baseURL) delete g.__BUILDER_LOCAL_LITE__;
  }
}
