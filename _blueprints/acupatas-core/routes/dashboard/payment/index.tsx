import { component$ } from '@builder.io/qwik';
import { routeLoader$, Link } from '@builder.io/qwik-city';
import { getSessionFromEvent, getUserRoleById } from '../../../lib/auth';
import { getUserBookings } from '../../../lib/services';
import { LuCalendar, LuCreditCard, LuUser } from '@qwikest/icons/lucide';

export const usePaymentList = routeLoader$(async (event) => {
    const session = await getSessionFromEvent(event);
    if (!session) throw event.redirect(302, '/auth?mode=login');

    const [bookings, role] = await Promise.all([
        getUserBookings(session.userId),
        getUserRoleById(session.userId),
    ]);

    return { bookings, role: role || 'owner' };
});

export default component$(() => {
    const data = usePaymentList();

    return (
        <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 class="text-2xl font-bold text-[#4a2e85]">Mis Pagos</h1>
                    <p class="text-[#4a2e85]/60">Gestiona y revisa el historial de pagos de tus servicios</p>
                </div>
            </div>

            <div class="grid gap-4">
                {data.value.bookings.length === 0 ? (
                    <div class="bg-white rounded-xl border border-[#4a2e85]/10 p-12 text-center text-[#4a2e85]/60">
                        <LuCreditCard class="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p class="text-lg font-medium">No tienes pagos registrados</p>
                        <p class="text-sm">Cuando contrates un servicio, aparecerá aquí.</p>
                    </div>
                ) : (
                    data.value.bookings.map((booking: any) => (
                        <Link
                            key={booking.id}
                            href={`/dashboard/payment/${booking.id}`}
                            class="block bg-white hover:bg-[#4a2e85]/5 border border-[#4a2e85]/10 rounded-xl p-4 sm:p-6 transition-all group"
                        >
                            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div class="space-y-1">
                                    <div class="flex items-center gap-2">
                                        <span class={`px-2 py-0.5 text-xs font-semibold rounded-full ${booking.status === 'requested' ? 'bg-blue-100 text-blue-700' :
                                            booking.status === 'payment_sent' ? 'bg-yellow-100 text-yellow-700' :
                                                booking.status === 'payment_confirmed' ? 'bg-green-100 text-green-700' :
                                                    booking.status === 'fee_submitted' ? 'bg-purple-100 text-purple-700' :
                                                        booking.status === 'active' ? 'bg-indigo-100 text-indigo-700' :
                                                            'bg-gray-100 text-gray-700'
                                            }`}>
                                            {booking.status === 'requested' ? 'Pendiente de Pago' :
                                                booking.status === 'payment_sent' ? 'Pago Enviado' :
                                                    booking.status === 'payment_confirmed' ? 'Pago Confirmado' :
                                                        booking.status === 'fee_submitted' ? 'Comisión Enviada' :
                                                            booking.status === 'active' ? 'Servicio Activo' : booking.status}
                                        </span>
                                        <span class="text-sm text-[#4a2e85]/60">#{booking.id.slice(0, 8)}</span>
                                    </div>
                                    <h3 class="font-semibold text-[#4a2e85]">{booking.service}</h3>
                                    <div class="flex items-center gap-4 text-sm text-[#4a2e85]/60">
                                        <div class="flex items-center gap-1">
                                            <LuCalendar class="w-4 h-4" />
                                            <span>{new Date(booking.dateFrom).toLocaleDateString()} - {new Date(booking.dateTo).toLocaleDateString()}</span>
                                        </div>
                                        <div class="flex items-center gap-1">
                                            <LuUser class="w-4 h-4" />
                                            <span>{data.value.role === 'owner' ? 'Cuidador' : 'Dueño'}</span>
                                        </div>
                                    </div>
                                </div>
                                <div class="flex flex-col sm:items-end gap-1">
                                    <span class="text-lg font-bold text-[#4a2e85]">${booking.amountUsd} <span class="text-[10px] opacity-60 font-normal">(Tasa BCV)</span></span>
                                    <span class="text-xs text-[#4a2e85]/60 group-hover:text-[#ef7c43] transition-colors">
                                        Ver detalles &rarr;
                                    </span>
                                </div>
                            </div>
                        </Link>
                    ))
                )}
            </div>
        </div>
    );
});
