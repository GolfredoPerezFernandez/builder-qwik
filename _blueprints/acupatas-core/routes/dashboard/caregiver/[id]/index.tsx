import { component$, useSignal, useTask$, $ } from '@builder.io/qwik';
import { ImageWithRetry } from '~/components/ui/image-with-retry';
import { routeLoader$, server$, useNavigate } from '@builder.io/qwik-city';
import type { DocumentHead } from '@builder.io/qwik-city';
import { getCaregiverById } from '../../../../lib/caregiver';
import { getSessionFromEvent } from '../../../../lib/auth';
import { getOwnerProfileByUserId } from '../../../../lib/owner';
import { createChat } from '../../../../lib/chat';
import { LeafletMap } from '../../../../components/leaflet-map';
import type { LocationsProps } from '../../../../models/location';
import { normalizeImageUrl } from '../../../../lib/upload-utils';

export const useCaregiverProfile = routeLoader$(async (event) => {
  const id = event.params.id;
  if (!id) return { caregiver: null, userLocation: null };

  const session = await getSessionFromEvent(event);
  let userLocation = null;

  if (session) {
    const ownerProfile = await getOwnerProfileByUserId(session.userId);
    if (ownerProfile && ownerProfile.locationLat && ownerProfile.locationLng) {
      userLocation = { lat: Number(ownerProfile.locationLat), lng: Number(ownerProfile.locationLng) };
    }
  }

  const profile = await getCaregiverById(id);
  const normalizedProfile = profile
    ? {
      ...profile,
      photo: normalizeImageUrl(profile.photo),
      ownPetPhoto: normalizeImageUrl(profile.ownPetPhoto),
      photos: (profile.photos || []).map((photo) => normalizeImageUrl(photo)).filter(Boolean),
    }
    : profile;

  return { caregiver: normalizedProfile, userLocation };
});

const deg2rad = (deg: number) => deg * (Math.PI / 180);

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

const formatReviewDate = (value: string) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
};

const openChat = server$(async function (caregiverId: string) {
  const session = await getSessionFromEvent(this);
  if (!session) return { ok: false, reason: 'no_session' } as const;
  try {
    return await createChat(session.userId, caregiverId);
  } catch {
    return { ok: false, reason: 'db_error' } as const;
  }
});

