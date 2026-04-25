// src/routes/dashboard/layout.tsx

import { component$, Slot, useVisibleTask$, useSignal, useStore, $ } from '@builder.io/qwik';
import LogoImage from '~/media/logo.png?jsx';

import { Link, routeLoader$, useLocation, useNavigate, server$ } from '@builder.io/qwik-city';

import type { RequestHandler } from '@builder.io/qwik-city';

import { clearSession, ensureAuthSchema, getSessionFromEvent, getUserRoleById, getUserById } from '../../lib/auth';
import { listNotifications } from '../../lib/notifications';
import { ensureChatSchema } from '../../lib/chat';
import { ensureServiceSchema } from '../../lib/services';
import { getTursoClient } from '../../lib/turso';

import {
  LuX,
  LuChevronLeft,
  LuChevronRight,
  LuCalendarCheck2,
  LuUsers2,
  LuScan,
  LuMessageSquare,
  LuBellRing,
  LuBookOpen,
  LuLogOut,
  LuSettings,
  LuCreditCard,
  LuShieldCheck,
} from '@qwikest/icons/lucide';



export const onGet: RequestHandler = async ({ cacheControl }) => {
  cacheControl({
    public: false,
    maxAge: 0,
    sMaxAge: 0,
    staleWhileRevalidate: 0,
  });
};

export const onRequest: RequestHandler = async (event) => {

  await ensureAuthSchema();

  const session = await getSessionFromEvent(event);

  if (!session) {

    throw event.redirect(302, '/auth?mode=login');

  }

  const role = await getUserRoleById(session.userId);
  const user = await getUserById(session.userId);
  const isAdmin = (user?.email || '').trim().toLowerCase() === 'admin@gmail.com';

  const path = event.url.pathname;

  const redirectByRole = () => {
    if (role === 'caregiver') return event.redirect(302, '/dashboard/caregiver');
    return event.redirect(302, '/dashboard/owner');
  };

  if (path === '/dashboard') {
    if (isAdmin) throw event.redirect(302, '/dashboard/admin');
    if (role === 'caregiver') throw event.redirect(302, '/dashboard/caregiver');
    if (role === 'owner') throw event.redirect(302, '/dashboard/owner');
  }

  // Protección estricta de rutas de administración
  if (path.startsWith('/dashboard/admin') && !isAdmin) {
    throw redirectByRole();
  }

  // Protección de rutas específicas por rol
  if (isAdmin) {
    // Admin puede acceder al panel admin y al chat global.
    // Cualquier otra ruta del dashboard redirige al panel de admin.
    const isAllowedAdminPath =
      path.startsWith('/dashboard/admin') ||
      path.startsWith('/dashboard/chat') ||
      path.startsWith('/dashboard/notifications');
    if (!isAllowedAdminPath) {
      throw event.redirect(302, '/dashboard/admin');
    }
    return;
  }

  if (role === 'caregiver') {
    // Cuidador no puede ver panel de dueño ni búsqueda
    if (path.startsWith('/dashboard/owner') || path.startsWith('/dashboard/caregiver-search')) {
      throw event.redirect(302, '/dashboard/caregiver');
    }
  } else {
    // Dueño (o default) no puede ver panel de cuidador ni academia
    // IMPORTANTE: caregiver-search empieza por caregiver, así que debemos excluirlo explícitamente
    // También debemos permitir /dashboard/caregiver/[id] (detalle del perfil)
    const isCaregiverDashboardHome = path === '/dashboard/caregiver' || path === '/dashboard/caregiver/';
    if (isCaregiverDashboardHome || path.startsWith('/dashboard/academia')) {
      throw event.redirect(302, '/dashboard/owner');
    }
  }

};
type NavItem = { href: string; label: string; icon: any };



