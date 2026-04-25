import { component$, $, useSignal, useComputed$, useTask$ } from '@builder.io/qwik';
import { Link, routeLoader$, server$ } from '@builder.io/qwik-city';
import { getSessionFromEvent, getUserById, isAdmin } from '~/lib/auth';
import { listCommissionBookingsForAdmin, validateFeePayment, type AdminCommissionRecord } from '~/lib/services';

export const useAdminCommissions = routeLoader$(async (event) => {
  const session = await getSessionFromEvent(event);
  if (!session) throw event.redirect(302, '/auth?mode=login');

  const user = await getUserById(session.userId);
  if (!isAdmin(user)) {
    throw event.error(403, 'Acceso denegado. Solo administradores.');
  }

  return {
    commissions: await listCommissionBookingsForAdmin(),
  };
});

const validateCommissionServer = server$(async function (bookingId: string) {
  const session = await getSessionFromEvent(this);
  if (!session) return { ok: false, reason: 'auth', commissions: [] as AdminCommissionRecord[] } as const;

  const user = await getUserById(session.userId);
  if (!isAdmin(user)) {
    return { ok: false, reason: 'forbidden', commissions: [] as AdminCommissionRecord[] } as const;
  }

  const result = await validateFeePayment(bookingId, session.userId, false, {
    bdvApiKey: this.env.get('BDV_KEY') || this.env.get('BDV_API_KEY') || this.env.get('BDV_API_KEY_QA') || '',
    bdvEndpoint: this.env.get('BDV_API_ENDPOINT') || this.env.get('BDV_ENDPOINT') || 'https://bdvconciliacion.banvenez.com/getMovement',
    acupatasRif: this.env.get('ACUPATAS_RIF') || 'J507903559',
    acupatasPhone: this.env.get('ACUPATAS_PHONE') || '04147199496',
  });
  if (!result.ok) return { ok: false, reason: result.reason, commissions: [] as AdminCommissionRecord[] } as const;

  return {
    ok: true,
    commissions: await listCommissionBookingsForAdmin(),
  } as const;
});

const validateManualCommissionServer = server$(async function (bookingId: string) {
  const session = await getSessionFromEvent(this);
  if (!session) return { ok: false, reason: 'auth', commissions: [] as AdminCommissionRecord[] } as const;

  const user = await getUserById(session.userId);
  if (!isAdmin(user)) {
    return { ok: false, reason: 'forbidden', commissions: [] as AdminCommissionRecord[] } as const;
  }

  const result = await validateFeePayment(bookingId, session.userId, true);
  if (!result.ok) return { ok: false, reason: result.reason, commissions: [] as AdminCommissionRecord[] } as const;

  return {
    ok: true,
    commissions: await listCommissionBookingsForAdmin(),
  } as const;
});

const statusLabel = (status: string) => {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'fee_submitted') return 'Comisión enviada';
  if (normalized === 'active') return 'Servicio activo';
  return status || 'Sin estado';
};

