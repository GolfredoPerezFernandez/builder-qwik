import type { RequestEventBase } from '@builder.io/qwik-city';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { getTursoClient, isSchemaEnsured, markSchemaAsEnsured } from './turso';

export interface SessionInfo {
  userId: string;
  token: string;
}

export const ensureAuthSchema = async () => {
  if (isSchemaEnsured('auth')) return;
  const client = getTursoClient();
  const statements = [
    `create table if not exists users (
      id text primary key,
      email text not null unique,
      role text not null,
      email_verified integer not null default 1,
      is_banned integer not null default 0,
      ban_reason text,
      created_at text not null
    );`,
    `create table if not exists user_auth (
      user_id text primary key,
      password_hash text not null,
      password_salt text not null,
      created_at text not null,
      updated_at text not null
    );`,
    `create table if not exists sessions (
      id text primary key,
      user_id text not null,
      token text not null unique,
      expires_at text not null,
      created_at text not null,
      last_seen text not null
    );`,
    `create table if not exists blacklisted_identities (
      type text not null,
      value text not null,
      user_id text,
      reason text,
      created_at text not null,
      primary key(type, value)
    );`,
  ];
  for (const sql of statements) {
    await client.execute(sql);
  }

  // Migration for existing users table
  try {
    await client.execute('alter table users add column is_banned integer not null default 0');
  } catch (e) { }
  try {
    await client.execute('alter table users add column ban_reason text');
  } catch (e) { }

  markSchemaAsEnsured('auth');
};

export const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
};

export const verifyPassword = (password: string, salt: string, hash: string) => {
  const nextHash = scryptSync(password, salt, 64).toString('hex');
  return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(nextHash, 'hex'));
};

export const createSession = async (userId: string, event: RequestEventBase) => {
  const client = getTursoClient();

  // Clear any existing session first to prevent stale session data
  const existingToken = event.cookie.get('acupatas_session')?.value;
  if (existingToken) {
    await client.execute({
      sql: 'delete from sessions where token = ?',
      args: [existingToken],
    });
  }

  const token = `sess_${randomUUID()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  await client.execute({
    sql: 'insert into sessions(id, user_id, token, expires_at, created_at, last_seen) values (?, ?, ?, ?, ?, ?)',
    args: [
      `ses_${randomUUID()}`,
      userId,
      token,
      expiresAt.toISOString(),
      now.toISOString(),
      now.toISOString(),
    ],
  });

  event.cookie.set('acupatas_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: event.url.protocol === 'https:',
    maxAge: 7 * 24 * 60 * 60,
  });

  return { token, userId } as SessionInfo;
};

export const clearSession = async (event: RequestEventBase) => {
  const token = event.cookie.get('acupatas_session')?.value;
  if (token) {
    const client = getTursoClient();
    await client.execute({
      sql: 'delete from sessions where token = ?',
      args: [token],
    });
  }
  event.cookie.delete('acupatas_session', { path: '/' });
};

export const getSessionFromEvent = async (event: RequestEventBase) => {
  const token = event.cookie.get('acupatas_session')?.value;
  return await getSessionByToken(token);
};

export const getSessionByToken = async (token?: string | null) => {
  if (!token) {
    console.warn('[auth] No session token found in cookies');
    return null;
  }

  const client = getTursoClient();
  const now = new Date();
  const result = await client.execute({
    sql: 'select user_id, expires_at from sessions where token = ? limit 1',
    args: [token],
  });
  const row = result.rows[0] as any;
  if (!row) {
    console.warn(`[auth] No session found in DB for token: ${token}`);
    return null;
  }
  const expiresAt = new Date(row.expires_at);
  if (expiresAt <= now) {
    await client.execute({
      sql: 'delete from sessions where token = ?',
      args: [token],
    });
    console.warn(`[auth] Session expired for user ${row.user_id}, token: ${token}, expiresAt: ${row.expires_at}, now: ${now.toISOString()}`);
    return null;
  }

  await client.execute({
    sql: 'update sessions set last_seen = ? where token = ?',
    args: [now.toISOString(), token],
  });

  return { userId: row.user_id as string, token } as SessionInfo;
};

export const getUserRoleById = async (userId: string) => {
  const client = getTursoClient();
  const result = await client.execute({
    sql: 'select role from users where id = ? limit 1',
    args: [userId],
  });
  const row = result.rows[0] as any;
  return row?.role as string | undefined;
};

export const getUserById = async (userId: string) => {
  const client = getTursoClient();
  const result = await client.execute({
    sql: 'select id, email, role, email_verified, created_at from users where id = ? limit 1',
    args: [userId],
  });
  const row = result.rows[0] as any;
  if (!row) return null;
  return {
    id: row.id as string,
    email: row.email as string,
    role: row.role as string,
    emailVerified: Boolean(row.email_verified ?? 0),
    createdAt: row.created_at as string,
  } as const;
};

export const updateUserEmail = async (userId: string, email: string) => {
  const client = getTursoClient();
  // update email and mark as not verified
  await client.execute({
    sql: 'update users set email = ?, email_verified = 0 where id = ?',
    args: [email, userId],
  });
  return { ok: true } as const;
};

export const switchUserRole = async (userId: string, targetRole: 'owner' | 'caregiver') => {
  const client = getTursoClient();
  await client.execute({
    sql: 'update users set role = ? where id = ?',
    args: [targetRole, userId],
  });
  return { ok: true } as const;
};

export const isAdmin = (user: { email?: string } | null | undefined): boolean => {
  if (!user || !user.email) return false;
  return user.email.trim().toLowerCase() === 'admin@gmail.com';
};
