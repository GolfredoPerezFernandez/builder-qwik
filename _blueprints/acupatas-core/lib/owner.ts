import { getTursoClient, isSchemaEnsured, markSchemaAsEnsured } from './turso';
import { ensureAuthSchema } from './auth';
import { randomUUID } from 'node:crypto';
import { deleteFile } from './upload';

export interface OwnerProfilePayload {
  fullName: string;
  email: string;
  primaryPhone: string;
  alternativePhone: string;
  cedula: string;
  address: string;
  zone: string;
  biometricSelfie: string;
  locationLat: string;
  locationLng: string;
  addressDetail: string;
  displayName?: string;
  bio?: string;
  emergencyContact: {
    name: string;
    phone: string;
    relationship: string;
    address: string;
  };
  personalReferences: Array<{ name: string; phone: string; relationship: string }>;
  familyReferences: Array<{ name: string; phone: string; relationship: string }>;
  hasOwnPet?: boolean;
  ownPetPhoto?: string;
}

export interface OwnerProfileRecord extends OwnerProfilePayload {
  profilePhoto: string;
  displayName: string;
  bio: string;
  photoWithPet: string;
  phoneVerified: boolean;
  emailVerified: boolean;
  isVerified: boolean;
  rating: number;
  totalReviews: number;
  completeness: number;
  userId?: string;
}

export interface OwnerPetRecord {
  id: string;
  ownerId: string;
  name: string;
  species: string;
  breed: string;
  photo: string;
  age: number;
  sex: string;
  weight: number;
  size: string;
  behavior: string[];
  medicalConditions: string;
  allergies: string;
  vaccinationCard: string;
  hasIdTag: boolean;
  active: boolean;
}

export interface OwnerPetPayload {
  id?: string;
  name: string;
  species: string;
  breed: string;
  photo: string;
  age: number;
  sex: string;
  weight: number;
  size?: string;
  behavior: string[];
  medicalConditions: string;
  allergies: string;
  vaccinationCard: string;
  hasIdTag: boolean;
  active: boolean;
}

export interface OwnerReviewRecord {
  id: string;
  ownerId: string;
  reviewerId: string;
  reviewerName?: string;
  rating: number;
  comment: string;
  date: string;
  petName: string;
}

export interface ServiceRequestRecord {
  id: string;
  petId: string;
  ownerId: string;
  caregiverId: string;
  startDate: string;
  endDate: string;
  status: string;
  ownerRating?: number;
  ownerReview?: string;
  caregiverRating?: number;
  caregiverReview?: string;
  price: number;
}

export interface OwnerDashboardData {
  profile: OwnerProfileRecord;
  pets: OwnerPetRecord[];
  reviews: OwnerReviewRecord[];
  services: ServiceRequestRecord[];
}

