import { getTursoClient, isSchemaEnsured, markSchemaAsEnsured } from './turso';
import { ensureAuthSchema, getSessionFromEvent } from './auth';
import { createNotification } from './notifications';
import { ensureOwnerSchema } from './owner';
import { getCaracasDate } from './utils';
import { server$ } from '@builder.io/qwik-city';

export type ChatRecord = {
  id: string;
  ownerId: string;
  ownerName?: string;
  ownerAvatar?: string;
  caregiverId: string;
  caregiverName: string;
  caregiverAvatar?: string;
  petId?: string;
  petName?: string;
  petPhoto?: string;
  petSpecies?: string;
  status?: string;
  paymentStatus?: string;
  disputeStatus?: string;
  open: boolean;
  locked: boolean;
  unread: number;
  hasPet?: boolean;
  verified?: boolean;
  caregiverPricePerDay?: number;
  petLimit?: number;
  activePets?: number;
  createdAt?: string;
};

export type ChatMessageRecord = {
  id: string;
  chatId: string;
  sender: 'owner' | 'caregiver';
  text?: string;
  mediaUrl?: string;
  ts: string;
};

type CreateChatOptions = {
  forceNew?: boolean;
};

const normalizeSqlArg = (value: unknown): string | number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  return String(value);
};

const normalizeSqlArgs = (args: unknown[]): Array<string | number | null> => {
  return args.map((arg) => normalizeSqlArg(arg));
};

const toDbBoolean = (value: unknown, fallback = false): boolean => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
};

export const ensureChatSchema = async () => {
  if (isSchemaEnsured('chat')) return;
  await ensureAuthSchema();
  const client = getTursoClient();
  const statements = [
    `create table if not exists chats (
      id text primary key,
      owner_id text not null,
      caregiver_id text not null,
      pet_id text,
      status text,
      payment_status text,
      dispute_status text,
      open integer default 1,
      locked integer default 0,
      unread integer default 0,
      created_at text,
      updated_at text
    );`,
    `create table if not exists chat_messages (
      id text primary key,
      chat_id text not null,
      sender text,
      text text,
      media_url text,
      ts text
    );`,
    `create table if not exists chat_reports (
      id text primary key,
      chat_id text not null,
      reporter_id text,
      report_type text,
      report_text text,
      created_at text,
      resolved integer default 0
    );`,
  ];
  for (const sql of statements) {
    await client.execute(sql);
  }
  markSchemaAsEnsured('chat');
};

const getCaregiverPrimaryPhotoMap = async (caregiverIds: string[]) => {
  if (caregiverIds.length === 0) {
    return new Map<string, string>();
  }

  const client = getTursoClient();
  try {
    const photosRes = await client.execute({
      sql: `select user_id, url from caregiver_photos where user_id in (${caregiverIds.map(() => '?').join(',')}) order by position asc`,
      args: normalizeSqlArgs(caregiverIds),
    });

    const photoMap = new Map<string, string>();
    for (const row of photosRes.rows as any[]) {
      const userId = row.user_id as string;
      const url = row.url as string | undefined;
      if (!userId || !url || photoMap.has(userId)) continue;
      photoMap.set(userId, url);
    }
    return photoMap;
  } catch {
    return new Map<string, string>();
  }
};

