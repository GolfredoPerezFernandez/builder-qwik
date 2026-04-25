/**
 * Structured server-side logs for LangGraph / DeepAgents runs.
 *
 * Enabled when `BUILDER_AGENT_DEBUG=true` / `1`, or in development unless
 * `BUILDER_AGENT_DEBUG=false` / `0`.
 */

const MAX_PREVIEW = 240;

export function agentDebugEnabled(): boolean {
  const v = process.env.BUILDER_AGENT_DEBUG;
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return process.env.NODE_ENV !== 'production';
}

export function agentDebug(lane: string, message: string, extra?: Record<string, unknown>): void {
  if (!agentDebugEnabled()) return;
  const suffix = extra && Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : '';
  console.log(`[AGENT:${lane}] ${message}${suffix}`);
}

function preview(text: string, n = MAX_PREVIEW): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

/**
 * Compact description of a LangChain / LangGraph message object for logs.
 */
export function formatMessageForDebug(msg: unknown): Record<string, unknown> {
  if (msg == null || typeof msg !== 'object') {
    return { kind: typeof msg };
  }
  const o = msg as Record<string, unknown>;
  let role = typeof o.role === 'string' ? o.role : undefined;
  if (!role && typeof o._getType === 'function') {
    try {
      role = (o._getType as () => string)();
    } catch {
      /* ignore */
    }
  }
  const out: Record<string, unknown> = {};
  if (role) out.role = role;
  if (typeof o.name === 'string') out.name = o.name;

  const c = o.content;
  if (typeof c === 'string') {
    out.contentLen = c.length;
    out.preview = preview(c);
  } else if (Array.isArray(c)) {
    out.contentBlocks = c.length;
  }

  const tc = o.tool_calls;
  if (Array.isArray(tc) && tc.length) {
    out.toolCalls = tc.map((t: { name?: string; id?: string }) => ({
      name: t?.name,
      id: typeof t?.id === 'string' ? t.id.slice(0, 12) : t?.id,
    }));
  }
  if (typeof o.tool_call_id === 'string') {
    out.toolCallId = o.tool_call_id.slice(0, 16);
  }
  return out;
}

function topLevelKeys(obj: object, max = 12): string {
  const keys = Object.keys(obj).slice(0, max);
  const more = Object.keys(obj).length > max ? '…' : '';
  return keys.join(', ') + more;
}

/**
 * One-line description of a `agent.stream()` chunk (messages / updates / subgraph tuples).
 */
export function summarizeStreamChunk(chunk: unknown): string {
  if (!Array.isArray(chunk) || chunk.length !== 2) {
    return `non-tuple (${typeof chunk})`;
  }
  const [a, b] = chunk;

  if (typeof a === 'string' && a === 'updates' && b && typeof b === 'object') {
    return `updates keys: ${topLevelKeys(b as object)}`;
  }

  if (typeof a === 'string' && a === 'messages' && Array.isArray(b) && b.length >= 1) {
    return `messages ${JSON.stringify(formatMessageForDebug(b[0]))}`;
  }

  if (Array.isArray(a) && Array.isArray(b) && b.length >= 2) {
    const ns = a.map((x) => (typeof x === 'string' ? x : '?')).join('/');
    return `subgraph[${ns}] ${JSON.stringify(formatMessageForDebug(b[0]))}`;
  }

  if (typeof a === 'object' && a !== null && looksLikeLangGraphish(a)) {
    return `pair ${JSON.stringify(formatMessageForDebug(a))}`;
  }

  return `tuple[0]=${typeof a} [1]=${typeof b}`;
}

function looksLikeLangGraphish(x: object): boolean {
  const o = x as Record<string, unknown>;
  return (
    'role' in o ||
    'tool_calls' in o ||
    typeof o.content === 'string' ||
    Array.isArray(o.content) ||
    o.lc_namespace !== undefined
  );
}

export async function agentDebugTimed<T>(
  lane: string,
  label: string,
  fn: () => Promise<T>,
  extra?: Record<string, unknown>,
): Promise<T> {
  const t0 = Date.now();
  agentDebug(lane, `${label} …start`, extra);
  try {
    const r = await fn();
    agentDebug(lane, `${label} …done`, { ms: Date.now() - t0 });
    return r;
  } catch (e: any) {
    agentDebug(lane, `${label} …error`, {
      ms: Date.now() - t0,
      err: e?.message ?? String(e),
    });
    throw e;
  }
}