const NAV_OWNER: NavItem[] = [
  { href: '/dashboard/owner', label: 'Panel Dueño', icon: LuUsers2 },
  { href: '/dashboard/caregiver-search', label: 'Buscar Cuidador', icon: LuScan },
  { href: '/dashboard/chat', label: 'Chat', icon: LuMessageSquare },
  { href: '/dashboard/notifications', label: 'Notificaciones', icon: LuBellRing },
  { href: '/dashboard/payment', label: 'Pagos', icon: LuCreditCard },
  { href: '/dashboard/settings', label: 'Configuración', icon: LuSettings },
];

const NAV_CAREGIVER: NavItem[] = [
  { href: '/dashboard/caregiver', label: 'Panel Cuidador', icon: LuCalendarCheck2 },
  { href: '/dashboard/academia', label: 'Academia', icon: LuBookOpen },
  { href: '/dashboard/chat', label: 'Chat', icon: LuMessageSquare },
  { href: '/dashboard/notifications', label: 'Notificaciones', icon: LuBellRing },
  { href: '/dashboard/payment', label: 'Pagos', icon: LuCreditCard },
  { href: '/dashboard/settings', label: 'Configuración', icon: LuSettings },
];

const NAV_ADMIN: NavItem[] = [
  { href: '/dashboard/admin', label: 'Panel Admin', icon: LuShieldCheck },
  { href: '/dashboard/admin/comisiones', label: 'Comisiones', icon: LuCreditCard },
  { href: '/dashboard/admin/transacciones-bdv', label: 'Transacciones BDV', icon: LuCreditCard },
  { href: '/dashboard/admin/historial', label: 'Historial', icon: LuBookOpen },
  { href: '/dashboard/chat', label: 'Chat Global', icon: LuMessageSquare },
  { href: '/dashboard/notifications', label: 'Notificaciones', icon: LuBellRing },
];

export const useRole = routeLoader$(async (event) => {
  await ensureAuthSchema();
  const session = await getSessionFromEvent(event);
  if (!session) return 'owner';
  return (await getUserRoleById(session.userId)) || 'owner';
});

export const useIsAdmin = routeLoader$(async (event) => {
  await ensureAuthSchema();
  const session = await getSessionFromEvent(event);
  if (!session) return false;
  const user = await getUserById(session.userId);
  return (user?.email || '').trim().toLowerCase() === 'admin@gmail.com';
});

export const useSessionId = routeLoader$(async (event) => {
  const session = await getSessionFromEvent(event);
  return session?.userId || '';
});

export const useInitialUnreadNotifications = routeLoader$(async (event) => {
  await ensureAuthSchema();
  const session = await getSessionFromEvent(event);
  if (!session) return 0;
  try {
    const notifications = await listNotifications(session.userId);
    return notifications.filter((notification) => !notification.read).length;
  } catch {
    return 0;
  }
});

const logoutServer = server$(async function () {
  await clearSession(this);
  return { ok: true } as const;
});

const getRealtimeUnreadNotifications = server$(async function () {
  await ensureAuthSchema();
  const session = await getSessionFromEvent(this);
  if (!session) {
    return { notifications: 0, latestNotificationAt: '' } as const;
  }

  try {
    const notifications = await listNotifications(session.userId);
    const unread = notifications.filter((notification) => !notification.read);
    return {
      notifications: unread.length,
      latestNotificationAt: unread[0]?.createdAt || '',
    } as const;
  } catch {
    return { notifications: 0, latestNotificationAt: '' } as const;
  }
});