export const ensureOwnerSchema = async () => {
  if (isSchemaEnsured('owner')) return;
  await ensureAuthSchema();
  const client = getTursoClient();
  const statements = [
    `create table if not exists owner_profile_extra (
      user_id text primary key,
      full_name text,
      email text,
      primary_phone text,
      alternative_phone text,
      cedula text,
      address text,
      zone text,
      biometric_selfie text,
      profile_photo text,
      display_name text,
      bio text,
      photo_with_pet text,
      phone_verified integer default 0,
      email_verified integer default 0,
      is_verified integer default 0,
      rating real default 0,
      total_reviews integer default 0,
      completeness integer default 0,
      rif text,
      updated_at text
    );`,
    `create table if not exists owner_emergency (
      user_id text primary key,
      nombre text,
      relacion text,
      direccion text,
      telefono text,
      updated_at text
    );`,
    `create table if not exists owner_refs (
      id integer primary key autoincrement,
      user_id text not null,
      kind text not null,
      nombre text,
      telefono text,
      relacion text
    );`,
    `create table if not exists owner_location (
      user_id text primary key,
      lat text,
      lng text,
      direccion_detallada text,
      updated_at text
    );`,
    `create table if not exists owner_pet_profiles (
      id text primary key,
      owner_id text not null,
      name text,
      species text,
      breed text,
      photo text,
      age integer,
      sex text,
      weight real,
      size text,
      behavior text,
      medical_conditions text,
      allergies text,
      vaccination_card text,
      has_id_tag integer default 0,
      active integer default 1,
      updated_at text
    );`,
    `create table if not exists owner_reviews (
      id text primary key,
      owner_id text not null,
      reviewer_id text,
      rating integer,
      comment text,
      date text,
      pet_name text,
      created_at text
    );`,
    `create table if not exists owner_documents (
      user_id text primary key,
      cedula_front text,
      cedula_back text,
      rif_doc text,
      bank_support text,
      pet_vaccine text,
      updated_at text
    );`,
    `create table if not exists owner_profile_history (
      id integer primary key autoincrement,
      user_id text not null,
      change_summary text,
      full_payload text,
      created_at text
    );`,
  ];
  for (const sql of statements) {
    await client.execute(sql);
  }

  // Migrations: add missing columns to owner_pet_profiles gracefully
  const migrationColumns = [
    'breed text',
    'sex text',
    'weight real',
    'size text',
    'behavior text',
    'medical_conditions text',
    'allergies text',
    'has_id_tag integer default 0'
  ];

  for (const colDef of migrationColumns) {
    try {
      await client.execute(`alter table owner_pet_profiles add column ${colDef}`);
    } catch {
      // Already exists
    }
  }

  // Migration: add rif column to owner_profile_extra if missing
  try {
    await client.execute(`alter table owner_profile_extra add column rif text`);
  } catch {
    // Already exists
  }
  markSchemaAsEnsured('owner');
};

const hasActiveBooking = async (client: any, userId: string) => {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' }); // YYYY-MM-DD
    const res = await client.execute({
      sql: "select id, owner_id, caregiver_id from bookings where (owner_id = ? or caregiver_id = ?) and status in ('accepted', 'paid', 'payment_sent', 'payment_confirmed', 'fee_submitted', 'active', 'in_progress') and date_from <= ? and date_to >= ? limit 1",
      args: [userId, userId, today, today],
    });
    if (res.rows.length > 0) {
      const row = res.rows[0];
      let chatId = '';
      try {
        const chatRes = await client.execute({
          sql: 'select id from chats where owner_id = ? and caregiver_id = ? order by updated_at desc limit 1',
          args: [row.owner_id as string, row.caregiver_id as string]
        });
        if (chatRes.rows.length > 0) {
          chatId = chatRes.rows[0].id as string;
        }
      } catch (e) {
        // chats table might not exist or error, ignore
      }
      return { active: true, chatId };
    }
    return { active: false };
  } catch (e: any) {
    if (String(e).includes('no such table: bookings')) return { active: false };
    throw e;
  }
};


const normalizeRefs = (rows: any[]) => {
  const fallback = [
    { name: '', phone: '', relationship: '' },
    { name: '', phone: '', relationship: '' },
  ];
  const mapped = rows.map((row: any) => ({
    name: row?.nombre ?? '',
    phone: row?.telefono ?? '',
    relationship: row?.relacion ?? '',
  }));
  return [...mapped, ...fallback].slice(0, 2);
};

