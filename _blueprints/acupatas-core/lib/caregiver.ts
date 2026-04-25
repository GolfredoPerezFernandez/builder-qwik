import { getTursoClient } from './turso';
import { ensureAuthSchema } from './auth';
import { ensureServiceSchema } from './services';
import { ensureOwnerSchema } from './owner';
import { deleteFile } from './upload';
import { getCaracasTime, getCaracasDate } from './utils';

export type CaregiverReview = {
  user: string;
  rating: number;
  comment: string;
  date: string;
};

export type CaregiverRecord = {
  id: string;
  name: string;
  zone: string;
  pricePerDay: number;
  rating: number;
  verified: boolean;
  accepts: string[];
  sizes: string[];
  services: {
    alojamiento: boolean;
    visita: boolean;
    paseo: boolean;
  };
  multiplePets: boolean;
  petLimit?: number;
  bio: string;
  photos: string[];
  ownPetPhoto?: string;
  ownPetName?: string;
  availability: Record<string, boolean>;
  reviews: CaregiverReview[];
  photo?: string;
  hasOwnPet: boolean;
  lat?: number;
  lng?: number;
  activePets?: number;
};

export type CaregiverDashboardData = {
  profile: {
    verified: boolean;
    verifiedLabel: string;
    completeness: number;
    avatar?: string;
    name: string;
    bio: string;
    accepts: string[];
    dogSizes: string[];
    multiPet: boolean;
    petLimit: number;
    zone: string;
    pricePerDay: number;
    services: {
      alojamiento: boolean;
      visita: boolean;
      paseo: boolean;
    };
    photos: string[];
    hasOwnPet: boolean;
    ownPetPhoto?: string;
    ownPetName?: string;
    ownPetSpecies?: string;
    ownPetBreed?: string;
    ownPetAge?: number;
    ownPetVaccinated?: boolean;
    fullName?: string;
    cedula?: string;
    primaryPhone?: string;
    alternativePhone?: string;
    pets: import('./owner').OwnerPetRecord[];
  };
  kpis: {
    ratingAvg: number;
    jobsDone: number;
    revenue30d: number;
  };
  reviews: CaregiverReview[];
  bookings: {
    id: string;
    petName: string;
    ownerName?: string;
    type: string;
    dateFrom: string;
    dateTo: string;
    amountUSD: number;
    status: string;
    feeReference?: string;
    feeValidated?: number;
  }[];
  availability: Record<string, boolean>;
  bank: {
    name: string;
    titular: string;
    rif: string;
    paymobile: string;
    verified: boolean;
  };
  security: {
    biometria: boolean;
    googleAuth: boolean;
  };
  background: {
    uploaded: boolean;
    filename: string;
  };
};

const normalizeListValue = (value: unknown) => String(value ?? '').trim();

const uniqueNormalizedList = (items: unknown[]) => {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const item of items) {
    const normalized = normalizeListValue(item);
    if (!normalized) continue;
    const key = normalized.toLocaleLowerCase('es-VE');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(normalized);
  }

  return unique;
};

const getPetIdsFromValue = (value: unknown): string[] => {
  return Array.from(new Set(String(value ?? '').split(',').map((id) => id.trim()).filter(Boolean)));
};