export const listOwnerChats = async (ownerId: string) => {
  if (!ownerId) return [];
  await ensureChatSchema();
  const client = getTursoClient();

  const chatsRes = await client.execute({
    sql: `select * from chats
      where owner_id = ?
      order by updated_at desc`,
    args: normalizeSqlArgs([ownerId]),
  });

  const caregiverIds = (chatsRes.rows as any[]).map((row) => row.caregiver_id as string);
  const petIds = (chatsRes.rows as any[]).map((row) => row.pet_id as string).filter(Boolean);

  const caregiversRes = caregiverIds.length
    ? await client.execute({
      sql: `select user_id, name, avatar, has_own_pet, verified, price_per_day, pet_limit,
            (select sum(case when pet_id is null or pet_id = '' then 0 else length(pet_id) - length(replace(pet_id, ',', '')) + 1 end)
             from bookings
             where caregiver_id = cp.user_id
               and status in ('requested', 'accepted', 'paid', 'payment_sent', 'payment_confirmed', 'fee_submitted', 'active', 'in_progress')
               and date_from <= ?
               and date_to >= ?) as active_pets
            from caregiver_profiles cp where user_id in (${caregiverIds.map(() => '?').join(',')})`,
      args: normalizeSqlArgs([getCaracasDate(), getCaracasDate(), ...caregiverIds]),
    })
    : { rows: [] as any[] };

  const caregiverPhotoMap = await getCaregiverPrimaryPhotoMap(caregiverIds);

  const petsRes = petIds.length
    ? await client.execute({
      sql: `select id, name, photo, species from owner_pet_profiles where id in (${petIds.map(() => '?').join(',')})`,
      args: normalizeSqlArgs(petIds),
    })
    : { rows: [] as any[] };

  const caregiverMap = new Map<string, any>();
  for (const row of caregiversRes.rows as any[]) {
    caregiverMap.set(row.user_id as string, row);
  }

  const petMap = new Map<string, any>();
  for (const row of petsRes.rows as any[]) {
    petMap.set(row.id as string, row);
  }

  return (chatsRes.rows as any[]).map((row) => {
    const caregiver = caregiverMap.get(row.caregiver_id as string) || {};
    const pet = petMap.get(row.pet_id as string) || {};
    const caregiverId = row.caregiver_id as string;
    const caregiverAvatar = caregiver.avatar || caregiverPhotoMap.get(caregiverId) || undefined;
    return {
      id: row.id as string,
      ownerId,
      caregiverId,
      caregiverName: caregiver.name || 'Cuidador',
      caregiverAvatar,
      petId: row.pet_id ?? undefined,
      petName: pet.name || undefined,
      petPhoto: pet.photo || undefined,
      petSpecies: pet.species || undefined,
      status: row.status ?? undefined,
      paymentStatus: row.payment_status ?? undefined,
      disputeStatus: row.dispute_status ?? undefined,
      open: toDbBoolean(row.open, true),
      locked: toDbBoolean(row.locked, false),
      unread: Number(row.unread ?? 0),
      hasPet: Boolean(caregiver.has_own_pet),
      verified: Boolean(caregiver.verified ?? 0),
      caregiverPricePerDay: Number(caregiver.price_per_day ?? 0),
      petLimit: Number(caregiver.pet_limit ?? 1),
      activePets: Number(caregiver.active_pets ?? 0),
      createdAt: row.created_at ?? undefined,
    } as ChatRecord;
  });
};

