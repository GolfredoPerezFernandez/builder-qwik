import type { RequestHandler } from '@builder.io/qwik-city';
import { ensureAuthSchema, getSessionFromEvent } from '../../../../lib/auth';
import { listNotifications } from '../../../../lib/notifications';

export const onGet: RequestHandler = async (event) => {
  await ensureAuthSchema();
  const session = await getSessionFromEvent(event);

  event.cacheControl({
    public: false,
    maxAge: 0,
    sMaxAge: 0,
    staleWhileRevalidate: 0,
    noStore: true,
  });

  if (!session) {
    event.json(200, { unread: 0, latestNotificationAt: '' });
    return;
  }

  try {
    const notifications = await listNotifications(session.userId);
    const unread = notifications.filter((notification) => !notification.read);
    event.json(200, {
      unread: unread.length,
      latestNotificationAt: unread[0]?.createdAt || '',
    });
    return;
  } catch {
    event.json(200, { unread: 0, latestNotificationAt: '' });
    return;
  }
};
