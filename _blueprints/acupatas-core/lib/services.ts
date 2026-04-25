import { getTursoClient, isSchemaEnsured, markSchemaAsEnsured } from './turso';
import { ensureAuthSchema, isAdmin, getUserById } from './auth';
import { getOwnerProfileByUserId } from './owner';
import { authenticateTfhka, buildCommissionInvoicePayload, emitInvoice } from './tfhka';
import { ensureChatSchema, closeChat } from './chat';
import { createNotification } from './notifications';
import { verifyBdvMovement, getBankCode } from './bdv';
import { getCaracasTime, getCaracasDate } from './utils';

const notifyCaregiverCapacityChanged = async (caregiverId: string) => {
  const normalizedCaregiverId = String(caregiverId || '').trim();
  if (!normalizedCaregiverId) return;

  try {
    const { notifyUserWs } = await import('../server/websocket');
    const payload = { type: 'CAREGIVER_CAPACITY_CHANGED', caregiverId: normalizedCaregiverId } as const;
    notifyUserWs(normalizedCaregiverId, payload);

    const client = getTursoClient();
    const chatsRes = await client.execute({
      sql: 'select distinct owner_id from chats where caregiver_id = ? and open = 1',
      args: [normalizedCaregiverId],
    });

    const ownerIds = Array.from(new Set((chatsRes.rows as any[]).map((row) => String(row.owner_id || '').trim()).filter(Boolean)));
    for (const ownerId of ownerIds) {
      notifyUserWs(ownerId, payload);
    }
  } catch (err) {
    console.error('[Service] Error broadcasting caregiver capacity change:', err);
  }
};

type BdvValidationOptions = {
  bdvApiKey?: string;
  bdvEndpoint?: string;
  acupatasRif?: string;
  acupatasPhone?: string;
};

export type ServiceRequestRecord = {
  id: string;
  petId: string;
  ownerId: string;
  caregiverId: string;
  startDate: string;
  endDate: string;
  status: string;
  price: number;
  ownerRating?: number;
  ownerReview?: string;
  caregiverRating?: number;
  caregiverReview?: string;
};

export type BookingRecord = {
  id: string;
  requestId: string;
  petId: string;
  ownerId: string;
  caregiverId: string;
  service: string;
  dateFrom: string;
  dateTo: string;
  amountUsd: number;
  status: string;
  ownerPaymentReference?: string;
  ownerPaymentProof?: string;
  ownerPaymentDate?: string;
  caregiverConfirmedPayment?: boolean;
  caregiverConfirmationDate?: string;
  caregiverConfirmationNote?: string;
  feeReference?: string;
  feeProof?: string;
  feePaymentDate?: string;
  feePayerPhone?: string;
  feeBankOrigin?: string;
  feeAmount?: number;
  feeValidated?: boolean;
  feeValidationDate?: string;
};

export type PaymentEvent = {
  id: string;
  bookingId: string;
  eventType: 'info' | 'success' | 'warning' | 'error';
  actorId: string;
  actorRole: string;
  message: string;
  createdAt: string;
};

export type ServiceRequestBundle = {
  request: ServiceRequestRecord;
  booking: BookingRecord | null;
  bank: {
    name: string;
    titular: string;
    rif: string;
    paymobile: string;
    verified: boolean;
  } | null;
};

export type AdminCommissionRecord = {
  bookingId: string;
  requestId: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  caregiverId: string;
  caregiverName: string;
  caregiverEmail: string;
  service: string;
  dateFrom: string;
  dateTo: string;
  amountUsd: number;
  status: string;
  feeReference: string;
  feePayerPhone: string;
  feeBankOrigin: string;
  feeProof: string;
  feePaymentDate: string;
  feeAmount: number;
  feeValidated: boolean;
  feeValidationDate: string;
  updatedAt: string;
  validationMode: 'automatic' | 'manual' | 'pending';
  rejected: boolean;
  rejectionReason: string;
  bdvStatus: 'success' | 'error' | 'pending';
  bdvMessage: string;
  invoiceStatus: 'issued' | 'error' | 'warning' | 'pending';
  invoiceMessage: string;
};

export type AdminBankPaymentRecord = {
  id: string;
  reference: string;
  amount: number;
  phone: string;
  date: string;
  createdAt: string;
  bookingId: string;
  userId: string;
  ownerName: string;
  ownerEmail: string;
  caregiverName: string;
  caregiverEmail: string;
  service: string;
  bookingStatus: string;
  feeAmount: number;
  feeValidated: boolean;
};

export const ensureServiceSchema = async () => {
  const schemaAlreadyEnsured = isSchemaEnsured('service');
  await ensureAuthSchema();
  const client = getTursoClient();
  const statements = [
    `create table if not exists service_requests (
      id text primary key,
      pet_id text not null,
      owner_id text not null,
      caregiver_id text not null,
      start_date text,
      end_date text,
      status text,
      owner_rating integer,
      owner_review text,
      caregiver_rating integer,
      caregiver_review text,
      price real,
      created_at text,
      updated_at text
    );`,
    `create table if not exists bookings (
      id text primary key,
      request_id text,
      pet_id text,
      owner_id text,
      caregiver_id text,
      service text,
      date_from text,
      date_to text,
      amount_usd real,
      status text,
      owner_payment_reference text,
      owner_payment_proof text,
      owner_payment_date text,
      caregiver_confirmed_payment integer default 0,
      caregiver_confirmation_date text,
      caregiver_confirmation_note text,
      fee_reference text,
      fee_proof text,
      fee_payment_date text,
      fee_payer_phone text,
      fee_bank_origin text,
      fee_amount real,
      fee_validated integer default 0,
      fee_validation_date text,
      created_at text,
      updated_at text
    );`,
    `create table if not exists payment_events (
      id text primary key,
      payment_id text not null default '',
      booking_id text not null,
      event_type text not null,
      actor_id text not null,
      actor_role text not null,
      message text not null,
      created_at text not null
    );`,
    `create table if not exists bank_payments (
      id text primary key,
      reference text not null unique,
      amount real not null,
      phone text not null,
      date text not null,
      user_id text,
      booking_id text,
      created_at text not null
    );`,
  ];
  if (!schemaAlreadyEnsured) {
    for (const sql of statements) {
      await client.execute(sql);
    }
  }

  // Auto-migration: Check if payment_events has booking_id (dev fix)
  try {
    await client.execute('select booking_id from payment_events limit 1');
  } catch (e: any) {
    if (String(e).includes('no such column')) {
      await client.execute("alter table payment_events add column booking_id text not null default ''");
    }
  }

  // Auto-migration: Check if payment_events has payment_id (legacy fix)
  try {
    await client.execute('select payment_id from payment_events limit 1');
  } catch (e: any) {
    if (String(e).includes('no such column')) {
      await client.execute("alter table payment_events add column payment_id text not null default ''");
    }
  }

  // Auto-migration: Check if payment_events has event_type (legacy fix)
  try {
    await client.execute('select event_type from payment_events limit 1');
  } catch (e: any) {
    if (String(e).includes('no such column')) {
      await client.execute("alter table payment_events add column event_type text not null default 'info'");
    }
  }

  // Auto-migration: Check if payment_events has actor_id (legacy fix)
  try {
    await client.execute('select actor_id from payment_events limit 1');
  } catch (e: any) {
    if (String(e).includes('no such column')) {
      await client.execute("alter table payment_events add column actor_id text not null default ''");
    }
  }

  // Auto-migration: Check if payment_events has actor_role (legacy fix)
  try {
    await client.execute('select actor_role from payment_events limit 1');
  } catch (e: any) {
    if (String(e).includes('no such column')) {
      await client.execute("alter table payment_events add column actor_role text not null default ''");
    }
  }

  // Auto-migration: Check if payment_events has message (legacy fix)
  try {
    await client.execute('select message from payment_events limit 1');
  } catch (e: any) {
    if (String(e).includes('no such column')) {
      await client.execute("alter table payment_events add column message text not null default ''");
    }
  }

  // Auto-migration: Check if payment_events has created_at (dev fix)
  try {
    await client.execute('select created_at from payment_events limit 1');
  } catch (e: any) {
    if (String(e).includes('no such column')) {
      const now = new Date().toISOString();
      await client.execute(`alter table payment_events add column created_at text not null default '${now}'`);
    }
  }

  // Auto-migration: Check if bookings has payment fields (dev fix)
  try {
    await client.execute('select owner_payment_proof from bookings limit 1');
  } catch (e: any) {
    if (String(e).includes('no such column')) {
      const alters = [
        "alter table bookings add column owner_payment_reference text",
        "alter table bookings add column owner_payment_proof text",
        "alter table bookings add column owner_payment_date text",
        "alter table bookings add column caregiver_confirmed_payment integer default 0",
        "alter table bookings add column caregiver_confirmation_date text",
        "alter table bookings add column caregiver_confirmation_note text"
      ];
      for (const sql of alters) {
        try { await client.execute(sql); } catch (err) { /* ignore if partial */ }
      }
    }
  }

  // Auto-migration: Check if bookings has fee fields (legacy fix)
  try {
    await client.execute('select fee_reference from bookings limit 1');
  } catch (e: any) {
    if (String(e).includes('no such column')) {
      const alters = [
        'alter table bookings add column fee_reference text',
        'alter table bookings add column fee_proof text',
        'alter table bookings add column fee_payment_date text',
        'alter table bookings add column fee_amount real',
        'alter table bookings add column fee_validated integer default 0',
        'alter table bookings add column fee_validation_date text',
      ];
      for (const sql of alters) {
        try { await client.execute(sql); } catch (err) { /* ignore if partial */ }
      }
    }
  }

  // Auto-migration: Check if bookings has fee_payer_phone and fee_bank_origin
  try {
    await client.execute('select fee_payer_phone, fee_bank_origin from bookings limit 1');
  } catch (e: any) {
    if (String(e).includes('no such column')) {
      const alters = [
        'alter table bookings add column fee_payer_phone text',
        'alter table bookings add column fee_bank_origin text',
      ];
      for (const sql of alters) {
        try { await client.execute(sql); } catch (err) { /* ignore if partial */ }
      }
    }
  }
  if (!schemaAlreadyEnsured) {
    markSchemaAsEnsured('service');
  }
};

