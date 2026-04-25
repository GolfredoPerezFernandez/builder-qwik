import { component$, useStore, useSignal, useTask$, $ } from '@builder.io/qwik';
import { routeLoader$, server$ } from '@builder.io/qwik-city';
import { getSessionFromEvent, getUserById, getUserRoleById, isAdmin } from '../../../../lib/auth';
import {
    getBookingById,
    getPaymentTimeline,
    submitOwnerPayment,
    confirmCaregiverPayment,
    submitFeePayment,
    validateFeePayment,
} from '../../../../lib/services';
import { getOwnerProfileByUserId } from '../../../../lib/owner';
import { getCaregiverDashboardData } from '../../../../lib/caregiver';
import { getTursoClient } from '../../../../lib/turso';
import {
    LuCreditCard,
    LuShieldCheck,
    LuFileText,
    LuBanknote,
} from '@qwikest/icons/lucide';
import { resolveUploadUrl } from '../../../../lib/upload-utils';
import { formatMoney, diffDays } from '../../../../lib/utils';

export const usePaymentData = routeLoader$(async (event) => {
    const session = await getSessionFromEvent(event);
    if (!session) return { booking: null, events: [], role: 'owner' as const, ownerName: '', caregiverName: '', caregiverBank: null, petName: '' };

    const bookingId = event.params.bookingId;
    const [booking, events, role, user] = await Promise.all([
        getBookingById(bookingId),
        getPaymentTimeline(bookingId),
        getUserRoleById(session.userId),
        getUserById(session.userId),
    ]);

    // Security check: ensure user is owner or caregiver of this booking
    if (booking && booking.ownerId !== session.userId && booking.caregiverId !== session.userId) {
        throw event.redirect(302, '/dashboard/payment');
    }

    if (!booking) return { booking: null, events: [], role: role || 'owner', ownerName: '', caregiverName: '', caregiverBank: null, petName: '' };

    const [ownerProfile, caregiverData] = await Promise.all([
        getOwnerProfileByUserId(booking.ownerId),
        getCaregiverDashboardData(booking.caregiverId),
    ]);

    const client = getTursoClient();
    const petRes = await client.execute({
        sql: 'select name from owner_pet_profiles where id = ? limit 1',
        args: [booking.petId],
    });
    const petName = (petRes.rows[0] as any)?.name ?? 'Mascota';

    return {
        booking,
        events,
        role: role || 'owner',
        isAdmin: isAdmin(user),
        ownerName: ownerProfile?.fullName || 'Dueño',
        caregiverName: caregiverData?.profile?.name || 'Cuidador',
        caregiverBank: caregiverData?.bank || null,
        petName,
    };
});

const uploadDocument = server$(async function (_originalName: string, dataUrl: string) {
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');

    const match = dataUrl.match(/^data:(.+);base64,(.*)$/);
    if (!match) return { ok: false, reason: 'invalid' } as const;
    const mime = match[1];
    const base64 = match[2];
    const extMap: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'application/pdf': 'pdf',
    };
    const ext = extMap[mime] ?? 'bin';
    const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), 'public', 'uploads');
    mkdirSync(uploadDir, { recursive: true });
    const filename = Date.now() + '_' + crypto.randomUUID() + '.' + ext;
    const filePath = join(uploadDir, filename);
    writeFileSync(filePath, Buffer.from(base64, 'base64'));
    const path = '/uploads/' + filename;
    const url = resolveUploadUrl(this, path);
    return { ok: true, filename, path, url } as const;
});

const submitOwnerPaymentServer = server$(async function (bookingId: string, reference: string, proofDataUrl: string) {
    const session = await getSessionFromEvent(this);
    if (!session) return { ok: false, reason: 'no_session' } as const;

    const uploaded = await uploadDocument('proof.jpg', proofDataUrl);
    if (!uploaded.ok) return { ok: false, reason: 'upload_failed' } as const;

    return await submitOwnerPayment(bookingId, session.userId, reference, uploaded.path || uploaded.url);
});

const confirmCaregiverPaymentServer = server$(async function (bookingId: string, confirmed: boolean, note?: string) {
    const session = await getSessionFromEvent(this);
    if (!session) return { ok: false, reason: 'no_session' } as const;
    return await confirmCaregiverPayment(bookingId, session.userId, confirmed, note);
});