export default component$(() => {
  const data = useCaregiverProfile();
  const nav = useNavigate();
  const notFound = useSignal(false);
  const toast = useSignal('');
  const isOpeningChat = useSignal(false);
  const calendarDate = useSignal(new Date());

  const profileValue = data.value.caregiver;
  const userLocation = data.value.userLocation;

  // Calculate distance
  let distanceKm: number | null = null;
  if (profileValue && profileValue.lat && profileValue.lng && userLocation) {
    distanceKm = getDistanceKm(userLocation.lat, userLocation.lng, profileValue.lat, profileValue.lng);
  }

  // Location signal
  const location = useSignal<LocationsProps>({
    point: [0, 0],
    zoom: 16,
    marker: true,
  });

  useTask$(({ track }) => {
    track(() => data.value);
    notFound.value = !data.value.caregiver;
    if (data.value.caregiver && data.value.caregiver.lat && data.value.caregiver.lng) {
      location.value = {
        point: [data.value.caregiver.lat, data.value.caregiver.lng],
        zoom: 16,
        marker: true,
      };
    }
  });

  if (notFound.value) {
    return (
      <div class="min-h-screen grid place-items-center">
        <div class="text-center">
          <h2 class="text-2xl font-bold text-[#4a2e85]">Cuidador no encontrado</h2>
          <p class="mt-2 text-sm text-[#4a2e85b3]">Revisa la URL o vuelve al listado de cuidadores.</p>
        </div>
      </div>
    );
  }

  const profile = data.value.caregiver!;
  const availability = Object.entries(profile.availability || {})
    .filter(([, available]) => available)
    .map(([date]) => date)
    .sort();
  const availabilitySet = new Set(availability);

  const monthBaseDate = new Date(calendarDate.value.getFullYear(), calendarDate.value.getMonth(), 1);
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
  const weekStartsOnMondayOffset = (monthBaseDate.getDay() + 6) % 7;
  const gridStartDate = new Date(monthBaseDate.getFullYear(), monthBaseDate.getMonth(), 1 - weekStartsOnMondayOffset);
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStartDate);
    date.setDate(gridStartDate.getDate() + index);
    return date;
  });
  const calendarMonthLabel = new Intl.DateTimeFormat('es-CO', {
    month: 'long',
    year: 'numeric',
  }).format(monthBaseDate);

  const goPrevMonth = $(() => {
    const current = calendarDate.value;
    calendarDate.value = new Date(current.getFullYear(), current.getMonth() - 1, 1);
  });

  const goNextMonth = $(() => {
    const current = calendarDate.value;
    calendarDate.value = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  });

  const hasLocation = !!(profile.lat && profile.lng);
  const totalCapacity = Math.max(1, Number(profile.petLimit || 1));
  const occupiedSlots = Math.max(0, Number(profile.activePets || 0));
  const availableSlots = Math.max(0, totalCapacity - occupiedSlots);

  const handleOpenChat = $(async () => {
    toast.value = '';

    isOpeningChat.value = true;
    try {
      const result = await openChat(profile.id);
      if (!result.ok) {
        if (result.reason === 'no_session') {
          toast.value = 'Debes iniciar sesión para reservar con este cuidador.';
        } else if (result.reason === 'owner_active_service_single_pet') {
          toast.value = 'Ya tienes un servicio activo con otro cuidador.';
        } else if (result.reason === 'caregiver_commission_pending_validation') {
          toast.value = 'El cuidador tiene un pago de comisión pendiente por validar.';
        } else if (result.reason === 'pet_active_with_other') {
          toast.value = 'Tu mascota ya tiene un servicio activo con otro cuidador.';
        } else {
          toast.value = 'No se pudo abrir el chat. Intenta nuevamente en unos segundos.';
        }
        isOpeningChat.value = false;
        return;
      }
      await nav(`/dashboard/chat/${result.id}`);
      isOpeningChat.value = false;
    } catch (e) {
      toast.value = 'Error al intentar abrir el chat.';
      isOpeningChat.value = false;
    }
  });

  return (
    <div class="min-h-screen bg-[#f6f6f6]">
      <div class="max-w-6xl mx-auto py-10 px-4 sm:px-6">
        {toast.value && (
          <div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 text-sm">
            {toast.value}
          </div>
        )}
        <div class="bg-white rounded-2xl p-6 lg:p-8 border border-[#4a2e85]/10">
          <div class="grid grid-cols-1 lg:grid-cols-[auto_minmax(0,1fr)_280px] gap-6 items-start">
            <div class="h-24 w-24 rounded-xl bg-[#4a2e85]/10 overflow-hidden">
              {profile.photo ? (
                <ImageWithRetry
                  src={profile.photo}
                  alt={profile.name}
                  width={96}
                  height={96}
                  layout="constrained"
                  class="h-full w-full object-cover"
                />
              ) : (
                <div class="h-full w-full grid place-items-center text-sm text-[#4a2e85b3]">Sin foto</div>
              )}
            </div>
            <div class="flex-1">
              <h1 class="text-2xl font-extrabold text-[#4a2e85] flex items-center flex-wrap gap-2">
                <span>{profile.name}</span>
                {profile.verified && (
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold shadow-sm">
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                    </svg>
                    Verificado
                  </span>
                )}
                {profile.hasOwnPet && (
                  <span class="px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-700 text-[9px] font-bold uppercase tracking-tighter">Tiene mascota</span>
                )}
              </h1>
              {profile.zone && (
                <div class="mt-2 flex items-start gap-2 text-sm bg-[#4a2e85]/5 rounded-lg px-3 py-2">
                  <svg class="w-4 h-4 text-[#4a2e85] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <div>
                    <span class="text-[10px] uppercase font-bold text-[#4a2e85]/60 block">Dirección</span>
                    <span class="text-[#4a2e85]">{profile.zone}</span>
                    {distanceKm !== null && (
                      <span class="ml-2 font-semibold text-[#ef7c43]">({distanceKm.toFixed(1)} km de ti)</span>
                    )}
                  </div>
                </div>
              )}
              <div class="mt-2 flex items-center gap-2">
                <div class="inline-flex items-center gap-1 text-[#ef7c43]">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <svg
                      key={i}
                      class={`w-4 h-4 ${i < Math.round(profile.rating) ? 'text-[#ef7c43]' : 'text-[#e2d9f2]'}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <div class="text-sm text-[#4a2e85b3]">{profile.rating.toFixed(1)} • {profile.photos?.length ?? 0} fotos</div>
              </div>
              <div class="mt-4">
                <h3 class="text-lg font-semibold text-[#4a2e85]">Sobre mí</h3>
                <p class="mt-2 text-sm text-[#4a2e85b3]">{profile.bio || 'El cuidador no ha completado su biografía.'}</p>
              </div>
            </div>
            <div class="text-right lg:text-left">
              <div class="text-sm text-[#4a2e85b3]">Precio por día</div>
              <div class="text-xl font-bold text-[#4a2e85]">${Math.max(profile.pricePerDay, 10)}</div>
              <div class="mt-3 grid grid-cols-1 gap-2 text-left">
                <div class="rounded-lg border border-[#4a2e85]/15 bg-[#4a2e85]/5 px-3 py-2">
                  <div class="text-[10px] uppercase font-bold tracking-wider text-[#4a2e85]/70">Capacidad de mascotas</div>
                  <div class="text-sm font-bold text-[#4a2e85]">{totalCapacity}</div>
                  <div class="text-[11px] text-[#4a2e85b3]">{occupiedSlots}/{totalCapacity} ocupados</div>
                </div>
                <div class="rounded-lg border border-[#ef7c43]/20 bg-[#ef7c43]/10 px-3 py-2">
                  <div class="text-[10px] uppercase font-bold tracking-wider text-[#ef7c43]">Cupos disponibles</div>
                  <div class="text-sm font-bold text-[#4a2e85]">{availableSlots}</div>
                </div>
              </div>
              {availability.length > 0 && (
                <button
                  class={`mt-3 w-full sm:w-auto min-w-[170px] px-5 py-3 rounded-xl bg-gradient-to-r from-[#4a2e85] to-[#ef7c43] text-white font-extrabold tracking-wide shadow-lg shadow-[#4a2e85]/25 hover:shadow-xl hover:scale-[1.02] transition-all flex items-center justify-center gap-2 ring-2 ring-[#4a2e85]/10 ${isOpeningChat.value ? 'opacity-70 cursor-not-allowed hover:scale-100' : ''}`}
                  onClick$={handleOpenChat}
                  data-no-loader="true"
                  disabled={isOpeningChat.value}
                >
                  {isOpeningChat.value ? 'Abriendo chat...' : 'Reservar ahora'}
                </button>
              )}
              {availability.length > 0 && (
                <p class="mt-2 text-[11px] font-semibold text-[#ef7c43]">Disponible para agendar hoy</p>
              )}
            </div>
          </div>

          <div class="mt-6 grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)] gap-6 items-start">
            <div class="space-y-6">
              {profile.hasOwnPet && (
                <div>
                  <h3 class="text-lg font-semibold text-[#4a2e85]">Mi mascota: {profile.ownPetName || 'Compañero/a'}</h3>
                  <div class="mt-3 flex items-center gap-4 p-4 rounded-2xl bg-[#4a2e85]/5 border border-[#4a2e85]/10">
                    <div class="h-20 w-20 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                      {profile.ownPetPhoto ? (
                        <ImageWithRetry
                          src={profile.ownPetPhoto}
                          alt={profile.ownPetName || 'Mi mascota'}
                          width={80}
                          height={80}
                          layout="constrained"
                          class="h-full w-full object-cover"
                        />
                      ) : (
                        <div class="h-full w-full grid place-items-center text-[10px] text-[#4a2e85b3] text-center p-2">Sin foto</div>
                      )}
                    </div>
                    <div class="text-sm text-[#4a2e85b3]">
                      <p class="font-medium text-[#4a2e85]">El cuidador tiene a {profile.ownPetName || 'una mascota propia'}.</p>
                      <p class="mt-1">Esto significa que tu mascota convivirá con ella durante el servicio.</p>
                    </div>
                  </div>
                </div>
              )}

              {hasLocation && (
                <div>
                  <h3 class="text-lg font-semibold text-[#4a2e85] mb-2">Ubicación aproximada</h3>
                  <div class="h-64 w-full rounded-xl overflow-hidden border border-[#4a2e85]/10">
                    <LeafletMap location={location} />
                  </div>
                </div>
              )}

              <div>
                <h4 class="text-sm font-semibold text-[#4a2e85]">Servicios</h4>
                <ul class="mt-2 flex gap-2 flex-wrap">
                  {Object.entries(profile.services || {}).map(([k, v]) => {
                    if (!v) return null;
                    const label = k === 'alojamiento' ? 'Alojamiento'
                      : k === 'visita' ? 'Visita a domicilio'
                        : k === 'paseo' ? 'Paseo'
                          : k;
                    return <li key={k} class="px-2 py-1 rounded bg-[#4a2e85]/5 text-sm text-[#4a2e85] border border-[#4a2e85]/15">{label}</li>;
                  })}
                </ul>
              </div>

              <div>
                <h4 class="text-sm font-semibold text-[#4a2e85]">Acepta</h4>
                <div class="mt-2 text-sm text-[#4a2e85b3]">{(profile.accepts && profile.accepts.join(', ')) || 'No especificado'}</div>
              </div>

              <div>
                <h4 class="text-sm font-semibold text-[#4a2e85]">Tamaños aceptados</h4>
                <div class="mt-2 text-sm text-[#4a2e85b3]">{(profile.sizes && profile.sizes.join(', ')) || 'No especificado'}</div>
              </div>

              <div>
                <h4 class="text-sm font-semibold text-[#4a2e85]">Disponibilidad</h4>
                <div class="mt-3 rounded-2xl border border-[#4a2e85]/10 bg-white overflow-hidden">
                  <div class="flex items-center justify-between px-3 py-2 bg-[#4a2e85]/5 border-b border-[#4a2e85]/10">
                    <button
                      type="button"
                      class="h-8 w-8 rounded-full border border-[#4a2e85]/15 text-[#4a2e85] hover:bg-[#4a2e85]/10 transition-colors"
                      onClick$={goPrevMonth}
                      aria-label="Mes anterior"
                    >
                      ‹
                    </button>
                    <div class="text-sm font-bold text-[#4a2e85] capitalize">{calendarMonthLabel}</div>
                    <button
                      type="button"
                      class="h-8 w-8 rounded-full border border-[#4a2e85]/15 text-[#4a2e85] hover:bg-[#4a2e85]/10 transition-colors"
                      onClick$={goNextMonth}
                      aria-label="Mes siguiente"
                    >
                      ›
                    </button>
                  </div>

                  <div class="grid grid-cols-7 gap-1 p-3 bg-gradient-to-br from-[#f7f3ff] via-white to-[#fff5ef]">
                    {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((dayName) => (
                      <div key={dayName} class="text-[11px] font-semibold text-[#4a2e85b3] text-center py-1">
                        {dayName}
                      </div>
                    ))}

                    {calendarDays.map((day) => {
                      const year = day.getFullYear();
                      const month = `${day.getMonth() + 1}`.padStart(2, '0');
                      const date = `${day.getDate()}`.padStart(2, '0');
                      const dayKey = `${year}-${month}-${date}`;
                      const isCurrentMonth = day.getMonth() === monthBaseDate.getMonth();
                      const isAvailable = availabilitySet.has(dayKey);
                      const isPastDay = dayKey < todayKey;
                      const isAvailableFuture = isAvailable && !isPastDay;

                      return (
                        <div
                          key={dayKey}
                          class={`relative h-11 rounded-xl border text-xs flex items-center justify-center font-semibold select-none ${isAvailableFuture
                            ? 'border-[#ef7c43]/40 text-[#4a2e85] bg-[#fff7f3]'
                            : isAvailable && isPastDay
                              ? 'border-[#4a2e85]/10 text-[#4a2e85]/35 bg-[#f5f5f7]'
                              : isCurrentMonth
                                ? 'border-[#4a2e85]/10 text-[#4a2e85]/75 bg-white'
                                : 'border-transparent text-[#4a2e85]/30 bg-[#ffffff80]'
                            }`}
                        >
                          <span class="relative z-10">{day.getDate()}</span>
                          {isAvailableFuture && <span class="absolute right-1 bottom-0.5 text-[10px] opacity-70">🐾</span>}
                          {isAvailable && isPastDay && <span class="absolute right-1 bottom-0.5 text-[10px] opacity-40">🐾</span>}
                        </div>
                      );
                    })}
                  </div>

                  <div class="px-3 pb-3 space-y-2">
                    <div class="text-[12px] text-[#4a2e85b3] flex items-center gap-2">
                      <span class="inline-flex h-2.5 w-2.5 rounded-full bg-[#ef7c43]"></span>
                      <span>Días disponibles para agendar</span>
                    </div>
                    <div class="text-[11px] text-[#4a2e85]/60">Los días marcados con 🐾 están disponibles desde hoy en adelante.</div>
                  </div>
                </div>
              </div>
            </div>

            <aside class="p-4 bg-[#fafafa] rounded-lg border border-[#4a2e85]/5 h-fit lg:sticky lg:top-6">
              <div class="text-sm text-[#4a2e85b3]">Verificación</div>
              <div class="mt-1 font-semibold text-[#4a2e85]">{profile.verified ? 'Verificado' : 'No verificado'}</div>
              <div class="mt-4">
                <h5 class="text-sm font-medium text-[#4a2e85]">Últimas reseñas</h5>
                <div class="mt-2 space-y-2">
                  {(profile.reviews || []).slice(0, 3).map((r, index) => (
                    <div key={`${r.user}-${r.date}-${index}`} class="border-b border-[#4a2e85]/10 pb-2 last:border-b-0">
                      <div class="flex items-center justify-between gap-2">
                        <span class="text-sm font-semibold text-[#4a2e85]">{r.user || 'Usuario'}</span>
                        <span class="text-[11px] text-[#4a2e85]/60">{formatReviewDate(r.date)}</span>
                      </div>
                      <div class="mt-1 flex items-center gap-1 text-[#ef7c43]">
                        {Array.from({ length: 5 }).map((_, starIndex) => (
                          <svg
                            key={starIndex}
                            class={`h-3.5 w-3.5 ${starIndex < Math.round(r.rating || 0) ? 'text-[#ef7c43]' : 'text-[#e2d9f2]'}`}
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        ))}
                        <span class="ml-1 text-[11px] font-semibold text-[#4a2e85]/70">{Number(r.rating || 0).toFixed(1)}</span>
                      </div>
                      <p class="mt-1 text-sm text-[#4a2e85b3]">{r.comment || 'Sin comentario.'}</p>
                    </div>
                  ))}
                  {(profile.reviews || []).length === 0 && <div class="text-sm text-[#4a2e85b3]">Sin reseñas</div>}
                </div>
              </div>
            </aside>
          </div>

          <div class="mt-6">
            <h4 class="text-sm font-semibold text-[#4a2e85]">Espacio de cuidado</h4>
            <div class="mt-3 grid grid-cols-3 gap-2">
              {(profile.photos || []).map((p, i) => (
                <ImageWithRetry key={i} src={p} alt={`foto-${i}`} width={200} height={112} layout="constrained" class="h-28 w-full object-cover rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Cuidador',
};
