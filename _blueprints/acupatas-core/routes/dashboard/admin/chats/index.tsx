import { component$, useSignal, useComputed$, $ } from '@builder.io/qwik';
import { Link, routeLoader$ } from '@builder.io/qwik-city';
import { getSessionFromEvent, getUserById } from '~/lib/auth';
import { listAllChats, type ChatRecord } from '~/lib/chat';
import { ImageWithRetry } from '~/components/ui/image-with-retry';
import { LuMessageSquare, LuSearch, LuCalendar, LuUser, LuEye } from '@qwikest/icons/lucide';
import { normalizeImageUrl } from '~/lib/upload-utils';

export const useAdminChats = routeLoader$(async (event) => {
    const session = await getSessionFromEvent(event);
    if (!session) throw event.redirect(302, '/auth?mode=login');

    const user = await getUserById(session.userId);
    if ((user?.email || '').trim().toLowerCase() !== 'admin@gmail.com') {
        throw event.error(403, 'Acceso denegado. Solo administradores.');
    }

    const chats = await listAllChats();
    return chats.map((chat: ChatRecord) => ({
        ...chat,
        ownerAvatar: normalizeImageUrl(chat.ownerAvatar),
        caregiverAvatar: normalizeImageUrl(chat.caregiverAvatar),
        petPhoto: normalizeImageUrl(chat.petPhoto),
    }));
});

