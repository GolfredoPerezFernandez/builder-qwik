export const QWIK_PROMPT = `
═══════════════════════════════════════════
 QWIK FRAMEWORK — CORE PATTERNS
═══════════════════════════════════════════

COMPONENT SYNTAX — Always use Qwik's reactive primitives:
\`\`\`tsx
import { component$, useSignal, useStore, useComputed$, useTask$, useVisibleTask$, $ } from '@builder.io/qwik';
import { Link, useLocation, useNavigate, routeLoader$, routeAction$, Form } from '@builder.io/qwik-city';

export default component$(() => {
  const count = useSignal(0);                    // primitive reactive value
  const state = useStore({ items: [], loading: false }); // reactive object
  const doubled = useComputed$(() => count.value * 2);   // derived value

  // Server-tracked reactive — runs on server AND re-runs when deps change
  useTask$(({ track }) => {
    track(() => count.value);
    // runs on SSR and when count changes
  });

  // Client-ONLY code — use for browser APIs, DOM manipulation, timers
  useVisibleTask$(({ cleanup }) => {
    // Safe to use window, document, localStorage here
    const interval = setInterval(() => { /* ... */ }, 1000);
    cleanup(() => clearInterval(interval));
  });

  // Event handlers must use $() wrapper
  const handleClick = $(() => { count.value++; });

  return <div onClick$={handleClick}>{count.value}</div>;
});
\`\`\`

CRITICAL RULES:
- NEVER use "window", "document", "localStorage" outside "useVisibleTask$" or guarded by "typeof window !== 'undefined'".
- JSX must return a SINGLE root element. Use fragments for multiple siblings.
- All event handlers must end with "$" suffix: onClick$, onInput$, etc.
- Component functions MUST end with "$": component$, $(() => {}), server$.
- Do NOT import React APIs. This is Qwik.

FOLDER-BASED ROUTING:
- Routes live in "src/routes/" following folder structure:
  - src/routes/index.tsx -> "/"
  - src/routes/dashboard/index.tsx -> "/dashboard"
  - src/routes/layout.tsx -> wraps all child routes with shared UI

SERVER-SIDE DATA LOADING (routeLoader$):
\`\`\`tsx
import { getTursoClient } from '~/lib/turso';

export const useItems = routeLoader$(async () => {
  const client = getTursoClient();
  const res = await client.execute('SELECT id, task, done FROM todo ORDER BY id');
  return { items: res.rows };
});
\`\`\`

MUTATIONS — prefer server$ with raw SQL via @libsql/client (Qwik Turso pattern):
\`\`\`tsx
import { server$ } from '@builder.io/qwik-city';
import { getTursoClient } from '~/lib/turso';

export const addTodo = server$(async function (task: string) {
  const client = getTursoClient();
  await client.execute({ sql: 'INSERT INTO todo (task) VALUES (?)', args: [task] });
  return { ok: true };
});
\`\`\`

routeAction$ is also allowed for classic <Form> posts; do not introduce Drizzle, Prisma, or any ORM — this project is raw SQL only.
`;