export const listCaregiverChats = async (caregiverId: string) => {
  if (!caregiverId) return [];
  await ensureChatSchema();
  const client = getTursoClient();

  const chatsRes = await client.execute({
    sql: `select * from chats
      where caregiver_id = ?
      order by updated_at desc`,
    args: normalizeSqlArgs([caregiverId]),
  });

  const ownerIds = (chatsRes.rows as any[]).map((row) => row.owner_id as string);
  const petIds = (chatsRes.rows as any[]).map((row) => row.pet_id as string).filter(Boolean);

  const ownersRes = ownerIds.length
    ? await client.execute({
      sql: `select user_id, full_name, display_name, profile_photo, is_verified,
            (select count(1) from owner_pet_profiles where owner_id = owner_profile_extra.user_id) as petCount,
            (select id from owner_pet_profiles where owner_id = owner_profile_extra.user_id order by id asc limit 1) as firstPetId,
            (select name from owner_pet_profiles where owner_id = owner_profile_extra.user_id order by id asc limit 1) as firstPetName
            from owner_profile_extra where user_id in (${ownerIds.map(() => '?').join(',')})`,
      args: normalizeSqlArgs(ownerIds),
    })
    : { rows: [] as any[] };

  const petsRes = petIds.length
    ? await client.execute({
      sql: `select id, name, photo, species from owner_pet_profiles where id in (${petIds.map(() => '?').join(',')})`,
      args: normalizeSqlArgs(petIds),
    })
    : { rows: [] as any[] };

  const ownerMap = new Map<string, any>();
  for (const row of ownersRes.rows as any[]) {
    ownerMap.set(row.user_id as string, row);
  }

  const petMap = new Map<string, any>();
  for (const row of petsRes.rows as any[]) {
    petMap.set(row.id as string, row);
  }

  return (chatsRes.rows as any[]).map((row) => {
    const owner = ownerMap.get(row.owner_id as string) || {};
    const petIdFromRow = row.pet_id as string | null | undefined;
    const resolvedPetId = petIdFromRow || (owner.petCount === 1 ? owner.firstPetId : undefined);
    const pet = resolvedPetId ? (petMap.get(resolvedPetId) || {}) : {};
    const resolvedPetName = (pet.name as string | undefined) || (petIdFromRow ? undefined : (owner.petCount === 1 ? owner.firstPetName : undefined));
    const ownerName = owner.display_name || owner.full_name || 'Dueño';
    return {
      id: row.id as string,
      ownerId: row.owner_id as string,
      ownerName,
      ownerAvatar: owner.profile_photo || undefined,
      caregiverId: caregiverId,
      caregiverName: 'Cuidador',
      petId: resolvedPetId,
      petName: resolvedPetName,
      petPhoto: pet.photo || undefined,
      petSpecies: pet.species || undefined,
      status: row.status ?? undefined,
      paymentStatus: row.payment_status ?? undefined,
      disputeStatus: row.dispute_status ?? undefined,
      open: toDbBoolean(row.open, true),
      locked: toDbBoolean(row.locked, false),
      unread: Number(row.unread ?? 0),
      hasPet: Boolean(resolvedPetId) || Number(owner.petCount || 0) > 0,
      verified: Boolean(owner.is_verified ?? 0),
      petLimit: undefined, // Owner doesn't have petLimit in this context
      activePets: undefined,
      createdAt: row.created_at ?? undefined,
    } as ChatRecord;
  });
};