export const getOwnerProfileByUserId = async (userId: string): Promise<OwnerProfileRecord | null> => {
  await ensureOwnerSchema();
  const client = getTursoClient();

  const userRow = await client.execute({
    sql: 'select email from users where id = ? limit 1',
    args: [userId],
  });

  const profileRow = await client.execute({
    sql: `select full_name, email, primary_phone, alternative_phone, cedula, address, zone, biometric_selfie,
    profile_photo, display_name, bio, photo_with_pet, phone_verified, email_verified, is_verified, rating,
    total_reviews, completeness
    from owner_profile_extra where user_id = ? limit 1`,
    args: [userId],
  });

  const emergencyRow = await client.execute({
    sql: 'select nombre, relacion, direccion, telefono from owner_emergency where user_id = ? limit 1',
    args: [userId],
  });

  const locationRow = await client.execute({
    sql: 'select lat, lng, direccion_detallada from owner_location where user_id = ? limit 1',
    args: [userId],
  });

  const refsRow = await client.execute({
    sql: 'select kind, nombre, telefono, relacion from owner_refs where user_id = ? order by id asc',
    args: [userId],
  });

  const profile = profileRow.rows[0] as any;
  const emergency = emergencyRow.rows[0] as any;
  const location = locationRow.rows[0] as any;
  const userEmail = (userRow.rows[0] as any)?.email ?? '';

  if (!profile && !userEmail) return null;

  const personalRefs = refsRow.rows.filter((row: any) => row.kind === 'personal');
  const familyRefs = refsRow.rows.filter((row: any) => row.kind === 'familiar');

  return {
    fullName: profile?.full_name ?? '',
    email: profile?.email ?? userEmail,
    primaryPhone: profile?.primary_phone ?? '',
    alternativePhone: profile?.alternative_phone ?? '',
    cedula: profile?.cedula ?? '',
    address: profile?.address ?? '',
    zone: profile?.zone ?? '',
    biometricSelfie: profile?.biometric_selfie ?? '',
    locationLat: location?.lat ?? '',
    locationLng: location?.lng ?? '',
    addressDetail: location?.direccion_detallada ?? '',
    emergencyContact: {
      name: emergency?.nombre ?? '',
      phone: emergency?.telefono ?? '',
      relationship: emergency?.relacion ?? '',
      address: emergency?.direccion ?? '',
    },
    personalReferences: normalizeRefs(personalRefs),
    familyReferences: normalizeRefs(familyRefs),
    profilePhoto: profile?.profile_photo ?? '',
    displayName: profile?.display_name ?? '',
    bio: profile?.bio ?? '',
    photoWithPet: profile?.photo_with_pet ?? '',
    phoneVerified: Boolean(profile?.phone_verified ?? 0),
    emailVerified: Boolean(profile?.email_verified ?? 0),
    isVerified: Boolean(profile?.is_verified ?? 0),
    rating: Number(profile?.rating ?? 0),
    totalReviews: Number(profile?.total_reviews ?? 0),
    completeness: Number(profile?.completeness ?? 0),
    userId: userId,
  } as OwnerProfileRecord;
};