import { diffDays } from './utils';

export const getLatestServiceRequest = async (ownerId: string, caregiverId: string, petId?: string): Promise<ServiceRequestBundle | null> => {
  await ensureServiceSchema();
  const client = getTursoClient();
  const result = await client.execute({
    sql: `select * from service_requests
      where owner_id = ? and caregiver_id = ?
      ${petId ? "and (pet_id = ? or pet_id like ? or pet_id like ? or pet_id like ?)" : ""}
      order by created_at desc limit 1`,
    args: petId ? [ownerId, caregiverId, petId, `${petId},%`, `%,${petId}`, `%,${petId},%`] : [ownerId, caregiverId],
  });
  const row = result.rows[0] as any;
  if (!row) return null;

  const bookingRes = await client.execute({
    sql: 'select * from bookings where request_id = ? order by created_at desc limit 1',
    args: [row.id],
  });
  const bookingRow = bookingRes.rows[0] as any;

  const bankRes = await client.execute({
    sql: 'select bank_name, titular, rif, paymobile, verified from caregiver_bank where user_id = ? limit 1',
    args: [caregiverId],
  });
  const bankRow = bankRes.rows[0] as any;

  const request: ServiceRequestRecord = {
    id: row.id as string,
    petId: row.pet_id as string,
    ownerId: row.owner_id as string,
    caregiverId: row.caregiver_id as string,
    startDate: row.start_date ?? '',
    endDate: row.end_date ?? '',
    status: row.status ?? '',
    price: Number(row.price ?? 0),
    ownerRating: row.owner_rating ?? undefined,
    ownerReview: row.owner_review ?? undefined,
    caregiverRating: row.caregiver_rating ?? undefined,
    caregiverReview: row.caregiver_review ?? undefined,
  };

  const booking: BookingRecord | null = bookingRow
    ? {
      id: bookingRow.id as string,
      requestId: bookingRow.request_id as string,
      petId: bookingRow.pet_id as string,
      ownerId: bookingRow.owner_id as string,
      caregiverId: bookingRow.caregiver_id as string,
      service: bookingRow.service ?? '',
      dateFrom: bookingRow.date_from ?? '',
      dateTo: bookingRow.date_to ?? '',
      amountUsd: Number(bookingRow.amount_usd ?? 0),
      status: bookingRow.status ?? '',
      ownerPaymentReference: bookingRow.owner_payment_reference ?? undefined,
      ownerPaymentProof: bookingRow.owner_payment_proof ?? undefined,
      ownerPaymentDate: bookingRow.owner_payment_date ?? undefined,
      caregiverConfirmedPayment: Boolean(bookingRow.caregiver_confirmed_payment ?? 0),
      caregiverConfirmationDate: bookingRow.caregiver_confirmation_date ?? undefined,
      caregiverConfirmationNote: bookingRow.caregiver_confirmation_note ?? undefined,
      feeReference: bookingRow.fee_reference ?? undefined,
      feeProof: bookingRow.fee_proof ?? undefined,
      feePaymentDate: bookingRow.fee_payment_date ?? undefined,
      feePayerPhone: bookingRow.fee_payer_phone ?? undefined,
      feeBankOrigin: bookingRow.fee_bank_origin ?? undefined,
      feeValidated: Boolean(bookingRow.fee_validated ?? 0),
      feeValidationDate: bookingRow.fee_validation_date ?? undefined,
    }
    : null;

  const bank = bankRow
    ? {
      name: bankRow.bank_name ?? '',
      titular: bankRow.titular ?? '',
      rif: bankRow.rif ?? '',
      paymobile: bankRow.paymobile ?? '',
      verified: Boolean(bankRow.verified ?? 0),
    }
    : null;

  return { request, booking, bank };
};

export const createServiceRequestFromChat = async (ownerId: string, chatId: string, payload: {
  service: string;
  dateFrom: string;
  dateTo: string;
  amountUsd?: number;
  petId?: string;
  selectedDays?: string[];
}) => {
  await ensureServiceSchema();
  const client = getTursoClient();

  const chatRes = await client.execute({
    sql: 'select caregiver_id, pet_id from chats where id = ? and owner_id = ? limit 1',
    args: [chatId, ownerId],
  });
  const chatRow = chatRes.rows[0] as any;
  if (!chatRow) return { ok: false, reason: 'chat_not_found' } as const;

  const caregiverId = chatRow.caregiver_id as string;
  const petIdStr = payload.petId || (chatRow.pet_id as string) || '';
  const selectedPetIds = petIdStr.split(',').filter(Boolean);

  if (selectedPetIds.length === 0) return { ok: false, reason: 'no_pets_selected' } as const;

  // Use Caracas time for consistency with stored date strings
  const nowIso = getCaracasTime();
  const nowDate = getCaracasDate();

  // 1. Fetch Caregiver Profile & Preferences
  const [caregiverRes, acceptsRes, sizesRes, petsRes] = await Promise.all([
    client.execute({
      sql: 'select price_per_day, pet_limit, multi_pet from caregiver_profiles where user_id = ? limit 1',
      args: [caregiverId],
    }),
    client.execute({
      sql: 'select species from caregiver_accepts where user_id = ?',
      args: [caregiverId],
    }),
    client.execute({
      sql: 'select size from caregiver_dog_sizes where user_id = ?',
      args: [caregiverId],
    }),
    client.execute({
      sql: `select id, species, size from owner_pet_profiles where id in (${selectedPetIds.map(() => '?').join(',')})`,
      args: selectedPetIds,
    }),
  ]);

  const caregiver = caregiverRes.rows[0] as any;
  if (!caregiver) return { ok: false, reason: 'caregiver_not_found' } as const;

  const acceptedSpecies = (acceptsRes.rows as any[]).map(r => String(r.species).toLowerCase());
  const acceptedSizes = (sizesRes.rows as any[]).map(r => String(r.size).toLowerCase());
  const requestedPets = petsRes.rows as any[];

  // 2. Validate Species & Size
  for (const pet of requestedPets) {
    const species = String(pet.species || '').toLowerCase();
    if (!acceptedSpecies.includes(species)) {
      return { ok: false, reason: 'species_not_accepted', detail: pet.name || species } as const;
    }
    if (species === 'perro') {
      const size = String(pet.size || '').toLowerCase();
      if (acceptedSizes.length > 0 && size && !acceptedSizes.includes(size)) {
        return { ok: false, reason: 'size_not_accepted', detail: pet.name || size } as const;
      }
    }
  }

  // Helper to get all dates between from and to (inclusive)
  const getDatesBetween = (start: string, end: string) => {
    const dates = [];
    // Ensure we parse as UTC correctly to avoid local TZ shifts (especially DST)
    const startDate = new Date(`${start.slice(0, 10)}T00:00:00Z`);
    const endDate = new Date(`${end.slice(0, 10)}T00:00:00Z`);

    // Safety check for invalid dates
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return [];

    let current = new Date(startDate.getTime());
    while (current.getTime() <= endDate.getTime()) {
      dates.push(current.toISOString().slice(0, 10));
      current.setUTCDate(current.getUTCDate() + 1);
    }
    return dates;
  };

  const requestedDates = (payload.selectedDays && payload.selectedDays.length > 0)
    ? payload.selectedDays.map(d => d.slice(0, 10))
    : getDatesBetween(payload.dateFrom, payload.dateTo);

  // 3. Validate Availability
  const availabilityRes = await client.execute({
    sql: 'select date from caregiver_availability where user_id = ? and date >= ? and date <= ? and available = 0',
    args: [caregiverId, payload.dateFrom.slice(0, 10), payload.dateTo.slice(0, 10)],
  });
  const blockedDates = availabilityRes.rows.map((r: any) => String(r.date));
  const conflict = requestedDates.find(d => blockedDates.includes(d));
  if (conflict) {
    return { ok: false, reason: 'availability_conflict', detail: conflict } as const;
  }

  // 4. Validate Pet Limit
  const isMultiPet = Boolean(caregiver.multi_pet ?? 0);
  const petLimit = isMultiPet ? Number(caregiver.pet_limit || 1) : 1;
  const bookingsRes = await client.execute({
    sql: `select id, owner_id, date_from, date_to, pet_id, fee_validated from bookings
      where caregiver_id = ?
        and status in ('requested', 'accepted', 'paid', 'payment_sent', 'payment_confirmed', 'fee_submitted', 'active', 'in_progress')
        and substr(date_from, 1, 10) <= ?
        and substr(date_to, 1, 10) >= ?`,
    args: [caregiverId, payload.dateTo.slice(0, 10), payload.dateFrom.slice(0, 10)],
  });

  // occupancyMap stores a Set of unique pet IDs per day
  const occupancyMap: Record<string, Set<string>> = {};

  for (const date of requestedDates) {
    occupancyMap[date] = new Set(selectedPetIds);
    if (occupancyMap[date].size > petLimit) {
      return { ok: false, reason: 'limit_exceeded', detail: `Excedes el límite de mascotas del cuidador (${petLimit})` } as const;
    }
  }

  for (const row of (bookingsRes.rows as any[])) {
    const bPetIds = String(row.pet_id || '').split(',').filter(Boolean);
    const bDates = getDatesBetween(row.date_from, row.date_to);
    for (const d of bDates) {
      if (occupancyMap[d] !== undefined) {
        for (const p of bPetIds) {
          occupancyMap[d].add(p);
        }
        if (occupancyMap[d].size > petLimit) {
          return { ok: false, reason: 'limit_exceeded', detail: `El cuidador ya tiene el cupo lleno el dia ${d}` } as const;
        }
      }
    }
  }

  const petConditions = selectedPetIds.length > 0
    ? `and (${selectedPetIds.map(id => `',' || coalesce(pet_id, '') || ',' like '%,${id},%'`).join(' or ')})`
    : '';

  // 5. Check other constraints (active services / pending commissions)

  // 5a. Check if the pet is occupied with ANOTHER caregiver
  const activeServiceOtherRes = await client.execute({
    sql: `select id, caregiver_id, status from service_requests
      where owner_id = ?
        and status in ('requested', 'accepted', 'paid', 'payment_sent', 'payment_confirmed', 'fee_submitted', 'active', 'in_progress', 'completed')
        and substr(start_date, 1, 10) <= ?
        and substr(end_date, 1, 10) >= ?
        and caregiver_id <> ?
        ${petConditions}
      limit 1`,
    args: [ownerId, payload.dateTo.slice(0, 10), payload.dateFrom.slice(0, 10), caregiverId],
  });
  if (activeServiceOtherRes.rows.length > 0) {
    return { ok: false, reason: 'active_service_other' } as const;
  }

  // 5b. Check if the pet is already occupied with the SAME caregiver (preventing duplicate active services)
  const activeServiceSameRes = await client.execute({
    sql: `select id from service_requests
      where owner_id = ?
        and caregiver_id = ?
        and status in ('requested', 'accepted', 'paid', 'payment_sent', 'payment_confirmed', 'fee_submitted', 'active', 'in_progress', 'completed')
        and substr(start_date, 1, 10) <= ?
        and substr(end_date, 1, 10) >= ?
        ${petConditions}
      limit 1`,
    args: [ownerId, caregiverId, payload.dateTo.slice(0, 10), payload.dateFrom.slice(0, 10)],
  });

  if (activeServiceSameRes.rows.length > 0) {
    return { ok: false, reason: 'active_service_same', detail: 'La mascota ya tiene un servicio en fechas solapadas con este cuidador.' } as const;
  }

  const pendingFeePaymentRes = await client.execute({
    sql: `select id from bookings
      where owner_id = ?
        and caregiver_id = ?
        and status = 'payment_confirmed'
        and (fee_reference is null or trim(fee_reference) = '')
        ${petConditions}
      order by created_at desc
      limit 1`,
    args: [ownerId, caregiverId],
  });
  if (pendingFeePaymentRes.rows.length > 0) {
    return { ok: false, reason: 'pending_fee_payment' } as const;
  }

  const pendingFeeValidationRes = await client.execute({
    sql: `select id from bookings
      where owner_id = ?
        and caregiver_id = ?
        and status = 'fee_submitted'
        and coalesce(fee_validated, 0) = 0
        ${petConditions}
      order by created_at desc
      limit 1`,
    args: [ownerId, caregiverId],
  });
  if (pendingFeeValidationRes.rows.length > 0) {
    return { ok: false, reason: 'pending_fee_validation' } as const;
  }

  const pricePerDay = Number(caregiver.price_per_day ?? 0);
  const days = diffDays(payload.dateFrom, payload.dateTo);
  const total = typeof payload.amountUsd === 'number' && payload.amountUsd > 0
    ? payload.amountUsd
    : (pricePerDay * days * selectedPetIds.length);

  const now = new Date().toISOString();
  const requestId = `req_${crypto.randomUUID()}`;
  const bookingId = `book_${crypto.randomUUID()}`;

  await client.execute({
    sql: `insert into service_requests(
      id, pet_id, owner_id, caregiver_id, start_date, end_date, status, price, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      requestId,
      petIdStr,
      ownerId,
      caregiverId,
      payload.dateFrom,
      payload.dateTo,
      'requested',
      total,
      now,
      now,
    ],
  });

  await client.execute({
    sql: `insert into bookings(
      id, request_id, pet_id, owner_id, caregiver_id, service, date_from, date_to, amount_usd, status, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      bookingId,
      requestId,
      petIdStr,
      ownerId,
      caregiverId,
      payload.service,
      payload.dateFrom,
      payload.dateTo,
      total,
      'requested',
      now,
      now,
    ],
  });

  await client.execute({
    sql: 'update chats set status = ?, pet_id = ?, open = 1, locked = 0, updated_at = ? where id = ?',
    args: ['requested', petIdStr, now, chatId],
  });

  await createNotification(caregiverId, 'booking', 'Nueva solicitud de servicio', 'Has recibido una nueva solicitud. Revisa tus servicios pendientes.', `/dashboard/chat/${chatId}`);
  await notifyCaregiverCapacityChanged(caregiverId);

  return { ok: true, requestId, bookingId, total } as const;
};

