import { server$ } from '@builder.io/qwik-city';
import { getTursoClient } from '~/lib/turso';
import { ensureTursoBuilderCoreTables } from '~/lib/turso-schema';

export type BuilderAppStateRow = {
  scope: string;
  entity_type: string;
  entity_id: string;
  payload: string;
  updated_at: number;
};

/** Upsert JSON payload for a logical entity (constructed app data, same DB as chat). */
export const upsertBuilderAppState = server$(
  async function (scope: string, entityType: string, entityId: string, payloadJson: string) {
    await ensureTursoBuilderCoreTables();
    const c = getTursoClient();
    const sc = String(scope || '/');
    const et = String(entityType || 'default');
    const eid = String(entityId ?? '');
    const now = Date.now();
    await c.execute({
      sql: `INSERT INTO builder_app_state (scope, entity_type, entity_id, payload, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(scope, entity_type, entity_id) DO UPDATE SET
              payload = excluded.payload,
              updated_at = excluded.updated_at`,
      args: [sc, et, eid, payloadJson, now],
    });
  },
);

export const loadBuilderAppState = server$(async function (
  scope: string,
  entityType: string,
  entityId: string,
) {
  await ensureTursoBuilderCoreTables();
  const c = getTursoClient();
  const res = await c.execute({
    sql: `SELECT scope, entity_type, entity_id, payload, updated_at
          FROM builder_app_state
          WHERE scope = ? AND entity_type = ? AND entity_id = ?`,
    args: [String(scope || '/'), String(entityType || 'default'), String(entityId ?? '')],
  });
  const rows = (res as { rows?: unknown }).rows;
  const list = Array.isArray(rows) ? rows : [];
  const row = list[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    scope: String(row.scope ?? ''),
    entity_type: String(row.entity_type ?? ''),
    entity_id: String(row.entity_id ?? ''),
    payload: String(row.payload ?? ''),
    updated_at: Number(row.updated_at ?? 0),
  } satisfies BuilderAppStateRow;
});

export const listBuilderAppStateByType = server$(async function (scope: string, entityType: string) {
  await ensureTursoBuilderCoreTables();
  const c = getTursoClient();
  const res = await c.execute({
    sql: `SELECT scope, entity_type, entity_id, payload, updated_at
          FROM builder_app_state
          WHERE scope = ? AND entity_type = ?
          ORDER BY updated_at DESC`,
    args: [String(scope || '/'), String(entityType || 'default')],
  });
  const rawRows = (res as { rows?: unknown }).rows;
  const list = Array.isArray(rawRows) ? rawRows : [];
  const out: BuilderAppStateRow[] = [];
  for (const row of list as Record<string, unknown>[]) {
    out.push({
      scope: String(row.scope ?? ''),
      entity_type: String(row.entity_type ?? ''),
      entity_id: String(row.entity_id ?? ''),
      payload: String(row.payload ?? ''),
      updated_at: Number(row.updated_at ?? 0),
    });
  }
  return out;
});

export const deleteBuilderAppState = server$(async function (
  scope: string,
  entityType: string,
  entityId: string,
) {
  await ensureTursoBuilderCoreTables();
  const c = getTursoClient();
  await c.execute({
    sql: 'DELETE FROM builder_app_state WHERE scope = ? AND entity_type = ? AND entity_id = ?',
    args: [String(scope || '/'), String(entityType || 'default'), String(entityId ?? '')],
  });
});