export const ensureCaregiverSchema = async () => {
  await ensureAuthSchema();
  const client = getTursoClient();
  const statements = [
    `create table if not exists caregiver_profiles (
      user_id text primary key,
      verified integer default 0,
      verified_label text,
      completeness integer,
      avatar text,
      name text,
      bio text,
      zone text,
      price_per_day real,
      multi_pet integer,
      pet_limit integer default 1,
      has_own_pet integer,
      own_pet_photo text,
      own_pet_name text,
      rating_avg real,
      jobs_done integer,
      revenue_30d real,
      created_at text,
      updated_at text
    );`,
    `create table if not exists caregiver_accepts (
      id integer primary key autoincrement,
      user_id text not null,
      species text not null
    );`,
    `create table if not exists caregiver_dog_sizes (
      id integer primary key autoincrement,
      user_id text not null,
      size text not null
    );`,
    `create table if not exists caregiver_services (
      user_id text primary key,
      alojamiento integer default 1,
      visita integer default 0,
      paseo integer default 0,
      updated_at text
    );`,
    `create table if not exists caregiver_photos (
      id text primary key,
      user_id text not null,
      url text,
      position integer,
      created_at text
    );`,
    `create table if not exists caregiver_availability (
      id integer primary key autoincrement,
      user_id text not null,
      date text not null,
      available integer default 1
    );`,
    `create table if not exists caregiver_reviews (
      id text primary key,
      caregiver_id text not null,
      reviewer_id text,
      rating integer,
      comment text,
      date text,
      created_at text
    );`,
    `create table if not exists caregiver_bank (
      user_id text primary key,
      bank_name text,
      titular text,
      rif text,
      paymobile text,
      verified integer default 0,
      updated_at text
    );`,
    `create table if not exists caregiver_security (
      user_id text primary key,
      biometria integer default 0,
      google_auth integer default 0,
      updated_at text
    );`,
    `create table if not exists caregiver_background (
      user_id text primary key,
      file_name text,
      uploaded integer default 0,
      updated_at text
    );`,
    `create table if not exists caregiver_profile_history (
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

  // Migration: add own_pet_name column if missing (for older databases)
  try {
    await client.execute(`alter table caregiver_profiles add column own_pet_name text`);
  } catch {
    // Column already exists, ignore error
  }

  // Migration: add pet_limit column if missing
  try {
    await client.execute(`alter table caregiver_profiles add column pet_limit integer default 1`);
  } catch {
    // Column already exists, ignore error
  }
};

const toListMap = (rows: any[], key: string, value: string) => {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const id = row[key] as string;
    if (!map.has(id)) map.set(id, []);
    map.get(id)!.push(row[value] as string);
  }
  return map;
};

export const listCaregiversFull = async (): Promise<CaregiverRecord[]> => {
  await ensureCaregiverSchema();
  const client = getTursoClient();

  const [profilesRes, acceptsRes, sizesRes, servicesRes, photosRes, availabilityRes, reviewsRes, activePetsRes] = await Promise.all([
    client.execute(`
      select cp.*, ol.lat, ol.lng
      from caregiver_profiles cp
      left join owner_location ol on ol.user_id = cp.user_id
    `),
    client.execute('select user_id, species from caregiver_accepts'),
    client.execute('select user_id, size from caregiver_dog_sizes'),
    client.execute('select user_id, alojamiento, visita, paseo from caregiver_services'),
    client.execute('select user_id, url, position from caregiver_photos order by position asc'),
    client.execute('select user_id, date, available from caregiver_availability'),
    client.execute(
      `select cr.caregiver_id, cr.reviewer_id, cr.rating, cr.comment, cr.date,
        coalesce(op.full_name, op.display_name) as reviewer_name
      from caregiver_reviews cr
      left join owner_profile_extra op on op.user_id = cr.reviewer_id
      order by cr.date desc`
    ),
    client.execute({
      sql: `select caregiver_id, sum(case when pet_id is null or pet_id = '' then 0 else length(pet_id) - length(replace(pet_id, ',', '')) + 1 end) as active_count
      from bookings
      where status in ('requested', 'accepted', 'paid', 'payment_sent', 'payment_confirmed', 'fee_submitted', 'active', 'in_progress')
        and substr(date_from, 1, 10) <= ? 
        and substr(date_to, 1, 10) >= ?
      group by caregiver_id`,
      args: [
        getCaracasDate(),
        getCaracasDate(),
      ],
    }),
  ]);

  const acceptsMap = toListMap(acceptsRes.rows as any[], 'user_id', 'species');
  const sizesMap = toListMap(sizesRes.rows as any[], 'user_id', 'size');
  const photosMap = toListMap(photosRes.rows as any[], 'user_id', 'url');
  const servicesMap = new Map<string, { alojamiento: boolean; visita: boolean; paseo: boolean }>();
  for (const row of servicesRes.rows as any[]) {
    servicesMap.set(row.user_id as string, {
      alojamiento: Boolean(row.alojamiento ?? 0),
      visita: Boolean(row.visita ?? 0),
      paseo: Boolean(row.paseo ?? 0),
    });
  }

  const availabilityMap = new Map<string, Record<string, boolean>>();
  for (const row of availabilityRes.rows as any[]) {
    const id = row.user_id as string;
    if (!availabilityMap.has(id)) availabilityMap.set(id, {});
    availabilityMap.get(id)![row.date] = Boolean(row.available ?? 1);
  }

  const reviewsMap = new Map<string, CaregiverReview[]>();
  for (const row of reviewsRes.rows as any[]) {
    const id = row.caregiver_id as string;
    if (!reviewsMap.has(id)) reviewsMap.set(id, []);
    reviewsMap.get(id)!.push({
      user: row.reviewer_name ?? row.reviewer_id ?? 'Usuario',
      rating: Number(row.rating ?? 0),
      comment: row.comment ?? '',
      date: row.date ?? '',
    });
  }

  const activePetsMap = new Map<string, number>();
  for (const row of activePetsRes.rows as any[]) {
    activePetsMap.set(row.caregiver_id as string, Number(row.active_count ?? 0));
  }

  return (profilesRes.rows as any[]).map((row) => {
    const id = row.user_id as string;
    const photos = photosMap.get(id) || [];
    const srv = servicesMap.get(id);
    const services = (srv && (srv.alojamiento || srv.visita || srv.paseo))
      ? srv
      : { alojamiento: true, visita: false, paseo: false };
    return {
      id,
      name: row.name ?? 'Cuidador',
      zone: row.zone ?? '',
      pricePerDay: Number(row.price_per_day ?? 0),
      rating: Number(row.rating_avg ?? 0),
      verified: Boolean(row.verified ?? 0),
      accepts: uniqueNormalizedList(acceptsMap.get(id) || []),
      sizes: uniqueNormalizedList(sizesMap.get(id) || []),
      services,
      multiplePets: Boolean(row.multi_pet ?? 0),
      petLimit: Number(row.pet_limit || 1),
      bio: row.bio ?? '',
      photos,
      ownPetPhoto: row.own_pet_photo ?? undefined,
      ownPetName: row.own_pet_name ?? undefined,
      availability: availabilityMap.get(id) || {},
      reviews: reviewsMap.get(id) || [],
      photo: row.avatar ?? photos[0] ?? undefined,
      hasOwnPet: Boolean(row.has_own_pet ?? 0),
      lat: row.lat ? Number(row.lat) : undefined,
      lng: row.lng ? Number(row.lng) : undefined,
      activePets: activePetsMap.get(id) ?? 0,
    } as CaregiverRecord;
  });
};

export const getCaregiverById = async (caregiverId: string): Promise<CaregiverRecord | null> => {
  await ensureCaregiverSchema();
  const client = getTursoClient();

  const [profilesRes, acceptsRes, sizesRes, servicesRes, photosRes, availabilityRes, reviewsRes, activePetsRes] = await Promise.all([
    client.execute({
      sql: `
        select cp.*, ol.lat, ol.lng
        from caregiver_profiles cp
        left join owner_location ol on ol.user_id = cp.user_id
        where cp.user_id = ?
      `,
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
      sql: 'select alojamiento, visita, paseo from caregiver_services where user_id = ?',
      args: [caregiverId],
    }),
    client.execute({
      sql: 'select url, position from caregiver_photos where user_id = ? order by position asc',
      args: [caregiverId],
    }),
    client.execute({
      sql: 'select date, available from caregiver_availability where user_id = ?',
      args: [caregiverId],
    }),
    client.execute({
      sql: `select cr.reviewer_id, cr.rating, cr.comment, cr.date,
        coalesce(op.full_name, op.display_name) as reviewer_name
      from caregiver_reviews cr
      left join owner_profile_extra op on op.user_id = cr.reviewer_id
      where cr.caregiver_id = ?
      order by cr.date desc`,
      args: [caregiverId],
    }),
    client.execute({
      sql: `select sum(case when pet_id is null or pet_id = '' then 0 else length(pet_id) - length(replace(pet_id, ',', '')) + 1 end) as active_count
      from bookings
      where caregiver_id = ?
        and status in ('requested', 'accepted', 'paid', 'payment_sent', 'payment_confirmed', 'fee_submitted', 'active', 'in_progress')
        and substr(date_from, 1, 10) <= ? 
        and substr(date_to, 1, 10) >= ?`,
      args: [
        caregiverId,
        getCaracasDate(),
        getCaracasDate(),
      ],
    }),
  ]);

  const row = profilesRes.rows[0];
  if (!row) return null;

  const photos = photosRes.rows.map((r: any) => r.url as string);
  const srv = servicesRes.rows[0] as any;
  const services = (srv && (srv.alojamiento || srv.visita || srv.paseo))
    ? {
      alojamiento: Boolean(srv.alojamiento ?? 0),
      visita: Boolean(srv.visita ?? 0),
      paseo: Boolean(srv.paseo ?? 0),
    }
    : { alojamiento: true, visita: false, paseo: false };

  const availability: Record<string, boolean> = {};
  for (const r of availabilityRes.rows as any[]) {
    availability[r.date] = Boolean(r.available ?? 1);
  }

  const reviews = reviewsRes.rows.map((r: any) => ({
    user: r.reviewer_name ?? r.reviewer_id ?? 'Usuario',
    rating: Number(r.rating ?? 0),
    comment: r.comment ?? '',
    date: r.date ?? '',
  }));

  return {
    id: caregiverId,
    name: row.name ?? 'Cuidador',
    zone: row.zone ?? '',
    pricePerDay: Number(row.price_per_day ?? 0),
    rating: Number(row.rating_avg ?? 0),
    verified: Boolean(row.verified ?? 0),
    accepts: uniqueNormalizedList(acceptsRes.rows.map((r: any) => r.species as string)),
    sizes: uniqueNormalizedList(sizesRes.rows.map((r: any) => r.size as string)),
    services,
    multiplePets: Boolean(row.multi_pet ?? 0),
    petLimit: Number(row.pet_limit || 1),
    bio: row.bio ?? '',
    photos,
    ownPetPhoto: row.own_pet_photo ?? undefined,
    ownPetName: row.own_pet_name ?? undefined,
    availability,
    reviews,
    photo: row.avatar ?? photos[0] ?? undefined,
    hasOwnPet: Boolean(row.has_own_pet ?? 0),
    lat: row.lat ? Number(row.lat) : undefined,
    lng: row.lng ? Number(row.lng) : undefined,
    activePets: Number((activePetsRes.rows[0] as any)?.active_count ?? 0),
  } as CaregiverRecord;
};

export const getCaregiverDashboardData = async (userId: string): Promise<CaregiverDashboardData> => {
  await ensureCaregiverSchema();
  await ensureServiceSchema();
  await ensureOwnerSchema();
  const client = getTursoClient();

  const [
    profileRes,
    ownerProfileRes,
    acceptsRes,
    sizesRes,
    servicesRes,
    photosRes,
    availabilityRes,
    reviewsRes,
    bankRes,
    securityRes,
    backgroundRes,
    bookingsRes,
    petsRes,
    bookingPetsRes,
  ] = await Promise.all([
    client.execute({ sql: 'select * from caregiver_profiles where user_id = ? limit 1', args: [userId] }),
    client.execute({ sql: 'select full_name, cedula, primary_phone, alternative_phone, zone, address from owner_profile_extra where user_id = ? limit 1', args: [userId] }),
    client.execute({ sql: 'select species from caregiver_accepts where user_id = ?', args: [userId] }),
    client.execute({ sql: 'select size from caregiver_dog_sizes where user_id = ?', args: [userId] }),
    client.execute({ sql: 'select alojamiento, visita, paseo from caregiver_services where user_id = ? limit 1', args: [userId] }),
    client.execute({ sql: 'select url from caregiver_photos where user_id = ? order by position asc', args: [userId] }),
    client.execute({ sql: 'select date, available from caregiver_availability where user_id = ?', args: [userId] }),
    client.execute({
      sql: `select cr.reviewer_id, cr.rating, cr.comment, cr.date,
        coalesce(op.full_name, op.display_name) as reviewer_name
      from caregiver_reviews cr
      left join owner_profile_extra op on op.user_id = cr.reviewer_id
      where cr.caregiver_id = ?
      order by cr.date desc`,
      args: [userId],
    }),
    client.execute({ sql: 'select bank_name, titular, rif, paymobile, verified from caregiver_bank where user_id = ? limit 1', args: [userId] }),
    client.execute({ sql: 'select biometria, google_auth from caregiver_security where user_id = ? limit 1', args: [userId] }),
    client.execute({ sql: 'select file_name, uploaded from caregiver_background where user_id = ? limit 1', args: [userId] }),
    client.execute({
      sql: `select b.*, o.full_name as owner_name
        from bookings b
        left join owner_profile_extra o on o.user_id = b.owner_id
        where b.caregiver_id = ?
        order by b.date_from desc`,
      args: [userId],
    }),
    client.execute({ sql: 'select * from owner_pet_profiles where owner_id = ? order by updated_at desc', args: [userId] }),
    client.execute({
      sql: `select id, name
        from owner_pet_profiles
        where owner_id in (
          select distinct owner_id from bookings where caregiver_id = ?
        )`,
      args: [userId],
    }),
  ]);

  const profile = profileRes.rows[0] as any;
  const ownerProfile = ownerProfileRes.rows[0] as any;
  const servicesRow = servicesRes.rows[0] as any;
  const bankRow = bankRes.rows[0] as any;
  const securityRow = securityRes.rows[0] as any;
  const backgroundRow = backgroundRes.rows[0] as any;
  const ownPetRow = petsRes.rows[0] as any;
  const bookingPetsById = new Map((bookingPetsRes.rows as any[]).map((row) => [String(row.id), String(row.name ?? '')]));

  const availability: Record<string, boolean> = {};
  for (const row of availabilityRes.rows as any[]) {
    availability[row.date as string] = Boolean(row.available ?? 1);
  }

  const reviews = (reviewsRes.rows as any[]).map((row) => ({
    user: row.reviewer_name ?? row.reviewer_id ?? 'Usuario',
    rating: Number(row.rating ?? 0),
    comment: row.comment ?? '',
    date: row.date ?? '',
  })) as CaregiverReview[];

  const bookings = (bookingsRes.rows as any[]).map((row) => {
    const petIds = getPetIdsFromValue(row.pet_id);
    const petNames = petIds.map((petId) => bookingPetsById.get(petId) || '').filter(Boolean);
    const petName = petNames.length > 1
      ? petNames.join(', ')
      : petNames[0] || (petIds.length > 1 ? `${petIds.length} mascotas` : 'Mascota');

    return {
      id: row.id as string,
      petName,
      ownerName: row.owner_name ?? '',
      type: row.service ?? '',
      dateFrom: row.date_from ?? '',
      dateTo: row.date_to ?? '',
      amountUSD: Number(row.amount_usd ?? 0),
      status: row.status ?? '',
      feeReference: (row.fee_reference || '').trim(),
      feeValidated: Number(row.fee_validated || 0),
    };
  });

  const verified = Boolean(profile?.verified ?? 0);
  const verifiedLabel = profile?.verified_label ?? (verified ? 'Verificado' : 'No verificado');

  return {
    profile: {
      verified,
      verifiedLabel,
      completeness: Number(profile?.completeness ?? 0),
      avatar: profile?.avatar ?? '',
      name: profile?.name ?? ownerProfile?.full_name ?? '',
      bio: profile?.bio ?? '',
      accepts: uniqueNormalizedList((acceptsRes.rows as any[]).map((row) => row.species)),
      dogSizes: uniqueNormalizedList((sizesRes.rows as any[]).map((row) => row.size)),
      multiPet: Boolean(profile?.multi_pet ?? 0),
      petLimit: Number(profile?.pet_limit || 1),
      zone: profile?.zone ?? ownerProfile?.zone ?? ownerProfile?.address ?? '',
      pricePerDay: Number(profile?.price_per_day ?? 0),
      services: (servicesRow && (servicesRow.alojamiento || servicesRow.visita || servicesRow.paseo))
        ? {
          alojamiento: Boolean(servicesRow.alojamiento ?? 0),
          visita: Boolean(servicesRow.visita ?? 0),
          paseo: Boolean(servicesRow.paseo ?? 0),
        }
        : { alojamiento: true, visita: false, paseo: false },
      photos: (photosRes.rows as any[]).map((row) => row.url ?? ''),
      hasOwnPet: Boolean(profile?.has_own_pet ?? 0),
      ownPetPhoto: profile?.own_pet_photo ?? ownPetRow?.photo ?? '',
      ownPetName: profile?.own_pet_name ?? ownPetRow?.name ?? '',
      ownPetSpecies: ownPetRow?.species ?? '',
      ownPetBreed: ownPetRow?.breed ?? '',
      ownPetAge: petsRes.rows[0]?.age ? Number(petsRes.rows[0].age) : undefined,
      ownPetVaccinated: Boolean(ownPetRow?.vaccination_card ?? ''),
      fullName: ownerProfile?.full_name ?? '',
      cedula: ownerProfile?.cedula ?? '',
      primaryPhone: ownerProfile?.primary_phone ?? '',
      alternativePhone: ownerProfile?.alternative_phone ?? '',
      pets: (petsRes.rows as any[]).map((row) => ({
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
      })),
    },
    kpis: {
      ratingAvg: Number(profile?.rating_avg ?? 0),
      jobsDone: Number(profile?.jobs_done ?? 0),
      revenue30d: Number(profile?.revenue_30d ?? 0),
    },
    reviews,
    bookings,
    availability,
    bank: {
      name: bankRow?.bank_name ?? '',
      titular: bankRow?.titular ?? '',
      rif: bankRow?.rif ?? '',
      paymobile: bankRow?.paymobile ?? '',
      verified: Boolean(bankRow?.verified ?? 0),
    },
    security: {
      biometria: Boolean(securityRow?.biometria ?? 0),
      googleAuth: Boolean(securityRow?.google_auth ?? 0),
    },
    background: {
      uploaded: Boolean(backgroundRow?.uploaded ?? 0),
      filename: backgroundRow?.file_name ?? '',
    },
  };
};

export const updateCaregiverProfile = async (userId: string, payload: {
  name: string;
  bio: string;
  zone: string;
  pricePerDay: number;
  multiPet: boolean;
  petLimit: number;
  accepts: string[];
  dogSizes: string[];
  hasOwnPet: boolean;
  ownPetPhoto?: string;
  ownPetName?: string;
  ownPetSpecies?: string;
  ownPetBreed?: string;
  ownPetAge?: number;
  ownPetVaccinated?: boolean;
}) => {
  await ensureCaregiverSchema();
  const client = getTursoClient();
  const now = new Date().toISOString();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
  const normalizedAccepts = uniqueNormalizedList(payload.accepts);
  const normalizedDogSizes = uniqueNormalizedList(payload.dogSizes);

  await ensureServiceSchema();
  // Check for active services
  const activeBooking = await client.execute({
    sql: "select id from bookings where (owner_id = ? or caregiver_id = ?) and status in ('accepted', 'paid', 'payment_sent', 'payment_confirmed', 'fee_submitted', 'active', 'in_progress') and date_from <= ? and date_to >= ? limit 1",
    args: [userId, userId, today, today],
  });

  if (activeBooking.rows.length > 0) {
    throw new Error('No se pueden modificar los datos mientras hay un servicio activo.');
  }

  // Get old ownPetPhoto for cleanup
  const prevProfile = await client.execute({
    sql: 'select own_pet_photo from caregiver_profiles where user_id = ? limit 1',
    args: [userId],
  });
  const oldPetPhoto = prevProfile.rows[0]?.own_pet_photo as string | undefined;

  // Log history
  await client.execute({
    sql: 'insert into caregiver_profile_history (user_id, change_summary, full_payload, created_at) values (?, ?, ?, ?)',
    args: [
      userId,
      'Perfil del cuidador actualizado',
      JSON.stringify({ ...payload, accepts: normalizedAccepts, dogSizes: normalizedDogSizes }),
      now,
    ],
  });

  await client.execute({
    sql: `insert into caregiver_profiles(
      user_id, name, bio, zone, price_per_day, multi_pet, pet_limit, has_own_pet, own_pet_photo, own_pet_name, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(user_id) do update set
      name=excluded.name,
      bio=excluded.bio,
      zone=excluded.zone,
      price_per_day=excluded.price_per_day,
      multi_pet=excluded.multi_pet,
      pet_limit=excluded.pet_limit,
      has_own_pet=excluded.has_own_pet,
      own_pet_photo=excluded.own_pet_photo,
      own_pet_name=excluded.own_pet_name,
      updated_at=excluded.updated_at`,
    args: [
      userId,
      payload.name,
      payload.bio,
      payload.zone,
      payload.pricePerDay,
      payload.multiPet ? 1 : 0,
      payload.petLimit || 1,
      payload.hasOwnPet ? 1 : 0,
      payload.ownPetPhoto ?? '',
      payload.ownPetName ?? '',
      now,
    ],
  });

  // Cleanup old pet photo
  if (oldPetPhoto && oldPetPhoto !== payload.ownPetPhoto) {
    await deleteFile(oldPetPhoto);
  }

  await client.execute({ sql: 'delete from caregiver_accepts where user_id = ?', args: [userId] });
  for (const species of normalizedAccepts) {
    await client.execute({
      sql: 'insert into caregiver_accepts(user_id, species) values (?, ?)',
      args: [userId, species],
    });
  }

  await client.execute({ sql: 'delete from caregiver_dog_sizes where user_id = ?', args: [userId] });
  for (const size of normalizedDogSizes) {
    await client.execute({
      sql: 'insert into caregiver_dog_sizes(user_id, size) values (?, ?)',
      args: [userId, size],
    });
  }

  // owner_pet_profiles is now updated independently via saveOwnerPet
  return;
};

export const updateCaregiverServices = async (userId: string, payload: {
  alojamiento: boolean;
  visita: boolean;
  paseo: boolean;
  pricePerDay: number;
  zone: string;
}) => {
  await ensureCaregiverSchema();
  const client = getTursoClient();
  const now = new Date().toISOString();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });

  if (payload.pricePerDay < 10) {
    throw new Error('El precio mínimo por día es de $10 USD.');
  }

  await ensureServiceSchema();
  // Check for active services
  const activeBooking = await client.execute({
    sql: "select id from bookings where (owner_id = ? or caregiver_id = ?) and status in ('accepted', 'paid', 'payment_sent', 'payment_confirmed', 'fee_submitted', 'active', 'in_progress') and date_from <= ? and date_to >= ? limit 1",
    args: [userId, userId, today, today],
  });

  if (activeBooking.rows.length > 0) {
    throw new Error('No se pueden modificar los datos mientras hay un servicio activo.');
  }

  // Log history
  await client.execute({
    sql: 'insert into caregiver_profile_history (user_id, change_summary, full_payload, created_at) values (?, ?, ?, ?)',
    args: [userId, 'Servicios del cuidador actualizados', JSON.stringify(payload), now],
  });

  console.log('updateCaregiverServices payload:', payload);

  await client.execute({
    sql: `insert into caregiver_services(user_id, alojamiento, visita, paseo, updated_at)
      values (?, ?, ?, ?, ?)
      on conflict(user_id) do update set
        alojamiento=excluded.alojamiento,
        visita=excluded.visita,
        paseo=excluded.paseo,
        updated_at=excluded.updated_at`,
    args: [userId, payload.alojamiento ? 1 : 0, payload.visita ? 1 : 0, payload.paseo ? 1 : 0, now],
  });

  await client.execute({
    sql: `insert into caregiver_profiles(user_id, price_per_day, zone, updated_at)
      values (?, ?, ?, ?)
      on conflict(user_id) do update set
        price_per_day=excluded.price_per_day,
        zone=excluded.zone,
        updated_at=excluded.updated_at`,
    args: [userId, payload.pricePerDay, payload.zone, now],
  });
};

export const setCaregiverAvailability = async (userId: string, date: string, available: boolean) => {
  await ensureCaregiverSchema();
  const client = getTursoClient();
  await client.execute({
    sql: 'delete from caregiver_availability where user_id = ? and date = ?',
    args: [userId, date],
  });
  await client.execute({
    sql: 'insert into caregiver_availability(user_id, date, available) values (?, ?, ?)',
    args: [userId, date, available ? 1 : 0],
  });
};

export const saveCaregiverPhoto = async (userId: string, position: number, url: string) => {
  await ensureCaregiverSchema();
  const client = getTursoClient();
  const now = new Date().toISOString();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });

  await ensureServiceSchema();
  // Check for active services
  const activeBooking = await client.execute({
    sql: "select id from bookings where (owner_id = ? or caregiver_id = ?) and status in ('accepted', 'paid', 'payment_sent', 'payment_confirmed', 'fee_submitted', 'active', 'in_progress') and date_from <= ? and date_to >= ? limit 1",
    args: [userId, userId, today, today],
  });

  if (activeBooking.rows.length > 0) {
    throw new Error('No se pueden modificar los datos mientras hay un servicio activo.');
  }

  // Log history
  await client.execute({
    sql: 'insert into caregiver_profile_history (user_id, change_summary, full_payload, created_at) values (?, ?, ?, ?)',
    args: [userId, 'Foto de galería actualizada', JSON.stringify({ position, url }), now],
  });

  const id = `photo_${userId}_${position}`;

  // Get old photo for cleanup
  const prevPhotoRes = await client.execute({
    sql: 'select url from caregiver_photos where id = ? limit 1',
    args: [id],
  });
  const oldPhoto = prevPhotoRes.rows[0]?.url as string | undefined;

  await client.execute({
    sql: `insert into caregiver_photos(id, user_id, url, position, created_at)
      values (?, ?, ?, ?, ?)
      on conflict(id) do update set
        url=excluded.url,
        position=excluded.position`,
    args: [id, userId, url, position, now],
  });

  // Cleanup old photo
  if (oldPhoto && oldPhoto !== url) {
    await deleteFile(oldPhoto);
  }
};

export const saveCaregiverAvatar = async (userId: string, url: string) => {
  await ensureCaregiverSchema();
  const client = getTursoClient();
  const now = new Date().toISOString();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });

  await ensureServiceSchema();
  // Check for active services
  const activeBooking = await client.execute({
    sql: "select id from bookings where (owner_id = ? or caregiver_id = ?) and status in ('accepted', 'paid', 'payment_sent', 'payment_confirmed', 'fee_submitted', 'active', 'in_progress') and date_from <= ? and date_to >= ? limit 1",
    args: [userId, userId, today, today],
  });

  if (activeBooking.rows.length > 0) {
    throw new Error('No se pueden modificar los datos mientras hay un servicio activo.');
  }

  // Log history
  await client.execute({
    sql: 'insert into caregiver_profile_history (user_id, change_summary, full_payload, created_at) values (?, ?, ?, ?)',
    args: [userId, 'Avatar de cuidador actualizado', JSON.stringify({ url }), now],
  });

  // Get old avatar for cleanup
  const prevAvatarRes = await client.execute({
    sql: 'select avatar from caregiver_profiles where user_id = ? limit 1',
    args: [userId],
  });
  const oldAvatar = prevAvatarRes.rows[0]?.avatar as string | undefined;

  await client.execute({
    sql: `insert into caregiver_profiles(user_id, avatar, updated_at)
      values (?, ?, ?)
      on conflict(user_id) do update set
        avatar=excluded.avatar,
        updated_at=excluded.updated_at`,
    args: [userId, url, now],
  });

  // Cleanup old avatar
  if (oldAvatar && oldAvatar !== url) {
    deleteFile(oldAvatar);
  }
};

export const updateBookingStatus = async (userId: string, bookingId: string, status: string) => {
  await ensureServiceSchema();
  const client = getTursoClient();
  await client.execute({
    sql: 'update bookings set status = ?, updated_at = ? where id = ? and caregiver_id = ?',
    args: [status, new Date().toISOString(), bookingId, userId],
  });
};

export const submitCaregiverVerification = async (userId: string) => {
  await ensureCaregiverSchema();
  const client = getTursoClient();
  await client.execute({
    sql: 'update caregiver_profiles set verified_label = ?, updated_at = ? where user_id = ?',
    args: ['En validación', new Date().toISOString(), userId],
  });
};

export const addCaregiverReview = async (caregiverId: string, reviewerId: string, rating: number, comment: string) => {
  await ensureCaregiverSchema();
  const client = getTursoClient();
  const now = new Date().toISOString();
  const id = `rev_${crypto.randomUUID()}`;
  await client.execute({
    sql: `insert into caregiver_reviews(id, caregiver_id, reviewer_id, rating, comment, date, created_at)
      values (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, caregiverId, reviewerId, Math.min(5, Math.max(1, rating)), comment || 'Buen servicio', now, now],
  });

  const stats = await client.execute({
    sql: 'select avg(rating) as avg_rating, count(1) as total from caregiver_reviews where caregiver_id = ?',
    args: [caregiverId],
  });
  const row = stats.rows[0] as any;
  await client.execute({
    sql: 'update caregiver_profiles set rating_avg = ?, jobs_done = ?, updated_at = ? where user_id = ?',
    args: [Number(row?.avg_rating ?? 0), Number(row?.total ?? 0), now, caregiverId],
  });
  return { ok: true } as const;
};