export const unlockOwnerChats = async (ownerId: string) => {
  const client = getTursoClient();
  const now = new Date().toISOString();
  await client.execute({
    sql: 'update chats set locked = 0, open = 1, updated_at = ? where owner_id = ? and locked = 1',
    args: [now, ownerId],
  });
};

export const updateLatestServiceStatus = async (ownerId: string, caregiverId: string, petId: string | undefined, status: string) => {
  await ensureServiceSchema();
  await ensureChatSchema();
  const client = getTursoClient();

  const reqRes = await client.execute({
    sql: `select id from service_requests
      where owner_id = ? and caregiver_id = ?
      ${petId ? "and (pet_id = ? or pet_id like ? or pet_id like ? or pet_id like ?)" : ""}
      order by created_at desc limit 1`,
    args: petId ? [ownerId, caregiverId, petId, `${petId},%`, `%,${petId}`, `%,${petId},%`] : [ownerId, caregiverId],
  });
  const row = reqRes.rows[0] as any;
  if (!row) return { ok: false, reason: 'not_found' } as const;

  const now = new Date().toISOString();
  await client.execute({
    sql: 'update service_requests set status = ?, updated_at = ? where id = ?',
    args: [status, now, row.id as string],
  });
  await client.execute({
    sql: 'update bookings set status = ?, updated_at = ? where request_id = ?',
    args: [status, now, row.id as string],
  });
  await client.execute({
    sql: 'update chats set status = ?, updated_at = ? where owner_id = ? and caregiver_id = ?',
    args: [status, now, ownerId, caregiverId],
  });

  if (['rejected', 'cancelled'].includes(status)) {
    await unlockOwnerChats(ownerId);
  }

  // Trigger notifications
  let notifyUserId = '';
  let notifTitle = '';
  let notifText = '';

  if (status === 'accepted') {
    notifyUserId = ownerId;
    notifTitle = 'Solicitud aceptada';
    notifText = 'El cuidador ha aceptado tu solicitud de servicio. Ya puedes realizar el pago.';
  } else if (status === 'rejected') {
    notifyUserId = ownerId;
    notifTitle = 'Solicitud rechazada';
    notifText = 'El cuidador no pudo aceptar tu solicitud en este momento.';
  } else if (status === 'cancelled') {
    notifyUserId = caregiverId;
    notifTitle = 'Solicitud cancelada';
    notifText = 'El dueño ha cancelado la solicitud de servicio.';
  } else if (status === 'paid') {
    notifyUserId = caregiverId;
    notifTitle = 'Pago marcado como enviado';
    notifText = 'El dueño ha indicado que realizó el pago. Esperando envío de captura...';
  } else if (status === 'completed') {
    notifyUserId = ownerId;
    notifTitle = 'Servicio completado';
    notifText = 'El cuidador ha confirmado todo. Ya puedes dejar una reseña.';
  } else if (status === 'active') {
    notifyUserId = ownerId;
    notifTitle = 'Servicio activo';
    notifText = '¡Tu mascota ya está bajo cuidado! El servicio ha comenzado oficialmente.';
  }

  if (notifyUserId) {
    const validNotifyId = typeof notifyUserId === 'string' ? notifyUserId.trim() : null;

    if (validNotifyId && validNotifyId !== 'null' && validNotifyId !== 'undefined') {
      const chatRes = await client.execute({
        sql: 'select id from chats where owner_id = ? and caregiver_id = ? limit 1',
        args: [ownerId, caregiverId],
      });
      const chatId = chatRes.rows[0]?.id as string | undefined;
      const link = chatId ? `/dashboard/chat/${chatId}` : undefined;
      await createNotification(validNotifyId, 'booking', notifTitle, notifText, link);
    } else {
      console.warn('[Service] Skipped notification due to invalid notifyUserId in updateLatestServiceStatus:', { notifyUserId, ownerId, caregiverId, status });
    }
  }

  await notifyCaregiverCapacityChanged(caregiverId);

  return { ok: true } as const;
};

