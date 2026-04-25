import { server$ } from '@builder.io/qwik-city';
import { getTursoClient } from '~/lib/turso';
import { ensureTursoBuilderCoreTables } from '~/lib/turso-schema';

export type ChatPersistMessage = { role: 'user' | 'agent'; content: string };

function normalizeRole(r: unknown): 'user' | 'agent' | null {
  if (r === 'user' || r === 'agent') return r;
  return null;
}

/** Load ordered messages for a conversation (typically the current route path). */
export const loadBuilderChatMessages = server$(async function (conversationId: string) {
  const out: ChatPersistMessage[] = [];
  try {
    await ensureTursoBuilderCoreTables();
    const c = getTursoClient();
    const res = await c.execute({
      sql: 'SELECT role, content FROM builder_chat_message WHERE conversation_id = ? ORDER BY id ASC',
      args: [conversationId ?? '/'],
    });
    const rawRows = (res as { rows?: unknown }).rows;
    const list = Array.isArray(rawRows) ? rawRows : [];
    for (const row of list as { role?: unknown; content?: unknown }[]) {
      const role = normalizeRole(row?.role);
      if (!role) continue;
      out.push({ role, content: String(row?.content ?? '') });
    }
  } catch (e) {
    console.error('[chat-persistence] loadBuilderChatMessages failed:', e);
  }
  return out;
});

/** Cap each persisted assistant message so the re-hydrated history next time stays small. */
const PERSIST_MAX_CHARS = 4_000;

function normalizeContentForPersist(content: string): string {
  if (!content) return '';
  // File dumps have lines like "  12\tfoo" (read_file output); keep only a short header.
  if (/^\s*\d+\t/m.test(content)) {
    const first = content.split('\n').find((l) => l.trim().length > 0) ?? '';
    return `[Contexto previo omitido: ${first.slice(0, 160)}...]`;
  }
  if (content.length > PERSIST_MAX_CHARS) {
    return `${content.slice(0, PERSIST_MAX_CHARS)}\n\n[...]`;
  }
  return content;
}

/** Replace all messages for a conversation (full snapshot after each turn). */
export const saveBuilderChatMessages = server$(async function (
  conversationId: string,
  messages: ChatPersistMessage[],
) {
  const list = Array.isArray(messages) ? messages : [];
  await ensureTursoBuilderCoreTables();
  const c = getTursoClient();
  const conv = conversationId || '/';
  await c.execute({
    sql: 'DELETE FROM builder_chat_message WHERE conversation_id = ?',
    args: [conv],
  });
  const now = Date.now();
  for (const m of list) {
    if (!m || (m.role !== 'user' && m.role !== 'agent')) continue;
    const content = normalizeContentForPersist(String(m.content ?? ''));
    await c.execute({
      sql: 'INSERT INTO builder_chat_message (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)',
      args: [conv, m.role, content, now],
    });
  }
});

export const clearBuilderChatMessages = server$(async function (conversationId: string) {
  await ensureTursoBuilderCoreTables();
  const c = getTursoClient();
  await c.execute({
    sql: 'DELETE FROM builder_chat_message WHERE conversation_id = ?',
    args: [conversationId],
  });
});