export const saveOwnerProfileByUserId = async (userId: string, payload: OwnerProfilePayload) => {
  await ensureOwnerSchema();
  const client = getTursoClient();
  const now = new Date().toISOString();

  // Check for active services
  const bookingCheck = await hasActiveBooking(client, userId);
  if (bookingCheck.active) {
    const chatMsg = bookingCheck.chatId ? `::${bookingCheck.chatId}` : '';
    throw new Error(`No se pueden modificar los datos mientras hay un servicio activo.${chatMsg}`);
  }

  // Log history
  await client.execute({
    sql: 'insert into owner_profile_history (user_id, change_summary, full_payload, created_at) values (?, ?, ?, ?)',
    args: [userId, 'Perfil de dueño actualizado', JSON.stringify(payload), now],
  });

  if (payload.email) {
    await client.execute({
      sql: 'update users set email = ? where id = ?',
      args: [payload.email, userId],
    });
  }

  await client.execute({
    sql: `insert into owner_profile_extra(
      user_id, full_name, email, primary_phone, alternative_phone, cedula, address, zone, biometric_selfie, display_name, bio, is_verified, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(user_id) do update set
      full_name=excluded.full_name,
      email=excluded.email,
      primary_phone=excluded.primary_phone,
      alternative_phone=excluded.alternative_phone,
      cedula=excluded.cedula,
      address=excluded.address,
      zone=excluded.zone,
      biometric_selfie=excluded.biometric_selfie,
      display_name=excluded.display_name,
      bio=excluded.bio,
      updated_at=excluded.updated_at`,
    args: [
      userId,
      payload.fullName,
      payload.email,
      payload.primaryPhone,
      payload.alternativePhone,
      payload.cedula,
      payload.address,
      payload.zone,
      payload.biometricSelfie,
      payload.displayName || '',
      payload.bio || '',
      0,
      now,
    ],
  });

  await client.execute({
    sql: `insert into owner_emergency(user_id, nombre, relacion, direccion, telefono, updated_at)
    values (?, ?, ?, ?, ?, ?)
    on conflict(user_id) do update set
      nombre=excluded.nombre,
      relacion=excluded.relacion,
      direccion=excluded.direccion,
      telefono=excluded.telefono,
      updated_at=excluded.updated_at`,
    args: [
      userId,
      payload.emergencyContact.name,
      payload.emergencyContact.relationship,
      payload.emergencyContact.address,
      payload.emergencyContact.phone,
      now,
    ],
  });

  await client.execute({
    sql: `insert into owner_location(user_id, lat, lng, direccion_detallada, updated_at)
    values (?, ?, ?, ?, ?)
    on conflict(user_id) do update set
      lat=excluded.lat,
      lng=excluded.lng,
      direccion_detallada=excluded.direccion_detallada,
      updated_at=excluded.updated_at`,
    args: [userId, payload.locationLat, payload.locationLng, payload.addressDetail, now],
  });

  await client.execute({
    sql: 'delete from owner_refs where user_id = ?',
    args: [userId],
  });

  if (payload.personalReferences) {
    for (const ref of payload.personalReferences) {
      await client.execute({
        sql: 'insert into owner_refs(user_id, kind, nombre, telefono, relacion) values (?, ?, ?, ?, ?)',
        args: [userId, 'personal', ref.name, ref.phone, ref.relationship],
      });
    }
  }

  if (payload.familyReferences) {
    for (const ref of payload.familyReferences) {
      await client.execute({
        sql: 'insert into owner_refs(user_id, kind, nombre, telefono, relacion) values (?, ?, ?, ?, ?)',
        args: [userId, 'familiar', ref.name, ref.phone, ref.relationship],
      });
    }
  }
};

export const saveOwnerProfilePhoto = async (userId: string, photoUrl: string) => {
  await ensureOwnerSchema();
  const client = getTursoClient();
  const now = new Date().toISOString();

  // Check for active services
  const bookingCheck = await hasActiveBooking(client, userId);
  if (bookingCheck.active) {
    const chatMsg = bookingCheck.chatId ? `::${bookingCheck.chatId}` : '';
    throw new Error(`No se pueden modificar los datos mientras hay un servicio activo.${chatMsg}`);
  }

  // Get previous photo for cleanup
  const prevRes = await client.execute({
    sql: 'select profile_photo from owner_profile_extra where user_id = ? limit 1',
    args: [userId],
  });
  const prevPhoto = prevRes.rows[0]?.profile_photo as string | undefined;

  // Log history
  await client.execute({
    sql: 'insert into owner_profile_history (user_id, change_summary, full_payload, created_at) values (?, ?, ?, ?)',
    args: [userId, 'Foto de perfil de dueño actualizada', JSON.stringify({ photoUrl }), now],
  });

  await client.execute({
    sql: `insert into owner_profile_extra(user_id, profile_photo, updated_at) values (?, ?, ?)
    on conflict(user_id) do update set profile_photo=excluded.profile_photo, updated_at=excluded.updated_at`,
    args: [userId, photoUrl, now],
  });

  // Cleanup old photo
  if (prevPhoto && prevPhoto !== photoUrl) {
    await deleteFile(prevPhoto);
  }
};

