import { component$, useSignal, $, useVisibleTask$ } from '@builder.io/qwik';
import { routeLoader$, server$, useNavigate, type DocumentHead } from '@builder.io/qwik-city';
import { getSessionFromEvent, getUserRoleById } from '../../../lib/auth';
import { listNotifications, markNotificationAsRead, markAllNotificationsAsRead, type NotificationRecord } from '../../../lib/notifications';
import { listCaregiverChats, listOwnerChats } from '../../../lib/chat';
import { LuBell, LuCalendar, LuMessageSquare, LuCreditCard, LuBan, LuCheckCheck } from '@qwikest/icons/lucide';

export const useNotifications = routeLoader$(async (event) => {
    const session = await getSessionFromEvent(event);
    if (!session) throw event.redirect(302, '/auth?mode=login');

    const notifs = await listNotifications(session.userId);
    return notifs;
});

export const markAsRead = server$(async function (id: string) {
    const session = await getSessionFromEvent(this);
    if (!session) return { ok: false };
    await markNotificationAsRead(id, session.userId);
    return { ok: true };
});

export const markAllAsRead = server$(async function () {
    const session = await getSessionFromEvent(this);
    if (!session) return { ok: false };
    await markAllNotificationsAsRead(session.userId);
    return { ok: true };
});

export const refreshNotifications = server$(async function () {
    const session = await getSessionFromEvent(this);
    if (!session) return { ok: false, items: [] as NotificationRecord[] };
    const items = await listNotifications(session.userId);
    return { ok: true, items };
});

export const resolveNotificationChatTarget = server$(async function () {
    const session = await getSessionFromEvent(this);
    if (!session) return { ok: false, href: '' } as const;

    const role = ((await getUserRoleById(session.userId)) || 'owner') as 'owner' | 'caregiver';
    const chats = role === 'caregiver'
        ? await listCaregiverChats(session.userId)
        : await listOwnerChats(session.userId);

    const prioritizedStatuses = ['requested', 'accepted', 'paid', 'payment_sent', 'payment_confirmed', 'fee_submitted', 'active', 'in_progress'];
    const prioritized = chats.find((chat) => prioritizedStatuses.includes(String(chat.status || '').toLowerCase()));
    const fallback = prioritized || chats[0];

    if (!fallback?.id) return { ok: false, href: '' } as const;
    return { ok: true, href: `/dashboard/chat/${fallback.id}` } as const;
});

export const timeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = (now.getTime() - date.getTime()) / 1000; // seconds

    if (diff < 60) return 'Hace un momento';
    if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
    return `Hace ${Math.floor(diff / 86400)} días`;
};

