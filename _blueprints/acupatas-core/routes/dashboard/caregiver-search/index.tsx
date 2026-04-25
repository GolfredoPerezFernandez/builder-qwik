import { component$, useStore, $ } from '@builder.io/qwik';
import { ImageWithRetry } from '~/components/ui/image-with-retry';
import { Link, routeLoader$, server$, useNavigate } from '@builder.io/qwik-city';
import { getSessionFromEvent } from '../../../lib/auth';
import { listOwnerPets, getOwnerProfileByUserId } from '../../../lib/owner';
import { listCaregiversFull, type CaregiverRecord } from '../../../lib/caregiver';
import { createChat } from '../../../lib/chat';
import { normalizeImageUrl } from '../../../lib/upload-utils';
import { getCaracasTime } from '../../../lib/utils';

import { getTursoClient } from '../../../lib/turso';

export const useCaregiverSearch = routeLoader$(async (event) => {
  const session = await getSessionFromEvent(event);
  if (!session) return { caregivers: [], pets: [] as { id: string; name: string; species: string }[], userLat: null, userLng: null };
  const [caregivers, pets, profile] = await Promise.all([
    listCaregiversFull(),
    listOwnerPets(session.userId),
    getOwnerProfileByUserId(session.userId),
  ]);

  // Filter out caregivers with commissions still pending validation.
  // We block if:
  // 1. Status is payment_confirmed, completed, or fee_submitted (traditional flow).
  // 2. Status is paid or payment_sent (intermediate flow where transaction started).
  // 3. Status is active or in_progress BUT the end date has already passed.
  const client = getTursoClient();
  const now = getCaracasTime(); // getCaracasDate() would also work for YYYY-MM-DD
  const blockedCommissions = await client.execute({
    sql: `
      select distinct caregiver_id from bookings
      where (
        status in ('payment_confirmed', 'completed', 'fee_submitted', 'paid', 'payment_sent')
        or (status in ('active', 'in_progress') and substr(date_to, 1, 10) < ?)
      )
      and coalesce(fee_validated, 0) = 0
    `,
    args: [now.slice(0, 10)],
  });

  const blockedIds = new Set(blockedCommissions.rows.map((r: any) => r.caregiver_id as string));
  const availableCaregivers = caregivers.filter(c => !blockedIds.has(c.id));

  const caregiversWithNormalizedImages = availableCaregivers.map((caregiver) => ({
    ...caregiver,
    photo: normalizeImageUrl(caregiver.photo),
    ownPetPhoto: normalizeImageUrl(caregiver.ownPetPhoto),
    photos: (caregiver.photos || []).map((photo) => normalizeImageUrl(photo)).filter(Boolean),
  }));

  return {
    caregivers: caregiversWithNormalizedImages,
    pets: pets.map((p) => ({ id: p.id, name: p.name, species: p.species })),
    userLat: profile?.locationLat ? Number(profile.locationLat) : null,
    userLng: profile?.locationLng ? Number(profile.locationLng) : null,
  };
});

const openChat = server$(async function (caregiverId: string, petId?: string) {
  const session = await getSessionFromEvent(this);
  if (!session) return { ok: false, reason: 'no_session' } as const;
  return await createChat(session.userId, caregiverId, petId);
});

const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
};

const deg2rad = (deg: number) => deg * (Math.PI / 180);

