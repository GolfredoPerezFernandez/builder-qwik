import { server$ } from '@builder.io/qwik-city';
import { createBuilderSupervisor } from '~/agents/builder-supervisor';
import {
  agentDebug,
  agentDebugEnabled,
  formatMessageForDebug,
  summarizeStreamChunk,
} from '~/lib/agent-debug';
import { recordBrowserLog } from '~/tools/browser-logs';

/**
 * LM Studio + Qwen3.5-9B local: system prompt alone is ~5k tokens, context is tight and slow.
 * We only forward a very short, clean conversational tail. Tool outputs (file dumps, ls, build
 * logs) live inside the agent run and must NOT be re-sent via history; otherwise each new turn
 * re-processes 10k+ tokens and piles up concurrent slots on LM Studio.
 */
const MAX_HISTORY_MESSAGES = 6;
const MAX_MESSAGE_CHARS = 1_200;

const NOISE_PATTERNS = [
  /^\s*❌ Error:/,
  /The number of tokens to keep from the initial prompt/i,
  /Prompt processing progress:/,
];

function isNoise(content: string): boolean {
  return NOISE_PATTERNS.some((re) => re.test(content));
}

function stripToolDumps(content: string): string {
  if (!content) return content;
  // Drop anything that looks like a numbered-line file read dump or directory listing.
  const looksLikeFileDump = /^\s*\d+\t/m.test(content) || /\(directory\)\s*$/m.test(content);
  if (looksLikeFileDump) {
    const firstLine = content.split('\n').find((l) => l.trim().length > 0) ?? '';
    return `[Resumen de contexto previo omitido: ${firstLine.slice(0, 120)}...]`;
  }
  return content;
}

function previewOneLine(text: string, max = 120): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function trimHistoryForLlm(history: { role: string; content: string }[]) {
  const cleaned = history
    .filter((m) => typeof m.content === 'string' && m.content.trim().length > 0 && !isNoise(m.content))
    .map((m) => ({ ...m, content: stripToolDumps(m.content) }));

  const sliced = cleaned.slice(-MAX_HISTORY_MESSAGES);
  return sliced.map((m) => ({
    ...m,
    content:
      m.content.length > MAX_MESSAGE_CHARS
        ? `${m.content.slice(0, MAX_MESSAGE_CHARS)}\n\n[...]`
        : m.content,
  }));
}

/**
 * LM Studio + Qwen jinja chat templates error with "No user query found in messages" when the
 * first conversational turn after `system` is `assistant`. Trimming can leave a leading agent
 * bubble (summarized context); drop those so the first history entry is always the user.
 */
function dropLeadingAssistantHistory(
  history: { role: string; content: string }[],
): { role: string; content: string }[] {
  const out = [...history];
  while (out.length > 0 && out[0].role === 'agent') {
    out.shift();
  }
  return out;
}

function looksLikeLangGraphMessage(x: unknown): boolean {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    'role' in o ||
    'tool_calls' in o ||
    typeof o.content === 'string' ||
    Array.isArray(o.content) ||
    o._getType !== undefined ||
    o.lc_namespace !== undefined
  );
}

/**
 * Normalize LangGraph `stream()` chunks so we always get [message, metadata] when present.
 */
function unwrapMessageStreamChunk(chunk: unknown): { msg: any; metadata: any } | null {
  if (!Array.isArray(chunk) || chunk.length !== 2) return null;
  const [a, b] = chunk;

  // ["messages" | "updates", payload]
  if (typeof a === 'string') {
    if (a === 'messages' && Array.isArray(b) && b.length === 2 && looksLikeLangGraphMessage(b[0])) {
      return { msg: b[0], metadata: b[1] };
    }
    return null;
  }

  // [namespace, [message, metadata]] when subgraphs: true + single stream mode
  if (Array.isArray(a) && Array.isArray(b) && b.length === 2 && looksLikeLangGraphMessage(b[0])) {
    return { msg: b[0], metadata: b[1] };
  }

  // [message, metadata] default
  if (looksLikeLangGraphMessage(a)) {
    return { msg: a, metadata: b };
  }

  return null;
}

export const reportBrowserLog = server$(function (type: string, message: string) {
  recordBrowserLog(type, message);
});

/**
 * Server-side in-flight map keyed by conversation (route path). The client's AbortController
 * does NOT propagate to `server$` async generators, so HMR reloads or duplicate tabs kept piling
 * up concurrent LM Studio completions against the same conversation, stalling prompt eval for
 * 5+ minutes. Whenever a new turn starts for a conversation we flip its cancel flag so the
 * previous generator stops iterating the stream on its next yield boundary.
 */
const activeRuns = new Map<string, { cancelled: boolean }>();

