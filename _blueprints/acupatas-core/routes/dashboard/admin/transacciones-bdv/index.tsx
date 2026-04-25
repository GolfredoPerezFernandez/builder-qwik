import { $, component$, useComputed$, useSignal } from '@builder.io/qwik';
import { Link, routeLoader$, server$ } from '@builder.io/qwik-city';
import { getSessionFromEvent, getUserById } from '~/lib/auth';
import { listIncomingBankPaymentsForAdmin, type AdminBankPaymentRecord, validateFeePayment } from '~/lib/services';
import { getTursoClient } from '~/lib/turso';
import { getBankCode, verifyBdvMovement } from '~/lib/bdv';

export const useIncomingBdvPayments = routeLoader$(async (event) => {
  const session = await getSessionFromEvent(event);
  if (!session) throw event.redirect(302, '/auth?mode=login');

  const user = await getUserById(session.userId);
  if ((user?.email || '').trim().toLowerCase() !== 'admin@gmail.com') {
    throw event.error(403, 'Acceso denegado. Solo administradores.');
  }

  return {
    payments: await listIncomingBankPaymentsForAdmin(),
    refreshedAt: new Date().toISOString(),
  };
});

const refreshIncomingBdvPayments = server$(async function () {
  const session = await getSessionFromEvent(this);
  if (!session) return { ok: false, reason: 'auth', payments: [] as AdminBankPaymentRecord[], refreshedAt: '' } as const;

  const user = await getUserById(session.userId);
  if ((user?.email || '').trim().toLowerCase() !== 'admin@gmail.com') {
    return { ok: false, reason: 'forbidden', payments: [] as AdminBankPaymentRecord[], refreshedAt: '' } as const;
  }

  return {
    ok: true,
    payments: await listIncomingBankPaymentsForAdmin(),
    refreshedAt: new Date().toISOString(),
  } as const;
});

