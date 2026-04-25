import type { SubAgent } from "deepagents";
import {
  UI_SPECIALIST_PROMPT,
  QWIK_SSR_SPECIALIST_PROMPT,
  QA_PROMPT,
} from "../prompts/builder";
import { QWIK_PROMPT } from "../prompts/qwik";
import { UI_PROMPT } from "../prompts/ui";
import { DOCS_RESEARCH_PROMPT } from "../prompts/docs-research";
import { TURSO_SPECIALIST_PROMPT } from "../prompts/turso";
import { INTEGRATION_SPECIALIST_PROMPT } from "../prompts/integration";
import { AUTH_SESSIONS_SPECIALIST_PROMPT } from "../prompts/auth-sessions";
import { REALTIME_PUSH_SPECIALIST_PROMPT } from "../prompts/realtime-push";
import { UPLOADS_MEDIA_SPECIALIST_PROMPT } from "../prompts/uploads-media";
import { DEPLOY_SPECIALIST_PROMPT } from "../prompts/deploy";
import { ENV_SPECIALIST_PROMPT } from "../prompts/env-vars";
import { APP_BUILDER_SUBAGENT_PROMPT_LITE } from "../prompts/builder-local";
import { runBuild, runLint, runTypecheck } from "../tools/project-tools";
import { webDocsTools } from "../tools/web-docs-tools";

/**
 * Declarative specialist definitions for the Deep Agents `task` tool.
 * Filesystem access comes from the default `createFilesystemMiddleware` stack
 * (virtual fs tools). We only add repo-specific tools where needed (QA gates).
 */
/**
 * One short-prompt subagent for OpenAI-compatible local servers (LM Studio, etc.)
 * where the stock `task` tool description + many specialist prompts exceed n_ctx.
 */
export function makeLiteLocalSubagents(): SubAgent[] {
  return [
    {
      name: "app-builder",
      description:
        "Default builder: Qwik routes/components, Tailwind, copy, public assets; use for most in-app product changes.",
      systemPrompt: APP_BUILDER_SUBAGENT_PROMPT_LITE,
      tools: [runLint, runTypecheck, runBuild] as any,
    },
  ];
}

export function makeSpecialistSubagents(): SubAgent[] {
  return [
    {
      name: "ui-specialist",
      description:
        "Presentation only: components, route JSX, Tailwind v4, blueprints; no routeLoader$/routeAction$/server$.",
      systemPrompt: `${UI_SPECIALIST_PROMPT}\n${QWIK_PROMPT}\n${UI_PROMPT}`,
      tools: [],
    },
    {
      name: "qwik-ssr-specialist",
      description:
        "Qwik City SSR/server: routeLoader$, routeAction$, server$, API routes, cookies, env — not visual polish.",
      systemPrompt: `${QWIK_SSR_SPECIALIST_PROMPT}\n${QWIK_PROMPT}`,
      tools: [],
    },
    {
      name: "docs-research-specialist",
      description:
        "Searches and fetches public documentation (Qwik, Qwik City, Turso/libSQL, Tailwind, MDN). Read-only; returns links and facts.",
      systemPrompt: DOCS_RESEARCH_PROMPT,
      tools: webDocsTools as any,
    },
    {
      name: "turso-specialist",
      description:
        "Turso/libSQL end-to-end: getTursoClient, PRIVATE_TURSO_* env, file vs remote URLs, @libsql/client, raw SQL schema via CREATE TABLE IF NOT EXISTS + ensureXSchema(), server-side persistence.",
      systemPrompt: TURSO_SPECIALIST_PROMPT,
      tools: [],
    },
    {
      name: "integration-specialist",
      description:
        "Wires loaders/actions ↔ Turso (raw SQL) ↔ UI: serialization, types, no secret leaks across the stack.",
      systemPrompt: `${INTEGRATION_SPECIALIST_PROMPT}\n${QWIK_PROMPT}`,
      tools: [],
    },
    {
      name: "auth-sessions-specialist",
      description:
        "Server sessions, cookies, password hashing, onRequest guards, role matrices; coordinates tables with turso/data.",
      systemPrompt: `${AUTH_SESSIONS_SPECIALIST_PROMPT}\n${QWIK_PROMPT}`,
      tools: [],
    },
    {
      name: "realtime-push-specialist",
      description:
        "Web Push (VAPID), service workers, WebSocket/SSE realtime; aware of Node vs Cloudflare runtime limits.",
      systemPrompt: `${REALTIME_PUSH_SPECIALIST_PROMPT}\n${QWIK_PROMPT}`,
      tools: [],
    },
    {
      name: "uploads-media-specialist",
      description:
        "File uploads, /uploads layout, image resizer, URL resolution; auth-gated server$ uploads.",
      systemPrompt: `${UPLOADS_MEDIA_SPECIALIST_PROMPT}\n${QWIK_PROMPT}`,
      tools: [],
    },
    {
      name: "qa-specialist",
      description: "Runs validation logic (lint, build, typecheck) and reports failures.",
      systemPrompt: QA_PROMPT,
      tools: [runLint, runTypecheck, runBuild] as any,
    },
    {
      name: "deploy-specialist",
      description:
        "Owns Dockerfile, fly.toml, .dockerignore, and GitHub Actions (Fly). Ensures non-root user, pinned Node 20 LTS, correct app name/region/volumes/VM, health checks, and that PUBLIC_* are build-args while PRIVATE_* are flyctl secrets (never baked into the image).",
      systemPrompt: DEPLOY_SPECIALIST_PROMPT,
      tools: [],
    },
    {
      name: "env-specialist",
      description:
        "Owns the env contract per Qwik docs: PUBLIC_* (build-time, import.meta.env) vs server-only (requestEvent.env.get / this.env.get / plugin@*.ts singletons). Bans process.env in src/, bans secrets in PUBLIC_*, and keeps the .env inventory (Turso, OpenAI, VAPID, ORIGIN, UPLOAD_DIR) consistent across code, .env, Dockerfile and Fly secrets.",
      systemPrompt: ENV_SPECIALIST_PROMPT,
      tools: [],
    },
  ];
}
