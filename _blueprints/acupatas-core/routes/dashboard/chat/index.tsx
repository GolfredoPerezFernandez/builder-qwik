import { component$, useSignal, useComputed$, useStore, useVisibleTask$ } from '@builder.io/qwik';
import { Link, routeLoader$, server$, type RequestEvent } from '@builder.io/qwik-city';
import type { RequestHandler } from '@builder.io/qwik-city';
import { getSessionFromEvent, getUserRoleById } from '../../../lib/auth';
import { listCaregiverChats, listOwnerChats, listAllChats, type ChatRecord } from '../../../lib/chat';
import { getUserById } from '../../../lib/auth';
import { normalizeImageUrl } from '../../../lib/upload-utils';
import { VerificationBadge } from '../../../components/VerificationBadge';
import { ImageWithRetry } from '../../../components/ui/image-with-retry';

export const onRequest: RequestHandler = async (event) => {
  const chatId = event.url.searchParams.get('chatId');
  if (chatId) {
    throw event.redirect(302, `/dashboard/chat/${chatId}`);
  }
};

export const useChatList = routeLoader$(async (event) => {
  const session = await getSessionFromEvent(event);
  if (!session) return { chats: [] as ChatRecord[], role: 'owner' as const, isAdmin: false };

  const user = await getUserById(session.userId);
  const isAdmin = (user?.email || '').trim().toLowerCase() === 'admin@gmail.com';

  const role = (await getUserRoleById(session.userId)) || 'owner';

  let chats: ChatRecord[] = [];
  if (isAdmin) {
    chats = await listAllChats();
  } else {
    chats = role === 'caregiver'
      ? await listCaregiverChats(session.userId)
      : await listOwnerChats(session.userId);
  }

  const chatsWithNormalizedImages = chats.map((chat) => ({
    ...chat,
    ownerAvatar: normalizeImageUrl(chat.ownerAvatar),
    caregiverAvatar: normalizeImageUrl(chat.caregiverAvatar),
    petPhoto: normalizeImageUrl(chat.petPhoto),
  }));

  return { chats: chatsWithNormalizedImages, role: role as 'owner' | 'caregiver', isAdmin };
});

export const refreshChatsServer = server$(async function () {
  const session = await getSessionFromEvent(this);
  if (!session) return null;

  const user = await getUserById(session.userId);
  const isAdmin = (user?.email || '').trim().toLowerCase() === 'admin@gmail.com';
  const role = (await getUserRoleById(session.userId)) || 'owner';

  let chats: ChatRecord[] = [];
  if (isAdmin) {
    chats = await listAllChats();
  } else {
    chats = role === 'caregiver'
      ? await listCaregiverChats(session.userId)
      : await listOwnerChats(session.userId);
  }

  return chats.map((chat) => ({
    ...chat,
    ownerAvatar: normalizeImageUrl(chat.ownerAvatar),
    caregiverAvatar: normalizeImageUrl(chat.caregiverAvatar),
    petPhoto: normalizeImageUrl(chat.petPhoto),
  }));
});