const reconcileReferenceServer = server$(async function (reference: string) {
  const session = await getSessionFromEvent(this);
  if (!session) {
    return { ok: false, reason: 'auth', message: 'Sesión expirada.' } as const;
  }

  const user = await getUserById(session.userId);
  if ((user?.email || '').trim().toLowerCase() !== 'admin@gmail.com') {
    return { ok: false, reason: 'forbidden', message: 'Solo administradores.' } as const;
  }

  const cleanReference = String(reference || '').trim();
  if (!cleanReference) {
    return { ok: false, reason: 'invalid_reference', message: 'Debes indicar la referencia.' } as const;
  }
  if (cleanReference.length < 4 || cleanReference.length > 20) {
    return { ok: false, reason: 'invalid_reference', message: 'La referencia debe tener entre 4 y 20 caracteres.' } as const;
  }

  const client = getTursoClient();
  const bookingRes = await client.execute({
    sql: `select id, caregiver_id, fee_reference, fee_amount, fee_payment_date, fee_validated
      from bookings
      where fee_reference = ?
      order by updated_at desc
      limit 1`,
    args: [cleanReference],
  });

  const booking = bookingRes.rows[0] as any;
  if (!booking) {
    return {
      ok: false,
      reason: 'booking_not_found',
      message: 'No existe un booking interno con esa referencia.',
    } as const;
  }

  const bankRes = await client.execute({
    sql: 'select bank_name, rif, paymobile from caregiver_bank where user_id = ? limit 1',
    args: [booking.caregiver_id],
  });
  const bank = bankRes.rows[0] as any;
  if (!bank) {
    return {
      ok: false,
      reason: 'bank_not_found',
      message: 'El cuidador no tiene datos bancarios cargados.',
      bookingId: String(booking.id || ''),
    } as const;
  }

  const bdvApiKey = this.env.get('BDV_KEY') || this.env.get('BDV_API_KEY') || this.env.get('BDV_API_KEY_QA') || '';
  const bdvEndpoint = this.env.get('BDV_API_ENDPOINT') || this.env.get('BDV_ENDPOINT') || 'https://bdvconciliacion.banvenez.com/getMovement';
  const acupatasRif = this.env.get('ACUPATAS_RIF') || 'J507903559';
  const acupatasPhone = this.env.get('ACUPATAS_PHONE') || '04147199496';

  const bancoOrigen = getBankCode(String(bank.bank_name || ''));
  const isBdvToBdv = bancoOrigen === '0102';

  const bdvPayload = {
    cedulaPagador: isBdvToBdv
      ? String(bank.rif || 'V0')
      : `V${String(acupatasRif).replace(/[^0-9]/g, '')}`,
    telefonoPagador: String(bank.paymobile || ''),
    telefonoDestino: String(acupatasPhone),
    referencia: cleanReference,
    fechaPago: booking.fee_payment_date
      ? String(booking.fee_payment_date).slice(0, 10)
      : new Date().toISOString().split('T')[0],
    importe: Number(booking.fee_amount || 0).toFixed(2),
    bancoOrigen,
    reqCed: isBdvToBdv,
  };

  const bdvResult = await verifyBdvMovement(bdvPayload, {
    apiKey: String(bdvApiKey),
    endpoint: String(bdvEndpoint),
  });

  if (bdvResult.code !== 1000) {
    return {
      ok: false,
      reason: 'bdv_error',
      message: bdvResult.message || 'BDV no confirmó la operación.',
      bookingId: String(booking.id || ''),
      bdv: bdvResult,
    } as const;
  }

  const alreadyValidated = Boolean(booking.fee_validated ?? 0);
  if (!alreadyValidated) {
    const validation = await validateFeePayment(String(booking.id), session.userId, true, {
      bdvApiKey: String(bdvApiKey),
      bdvEndpoint: String(bdvEndpoint),
      acupatasRif: String(acupatasRif),
      acupatasPhone: String(acupatasPhone),
    });
    if (!validation.ok) {
      return {
        ok: false,
        reason: 'validation_failed',
        message: `BDV confirmó, pero falló validación interna: ${validation.reason || 'error'}`,
        bookingId: String(booking.id || ''),
        bdv: bdvResult,
      } as const;
    }
  }

  return {
    ok: true,
    bookingId: String(booking.id || ''),
    message: alreadyValidated
      ? 'BDV confirmó la operación. El booking ya estaba validado.'
      : 'BDV confirmó la operación y se validó la comisión correctamente.',
    bdv: bdvResult,
  } as const;
});