const getSidebarRealtimeCounts = server$(async function () {
  await ensureAuthSchema();
  const session = await getSessionFromEvent(this);
  if (!session) {
    return {
      notifications: 0,
      chats: 0,
      requests: 0,
      total: 0,
      latestNotificationAt: '',
      latestChatAt: '',
      latestRequestAt: '',
    } as const;
  }

  const role = (await getUserRoleById(session.userId)) || 'owner';
  const user = await getUserById(session.userId);
  const isAdmin = (user?.email || '').trim().toLowerCase() === 'admin@gmail.com';

  const client = getTursoClient();

  let unreadNotifications = 0;
  let latestNotificationAt = '';
  let unreadMessageNotifications = 0;
  let latestMessageNotificationAt = '';

  try {
    const notifications = await listNotifications(session.userId);
    const unread = notifications.filter((notification) => !notification.read);
    unreadNotifications = unread.length;
    latestNotificationAt = unread[0]?.createdAt || '';

    const unreadMessage = unread.filter((notification) => notification.type === 'message');
    unreadMessageNotifications = unreadMessage.length;
    latestMessageNotificationAt = unreadMessage[0]?.createdAt || '';
  } catch (err) {
    console.error('[Layout Turso Error] Fetching notifications:', err);
    unreadNotifications = 0;
    latestNotificationAt = '';
    unreadMessageNotifications = 0;
    latestMessageNotificationAt = '';
  }

  try {
    await ensureChatSchema();
  } catch (err) {
    console.error('[Layout Turso Error] ensureChatSchema:', err);
  }
  try {
    await ensureServiceSchema();
  } catch (err) {
    console.error('[Layout Turso Error] ensureServiceSchema:', err);
  }

  let unreadChats = 0;
  let latestChatAt = '';
  try {
    if (isAdmin) {
      const allChatsRes = await client.execute({
        sql: 'select coalesce(sum(unread), 0) as total from chats where open = 1 and unread > 0',
        args: [],
      });
      unreadChats = Number((allChatsRes.rows[0] as any)?.total ?? 0);
      const latestChatRes = await client.execute({
        sql: 'select max(updated_at) as latest from chats where open = 1 and unread > 0',
        args: [],
      });
      latestChatAt = String((latestChatRes.rows[0] as any)?.latest ?? '');
    } else if (role === 'caregiver') {
      const caregiverChatsRes = await client.execute({
        sql: 'select coalesce(sum(unread), 0) as total from chats where caregiver_id = ? and open = 1 and unread > 0',
        args: [session.userId],
      });
      unreadChats = Number((caregiverChatsRes.rows[0] as any)?.total ?? 0);
      const latestChatRes = await client.execute({
        sql: 'select max(updated_at) as latest from chats where caregiver_id = ? and open = 1 and unread > 0',
        args: [session.userId],
      });
      latestChatAt = String((latestChatRes.rows[0] as any)?.latest ?? '');
    } else {
      const ownerChatsRes = await client.execute({
        sql: 'select coalesce(sum(unread), 0) as total from chats where owner_id = ? and open = 1 and unread > 0',
        args: [session.userId],
      });
      unreadChats = Number((ownerChatsRes.rows[0] as any)?.total ?? 0);
      const latestChatRes = await client.execute({
        sql: 'select max(updated_at) as latest from chats where owner_id = ? and open = 1 and unread > 0',
        args: [session.userId],
      });
      latestChatAt = String((latestChatRes.rows[0] as any)?.latest ?? '');
    }
  } catch (err) {
    console.error('[Layout Turso Error] Fetching chats:', err);
    unreadChats = 0;
    latestChatAt = '';
  }

  if (!isAdmin) {
    unreadChats = unreadMessageNotifications;
    latestChatAt = latestMessageNotificationAt || latestChatAt;
  } else if (unreadChats <= 0 && unreadMessageNotifications > 0) {
    unreadChats = unreadMessageNotifications;
    latestChatAt = latestMessageNotificationAt || latestChatAt;
  }

  let actionableRequests = 0;
  let latestRequestAt = '';
  try {
    if (isAdmin) {
      const requestsRes = await client.execute({
        sql: "select count(1) as total from bookings where status in ('requested', 'payment_sent', 'fee_submitted')",
        args: [],
      });
      actionableRequests = Number((requestsRes.rows[0] as any)?.total ?? 0);
      const latestRequestRes = await client.execute({
        sql: "select max(updated_at) as latest from bookings where status in ('requested', 'payment_sent', 'fee_submitted')",
        args: [],
      });
      latestRequestAt = String((latestRequestRes.rows[0] as any)?.latest ?? '');
    } else if (role === 'caregiver') {
      const requestsRes = await client.execute({
        sql: "select count(1) as total from bookings where caregiver_id = ? and status in ('requested', 'payment_sent', 'fee_submitted')",
        args: [session.userId],
      });
      actionableRequests = Number((requestsRes.rows[0] as any)?.total ?? 0);
      const latestRequestRes = await client.execute({
        sql: "select max(updated_at) as latest from bookings where caregiver_id = ? and status in ('requested', 'payment_sent', 'fee_submitted')",
        args: [session.userId],
      });
      latestRequestAt = String((latestRequestRes.rows[0] as any)?.latest ?? '');
    } else {
      const requestsRes = await client.execute({
        sql: "select count(1) as total from bookings where owner_id = ? and status in ('accepted', 'payment_rejected')",
        args: [session.userId],
      });
      actionableRequests = Number((requestsRes.rows[0] as any)?.total ?? 0);
      const latestRequestRes = await client.execute({
        sql: "select max(updated_at) as latest from bookings where owner_id = ? and status in ('accepted', 'payment_rejected')",
        args: [session.userId],
      });
      latestRequestAt = String((latestRequestRes.rows[0] as any)?.latest ?? '');
    }
  } catch (err) {
    console.error('[Layout Turso Error] Fetching requests:', err);
    actionableRequests = 0;
    latestRequestAt = '';
  }

  const total = unreadNotifications + unreadChats + actionableRequests;

  return {
    notifications: unreadNotifications,
    chats: unreadChats,
    requests: actionableRequests,
    total,
    latestNotificationAt,
    latestChatAt,
    latestRequestAt,
  } as const;
});