export const updateServiceStatusByBooking = async (caregiverId: string, bookingId: string, status: string) => {
  await ensureServiceSchema();
  await ensureChatSchema();
  const client = getTursoClient();
  const bookingRes = await client.execute({
    sql: 'select request_id, owner_id, caregiver_id, pet_id from bookings where id = ? and caregiver_id = ? limit 1',
    args: [bookingId, caregiverId],
  });
  const booking = bookingRes.rows[0] as any;
  if (!booking) return { ok: false, reason: 'not_found' } as const;

  const now = new Date().toISOString();
  await client.execute({
    sql: 'update bookings set status = ?, updated_at = ? where id = ?',
    args: [status, now, bookingId],
  });
  await client.execute({
    sql: 'update service_requests set status = ?, updated_at = ? where id = ?',
    args: [status, now, booking.request_id as string],
  });
  await client.execute({
    sql: 'update chats set status = ?, updated_at = ? where owner_id = ? and caregiver_id = ?',
    args: [status, now, booking.owner_id as string, booking.caregiver_id as string],
  });

  if (['rejected', 'cancelled'].includes(status)) {
    await unlockOwnerChats(booking.owner_id as string);
  }

  // Trigger notifications
  let notifyUserId = '';
  let notifTitle = '';
  let notifText = '';

  const ownerId = booking.owner_id as string;

  if (status === 'accepted') {
    notifyUserId = ownerId;
    notifTitle = 'Solicitud aceptada';
    notifText = 'El cuidador ha aceptado tu solicitud de servicio. Ya puedes realizar el pago.';
  } else if (status === 'rejected') {
    notifyUserId = ownerId;
    notifTitle = 'Solicitud rechazada';
    notifText = 'El cuidador no pudo aceptar tu solicitud en este momento.';
  } else if (status === 'cancelled') {
    notifyUserId = caregiverId;
    notifTitle = 'Solicitud cancelada';
    notifText = 'El dueño ha cancelado la solicitud de servicio.';
  } else if (status === 'paid') {
    notifyUserId = caregiverId;
    notifTitle = 'Pago marcado como enviado';
    notifText = 'El dueño ha indicado que realizó el pago. Esperando envío de captura...';
  } else if (status === 'completed') {
    notifyUserId = ownerId;
    notifTitle = 'Servicio completado';
    notifText = 'El cuidador ha confirmado todo. Ya puedes dejar una reseña.';
  } else if (status === 'active') {
    notifyUserId = ownerId;
    notifTitle = 'Servicio activo';
    notifText = '¡Tu mascota ya está bajo cuidado! El servicio ha comenzado oficialmente.';
  }

  if (notifyUserId) {
    const validNotifyId = typeof notifyUserId === 'string' ? notifyUserId.trim() : null;

    if (validNotifyId && validNotifyId !== 'null' && validNotifyId !== 'undefined') {
      const chatRes = await client.execute({
        sql: 'select id from chats where owner_id = ? and caregiver_id = ? limit 1',
        args: [ownerId, caregiverId],
      });
      const chatId = chatRes.rows[0]?.id as string | undefined;
      const link = chatId ? `/dashboard/chat/${chatId}` : undefined;
      await createNotification(validNotifyId, 'booking', notifTitle, notifText, link);
    } else {
      console.warn('[Service] Skipped notification due to invalid notifyUserId in updateServiceStatusByBooking:', { notifyUserId, ownerId, caregiverId, status });
    }
  }

  await notifyCaregiverCapacityChanged(caregiverId);

  return { ok: true } as const;
};

export const setLatestServiceReview = async (
  ownerId: string,
  caregiverId: string,
  petId: string | undefined,
  role: 'owner' | 'caregiver',
  rating: number,
  comment: string
) => {
  await ensureServiceSchema();
  const client = getTursoClient();
  const reqRes = await client.execute({
    sql: `select id from service_requests
      where owner_id = ? and caregiver_id = ?
      ${petId ? "and (pet_id = ? or pet_id like ? or pet_id like ? or pet_id like ?)" : ""}
      order by created_at desc limit 1`,
    args: petId ? [ownerId, caregiverId, petId, `${petId},%`, `%,${petId}`, `%,${petId},%`] : [ownerId, caregiverId],
  });
  const row = reqRes.rows[0] as any;
  if (!row) return { ok: false, reason: 'not_found' } as const;

  const bookingRes = await client.execute({
    sql: 'select fee_validated, date_to from bookings where request_id = ? order by created_at desc limit 1',
    args: [row.id as string],
  });
  const booking = bookingRes.rows[0] as any;
  if (!booking) return { ok: false, reason: 'not_found' } as const;
  if (!Boolean(booking.fee_validated ?? 0)) return { ok: false, reason: 'service_not_ready' } as const;

  const bookingDateToRaw = String(booking.date_to || '').trim();
  const careEnd = bookingDateToRaw ? new Date(bookingDateToRaw) : null;
  if (!careEnd || Number.isNaN(careEnd.getTime()) || careEnd.getTime() > Date.now()) {
    return { ok: false, reason: 'service_not_ended' } as const;
  }

  const now = new Date().toISOString();
  if (role === 'owner') {
    await client.execute({
      sql: 'update service_requests set owner_rating = ?, owner_review = ?, updated_at = ? where id = ?',
      args: [rating, comment, now, row.id as string],
    });
  } else {
    await client.execute({
      sql: 'update service_requests set caregiver_rating = ?, caregiver_review = ?, updated_at = ? where id = ?',
      args: [rating, comment, now, row.id as string],
    });
  }

  // Check if the service is now fully completed (both reviews + fee validated)
  try {
    await checkAndCompleteService(row.id as string);
  } catch (err) {
    console.error('[Service] Error checking completion after review:', err);
  }

  // Notify the other party via WS so their UI updates immediately
  try {
    const { notifyUserWs } = await import('../server/websocket');
    if (role === 'owner') {
      notifyUserWs(caregiverId, { type: 'SYNC_COUNTS' });
    } else {
      notifyUserWs(ownerId, { type: 'SYNC_COUNTS' });
    }
  } catch (err) {
    console.error('[Service] Error broadcasting review:', err);
  }

  return { ok: true } as const;
};

// ========== PAYMENT FUNCTIONS ==========