export default component$(() => {
  const data = useChatList();
  const state = useStore({
    chats: data.value.chats,
    role: data.value.role,
    isAdmin: data.value.isAdmin,
  });

  const headerTitle = state.isAdmin ? 'Chat Global (Admin)' : (state.role === 'caregiver' ? 'Chat con dueños' : 'Chat con cuidadores');

  const getPetSummaryText = (petId?: string, petName?: string) => {
    const petCount = Array.from(new Set((petId || '').split(',').map((id) => id.trim()).filter(Boolean))).length;
    if (petCount > 1) return `Mascotas: ${petCount}`;
    if (petName) return `Mascota: ${petName}`;
    if (petCount === 1) return 'Mascota: 1 mascota';
    return 'Sin mascota';
  };

  useVisibleTask$(({ cleanup }) => {
    let syncDebounce: any;

    const refresh = async () => {
      const updatedChats = await refreshChatsServer();
      if (updatedChats) {
        state.chats = updatedChats;
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

  // Filter state
  const filterStatus = useSignal<'all' | 'open' | 'closed'>('all');
  const filterPet = useSignal<'all' | 'with' | 'without'>('all');
  const filterVerified = useSignal<'all' | 'verified' | 'unverified'>('all');

  // Filtered chats
  const filteredChats = useComputed$(() => {
    return state.chats.filter((chat: ChatRecord) => {
      // Status filter
      if (filterStatus.value === 'open' && !chat.open) return false;
      if (filterStatus.value === 'closed' && chat.open) return false;

      // Pet filter
      if (filterPet.value === 'with' && !chat.hasPet) return false;
      if (filterPet.value === 'without' && chat.hasPet) return false;

      // Verified filter
      if (filterVerified.value === 'verified' && !chat.verified) return false;
      if (filterVerified.value === 'unverified' && chat.verified) return false;

      return true;
    });
  });

  const getStatusConfig = (status: string | undefined, isOpen: boolean) => {
    const s = (status || (isOpen ? 'open' : 'closed')).toLowerCase();
    switch (s) {
      case 'open':
      case 'abierto':
        return { label: 'Abierto', classes: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' };
      case 'closed':
      case 'cerrado':
        return { label: 'Cerrado', classes: 'bg-gray-500/10 text-gray-500 border border-gray-500/20' };
      case 'requested':
      case 'solicitado':
        return { label: 'Solicitado', classes: 'bg-amber-500/10 text-amber-600 border border-amber-500/20' };
      case 'accepted':
      case 'aceptado':
        return { label: 'Aceptado', classes: 'bg-indigo-500/10 text-indigo-600 border border-indigo-500/20' };
      case 'paid':
      case 'payment_sent':
        return { label: 'Pago enviado', classes: 'bg-blue-500/10 text-blue-600 border border-blue-500/20' };
      case 'completed':
      case 'payment_confirmed':
        return { label: 'Pago verificado', classes: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' };
      case 'fee_submitted':
        return { label: 'Comisión enviada', classes: 'bg-purple-500/10 text-purple-600 border border-purple-500/20' };
      case 'active':
        return { label: 'En servicio', classes: 'bg-rose-500/10 text-rose-600 border border-rose-500/20' };
      default:
        return { label: s, classes: 'bg-gray-500/10 text-gray-500 border border-gray-500/20' };
    }
  };

  return (
    <div class="min-h-screen bg-[#f6f6f6]" data-vt="chat-list-page">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <header class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" data-vt="chat-list-header">
          <div>
            <h1 class="text-2xl font-extrabold text-[#4a2e85]">{headerTitle}</h1>
            <p class="text-sm text-[#4a2e85b3]">
              {state.isAdmin
                ? 'Vista global de todas las conversaciones del sistema.'
                : 'Conversaciones reales entre dueños y cuidadores.'}
            </p>
          </div>
          <div class="flex gap-2">
            {state.role === 'owner' && (
              <Link href="/dashboard/caregiver-search" class="px-4 py-2 rounded-lg bg-[#4a2e85] text-white font-bold shadow-sm hover:bg-[#3a2369] transition-all">Buscar cuidadores</Link>
            )}
          </div>
        </header>

        {/* Filters */}
        <div class="bg-white rounded-3xl border border-[#4a2e85]/10 p-5 shadow-sm" data-vt="chat-list-filters">
          <div class="flex flex-col sm:flex-row gap-6">
            <div class="flex-1">
              <label class="block text-[10px] font-bold uppercase tracking-wider text-[#4a2e85]/60 mb-3">Filtrar por Estado</label>
              <div class="flex gap-2 flex-wrap">
                <button
                  onClick$={() => filterStatus.value = 'all'}
                  class={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filterStatus.value === 'all' ? 'bg-[#4a2e85] text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                  Todos
                </button>
                <button
                  onClick$={() => filterStatus.value = 'open'}
                  class={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filterStatus.value === 'open' ? 'bg-emerald-500 text-white shadow-md' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                >
                  Abiertos
                </button>
                <button
                  onClick$={() => filterStatus.value = 'closed'}
                  class={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filterStatus.value === 'closed' ? 'bg-gray-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  Cerrados
                </button>
              </div>
            </div>

            <div class="flex-1">
              <label class="block text-[10px] font-bold uppercase tracking-wider text-[#4a2e85]/60 mb-3">Mascota</label>
              <div class="flex gap-2 flex-wrap">
                <button
                  onClick$={() => filterPet.value = 'all'}
                  class={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filterPet.value === 'all' ? 'bg-[#4a2e85] text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                  Todos
                </button>
                <button
                  onClick$={() => filterPet.value = 'with'}
                  class={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filterPet.value === 'with' ? 'bg-violet-500 text-white shadow-md' : 'bg-violet-50 text-violet-600 hover:bg-violet-100'}`}
                >
                  Con mascota
                </button>
                <button
                  onClick$={() => filterPet.value = 'without'}
                  class={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filterPet.value === 'without' ? 'bg-gray-500 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                  Sin mascota
                </button>
              </div>
            </div>

            <div class="flex-1">
              <label class="block text-[10px] font-bold uppercase tracking-wider text-[#4a2e85]/60 mb-3">Verificación</label>
              <div class="flex gap-2 flex-wrap">
                <button
                  onClick$={() => filterVerified.value = 'all'}
                  class={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filterVerified.value === 'all' ? 'bg-[#4a2e85] text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                  Todos
                </button>
                <button
                  onClick$={() => filterVerified.value = 'verified'}
                  class={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filterVerified.value === 'verified' ? 'bg-emerald-500 text-white shadow-md' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                >
                  Verificados
                </button>
                <button
                  onClick$={() => filterVerified.value = 'unverified'}
                  class={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filterVerified.value === 'unverified' ? 'bg-gray-500 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                  No verificados
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-[#4a2e85]/40">
          <span>Chats {filterStatus.value === 'open' ? 'abiertos' : filterStatus.value === 'closed' ? 'cerrados' : 'activos'}</span>
          <span class="bg-[#4a2e85]/5 px-3 py-1 rounded-full">{filteredChats.value.length}</span>
        </div>

        {filteredChats.value.length === 0 ? (
          <div class="bg-white rounded-3xl border border-[#4a2e85]/10 p-12 text-center">
            <div class="h-16 w-16 bg-[#4a2e85]/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 text-[#4a2e85]/30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
            </div>
            <p class="text-sm text-gray-500 max-w-xs mx-auto">
              {state.chats.length === 0
                ? 'No tienes chats activos. Ve a buscar cuidadores para iniciar una conversación.'
                : 'No hay chats que coincidan con los filtros seleccionados.'}
            </p>
          </div>
        ) : (
          <section class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-vt="chat-list-grid">
            {filteredChats.value.map((chat) => {
              const counterpartName = state.isAdmin
                ? `${chat.ownerName} ↔ ${chat.caregiverName}`
                : (state.role === 'caregiver' ? (chat.ownerName || 'Dueño') : chat.caregiverName);
              const statusCfg = getStatusConfig(chat.status, chat.open);

              return (
                <Link
                  key={chat.id}
                  href={`/dashboard/chat/${chat.id}`}
                  class="bg-white rounded-3xl border border-[#4a2e85]/10 p-5 space-y-4 hover:shadow-xl hover:scale-[1.02] transition-all flex flex-col group"
                >

                  <div class="flex items-start gap-4">
                    <div class="h-12 w-12 rounded-2xl border border-[#4a2e85]/10 overflow-hidden bg-gray-100 flex-shrink-0 shadow-inner">
                      {state.role === 'caregiver' ? (
                        chat.ownerAvatar ? (
                          <ImageWithRetry src={chat.ownerAvatar} alt={counterpartName} class="h-full w-full object-cover" width={48} height={48} layout="constrained" />
                        ) : (
                          <div class="h-full w-full grid place-items-center text-gray-400">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                            </svg>
                          </div>
                        )
                      ) : (
                        chat.caregiverAvatar ? (
                          <ImageWithRetry src={chat.caregiverAvatar} alt={counterpartName} class="h-full w-full object-cover" width={48} height={48} layout="constrained" />
                        ) : (
                          <div class="h-full w-full grid place-items-center text-gray-400">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                            </svg>
                          </div>
                        )
                      )}
                    </div>
                    <div class="flex-1 min-w-0 space-y-1">
                      <div class="flex items-center justify-between gap-2">
                        <div class="text-[9px] font-black text-[#4a2e85]/40 uppercase tracking-widest flex-shrink-0">{state.role === 'caregiver' ? 'Dueño' : 'Cuidador'}</div>
                        <span class={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 shadow-sm ${statusCfg.classes}`}>
                          {statusCfg.label}
                        </span>
                      </div>
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <div class="text-sm font-bold text-[#4a2e85] break-words line-clamp-1 group-hover:text-[#ef7c43] transition-colors">{counterpartName}</div>
                        <VerificationBadge verified={!!chat.verified} size="sm" />
                      </div>
                    </div>
                  </div>

                  <div class="flex flex-col gap-2 mt-auto pt-4 border-t border-gray-50">
                    {state.role === 'owner' && chat.petLimit !== undefined && (
                      <div class="flex items-center justify-between text-[10px] bg-gray-50 px-2 py-1.5 rounded-lg border border-gray-100">
                        <span class="font-bold text-[#4a2e85]/60 uppercase tracking-tighter">Capacidad</span>
                        <span class="font-bold text-[#4a2e85]">{(chat.activePets ?? 0)} de {chat.petLimit} ocupados</span>
                      </div>
                    )}
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        {chat.hasPet ? (
                          <div class="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-violet-50 text-violet-600 text-[10px] font-bold">
                            <span>🐾</span>
                            <span>{getPetSummaryText(chat.petId, chat.petName).replace('Mascota: ', '')}</span>
                          </div>
                        ) : (
                          <div class="text-[10px] text-gray-400 font-medium italic">Sin mascota</div>
                        )}
                      </div>
                      <div class="text-[10px] font-bold text-[#4a2e85]/60 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                        ABRIR <span>→</span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
});
