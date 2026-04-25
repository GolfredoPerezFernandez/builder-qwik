import { component$, useSignal, useComputed$ } from '@builder.io/qwik';
import { Link, routeLoader$ } from '@builder.io/qwik-city';
import { getSessionFromEvent, getUserById } from '~/lib/auth';
import { listCompletedServicesForAdmin, type AdminHistoryRecord } from '~/lib/services';

export const useAdminHistory = routeLoader$(async (event) => {
    const session = await getSessionFromEvent(event);
    if (!session) throw event.redirect(302, '/auth?mode=login');

    const user = await getUserById(session.userId);
    if ((user?.email || '').trim().toLowerCase() !== 'admin@gmail.com') {
        throw event.error(403, 'Acceso denegado. Solo administradores.');
    }

    return {
        history: await listCompletedServicesForAdmin(),
    };
});

const StarRating = ({ rating }: { rating: number | null }) => {
    if (rating == null) return <span class="text-gray-400 text-xs">Sin calificar</span>;
    return (
        <span class="flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
                <svg
                    key={i}
                    class={`w-3.5 h-3.5 ${i < rating ? 'text-amber-400' : 'text-gray-200'}`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
            ))}
            <span class="text-xs font-bold text-gray-600 ml-1">{rating}</span>
        </span>
    );
};