const checkIncomingReferenceServer = server$(async function (reference: string) {
  const session = await getSessionFromEvent(this);
  if (!session) {
    return { ok: false, reason: 'auth', exists: false, message: 'Sesión expirada.' } as const;
  }

  const user = await getUserById(session.userId);
  if ((user?.email || '').trim().toLowerCase() !== 'admin@gmail.com') {
    return { ok: false, reason: 'forbidden', exists: false, message: 'Solo administradores.' } as const;
  }

  const cleanReference = String(reference || '').trim();
  if (!cleanReference) {
    return { ok: false, reason: 'invalid_reference', exists: false, message: 'Debes ingresar una referencia.' } as const;
  }

  const client = getTursoClient();
  const result = await client.execute({
    sql: `select id, reference, amount, phone, date, created_at, booking_id
      from bank_payments
      where reference = ?
      order by created_at desc
      limit 1`,
    args: [cleanReference],
  });

  const row = result.rows[0] as any;
  if (!row) {
    const bookingRes = await client.execute({
      sql: `select id, caregiver_id, fee_reference, fee_amount, fee_payment_date
        from bookings
        where fee_reference = ?
        order by updated_at desc
        limit 1`,
      args: [cleanReference],
    });
    const booking = bookingRes.rows[0] as any;

    if (!booking) {
      return {
        ok: true,
        exists: false,
        source: 'none',
        message: `La referencia ${cleanReference} no existe en transacciones entrantes ni en referencias internas del sistema.`,
      } as const;
    }

    const bankRes = await client.execute({
      sql: 'select bank_name, rif, paymobile from caregiver_bank where user_id = ? limit 1',
      args: [booking.caregiver_id],
    });
    const bank = bankRes.rows[0] as any;
    if (!bank) {
      return {
        ok: true,
        exists: false,
        source: 'booking',
        message: `La referencia ${cleanReference} está registrada internamente, pero faltan datos bancarios del cuidador para consultar BDV.`,
      } as const;
    }

    const bdvApiKey = this.env.get('BDV_KEY') || this.env.get('BDV_API_KEY') || this.env.get('BDV_API_KEY_QA') || '';
    const bdvEndpoint = this.env.get('BDV_API_ENDPOINT') || this.env.get('BDV_ENDPOINT') || 'https://bdvconciliacion.banvenez.com/getMovement';
    const acupatasRif = this.env.get('ACUPATAS_RIF') || 'J507903559';
    const acupatasPhone = this.env.get('ACUPATAS_PHONE') || '04147199496';

    const bancoOrigen = getBankCode(String(bank.bank_name || ''));
    const isBdvToBdv = bancoOrigen === '0102';

    const bdvPayload = {
      cedulaPagador: isBdvToBdv
        ? String(bank.rif || 'V0')
        : `V${String(acupatasRif).replace(/[^0-9]/g, '')}`,
      telefonoPagador: String(bank.paymobile || ''),
      telefonoDestino: String(acupatasPhone),
      referencia: cleanReference,
      fechaPago: booking.fee_payment_date
        ? String(booking.fee_payment_date).slice(0, 10)
        : new Date().toISOString().split('T')[0],
      importe: Number(booking.fee_amount || 0).toFixed(2),
      bancoOrigen,
      reqCed: isBdvToBdv,
    };

    const bdvResult = await verifyBdvMovement(bdvPayload, {
      apiKey: String(bdvApiKey),
      endpoint: String(bdvEndpoint),
    });

    if (bdvResult.code === 1000) {
      return {
        ok: true,
        exists: true,
        source: 'bdv',
        message: `La referencia ${cleanReference} existe en BDV (${bdvResult.message || 'Transacción conciliada'}).`,
      } as const;
    }

    return {
      ok: true,
      exists: false,
      source: 'bdv',
      message: `BDV no confirmó la referencia ${cleanReference}: ${bdvResult.message || 'sin detalle'}.`,
    } as const;
  }

  return {
    ok: true,
    exists: true,
    source: 'local',
    message: `Referencia encontrada en transacciones entrantes: $${Number(row.amount || 0).toFixed(2)} · Tel ${String(row.phone || '-')}`,
    payment: {
      id: String(row.id || ''),
      reference: String(row.reference || ''),
      amount: Number(row.amount || 0),
      phone: String(row.phone || ''),
      date: String(row.date || ''),
      createdAt: String(row.created_at || ''),
      bookingId: String(row.booking_id || ''),
    },
  } as const;
});

type ManualBdvQueryInput = {
  referencia: string;
  fechaPago: string;
  importe: string;
  telefonoPagador: string;
  bancoOrigen: string;
  reqCed: boolean;
  cedulaPagador: string;
};

const normalizeAmountForBdv = (raw: string): string | null => {
  const value = String(raw || '').trim().replace(/\s+/g, '');
  if (!value) return null;

  let normalized = value;

  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  }

  const numeric = Number(normalized);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  return numeric.toFixed(2);
};

