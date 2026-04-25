/**
 * Shared instructions: the repo ships a full Qwik reference app under _blueprints/.
 * Sibling folders under the developer's `apps/` directory (e.g. spelling-game, koolinart, iriparo, crypto-helper)
 * are not readable by tools unless linked or copied into `_blueprints/<name>/` (see AGENTS.md and
 * `scripts/link-example-blueprints.ps1`).
 */
/** Human-curated names; optional local junctions under `_blueprints/<dir>/`. */
export const OPTIONAL_BLUEPRINT_DIRS = [
  "spelling-game",
  "koolinart",
  "iriparo",
  "crypto-helper",
] as const;

export const BLUEPRINT_GUIDANCE = `
BLUEPRINTS (mandatory reference before non-trivial work):
- Treat each folder under "_blueprints/" as a **complete working app** (UI, SSR/loaders, API routes, lib, Turso raw-SQL patterns). Your job is to **auto-build the user's request into THIS seed repo** by porting proven patterns — not to sketch from memory when a blueprint already solved the same class of problem. Ignore any Drizzle/ORM code you might encounter in older blueprints and port it to raw @libsql/client + ensureXSchema() instead.

NAMING DISCIPLINE (non-negotiable — blueprints are learning material, NOT the product):
- Blueprints exist to teach you **structure, flow, and code shape** — NEVER to contribute names, brand, copy, domains, cookie names, volume names, Fly app names, database filenames, user-visible strings, or marketing text to the generated app.
- Paths like "_blueprints/acupatas-core/..." are **only** where you read examples; the string "acupatas-core" in a path is fine in prompts and docs. What must never leak into the shipped product is the **blueprint app's own identifiers** (see banned list below) inside "src/", deploy configs for *this* app, package name, or UI.
- Banned in generated code / config / UI / docs unless the user literally asks for that product:
  - Product/brand names: "acupatas", "acupatas-core", "acupatas-main", "iriparo", "koolinart", "spelling-game", "crypto-helper", and anything derived (logos, copy, slogans).
  - Domains: "acupatas.com", "iriparo.es", "sdecorp.io" or any other blueprint domain — do not put them in ORIGIN, CORS lists, emails, meta tags, or seeds.
  - Cookie names: "acupatas_session" → rename to "<app>_session" using the user's product name (snake_case, lowercase). Same for any "*_admin", "*_session_v2" etc.
  - Fly app names + volume names: "acupatas-main", "acupatas_uploads", "iriparo_uploads", "sde-app" → rename to "<app>" / "<app>_uploads".
  - DB filenames / Turso DB labels: replace "acupatas", "acupatas.db" etc. with neutral "<app>" or the user's chosen name.
  - User-facing copy / product-specific components: do not ship a "Acupatas dashboard", a "Koolinart gallery header", a "Spelling Game landing" to an unrelated product.
- When porting a file: keep the **structure, imports, hooks, control flow, CSS class patterns, API shapes**; rename everything that identifies the source app. If the user has not picked a product name yet, use a neutral placeholder ("app", "<appName>") and ask / leave a TODO — do not default to a blueprint's name.
- Generic technical identifiers are fine to keep ("session", "users", "uploads" as folder names, "routeLoader$"/"useRole" hook names, utility function names like "getSessionFromEvent", "ensureAuthSchema"). The test is: would a reader recognize this name as belonging to a specific blueprint product? If yes, rename it.
- Primary copy in-repo: "_blueprints/acupatas-core/" — full Qwik City snapshot (uses "routes/", "components/", "lib/" at blueprint root — NOT "src/routes" inside the blueprint folder).
- Guaranteed present: only "_blueprints/acupatas-core/". Optional folders (spelling-game / koolinart / iriparo / crypto-helper) are ONLY available when the developer linked them with "scripts/link-example-blueprints.ps1" (yarn blueprints:link). Before mentioning them, call list_files on "_blueprints/<name>/" and skip silently if missing — do not hallucinate their contents.
- Extra examples (when their folder exists): spelling-game (games / language-learning UIs), koolinart (creative / gallery patterns), iriparo (routing + app-shell demos), crypto-helper (Web3 / viem flows, wallet UX).
- Workflow: (1) Decide which blueprint best matches the task (acupatas-core for dashboards/auth/API/Turso; optional dirs for thematic match). (2) ls the chosen "_blueprints/.../routes" or "src/routes" (some snapshots use "src/routes", others "routes" at blueprint root — discover via list_files). (3) read_file the closest matching file (UI **and** server **and** lib/turso or DB helpers as needed). (4) Port patterns into THIS app's "src/routes/", "src/components/", "src/lib/" — do not copy business-specific branding unless the user asked for that product.
- Strong examples to mirror (acupatas-core):
  - "_blueprints/acupatas-core/routes/layout.tsx" — pathname-driven app shell (isHome / isAuth / isDashboard), marketing header+footer vs bare dashboard slot.
  - "_blueprints/acupatas-core/routes/dashboard/layout.tsx" — onRequest auth guard + role redirects + onGet cache headers + routeLoader$ session flags; sidebar + WS-driven badges.
  - "_blueprints/acupatas-core/routes/auth/index.tsx" — multi-step auth UI with server$ + createSession.
  - "_blueprints/acupatas-core/lib/auth.ts" — scrypt hashing, sessions table, getSessionFromEvent, clearSession; the file uses a **product-specific** session cookie name — when porting to "src/lib/", use "<app>_session" (or the user's name), never paste the blueprint's literal cookie string into the shipped app.
  - "_blueprints/acupatas-core/lib/turso.ts" — HMR-safe singleton, Fly file fallback, arg-normalizing Proxy.
  - "_blueprints/acupatas-core/lib/webpush.ts" + "_blueprints/acupatas-core/routes/service-worker.ts" — Web Push + VAPID + SW handlers.
  - "_blueprints/acupatas-core/server/websocket.ts" + "_blueprints/acupatas-core/entry.express.tsx" — WebSocket upgrade on /ws, notifyUserWs / broadcastWs, Node-only.
  - "_blueprints/acupatas-core/lib/upload.ts" + "_blueprints/acupatas-core/lib/image-resizer.ts" — server$ uploads + Sharp resizer with "/uploads/" allowlist.
  - "_blueprints/acupatas-core/components/" — reusable UI (cards, footers, push-manager, VerificationBadge).
  - "_blueprints/acupatas-core/Dockerfile" — multi-stage Node 20 alpine build, corepack/yarn, libc6-compat + build-base + binutils for native deps, non-root USER node, PUBLIC_VAPID_KEY as ARG (build-time), ORIGIN + UPLOAD_DIR env, CMD node server/entry.express. Copy this exact shape when emitting a Dockerfile.
  - "_blueprints/acupatas-core/.dockerignore" — ignores node_modules, .git, .github, dist, build, .env, logs, public/uploads, /data, /tmp. Start from this list when writing .dockerignore for the generated app.
  - "_blueprints/acupatas-core/fly.toml" — app + primary_region 'iad', rolling [deploy], HOST/PORT in [env], [mounts] acupatas_uploads → /data, [http_service] internal_port=3000 + force_https + auto_start + min_machines_running=2 + [[http_service.checks]], [[vm]] shared-cpu-2x 2gb. Rename the "app" and volume per product; keep the structure.
  - "_blueprints/acupatas-core/.github/workflows/fly.yml" — canonical Fly deploy: setup-flyctl, gate on VAPID secrets, "flyctl secrets set" for runtime secrets, "flyctl deploy --remote-only --build-arg PUBLIC_VAPID_KEY=...". Base any CI/CD on this.
- If the user adds more folders under "_blueprints/", treat each as a named style reference the same way.

TURSO (single database, raw SQL only — NO ORM): use the same getTursoClient() / PRIVATE_TURSO_* env for both (a) builder_chat_message + builder_app_state (seed platform, ensured in src/lib/turso-schema.ts) and (b) domain tables, all via runtime ensureXSchema() helpers using CREATE TABLE IF NOT EXISTS as in "_blueprints/acupatas-core/lib/auth.ts", "_blueprints/acupatas-core/lib/notifications.ts", "_blueprints/acupatas-core/lib/chat.ts". Follow the Qwik Turso docs pattern (createClient + execute). Do NOT introduce Drizzle, Prisma, or any ORM.
`;