export default component$(() => {
    const data = useAdminHistory();
    const history = useSignal<AdminHistoryRecord[]>(data.value.history || []);
    const search = useSignal('');
    const currentPage = useSignal(1);
    const pageSize = 15;

    const filteredHistory = useComputed$(() => {
        let list = [...history.value];
        if (search.value.trim()) {
            const needle = search.value.trim().toLowerCase();
            list = list.filter((item) => {
                const haystack = [
                    item.bookingId,
                    item.ownerName,
                    item.ownerEmail,
                    item.caregiverName,
                    item.caregiverEmail,
                    item.service,
                ].join(' ').toLowerCase();
                return haystack.includes(needle);
            });
        }
        return list;
    });

    const totalPages = useComputed$(() =>
        Math.max(1, Math.ceil(filteredHistory.value.length / pageSize))
    );

    const paginatedHistory = useComputed$(() => {
        const start = (currentPage.value - 1) * pageSize;
        return filteredHistory.value.slice(start, start + pageSize);
    });

    return (
        <div class="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
            <header class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 class="text-3xl font-extrabold text-[#4a2e85]">Historial de Servicios</h1>
                    <p class="text-[#4a2e85b3] text-sm">Registro de todos los servicios completados.</p>
                </div>
                <div class="flex items-center gap-2">
                    <Link href="/dashboard/admin" class="px-4 py-2 rounded-xl border border-[#4a2e85]/20 text-[#4a2e85] font-semibold">
                        Volver al admin
                    </Link>
                </div>
            </header>

            {/* Stats */}
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div class="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <p class="text-xs uppercase font-bold text-emerald-700">Total completados</p>
                    <p class="text-2xl font-black text-emerald-800">{history.value.length}</p>
                </div>
                <div class="rounded-2xl border border-[#4a2e85]/20 bg-[#f7f3ff] p-4">
                    <p class="text-xs uppercase font-bold text-[#4a2e85]">Ingresos totales USD</p>
                    <p class="text-2xl font-black text-[#4a2e85]">
                        ${history.value.reduce((sum, item) => sum + item.amountUsd, 0).toFixed(2)}
                    </p>
                </div>
                <div class="rounded-2xl border border-[#ef7c43]/20 bg-orange-50 p-4">
                    <p class="text-xs uppercase font-bold text-[#ef7c43]">Comisiones recibidas</p>
                    <p class="text-2xl font-black text-[#ef7c43]">
                        ${history.value.reduce((sum, item) => sum + item.feeAmount, 0).toFixed(2)}
                    </p>
                </div>
            </div>

            {/* Search */}
            <div class="bg-white rounded-2xl border border-[#4a2e85]/10 shadow-sm p-4">
                <input
                    type="text"
                    placeholder="Buscar por cuidador, dueño, email o servicio..."
                    class="w-full px-3 py-2 rounded-xl border border-[#4a2e85]/20 focus:outline-none focus:ring-2 focus:ring-[#ef7c43]"
                    value={search.value}
                    onInput$={(event) => (search.value = (event.target as HTMLInputElement).value)}
                />
            </div>

            {/* Table */}
            <div class="bg-white rounded-2xl border border-[#4a2e85]/10 shadow-sm overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="bg-[#4a2e85]/5 border-b border-[#4a2e85]/10">
                                <th class="px-4 py-3 text-xs font-bold text-[#4a2e85]">Servicio</th>
                                <th class="px-4 py-3 text-xs font-bold text-[#4a2e85]">Cuidador</th>
                                <th class="px-4 py-3 text-xs font-bold text-[#4a2e85]">Dueño</th>
                                <th class="px-4 py-3 text-xs font-bold text-[#4a2e85]">Monto</th>
                                <th class="px-4 py-3 text-xs font-bold text-[#4a2e85]">Reseñas</th>
                                <th class="px-4 py-3 text-xs font-bold text-[#4a2e85]">Completado</th>
                                <th class="px-4 py-3 text-xs font-bold text-[#4a2e85] text-right">Chat</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-[#4a2e85]/8">
                            {paginatedHistory.value.map((item) => (
                                <tr key={item.bookingId} class="hover:bg-[#f7f3ff]/50 transition-colors">
                                    <td class="px-4 py-3">
                                        <p class="text-sm font-semibold text-[#4a2e85] capitalize">{item.service || '-'}</p>
                                        <p class="text-xs text-[#4a2e85b3]">{item.dateFrom?.slice(0, 10)} → {item.dateTo?.slice(0, 10)}</p>
                                    </td>
                                    <td class="px-4 py-3">
                                        <p class="font-semibold text-[#4a2e85]">{item.caregiverName || 'Cuidador'}</p>
                                        <p class="text-xs text-[#4a2e85b3]">{item.caregiverEmail || '-'}</p>
                                    </td>
                                    <td class="px-4 py-3">
                                        <p class="font-semibold text-[#4a2e85]">{item.ownerName || 'Dueño'}</p>
                                        <p class="text-xs text-[#4a2e85b3]">{item.ownerEmail || '-'}</p>
                                    </td>
                                    <td class="px-4 py-3">
                                        <p class="font-bold text-[#4a2e85]">${item.amountUsd.toFixed(2)}</p>
                                        <p class="text-xs text-[#ef7c43]">Fee: ${item.feeAmount.toFixed(2)}</p>
                                    </td>
                                    <td class="px-4 py-3 space-y-1">
                                        <div class="flex items-center gap-1">
                                            <span class="text-[10px] text-[#4a2e85b3] w-12">Dueño:</span>
                                            <StarRating rating={item.ownerRating} />
                                        </div>
                                        <div class="flex items-center gap-1">
                                            <span class="text-[10px] text-[#4a2e85b3] w-12">Cuidador:</span>
                                            <StarRating rating={item.caregiverRating} />
                                        </div>
                                    </td>
                                    <td class="px-4 py-3">
                                        <span class="inline-flex px-2 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                                            Completado
                                        </span>
                                        <p class="text-xs text-[#4a2e85b3] mt-1">
                                            {item.completedAt ? new Date(item.completedAt).toLocaleDateString() : '-'}
                                        </p>
                                    </td>
                                    <td class="px-4 py-3 text-right">
                                        {item.chatId ? (
                                            <Link
                                                href={`/dashboard/chat/${item.chatId}`}
                                                class="text-xs text-[#4a2e85] underline hover:text-[#ef7c43]"
                                            >
                                                Ver chat
                                            </Link>
                                        ) : (
                                            <span class="text-xs text-gray-400">-</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {filteredHistory.value.length === 0 && (
                                <tr>
                                    <td colSpan={7} class="px-4 py-8 text-center text-sm text-[#4a2e85b3]">
                                        No hay servicios completados aún.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-t border-[#4a2e85]/10 bg-[#faf9ff]">
                    <p class="text-xs text-[#4a2e85b3]">
                        Mostrando {filteredHistory.value.length === 0 ? 0 : (currentPage.value - 1) * pageSize + 1}
                        {' '}-{' '}
                        {Math.min(currentPage.value * pageSize, filteredHistory.value.length)}
                        {' '}de {filteredHistory.value.length} registros
                    </p>
                    <div class="flex items-center gap-2">
                        <button
                            type="button"
                            class={`px-3 py-1.5 rounded-lg border border-[#4a2e85]/20 text-sm font-semibold ${currentPage.value === 1 ? 'opacity-50 cursor-not-allowed text-[#4a2e85b3]' : 'text-[#4a2e85] hover:bg-[#4a2e85]/5'}`}
                            onClick$={() => (currentPage.value = Math.max(1, currentPage.value - 1))}
                            disabled={currentPage.value === 1}
                        >
                            Anterior
                        </button>
                        <span class="text-xs font-semibold text-[#4a2e85]">Página {currentPage.value} / {totalPages.value}</span>
                        <button
                            type="button"
                            class={`px-3 py-1.5 rounded-lg border border-[#4a2e85]/20 text-sm font-semibold ${currentPage.value >= totalPages.value ? 'opacity-50 cursor-not-allowed text-[#4a2e85b3]' : 'text-[#4a2e85] hover:bg-[#4a2e85]/5'}`}
                            onClick$={() => (currentPage.value = Math.min(totalPages.value, currentPage.value + 1))}
                            disabled={currentPage.value >= totalPages.value}
                        >
                            Siguiente
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
});