const isDateWithinLastThreeDays = (dateValue: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return false;
  const selected = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(selected.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const minDate = new Date(today);
  minDate.setDate(today.getDate() - 3);

  return selected.getTime() >= minDate.getTime() && selected.getTime() <= today.getTime();
};

const checkReferenceDirectlyInBdvServer = server$(async function (payload: ManualBdvQueryInput) {
  const session = await getSessionFromEvent(this);
  if (!session) {
    return { ok: false, exists: false, reason: 'auth', message: 'Sesión expirada.' } as const;
  }

  const user = await getUserById(session.userId);
  if ((user?.email || '').trim().toLowerCase() !== 'admin@gmail.com') {
    return { ok: false, exists: false, reason: 'forbidden', message: 'Solo administradores.' } as const;
  }

  const referencia = String(payload.referencia || '').trim();
  const fechaPago = String(payload.fechaPago || '').trim();
  const importeRaw = String(payload.importe || '').trim();
  const telefonoPagador = String(payload.telefonoPagador || '').trim();
  const bancoOrigen = String(payload.bancoOrigen || '').trim();
  const reqCed = Boolean(payload.reqCed);
  const cedulaPagador = String(payload.cedulaPagador || '').trim();
  const importe = normalizeAmountForBdv(importeRaw);

  if (!referencia || !fechaPago || !importeRaw || !telefonoPagador || !bancoOrigen) {
    return {
      ok: false,
      exists: false,
      reason: 'missing_fields',
      message: 'Completa referencia, fecha, monto, teléfono pagador y banco origen.',
    } as const;
  }

  if (!importe) {
    return {
      ok: false,
      exists: false,
      reason: 'invalid_amount',
      message: 'El importe es inválido. Usa formatos como 91600.00 o 91.600,00.',
    } as const;
  }

  if (!/^\d{4,8}$/.test(referencia)) {
    return {
      ok: false,
      exists: false,
      reason: 'invalid_reference_format',
      message: 'La referencia debe tener entre 4 y 8 dígitos numéricos (según BDV).',
    } as const;
  }

  if (!isDateWithinLastThreeDays(fechaPago)) {
    return {
      ok: false,
      exists: false,
      reason: 'date_out_of_window',
      message: 'La fecha está fuera de ventana BDV: solo hoy y hasta 3 días atrás.',
    } as const;
  }

  if (reqCed && bancoOrigen !== '0102') {
    return {
      ok: false,
      exists: false,
      reason: 'invalid_req_ced_for_bank',
      message: 'reqCed=true solo aplica para pagos BDV→BDV (bancoOrigen 0102).',
    } as const;
  }

  if (reqCed && !cedulaPagador) {
    return {
      ok: false,
      exists: false,
      reason: 'missing_cedula',
      message: 'Si activas reqCed, debes indicar la cédula del pagador.',
    } as const;
  }

  const bdvApiKey = this.env.get('BDV_KEY') || this.env.get('BDV_API_KEY') || this.env.get('BDV_API_KEY_QA') || '';
  const bdvEndpoint = this.env.get('BDV_API_ENDPOINT') || this.env.get('BDV_ENDPOINT') || 'https://bdvconciliacion.banvenez.com/getMovement';
  const acupatasPhone = this.env.get('ACUPATAS_PHONE') || '04147199496';

  const bdvResult = await verifyBdvMovement(
    {
      cedulaPagador: reqCed ? cedulaPagador : 'V0',
      telefonoPagador,
      telefonoDestino: String(acupatasPhone),
      referencia,
      fechaPago,
      importe,
      bancoOrigen,
      reqCed,
    },
    {
      apiKey: String(bdvApiKey),
      endpoint: String(bdvEndpoint),
    }
  );

  if (bdvResult.code === 1000) {
    return {
      ok: true,
      exists: true,
      reason: 'confirmed',
      message: `BDV confirmó la referencia ${referencia}: ${bdvResult.message || 'Transacción realizada'}.`,
      bdv: bdvResult,
    } as const;
  }

  return {
    ok: true,
    exists: false,
    reason: 'not_confirmed',
    message: `BDV no confirmó la referencia ${referencia}: ${bdvResult.message || 'sin detalle'}. (fecha=${fechaPago}, monto=${importe}, tel=${telefonoPagador}, banco=${bancoOrigen}, reqCed=${reqCed ? 'true' : 'false'})`,
    bdv: bdvResult,
  } as const;
});

const statusLabel = (status: string) => {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'fee_submitted') return 'Comisión enviada';
  if (normalized === 'active') return 'Servicio activo';
  if (normalized === 'completed') return 'Completado';
  if (normalized === 'cancelled') return 'Cancelado';
  return status || 'Sin estatus';
};