export default component$(() => {
  const data = useCaregiverSearch();
  const nav = useNavigate();

  const state = useStore({
    filters: {
      location: '',
      petType: '',
      size: '',
      ratingMin: 0,
      multiplePets: false,
      excludeFull: true,
      priceMin: 0,
      priceMax: 999,
      sortBy: 'distance', // Default sort
    },
    selectedPetId: data.value.pets[0]?.id || '',
    toast: '',
    loadingChatId: '',
    loadingProfileId: '',
  });

  const filtered = () => {
    let result = data.value.caregivers
      .filter((c) => (!state.filters.location ? true : c.zone.toLowerCase().includes(state.filters.location.toLowerCase())))
      .filter((c) => (!state.filters.petType ? true : c.accepts.includes(state.filters.petType)))
      .filter((c) => (!state.filters.size ? true : c.sizes.includes(state.filters.size)))
      .filter((c) => (!state.filters.multiplePets ? true : c.multiplePets))
      .filter((c) => (!state.filters.excludeFull ? true : (c.activePets ?? 0) < (c.petLimit ?? 1)))
      .filter((c) => c.rating >= state.filters.ratingMin)
      .filter((c) => c.pricePerDay >= state.filters.priceMin && c.pricePerDay <= state.filters.priceMax);

    // Calculate distances
    result = result.map(c => {
      let dist = 99999;
      if (data.value.userLat && data.value.userLng && c.lat && c.lng) {
        dist = getDistanceKm(data.value.userLat, data.value.userLng, c.lat, c.lng);
      }
      return { ...c, _distance: dist };
    });

    // Sort
    return result.sort((a: any, b: any) => {
      if (state.filters.sortBy === 'distance') {
        return a._distance - b._distance;
      }
      // Default ranking sort
      return (b.rating === a.rating ? a.pricePerDay - b.pricePerDay : b.rating - a.rating);
    });
  };

  const handleOpenChat = $(async (caregiver: CaregiverRecord) => {
    state.toast = '';
    if (!state.selectedPetId) {
      state.toast = 'Debes seleccionar una mascota para continuar.';
      return;
    }
    state.loadingChatId = caregiver.id;
    const result = await openChat(caregiver.id, state.selectedPetId);
    state.loadingChatId = '';

    if (!result.ok) {
      if (result.reason === 'owner_active_service_single_pet') {
        state.toast = 'Ya tienes un servicio activo con otro cuidador.';
      } else if (result.reason === 'caregiver_commission_pending_validation') {
        state.toast = 'El cuidador tiene un pago de comisión pendiente por validar.';
      } else if (result.reason === 'pet_active_with_other') {
        state.toast = 'Tu mascota ya tiene un servicio activo con otro cuidador.';
      } else {
        state.toast = 'No se pudo abrir el chat.';
      }
      return;
    }
    await nav(`/dashboard/chat/${result.id}`);
  });

  const handleProfileClick = $(async (id: string, e: Event) => {
    // Optional: could manually nav or just let Link work, but user asked for loaders.
    // If we use Link, it's hard to show loader unless we intercept.
    // Let's use onClick and manual nav to show loader.
    e.preventDefault();
    state.loadingProfileId = id;
    await nav(`/dashboard/caregiver/${id}`);
    // No need to clear loadingProfileId as we navigate away.
  });

  return (
    <div class="min-h-screen bg-[#f6f6f6]">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <header class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h1 class="text-2xl font-extrabold text-[#4a2e85]">Buscar cuidadores</h1>
            <p class="text-sm text-[#4a2e85b3]">Explora cuidadores verificados y abre chats con ellos.</p>
          </div>
          <div class="flex items-center gap-2">
            <Link href="/dashboard/chat" class="px-4 py-2 rounded-lg bg-[#4a2e85]/10 text-[#4a2e85]">Ir a chats</Link>
          </div>
        </header>

        {(!data.value.userLat || !data.value.userLng) && (
          <div class="mb-4 rounded-lg border border-blue-200 bg-blue-50 text-blue-800 px-3 py-2 text-sm flex justify-between items-center">
            <span>Configura tu ubicación en tu perfil para ver la distancia y ordenar por cercanía.</span>
            <Link href="/dashboard/owner" class="font-semibold underline">Ir al perfil</Link>
          </div>
        )}

        {data.value.pets.length === 0 && (
          <div class="mb-4 rounded-xl border border-[#ef7c43]/20 bg-[#ef7c43]/5 text-[#4a2e85] px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
            <div class="flex items-center gap-2">
              <span class="text-xl">🐾</span>
              <span><strong>Aún no tienes mascotas registradas.</strong> Para solicitar un servicio, primero debes agregar una mascota a tu perfil.</span>
            </div>
            <Link href="/dashboard/owner" class="shrink-0 px-4 py-2 rounded-lg bg-[#ef7c43] text-white font-bold hover:bg-[#d66f3a] transition-colors shadow-sm">
              Registrar mascota
            </Link>
          </div>
        )}

        {state.toast && (
          <div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 text-sm">
            {state.toast}
          </div>
        )}

        <section class="bg-white rounded-2xl border border-[#4a2e85]/10 p-4 sm:p-6 mb-6">
          <div class="grid gap-4 md:grid-cols-3">
            <label class="text-sm text-[#4a2e85]">
              Zona
              <input
                class="mt-1 w-full border border-[#4a2e85]/20 rounded-lg px-3 py-2"
                value={state.filters.location}
                onInput$={(e) => (state.filters.location = (e.target as HTMLInputElement).value)}
                placeholder="Ej: Chacao"
              />
            </label>
            <label class="text-sm text-[#4a2e85]">
              Tipo de mascota
              <select
                class="mt-1 w-full border border-[#4a2e85]/20 rounded-lg px-3 py-2"
                value={state.filters.petType}
                onInput$={(e) => (state.filters.petType = (e.target as HTMLSelectElement).value)}
              >
                <option value="">Todas</option>
                <option value="perro">Perro</option>
                <option value="gato">Gato</option>
                <option value="ave">Ave</option>
                <option value="conejo">Conejo</option>
                <option value="cobayo">Cobayo</option>
                <option value="hamster">Hámster</option>
                <option value="otro">Otro</option>
              </select>
            </label>
            <label class="text-sm text-[#4a2e85]">
              Tamaño
              <select
                class="mt-1 w-full border border-[#4a2e85]/20 rounded-lg px-3 py-2"
                value={state.filters.size}
                onInput$={(e) => (state.filters.size = (e.target as HTMLSelectElement).value)}
              >
                <option value="">Todos</option>
                <option value="pequeño">Pequeño</option>
                <option value="mediano">Mediano</option>
                <option value="grande">Grande</option>
              </select>
            </label>
          </div>
          <div class="grid gap-4 md:grid-cols-3 mt-4">
            <label class="text-sm text-[#4a2e85]">
              Ordenar por
              <select
                class="mt-1 w-full border border-[#4a2e85]/20 rounded-lg px-3 py-2"
                value={state.filters.sortBy}
                onInput$={(e) => (state.filters.sortBy = (e.target as HTMLSelectElement).value)}
              >
                <option value="distance">Más cercanos</option>
                <option value="rating">Mejor calificación</option>
              </select>
            </label>
            <label class="text-sm text-[#4a2e85]">
              Precio mínimo
              <input
                type="number"
                class="mt-1 w-full border border-[#4a2e85]/20 rounded-lg px-3 py-2"
                value={state.filters.priceMin}
                onInput$={(e) => (state.filters.priceMin = Number((e.target as HTMLInputElement).value))}
              />
            </label>
            <label class="text-sm text-[#4a2e85]">
              Precio máximo
              <input
                type="number"
                class="mt-1 w-full border border-[#4a2e85]/20 rounded-lg px-3 py-2"
                value={state.filters.priceMax}
                onInput$={(e) => (state.filters.priceMax = Number((e.target as HTMLInputElement).value))}
              />
            </label>
          </div>
          <div class="mt-4 flex flex-wrap items-center gap-3">
            <label class="inline-flex items-center gap-2 text-sm text-[#4a2e85]">
              <input
                type="checkbox"
                checked={state.filters.multiplePets}
                onChange$={(e) => (state.filters.multiplePets = (e.target as HTMLInputElement).checked)}
              />
              Acepta múltiples mascotas
            </label>
            <label class="inline-flex items-center gap-2 text-sm text-[#4a2e85]">
              <input
                type="checkbox"
                checked={state.filters.excludeFull}
                onChange$={(e) => (state.filters.excludeFull = (e.target as HTMLInputElement).checked)}
              />
              Ocultar cuidadores llenos
            </label>
            <label class="text-sm text-[#4a2e85]">
              Mascota para el chat
              <select
                class="ml-2 border border-[#4a2e85]/20 rounded-lg px-3 py-2"
                value={state.selectedPetId}
                onInput$={(e) => (state.selectedPetId = (e.target as HTMLSelectElement).value)}
              >
                <option value="">Sin mascota</option>
                {data.value.pets.map((pet) => (
                  <option key={pet.id} value={pet.id}>{`${pet.name} (${pet.species})`}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered().map((cg: any) => (
            <article key={cg.id} class="bg-white rounded-2xl border border-[#4a2e85]/10 p-4 space-y-3">

              <div class="flex items-center gap-3">
                <div class="h-12 w-12 rounded-full border border-[#4a2e85]/10 overflow-hidden bg-gray-100 flex-shrink-0">
                  {cg.photo ? (
                    <ImageWithRetry
                      src={cg.photo}
                      alt={cg.name}
                      class="h-full w-full object-cover"
                      width={48}
                      height={48}
                      layout="constrained"
                    />
                  ) : (
                    <div class="h-full w-full grid place-items-center text-gray-400">
                      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                    </div>
                  )}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between">
                    <h3 class="font-semibold text-[#4a2e85] truncate">{cg.name}</h3>
                    <div class="flex items-center gap-2">
                      {(cg.activePets ?? 0) >= (cg.petLimit ?? 1) && (
                        <span class="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full flex-shrink-0 shadow-sm">
                          Sin disponibilidad (Lleno)
                        </span>
                      )}
                      {cg.verified && (
                        <span class="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex-shrink-0 shadow-sm">
                          <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                          </svg>
                          Verificado
                        </span>
                      )}
                    </div>
                  </div>
                  <div class="flex items-center gap-1 text-xs text-gray-500">
                    <p class="truncate max-w-[120px]">{cg.zone}</p>
                    {cg._distance < 99999 && (
                      <span class="text-[#ef7c43] font-bold">• a {cg._distance.toFixed(1)} km</span>
                    )}
                  </div>
                </div>
              </div>

              <p class="text-sm text-gray-600 line-clamp-2">{cg.bio || 'Sin biografía disponible.'}</p>
              <div class="flex items-center gap-3 text-sm text-gray-600">
                <span class="font-semibold text-[#4a2e85]">${Math.max(cg.pricePerDay, 10)} USD (Tasa BCV)/día</span>
                <span>★ {cg.rating.toFixed(1)}</span>
              </div>
              <div class="rounded-lg border border-[#4a2e85]/15 bg-[#4a2e85]/5 px-3 py-2 text-[#4a2e85]">
                <div class="font-bold uppercase tracking-wider text-[10px] opacity-70">Capacidad de mascotas</div>
                <div class="font-semibold text-sm">{(cg.activePets ?? 0)} de {Math.max(1, Number(cg.petLimit ?? 1))} ocupados</div>
              </div>
              <div class="flex flex-wrap gap-2 text-xs text-[#4a2e85]">
                {cg.accepts.map((type: string) => (
                  <span key={type} class="px-2 py-1 rounded-full bg-[#4a2e85]/10">{type}</span>
                ))}
              </div>
              <div class="flex gap-2">
                <button
                  class="flex-1 text-center px-3 py-2 rounded-lg border border-[#4a2e85]/20 text-[#4a2e85] flex items-center justify-center gap-2"
                  onClick$={(e) => handleProfileClick(cg.id, e)}
                  data-no-loader="true"
                  disabled={!!state.loadingProfileId || !!state.loadingChatId}
                >
                  {state.loadingProfileId === cg.id ? 'Cargando...' : 'Ver perfil'}
                </button>
                <button
                  class="flex-1 px-3 py-2 rounded-lg bg-[#4a2e85] text-white flex items-center justify-center gap-2 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all"
                  onClick$={() => handleOpenChat(cg)}
                  data-no-loader="true"
                  disabled={!!state.loadingProfileId || !!state.loadingChatId}
                  title={(cg.activePets ?? 0) >= (cg.petLimit ?? 1) ? 'Cuidador sin disponibilidad actual' : ''}
                >
                  {state.loadingChatId === cg.id && <svg class="w-4 h-4 animate-spin text-white" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>}
                  {state.loadingChatId === cg.id ? 'Abriendo...' : 'Abrir chat'}
                </button>
              </div>
            </article>
          ))}
          {filtered().length === 0 && (
            <div class="col-span-full py-16 text-center bg-white rounded-2xl border border-dashed border-[#4a2e85]/20">
              <svg class="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <h3 class="text-lg font-bold text-[#4a2e85]">No encontramos cuidadores</h3>
              <p class="text-gray-500 mt-2">Intenta ajustar tus filtros de búsqueda para ver más opciones disponibles en tu zona.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
});