const submitFeePaymentServer = server$(async function (bookingId: string, reference: string, proofDataUrl: string) {
    const session = await getSessionFromEvent(this);
    if (!session) return { ok: false, reason: 'no_session' } as const;

    const uploaded = await uploadDocument('fee_proof.jpg', proofDataUrl);
    if (!uploaded.ok) return { ok: false, reason: 'upload_failed' } as const;

    const booking = await getBookingById(bookingId);
    if (!booking) return { ok: false, reason: 'not_found' } as const;

    const feeAmount = Number((booking.amountUsd * 0.20).toFixed(2));
    const now = new Date().toISOString();

    return await submitFeePayment(bookingId, session.userId, reference, uploaded.path || uploaded.url, now, feeAmount);
});

const validateFeePaymentServer = server$(async function (bookingId: string) {
    const session = await getSessionFromEvent(this);
    if (!session) return { ok: false, reason: 'no_session' } as const;

    const user = await getUserById(session.userId);
    if (!isAdmin(user)) {
        return { ok: false, reason: 'unauthorized' } as const;
    }

    return await validateFeePayment(bookingId, session.userId, false, {
        bdvApiKey: this.env.get('BDV_KEY') || this.env.get('BDV_API_KEY') || this.env.get('BDV_API_KEY_QA') || '',
        bdvEndpoint: this.env.get('BDV_API_ENDPOINT') || this.env.get('BDV_ENDPOINT') || 'https://bdvconciliacion.banvenez.com/getMovement',
        acupatasRif: this.env.get('ACUPATAS_RIF') || 'J507903559',
        acupatasPhone: this.env.get('ACUPATAS_PHONE') || '04147199496',
    });
});