export default component$(() => {
  const data = useIncomingBdvPayments();
  const payments = useSignal<AdminBankPaymentRecord[]>(data.value.payments || []);
  const search = useSignal('');
  const isRefreshing = useSignal(false);
  const lastUpdated = useSignal(data.value.refreshedAt || new Date().toISOString());
  const toast = useSignal('');
  const reconcileReference = useSignal('');
  const reconcileLoading = useSignal(false);
  const reconcileMessage = useSignal('');
  const reconcileStatus = useSignal<'idle' | 'success' | 'error'>('idle');
  const checkReference = useSignal('');
  const checkLoading = useSignal(false);
  const checkMessage = useSignal('');
  const checkStatus = useSignal<'idle' | 'success' | 'error'>('idle');
  const manualReference = useSignal('');
  const manualFechaPago = useSignal(new Date().toISOString().slice(0, 10));
  const manualImporte = useSignal('');
  const manualTelefonoPagador = useSignal('');
  const manualBancoOrigen = useSignal('0102');
  const manualReqCed = useSignal(false);
  const manualCedulaPagador = useSignal('');
  const manualCheckLoading = useSignal(false);
  const manualCheckMessage = useSignal('');
  const manualCheckStatus = useSignal<'idle' | 'success' | 'error'>('idle');

  const filtered = useComputed$(() => {
    const needle = search.value.trim().toLowerCase();
    if (!needle) return payments.value;

    return payments.value.filter((item) => {
      const haystack = [
        item.reference,
        item.phone,
        item.bookingId,
        item.ownerName,
        item.ownerEmail,
        item.caregiverName,
        item.caregiverEmail,
        item.service,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  });

  const totalAmount = useComputed$(() =>
    filtered.value.reduce((sum, row) => sum + Number(row.amount || 0), 0),
  );

  const onRefresh = $(async () => {
    if (isRefreshing.value) return;
    isRefreshing.value = true;
    toast.value = '';
    try {
      const result = await refreshIncomingBdvPayments();
      if (!result.ok) {
        toast.value = result.reason === 'auth'
          ? 'Sesión expirada. Inicia sesión nuevamente.'
          : 'No autorizado para refrescar transacciones.';
        isRefreshing.value = false;
        return;
      }
      payments.value = result.payments;
      lastUpdated.value = result.refreshedAt || new Date().toISOString();
      toast.value = '✅ Transacciones actualizadas.';
    } catch {
      toast.value = 'No se pudo actualizar en este momento.';
    }
    isRefreshing.value = false;
  });

  const onReconcileReference = $(async () => {
    if (reconcileLoading.value) return;
    const ref = reconcileReference.value.trim();
    if (!ref) {
      reconcileStatus.value = 'error';
      reconcileMessage.value = 'Debes ingresar una referencia.';
      return;
    }

    reconcileLoading.value = true;
    reconcileStatus.value = 'idle';
    reconcileMessage.value = '';

    try {
      const result = await reconcileReferenceServer(ref);
      if (!result.ok) {
        reconcileStatus.value = 'error';
        reconcileMessage.value = result.message || 'No se pudo conciliar la referencia.';
      } else {
        reconcileStatus.value = 'success';
        reconcileMessage.value = result.message;
        const refreshed = await refreshIncomingBdvPayments();
        if (refreshed.ok) {
          payments.value = refreshed.payments;
          lastUpdated.value = refreshed.refreshedAt || new Date().toISOString();
        }
      }
    } catch {
      reconcileStatus.value = 'error';
      reconcileMessage.value = 'Error de conexión al consultar BDV.';
    }

    reconcileLoading.value = false;
  });

  const onCheckReference = $(async () => {
    if (checkLoading.value) return;
    const ref = checkReference.value.trim();
    if (!ref) {
      checkStatus.value = 'error';
      checkMessage.value = 'Ingresa una referencia para consultar.';
      return;
    }

    checkLoading.value = true;
    checkStatus.value = 'idle';
    checkMessage.value = '';
    try {
      const result = await checkIncomingReferenceServer(ref);
      if (!result.ok) {
        checkStatus.value = 'error';
        checkMessage.value = result.message || 'No se pudo consultar la referencia.';
      } else {
        checkStatus.value = result.exists ? 'success' : 'error';
        checkMessage.value = result.message;
      }
    } catch {
      checkStatus.value = 'error';
      checkMessage.value = 'Error de conexión al consultar la referencia.';
    }
    checkLoading.value = false;
  });

  const onManualBdvCheck = $(async () => {
    if (manualCheckLoading.value) return;

    manualCheckLoading.value = true;
    manualCheckStatus.value = 'idle';
    manualCheckMessage.value = '';

    try {
      const result = await checkReferenceDirectlyInBdvServer({
        referencia: manualReference.value,
        fechaPago: manualFechaPago.value,
        importe: manualImporte.value,
        telefonoPagador: manualTelefonoPagador.value,
        bancoOrigen: manualBancoOrigen.value,
        reqCed: manualReqCed.value,
        cedulaPagador: manualCedulaPagador.value,
      });

      if (!result.ok) {
        manualCheckStatus.value = 'error';
        manualCheckMessage.value = result.message || 'No se pudo consultar BDV.';
      } else {
        manualCheckStatus.value = result.exists ? 'success' : 'error';
        manualCheckMessage.value = result.message;
      }
    } catch {
      manualCheckStatus.value = 'error';
      manualCheckMessage.value = 'Error de conexión al consultar BDV.';
    }

    manualCheckLoading.value = false;
  });

  return (
    <div class="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <header class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 class="text-3xl font-extrabold text-[#4a2e85]">Transacciones entrantes BDV</h1>
          <p class="text-[#4a2e85b3] text-sm">
            Pagos recibidos por webhook y conciliados contra comisiones del sistema.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class={`px-4 py-2 rounded-xl font-semibold text-white bg-[#4a2e85] ${isRefreshing.value ? 'opacity-70 cursor-not-allowed' : 'hover:bg-[#3a2369]'}`}
            onClick$={onRefresh}
            data-no-loader="true"
            disabled={isRefreshing.value}
          >
            {isRefreshing.value ? 'Actualizando...' : 'Actualizar transacciones'}
          </button>
          <Link href="/dashboard/admin" class="px-4 py-2 rounded-xl border border-[#4a2e85]/20 text-[#4a2e85] font-semibold">
            Volver al admin
          </Link>
        </div>
      </header>

      {toast.value && (
        <div class="rounded-xl border border-[#4a2e85]/15 bg-[#f7f3ff] px-3 py-2 text-sm text-[#4a2e85]">
          {toast.value}
        </div>
      )}

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="rounded-2xl border border-[#4a2e85]/15 bg-white p-4">
          <p class="text-xs uppercase font-bold text-[#4a2e85b3]">Registros</p>
          <p class="text-2xl font-black text-[#4a2e85]">{filtered.value.length}</p>
        </div>
        <div class="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p class="text-xs uppercase font-bold text-emerald-700">Monto total</p>
          <p class="text-2xl font-black text-emerald-800">${totalAmount.value.toFixed(2)}</p>
        </div>
        <div class="rounded-2xl border border-[#4a2e85]/15 bg-white p-4">
          <p class="text-xs uppercase font-bold text-[#4a2e85b3]">Última actualización</p>
          <p class="text-sm font-semibold text-[#4a2e85]">{new Date(lastUpdated.value).toLocaleString()}</p>
        </div>
      </div>

      <div class="bg-white rounded-2xl border border-[#4a2e85]/10 shadow-sm p-4">
        <input
          type="text"
          placeholder="Buscar por referencia, teléfono, booking, dueño o cuidador..."
          class="w-full px-3 py-2 rounded-xl border border-[#4a2e85]/20 focus:outline-none focus:ring-2 focus:ring-[#ef7c43]"
          value={search.value}
          onInput$={(event) => (search.value = (event.target as HTMLInputElement).value)}
        />
      </div>

      <div class="bg-white rounded-2xl border border-[#4a2e85]/10 shadow-sm p-4 space-y-3">
        <p class="text-sm font-bold text-[#4a2e85]">Verificar referencia entrante (exists / no exists)</p>
        <div class="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            class="w-full px-3 py-2 rounded-xl border border-[#4a2e85]/20 focus:outline-none focus:ring-2 focus:ring-[#ef7c43]"
            placeholder="Ej: 55030699"
            value={checkReference.value}
            onInput$={(event) => (checkReference.value = (event.target as HTMLInputElement).value)}
          />
          <button
            type="button"
            class={`px-4 py-2 rounded-xl font-semibold text-white bg-[#4a2e85] ${checkLoading.value ? 'opacity-70 cursor-not-allowed' : 'hover:bg-[#3a2369]'}`}
            disabled={checkLoading.value}
            onClick$={onCheckReference}
            data-no-loader="true"
          >
            {checkLoading.value ? 'Buscando...' : 'Verificar referencia'}
          </button>
        </div>
        {checkMessage.value && (
          <div
            class={`rounded-xl px-3 py-2 text-sm border ${
              checkStatus.value === 'success'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}
          >
            {checkMessage.value}
          </div>
        )}
      </div>

      <div class="bg-white rounded-2xl border border-[#4a2e85]/10 shadow-sm p-4 space-y-3">
        <p class="text-sm font-bold text-[#4a2e85]">Conciliación manual por referencia (API BDV)</p>
        <div class="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            class="w-full px-3 py-2 rounded-xl border border-[#4a2e85]/20 focus:outline-none focus:ring-2 focus:ring-[#ef7c43]"
            placeholder="Ej: 12345678"
            value={reconcileReference.value}
            onInput$={(event) => (reconcileReference.value = (event.target as HTMLInputElement).value)}
          />
          <button
            type="button"
            class={`px-4 py-2 rounded-xl font-semibold text-white bg-[#4a2e85] ${reconcileLoading.value ? 'opacity-70 cursor-not-allowed' : 'hover:bg-[#3a2369]'}`}
            disabled={reconcileLoading.value}
            onClick$={onReconcileReference}
            data-no-loader="true"
          >
            {reconcileLoading.value ? 'Consultando...' : 'Conciliar referencia'}
          </button>
        </div>
        {reconcileMessage.value && (
          <div
            class={`rounded-xl px-3 py-2 text-sm border ${
              reconcileStatus.value === 'success'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}
          >
            {reconcileMessage.value}
          </div>
        )}
      </div>

      <div class="bg-white rounded-2xl border border-[#4a2e85]/10 shadow-sm p-4 space-y-3">
        <p class="text-sm font-bold text-[#4a2e85]">Consulta directa en BDV (sin booking interno)</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <input
            type="text"
            class="w-full px-3 py-2 rounded-xl border border-[#4a2e85]/20 focus:outline-none focus:ring-2 focus:ring-[#ef7c43]"
            placeholder="Referencia (ej: 55030699)"
            value={manualReference.value}
            onInput$={(event) => (manualReference.value = (event.target as HTMLInputElement).value)}
          />
          <input
            type="date"
            class="w-full px-3 py-2 rounded-xl border border-[#4a2e85]/20 focus:outline-none focus:ring-2 focus:ring-[#ef7c43]"
            value={manualFechaPago.value}
            onInput$={(event) => (manualFechaPago.value = (event.target as HTMLInputElement).value)}
          />
          <input
            type="text"
            class="w-full px-3 py-2 rounded-xl border border-[#4a2e85]/20 focus:outline-none focus:ring-2 focus:ring-[#ef7c43]"
            placeholder="Importe (ej: 120.00)"
            value={manualImporte.value}
            onInput$={(event) => (manualImporte.value = (event.target as HTMLInputElement).value)}
          />
          <input
            type="text"
            class="w-full px-3 py-2 rounded-xl border border-[#4a2e85]/20 focus:outline-none focus:ring-2 focus:ring-[#ef7c43]"
            placeholder="Teléfono pagador (ej: 04141234567)"
            value={manualTelefonoPagador.value}
            onInput$={(event) => (manualTelefonoPagador.value = (event.target as HTMLInputElement).value)}
          />
          <input
            type="text"
            class="w-full px-3 py-2 rounded-xl border border-[#4a2e85]/20 focus:outline-none focus:ring-2 focus:ring-[#ef7c43]"
            placeholder="Banco origen (ej: 0102)"
            value={manualBancoOrigen.value}
            onInput$={(event) => (manualBancoOrigen.value = (event.target as HTMLInputElement).value)}
          />
          <input
            type="text"
            class={`w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[#ef7c43] ${manualReqCed.value ? 'border-[#4a2e85]/20' : 'border-[#4a2e85]/10 bg-gray-50 text-gray-400'}`}
            placeholder="Cédula pagador (si reqCed=true)"
            value={manualCedulaPagador.value}
            onInput$={(event) => (manualCedulaPagador.value = (event.target as HTMLInputElement).value)}
            disabled={!manualReqCed.value}
          />
        </div>

        <label class="inline-flex items-center gap-2 text-sm text-[#4a2e85]">
          <input
            type="checkbox"
            checked={manualReqCed.value}
            onChange$={(event) => (manualReqCed.value = (event.target as HTMLInputElement).checked)}
          />
          Validar cédula (reqCed)
        </label>

        <div class="flex justify-end">
          <button
            type="button"
            class={`px-4 py-2 rounded-xl font-semibold text-white bg-[#4a2e85] ${manualCheckLoading.value ? 'opacity-70 cursor-not-allowed' : 'hover:bg-[#3a2369]'}`}
            disabled={manualCheckLoading.value}
            onClick$={onManualBdvCheck}
            data-no-loader="true"
          >
            {manualCheckLoading.value ? 'Consultando BDV...' : 'Consultar BDV directo'}
          </button>
        </div>

        {manualCheckMessage.value && (
          <div
            class={`rounded-xl px-3 py-2 text-sm border ${
              manualCheckStatus.value === 'success'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}
          >
            {manualCheckMessage.value}
          </div>
        )}
      </div>

      <div class="bg-white rounded-2xl border border-[#4a2e85]/10 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-[#4a2e85]/5 border-b border-[#4a2e85]/10">
                <th class="px-4 py-3 text-xs font-bold text-[#4a2e85]">Fecha</th>
                <th class="px-4 py-3 text-xs font-bold text-[#4a2e85]">Referencia</th>
                <th class="px-4 py-3 text-xs font-bold text-[#4a2e85]">Monto</th>
                <th class="px-4 py-3 text-xs font-bold text-[#4a2e85]">Pagador</th>
                <th class="px-4 py-3 text-xs font-bold text-[#4a2e85]">Booking</th>
                <th class="px-4 py-3 text-xs font-bold text-[#4a2e85]">Estado</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[#4a2e85]/8">
              {filtered.value.map((item) => (
                <tr key={item.id}>
                  <td class="px-4 py-3 text-sm text-[#4a2e85]">{(item.createdAt || item.date || '').slice(0, 19).replace('T', ' ') || '-'}</td>
                  <td class="px-4 py-3">
                    <p class="font-semibold text-[#4a2e85]">{item.reference || '-'}</p>
                    <p class="text-xs text-[#4a2e85b3]">ID: {item.id}</p>
                  </td>
                  <td class="px-4 py-3">
                    <p class="font-bold text-[#ef7c43]">${Number(item.amount || 0).toFixed(2)}</p>
                  </td>
                  <td class="px-4 py-3">
                    <p class="text-sm font-semibold text-[#4a2e85]">{item.phone || '-'}</p>
                    <p class="text-xs text-[#4a2e85b3]">{item.ownerName || 'Dueño'} · {item.caregiverName || 'Cuidador'}</p>
                  </td>
                  <td class="px-4 py-3">
                    <p class="text-xs text-[#4a2e85] font-semibold">{item.bookingId || 'Sin match'}</p>
                    <p class="text-xs text-[#4a2e85b3]">Servicio: {item.service || '-'}</p>
                  </td>
                  <td class="px-4 py-3">
                    {item.feeValidated ? (
                      <span class="inline-flex px-2 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">Validado</span>
                    ) : (
                      <span class="inline-flex px-2 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">Pendiente</span>
                    )}
                    <p class="text-xs text-[#4a2e85b3] mt-1">{statusLabel(item.bookingStatus)}</p>
                  </td>
                </tr>
              ))}
              {filtered.value.length === 0 && (
                <tr>
                  <td colSpan={6} class="px-4 py-8 text-center text-sm text-[#4a2e85b3]">
                    No hay transacciones entrantes para mostrar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});