export const listAllChats = async () => {
  await ensureChatSchema();
  const client = getTursoClient();

  const chatsRes = await client.execute('select * from chats order by updated_at desc');
  if (chatsRes.rows.length === 0) return [];

  const rows = chatsRes.rows as any[];
  const ownerIds = [...new Set(rows.map(r => r.owner_id as string))];
  const caregiverIds = [...new Set(rows.map(r => r.caregiver_id as string))];
  const petIds = [...new Set(rows.map(r => r.pet_id as string).filter(Boolean))];

  const ownersRes = ownerIds.length
    ? await client.execute({
      sql: `select user_id, full_name, display_name, profile_photo, is_verified,
            (select count(1) from owner_pet_profiles where owner_id = owner_profile_extra.user_id) as petCount,
            (select id from owner_pet_profiles where owner_id = owner_profile_extra.user_id order by id asc limit 1) as firstPetId,
            (select name from owner_pet_profiles where owner_id = owner_profile_extra.user_id order by id asc limit 1) as firstPetName
            from owner_profile_extra where user_id in (${ownerIds.map(() => '?').join(',')})`,
      args: normalizeSqlArgs(ownerIds),
    })
    : { rows: [] };

  const caregiversRes = caregiverIds.length
    ? await client.execute({
      sql: `select user_id, name, avatar, verified, pet_limit,
            (select sum(case when pet_id is null or pet_id = '' then 0 else length(pet_id) - length(replace(pet_id, ',', '')) + 1 end)
             from bookings
             where caregiver_id = cp.user_id
               and status in ('accepted', 'paid', 'payment_sent', 'payment_confirmed', 'fee_submitted', 'active', 'in_progress')
               and date_from <= ?
               and (
                 date_to > ?
                 or (date_to = ? and coalesce(fee_validated, 0) = 0)
               )) as active_pets
            from caregiver_profiles cp where user_id in (${caregiverIds.map(() => '?').join(',')})`,
      args: normalizeSqlArgs([getCaracasDate(), getCaracasDate(), getCaracasDate(), ...caregiverIds]),
    })
    : { rows: [] };

  const caregiverPhotoMap = await getCaregiverPrimaryPhotoMap(caregiverIds);

  const petsRes = petIds.length
    ? await client.execute({
      sql: `select id, name, photo, species from owner_pet_profiles where id in (${petIds.map(() => '?').join(',')})`,
      args: normalizeSqlArgs(petIds),
    })
    : { rows: [] };

  const ownerMap = new Map(ownersRes.rows.map((r: any) => [r.user_id as string, r]));
  const caregiverMap = new Map(caregiversRes.rows.map((r: any) => [r.user_id as string, r]));
  const petMap = new Map(petsRes.rows.map((r: any) => [r.id as string, r]));

  return rows.map(row => {
    const owner = ownerMap.get(row.owner_id) as any || {};
    const caregiver = caregiverMap.get(row.caregiver_id) as any || {};
    const petIdFromRow = row.pet_id as string | null | undefined;
    const resolvedPetId = petIdFromRow || (owner.petCount === 1 ? owner.firstPetId : undefined);
    const pet = (resolvedPetId ? petMap.get(resolvedPetId) : undefined) as any || {};
    const resolvedPetName = pet.name || (petIdFromRow ? undefined : (owner.petCount === 1 ? owner.firstPetName : undefined));
    const caregiverAvatar = caregiver.avatar || caregiverPhotoMap.get(row.caregiver_id as string) || undefined;

    const ownerName = owner.display_name || owner.full_name || 'Dueño';

    return {
      id: row.id,
      ownerId: row.owner_id,
      ownerName: ownerName,
      ownerAvatar: owner.profile_photo,
      caregiverId: row.caregiver_id,
      caregiverName: caregiver.name || 'Cuidador',
      caregiverAvatar,
      petId: resolvedPetId,
      petName: resolvedPetName,
      petPhoto: pet.photo || undefined,
      petSpecies: pet.species || undefined,
      status: row.status,
      open: toDbBoolean(row.open, true),
      unread: Number(row.unread),
      hasPet: Boolean(resolvedPetId) || Number(owner.petCount || 0) > 0,
      verified: Boolean(caregiver.verified),
      petLimit: Number(caregiver.pet_limit ?? 1),
      activePets: Number(caregiver.active_pets ?? 0),
      createdAt: row.created_at,
    } as ChatRecord;
  });
};

export const listChatMessages = async (chatId: string) => {
  await ensureChatSchema();
  const client = getTursoClient();
  const res = await client.execute({
    sql: 'select * from chat_messages where chat_id = ? order by ts asc',
    args: normalizeSqlArgs([chatId]),
  });
  return (res.rows as any[]).map((row) => ({
    id: row.id as string,
    chatId: row.chat_id as string,
    sender: (row.sender as 'owner' | 'caregiver') || 'owner',
    text: row.text ?? undefined,
    mediaUrl: row.media_url ?? undefined,
    ts: row.ts ?? '',
  })) as ChatMessageRecord[];
};

