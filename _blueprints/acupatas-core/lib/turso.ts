import { createClient, type Client } from '@libsql/client';

let singletonClient: Client | null = null;
const globalStore = globalThis as any;

// Use globalThis to persist during Vite dev HMR
if (!globalStore.__tursoClient) {
  globalStore.__tursoClient = null;
}

export const getTursoClient = () => {
  if (globalStore.__tursoClient) return globalStore.__tursoClient;

  let url =
    process.env.PRIVATE_TURSO_DATABASE_URL ||
    process.env.TURSO_DATABASE_URL ||
    process.env.TURSO_URL ||
    '';

  let authToken = process.env.PRIVATE_TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN;

  // Use local SQLite if running on Fly.io (detected by /data volume) or if explicitly requested
  if (typeof window === 'undefined' && !url) {
    const isFly = process.env.FLY_APP_NAME !== undefined;
    if (isFly) {
      url = 'file:/data/acupatas.db';
    } else {
      url = 'file:dev.db';
    }
  }

  if (!url) {
    throw new Error('Turso database URL is not set and no local fallback available.');
  }

  const normalizeSqlArg = (value: unknown): string | number | Uint8Array | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'bigint') {
      const numberValue = Number(value);
      return Number.isFinite(numberValue) ? numberValue : value.toString();
    }
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Uint8Array) return value;
    return String(value);
  };

  const normalizeStatementArgs = (statement: unknown): unknown => {
    if (!statement || typeof statement !== 'object') return statement;
    if (!('args' in statement)) return statement;

    const statementWithArgs = statement as { args?: unknown };
    if (!Array.isArray(statementWithArgs.args)) return statement;

    return {
      ...(statement as Record<string, unknown>),
      args: statementWithArgs.args.map((arg) => normalizeSqlArg(arg)),
    };
  };

  const rawClient = createClient({ url, authToken });
  const wrappedClient = new Proxy(rawClient, {
    get(target, property, receiver) {
      if (property === 'execute') {
        return (statement: unknown) => target.execute(normalizeStatementArgs(statement) as any);
      }
      return Reflect.get(target, property, receiver);
    },
  });

  globalStore.__tursoClient = wrappedClient as Client;
  return globalStore.__tursoClient;
};

// Global set to track which schemas have been ensured in this process lifetime
if (!globalStore.__checkedSchemas) {
  globalStore.__checkedSchemas = new Set<string>();
}

export const isSchemaEnsured = (schemaName: string): boolean => {
  return globalStore.__checkedSchemas.has(schemaName);
};

export const markSchemaAsEnsured = (schemaName: string) => {
  globalStore.__checkedSchemas.add(schemaName);
};