export default component$(() => {
    const data = usePaymentData();
    const toast = useSignal('');

    const state = useStore({
        booking: data.value.booking,
        events: data.value.events,
        ownerPaymentReference: '',
        ownerPaymentProof: null as File | null,
        caregiverNote: '',
        feeReference: '',
        feeProof: null as File | null,
        loading: false,
    });

    useTask$(({ track }) => {
        track(() => data.value);
        state.booking = data.value.booking;
        state.events = data.value.events;
    });

    if (!state.booking) {
        return (
            <div class="min-h-screen grid place-items-center bg-[#f6f6f6]">
                <div class="text-center">
                    <h2 class="text-2xl font-bold text-[#4a2e85]">Reserva no encontrada</h2>
                    <p class="mt-2 text-sm text-[#4a2e85b3]">Verifica el ID de la reserva.</p>
                </div>
            </div>
        );
    }

    const booking = state.booking;
    const nights = diffDays(booking.dateFrom, booking.dateTo);
    const feeAmount = Number((booking.amountUsd * 0.20).toFixed(2));
    const role = data.value.role;

    const readFileAsDataUrl = $((file: File) =>
        new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        })
    );

    const handleOwnerPayment = $(async () => {
        if (!state.ownerPaymentReference.trim()) {
            toast.value = 'Ingresa la referencia del pago.';
            return;
        }
        if (!state.ownerPaymentProof) {
            toast.value = 'Adjunta el comprobante de pago.';
            return;
        }

        state.loading = true;
        const dataUrl = await readFileAsDataUrl(state.ownerPaymentProof);
        const result = await submitOwnerPaymentServer(booking.id, state.ownerPaymentReference, dataUrl);
        state.loading = false;

        if (!result.ok) {
            toast.value = 'No se pudo reportar el pago.';
            return;
        }

        toast.value = 'Pago reportado. Esperando confirmación del cuidador.';
        setTimeout(() => window.location.reload(), 1500);
    });

    const handleCaregiverConfirmation = $(async (confirmed: boolean) => {
        state.loading = true;
        const result = await confirmCaregiverPaymentServer(booking.id, confirmed, state.caregiverNote);
        state.loading = false;

        if (!result.ok) {
            toast.value = 'No se pudo procesar la confirmación.';
            return;
        }

        toast.value = confirmed ? 'Pago confirmado.' : 'Pago rechazado.';
        setTimeout(() => window.location.reload(), 1500);
    });

    const handleFeePayment = $(async () => {
        if (!state.feeReference.trim()) {
            toast.value = 'Ingresa la referencia del fee.';
            return;
        }
        if (!state.feeProof) {
            toast.value = 'Adjunta el comprobante del fee.';
            return;
        }

        state.loading = true;
        const dataUrl = await readFileAsDataUrl(state.feeProof);
        const result = await submitFeePaymentServer(booking.id, state.feeReference, dataUrl);
        state.loading = false;

        if (!result.ok) {
            toast.value = 'No se pudo reportar el fee.';
            return;
        }

        toast.value = 'Fee reportado. ACUPATAS validará en máximo 24h.';
        setTimeout(() => window.location.reload(), 1500);
    });

    const handleValidateFee = $(async () => {
        state.loading = true;
        const result = await validateFeePaymentServer(booking.id);
        state.loading = false;

        if (!result.ok) {
            toast.value = 'No se pudo validar el fee.';
            return;
        }

        toast.value = 'Fee validado. Reserva activada.';
        setTimeout(() => window.location.reload(), 1500);
    });

    const canOwnerPay = role === 'owner' && booking.status === 'accepted';
    const canCaregiverConfirm = role === 'caregiver' && booking.status === 'payment_sent';
    const canPayFee = role === 'caregiver' && booking.status === 'payment_confirmed';
    const canValidateFee = booking.status === 'fee_submitted' && data.value.isAdmin; // Admin only

    return (
        <div class="min-h-screen bg-gradient-to-b from-[#f7f2ff] via-white to-[#fff9f2] text-[#1f1633]">
            <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-10 space-y-8">
                <header class="bg-white border border-[#4a2e85]/15 rounded-3xl p-6 sm:p-10 shadow-lg space-y-6">
                    <div class="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.3em] text-[#4a2e85]">
                        <span class="px-3 py-1 rounded-full bg-[#4a2e85]/10 text-[#4a2e85] font-semibold">ACUPATAS</span>
                        <span>Pagos y Confirmaciones</span>
                    </div>
                    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <article class="p-4 rounded-2xl border border-[#4a2e85]/10 bg-[#fefce8]">
                            <p class="text-xs text-gray-500 uppercase">Reserva</p>
                            <p class="text-lg font-bold">{booking.id}</p>
                            <p class="text-sm text-gray-500">{booking.service} · {data.value.petName}</p>
                        </article>
                        <article class="p-4 rounded-2xl border border-[#4a2e85]/10 bg-white">
                            <p class="text-xs text-gray-500 uppercase">Dueño</p>
                            <p class="font-semibold">{data.value.ownerName}</p>
                            <p class="text-sm mt-1">
                                Estado: <span class="font-semibold">{booking.ownerPaymentDate ? 'Pago enviado' : 'Pendiente'}</span>
                            </p>
                        </article>
                        <article class="p-4 rounded-2xl border border-[#4a2e85]/10 bg-white">
                            <p class="text-xs text-gray-500 uppercase">Cuidador</p>
                            <p class="font-semibold">{data.value.caregiverName}</p>
                            <p class="text-sm mt-1">
                                Estado: <span class="font-semibold">{booking.feeValidated ? 'Fee validado' : booking.feePaymentDate ? 'Fee en revisión' : booking.caregiverConfirmedPayment ? 'Debe pagar fee' : 'En espera'}</span>
                            </p>
                        </article>
                        <article class="p-4 rounded-2xl border border-[#4a2e85]/10 bg-white">
                            <p class="text-xs text-gray-500 uppercase">Importe total</p>
                            <p class="text-2xl font-bold">{formatMoney(booking.amountUsd)}</p>
                            <p class="text-xs text-gray-500">{nights} días · {formatMoney(booking.amountUsd / nights)} c/u</p>
                        </article>
                    </div>
                    {toast.value && (
                        <p class="text-sm text-[#0f5132] bg-[#d1e7dd] px-4 py-2 rounded-2xl">{toast.value}</p>
                    )}
                </header>

                {canOwnerPay && (
                    <section class="bg-white border border-[#4a2e85]/10 rounded-3xl p-6 sm:p-8 shadow space-y-5">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-2xl bg-[#4a2e85]/10 text-[#4a2e85] grid place-items-center">
                                <LuCreditCard class="w-5 h-5" />
                            </div>
                            <div>
                                <p class="text-xs uppercase tracking-[0.3em] text-gray-400">Paso 1</p>
                                <h2 class="text-xl font-semibold">Pago del dueño al cuidador</h2>
                            </div>
                        </div>
                        {data.value.caregiverBank && (
                            <div class="rounded-2xl border border-dashed border-[#4a2e85]/30 p-4 text-sm text-gray-600 space-y-2">
                                <p>Pago Móvil del cuidador:</p>
                                <ul class="text-[#4a2e85] font-semibold">
                                    <li>{data.value.caregiverBank.name}</li>
                                    <li>{data.value.caregiverBank.paymobile} · {data.value.caregiverBank.titular}</li>
                                    <li>RIF: {data.value.caregiverBank.rif}</li>
                                </ul>
                            </div>
                        )}
                        <div class="grid gap-4 sm:grid-cols-2">
                            <label class="text-sm text-gray-600 space-y-1">
                                Referencia
                                <input
                                    class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                                    value={state.ownerPaymentReference}
                                    onInput$={(e) => (state.ownerPaymentReference = (e.target as HTMLInputElement).value)}
                                />
                            </label>
                            <label class="text-sm text-gray-600 space-y-1">
                                Comprobante
                                <input
                                    type="file"
                                    accept="image/*,application/pdf"
                                    class="text-xs"
                                    onChange$={(e) => (state.ownerPaymentProof = (e.target as HTMLInputElement).files?.[0] || null)}
                                />
                            </label>
                        </div>
                        <button
                            class="bg-[#4a2e85] text-white px-4 py-2 rounded-2xl text-sm font-semibold hover:bg-[#37235f] disabled:opacity-50"
                            onClick$={handleOwnerPayment}
                            data-no-loader="true"
                            disabled={state.loading}
                        >
                            {state.loading ? 'Procesando...' : 'He pagado al cuidador'}
                        </button>
                    </section>
                )}

                {canCaregiverConfirm && (
                    <section class="bg-white border border-[#4a2e85]/10 rounded-3xl p-6 shadow space-y-4">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-2xl bg-[#fef3c7] text-[#b45309] grid place-items-center">
                                <LuShieldCheck class="w-5 h-5" />
                            </div>
                            <div>
                                <p class="text-xs uppercase tracking-[0.3em] text-gray-400">Paso 2</p>
                                <h2 class="text-lg font-semibold">Confirmación del cuidador</h2>
                            </div>
                        </div>
                        <p class="text-sm text-gray-600">
                            El dueño reportó el pago. Confirma si lo recibiste o reporta un problema.
                        </p>
                        <label class="text-sm text-gray-600 space-y-1">
                            Nota (opcional)
                            <input
                                class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                                value={state.caregiverNote}
                                onInput$={(e) => (state.caregiverNote = (e.target as HTMLInputElement).value)}
                            />
                        </label>
                        <div class="flex items-center gap-3">
                            <button
                                class="bg-[#22c55e] text-white px-3 py-2 rounded-2xl text-sm disabled:opacity-40"
                                onClick$={() => handleCaregiverConfirmation(true)}
                                disabled={state.loading}
                            >
                                Confirmar recibido
                            </button>
                            <button
                                class="bg-[#fee2e2] text-[#b91c1c] px-3 py-2 rounded-2xl text-sm disabled:opacity-40"
                                onClick$={() => handleCaregiverConfirmation(false)}
                                disabled={state.loading}
                            >
                                Reportar problema
                            </button>
                        </div>
                    </section>
                )}

                {canPayFee && (
                    <section class="bg-white border border-[#4a2e85]/10 rounded-3xl p-6 shadow space-y-4">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-2xl bg-[#dcfce7] text-[#166534] grid place-items-center">
                                <LuBanknote class="w-5 h-5" />
                            </div>
                            <div>
                                <p class="text-xs uppercase tracking-[0.3em] text-gray-400">Paso 3</p>
                                <h2 class="text-lg font-semibold">Fee del cuidador → ACUPATAS</h2>
                            </div>
                        </div>
                        <div class="text-sm text-gray-600 space-y-2">
                            <p>Monto del fee (20%): <strong>{formatMoney(feeAmount)}</strong></p>
                            <p>Plazo máximo: 48h después de confirmar el pago del dueño.</p>
                            <div class="mt-2 p-3 bg-gray-50 rounded-xl text-xs text-gray-600 border border-dashed border-gray-300">
                                <p class="font-bold text-[#4a2e85] mb-1">Pago Móvil ACUPATAS:</p>
                                <p>Banco de Venezuela (0102)</p>
                                <p>RIF: J-50790355 · Tel: 0412-1234567</p>
                                <p class="mt-1 text-gray-500 italic">Tu pago se verificará automáticamente.</p>
                            </div>
                        </div>
                        <div class="grid gap-4 sm:grid-cols-2">
                            <label class="text-sm text-gray-600 space-y-1">
                                Referencia del fee
                                <input
                                    class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                                    value={state.feeReference}
                                    onInput$={(e) => (state.feeReference = (e.target as HTMLInputElement).value)}
                                />
                            </label>
                            <label class="text-sm text-gray-600 space-y-1">
                                Comprobante
                                <input
                                    type="file"
                                    accept="image/*,application/pdf"
                                    class="text-xs"
                                    onChange$={(e) => (state.feeProof = (e.target as HTMLInputElement).files?.[0] || null)}
                                />
                            </label>
                        </div>
                        <button
                            class="bg-[#4a2e85] text-white px-3 py-2 rounded-2xl text-sm disabled:opacity-40"
                            onClick$={handleFeePayment}
                            data-no-loader="true"
                            disabled={state.loading}
                        >
                            {state.loading ? 'Procesando...' : 'Reportar fee pagado'}
                        </button>
                    </section>
                )}

                {canValidateFee && (
                    <section class="bg-white border border-[#4a2e85]/10 rounded-3xl p-6 shadow space-y-4">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-2xl bg-[#e0e7ff] text-[#4338ca] grid place-items-center">
                                <LuFileText class="w-5 h-5" />
                            </div>
                            <div>
                                <p class="text-xs uppercase tracking-[0.3em] text-gray-400">Admin</p>
                                <h2 class="text-lg font-semibold">Validar fee (DEMO)</h2>
                            </div>
                        </div>
                        <p class="text-sm text-gray-600">
                            El cuidador reportó el fee. Valida el pago para activar la reserva.
                        </p>
                        <button
                            class="bg-[#d1fae5] text-[#065f46] px-3 py-2 rounded-2xl text-sm disabled:opacity-40"
                            onClick$={handleValidateFee}
                            data-no-loader="true"
                            disabled={state.loading}
                        >
                            {state.loading ? 'Procesando...' : 'Validar fee (demo)'}
                        </button>
                    </section>
                )}

                <section class="bg-white border border-[#4a2e85]/10 rounded-3xl p-6 sm:p-8 shadow space-y-6">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-2xl bg-[#e0e7ff] text-[#4338ca] grid place-items-center">
                            <LuFileText class="w-5 h-5" />
                        </div>
                        <div>
                            <p class="text-xs uppercase tracking-[0.3em] text-gray-400">Timeline</p>
                            <h2 class="text-xl font-semibold">Eventos recientes</h2>
                        </div>
                    </div>
                    <div class="grid gap-3 md:grid-cols-2">
                        {state.events.map((event) => (
                            <div
                                key={event.id}
                                class="border border-[#4a2e85]/10 rounded-2xl p-4 text-sm flex items-start gap-3"
                            >
                                <div class="text-xs font-semibold text-gray-400">{new Date(event.createdAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}</div>
                                <p
                                    class={[
                                        event.eventType === 'success' && 'text-[#15803d]',
                                        event.eventType === 'warning' && 'text-[#b45309]',
                                        event.eventType === 'error' && 'text-[#b91c1c]',
                                        event.eventType === 'info' && 'text-[#1d4ed8]',
                                    ]}
                                >
                                    {event.message}
                                </p>
                            </div>
                        ))}
                        {state.events.length === 0 && (
                            <div class="text-sm text-gray-600">No hay eventos registrados aún.</div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
});