export const createChat = async (ownerId: string, caregiverId: string, petId?: string, options?: CreateChatOptions) => {
  await ensureChatSchema();
  await ensureOwnerSchema();
  const client = getTursoClient();
  const now = new Date().toISOString();
  ownerId = String(ownerId || '').trim();
  caregiverId = String(caregiverId || '').trim();

  if (!ownerId || !caregiverId) {
    return { ok: false, reason: 'invalid_params' } as const;
  }

  const activeStatuses = ['requested', 'accepted', 'paid', 'payment_sent', 'payment_confirmed', 'fee_submitted', 'active', 'in_progress'];

  const ownerPetsRes = await client.execute({
    sql: 'select id from owner_pet_profiles where owner_id = ? order by id asc',
    args: normalizeSqlArgs([ownerId]),
  });
  const ownerPetIds: string[] = ownerPetsRes.rows.map((row: any) => String(row.id));

  if (ownerPetIds.length <= 1) {
    const singlePetActiveWithOtherRes = await client.execute({
      sql: `select id from service_requests
        where owner_id = ?
          and caregiver_id <> ?
          and (
            status in ('requested', 'accepted', 'paid', 'payment_sent', 'payment_confirmed', 'fee_submitted', 'active', 'in_progress')
            and end_date > ?
          )
        limit 1`,
      args: normalizeSqlArgs([ownerId, caregiverId, now]),
    });

    if (singlePetActiveWithOtherRes.rows.length > 0) {
      return { ok: false, reason: 'owner_active_service_single_pet' } as const;
    }
  }

  const existing = await client.execute({
    sql: `select id, pet_id, open
      from chats
      where owner_id = ? and caregiver_id = ?
      order by updated_at desc
      limit 1`,
    args: normalizeSqlArgs([ownerId, caregiverId]),
  });
  if (existing.rows.length && !options?.forceNew) {
    const existingRow = existing.rows[0] as any;
    const existingId = existingRow.id as string;
    const existingPetId = (existingRow.pet_id as string | null | undefined) || undefined;
    const existingOpen = Boolean(existingRow.open ?? 0);

    if (!existingPetId && petId) {
      await client.execute({
        sql: 'update chats set pet_id = ?, updated_at = ? where id = ?',
        args: normalizeSqlArgs([petId, now, existingId]),
      });
    }

    if (!existingOpen) {
      await client.execute({
        sql: "update chats set open = 1, locked = 0, status = 'open', updated_at = ? where id = ?",
        args: normalizeSqlArgs([now, existingId]),
      });
    }

    return { ok: true, id: existingId } as const;
  }

  const requestedPetIds = Array.from(new Set((petId || '').split(',').map((id) => id.trim()).filter(Boolean)));

  if (requestedPetIds.some((id) => !ownerPetIds.includes(id))) {
    return { ok: false, reason: 'invalid_pet' } as const;
  }

  const pendingCommissionRes = await client.execute({
    sql: `select id from bookings
      where caregiver_id = ?
        and status in ('payment_confirmed', 'completed', 'fee_submitted')
        and coalesce(fee_validated, 0) = 0
      limit 1`,
    args: normalizeSqlArgs([caregiverId]),
  });

  if (pendingCommissionRes.rows.length > 0) {
    return { ok: false, reason: 'caregiver_commission_pending_validation' } as const;
  }

  const activeOwnerServicesRes = await client.execute({
    sql: `select caregiver_id, pet_id from service_requests
      where owner_id = ?
        and (
          status in ('requested', 'accepted', 'paid', 'payment_sent', 'payment_confirmed', 'fee_submitted', 'active', 'in_progress')
          and end_date > ?
        )`,
    args: normalizeSqlArgs([ownerId, now]),
  });

  const activePetCaregiver = new Map<string, string>();
  let ownerHasActiveWithOther = false;
  for (const row of (activeOwnerServicesRes.rows as any[])) {
    const activeCaregiverId = String(row.caregiver_id || '');
    if (activeCaregiverId && activeCaregiverId !== caregiverId) {
      ownerHasActiveWithOther = true;
    }
    for (const pid of String(row.pet_id || '').split(',').map((id) => id.trim()).filter(Boolean)) {
      if (!activePetCaregiver.has(pid)) {
        activePetCaregiver.set(pid, activeCaregiverId);
      }
    }
  }

  if (ownerPetIds.length <= 1) {
    if (ownerHasActiveWithOther) {
      return { ok: false, reason: 'owner_active_service_single_pet' } as const;
    }
  } else {
    if (requestedPetIds.length > 0) {
      const blockedPet = requestedPetIds.find((pid) => {
        const activeCaregiverId = activePetCaregiver.get(pid);
        return Boolean(activeCaregiverId && activeCaregiverId !== caregiverId);
      });
      if (blockedPet) {
        return { ok: false, reason: 'pet_active_with_other', detail: blockedPet } as const;
      }
    } else {
      const firstAvailablePet = ownerPetIds.find((pid) => {
        const activeCaregiverId = activePetCaregiver.get(pid);
        return !activeCaregiverId || activeCaregiverId === caregiverId;
      });
      if (!firstAvailablePet) {
        return { ok: false, reason: 'no_available_pet' } as const;
      }
      petId = firstAvailablePet;
    }
  }

  const caregiverProfileRes = await client.execute({
    sql: 'select pet_limit, multi_pet from caregiver_profiles where user_id = ? limit 1',
    args: normalizeSqlArgs([caregiverId]),
  });
  const caregiverProfile = caregiverProfileRes.rows[0] as any;
  const caregiverPetLimit = Math.max(1, Number(caregiverProfile?.pet_limit ?? 1) || 1);

  const activeCaregiverServicesRes = await client.execute({
    sql: `select pet_id from service_requests
      where caregiver_id = ?
        and (
          (status in ('requested', 'accepted', 'paid', 'payment_sent', 'payment_confirmed', 'fee_submitted') and end_date > ?)
          or status in ('active', 'in_progress')
        )`,
    args: normalizeSqlArgs([caregiverId, now]),
  });

  const caregiverActivePetIds = new Set<string>();
  for (const row of (activeCaregiverServicesRes.rows as any[])) {
    for (const pid of String(row.pet_id || '').split(',').map((id) => id.trim()).filter(Boolean)) {
      caregiverActivePetIds.add(pid);
    }
  }

  if (caregiverActivePetIds.size >= caregiverPetLimit) {
    return { ok: false, reason: 'caregiver_no_capacity' } as const;
  }

  if (existing.rows.length) {
    await client.execute({
      sql: "update chats set open = 0, status = 'closed', updated_at = ? where owner_id = ? and caregiver_id = ? and open = 1",
      args: normalizeSqlArgs([now, ownerId, caregiverId]),
    });
  }

  if (!petId) {
    petId = ownerPetIds[0];
  }

  const id = `chat_${crypto.randomUUID()}`;

  await client.execute({
    sql: `insert into chats(id, owner_id, caregiver_id, pet_id, status, payment_status, dispute_status, open, locked, unread, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, 1, 0, 0, ?, ?)`,
    args: normalizeSqlArgs([id, ownerId, caregiverId, petId ?? null, 'open', 'none', 'none', now, now]),
  });
  return { ok: true, id } as const;
};