const addPaymentEvent = async (bookingId: string, actorId: string, actorRole: string, eventType: 'info' | 'success' | 'warning' | 'error', message: string) => {
  const client = getTursoClient();
  const eventId = `evt_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await client.execute({
    sql: 'insert into payment_events(id, payment_id, booking_id, event_type, actor_id, actor_role, message, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)',
    args: [eventId, bookingId, bookingId, eventType, actorId, actorRole, message, now],
  });
};

export const submitOwnerPayment = async (bookingId: string, ownerId: string, reference: string, proofUrl: string) => {
  await ensureServiceSchema();
  const client = getTursoClient();

  const bookingRes = await client.execute({
    sql: 'select owner_id, request_id from bookings where id = ? limit 1',
    args: [bookingId],
  });
  const booking = bookingRes.rows[0] as any;
  if (!booking || booking.owner_id !== ownerId) {
    return { ok: false, reason: 'not_found' } as const;
  }

  const now = new Date().toISOString();
  await client.execute({
    sql: 'update bookings set owner_payment_reference = ?, owner_payment_proof = ?, owner_payment_date = ?, status = ?, updated_at = ? where id = ?',
    args: [reference, proofUrl, now, 'payment_sent', now, bookingId],
  });
  await client.execute({
    sql: 'update service_requests set status = ?, updated_at = ? where id = ?',
    args: ['payment_sent', now, booking.request_id],
  });

  await addPaymentEvent(bookingId, ownerId, 'owner', 'success', 'Dueño reportó pago e hizo upload del comprobante.');
  await createNotification(booking.caregiver_id as string, 'payment', 'Pago recibido del dueño', 'El dueño ha reportado el pago. Por favor verifícalo.');
  await notifyCaregiverCapacityChanged(booking.caregiver_id as string);
  return { ok: true } as const;
};

export const confirmCaregiverPayment = async (bookingId: string, caregiverId: string, confirmed: boolean, note?: string) => {
  await ensureServiceSchema();
  const client = getTursoClient();

  const bookingRes = await client.execute({
    sql: 'select caregiver_id, request_id, owner_id from bookings where id = ? limit 1',
    args: [bookingId],
  });
  const booking = bookingRes.rows[0] as any;
  if (!booking || booking.caregiver_id !== caregiverId) {
    return { ok: false, reason: 'not_found' } as const;
  }

  const now = new Date().toISOString();
  const newStatus = confirmed ? 'payment_confirmed' : 'payment_rejected';

  await client.execute({
    sql: 'update bookings set caregiver_confirmed_payment = ?, caregiver_confirmation_date = ?, caregiver_confirmation_note = ?, status = ?, updated_at = ? where id = ?',
    args: [confirmed ? 1 : 0, now, note || '', newStatus, now, bookingId],
  });
  await client.execute({
    sql: 'update service_requests set status = ?, updated_at = ? where id = ?',
    args: [newStatus, now, booking.request_id],
  });

  const message = confirmed
    ? 'Cuidador confirmó el pago recibido del dueño.'
    : 'Cuidador reportó inconsistencias con el pago.';
  await addPaymentEvent(bookingId, caregiverId, 'caregiver', confirmed ? 'success' : 'warning', message);

  await createNotification(
    booking.owner_id as string,
    'payment',
    confirmed ? 'Pago confirmado' : 'Problema con el pago',
    message
  );

  await notifyCaregiverCapacityChanged(caregiverId);

  return { ok: true } as const;
};

export const submitFeePayment = async (
  bookingId: string,
  caregiverId: string,
  reference: string,
  proofUrl: string,
  date: string,
  amount: number,
  payerPhone?: string,
  bankOrigin?: string,
) => {
  await ensureServiceSchema();
  const client = getTursoClient();

  const bookingRes = await client.execute({
    sql: 'select caregiver_id, request_id from bookings where id = ? limit 1',
    args: [bookingId],
  });
  const booking = bookingRes.rows[0] as any;
  if (!booking || booking.caregiver_id !== caregiverId) {
    return { ok: false, reason: 'not_found' } as const;
  }

  const now = new Date().toISOString();
  await client.execute({
    sql: 'update bookings set fee_reference = ?, fee_proof = ?, fee_payment_date = ?, fee_payer_phone = ?, fee_bank_origin = ?, fee_amount = ?, status = ?, updated_at = ? where id = ?',
    args: [reference, proofUrl, date, payerPhone || null, bankOrigin || null, amount, 'fee_submitted', now, bookingId],
  });
  await client.execute({
    sql: 'update service_requests set status = ?, updated_at = ? where id = ?',
    args: ['fee_submitted', now, booking.request_id],
  });

  await addPaymentEvent(bookingId, caregiverId, 'caregiver', 'info', `Cuidador reportó fee a ACUPATAS ($${amount}). Se valida en máximo 24h.`);

  // Notify both parties via WS so their UI updates immediately
  try {
    const srRes = await client.execute({
      sql: 'select owner_id from service_requests where id = ? limit 1',
      args: [booking.request_id],
    });
    const sr = srRes.rows[0] as any;
    if (sr) {
      const { notifyUserWs } = await import('../server/websocket');
      notifyUserWs(sr.owner_id as string, { type: 'SYNC_COUNTS' });
      notifyUserWs(caregiverId, { type: 'SYNC_COUNTS' });
    }
  } catch (err) {
    console.error('[Service] Error broadcasting fee submission:', err);
  }

  await notifyCaregiverCapacityChanged(caregiverId);

  return { ok: true } as const;
};

export const validateFeePayment = async (bookingId: string, adminId: string, forceManual?: boolean, options?: BdvValidationOptions) => {
  await ensureServiceSchema();
  const client = getTursoClient();

  // Security check: only admins can validate fees
  if (adminId !== 'SKIP_BDV' && adminId !== 'BDV_SYSTEM') {
    const user = await getUserById(adminId);
    if (!isAdmin(user)) {
      throw new Error('Unauthorized: Only administrators can validate fees.');
    }
  }

  const bookingRes = await client.execute({
    sql: 'select request_id, owner_id, caregiver_id, fee_reference, fee_amount, fee_payment_date, fee_payer_phone, fee_bank_origin, fee_validated from bookings where id = ? limit 1',
    args: [bookingId],
  });
  const booking = bookingRes.rows[0] as any;
  if (!booking) {
    return { ok: false, reason: 'not_found' } as const;
  }

  if (Number(booking.fee_validated ?? 0) === 1) {
    return { ok: true, alreadyValidated: true } as const;
  }

  if (!forceManual) {
    if (!booking.fee_reference || !String(booking.fee_reference).trim()) {
      return { ok: false, reason: 'fee_reference_missing' } as const;
    }
    if (!booking.fee_payment_date || !String(booking.fee_payment_date).trim()) {
      return { ok: false, reason: 'fee_payment_date_missing' } as const;
    }
    if (!booking.fee_amount || Number(booking.fee_amount) <= 0) {
      return { ok: false, reason: 'fee_amount_invalid' } as const;
    }
  }

  // --- START BDV AUTOMATED VALIDATION ---
  // Only try to validate via API if it's the system or admin trying to automate it
  // and we have a reference and not forcing manual validation.
  if (booking.fee_reference && adminId !== 'SKIP_BDV' && !forceManual) {
    const bankRes = await client.execute({
      sql: 'select bank_name, rif, paymobile from caregiver_bank where user_id = ? limit 1',
      args: [booking.caregiver_id],
    });
    const bank = bankRes.rows[0] as any;

    if (!bank) {
      await addPaymentEvent(bookingId, adminId, 'admin', 'error', 'Fallo validación BDV: faltan datos bancarios del cuidador.');
      return { ok: false, reason: 'bank_data_missing' } as const;
    }

    const payerPhone = String(booking.fee_payer_phone || bank.paymobile || '').trim();
    if (!payerPhone) {
      await addPaymentEvent(bookingId, adminId, 'admin', 'error', 'Fallo validación BDV: falta teléfono pagador en datos bancarios del cuidador.');
      return { ok: false, reason: 'bank_paymobile_missing' } as const;
    }

    const bdvRifDestino = String(options?.acupatasRif || 'J507903559');
    const bdvPhoneDestino = String(options?.acupatasPhone || '04147199496');

    const bancoOrigen = String(booking.fee_bank_origin || getBankCode(bank.bank_name)).trim();
    const isBdvToBdv = bancoOrigen === '0102';
    const referenceDigits = String(booking.fee_reference || '').replace(/\D/g, '');
    const referenceForBdv = referenceDigits.length > 8 ? referenceDigits.slice(-8) : referenceDigits;

    if (!/^\d{4,8}$/.test(referenceForBdv)) {
      await addPaymentEvent(bookingId, adminId, 'admin', 'error', 'Fallo validación BDV: referencia inválida para conciliación (se requieren 4-8 dígitos).');
      return { ok: false, reason: 'fee_reference_invalid_for_bdv' } as const;
    }

    const bdvPayload = {
      cedulaPagador: isBdvToBdv ? (bank.rif || 'V0') : ('V' + bdvRifDestino.replace(/[^0-9]/g, '')),
      telefonoPagador: payerPhone,
      telefonoDestino: bdvPhoneDestino,
      referencia: referenceForBdv,
      fechaPago: String(booking.fee_payment_date || '').slice(0, 10),
      importe: Number(booking.fee_amount || 0).toFixed(2),
      bancoOrigen,
      reqCed: isBdvToBdv,
    };

    const bdvResult = await verifyBdvMovement(bdvPayload, {
      apiKey: String(options?.bdvApiKey || ''),
      endpoint: String(options?.bdvEndpoint || 'https://bdvconciliacion.banvenez.com/getMovement'),
    });

    if (bdvResult.code !== 1000) {
      const errorMsg = `BDV: ${bdvResult.message}`;
      console.warn(`[BDV] Validation failed for booking ${bookingId}: ${errorMsg}`);
      await addPaymentEvent(bookingId, adminId, 'admin', 'error', `Fallo validación BDV: ${bdvResult.message}`);
      return { ok: false, reason: errorMsg } as const;
    }

    console.log(`[BDV] Payment confirmed for booking ${bookingId}`);
    await addPaymentEvent(bookingId, adminId, 'admin', 'info', 'BDV Conciliación: Pago verificado exitosamente en línea.');
  }
  // --- END BDV AUTOMATED VALIDATION ---

  const now = new Date().toISOString();
  await client.execute({
    sql: 'update bookings set fee_validated = 1, fee_validation_date = ?, status = ?, updated_at = ? where id = ?',
    args: [now, 'completed', now, bookingId],
  });
  await client.execute({
    sql: 'update service_requests set status = ?, updated_at = ? where id = ?',
    args: ['completed', now, booking.request_id],
  });

  // --- START TFHKA DIGITAL INVOICING ---
  try {
    const ownerProfile = await getOwnerProfileByUserId(booking.owner_id);
    if (ownerProfile && ownerProfile.cedula && ownerProfile.email) {
      const tfhkaToken = await authenticateTfhka();
      if (tfhkaToken) {
        const payload = buildCommissionInvoicePayload({
          bookingId,
          owner: {
            fullName: ownerProfile.fullName,
            cedula: ownerProfile.cedula,
            address: ownerProfile.addressDetail || ownerProfile.address,
            email: ownerProfile.email,
            phone: ownerProfile.primaryPhone,
          },
          amountUsd: Number(booking.fee_amount),
        });

        const result = await emitInvoice(payload, tfhkaToken);
        if (result && result.Codigo === '200' && result.Resultado) {
          console.log(`[TFHKA] Invoice issued: ${result.Resultado.NumeroDocumento} / Control: ${result.Resultado.NumeroControl}`);
          await addPaymentEvent(bookingId, adminId, 'admin', 'info', `Factura Digital emitida: #${result.Resultado.NumeroDocumento} (Control: ${result.Resultado.NumeroControl})`);
        } else {
          console.error('[TFHKA] Invoice issuance failed:', result?.Mensaje || 'Unknown error');
          await addPaymentEvent(bookingId, adminId, 'admin', 'error', `Fallo emisión factura digital: ${result?.Mensaje || 'Error desconocido'}`);
        }
      } else {
        await addPaymentEvent(bookingId, adminId, 'admin', 'error', 'Fallo emisión factura digital: Error de autenticación con el proveedor.');
      }
    } else {
      console.warn(`[TFHKA] Skipping invoice for booking ${bookingId}: Owner profile incomplete.`);
      await addPaymentEvent(bookingId, adminId, 'admin', 'warning', 'Factura digital omitida: El perfil del dueño está incompleto (falta cédula o correo).');
    }
  } catch (invoiceErr) {
    console.error('[TFHKA] Critical error in invoicing flow:', invoiceErr);
  }
  // --- END TFHKA DIGITAL INVOICING ---

  // Unlock other chats for the owner
  await unlockOwnerChats(booking.owner_id as string);

  await addPaymentEvent(bookingId, adminId, 'admin', 'success', 'ACUPATAS confirmó el fee y generó factura digital.');

  await createNotification(
    booking.caregiver_id as string,
    'payment',
    'Comisión validada',
    'ACUPATAS ha validado tu pago de comisión. El servicio está activo.'
  );

  // Also notify owner so their UI refreshes and blocks the pet in other chats
  await createNotification(
    booking.owner_id as string,
    'service',
    'Servicio activado',
    'Tu servicio ha sido activado tras validar la comisión administrativa.'
  );

  // Check if the service is now fully completed
  try {
    await checkAndCompleteService(booking.request_id as string);
  } catch (err) {
    console.error('[Service] Error checking completion after fee validation:', err);
  }

  await notifyCaregiverCapacityChanged(booking.caregiver_id as string);

  return { ok: true } as const;
};

/**
 * Checks whether a service is fully completed:
 *   - booking fee is validated
 *   - the care period has already ended according to booking.date_to
 * If conditions are met, sets both booking and service_request to 'completed'
 * and closes the associated chat.
 */