export default component$(() => {
    const notificationsLoader = useNotifications();
    const notifications = useSignal([...notificationsLoader.value]);
    const filter = useSignal<'all' | 'unread'>('all');
    const notificationsPath = '/dashboard/notifications';
    const nav = useNavigate();

    useVisibleTask$(({ cleanup }) => {
        let syncDebounce: any;

        const refresh = async () => {
            const result = await refreshNotifications();
            if (result.ok && result.items) {
                notifications.value = [...result.items];
            }
        };

        const handleMessage = (event: MessageEvent) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'SYNC_COUNTS') {
                    clearTimeout(syncDebounce);
                    syncDebounce = setTimeout(refresh, 2000);
                }
            } catch (e) {
                // Ignore
            }
        };

        window.addEventListener('message', handleMessage);
        cleanup(() => {
            window.removeEventListener('message', handleMessage);
            clearTimeout(syncDebounce);
        });
    });

    const filtered = notifications.value.filter(n =>
        filter.value === 'all' ? true : !n.read
    );

    const handleClick = $(async (notification: typeof notifications.value[0]) => {
        // Mark as read
        if (!notification.read) {
            const markResult = await markAsRead(notification.id);
            if (!markResult.ok) {
                return;
            }
            notification.read = true;
        }
        // Navigate if link exists
        const normalizedLink = String(notification.link || '').trim();
        if (normalizedLink) {
            const href = normalizedLink.startsWith('/') ? normalizedLink : `/${normalizedLink}`;
            if (href !== '/dashboard/chat') {
                await nav(href);
                return;
            }
        }

        if (notification.type === 'booking' || notification.type === 'service' || notification.type === 'payment' || notification.type === 'message') {
            const resolved = await resolveNotificationChatTarget();
            if (resolved.ok && resolved.href) {
                await nav(resolved.href);
                return;
            }
            await nav('/dashboard/chat');
        }
    });

    const handleMarkAll = $(async () => {
        const markAllResult = await markAllAsRead();
        if (!markAllResult.ok) {
            return;
        }

        const refreshed = await refreshNotifications();
        if (refreshed.ok) {
            notifications.value = [...refreshed.items];
            return;
        }

        notifications.value.forEach(n => n.read = true);
    });

    return (
        <div class="min-h-screen bg-[#f6f6f6]">
            <div class="max-w-4xl mx-auto px-4 py-8 space-y-6">
                <header class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 class="text-2xl font-bold text-[#4a2e85]">Notificaciones</h1>
                        <p class="text-sm text-gray-600">Mantente al día con tu actividad</p>
                    </div>
                    <div class="flex items-center gap-3">
                        {notifications.value.some(n => !n.read) && (
                            <button
                                onClick$={handleMarkAll}
                                class="text-xs font-semibold text-[#ef7c43] hover:text-[#d66c3a] underline underline-offset-4 mr-2"
                            >
                                Marcar todo como leído
                            </button>
                        )}
                        <div class="flex gap-2 p-1 bg-white rounded-lg border border-[#4a2e85]/10">
                            <button
                                class={`px-3 py-1 text-sm rounded-md transition-colors ${filter.value === 'all' ? 'bg-[#4a2e85] text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                                onClick$={() => filter.value = 'all'}
                            >
                                Todas
                            </button>
                            <button
                                class={`px-3 py-1 text-sm rounded-md transition-colors ${filter.value === 'unread' ? 'bg-[#4a2e85] text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                                onClick$={() => filter.value = 'unread'}
                            >
                                No leídas
                            </button>
                        </div>
                    </div>
                </header>

                <div class="space-y-3">
                    {filtered.length > 0 ? (
                        filtered.map((notification) => (
                            <div
                                key={notification.id}
                                onClick$={() => handleClick(notification)}
                                class={`group relative bg-white rounded-xl p-4 border transition-all cursor-pointer hover:shadow-md ${notification.read ? 'border-[#4a2e85]/5 opacity-75' : 'border-[#4a2e85]/20 shadow-sm border-l-4 border-l-[#ef7c43]'
                                    }`}
                            >
                                <div class="flex gap-4">
                                    <div class={`p-3 rounded-full h-fit flex-shrink-0 ${notification.type === 'payment' ? 'bg-emerald-100 text-emerald-600' :
                                        notification.type === 'booking' ? 'bg-amber-100 text-amber-600' :
                                            notification.type === 'message' ? 'bg-blue-100 text-blue-600' :
                                                'bg-gray-100 text-gray-600'
                                        }`}>
                                        {notification.type === 'payment' && <LuCreditCard class="w-5 h-5" />}
                                        {notification.type === 'booking' && <LuCalendar class="w-5 h-5" />}
                                        {notification.type === 'message' && <LuMessageSquare class="w-5 h-5" />}
                                        {notification.type === 'system' && <LuBell class="w-5 h-5" />}
                                    </div>

                                    <div class="flex-1">
                                        <div class="flex justify-between items-start gap-2">
                                            <h3 class={`font-semibold ${notification.read ? 'text-gray-700' : 'text-[#4a2e85]'}`}>
                                                {notification.title}
                                            </h3>
                                            <span class="text-xs text-gray-400 whitespace-nowrap">{timeAgo(notification.createdAt)}</span>
                                        </div>
                                        <p class="text-sm text-gray-600 mt-1">{notification.message}</p>
                                    </div>
                                </div>

                                {notification.read && (
                                    <div class="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-[#4a2e85]/40" title="Leído">
                                        <LuCheckCheck class="w-4 h-4" />
                                    </div>
                                )}
                            </div>
                        ))
                    ) : (
                        <div class="text-center py-20 bg-white rounded-2xl border border-[#4a2e85]/5">
                            <div class="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                                <LuBan class="w-8 h-8" />
                            </div>
                            <h3 class="text-lg font-medium text-gray-900">Sin notificaciones</h3>
                            <p class="text-gray-500 text-sm mt-1">
                                {filter.value === 'unread' ? 'Estás al día. ¡Todo leído!' : 'No tienes notificaciones en tu historial.'}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

export const head: DocumentHead = {
    title: 'Notificaciones - ACUPATAS',
};