export const sendChatMessage = async (chatId: string, sender: 'owner' | 'caregiver', text: string, mediaUrl?: string) => {
  await ensureChatSchema();
  const client = getTursoClient();
  const ts = new Date().toISOString();
  const id = `msg_${crypto.randomUUID()}`;
  chatId = String(chatId || '').trim();
  text = String(text || '');

  if (!chatId) {
    return { ok: false, reason: 'not_found' } as const;
  }

  const chatRes = await client.execute({
    sql: 'select owner_id, caregiver_id from chats where id = ? limit 1',
    args: normalizeSqlArgs([chatId]),
  });
  const chat = chatRes.rows[0] as any;
  if (!chat) {
    return { ok: false, reason: 'not_found' } as const;
  }

  const ownerId = String(chat.owner_id || '').trim();
  const caregiverId = String(chat.caregiver_id || '').trim();
  if (!ownerId || !caregiverId) {
    return { ok: false, reason: 'not_found' } as const;
  }

  if (sender === 'owner') {
    const activeStatuses = ['requested', 'accepted', 'paid', 'payment_sent', 'payment_confirmed', 'fee_submitted', 'active', 'in_progress'];
    const ownerPetsRes = await client.execute({
      sql: 'select count(1) as total from owner_pet_profiles where owner_id = ?',
      args: normalizeSqlArgs([ownerId]),
    });
    const ownerPetCount = Number((ownerPetsRes.rows[0] as any)?.total ?? 0);

    if (ownerPetCount <= 1) {
      const singlePetActiveWithOtherRes = await client.execute({
        sql: `select id from service_requests
          where owner_id = ?
            and caregiver_id <> ?
            and (
              (status in ('requested', 'accepted', 'paid', 'payment_sent', 'payment_confirmed', 'fee_submitted') and end_date > ?)
              or status in ('active', 'in_progress')
            )
          limit 1`,
        args: normalizeSqlArgs([ownerId, caregiverId, ts]),
      });

      if (singlePetActiveWithOtherRes.rows.length > 0) {
        return { ok: false, reason: 'owner_active_service_single_pet' } as const;
      }
    }
  }

  await client.execute({
    sql: 'insert into chat_messages(id, chat_id, sender, text, media_url, ts) values (?, ?, ?, ?, ?, ?)',
    args: normalizeSqlArgs([id, chatId, sender, text, mediaUrl ?? null, ts]),
  });
  await client.execute({
    sql: 'update chats set updated_at = ?, unread = unread + 1 where id = ?',
    args: normalizeSqlArgs([ts, chatId]),
  });
  // Notify recipient
  if (chat) {
    const recipientId = sender === 'owner' ? caregiverId : ownerId;
    const title = sender === 'owner' ? 'Nuevo mensaje del dueño' : 'Nuevo mensaje del cuidador';
    await createNotification(recipientId, 'message', title, text || 'Te ha enviado una imagen', `/dashboard/chat/${chatId}`);

    // Push WebSocket Sync Event to both sender and recipient to refresh chat list
    const { notifyUserWs } = await import('../server/websocket');
    notifyUserWs(recipientId, { type: 'SYNC_COUNTS' });
    notifyUserWs(sender === 'owner' ? ownerId : caregiverId, { type: 'SYNC_COUNTS' });
  }

  return { ok: true, id } as const;
};

