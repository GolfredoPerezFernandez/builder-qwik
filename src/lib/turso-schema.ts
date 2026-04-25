import { getTursoClient, isSchemaEnsured, markSchemaAsEnsured } from './turso';

/**
 * Single Turso database — raw SQL only (no ORM). Holds:
 * - Platform / agent: `builder_*` tables (created here at runtime, IF NOT EXISTS).
 * - Product app: domain tables created by feature-specific `ensureXSchema()` helpers
 *   (CREATE TABLE IF NOT EXISTS, style of `_blueprints/acupatas-core/lib/*.ts`).
 */
const BUILDER_CORE_SCHEMA_KEY = 'turso_builder_core_v1';

/** Ensures chat history + generic app-state tables used by the seed builder. */
export async function ensureTursoBuilderCoreTables() {
  if (isSchemaEnsured(BUILDER_CORE_SCHEMA_KEY)) return;
  const c = getTursoClient();

  await c.execute(`
    CREATE TABLE IF NOT EXISTS builder_chat_message (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  await c.execute(
    `CREATE INDEX IF NOT EXISTS idx_builder_chat_conv ON builder_chat_message (conversation_id, id)`,
  );

  await c.execute(`
    CREATE TABLE IF NOT EXISTS builder_app_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL DEFAULT '/',
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL DEFAULT '',
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(scope, entity_type, entity_id)
    )
  `);
  await c.execute(
    `CREATE INDEX IF NOT EXISTS idx_builder_app_state_lookup ON builder_app_state (scope, entity_type, entity_id)`,
  );

  markSchemaAsEnsured(BUILDER_CORE_SCHEMA_KEY);
}