const mapPetRow = (row: any): OwnerPetRecord => ({
  id: row.id as string,
  ownerId: row.owner_id as string,
  name: row.name ?? '',
  species: row.species ?? '',
  breed: row.breed ?? '',
  photo: row.photo ?? '',
  age: Number(row.age ?? 0),
  sex: row.sex ?? '',
  weight: Number(row.weight ?? 0),
  size: row.size ?? '',
  behavior: row.behavior ? String(row.behavior).split(',').map((s) => s.trim()).filter(Boolean) : [],
  medicalConditions: row.medical_conditions ?? '',
  allergies: row.allergies ?? '',
  vaccinationCard: row.vaccination_card ?? '',
  hasIdTag: Boolean(row.has_id_tag ?? 0),
  active: Boolean(row.active ?? 1),
});

export const listOwnerPets = async (userId: string): Promise<OwnerPetRecord[]> => {
  await ensureOwnerSchema();
  const client = getTursoClient();
  const result = await client.execute({
    sql: 'select * from owner_pet_profiles where owner_id = ? order by updated_at desc',
    args: [userId],
  });
  return result.rows.map(mapPetRow);
};

export const getOwnerPetById = async (petId: string): Promise<OwnerPetRecord | null> => {
  await ensureOwnerSchema();
  const client = getTursoClient();
  const result = await client.execute({
    sql: 'select * from owner_pet_profiles where id = ? limit 1',
    args: [petId],
  });
  if (!result.rows.length) return null;
  return mapPetRow(result.rows[0]);
};

export const saveOwnerPet = async (userId: string, payload: OwnerPetPayload) => {
  await ensureOwnerSchema();
  const client = getTursoClient();
  const now = new Date().toISOString();

  // Check for active services
  const bookingCheck = await hasActiveBooking(client, userId);
  if (bookingCheck.active) {
    const chatMsg = bookingCheck.chatId ? `::${bookingCheck.chatId}` : '';
    throw new Error(`No se pueden modificar los datos mientras hay un servicio activo.${chatMsg}`);
  }

  // Log history
  await client.execute({
    sql: 'insert into owner_profile_history (user_id, change_summary, full_payload, created_at) values (?, ?, ?, ?)',
    args: [userId, `Mascota ${payload.id ? 'actualizada' : 'registrada'}: ${payload.name}`, JSON.stringify(payload), now],
  });

  const petId = payload.id || `pet_${randomUUID()}`;
  const behavior = payload.behavior?.length ? payload.behavior.join(',') : '';

  // Get previous files for cleanup if updating
  let oldPhoto = '';
  let oldVaccine = '';
  if (payload.id) {
    const prevRes = await client.execute({
      sql: 'select photo, vaccination_card from owner_pet_profiles where id = ? limit 1',
      args: [payload.id],
    });
    const row = prevRes.rows[0] as any;
    oldPhoto = row?.photo ?? '';
    oldVaccine = row?.vaccination_card ?? '';
  }

  await client.execute({
    sql: `insert into owner_pet_profiles(
      id, owner_id, name, species, breed, photo, age, sex, weight, size, behavior,
      medical_conditions, allergies, vaccination_card, has_id_tag, active, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(id) do update set
      name=excluded.name,
      species=excluded.species,
      breed=excluded.breed,
      photo=excluded.photo,
      age=excluded.age,
      sex=excluded.sex,
      weight=excluded.weight,
      size=excluded.size,
      behavior=excluded.behavior,
      medical_conditions=excluded.medical_conditions,
      allergies=excluded.allergies,
      vaccination_card=excluded.vaccination_card,
      has_id_tag=excluded.has_id_tag,
      active=excluded.active,
      updated_at=excluded.updated_at`,
    args: [
      petId,
      userId,
      payload.name,
      payload.species,
      payload.breed,
      payload.photo,
      payload.age,
      payload.sex,
      payload.weight,
      payload.size || '',
      behavior,
      payload.medicalConditions,
      payload.allergies,
      payload.vaccinationCard,
      payload.hasIdTag ? 1 : 0,
      payload.active ? 1 : 0,
      now,
    ],
  });

  // Cleanup old files
  if (oldPhoto && oldPhoto !== payload.photo) await deleteFile(oldPhoto);
  if (oldVaccine && oldVaccine !== payload.vaccinationCard) await deleteFile(oldVaccine);

  // Since pet update is also a profile change, update owner_profile_extra.updated_at to trigger lock
  await client.execute({
    sql: 'update owner_profile_extra set updated_at = ? where user_id = ?',
    args: [now, userId],
  });

  // Backward compatibility: If the owner is also a caregiver, upate their first pet in caregiver_profiles
  const firstPetRes = await client.execute({
    sql: 'select name, photo from owner_pet_profiles where owner_id = ? and active = 1 order by updated_at asc limit 1',
    args: [userId],
  });
  if (firstPetRes.rows.length > 0) {
    const firstPet = firstPetRes.rows[0] as any;
    await client.execute({
      sql: 'update caregiver_profiles set own_pet_name = ?, own_pet_photo = ?, updated_at = ? where user_id = ?',
      args: [firstPet.name, firstPet.photo, now, userId],
    });
  }

  return petId;
};

