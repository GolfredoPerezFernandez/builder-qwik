import { getTursoClient, isSchemaEnsured, markSchemaAsEnsured } from './turso';
import { ensureAuthSchema } from './auth';

export type NotificationType = 'payment' | 'booking' | 'message' | 'system' | 'service';

export type NotificationRecord = {
    id: string;
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    read: boolean;
    createdAt: string;
    link?: string;
};

const isReadFlag = (value: unknown): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === '' || normalized === '0' || normalized === 'false' || normalized === 'null') {
            return false;
        }
        return true;
    }
    return Boolean(value);
};

export const ensureNotificationSchema = async () => {
    if (isSchemaEnsured('notifications')) return;
    await ensureAuthSchema();
    const client = getTursoClient();
    const sql = `create table if not exists notifications (
    id text primary key,
    user_id text not null,
    type text not null,
    title text not null,
    message text not null,
    read integer default 0,
    created_at text not null,
    link text
  );`;
    await client.execute(sql);

    // Table for Web Push subscriptions
    const pushSql = `create table if not exists push_subscriptions (
        id text primary key,
        user_id text not null,
        endpoint text not null,
        p256dh text not null,
        auth text not null,
        created_at text not null
    );`;
    await client.execute(pushSql);

    try {
        await client.execute(`create unique index if not exists idx_push_sub_user_endpoint on push_subscriptions (user_id, endpoint)`);
    } catch {
        // Index may not be supported or already exists
    }

    // Migration: add link column if missing (for older databases)
    try {
        await client.execute(`alter table notifications add column link text`);
    } catch {
        // Column already exists, ignore error
    }

    // Migration: add read column if missing (legacy databases)
    try {
        await client.execute(`alter table notifications add column read integer default 0`);
    } catch {
        // Column already exists, ignore error
    }

    // Migration: add created_at column if missing (legacy databases)
    try {
        const now = new Date().toISOString();
        await client.execute(`alter table notifications add column created_at text not null default '${now}'`);
    } catch {
        // Column already exists, ignore error
    }
    markSchemaAsEnsured('notifications');
};

export const createNotification = async (
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    link?: string
) => {
    if (!userId || String(userId).trim() === '' || userId === 'null' || userId === 'undefined') {
        console.warn('[Notifications] Attempted to create notification with empty or invalid user_id');
        return { ok: false, reason: 'missing_user_id' } as const;
    }

    await ensureNotificationSchema();
    const client = getTursoClient();

    const normalizedTitle = title.trim().toLowerCase();
    const normalizedLink = String(link || '').trim();

    if (normalizedTitle === 'servicio completado') {
        const duplicateResult = await client.execute({
            sql: `select id from notifications
                  where user_id = ?
                    and lower(trim(title)) = 'servicio completado'
                    and coalesce(link, '') = ?
                    and created_at >= datetime('now', '-10 minutes')
                  order by created_at desc
                  limit 1`,
            args: [userId, normalizedLink],
        });

        const duplicateId = duplicateResult.rows[0]?.id as string | undefined;
        if (duplicateId) {
            return { ok: true, id: duplicateId, deduped: true } as const;
        }
    }

    const id = `notif_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    await client.execute({
        sql: `insert into notifications (id, user_id, type, title, message, read, created_at, link)
          values (?, ?, ?, ?, ?, 0, ?, ?)`,
        args: [id, userId, type, title, message, now, normalizedLink || null],
    });

    try {
        const { notifyUserWs } = await import('../server/websocket');
        notifyUserWs(userId, { type: 'SYNC_COUNTS' });
    } catch {
        // Ignore if not in a server context where WS is available
    }

    return { ok: true, id };
};

export const listNotifications = async (userId: string) => {
    await ensureNotificationSchema();
    const client = getTursoClient();

    const res = await client.execute({
        sql: `select * from notifications where user_id = ? order by created_at desc limit 50`,
        args: [userId],
    });

    return res.rows.map((row: any) => ({
        id: row.id as string,
        userId: row.user_id as string,
        type: row.type as NotificationType,
        title: row.title as string,
        message: row.message as string,
        read: isReadFlag(row.read),
        createdAt: row.created_at as string,
        link: row.link as string | undefined,
    })) as NotificationRecord[];
};

export const markNotificationAsRead = async (id: string, userId: string) => {
    await ensureNotificationSchema();
    const client = getTursoClient();

    await client.execute({
        sql: `update notifications set read = 1 where id = ? and user_id = ?`,
        args: [id, userId],
    });

    try {
        const { notifyUserWs } = await import('../server/websocket');
        notifyUserWs(userId, { type: 'SYNC_COUNTS' });
    } catch {
        // Ignore if not in a server context where WS is available
    }

    return { ok: true };
};

export const markAllNotificationsAsRead = async (userId: string) => {
    await ensureNotificationSchema();
    const client = getTursoClient();

    await client.execute({
        sql: `update notifications set read = 1 where user_id = ?`,
        args: [userId],
    });

    try {
        const { notifyUserWs } = await import('../server/websocket');
        notifyUserWs(userId, { type: 'SYNC_COUNTS' });
    } catch {
        // Ignore if not in a server context where WS is available
    }

    return { ok: true };
};

export const markMessageNotificationsAsReadForChat = async (userId: string, chatId: string) => {
    await ensureNotificationSchema();
    const client = getTursoClient();

    const exactLink = `/dashboard/chat/${chatId}`;
    const likeLink = `%/dashboard/chat/${chatId}%`;

    await client.execute({
        sql: `update notifications
              set read = 1
              where user_id = ?
                and coalesce(cast(read as integer), 0) = 0
                and (link = ? or link like ?)` ,
        args: [userId, exactLink, likeLink],
    });

    try {
        const { notifyUserWs } = await import('../server/websocket');
        notifyUserWs(userId, { type: 'SYNC_COUNTS' });
    } catch {
        // Ignore if not in a server context where WS is available
    }

    return { ok: true };
};

export const getUnreadNotificationsCount = async (userId: string) => {
    await ensureNotificationSchema();
    const client = getTursoClient();

    let res;
    try {
        res = await client.execute({
            sql: `select count(1) as total from notifications where user_id = ? and coalesce(cast(read as integer), 0) = 0`,
            args: [userId],
        });
    } catch {
        // Fallback for edge legacy schemas
        res = await client.execute({
            sql: `select count(1) as total from notifications where user_id = ?`,
            args: [userId],
        });
    }

    return Number((res.rows[0] as any)?.total ?? 0);
};