export const checkAndCompleteService = async (requestId: string) => {
  const client = getTursoClient();

  // 1. Get the service request with review info
  const srRes = await client.execute({
    sql: 'select id, owner_id, caregiver_id, pet_id, owner_rating, caregiver_rating from service_requests where id = ? limit 1',
    args: [requestId],
  });
  const sr = srRes.rows[0] as any;
  if (!sr) return;

  // Reviews are optional to complete the service (fee_validated is what matters)
  // If reviews exist, we keep them, but we don't block completion if they are missing

  // 2. Get the booking and check fee validation + elapsed care period
  const bookingRes = await client.execute({
    sql: 'select id, status, fee_validated, date_to from bookings where request_id = ? order by created_at desc limit 1',
    args: [requestId],
  });
  const booking = bookingRes.rows[0] as any;
  if (!booking) return;
  const hasBothReviews = Boolean(sr.owner_rating) && Boolean(sr.caregiver_rating);

  if (!booking.fee_validated || (booking.status === 'completed' && !hasBothReviews)) return;

  const bookingDateToRaw = String(booking.date_to || '').trim();
  if (!bookingDateToRaw) return;

  // Use End-of-Day in Caracas Timezone (UTC-4) to avoid premature completion
  const careEnd = new Date(`${bookingDateToRaw}T23:59:59.999-04:00`);
  if (Number.isNaN(careEnd.getTime())) return;
  if (careEnd.getTime() > Date.now()) return;

  // All conditions met — mark as completed
  const now = new Date().toISOString();
  await Promise.all([
    client.execute({
      sql: "update bookings set status = 'completed', updated_at = ? where id = ?",
      args: [now, booking.id],
    }),
    client.execute({
      sql: "update service_requests set status = 'completed', updated_at = ? where id = ?",
      args: [now, requestId],
    }),
  ]);

  // 3. Close the chat
  let completedChatLink: string | undefined;
  try {
    await ensureChatSchema();
    const chatRes = await client.execute({
      sql: 'select id from chats where owner_id = ? and caregiver_id = ? and open = 1 order by updated_at desc limit 1',
      args: [sr.owner_id, sr.caregiver_id],
    });
    const chat = chatRes.rows[0] as any;
    if (chat) {
      completedChatLink = `/dashboard/chat/${chat.id}?sr=${requestId}`;
      await client.execute({
        sql: "update chats set open = 0, status = 'completed', updated_at = ? where id = ?",
        args: [now, chat.id],
      });
      console.log(`[Service] Chat ${chat.id} archived — service ${requestId} completed.`);
    }
  } catch (err) {
    console.error('[Service] Error closing chat after completion:', err);
  }

  // 4. Notify both parties
  try {
    const ownerId = typeof sr.owner_id === 'string' ? sr.owner_id.trim() : null;
    const caregiverId = typeof sr.caregiver_id === 'string' ? sr.caregiver_id.trim() : null;

    const notifications: Promise<any>[] = [];
    if (ownerId && ownerId !== 'null' && ownerId !== 'undefined') {
      notifications.push(createNotification(
        ownerId,
        'service',
        'Servicio completado',
        `El cuidador ha terminado el servicio para ${sr.petName}.`,
        completedChatLink || ''
      ));
    }
    if (caregiverId && caregiverId !== 'null' && caregiverId !== 'undefined') {
      notifications.push(createNotification(
        caregiverId,
        'service',
        'Servicio completado',
        `Has completado el servicio para ${sr.petName}.`,
        completedChatLink || ''
      ));
    }
    await Promise.allSettled(notifications);
  } catch (err) {
    console.error('[Service] Error creating notifications in checkAndCompleteService:', err);
  }
};

export const getPaymentTimeline = async (bookingId: string): Promise<PaymentEvent[]> => {
  await ensureServiceSchema();
  const client = getTursoClient();

  const result = await client.execute({
    sql: 'select * from payment_events where booking_id = ? order by created_at desc',
    args: [bookingId],
  });

  return result.rows.map((row: any) => ({
    id: row.id as string,
    bookingId: row.booking_id as string,
    eventType: row.event_type as 'info' | 'success' | 'warning' | 'error',
    actorId: row.actor_id as string,
    actorRole: row.actor_role as string,
    message: row.message as string,
    createdAt: row.created_at as string,
  }));
};

export const getBookingById = async (bookingId: string) => {
  await ensureServiceSchema();
  const client = getTursoClient();

  const bookingRes = await client.execute({
    sql: 'select * from bookings where id = ? limit 1',
    args: [bookingId],
  });
  const bookingRow = bookingRes.rows[0] as any;
  if (!bookingRow) return null;

  const booking: BookingRecord = {
    id: bookingRow.id as string,
    requestId: bookingRow.request_id as string,
    petId: bookingRow.pet_id as string,
    ownerId: bookingRow.owner_id as string,
    caregiverId: bookingRow.caregiver_id as string,
    service: bookingRow.service ?? '',
    dateFrom: bookingRow.date_from ?? '',
    dateTo: bookingRow.date_to ?? '',
    amountUsd: Number(bookingRow.amount_usd ?? 0),
    status: bookingRow.status ?? '',
    ownerPaymentReference: bookingRow.owner_payment_reference ?? undefined,
    ownerPaymentProof: bookingRow.owner_payment_proof ?? undefined,
    ownerPaymentDate: bookingRow.owner_payment_date ?? undefined,
    caregiverConfirmedPayment: Boolean(bookingRow.caregiver_confirmed_payment ?? 0),
    caregiverConfirmationDate: bookingRow.caregiver_confirmation_date ?? undefined,
    caregiverConfirmationNote: bookingRow.caregiver_confirmation_note ?? undefined,
    feeReference: bookingRow.fee_reference ?? undefined,
    feeProof: bookingRow.fee_proof ?? undefined,
    feePaymentDate: bookingRow.fee_payment_date ?? undefined,
    feePayerPhone: bookingRow.fee_payer_phone ?? undefined,
    feeBankOrigin: bookingRow.fee_bank_origin ?? undefined,
    feeValidated: Boolean(bookingRow.fee_validated ?? 0),
    feeValidationDate: bookingRow.fee_validation_date ?? undefined,
  };

  return booking;
};
export const getUserBookings = async (userId: string) => {
  await ensureServiceSchema();
  const client = getTursoClient();

  const result = await client.execute({
    sql: 'select * from bookings where owner_id = ? or caregiver_id = ? order by created_at desc',
    args: [userId, userId],
  });

  return result.rows.map((bookingRow: any) => ({
    id: bookingRow.id as string,
    requestId: bookingRow.request_id as string,
    petId: bookingRow.pet_id as string,
    ownerId: bookingRow.owner_id as string,
    caregiverId: bookingRow.caregiver_id as string,
    service: bookingRow.service ?? '',
    dateFrom: bookingRow.date_from ?? '',
    dateTo: bookingRow.date_to ?? '',
    amountUsd: Number(bookingRow.amount_usd ?? 0),
    status: bookingRow.status ?? '',
    ownerPaymentReference: bookingRow.owner_payment_reference ?? undefined,
    ownerPaymentProof: bookingRow.owner_payment_proof ?? undefined,
    ownerPaymentDate: bookingRow.owner_payment_date ?? undefined,
    caregiverConfirmedPayment: Boolean(bookingRow.caregiver_confirmed_payment ?? 0),
    caregiverConfirmationDate: bookingRow.caregiver_confirmation_date ?? undefined,
    caregiverConfirmationNote: bookingRow.caregiver_confirmation_note ?? undefined,
    feeReference: bookingRow.fee_reference ?? undefined,
    feeProof: bookingRow.fee_proof ?? undefined,
    feePaymentDate: bookingRow.fee_payment_date ?? undefined,
    feePayerPhone: bookingRow.fee_payer_phone ?? undefined,
    feeBankOrigin: bookingRow.fee_bank_origin ?? undefined,
    feeValidated: Boolean(bookingRow.fee_validated ?? 0),
    feeValidationDate: bookingRow.fee_validation_date ?? undefined,
  } as BookingRecord));
};