export const deleteOwnerPet = async (userId: string, petId: string) => {
  await ensureOwnerSchema();
  const client = getTursoClient();
  const now = new Date().toISOString();

  // Check for active services
  const bookingCheck = await hasActiveBooking(client, userId);
  if (bookingCheck.active) {
    const chatMsg = bookingCheck.chatId ? `::${bookingCheck.chatId}` : '';
    throw new Error(`No se pueden modificar los datos mientras hay un servicio activo.${chatMsg}`);
  }

  // Get files for cleanup before deleting
  const petRes = await client.execute({
    sql: 'select photo, vaccination_card from owner_pet_profiles where id = ? and owner_id = ? limit 1',
    args: [petId, userId],
  });
  const pet = petRes.rows[0] as any;

  // Log history
  await client.execute({
    sql: 'insert into owner_profile_history (user_id, change_summary, full_payload, created_at) values (?, ?, ?, ?)',
    args: [userId, `Mascota eliminada: ${petId}`, JSON.stringify({ petId }), now],
  });

  await client.execute({
    sql: 'delete from owner_pet_profiles where id = ? and owner_id = ?',
    args: [petId, userId],
  });

  // Cleanup files
  if (pet?.photo) await deleteFile(pet.photo);
  if (pet?.vaccination_card) await deleteFile(pet.vaccination_card);

  // Update profile updated_at to trigger lock
  await client.execute({
    sql: 'update owner_profile_extra set updated_at = ? where user_id = ?',
    args: [now, userId],
  });

  // Backward compatibility sync
  const firstPetRes = await client.execute({
    sql: 'select name, photo from owner_pet_profiles where owner_id = ? and active = 1 order by updated_at asc limit 1',
    args: [userId],
  });
  if (firstPetRes.rows.length > 0) {
    const firstPet = firstPetRes.rows[0] as any;
    await client.execute({
      sql: 'update caregiver_profiles set own_pet_name = ?, own_pet_photo = ?, updated_at = ? where user_id = ?',
      args: [firstPet.name, firstPet.photo, now, userId],
    });
  } else {
    // If no pets left, clear the legacy fields
    await client.execute({
      sql: 'update caregiver_profiles set own_pet_name = ?, own_pet_photo = ?, updated_at = ? where user_id = ?',
      args: ['', '', now, userId],
    });
  }
};