export default component$(() => {

  const loc = useLocation();
  const roleSig = useRole();
  const isAdminSig = useIsAdmin();
  const sessionId = useSessionId();
  const initialUnreadNotificationsSig = useInitialUnreadNotifications();

  let navItems;
  if (isAdminSig.value) {
    navItems = NAV_ADMIN;
  } else {
    navItems = roleSig.value === 'caregiver' ? NAV_CAREGIVER : NAV_OWNER;
  }

  const requestsBadgeHref = navItems.some((item) => item.href === '/dashboard/payment')
    ? '/dashboard/payment'
    : (navItems[0]?.href || '');

  // Dedicated signals for badge counts — guaranteed reactive in JSX
  const badgeNotifications = useSignal(initialUnreadNotificationsSig.value);
  const badgeChats = useSignal(0);
  const badgeRequests = useSignal(0);

  const getBadgeValueForHref = (href: string) => {
    if (href === '/dashboard/notifications') return badgeNotifications.value;
    if (href === '/dashboard/chat') return badgeChats.value;
    if (href === requestsBadgeHref) return badgeRequests.value;
    return 0;
  };

  const nav = useNavigate();
  const liveCounts = useStore({
    notifications: initialUnreadNotificationsSig.value,
    chats: 0,
    requests: 0,
    total: initialUnreadNotificationsSig.value,
    latestNotificationAt: '',
    latestChatAt: '',
    latestRequestAt: '',
  });
  const toastState = useStore({
    initialized: false,
    items: [] as Array<{ id: number; title: string; message: string; href: string }>,
  });

  const closeToast = $((id: number) => {
    toastState.items = toastState.items.filter((item) => item.id !== id);
  });

  const openToastLink = $(async (id: number, href: string) => {
    toastState.items = toastState.items.filter((item) => item.id !== id);
    await nav(href);
  });

  const handleLogout = $(async () => {
    await logoutServer();
    await nav('/auth?mode=login');
  });

  const isActive = (href: string) =>

    loc.url.pathname === href || (href !== '/dashboard' && loc.url.pathname.startsWith(href));



  // Sidebar abierto por defecto en desktop, cerrado en mobile

  const sidebarOpen = useSignal(true);
  const notificationsBadgePulse = useSignal(false);



  const closeSidebarOnMobile = $(() => {
    if (window.matchMedia('(max-width: 1024px)').matches) {
      sidebarOpen.value = false;
    }
  });


  // eslint-disable-next-line qwik/no-use-visible-task

  useVisibleTask$(() => {

    if (window.innerWidth <= 1024) sidebarOpen.value = false;

  }, { strategy: 'document-ready' });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    // Since Qwik's $(...) serialization turns external generic `let` variables into readonly constants,
    // we move `isSyncing` directly into a tracked signal, and avoid using `$` inside the visible task.
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectDelayMs = 2000;
    let pulseTimer: ReturnType<typeof setTimeout> | undefined;
    let isSyncing = false;

    const syncCounts = async () => {
      if (isSyncing) return;
      isSyncing = true;
      try {
        const counts = await getSidebarRealtimeCounts();

        const nextNotifications = counts.notifications;
        const nextLatestNotificationAt = counts.latestNotificationAt;
        const nextTotal = counts.total;

        const notificationCountChanged = toastState.initialized && nextNotifications > liveCounts.notifications;

        if (notificationCountChanged) {
          notificationsBadgePulse.value = true;
          if (pulseTimer) clearTimeout(pulseTimer);
          pulseTimer = setTimeout(() => {
            notificationsBadgePulse.value = false;
          }, 420);
        }

        if (toastState.initialized) {
          const notificationsDelta = nextNotifications - liveCounts.notifications;
          const chatsDelta = counts.chats - liveCounts.chats;
          const requestsDelta = counts.requests - liveCounts.requests;

          if (notificationsDelta > 0) {
            const qty = Math.max(1, notificationsDelta);
            const id = Date.now() + Math.floor(Math.random() * 1000);
            const newToast = { id, title: 'Nueva notificación', message: `Tienes ${qty} notificación${qty > 1 ? 'es' : ''} nueva${qty > 1 ? 's' : ''}.`, href: '/dashboard/notifications' };
            toastState.items.push(newToast);
            toastState.items = [...toastState.items]; // Force proxy reactivity
            setTimeout(() => {
              toastState.items = toastState.items.filter((item) => item.id !== id);
              toastState.items = [...toastState.items];
            }, 5000);
          }
          if (chatsDelta > 0) {
            const qty = Math.max(1, chatsDelta);
            const id = Date.now() + Math.floor(Math.random() * 1000) + 1;
            const newToast = { id, title: 'Nuevos mensajes', message: `Llegaron ${qty} mensaje${qty > 1 ? 's' : ''} nuevo${qty > 1 ? 's' : ''}.`, href: '/dashboard/chat' };
            toastState.items.push(newToast);
            toastState.items = [...toastState.items];
            setTimeout(() => {
              toastState.items = toastState.items.filter((item) => item.id !== id);
              toastState.items = [...toastState.items];
            }, 5000);
          }
          if (requestsDelta > 0) {
            const qty = Math.max(1, requestsDelta);
            const id = Date.now() + Math.floor(Math.random() * 1000) + 2;
            const newToast = { id, title: 'Solicitudes pendientes', message: `Tienes ${qty} solicitud${qty > 1 ? 'es' : ''} que requieren acción.`, href: '/dashboard/notifications' };
            toastState.items.push(newToast);
            toastState.items = [...toastState.items];
            setTimeout(() => {
              toastState.items = toastState.items.filter((item) => item.id !== id);
              toastState.items = [...toastState.items];
            }, 5000);
          }
        }

        liveCounts.notifications = nextNotifications;
        liveCounts.chats = counts.chats;
        liveCounts.requests = counts.requests;
        liveCounts.total = nextTotal;
        liveCounts.latestNotificationAt = nextLatestNotificationAt;
        liveCounts.latestChatAt = counts.latestChatAt;
        liveCounts.latestRequestAt = counts.latestRequestAt;

        // Force react property triggers
        badgeNotifications.value = Number(nextNotifications);
        badgeChats.value = Number(counts.chats);
        badgeRequests.value = Number(counts.requests);
        toastState.initialized = true;

      } catch (err) {
        console.error('[WS] Sync failed:', err);
      } finally {
        isSyncing = false;
      }
    };

    let syncDebounce: ReturnType<typeof setTimeout> | undefined;

    const connectWs = async () => {
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
      }

      await syncCounts();

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      console.log('[WS] Connecting to:', wsUrl);
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WS] Connected successfully');
        reconnectDelayMs = 2000;
        void syncCounts();
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'SYNC_COUNTS') {
            // Debounce: coalesce rapid-fire SYNC_COUNTS into a single fetch
            if (syncDebounce) clearTimeout(syncDebounce);
            syncDebounce = setTimeout(() => {
              void syncCounts();
            }, 2000);
          }
        } catch (err) {
          console.error('[WS] Message parse error:', err);
        }
      };

      ws.onclose = () => {
        ws = null;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        const waitMs = Math.min(reconnectDelayMs, 30_000);
        console.log(`[WS] Disconnected, reconnecting in ${waitMs}ms...`);
        reconnectTimer = setTimeout(() => {
          void connectWs();
        }, waitMs);
        reconnectDelayMs = Math.min(reconnectDelayMs * 2, 30_000);
      };

      ws.onerror = (err) => {
        console.error('[WS] Error:', err);
        ws?.close();
      };
    };

    const onOnline = () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectDelayMs = 500;
      void connectWs();
    };

    window.addEventListener('online', onOnline);

    void connectWs();

    cleanup(() => {
      if (syncDebounce) clearTimeout(syncDebounce);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pulseTimer) clearTimeout(pulseTimer);
      window.removeEventListener('online', onOnline);
      if (ws) {
        ws.onclose = null; // prevent reconnect attempts
        ws.close();
      }
    });
  }, { strategy: 'document-ready' });



  return (

    <>

      {toastState.items.length > 0 && (
        <div class="fixed top-4 right-4 z-[80] flex flex-col gap-3 w-[min(92vw,360px)] pointer-events-none">
          {toastState.items.map((toast) => (
            <div key={toast.id} class="pointer-events-auto rounded-2xl border border-[#4a2e85]/20 bg-white/95 backdrop-blur px-4 py-3 shadow-xl">
              <div class="flex items-start gap-3">
                <div class="mt-0.5 h-8 w-8 rounded-full bg-gradient-to-br from-[#f6e527] to-[#ef7c43] flex items-center justify-center text-[#4a2e85]">
                  <LuBellRing class="w-4 h-4" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-bold text-[#4a2e85]">{toast.title}</p>
                  <p class="text-xs text-[#4a2e85b3] mt-0.5">{toast.message}</p>
                  <div class="mt-2 flex items-center gap-2">
                    <button
                      onClick$={() => openToastLink(toast.id, toast.href)}
                      class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#4a2e85]/10 text-[#4a2e85] hover:bg-[#4a2e85]/20 transition-colors"
                    >
                      Ver
                    </button>
                    <button
                      onClick$={() => closeToast(toast.id)}
                      class="px-2.5 py-1 rounded-lg text-xs font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
                <button onClick$={() => closeToast(toast.id)} class="text-gray-400 hover:text-gray-600 transition-colors" aria-label="Cerrar toast">
                  <LuX class="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Navbar superior del dashboard */}

      <header class="relative z-30 border-b border-[#4a2e85]/10 h-16 bg-white lg:hidden" data-vt="dashboard-mobile-header">
        <div class="h-full px-4">
          <div class="flex items-center justify-between h-full">
            <div class={`flex items-center gap-2 transition-opacity duration-300 ${sidebarOpen.value ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              <div class="h-10 w-10 flex items-center justify-center">
                <LogoImage alt="ACUPATAS" class="h-9 w-9 object-contain" />
              </div>
              <div class="text-lg font-bold text-[#4a2e85] tracking-tight">ACUPATAS</div>
            </div>

            <button
              class="p-2 hover:bg-[#E3F2FD] rounded-xl transition-colors"
              onClick$={$(() => (sidebarOpen.value = true))}
              aria-label="Abrir menú"
            >
              <svg class="w-6 h-6 text-[#4a2e85]/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </header>



      {/* Overlay móvil */}

      {sidebarOpen.value && (
        <div
          class="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-30"
          onClick$={$(() => (sidebarOpen.value = false))}
        />
      )}


      {/* SIDEBAR (deslizable en mobile, mini/expandido en desktop) */}

      <aside
        data-vt="dashboard-sidebar"
        class={`fixed left-0 top-0 h-[100svh] z-40 flex flex-col shadow-2xl transition-all duration-300 ease-in-out
          bg-gradient-to-br from-white via-[#E3F2FD]/20 to-[#FFF3E0]/30 border-r border-[#90CAF9]/40 backdrop-blur-xl
          ${sidebarOpen.value ? 'w-64 translate-x-0' : 'w-64 -translate-x-full lg:translate-x-0 lg:w-16'}
        `}
        style={{ height: '100svh', minHeight: '100svh' }}
      >
        {/* Botón toggle centrado verticalmente en el borde derecho */}

        <button

          onClick$={$(() => (sidebarOpen.value = !sidebarOpen.value))}

          class="hidden lg:flex absolute -right-8 top-1/2 -translate-y-1/2 w-8 h-12 bg-gradient-to-r from-[#4a2e85] to-[#ef7c43] text-white items-center justify-center rounded-r-lg shadow-lg hover:shadow-xl transition-all duration-300 group"

          aria-label="Colapsar/Expandir"

        >

          {sidebarOpen.value ? (

            <LuChevronLeft class="w-4 h-4 group-hover:scale-110 transition-transform" />

          ) : (

            <LuChevronRight class="w-4 h-4 group-hover:scale-110 transition-transform" />

          )}

        </button>







        <div class="flex-1 flex flex-col overflow-y-auto min-h-0">
          {/* Logo container consistency */}
          <div class="px-3 py-4">
            <div class="flex items-center justify-between gap-2 bg-white/70 border border-[#4a2e85]/20 rounded-lg px-3 py-2 shadow-sm">
              <div class="flex items-center gap-2">
                <div class="h-10 w-10 overflow-hidden flex items-center justify-center">
                  <LogoImage alt="ACUPATAS" class="h-9 w-9 object-contain" />
                </div>
                <div class={[
                  "text-sm font-semibold text-[#4a2e85] transition-opacity duration-300",
                  sidebarOpen.value ? "opacity-100" : "opacity-0 lg:hidden"
                ]}>
                  ACUPATAS
                </div>
              </div>

              {/* Close button inside branding row for mobile */}
              {sidebarOpen.value && (
                <button
                  onClick$={$(() => (sidebarOpen.value = false))}
                  class="lg:hidden p-1.5 hover:bg-[#4a2e85]/5 rounded-lg transition-colors"
                  aria-label="Cerrar menú"
                >
                  <LuX class="w-4 h-4 text-[#4a2e85]/60" />
                </button>
              )}
            </div>
          </div>

          <nav class="flex-1 px-2 py-2">
            <ul class="space-y-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const badgeValue = getBadgeValueForHref(item.href);
                const active = isActive(item.href);

                return (
                  <li key={item.href} onClick$={closeSidebarOnMobile}>
                    <Link
                      href={item.href}
                      class={[
                        'group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all',
                        active
                          ? 'bg-[#E3F2FD] text-[#0D47A1] border border-[#90CAF9] shadow-sm'
                          : 'hover:bg-[#E3F2FD]/40 text-gray-700',
                        !sidebarOpen.value && 'lg:justify-center lg:px-0'
                      ]}
                      aria-current={active ? 'page' : undefined}
                      title={sidebarOpen.value ? undefined : item.label}
                    >
                      <div class={[
                        'relative w-9 h-9 rounded-lg bg-white border flex items-center justify-center flex-shrink-0 transition-all duration-200 group-hover:scale-105',
                        active ? 'border-[#90CAF9] shadow-sm' : 'border-gray-200',
                      ]}>
                        <Icon class={['w-5 h-5', active ? 'text-[#0D47A1]' : 'text-gray-500']} />
                        {badgeValue > 0 && (
                          <span
                            class={[
                              'absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#ef7c43] text-white text-[10px] font-bold leading-[18px] text-center shadow transition-transform duration-300',
                              notificationsBadgePulse.value ? 'scale-110' : 'scale-100',
                            ]}
                          >
                            {badgeValue > 99 ? '99+' : badgeValue}
                          </span>
                        )}
                      </div>

                      <span class={[
                        'text-sm font-semibold transition-all duration-300 whitespace-nowrap overflow-hidden text-ellipsis',
                        sidebarOpen.value ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0 lg:hidden'
                      ]}>
                        {item.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

        </div>

        {/* Pie del sidebar (siempre visible abajo) */}

        <div class="p-2 border-t border-[#90CAF9]/40 space-y-1.5 flex flex-col items-center">

          {sidebarOpen.value ? (

            <>

              <div class="rounded-lg bg-white/70 border border-[#90CAF9]/40 p-3 text-xs w-full">

                <div class="text-gray-600">Soporte</div>

                <div class="font-semibold text-[#0D47A1]">soporte@acupatas.com</div>

              </div>

              <button
                onClick$={handleLogout}
                class="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-gradient-to-r from-[#4a2e85] to-black text-white text-sm font-bold rounded-xl hover:shadow-lg transition-all active:scale-[0.98]"
                title="Cerrar sesión"
              >
                <LuLogOut class="w-4.5 h-4.5" />
                <span class="text-white">Salir</span>
              </button>

            </>

          ) : (

            <button

              onClick$={handleLogout}

              class="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-r from-gray-700 to-black text-white hover:shadow-lg transition-all"

              title="Cerrar sesión"

            >

              <LuLogOut class="w-5 h-5" />

            </button>

          )}

        </div>

      </aside>



      {/* CONTENIDO: ocupa toda la altura; deja margen según ancho del sidebar; debajo del navbar */}

      <main
        data-vt="dashboard-main"
        class={[
          "flex-1 transition-all duration-300 ease-in-out overflow-x-hidden min-w-0",
          "min-h-[100svh] lg:min-h-screen",
          "mt-16 lg:mt-0",
          sidebarOpen.value ? "lg:ml-64" : "lg:ml-16",
        ]}
      >
        {/* Fondo suave para que se vea como tu home */}

        <div class="fixed inset-0 -z-10 pointer-events-none">
          <div class="absolute right-[-120px] top-[-120px] h-[420px] w-[420px] rounded-full bg-gradient-to-br from-[#1E88E5]/10 to-transparent blur-3xl" />

          <div class="absolute bottom-[-120px] left-[-120px] h-[420px] w-[420px] rounded-full bg-gradient-to-br from-[#FB8C00]/10 to-transparent blur-3xl" />
        </div>

        <div class="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8" data-vt="dashboard-content">
          <Slot />
        </div>
      </main>
    </>

  );

});





