export default component$(() => {
  const data = useAdminCommissions();
  const commissions = useSignal<AdminCommissionRecord[]>(data.value.commissions || []);
  const isValidating = useSignal<string>('');
  const toast = useSignal('');
  const search = useSignal('');
  const payerPhoneFilter = useSignal('');
  const bankOriginFilter = useSignal('');
  const statusFilter = useSignal<'all' | 'pending' | 'validated' | 'rejected' | 'automatic' | 'manual'>('all');
  const dateFrom = useSignal('');
  const dateTo = useSignal('');
  const currentPage = useSignal(1);
  const pageSize = 20;

  const filteredCommissions = useComputed$(() => {
    let list = [...commissions.value];

    if (statusFilter.value === 'pending') {
      list = list.filter((item) => !item.feeValidated && !item.rejected);
    } else if (statusFilter.value === 'validated') {
      list = list.filter((item) => item.feeValidated);
    } else if (statusFilter.value === 'rejected') {
      list = list.filter((item) => item.rejected);
    } else if (statusFilter.value === 'automatic') {
      list = list.filter((item) => item.feeValidated && item.validationMode === 'automatic');
    } else if (statusFilter.value === 'manual') {
      list = list.filter((item) => item.feeValidated && item.validationMode === 'manual');
    }

    if (search.value.trim()) {
      const needle = search.value.trim().toLowerCase();
      list = list.filter((item) => {
        const haystack = [
          item.bookingId,
          item.ownerName,
          item.ownerEmail,
          item.caregiverName,
          item.caregiverEmail,
          item.feeReference,
          item.feePayerPhone,
          item.feeBankOrigin,
          item.service,
        ].join(' ').toLowerCase();
        return haystack.includes(needle);
      });
    }

    if (payerPhoneFilter.value.trim()) {
      const needle = payerPhoneFilter.value.replace(/\D/g, '');
      list = list.filter((item) => String(item.feePayerPhone || '').replace(/\D/g, '').includes(needle));
    }

    if (bankOriginFilter.value.trim()) {
      const needle = bankOriginFilter.value.replace(/\D/g, '');
      list = list.filter((item) => String(item.feeBankOrigin || '').replace(/\D/g, '').includes(needle));
    }

    if (dateFrom.value || dateTo.value) {
      const fromDate = dateFrom.value ? new Date(`${dateFrom.value}T00:00:00`) : null;
      const toDate = dateTo.value ? new Date(`${dateTo.value}T23:59:59`) : null;

      list = list.filter((item) => {
        const source = item.feePaymentDate || item.updatedAt;
        if (!source) return false;
        const rowDate = new Date(source);
        if (Number.isNaN(rowDate.getTime())) return false;
        if (fromDate && rowDate < fromDate) return false;
        if (toDate && rowDate > toDate) return false;
        return true;
      });
    }

    return list;
  });

  const pendingCount = filteredCommissions.value.filter((item) => !item.feeValidated && !item.rejected).length;
  const validatedCount = filteredCommissions.value.filter((item) => item.feeValidated).length;
  const rejectedCount = filteredCommissions.value.filter((item) => item.rejected).length;

  const totalPages = useComputed$(() => {
    const totalItems = filteredCommissions.value.length;
    return Math.max(1, Math.ceil(totalItems / pageSize));
  });

  const paginatedCommissions = useComputed$(() => {
    const start = (currentPage.value - 1) * pageSize;
    return filteredCommissions.value.slice(start, start + pageSize);
  });

  const pageStart = useComputed$(() => {
    if (filteredCommissions.value.length === 0) return 0;
    return (currentPage.value - 1) * pageSize + 1;
  });

  const pageEnd = useComputed$(() => {
    if (filteredCommissions.value.length === 0) return 0;
    return Math.min(currentPage.value * pageSize, filteredCommissions.value.length);
  });

  useTask$(({ track }) => {
    track(() => filteredCommissions.value.length);
    track(() => totalPages.value);
    if (currentPage.value > totalPages.value) {
      currentPage.value = totalPages.value;
    }
    if (currentPage.value < 1) {
      currentPage.value = 1;
    }
  });

  const onValidate = $(async (bookingId: string) => {
    isValidating.value = bookingId;
    toast.value = '';
    try {
      const result = await validateCommissionServer(bookingId);
      if (!result.ok) {
        toast.value = `No se pudo validar la comisión (${result.reason || 'error desconocido'}).`;
        isValidating.value = '';
        return;
      }

      commissions.value = result.commissions;
      toast.value = '✅ Comisión validada correctamente.';
      isValidating.value = '';
    } catch (err) {
      console.error('[Admin Comisiones] Validate error:', err);
      toast.value = 'Error de conexión al validar la comisión. Intenta de nuevo.';
      isValidating.value = '';
    }
    // Auto-clear toast after 4s
    setTimeout(() => {
      toast.value = '';
    }, 4000);
  });

  const onValidateManual = $(async (bookingId: string) => {
    if (!confirm('¿Estás seguro de validar esta comisión manualmente? Se omitirá el chequeo con BDV.')) return;
    isValidating.value = bookingId;
    toast.value = '';
    try {
      const result = await validateManualCommissionServer(bookingId);
      if (!result.ok) {
        toast.value = `Error: ${result.reason || 'error desconocido'}.`;
        isValidating.value = '';
        return;
      }

      commissions.value = result.commissions;
      toast.value = '✅ Comisión validada MANUALMENTE.';
      isValidating.value = '';
    } catch (err) {
      console.error('[Admin Comisiones] Manual validate error:', err);
      toast.value = 'Error de conexión. Intenta de nuevo.';
      isValidating.value = '';
    }
    setTimeout(() => {
      toast.value = '';
    }, 4000);
  });

  return (
    <div class="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <header class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 class="text-3xl font-extrabold text-[#4a2e85]">Comisiones de cuidadores</h1>
          <p class="text-[#4a2e85b3] text-sm">Valida pagos de comisión para desbloquear nuevos servicios.</p>
        </div>
        <div class="flex items-center gap-2">
          <Link href="/dashboard/admin" class="px-4 py-2 rounded-xl border border-[#4a2e85]/20 text-[#4a2e85] font-semibold">
            Volver al admin
          </Link>
        </div>
      </header>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p class="text-xs uppercase font-bold text-amber-700">Pendientes</p>
          <p class="text-2xl font-black text-amber-800">{pendingCount}</p>
        </div>
        <div class="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p class="text-xs uppercase font-bold text-emerald-700">Validadas</p>
          <p class="text-2xl font-black text-emerald-800">{validatedCount}</p>
        </div>
        <div class="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p class="text-xs uppercase font-bold text-rose-700">Rechazadas</p>
          <p class="text-2xl font-black text-rose-800">{rejectedCount}</p>
        </div>
      </div>

      <div class="bg-white rounded-2xl border border-[#4a2e85]/10 shadow-sm p-4 grid grid-cols-1 lg:grid-cols-6 gap-3">
        <input
          type="text"
          placeholder="Buscar por cuidador, dueño, email, referencia, tel pagador, banco emisor o booking..."
          class="w-full px-3 py-2 rounded-xl border border-[#4a2e85]/20 focus:outline-none focus:ring-2 focus:ring-[#ef7c43]"
          value={search.value}
          onInput$={(event) => (search.value = (event.target as HTMLInputElement).value)}
        />

        <input
          type="text"
          placeholder="Filtro tel pagador"
          class="w-full px-3 py-2 rounded-xl border border-[#4a2e85]/20 focus:outline-none focus:ring-2 focus:ring-[#ef7c43]"
          value={payerPhoneFilter.value}
          onInput$={(event) => (payerPhoneFilter.value = (event.target as HTMLInputElement).value)}
        />

        <input
          type="text"
          placeholder="Filtro banco emisor (0102)"
          class="w-full px-3 py-2 rounded-xl border border-[#4a2e85]/20 focus:outline-none focus:ring-2 focus:ring-[#ef7c43]"
          value={bankOriginFilter.value}
          onInput$={(event) => (bankOriginFilter.value = (event.target as HTMLInputElement).value)}
        />

        <select
          class="w-full px-3 py-2 rounded-xl border border-[#4a2e85]/20 focus:outline-none focus:ring-2 focus:ring-[#ef7c43] bg-white"
          value={statusFilter.value}
          onChange$={(event) => (statusFilter.value = (event.target as HTMLSelectElement).value as 'all' | 'pending' | 'validated' | 'rejected' | 'automatic' | 'manual')}
        >
          <option value="all">Todos los estados</option>
          <option value="pending">Pendientes</option>
          <option value="validated">Validadas</option>
          <option value="rejected">Rechazadas</option>
          <option value="automatic">Validadas automáticas (BDV)</option>
          <option value="manual">Validadas manuales</option>
        </select>

        <input
          type="date"
          class="w-full px-3 py-2 rounded-xl border border-[#4a2e85]/20 focus:outline-none focus:ring-2 focus:ring-[#ef7c43]"
          value={dateFrom.value}
          onInput$={(event) => (dateFrom.value = (event.target as HTMLInputElement).value)}
        />

        <div class="flex items-center gap-2">
          <input
            type="date"
            class="w-full px-3 py-2 rounded-xl border border-[#4a2e85]/20 focus:outline-none focus:ring-2 focus:ring-[#ef7c43]"
            value={dateTo.value}
            onInput$={(event) => (dateTo.value = (event.target as HTMLInputElement).value)}
          />
          <button
            type="button"
            class="px-3 py-2 rounded-xl border border-[#4a2e85]/20 text-[#4a2e85] font-semibold hover:bg-[#4a2e85]/5"
            onClick$={() => {
              search.value = '';
              payerPhoneFilter.value = '';
              bankOriginFilter.value = '';
              statusFilter.value = 'all';
              dateFrom.value = '';
              dateTo.value = '';
              currentPage.value = 1;
            }}
          >
            Limpiar
          </button>
        </div>
      </div>

      {toast.value && (
        <div class="rounded-xl border border-[#4a2e85]/15 bg-[#f7f3ff] px-3 py-2 text-sm text-[#4a2e85]">
          {toast.value}
        </div>
      )}

      <div class="bg-white rounded-2xl border border-[#4a2e85]/10 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-[#4a2e85]/5 border-b border-[#4a2e85]/10">
                <th class="px-4 py-3 text-xs font-bold text-[#4a2e85]">Cuidador</th>
                <th class="px-4 py-3 text-xs font-bold text-[#4a2e85]">Dueño</th>
                <th class="px-4 py-3 text-xs font-bold text-[#4a2e85]">Servicio</th>
                <th class="px-4 py-3 text-xs font-bold text-[#4a2e85]">Comisión</th>
                <th class="px-4 py-3 text-xs font-bold text-[#4a2e85]">Estado</th>
                <th class="px-4 py-3 text-xs font-bold text-[#4a2e85]">BDV / Factura</th>
                <th class="px-4 py-3 text-xs font-bold text-[#4a2e85] text-right">Acción</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[#4a2e85]/8">
              {paginatedCommissions.value.map((item) => (
                <tr key={item.bookingId}>
                  <td class="px-4 py-3">
                    <p class="font-semibold text-[#4a2e85]">{item.caregiverName || 'Cuidador'}</p>
                    <p class="text-xs text-[#4a2e85b3]">{item.caregiverEmail || '-'}</p>
                  </td>
                  <td class="px-4 py-3">
                    <p class="font-semibold text-[#4a2e85]">{item.ownerName || 'Dueño'}</p>
                    <p class="text-xs text-[#4a2e85b3]">{item.ownerEmail || '-'}</p>
                  </td>
                  <td class="px-4 py-3">
                    <p class="text-sm font-semibold text-[#4a2e85] capitalize">{item.service || '-'}</p>
                    <p class="text-xs text-[#4a2e85b3]">{item.dateFrom?.slice(0, 10)} → {item.dateTo?.slice(0, 10)}</p>
                  </td>
                  <td class="px-4 py-3">
                    <p class="font-bold text-[#ef7c43]">
                      ${((item.feeAmount && item.feeAmount > 0) ? item.feeAmount : (item.amountUsd * 0.2)).toFixed(2)}
                    </p>
                    <p class="text-xs text-[#4a2e85b3]">
                      Bs {(((item.feeAmount && item.feeAmount > 0) ? item.feeAmount : (item.amountUsd * 0.2)) * 400).toFixed(2)}
                    </p>
                    <p class="text-xs text-[#4a2e85b3]">Ref: {item.feeReference || 'Pendiente'}</p>
                    <p class="text-xs text-[#4a2e85b3]">Banco emisor: {item.feeBankOrigin || '-'}</p>
                    <p class="text-xs text-[#4a2e85b3]">Tel pagador: {item.feePayerPhone || '-'}</p>
                    {item.feeProof && (
                      <a href={item.feeProof} target="_blank" class="text-xs text-[#4a2e85] underline">Ver comprobante</a>
                    )}
                  </td>
                  <td class="px-4 py-3">
                    {item.feeValidated ? (
                      <div class="flex flex-col items-start gap-1">
                        <span class="inline-flex px-2 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">Validada</span>
                        <span class={`inline-flex px-2 py-1 rounded-full text-[10px] font-bold border ${item.validationMode === 'automatic' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-violet-100 text-violet-700 border-violet-200'}`}>
                          {item.validationMode === 'automatic' ? 'Automática (BDV)' : 'Manual'}
                        </span>
                      </div>
                    ) : item.rejected ? (
                      <div class="flex flex-col items-start gap-1">
                        <span class="inline-flex px-2 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200">Rechazada</span>
                        {item.rejectionReason && (
                          <p class="text-[10px] text-rose-700 max-w-[220px] break-words">{item.rejectionReason}</p>
                        )}
                      </div>
                    ) : (
                      <span class="inline-flex px-2 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">Pendiente</span>
                    )}
                    <p class="text-xs text-[#4a2e85b3] mt-1">{statusLabel(item.status)}</p>
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex flex-col gap-2 items-start">
                      <div class="flex flex-wrap gap-1.5">
                        <span class={`inline-flex px-2 py-1 rounded-full text-[10px] font-bold border ${
                          item.bdvStatus === 'success'
                            ? 'bg-blue-100 text-blue-700 border-blue-200'
                            : item.bdvStatus === 'error'
                              ? 'bg-rose-100 text-rose-700 border-rose-200'
                              : 'bg-amber-100 text-amber-700 border-amber-200'
                        }`}>
                          {item.bdvStatus === 'success' ? 'BDV OK' : item.bdvStatus === 'error' ? 'BDV Error' : 'BDV Pendiente'}
                        </span>
                        <span class={`inline-flex px-2 py-1 rounded-full text-[10px] font-bold border ${
                          item.invoiceStatus === 'issued'
                            ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                            : item.invoiceStatus === 'error'
                              ? 'bg-rose-100 text-rose-700 border-rose-200'
                              : item.invoiceStatus === 'warning'
                                ? 'bg-amber-100 text-amber-700 border-amber-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}>
                          {item.invoiceStatus === 'issued'
                            ? 'Factura emitida'
                            : item.invoiceStatus === 'error'
                              ? 'Factura con error'
                              : item.invoiceStatus === 'warning'
                                ? 'Factura omitida'
                                : 'Factura pendiente'}
                        </span>
                      </div>
                      {item.bdvMessage && (
                        <p class={`text-[10px] max-w-[260px] break-words ${
                          item.bdvStatus === 'error' ? 'text-rose-700' : 'text-[#4a2e85b3]'
                        }`}>
                          {item.bdvMessage}
                        </p>
                      )}
                      {item.invoiceMessage && (
                        <p class={`text-[10px] max-w-[260px] break-words ${
                          item.invoiceStatus === 'error' ? 'text-rose-700' : item.invoiceStatus === 'warning' ? 'text-amber-700' : 'text-[#4a2e85b3]'
                        }`}>
                          {item.invoiceMessage}
                        </p>
                      )}
                    </div>
                  </td>
                  <td class="px-4 py-3 text-right">
                    {item.feeValidated ? (
                      <span class="text-xs font-semibold text-emerald-700 flex items-center justify-end gap-1">
                        <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>
                        Ya validada
                      </span>
                    ) : (
                      <div class="flex flex-col gap-1 items-end">
                        <button
                          class={`px-3 py-2 rounded-xl text-sm font-bold text-white bg-[#4a2e85] flex items-center gap-2 ${isValidating.value === item.bookingId ? 'opacity-70 cursor-not-allowed' : 'hover:bg-[#3a2369] active:scale-95'} transition-all`}
                          onClick$={() => onValidate(item.bookingId)}
                          data-no-loader="true"
                          disabled={isValidating.value === item.bookingId}
                        >
                          {isValidating.value === item.bookingId ? 'Procesando...' : (item.rejected ? 'Reintentar BDV' : 'Validar (BDV)')}
                        </button>
                        <button
                          class={`px-3 py-1.5 rounded-xl text-[11px] font-bold text-[#4a2e85] border border-[#4a2e85] flex items-center gap-1 ${isValidating.value === item.bookingId ? 'opacity-70 cursor-not-allowed' : 'hover:bg-[#4a2e85] hover:text-white active:scale-95'} transition-all`}
                          onClick$={() => onValidateManual(item.bookingId)}
                          data-no-loader="true"
                          disabled={isValidating.value === item.bookingId}
                        >
                          {isValidating.value === item.bookingId ? 'Procesando...' : (item.rejected ? 'Aprobar Manual' : 'Validación Manual')}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filteredCommissions.value.length === 0 && (
                <tr>
                  <td colSpan={7} class="px-4 py-8 text-center text-sm text-[#4a2e85b3]">No hay resultados con los filtros aplicados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-t border-[#4a2e85]/10 bg-[#faf9ff]">
          <p class="text-xs text-[#4a2e85b3]">
            Mostrando {pageStart.value} - {pageEnd.value} de {filteredCommissions.value.length} registros
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