export const closeChat = async (chatId: string) => {
  await ensureChatSchema();
  const client = getTursoClient();
  const now = new Date().toISOString();
  await client.execute({
    sql: "update chats set open = 0, status = 'closed', updated_at = ? where id = ?",
    args: normalizeSqlArgs([now, chatId]),
  });
  return { ok: true } as const;
};

export const markChatAsSeen = async (chatId: string) => {
  await ensureChatSchema();
  const client = getTursoClient();
  await client.execute({
    sql: 'update chats set unread = 0 where id = ?',
    args: normalizeSqlArgs([chatId]),
  });
  return { ok: true } as const;
};


export const reportChat = async (chatId: string, reporterId: string, type: string, text: string) => {
  await ensureChatSchema();
  const client = getTursoClient();
  const id = `rep_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await client.execute({
    sql: 'insert into chat_reports(id, chat_id, reporter_id, report_type, report_text, created_at, resolved) values (?, ?, ?, ?, ?, ?, 0)',
    args: normalizeSqlArgs([id, chatId, reporterId, type, text, now]),
  });
  return { ok: true } as const;
};

export const getChatById = async (chatId: string): Promise<ChatRecord | null> => {
  if (!chatId) return null;
  await ensureChatSchema();
  const client = getTursoClient();

  const chatRes = await client.execute({
    sql: 'select * from chats where id = ? limit 1',
    args: normalizeSqlArgs([chatId]),
  });

  if (chatRes.rows.length === 0) return null;
  const chat = chatRes.rows[0];

  return {
    id: chat.id as string,
    ownerId: chat.owner_id as string,
    caregiverId: chat.caregiver_id as string,
    petId: chat.pet_id as string,
    petName: chat.pet_name as string,
    open: toDbBoolean(chat.open, true),
    locked: toDbBoolean(chat.locked, false),
    unread: 0,
    caregiverName: '',
  } as ChatRecord;
};

export const getDebugChats = server$(async function () {
  const session = await getSessionFromEvent(this);
  if (!session) return { userId: null, chats: [] };
  const client = getTursoClient();
  const res = await client.execute({
    sql: 'select * from chats where owner_id = ?',
    args: normalizeSqlArgs([session.userId]),
  });
  return { userId: session.userId, chats: res.rows };
});