export const listCommissionBookingsForAdmin = async (): Promise<AdminCommissionRecord[]> => {
  await ensureServiceSchema();
  const client = getTursoClient();

  const result = await client.execute({
    sql: `select
      b.id,
      b.request_id,
      b.owner_id,
      b.caregiver_id,
      b.service,
      b.date_from,
      b.date_to,
      b.amount_usd,
      b.status,
      b.fee_reference,
      b.fee_payer_phone,
      b.fee_bank_origin,
      b.fee_proof,
      b.fee_payment_date,
      b.fee_amount,
      b.fee_validated,
      b.fee_validation_date,
      b.updated_at,
      coalesce((
        select 1
        from payment_events pe_auto
        where pe_auto.booking_id = b.id
          and pe_auto.message like 'BDV Conciliación:%'
        order by pe_auto.created_at desc
        limit 1
      ), 0) as has_bdv_success,
      coalesce((
        select 1
        from payment_events pe_err
        where pe_err.booking_id = b.id
          and pe_err.event_type = 'error'
          and pe_err.message like 'Fallo validación BDV:%'
        order by pe_err.created_at desc
        limit 1
      ), 0) as has_bdv_error,
      coalesce((
        select pe_msg.message
        from payment_events pe_msg
        where pe_msg.booking_id = b.id
          and pe_msg.event_type = 'error'
          and pe_msg.message like 'Fallo validación BDV:%'
        order by pe_msg.created_at desc
        limit 1
      ), '') as last_bdv_error,
      coalesce((
        select pe_bdv_ok.message
        from payment_events pe_bdv_ok
        where pe_bdv_ok.booking_id = b.id
          and pe_bdv_ok.message like 'BDV Conciliación:%'
        order by pe_bdv_ok.created_at desc
        limit 1
      ), '') as last_bdv_success,
      coalesce((
        select pe_inv_ok.message
        from payment_events pe_inv_ok
        where pe_inv_ok.booking_id = b.id
          and pe_inv_ok.message like 'Factura Digital emitida:%'
        order by pe_inv_ok.created_at desc
        limit 1
      ), '') as last_invoice_success,
      coalesce((
        select pe_inv_err.message
        from payment_events pe_inv_err
        where pe_inv_err.booking_id = b.id
          and pe_inv_err.event_type = 'error'
          and pe_inv_err.message like 'Fallo emisión factura digital:%'
        order by pe_inv_err.created_at desc
        limit 1
      ), '') as last_invoice_error,
      coalesce((
        select pe_inv_warn.message
        from payment_events pe_inv_warn
        where pe_inv_warn.booking_id = b.id
          and pe_inv_warn.event_type = 'warning'
          and pe_inv_warn.message like 'Factura digital omitida:%'
        order by pe_inv_warn.created_at desc
        limit 1
      ), '') as last_invoice_warning,
      coalesce(op.display_name, op.full_name, owner_user.email, 'Dueño') as owner_name,
      coalesce(owner_user.email, '') as owner_email,
      coalesce(cp.name, caregiver_user.email, 'Cuidador') as caregiver_name,
      coalesce(caregiver_user.email, '') as caregiver_email
    from bookings b
    left join owner_profile_extra op on op.user_id = b.owner_id
    left join users owner_user on owner_user.id = b.owner_id
    left join caregiver_profiles cp on cp.user_id = b.caregiver_id
    left join users caregiver_user on caregiver_user.id = b.caregiver_id
    where (
      (b.fee_reference is not null and trim(b.fee_reference) <> '')
      or coalesce(b.fee_amount, 0) > 0
      or b.status in ('fee_submitted', 'active', 'completed')
      or exists (
        select 1 from payment_events pe_any
        where pe_any.booking_id = b.id
          and pe_any.message like 'Fallo validación BDV:%'
      )
    )
    order by
      case
        when coalesce((
          select 1 from payment_events pe_ord
          where pe_ord.booking_id = b.id
            and pe_ord.event_type = 'error'
            and pe_ord.message like 'Fallo validación BDV:%'
          order by pe_ord.created_at desc
          limit 1
        ), 0) = 1 and coalesce(b.fee_validated, 0) = 0 then 0
        when coalesce(b.fee_validated, 0) = 0 then 1
        else 2
      end,
      coalesce(b.updated_at, b.created_at) desc`,
  });

  return (result.rows as any[]).map((row) => ({
    bookingId: row.id as string,
    requestId: row.request_id as string,
    ownerId: row.owner_id as string,
    ownerName: row.owner_name as string,
    ownerEmail: row.owner_email as string,
    caregiverId: row.caregiver_id as string,
    caregiverName: row.caregiver_name as string,
    caregiverEmail: row.caregiver_email as string,
    service: row.service ?? '',
    dateFrom: row.date_from ?? '',
    dateTo: row.date_to ?? '',
    amountUsd: Number(row.amount_usd ?? 0),
    status: row.status ?? '',
    feeReference: row.fee_reference ?? '',
    feePayerPhone: row.fee_payer_phone ?? '',
    feeBankOrigin: row.fee_bank_origin ?? '',
    feeProof: row.fee_proof ?? '',
    feePaymentDate: row.fee_payment_date ?? '',
    feeAmount: Number(row.fee_amount ?? 0),
    feeValidated: Boolean(row.fee_validated ?? 0),
    feeValidationDate: row.fee_validation_date ?? '',
    updatedAt: row.updated_at ?? '',
    validationMode: Boolean(row.fee_validated ?? 0)
      ? (Boolean(row.has_bdv_success ?? 0) ? 'automatic' : 'manual')
      : 'pending',
    rejected: !Boolean(row.fee_validated ?? 0) && Boolean(row.has_bdv_error ?? 0),
    rejectionReason: String(row.last_bdv_error ?? ''),
    bdvStatus: Boolean(row.has_bdv_success ?? 0)
      ? 'success'
      : Boolean(row.has_bdv_error ?? 0)
        ? 'error'
        : 'pending',
    bdvMessage: String(row.last_bdv_success || row.last_bdv_error || ''),
    invoiceStatus: String(row.last_invoice_success ?? '').trim()
      ? 'issued'
      : String(row.last_invoice_error ?? '').trim()
        ? 'error'
        : String(row.last_invoice_warning ?? '').trim()
          ? 'warning'
          : 'pending',
    invoiceMessage: String(row.last_invoice_success || row.last_invoice_error || row.last_invoice_warning || ''),
  }));
};

export const listIncomingBankPaymentsForAdmin = async (): Promise<AdminBankPaymentRecord[]> => {
  await ensureServiceSchema();
  const client = getTursoClient();

  const result = await client.execute({
    sql: `select
      bp.id,
      bp.reference,
      bp.amount,
      bp.phone,
      bp.date,
      bp.created_at,
      coalesce(bp.booking_id, '') as booking_id,
      coalesce(bp.user_id, '') as user_id,
      coalesce(op.display_name, op.full_name, owner_user.email, 'Dueño') as owner_name,
      coalesce(owner_user.email, '') as owner_email,
      coalesce(cp.name, caregiver_user.email, 'Cuidador') as caregiver_name,
      coalesce(caregiver_user.email, '') as caregiver_email,
      coalesce(b.service, '') as service,
      coalesce(b.status, '') as booking_status,
      coalesce(b.fee_amount, 0) as fee_amount,
      coalesce(b.fee_validated, 0) as fee_validated
    from bank_payments bp
    left join bookings b on b.id = bp.booking_id
    left join owner_profile_extra op on op.user_id = b.owner_id
    left join users owner_user on owner_user.id = b.owner_id
    left join caregiver_profiles cp on cp.user_id = b.caregiver_id
    left join users caregiver_user on caregiver_user.id = b.caregiver_id
    order by coalesce(bp.created_at, bp.date) desc
    limit 500`,
    args: [],
  });

  return (result.rows as any[]).map((row) => ({
    id: String(row.id ?? ''),
    reference: String(row.reference ?? ''),
    amount: Number(row.amount ?? 0),
    phone: String(row.phone ?? ''),
    date: String(row.date ?? ''),
    createdAt: String(row.created_at ?? ''),
    bookingId: String(row.booking_id ?? ''),
    userId: String(row.user_id ?? ''),
    ownerName: String(row.owner_name ?? ''),
    ownerEmail: String(row.owner_email ?? ''),
    caregiverName: String(row.caregiver_name ?? ''),
    caregiverEmail: String(row.caregiver_email ?? ''),
    service: String(row.service ?? ''),
    bookingStatus: String(row.booking_status ?? ''),
    feeAmount: Number(row.fee_amount ?? 0),
    feeValidated: Boolean(row.fee_validated ?? 0),
  }));
};


export const guardarPago = async (
  data: { referencia: string; monto: number; telefono: string; fecha: string },
  options?: BdvValidationOptions,
) => {
  await ensureServiceSchema();
  const client = getTursoClient();
  const id = `bpm_${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  const bookingRes = await client.execute({
    sql: 'select id, caregiver_id, fee_amount from bookings where fee_reference = ? limit 1',
    args: [data.referencia],
  });
  const booking = bookingRes.rows[0] as any;
  const bookingId = booking?.id || null;
  const userId = booking?.caregiver_id || null;

  await client.execute({
    sql: `insert into bank_payments(id, reference, amount, phone, date, user_id, booking_id, created_at)
      values (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, data.referencia, data.monto, data.telefono, data.fecha, userId, bookingId, now],
  });

  if (bookingId) {
    console.log(`[BDV] Payment matched to booking ${bookingId}`);

    // Auto-validate if amount is sufficient (within 0.5 difference)
    const expected = Number(booking.fee_amount || 0);
    const paid = Number(data.monto);

    if (paid >= expected - 0.5) {
      console.log(`[BDV] Amount matched (${paid} >= ${expected}). validating fee...`);
      await validateFeePayment(bookingId, 'BDV_SYSTEM', false, options);
    } else {
      console.warn(`[BDV] Amount insufficient (${paid} < ${expected}).`);
      await addPaymentEvent(bookingId, userId, 'caregiver', 'warning', `Pago recibido por BDV ($${paid}) es menor al esperado ($${expected}).`);
    }
  }

  return { ok: true, id };
};

export const buscarPago = async (referencia: string) => {
  await ensureServiceSchema();
  const client = getTursoClient();
  const result = await client.execute({
    sql: 'select * from bank_payments where reference = ? limit 1',
    args: [referencia],
  });
  const row = result.rows[0] as any;
  if (!row) return null;

  return {
    id: row.id as string,
    reference: row.reference as string,
    amount: Number(row.amount),
    phone: row.phone as string,
    date: row.date as string,
    userId: row.user_id as string | null,
    bookingId: row.booking_id as string | null,
    createdAt: row.created_at as string,
  };
};

export const getBlockedPetsForOwner = async (ownerId: string, caregiverId: string) => {
  await ensureServiceSchema();
  const client = getTursoClient();
  const nowIso = getCaracasTime();
  const nowDate = getCaracasDate();

  // Parse comma separated pet IDs from rows
  const extractPets = (rows: any[]) => {
    const pets = new Set<string>();
    for (const row of rows) {
      if (row.pet_id) {
        for (const p of String(row.pet_id).split(',')) {
          if (p.trim()) pets.add(p.trim());
        }
      }
    }
    return Array.from(pets);
  };

  const [pendingReviews, activeServices, pendingPayment, pendingValidation] = await Promise.all([
    client.execute({
      sql: `select pet_id from service_requests
        where owner_id = ?
          and end_date <= ?
          and owner_rating is null
          and status in ('payment_confirmed', 'fee_submitted', 'active', 'completed')
          and caregiver_id <> ?`,
      args: [ownerId, nowDate, caregiverId],
    }),
    client.execute({
      sql: `select pet_id from service_requests
        where owner_id = ?
          and (
            status in ('requested', 'accepted', 'paid', 'payment_sent', 'payment_confirmed', 'fee_submitted', 'active', 'in_progress', 'completed')
            and end_date >= ?
          )`,
      args: [ownerId, nowDate],
    }),
    client.execute({
      sql: `select pet_id from bookings
        where owner_id = ?
          and caregiver_id = ?
          and status in ('payment_confirmed', 'completed')
          and (fee_reference is null or trim(fee_reference) = '')`,
      args: [ownerId, caregiverId],
    }),
    client.execute({
      sql: `select pet_id from bookings
        where owner_id = ?
          and caregiver_id = ?
          and status = 'fee_submitted'
          and coalesce(fee_validated, 0) = 0`,
      args: [ownerId, caregiverId],
    })
  ]);

  return {
    pendingReviews: extractPets(pendingReviews.rows),
    activeServices: extractPets(activeServices.rows),
    pendingPayment: extractPets(pendingPayment.rows),
    pendingValidation: extractPets(pendingValidation.rows),
  };
};