export default component$(() => {
    const chats = useAdminChats();
    const search = useSignal('');
    const statusFilter = useSignal<'all' | 'open' | 'closed'>('all');
    const currentPage = useSignal(1);
    const pageSize = 20;

    const filteredChats = useComputed$(() => {
        let list = chats.value;

        if (statusFilter.value !== 'all') {
            const isOpen = statusFilter.value === 'open';
            list = list.filter((c) => c.open === isOpen);
        }

        if (search.value.trim()) {
            const needle = search.value.trim().toLowerCase();
            list = list.filter((c) => {
                const haystack = [
                    c.ownerName,
                    c.caregiverName,
                    c.petName,
                    c.id,
                    c.status,
                ]
                    .join(' ')
                    .toLowerCase();
                return haystack.includes(needle);
            });
        }

        return list;
    });

    const paginatedChats = useComputed$(() => {
        const start = (currentPage.value - 1) * pageSize;
        return filteredChats.value.slice(start, start + pageSize);
    });

    const totalPages = useComputed$(() => Math.ceil(filteredChats.value.length / pageSize));

    return (
        <div class="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
            <header class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 class="text-3xl font-extrabold text-[#4a2e85] flex items-center gap-2">
                        <LuMessageSquare class="w-8 h-8 text-[#ef7c43]" />
                        Administración de Chats
                    </h1>
                    <p class="text-[#4a2e85b3] text-sm">Supervisa todas las conversaciones y solicitudes de servicio.</p>
                </div>
                <div class="flex items-center gap-2">
                    <Link
                        href="/dashboard/admin"
                        class="px-4 py-2 rounded-xl border border-[#4a2e85]/20 text-[#4a2e85] font-bold text-sm hover:bg-[#4a2e85]/5 transition-colors"
                    >
                        Volver al panel
                    </Link>
                </div>
            </header>

            <div class="bg-white rounded-2xl border border-[#4a2e85]/10 shadow-sm p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div class="relative">
                    <LuSearch class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre, mascota o ID..."
                        class="w-full pl-9 pr-3 py-2 rounded-xl border border-[#4a2e85]/20 focus:outline-none focus:ring-2 focus:ring-[#ef7c43] text-sm"
                        value={search.value}
                        onInput$={(e) => (search.value = (e.target as HTMLInputElement).value)}
                    />
                </div>

                <select
                    class="w-full px-3 py-2 rounded-xl border border-[#4a2e85]/20 focus:outline-none focus:ring-2 focus:ring-[#ef7c43] bg-white text-sm"
                    value={statusFilter.value}
                    onChange$={(e) => (statusFilter.value = (e.target as HTMLSelectElement).value as any)}
                >
                    <option value="all">Todos los estados</option>
                    <option value="open">Abiertos</option>
                    <option value="closed">Cerrados</option>
                </select>

                <div class="flex items-center justify-end text-sm text-[#4a2e85b3]">
                    {filteredChats.value.length} resultados
                </div>
            </div>

            <div class="bg-white rounded-2xl border border-[#4a2e85]/10 shadow-sm overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="bg-[#4a2e85]/5 border-b border-[#4a2e85]/10">
                                <th class="px-4 py-3 text-xs font-bold text-[#4a2e85]">ID / Fecha</th>
                                <th class="px-4 py-3 text-xs font-bold text-[#4a2e85]">Dueño</th>
                                <th class="px-4 py-3 text-xs font-bold text-[#4a2e85]">Cuidador</th>
                                <th class="px-4 py-3 text-xs font-bold text-[#4a2e85]">Mascota</th>
                                <th class="px-4 py-3 text-xs font-bold text-[#4a2e85]">Estado</th>
                                <th class="px-4 py-3 text-xs font-bold text-[#4a2e85] text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-[#4a2e85]/5">
                            {paginatedChats.value.map((chat) => (
                                <tr key={chat.id} class="hover:bg-[#4a2e85]/5 transition-colors">
                                    <td class="px-4 py-3">
                                        <div class="text-xs font-mono text-gray-500">{chat.id.slice(0, 8)}</div>
                                        <div class="text-xs text-[#4a2e85b3] flex items-center gap-1">
                                            <LuCalendar class="w-3 h-3" />
                                            {new Date(chat.createdAt || '').toLocaleDateString()}
                                        </div>
                                    </td>
                                    <td class="px-4 py-3">
                                        <div class="flex items-center gap-2">
                                            {chat.ownerAvatar ? (
                                                <ImageWithRetry src={chat.ownerAvatar} class="w-6 h-6 rounded-full object-cover" width={24} height={24} layout="constrained" />
                                            ) : (
                                                <div class="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">{chat.ownerName?.[0]}</div>
                                            )}
                                            <span class="text-sm font-semibold text-[#4a2e85]">{chat.ownerName || 'Dueño'}</span>
                                        </div>
                                    </td>
                                    <td class="px-4 py-3">
                                        <div class="flex items-center gap-2">
                                            {chat.caregiverAvatar ? (
                                                <ImageWithRetry src={chat.caregiverAvatar} class="w-6 h-6 rounded-full object-cover" width={24} height={24} layout="constrained" />
                                            ) : (
                                                <div class="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold">{chat.caregiverName?.[0]}</div>
                                            )}
                                            <span class="text-sm font-semibold text-[#4a2e85]">{chat.caregiverName || 'Cuidador'}</span>
                                        </div>
                                    </td>
                                    <td class="px-4 py-3">
                                        <span class="text-sm text-gray-700">{chat.petName || '-'}</span>
                                    </td>
                                    <td class="px-4 py-3">
                                        <div class="flex flex-col gap-1">
                                            <span class={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full w-fit ${chat.open ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                                {chat.open ? 'Abierto' : 'Cerrado'}
                                            </span>
                                            {chat.status && (
                                                <span class="text-[10px] text-gray-500 capitalize">{chat.status}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td class="px-4 py-3 text-right">
                                        <Link
                                            href={`/dashboard/chat/${chat.id}`}
                                            class="inline-flex items-center justify-center p-2 rounded-lg text-[#4a2e85] hover:bg-[#4a2e85]/10 transition-colors"
                                            title="Ver chat"
                                        >
                                            <LuEye class="w-4 h-4" />
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                            {paginatedChats.value.length === 0 && (
                                <tr>
                                    <td colSpan={6} class="px-4 py-8 text-center text-sm text-[#4a2e85b3]">No se encontraron chats.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {totalPages.value > 1 && (
                    <div class="flex items-center justify-between px-4 py-3 border-t border-[#4a2e85]/10 bg-gray-50">
                        <button
                            class="px-3 py-1 text-xs font-bold text-[#4a2e85] disabled:opacity-50"
                            disabled={currentPage.value === 1}
                            onClick$={() => currentPage.value--}
                        >
                            Anterior
                        </button>
                        <span class="text-xs text-gray-500">Página {currentPage.value} de {totalPages.value}</span>
                        <button
                            class="px-3 py-1 text-xs font-bold text-[#4a2e85] disabled:opacity-50"
                            disabled={currentPage.value >= totalPages.value}
                            onClick$={() => currentPage.value++}
                        >
                            Siguiente
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
});