export const streamAgent = server$(
  async function* (
    message: string,
    history: any[],
    currentLocation: string,
    _attachments: { name: string; type: string; data: string }[] = [],
  ) {
    void _attachments; // reserved for future: pass images/PDFs into the agent
    try {
      const apiKey = this.env.get('OPENAI_API_KEY') ?? undefined;
      const openaiBaseURL = this.env.get('OPENAI_BASE_URL') ?? undefined;
      const openaiModel = this.env.get('OPENAI_MODEL') ?? undefined;

      // Cloud OpenAI needs a key; local OpenAI-compatible servers (LM Studio, etc.) need base URL.
      if (!apiKey && !openaiBaseURL) {
        console.error('[BUILDER SUPERVISOR] ❌ Set OPENAI_API_KEY and/or OPENAI_BASE_URL.');
        yield '⚠️ Configura OPENAI_API_KEY (OpenAI) u OPENAI_BASE_URL (p. ej. LM Studio en http://127.0.0.1:1234/v1).';
      return;
    }

      const isHmrRestart = message.includes('El servidor HMR se recargó');
      console.log(
        `[BUILDER SUPERVISOR] 🚀 ${isHmrRestart ? 'RESUME (HMR)' : 'START'}: "${message.slice(0, 50)}..."`,
      );

      const conversationKey = currentLocation || '/';
      const previous = activeRuns.get(conversationKey);
      if (previous) {
        previous.cancelled = true;
        console.log(`[BUILDER SUPERVISOR] ⏹️  cancelled previous run for ${conversationKey}`);
      }
      const runToken = { cancelled: false };
      activeRuns.set(conversationKey, runToken);

      const rootDir = process.cwd();
      const { agent } = await createBuilderSupervisor(rootDir, apiKey, {
        streaming: true,
        baseURL: openaiBaseURL ?? undefined,
        modelName: openaiModel ?? undefined,
      });

      const userContent = [
        `Current route/path: ${currentLocation}`,
        '',
        'User request:',
        message,
      ].join('\n');

      const historyForLlm = dropLeadingAssistantHistory(
        trimHistoryForLlm(history as { role: string; content: string }[]),
      );

      agentDebug('CHAT_SUPERVISOR', 'stream input', {
        conversationKey,
        threadId: `ui-${conversationKey}`,
        historyMessages: historyForLlm.length,
        userPreview: previewOneLine(message),
        model: openaiModel ?? '(default)',
        baseURL: openaiBaseURL ? 'set' : 'unset',
      });

      /**
       * LangGraph stream chunks vary by options:
       * - streamMode "messages" (string) + no subgraphs: yields [AIMessage, metadata]
       * - streamMode ["messages", "updates"]: yields ["messages", [AIMessage, metadata]] or ["updates", patch]
       * - subgraphs true + single mode: yields [namespace, [AIMessage, metadata]]
       * Deep Agents use nested graphs for `task`; subgraphs + dual mode keeps the iterator alive across tool/subagent steps.
       */
      const stream = await (agent as any).stream(
        {
          messages: [
            ...historyForLlm.map((msg) => ({
              role: msg.role === 'agent' ? 'ai' : 'human',
              content: msg.content,
            })),
            { role: 'human', content: userContent },
          ],
        },
        {
          streamMode: ['messages', 'updates'],
          subgraphs: true,
          configurable: { thread_id: `ui-${conversationKey}` },
        },
      );

      for await (const chunk of stream) {
        if (runToken.cancelled) {
          console.log(`[BUILDER SUPERVISOR] 🛑 run for ${conversationKey} aborted mid-stream`);
          break;
        }
        if (agentDebugEnabled()) {
          agentDebug('CHAT_STREAM', summarizeStreamChunk(chunk));
        }
        const pair = unwrapMessageStreamChunk(chunk);
        if (!pair) continue;
        const { msg, metadata } = pair;

        if (agentDebugEnabled()) {
          agentDebug('CHAT_MESSAGE', 'model message', formatMessageForDebug(msg));
        }

        if (msg.content && typeof msg.content === 'string') yield msg.content;
        if (metadata?.state?.todos) {
          yield `STATE:TODO_LIST:${JSON.stringify(metadata.state.todos)}`;
        }
        if (msg.tool_calls) {
          msg.tool_calls.forEach((tc: any) => {
            console.log(`[BUILDER SUPERVISOR] [TOOL] ${tc.name}`);
            agentDebug('CHAT_TOOL', String(tc.name), {
              id: tc.id,
              argsPreview: previewOneLine(JSON.stringify(tc.args ?? {}), 400),
            });
          });
          const todoCall = msg.tool_calls.find((tc: any) => tc.name === 'write_todos');
          if (todoCall?.args?.todos) {
            yield `STATE:TODO_LIST:${JSON.stringify(todoCall.args.todos)}`;
          }
          const scCall = msg.tool_calls.find((tc: any) => tc.name === 'take_screenshot');
          if (scCall?.args?.filename) {
            yield `STATE:SCREENSHOT_STARTING:${scCall.args.filename}`;
          }
        }
        if (msg.role === 'tool' && msg.content && typeof msg.content === 'string') {
          if (msg.content.includes('/screenshots/')) {
            const tail = msg.content.split('/').pop() ?? '';
            if (tail) yield `STATE:SCREENSHOT_DONE:${tail}`;
          }
        }
      }
      if (activeRuns.get(conversationKey) === runToken) {
        activeRuns.delete(conversationKey);
      }
      console.log(`[BUILDER SUPERVISOR] ✅ ${isHmrRestart ? 'RESUME' : 'COMPLETE'}.`);
    } catch (err: any) {
      const raw = String(err?.message ?? err);
      console.error(`[BUILDER SUPERVISOR] ❌ ${raw}`);

      let hint = '';
      if (/No user query found in messages/i.test(raw)) {
        hint =
          '\n\nℹ️ LM Studio no encontró un mensaje de usuario en el prompt (plantilla jinja del modelo). ' +
          'Ya se añadió una protección en servidor; si vuelve a aparecer, abre LM Studio → My Models → el modelo cargado → ' +
          '"Prompt Template" y usa la plantilla de lmstudio-community para Qwen2.5/Qwen3.';
      } else if (/tokens to keep from the initial prompt.*context length|n_ctx|context length/i.test(raw)) {
        hint =
          '\n\nℹ️ El prompt supera el contexto configurado en LM Studio (n_ctx). ' +
          'Abre LM Studio → el modelo cargado → "Context Length" y súbelo a 16384 o 32768 (si tu GPU lo permite). ' +
          'También puedes reducir n_keep en las opciones del modelo.';
      }

      yield '\n\n❌ Error: ' + raw + hint;
    }
  },
);