export const getPendingCommissionsForChat = async (ownerId: string, caregiverId: string): Promise<'payment' | 'validation' | null> => {
  await ensureServiceSchema();
  const client = getTursoClient();

  const pendingPayment = await client.execute({
    sql: `select id from bookings
      where owner_id = ?
        and caregiver_id = ?
        and status in ('payment_confirmed', 'completed')
        and (fee_reference is null or trim(fee_reference) = '')
      limit 1`,
    args: [ownerId, caregiverId],
  });
  if (pendingPayment.rows.length > 0) return 'payment';

  const pendingValidation = await client.execute({
    sql: `select id from bookings
      where owner_id = ?
        and caregiver_id = ?
        and status = 'fee_submitted'
        and coalesce(fee_validated, 0) = 0
      limit 1`,
    args: [ownerId, caregiverId],
  });
  if (pendingValidation.rows.length > 0) return 'validation';

  return null;
};

export const getGlobalPendingCommissions = async (caregiverId: string): Promise<{ type: 'payment' | 'validation'; count: number } | null> => {
  await ensureServiceSchema();
  const client = getTursoClient();

  // 1. Check for pending payment count
  const pendingPayment = await client.execute({
    sql: `select count(id) as count from bookings
      where caregiver_id = ?
        and status in ('payment_confirmed', 'completed')
        and (fee_reference is null or trim(fee_reference) = '')`,
    args: [caregiverId],
  });
  const payCount = Number((pendingPayment.rows[0] as any).count || 0);
  if (payCount > 0) return { type: 'payment', count: payCount };

  // 2. Check for pending validation count
  const pendingValidation = await client.execute({
    sql: `select count(id) as count from bookings
      where caregiver_id = ?
        and status = 'fee_submitted'
        and coalesce(fee_validated, 0) = 0`,
    args: [caregiverId],
  });
  const valCount = Number((pendingValidation.rows[0] as any).count || 0);
  if (valCount > 0) return { type: 'validation', count: valCount };

  return null;
};

export type AdminHistoryRecord = {
  bookingId: string;
  requestId: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  caregiverId: string;
  caregiverName: string;
  caregiverEmail: string;
  service: string;
  dateFrom: string;
  dateTo: string;
  amountUsd: number;
  status: string;
  ownerRating: number | null;
  ownerReview: string | null;
  caregiverRating: number | null;
  caregiverReview: string | null;
  feeAmount: number;
  feeValidated: boolean;
  completedAt: string;
  chatId: string | null;
};

export const listCompletedServicesForAdmin = async (): Promise<AdminHistoryRecord[]> => {
  await ensureServiceSchema();
  const client = getTursoClient();

  const result = await client.execute({
    sql: `select
      b.id as booking_id,
      b.request_id,
      b.owner_id,
      b.caregiver_id,
      b.service,
      b.date_from,
      b.date_to,
      b.amount_usd,
      b.status,
      b.fee_amount,
      b.fee_validated,
      b.updated_at as completed_at,
      sr.owner_rating,
      sr.owner_review,
      sr.caregiver_rating,
      sr.caregiver_review,
      coalesce(op.display_name, op.full_name, owner_user.email, 'Dueño') as owner_name,
      coalesce(owner_user.email, '') as owner_email,
      coalesce(cp.name, caregiver_user.email, 'Cuidador') as caregiver_name,
      coalesce(caregiver_user.email, '') as caregiver_email,
      ch.id as chat_id
    from bookings b
    left join service_requests sr on sr.id = b.request_id
    left join owner_profile_extra op on op.user_id = b.owner_id
    left join users owner_user on owner_user.id = b.owner_id
    left join caregiver_profiles cp on cp.user_id = b.caregiver_id
    left join users caregiver_user on caregiver_user.id = b.caregiver_id
    left join chats ch on ch.owner_id = b.owner_id and ch.caregiver_id = b.caregiver_id
    where b.status = 'completed'
    order by b.updated_at desc`,
  });

  return (result.rows as any[]).map((row) => ({
    bookingId: row.booking_id as string,
    requestId: row.request_id as string,
    ownerId: row.owner_id as string,
    ownerName: row.owner_name as string,
    ownerEmail: row.owner_email as string,
    caregiverId: row.caregiver_id as string,
    caregiverName: row.caregiver_name as string,
    caregiverEmail: row.caregiver_email as string,
    service: row.service ?? '',
    dateFrom: row.date_from ?? '',
    dateTo: row.date_to ?? '',
    amountUsd: Number(row.amount_usd ?? 0),
    status: row.status ?? '',
    ownerRating: row.owner_rating != null ? Number(row.owner_rating) : null,
    ownerReview: row.owner_review ?? null,
    caregiverRating: row.caregiver_rating != null ? Number(row.caregiver_rating) : null,
    caregiverReview: row.caregiver_review ?? null,
    feeAmount: Number(row.fee_amount ?? 0),
    feeValidated: Boolean(row.fee_validated ?? 0),
    completedAt: row.completed_at ?? '',
    chatId: row.chat_id ?? null,
  }));
};

export const getCaregiverOccupiedDates = async (caregiverId: string, _petLimit: number = 1): Promise<string[]> => {
  await ensureServiceSchema();
  const client = getTursoClient();
  const nowDate = getCaracasDate();

  // Future horizon to block: e.g. 6 months
  const futureDateObj = new Date(new Date().setMonth(new Date().getMonth() + 6));
  const futureDateStr = futureDateObj.toISOString().slice(0, 10);

  const bookingsRes = await client.execute({
    sql: `select id, date_from, date_to, pet_id from bookings
      where caregiver_id = ?
        and status in ('requested', 'accepted', 'paid', 'payment_sent', 'payment_confirmed', 'fee_submitted', 'active', 'in_progress', 'completed')
        and date_to >= ?
        and date_from <= ?`,
    args: [caregiverId, nowDate, futureDateStr],
  });

  const getDatesBetween = (start: string, end: string) => {
    const dates = [];
    const startDate = new Date(`${start.slice(0, 10)}T00:00:00Z`);
    const endDate = new Date(`${end.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return [];
    let current = new Date(startDate.getTime());
    while (current.getTime() <= endDate.getTime()) {
      dates.push(current.toISOString().slice(0, 10));
      current.setUTCDate(current.getUTCDate() + 1);
    }
    return dates;
  };

  const occupancyMap: Record<string, Set<string>> = {};

  for (const row of (bookingsRes.rows as any[])) {
    const bPetIds = String(row.pet_id || '').split(',').filter(Boolean);
    const bDates = getDatesBetween(row.date_from, row.date_to);

    for (const d of bDates) {
      if (!occupancyMap[d]) occupancyMap[d] = new Set<string>();
      for (const p of bPetIds) {
        occupancyMap[d].add(p);
      }
    }
  }

  const occupiedDates: string[] = [];
  for (const [date, pets] of Object.entries(occupancyMap)) {
    // Only block the date if the unique pet count reaches or exceeds the capacity limit.
    if (pets.size >= _petLimit) {
      occupiedDates.push(date);
    }
  }

  return occupiedDates.sort();
};

export const getCaregiverRemainingCapacityForDates = async (
  caregiverId: string,
  dates: string[],
  petLimit: number = 1,
): Promise<number> => {
  await ensureServiceSchema();
  const normalizedDates = Array.from(new Set((dates || []).map((date) => String(date || '').slice(0, 10)).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))).sort();
  const normalizedPetLimit = Math.max(1, Number(petLimit || 1));

  if (normalizedDates.length === 0) {
    return normalizedPetLimit;
  }

  const client = getTursoClient();
  const minDate = normalizedDates[0];
  const maxDate = normalizedDates[normalizedDates.length - 1];

  const bookingsRes = await client.execute({
    sql: `select date_from, date_to, pet_id from bookings
      where caregiver_id = ?
        and status in ('requested', 'accepted', 'paid', 'payment_sent', 'payment_confirmed', 'fee_submitted', 'active', 'in_progress')
        and substr(date_from, 1, 10) <= ?
        and substr(date_to, 1, 10) >= ?`,
    args: [caregiverId, maxDate, minDate],
  });

  const getDatesBetween = (start: string, end: string) => {
    const expandedDates: string[] = [];
    const startDate = new Date(`${start.slice(0, 10)}T00:00:00Z`);
    const endDate = new Date(`${end.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return expandedDates;

    let current = new Date(startDate.getTime());
    while (current.getTime() <= endDate.getTime()) {
      expandedDates.push(current.toISOString().slice(0, 10));
      current.setUTCDate(current.getUTCDate() + 1);
    }
    return expandedDates;
  };

  const occupancyMap = new Map<string, Set<string>>();
  for (const date of normalizedDates) {
    occupancyMap.set(date, new Set<string>());
  }

  for (const row of (bookingsRes.rows as any[])) {
    const bookingDates = getDatesBetween(String(row.date_from || ''), String(row.date_to || ''));
    const petIds = String(row.pet_id || '').split(',').map((petId) => petId.trim()).filter(Boolean);

    for (const date of bookingDates) {
      const pets = occupancyMap.get(date);
      if (!pets) continue;
      for (const petId of petIds) {
        pets.add(petId);
      }
    }
  }

  let minRemainingCapacity = normalizedPetLimit;
  for (const pets of occupancyMap.values()) {
    minRemainingCapacity = Math.min(minRemainingCapacity, Math.max(0, normalizedPetLimit - pets.size));
  }

  return minRemainingCapacity;
};