export const listOwnerReviews = async (userId: string): Promise<OwnerReviewRecord[]> => {
  if (!userId) return [];
  await ensureOwnerSchema();
  const client = getTursoClient();
  const result = await client.execute({
    sql: `select r.*, cp.name as reviewer_name
      from owner_reviews r
      left join caregiver_profiles cp on cp.user_id = r.reviewer_id
      where r.owner_id = ?
      order by r.date desc`,
    args: [userId],
  });
  return result.rows.map((row: any) => ({
    id: row.id as string,
    ownerId: row.owner_id as string,
    reviewerId: row.reviewer_id ?? '',
    reviewerName: String(row.reviewer_name ?? '').trim() || (row.reviewer_id ?? ''),
    rating: Number(row.rating ?? 0),
    comment: row.comment ?? '',
    date: row.date ?? '',
    petName: row.pet_name ?? '',
  })) as OwnerReviewRecord[];
};

export const listOwnerServices = async (userId: string): Promise<ServiceRequestRecord[]> => {
  await ensureOwnerSchema();
  const client = getTursoClient();
  const result = await client.execute({
    sql: 'select * from service_requests where owner_id = ? order by created_at desc',
    args: [userId],
  });
  return result.rows.map((row: any) => ({
    id: row.id as string,
    petId: row.pet_id as string,
    ownerId: row.owner_id as string,
    caregiverId: row.caregiver_id as string,
    startDate: row.start_date ?? '',
    endDate: row.end_date ?? '',
    status: row.status ?? '',
    ownerRating: row.owner_rating ?? undefined,
    ownerReview: row.owner_review ?? undefined,
    caregiverRating: row.caregiver_rating ?? undefined,
    caregiverReview: row.caregiver_review ?? undefined,
    price: Number(row.price ?? 0),
  })) as ServiceRequestRecord[];
};

export const rateOwnerService = async (userId: string, stars: number, comment: string) => {
  await ensureOwnerSchema();
  const client = getTursoClient();
  const now = new Date().toISOString();
  const result = await client.execute({
    sql: `select id from service_requests
      where owner_id = ? and status = 'completed' and owner_rating is null
      order by end_date desc limit 1`,
    args: [userId],
  });
  const row = result.rows[0] as any;
  if (!row) return { ok: false, reason: 'no_pending' } as const;

  await client.execute({
    sql: 'update service_requests set owner_rating = ?, owner_review = ?, updated_at = ? where id = ?',
    args: [Math.min(5, Math.max(1, stars)), comment || 'Buen servicio', now, row.id as string],
  });
  return { ok: true } as const;
};

export const addOwnerReview = async (ownerId: string, reviewerId: string, rating: number, comment: string, petName?: string) => {
  await ensureOwnerSchema();
  const client = getTursoClient();
  const now = new Date().toISOString();
  const id = `rev_${randomUUID()}`;
  await client.execute({
    sql: 'insert into owner_reviews(id, owner_id, reviewer_id, rating, comment, date, pet_name, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)',
    args: [
      id,
      ownerId,
      reviewerId,
      Math.min(5, Math.max(1, rating)),
      comment || 'Buen servicio',
      now,
      petName ?? '',
      now,
    ],
  });

  const stats = await client.execute({
    sql: 'select avg(rating) as avg_rating, count(1) as total from owner_reviews where owner_id = ?',
    args: [ownerId],
  });
  const row = stats.rows[0] as any;
  await client.execute({
    sql: 'update owner_profile_extra set rating = ?, total_reviews = ?, updated_at = ? where user_id = ?',
    args: [Number(row?.avg_rating ?? 0), Number(row?.total ?? 0), now, ownerId],
  });
  return { ok: true } as const;
};

export const getOwnerDashboardData = async (userId: string): Promise<OwnerDashboardData> => {
  const [profile, pets, reviews, services] = await Promise.all([
    getOwnerProfileByUserId(userId),
    listOwnerPets(userId),
    listOwnerReviews(userId),
    listOwnerServices(userId),
  ]);

  if (!profile) {
    throw new Error('No se encontró el perfil del dueño.');
  }

  return { profile, pets, reviews, services };
};
