import { component$, useStore, useSignal, $, useTask$, type QRL, useVisibleTask$ } from '@builder.io/qwik';
import { ImageWithRetry } from '~/components/ui/image-with-retry';
import { routeLoader$, server$, Link } from '@builder.io/qwik-city';
import { getSessionFromEvent, updateUserEmail } from '../../../lib/auth';
import {
  getCaregiverDashboardData,
  updateCaregiverProfile,
  updateCaregiverServices,
  setCaregiverAvailability,
  saveCaregiverPhoto,
  saveCaregiverAvatar,
  type CaregiverDashboardData,
} from '../../../lib/caregiver';
import { updateServiceStatusByBooking } from '../../../lib/services';
import { uploadImage, resolveUploadUrl } from '../../../lib/upload';
import { resizeImage } from '../../../lib/image-utils';
import { VerificationBadge } from '../../../components/VerificationBadge';
import { getGlobalPendingCommissions } from '../../../lib/services';
import { LuAlertTriangle, LuClock } from '@qwikest/icons/lucide';
import { normalizeImageUrl } from '../../../lib/upload-utils';

const uniqueLabelList = (items: string[]) => {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const item of items) {
    const label = String(item || '').trim();
    if (!label) continue;
    const key = label.toLocaleLowerCase('es-VE');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(label);
  }
  return unique;
};

const normalizeCaregiverProfileImages = (profile: any) => ({
  ...profile,
  avatar: normalizeImageUrl(profile.avatar),
  ownPetPhoto: normalizeImageUrl(profile.ownPetPhoto),
  photos: (profile.photos || []).map((photo: string) => normalizeImageUrl(photo)).filter(Boolean),
  pets: (profile.pets || []).map((pet: any) => ({
    ...pet,
    photo: normalizeImageUrl(pet.photo),
    vaccinationCard: normalizeImageUrl(pet.vaccinationCard),
  })),
});

export const useCaregiverDashboard = routeLoader$(async (event) => {
  const session = await getSessionFromEvent(event);
  if (!session) return null;
  const dashboard = await getCaregiverDashboardData(session.userId);
  const { getUserById } = await import('../../../lib/auth');
  const user = await getUserById(session.userId);
  const pendingCommission = await getGlobalPendingCommissions(session.userId);
  const normalizedDashboard = {
    ...dashboard,
    profile: normalizeCaregiverProfileImages(dashboard.profile),
  };
  return { dashboard: normalizedDashboard, user, pendingCommission } as const;
});

const saveProfileServer = server$(async function (payload: {
  name: string;
  bio: string;
  zone: string;
  pricePerDay: number;
  multiPet: boolean;
  accepts: string[];
  dogSizes: string[];
  hasOwnPet: boolean;
  ownPetPhoto?: string;
  ownPetName?: string;
  ownPetSpecies?: string;
  ownPetBreed?: string;
  ownPetAge?: number;
  ownPetVaccinated?: boolean;
  petLimit?: number;
}) {
  const session = await getSessionFromEvent(this);
  if (!session) return { ok: false, reason: 'no_session' } as const;
  try {
    let limit = payload.petLimit || 1;
    if (limit > 5) limit = 5; // backend enforcement

    const payloadWithLimit = {
      ...payload,
      petLimit: limit,
    };
    await updateCaregiverProfile(session.userId, payloadWithLimit as any);
    return { ok: true } as const;
  } catch (e: any) {
    return { ok: false, reason: e.message || 'Error desconocido' } as const;
  }
});

const saveServicesServer = server$(async function (payload: {
  alojamiento: boolean;
  visita: boolean;
  paseo: boolean;
  pricePerDay: number;
  zone: string;
}) {
  const session = await getSessionFromEvent(this);
  if (!session) return { ok: false, reason: 'no_session' } as const;
  try {
    await updateCaregiverServices(session.userId, payload);
    return { ok: true } as const;
  } catch (e: any) {
    return { ok: false, reason: e.message || 'Error desconocido' } as const;
  }
});

const toggleAvailabilityServer = server$(async function (date: string, available: boolean) {
  const session = await getSessionFromEvent(this);
  if (!session) return { ok: false, reason: 'no_session' } as const;
  await setCaregiverAvailability(session.userId, date, available);
  return { ok: true } as const;
});



const savePhotoServer = server$(async function (position: number, url: string) {
  const session = await getSessionFromEvent(this);
  if (!session) return { ok: false, reason: 'no_session' } as const;
  if (!url) return { ok: false, reason: 'empty' } as const;
  const fullUrl = resolveUploadUrl(this, url);
  await saveCaregiverPhoto(session.userId, position, fullUrl);
  return { ok: true } as const;
});

const saveAvatarServer = server$(async function (url: string) {
  const session = await getSessionFromEvent(this);
  if (!session) return { ok: false, reason: 'no_session' } as const;
  if (!url) return { ok: false, reason: 'empty' } as const;
  const fullUrl = resolveUploadUrl(this, url);
  await saveCaregiverAvatar(session.userId, fullUrl);
  return { ok: true } as const;
});

const saveEmailServer = server$(async function (email: string) {
  const session = await getSessionFromEvent(this);
  if (!session) return { ok: false, reason: 'no_session' } as const;
  await updateUserEmail(session.userId, email);
  return { ok: true } as const;
});

const updateBookingStatusServer = server$(async function (bookingId: string, status: string) {
  const session = await getSessionFromEvent(this);
  if (!session) return { ok: false, reason: 'no_session' } as const;
  return updateServiceStatusByBooking(session.userId, bookingId, status);
});

/** Re-fetch only the dynamic data that changes when the other party acts */
const reloadCaregiverData = server$(async function () {
  const session = await getSessionFromEvent(this);
  if (!session) return null;
  const dashboard = await getCaregiverDashboardData(session.userId);
  const pendingCommission = await getGlobalPendingCommissions(session.userId);
  return {
    bookings: dashboard.bookings,
    reviews: dashboard.reviews,
    kpis: dashboard.kpis,
    pendingCommission,
  };
});



const savePetServer = server$(async function (payload: any) {
  const session = await getSessionFromEvent(this);
  if (!session) return { ok: false, reason: 'no_session' } as const;
  const { saveOwnerPet } = await import('../../../lib/owner');
  try {
    const id = await saveOwnerPet(session.userId, payload);
    return { ok: true, id } as const;
  } catch (e: any) {
    return { ok: false, reason: e.message } as const;
  }
});

const deletePetServer = server$(async function (petId: string) {
  const session = await getSessionFromEvent(this);
  if (!session) return { ok: false, reason: 'no_session' } as const;
  const { deleteOwnerPet } = await import('../../../lib/owner');
  try {
    await deleteOwnerPet(session.userId, petId);
    return { ok: true } as const;
  } catch (e: any) {
    return { ok: false, reason: e.message } as const;
  }
});



export default component$(() => {
  const data = useCaregiverDashboard();
  const toast = useSignal('');
  const containerRef = useSignal<Element>();
  const containerWidth = useSignal(0);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    if (!containerRef.value) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerWidth.value = entry.contentRect.width;
      }
    });
    observer.observe(containerRef.value);
    cleanup(() => observer.disconnect());
  });
  const emptyData: CaregiverDashboardData = {
    profile: {
      verified: false,
      verifiedLabel: 'No verificado',
      completeness: 0,
      avatar: '',
      name: '',
      bio: '',
      accepts: [],
      dogSizes: [],
      multiPet: false,
      zone: '',
      pricePerDay: 0,
      services: {
        alojamiento: true,
        visita: false,
        paseo: false,
      },
      photos: [],
      hasOwnPet: false,
      ownPetPhoto: '',
      ownPetName: '',
      ownPetSpecies: 'perro',
      ownPetBreed: '',
      ownPetAge: 0,
      ownPetVaccinated: false,
      fullName: '',
      primaryPhone: '',
      alternativePhone: '',
      petLimit: 1,
      pets: [],
    },
    kpis: {
      ratingAvg: 0,
      jobsDone: 0,
      revenue30d: 0,
    },
    reviews: [],
    bookings: [],
    availability: {},
    bank: {
      name: '',
      titular: '',
      rif: '',
      paymobile: '',
      verified: false,
    },
    security: {
      biometria: false,
      googleAuth: false,
    },
    background: {
      uploaded: false,
      filename: '',
    },
  };

  const state = useStore({
    tab: 'resumen' as 'resumen' | 'perfil' | 'disponibilidad' | 'fotos' | 'resenas' | 'solicitudes',
    profile: (data.value?.dashboard?.profile ?? emptyData.profile),
    auth: { email: '', emailVerified: false as boolean },
    kpis: (data.value?.dashboard?.kpis ?? emptyData.kpis),
    reviews: (data.value?.dashboard?.reviews ?? []),
    bookings: (data.value?.dashboard?.bookings ?? []),
    availability: {
      map: (data.value?.dashboard?.availability ?? {}),
      monthOffset: 0,
    },
    bank: (data.value?.dashboard?.bank ?? emptyData.bank),
    security: (data.value?.dashboard?.security ?? emptyData.security),
    background: (data.value?.dashboard?.background ?? emptyData.background),
    photos: [] as { id: number; url: string }[],

    // Loading states
    isSavingProfile: false,
    isSavingServices: false,
    isSavingEmail: false,
    isUpdatingBooking: false,

    // Pet management
    isSavingPet: false,
    isUploadingAvatar: false,
    isUploadingPetPhoto: false,
    isUploadingVaccine: false,
    isUploadingGallery: useStore<Record<number, boolean>>({}),
    editingPetId: null as string | null,
    petDraft: {
      name: '',
      species: 'perro',
      breed: '',
      age: 0,
      sex: 'macho',
      weight: 0,
      size: 'pequeño',
      behavior: [] as string[],
      medicalConditions: '',
      allergies: '',
      photo: '',
      vaccinated: false,
      vaccinationCard: '',
    },
    pendingCommission: data.value?.pendingCommission,
  });

  // ─── Real-time updates via WS + fallback poll ───
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const fresh = await reloadCaregiverData();
        if (!fresh || cancelled) return;
        if (JSON.stringify(fresh.bookings) !== JSON.stringify(state.bookings)) {
          state.bookings = fresh.bookings;
        }
        if (JSON.stringify(fresh.reviews) !== JSON.stringify(state.reviews)) {
          state.reviews = fresh.reviews;
        }
        if (JSON.stringify(fresh.kpis) !== JSON.stringify(state.kpis)) {
          state.kpis = fresh.kpis;
        }
        state.pendingCommission = fresh.pendingCommission;
      } catch (err) {
        console.error('[Caregiver] Poll error:', err);
      }
    };

    // WebSocket for instant updates
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectDelayMs = 2000;
    let pollDebounce: ReturnType<typeof setTimeout> | undefined;

    const connectWs = () => {
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
      }

      const userId = data.value?.user?.id;
      if (!userId) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        reconnectDelayMs = 2000;
        void poll();
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'SYNC_COUNTS') {
            // Debounce: coalesce rapid-fire SYNC_COUNTS into a single poll
            if (pollDebounce) clearTimeout(pollDebounce);
            pollDebounce = setTimeout(() => {
              void poll();
            }, 2000);
          }
        } catch { /* ignore */ }
      };
      ws.onclose = () => {
        ws = null;
        if (cancelled) return;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        const waitMs = Math.min(reconnectDelayMs, 30_000);
        reconnectTimer = setTimeout(connectWs, waitMs);
        reconnectDelayMs = Math.min(reconnectDelayMs * 2, 30_000);
      };
      ws.onerror = () => {
        ws?.close();
      };
    };

    const onOnline = () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectDelayMs = 500;
      connectWs();
      void poll();
    };

    window.addEventListener('online', onOnline);

    connectWs();
    // Initial load
    void poll();

    cleanup(() => {
      cancelled = true;
      if (pollDebounce) clearTimeout(pollDebounce);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      window.removeEventListener('online', onOnline);
      if (ws) { ws.onclose = null; ws.close(); }
    });
  });

  useTask$(({ track }) => {
    track(() => data.value);
    const profile = data.value?.dashboard?.profile;
    if (!profile) return;
    state.profile = normalizeCaregiverProfileImages(profile);
    state.profile.accepts = uniqueLabelList(state.profile.accepts);
    state.profile.dogSizes = uniqueLabelList(state.profile.dogSizes);
    // Set default price to $10 if it's 0 or undefined
    if (!state.profile.pricePerDay || state.profile.pricePerDay < 10) {
      state.profile.pricePerDay = 10;
    }
    state.auth = {
      email: data.value?.user?.email ?? '',
      emailVerified: data.value?.user?.emailVerified ?? false,
    };
    state.kpis = data.value?.dashboard?.kpis ?? emptyData.kpis;
    state.reviews = data.value?.dashboard?.reviews ?? [];
    state.bookings = data.value?.dashboard?.bookings ?? [];
    state.availability.map = data.value?.dashboard?.availability ?? {};
    state.bank = data.value?.dashboard?.bank ?? emptyData.bank;
    state.security = data.value?.dashboard?.security ?? emptyData.security;
    state.background = data.value?.dashboard?.background ?? emptyData.background;

    const photos = profile.photos.slice(0, 6).map((url: string, idx: number) => ({ id: idx, url }));
    while (photos.length < 6) photos.push({ id: photos.length, url: '' });
    state.photos = photos;
  });

  const readFileAsDataUrl = $((file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    })
  );

  const onPhotoChange = $(async (idx: number, file?: File) => {
    if (!file) return;
    state.isUploadingGallery[idx] = true;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const optimized = await resizeImage(dataUrl);
      const uploaded = await uploadImage(optimized);
      if (!uploaded.ok) {
        toast.value = 'No se pudo subir la foto.';
        return;
      }
      const normalizedUrl = normalizeImageUrl(uploaded.path || uploaded.url);
      state.photos[idx].url = normalizedUrl;
      const result = await savePhotoServer(idx, normalizedUrl);
      if (!result.ok) toast.value = 'No se pudo guardar la foto.';
    } finally {
      state.isUploadingGallery[idx] = false;
    }
  });

  const onAvatarChange = $(async (file?: File) => {
    if (!file) return;
    state.isUploadingAvatar = true;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const optimized = await resizeImage(dataUrl);
      const uploaded = await uploadImage(optimized);
      if (!uploaded.ok) {
        toast.value = 'No se pudo subir la foto de perfil.';
        return;
      }
      const normalizedUrl = normalizeImageUrl(uploaded.path || uploaded.url);
      state.profile.avatar = normalizedUrl;
      const result = await saveAvatarServer(normalizedUrl);
      if (!result.ok) toast.value = 'No se pudo guardar la foto de perfil.';
    } finally {
      state.isUploadingAvatar = false;
    }
  });

  const onPetPhotoChange = $(async (file?: File) => {
    if (!file) return;
    state.isUploadingPetPhoto = true;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const uploaded = await uploadImage(dataUrl);
      if (!uploaded.ok) {
        toast.value = 'No se pudo subir la foto de la mascota.';
        return;
      }
      state.profile.ownPetPhoto = normalizeImageUrl(uploaded.path || uploaded.url);
      toast.value = 'Foto de mascota cargada. Recuerda guardar los cambios.';
    } finally {
      state.isUploadingPetPhoto = false;
    }
  });


  const saveProfile = $(async () => {
    if (state.profile.pricePerDay < 10) {
      toast.value = 'El precio mínimo por día es $10 USD.';
      return;
    }
    state.isSavingProfile = true;
    try {
      const accepts = uniqueLabelList(state.profile.accepts);
      const dogSizes = uniqueLabelList(state.profile.dogSizes);
      const hasOwnPet = state.profile.hasOwnPet;
      state.profile.accepts = accepts;
      state.profile.dogSizes = dogSizes;
      const result = await saveProfileServer({
        name: state.profile.name,
        bio: state.profile.bio,
        zone: state.profile.zone,
        pricePerDay: Number(state.profile.pricePerDay || 0),
        multiPet: state.profile.multiPet,
        accepts,
        dogSizes,
        hasOwnPet,
        ownPetPhoto: hasOwnPet ? state.profile.ownPetPhoto : '',
        ownPetName: hasOwnPet ? state.profile.ownPetName : '',
        ownPetSpecies: hasOwnPet ? state.profile.ownPetSpecies : '',
        ownPetBreed: hasOwnPet ? state.profile.ownPetBreed : '',
        ownPetAge: hasOwnPet ? Number(state.profile.ownPetAge || 0) : 0,
        ownPetVaccinated: hasOwnPet ? state.profile.ownPetVaccinated : false,
        petLimit: Number(state.profile.petLimit || 1),
      });
      toast.value = result.ok ? 'Perfil guardado.' : (result.reason || 'No se pudo guardar el perfil.');
    } finally {
      state.isSavingProfile = false;
    }
  });

  const savePet = $(async () => {
    if (!state.petDraft.name || !state.petDraft.species) {
      toast.value = 'El nombre y la especie son obligatorios.';
      return;
    }
    state.isSavingPet = true;
    try {
      const payload: any = {
        name: state.petDraft.name,
        species: state.petDraft.species,
        breed: state.petDraft.breed,
        age: state.petDraft.age,
        photo: state.petDraft.photo,
        sex: state.petDraft.sex,
        weight: state.petDraft.weight,
        size: state.petDraft.size,
        hasIdTag: state.petDraft.vaccinated,
        active: true,
        behavior: state.petDraft.behavior,
        medicalConditions: state.petDraft.medicalConditions,
        allergies: state.petDraft.allergies,
        vaccinationCard: state.petDraft.vaccinationCard,
      };
      if (state.editingPetId) {
        payload.id = state.editingPetId;
      }
      const result = await savePetServer(payload);
      if (result.ok) {
        const savedPetId = state.editingPetId || result.id || `tmp-${Date.now()}`;
        const updatedPet = {
          id: savedPetId,
          ownerId: '',
          name: state.petDraft.name,
          species: state.petDraft.species,
          breed: state.petDraft.breed,
          photo: normalizeImageUrl(state.petDraft.photo),
          age: Number(state.petDraft.age || 0),
          sex: state.petDraft.sex || 'macho',
          weight: Number(state.petDraft.weight || 0),
          size: state.petDraft.size || '',
          behavior: state.petDraft.behavior || [],
          medicalConditions: state.petDraft.medicalConditions || '',
          allergies: state.petDraft.allergies || '',
          vaccinationCard: normalizeImageUrl(state.petDraft.vaccinationCard),
          hasIdTag: Boolean(state.petDraft.vaccinated),
          active: true,
        };

        if (state.editingPetId) {
          state.profile.pets = state.profile.pets.map((pet: any) =>
            pet.id === state.editingPetId ? updatedPet : pet
          );
        } else {
          state.profile.pets = [updatedPet, ...(state.profile.pets || [])];
        }

        toast.value = state.editingPetId ? 'Mascota actualizada.' : 'Mascota agregada.';
        state.editingPetId = null;
        state.petDraft = {
          name: '',
          species: 'perro',
          breed: '',
          age: 0,
          sex: 'macho',
          weight: 0,
          size: 'pequeño',
          behavior: [],
          medicalConditions: '',
          allergies: '',
          photo: '',
          vaccinated: false,
          vaccinationCard: ''
        };
      } else {
        toast.value = result.reason || 'Error al guardar mascota';
      }
    } finally {
      state.isSavingPet = false;
    }
  });

  const deletePet = $(async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta mascota?')) return;
    const result = await deletePetServer(id);
    if (result.ok) {
      state.profile.pets = (state.profile.pets || []).filter((pet: any) => pet.id !== id);
      if (state.editingPetId === id) {
        state.editingPetId = null;
        state.petDraft = {
          name: '',
          species: 'perro',
          breed: '',
          age: 0,
          sex: 'macho',
          weight: 0,
          size: 'pequeño',
          behavior: [],
          medicalConditions: '',
          allergies: '',
          photo: '',
          vaccinated: false,
          vaccinationCard: ''
        };
      }
      toast.value = 'Mascota eliminada';
    } else {
      toast.value = result.reason || 'Error al eliminar mascota';
    }
  });

  const saveServices = $(async () => {
    if (state.profile.pricePerDay < 10) {
      toast.value = 'El precio mínimo por día es $10.';
      return;
    }
    state.isSavingServices = true;
    try {
      const result = await saveServicesServer({
        alojamiento: state.profile.services.alojamiento,
        visita: state.profile.services.visita,
        paseo: state.profile.services.paseo,
        pricePerDay: Number(state.profile.pricePerDay || 0),
        zone: state.profile.zone,
      });
      toast.value = result.ok ? 'Servicios guardados.' : (result.reason || 'No se pudieron guardar los servicios.');
    } finally {
      state.isSavingServices = false;
    }
  });

  const saveEmail = $(async () => {
    state.isSavingEmail = true;
    try {
      const result = await saveEmailServer(state.auth.email);
      toast.value = result.ok ? 'Email guardado.' : 'No se pudo guardar el email.';
    } finally {
      state.isSavingEmail = false;
    }
  });

  const acceptRequest = $((id: string) => updateBookingStatusServer(id, 'accepted'));
  const rejectRequest = $((id: string) => updateBookingStatusServer(id, 'rejected'));
  const confirmPayment = $((id: string) => updateBookingStatusServer(id, 'completed'));

  const today = new Date();
  const monthLabel = (offset: number) => {
    const d = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    return d.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });
  };

  const daysGrid = (offset: number) => {
    const d = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const firstDay = new Date(year, month, 1);
    const start = firstDay.getDay();
    const total = new Date(year, month + 1, 0).getDate();
    const cells: { label: string; iso?: string }[] = [];
    const pad = (n: number) => (n < 10 ? '0' + n : String(n));

    for (let i = 0; i < (start === 0 ? 6 : start - 1); i++) cells.push({ label: '' });

    for (let day = 1; day <= total; day++) {
      const iso = year + '-' + pad(month + 1) + '-' + pad(day);
      cells.push({ label: String(day), iso });
    }
    return cells;
  };

  const toggleAvail = $(async (iso?: string) => {
    if (!iso) return;
    const next = !state.availability.map[iso];
    state.availability.map[iso] = next;
    const result = await toggleAvailabilityServer(iso, next);
    if (!result.ok) toast.value = 'No se pudo actualizar la disponibilidad.';
  });



  const Card = (p: { children: any; class?: string }) => (
    <div class={'bg-white rounded-2xl border border-[#4a2e85]/10 ' + (p.class ?? '')}>{p.children}</div>
  );

  const toDate = (value?: string) => {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    const onlyDate = raw.slice(0, 10);
    const fallback = new Date(`${onlyDate}T00:00:00`);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  };

  const hasTimeInfo = (value?: string) => !!value && value.includes('T');

  const formatDateShort = (value?: string) => {
    const date = toDate(value);
    if (!date) return 'Fecha por definir';
    return date.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatTimeShort = (value?: string) => {
    const date = toDate(value);
    if (!date) return '';
    return date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const statusLabel = (status?: string) => {
    const normalized = (status || '').toLowerCase();
    const labels: Record<string, string> = {
      requested: 'Solicitada',
      accepted: 'Aceptada',
      rejected: 'Rechazada',
      paid: 'Pago enviado',
      payment_sent: 'Pago enviado',
      payment_confirmed: 'Pago confirmado',
      fee_submitted: 'Comisión enviada',
      active: 'Activa',
      in_progress: 'En progreso',
      completed: 'Completada',
      confirmada: 'Confirmada',
    };
    return labels[normalized] || status || 'Sin estado';
  };

  const dateCard = (label: string, value?: string) => {
    const date = toDate(value);
    if (!date) {
      return (
        <div class="min-w-[70px] flex-1 shrink-0 rounded-xl border border-[#4a2e85]/15 bg-white p-2 text-center">
          <div class="text-[9px] font-bold uppercase text-[#4a2e85]/60">{label}</div>
          <div class="mt-1 text-[10px] font-semibold text-[#4a2e85]/70">Por definir</div>
        </div>
      );
    }

    const month = date.toLocaleDateString('es-VE', { month: 'short' }).replace('.', '').toUpperCase();
    const day = date.toLocaleDateString('es-VE', { day: '2-digit' });
    const showTime = hasTimeInfo(value);

    return (
      <div class="min-w-[70px] flex-1 shrink-0 rounded-xl border border-[#4a2e85]/15 bg-white p-2 text-center shadow-sm">
        <div class="text-[9px] font-bold uppercase text-[#4a2e85]/60">{label}</div>
        <div class="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#4a2e85]/70">{month}</div>
        <div class="text-xl leading-none font-extrabold text-[#4a2e85]">{day}</div>
        {showTime && <div class="mt-1 text-[10px] text-[#4a2e85]/70">{formatTimeShort(value)}</div>}
      </div>
    );
  };

  const Tag = (p: { text: string; tone?: 'green' | 'yellow' | 'gray' }) => {
    const tones: Record<string, string> = {
      green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      yellow: 'bg-amber-50 text-amber-700 border-amber-200',
      gray: 'bg-gray-100 text-gray-700 border-gray-200',
    };
    const isVerified = p.text === 'Verificado' || p.tone === 'green';
    return (
      <span class={'inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full border shadow-sm ' + tones[p.tone ?? 'gray']}>
        {isVerified && (
          <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
          </svg>
        )}
        {p.text}
      </span>
    );
  };

  const ratingStars = (rating: number) =>
    Array.from({ length: 5 }).map((_, i) => (
      <svg
        key={i}
        class={'w-4 h-4 ' + (i < Math.round(rating) ? 'text-[#ef7c43]' : 'text-[#e2d9f2]')}
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
    ));

  const ctaPrimary = 'px-4 py-2 rounded-xl bg-gradient-to-r from-[#f6e527] to-[#ef7c43] text-[#4a2e85] font-semibold hover:from-[#ef7c43] hover:to-[#f6e527] transition-all';
  const ctaGhost = 'px-4 py-2 rounded-xl bg-[#4a2e85]/10 text-[#4a2e85] font-semibold hover:bg-[#4a2e85]/20 transition-all backdrop-blur';
  const bookingPrimary = ctaPrimary + ' w-full sm:w-auto text-center';
  const bookingGhost = ctaGhost + ' w-full sm:w-auto text-center';

  const pendingRequests = state.bookings.filter((b) => ['requested', 'accepted', 'paid'].includes(b.status || 'requested')).length;
  const totalRequests = state.bookings.length;
  const caredPets = uniqueLabelList(state.profile.accepts);

  return (
    <div class="min-h-screen bg-[#f6f6f6]" data-vt="caregiver-page">
      <div ref={containerRef} class="py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto relative" data-vt="caregiver-shell">
        {/* Width debug indicator as requested */}
        <div class="absolute top-2 right-4 text-[10px] font-mono text-[#4a2e85]/40 pointer-events-none">
          Width: {containerWidth.value}px
        </div>
        <header class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6" data-vt="caregiver-header">
          <div class="flex items-center gap-3">
            <div class="h-12 w-12 rounded-xl bg-gradient-to-br from-[#f6e527] to-[#ef7c43] flex items-center justify-center">
              <svg class="w-6 h-6 text-[#4a2e85]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <h1 class="text-2xl font-extrabold text-[#4a2e85]">Panel de cuidador</h1>
              <p class="text-sm text-[#4a2e85b3]">Gestiona tu perfil, disponibilidad, fotos, servicios y reservas.</p>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <VerificationBadge verified={!!state.profile.verified} />
          </div>
        </header>

        {state.pendingCommission && (
          <div class={`mb-6 p-4 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm animate-in fade-in slide-in-from-top-4 duration-500 ${state.pendingCommission.type === 'payment'
            ? 'bg-amber-50 border-amber-200 text-amber-800'
            : 'bg-blue-50 border-blue-200 text-blue-800'
            }`}>
            <div class="flex items-center gap-3">
              <div class={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${state.pendingCommission.type === 'payment' ? 'bg-amber-100' : 'bg-blue-100'
                }`}>
                {state.pendingCommission.type === 'payment' ? <LuAlertTriangle class="w-6 h-6" /> : <LuClock class="w-6 h-6" />}
              </div>
              <div>
                <p class="font-bold text-sm sm:text-base">
                  {state.pendingCommission.type === 'payment'
                    ? `Tienes ${state.pendingCommission.count} ${state.pendingCommission.count === 1 ? 'comisión pendiente' : 'comisiones pendientes'} de pago.`
                    : `Tienes ${state.pendingCommission.count} ${state.pendingCommission.count === 1 ? 'comisión' : 'comisiones'} en proceso de revisión.`
                  }
                </p>
                <p class="text-xs opacity-80">
                  {state.pendingCommission.type === 'payment'
                    ? 'Reporta el pago para habilitar nuevas reservas con estos clientes.'
                    : 'Estamos validando tus reportes de pago. Te notificaremos pronto.'
                  }
                </p>
              </div>
            </div>
            <button
              onClick$={() => {
                state.tab = 'solicitudes';
                const el = document.getElementById('bookings-list');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              class={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${state.pendingCommission.type === 'payment'
                ? 'bg-amber-600 text-white border-amber-700 hover:bg-amber-700'
                : 'bg-blue-600 text-white border-blue-700 hover:bg-blue-700'
                }`}
            >
              Ver solicitudes
            </button>
          </div>
        )}

        {toast.value && (
          <div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 text-sm">
            {toast.value}
          </div>
        )}

        <nav class="flex gap-2 flex-wrap mb-6" data-vt="caregiver-tabs">
          {[
            { key: 'resumen', label: 'Resumen' },
            { key: 'perfil', label: 'Perfil' },
            { key: 'disponibilidad', label: 'Disponibilidad' },
            { key: 'fotos', label: 'Fotos' },
            { key: 'resenas', label: 'Reseñas' },
            { key: 'solicitudes', label: 'Solicitudes' },
          ].map((t) => (
            <button
              key={t.key}
              onClick$={() => (state.tab = t.key as any)}
              class={'px-3 py-2 rounded-lg text-sm ' + (state.tab === t.key ? 'bg-[#4a2e85]/10' : 'hover:bg-[#4a2e85]/5')}
              style={{ color: '#4a2e85' }}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div class="mt-6">
          {state.tab === 'resumen' && (
            <div class={containerWidth.value < 900 ? 'flex flex-col gap-6' : 'grid grid-cols-2 xl:grid-cols-3 gap-6 items-start'}>
              <Card class="lg:col-span-2 xl:col-span-3">
                <div class="p-4 sm:p-6">
                  <div class="flex flex-col md:flex-row gap-4 md:items-start md:justify-between">
                    <div class="flex items-start gap-4">
                      <div class="h-20 w-20 rounded-2xl border border-[#4a2e85]/20 overflow-hidden bg-[#4a2e85]/5">
                        {state.profile.avatar ? (
                          <ImageWithRetry
                            src={state.profile.avatar}
                            alt={state.profile.name || 'Cuidador'}
                            width={80}
                            height={80}
                            layout="constrained"
                            class="h-full w-full object-cover"
                          />
                        ) : (
                          <div class="h-full w-full grid place-items-center text-xs text-[#4a2e85b3]">Sin foto</div>
                        )}
                      </div>
                      <div class="space-y-1">
                        <div class="flex items-center gap-2 flex-wrap">
                          <h3 class="text-xl font-extrabold text-[#4a2e85]">{state.profile.name || 'Cuidador'}</h3>
                          <VerificationBadge verified={!!state.profile.verified} size="sm" />
                        </div>
                        <p class="text-sm text-[#4a2e85b3]">{state.profile.zone || 'Ubicación por completar'}</p>
                        <p class="text-sm text-[#4a2e85b3] line-clamp-2">{state.profile.bio || 'Completa tu biografía para mejorar tu perfil público.'}</p>
                      </div>
                    </div>
                    <div class="text-right">
                      <div class="text-xs text-[#4a2e85b3]">Tarifa por día</div>
                      <div class="text-2xl font-black text-[#4a2e85]">${Math.max(Number(state.profile.pricePerDay || 0), 10)}</div>
                    </div>
                  </div>
                  <div class="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div class="rounded-xl bg-[#4a2e85]/5 border border-[#4a2e85]/10 p-3">
                      <div class="text-xs text-[#4a2e85b3]">Mascotas que cuida</div>
                      <div class="mt-1 flex flex-wrap gap-1.5">
                        {caredPets.length ? (
                          caredPets.map((pet) => (
                            <span key={pet} class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-white border border-[#4a2e85]/15 text-[#4a2e85]">
                              {pet}
                            </span>
                          ))
                        ) : (
                          <span class="text-sm font-semibold text-[#4a2e85]">No definido</span>
                        )}
                      </div>
                    </div>
                    <div class="rounded-xl bg-[#4a2e85]/5 border border-[#4a2e85]/10 p-3">
                      <div class="text-xs text-[#4a2e85b3]">Servicios activos</div>
                      <div class="text-sm font-semibold text-[#4a2e85]">{[
                        state.profile.services.alojamiento ? 'Alojamiento' : null,
                        state.profile.services.visita ? 'Visita' : null,
                        state.profile.services.paseo ? 'Paseo' : null,
                      ].filter(Boolean).join(', ') || 'No definido'}</div>
                    </div>
                    <div class="rounded-xl bg-[#4a2e85]/5 border border-[#4a2e85]/10 p-3">
                      <div class="text-xs text-[#4a2e85b3]">Mascota propia</div>
                      <div class="text-sm font-semibold text-[#4a2e85]">{state.profile.hasOwnPet ? (state.profile.ownPetName || 'Sí') : 'No'}</div>
                    </div>
                    <div class="rounded-xl bg-[#4a2e85]/5 border border-[#4a2e85]/10 p-3">
                      <div class="text-xs text-[#4a2e85b3]">Límite de mascotas</div>
                      <div class="text-sm font-semibold text-[#4a2e85]">{state.profile.petLimit || 1}</div>
                    </div>
                  </div>
                </div>
              </Card>

              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
                <Card class="transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-[#4a2e85]/20">
                  <div class="p-4 sm:p-6">
                    <div class="text-sm text-[#4a2e85b3]">Reputación</div>
                    <div class="mt-1 text-2xl font-extrabold text-[#4a2e85]">{state.kpis.ratingAvg.toFixed(1)}/5</div>
                    <div class="mt-1 text-xs text-[#4a2e85b3]">{ratingStars(state.kpis.ratingAvg)}</div>
                  </div>
                </Card>
                <Card class="transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-[#4a2e85]/20">
                  <div class="p-4 sm:p-6">
                    <div class="text-sm text-[#4a2e85b3]">Servicios completados</div>
                    <div class="mt-1 text-2xl font-extrabold text-[#4a2e85]">{state.kpis.jobsDone}</div>
                  </div>
                </Card>
                <Card class="transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-[#4a2e85]/20">
                  <div class="p-4 sm:p-6">
                    <div class="text-sm text-[#4a2e85b3]">Ingresos (30 días)</div>
                    <div class="mt-1 text-2xl font-extrabold text-[#4a2e85]">${state.kpis.revenue30d} <span class="text-xs font-normal opacity-60">(Tasa BCV)</span></div>
                  </div>
                </Card>

                <Card class="transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-[#4a2e85]/20">
                  <div class="p-4 sm:p-6">
                    <div class="text-sm text-[#4a2e85b3]">Solicitudes pendientes</div>
                    <div class="mt-1 text-2xl font-extrabold text-[#4a2e85]">{pendingRequests}</div>
                    <div class="mt-1 text-xs text-[#4a2e85b3]">Total: {totalRequests}</div>
                  </div>
                </Card>

                <Card class="transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-[#4a2e85]/20">
                  <div class="p-4 sm:p-6">
                    <div class="flex items-center justify-between">
                      <div>
                        <div class="text-sm text-[#4a2e85b3]">Estado de verificación</div>
                        <div class="mt-1 text-lg font-bold text-[#4a2e85]">{state.profile.verifiedLabel}</div>
                      </div>
                      <Tag text={state.profile.verified ? 'Verificado' : state.profile.verifiedLabel} tone={state.profile.verified ? 'green' : 'yellow'} />
                    </div>
                    <div class="mt-4">
                      <div class="h-2 bg-[#4a2e85]/10 rounded-full overflow-hidden">
                        <div class="h-full bg-gradient-to-r from-[#f6e527] to-[#ef7c43]" style={{ width: state.profile.completeness + '%' }} />
                      </div>
                      <div class="mt-2 text-xs text-[#4a2e85b3]">Completitud del perfil: {state.profile.completeness}%</div>
                    </div>
                  </div>
                </Card>
              </div>

              <Card>
                <div class="p-4 sm:p-6">
                  <div class="flex items-center justify-between mb-3">
                    <h3 class="text-lg font-bold text-[#4a2e85]">Próximas reservas</h3>
                  </div>
                  <div class="divide-y divide-[#4a2e85]/10">
                    {state.bookings.map((b) => (
                      <div key={b.id} class="py-4 flex flex-col md:flex-row md:items-center gap-4 border-b border-[#4a2e85]/5 last:border-0">
                        <div class="flex items-center gap-2 shrink-0">
                          {dateCard('Desde', b.dateFrom)}
                          {dateCard('Hasta', b.dateTo)}
                        </div>
                        <div class="flex-1 min-w-0">
                          <div class="font-bold text-[#4a2e85] truncate">
                            {b.type ? `${b.petName || 'Mascota'} · ${b.type}` : (b.petName || 'Mascota')}
                          </div>
                          <div class="text-sm font-semibold text-[#ef7c43]">${b.amountUSD}</div>
                        </div>
                        <div class="flex flex-wrap items-center gap-2 md:justify-end">
                          <Tag text={statusLabel(b.status)} tone={b.status === 'confirmada' ? 'green' : b.status === 'requested' ? 'yellow' : 'gray'} />
                          {b.status === 'requested' && (
                            <div class="flex items-center gap-2 w-full sm:w-auto">
                              <button class={bookingPrimary} onClick$={() => acceptRequest(b.id)}>Aceptar</button>
                              <button class={bookingGhost} onClick$={() => rejectRequest(b.id)}>Rechazar</button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {state.bookings.length === 0 && (
                      <div class="py-8 text-center bg-[#4a2e85]/5 rounded-xl border border-dashed border-[#4a2e85]/20 mt-4">
                        <svg class="w-10 h-10 text-[#4a2e85]/20 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                        <p class="text-sm text-[#4a2e85b3] font-medium">No tienes reservas próximas.</p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              <Card class="lg:col-span-2 xl:col-span-1">
                <div class="p-4 sm:p-6">
                  <h3 class="text-lg font-bold mb-3 text-[#4a2e85]">Últimas reseñas</h3>
                  <div class="space-y-3">
                    {state.reviews.map((r, idx) => (
                      <div key={r.user + '-' + idx} class="p-3 rounded-xl bg-[#4a2e85]/5 border border-[#4a2e85]/10">
                        <div class="flex items-center justify-between">
                          <div class="font-semibold text-[#4a2e85]">{r.user}</div>
                          <div class="inline-flex items-center gap-1">{ratingStars(r.rating)}</div>
                        </div>
                        <div class="mt-1 text-sm text-[#4a2e85b3]">{r.comment}</div>
                        <div class="mt-1 text-xs text-[#4a2e8580]">{r.date}</div>
                      </div>
                    ))}
                    {state.reviews.length === 0 && (
                      <div class="py-8 text-center bg-[#4a2e85]/5 rounded-xl border border-dashed border-[#4a2e85]/20 mt-4">
                        <svg class="w-10 h-10 text-[#4a2e85]/20 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                        <p class="text-sm text-[#4a2e85b3] font-medium">Aún no tienes reseñas.</p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          )}

          {state.tab === 'perfil' && (
            <Card>
              <div class={`p-4 sm:p-6 ${containerWidth.value < 700 ? 'flex flex-col' : 'grid grid-cols-1 md:grid-cols-3'} gap-6`}>
                <div class="space-y-4">
                  <div class="flex items-center gap-4">
                    <div class="h-20 w-20 rounded-2xl bg-[#4a2e85]/10 border border-[#4a2e85]/20 overflow-hidden">
                      {state.profile.avatar ? (
                        <ImageWithRetry src={state.profile.avatar} alt="avatar" width={80} height={80} layout="constrained" class="h-full w-full object-cover" />
                      ) : (
                        <div class="h-full w-full grid place-items-center text-sm text-[#4a2e85b3]">Sin foto</div>
                      )}
                    </div>
                    <label class={ctaGhost + ' flex items-center gap-2' + (state.isUploadingAvatar ? ' opacity-50 cursor-not-allowed' : '')}>
                      {state.isUploadingAvatar ? (
                        <>
                          <span>Subiendo...</span>
                        </>
                      ) : (
                        'Cambiar foto'
                      )}
                      <input type="file" class="hidden" disabled={state.isUploadingAvatar} accept="image/*" onChange$={(e: any) => onAvatarChange(e.target.files?.[0])} />
                    </label>
                  </div>
                  <div class="text-sm text-[#4a2e85b3]">Zona</div>
                  <div class="font-semibold text-[#4a2e85]">{state.profile.zone || 'Sin zona'}</div>

                  <div class="text-sm text-[#4a2e85b3]">Acepta múltiples mascotas</div>
                  <Tag text={state.profile.multiPet ? 'Sí' : 'No'} tone={state.profile.multiPet ? 'green' : 'gray'} />

                  <div class="text-sm text-[#4a2e85b3]">Límite de mascotas por servicio</div>
                  <div class="font-semibold text-[#4a2e85]">{state.profile.petLimit || 1}</div>
                </div>

                <div class={`lg:col-span-2 space-y-4 ${containerWidth.value < 700 ? '' : 'md:col-span-2'}`}>
                  <div class={`grid gap-4 ${containerWidth.value < 550 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    <Field label="Nombre" value={state.profile.name} onInput$={(v) => (state.profile.name = v)} disabled />
                    <Field label="Email" value={state.auth.email} onInput$={(v) => (state.auth.email = v)} disabled />
                  </div>

                  <div class={`grid gap-4 ${containerWidth.value < 550 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    <Field label="Teléfono principal" value={state.profile.primaryPhone || ''} onInput$={(v) => (state.profile.primaryPhone = v)} disabled />
                    <Field label="Cédula" value={state.profile.cedula || ''} onInput$={(v) => (state.profile.cedula = v)} disabled />
                  </div>

                  <div class={`grid gap-4 ${containerWidth.value < 550 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    <Field label="Teléfono alternativo" value={state.profile.alternativePhone || ''} onInput$={(v) => (state.profile.alternativePhone = v)} />
                  </div>

                  <div class={`grid gap-4 ${containerWidth.value < 550 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    <Field
                      label="Precio por día (USD - Tasa BCV)"
                      value={String(state.profile.pricePerDay)}
                      onInput$={(v) => (state.profile.pricePerDay = Number(v || 10))}
                      type="number"
                      min="10"
                      placeholder="10"
                    />
                    <div>
                      <label class="block text-sm font-medium mb-2 text-[#4a2e85]">Límite de mascotas por servicio</label>
                      <input
                        type="number"
                        min="1"
                        max="5"
                        placeholder="1"
                        value={String(state.profile.petLimit || 1)}
                        onInput$={(e: any) => {
                          let val = Number(e.target.value || 1);
                          if (val > 5) val = 5;
                          state.profile.petLimit = val;
                          e.target.value = val;
                        }}
                        class="w-full px-4 py-3 rounded-xl bg-[#4a2e85]/5 border border-[#4a2e85]/15 focus:outline-none focus:ring-2 focus:ring-[#ef7c43]"
                      />
                      <p class="mt-2 text-xs text-[#4a2e85]/70 max-w-sm">
                        El límite máximo de mascotas simultáneas es 5 por seguridad. Si deseas ampliar este límite, por favor <a href="mailto:soporte@acupatas.com" class="font-bold underline text-[#ef7c43]">contacta a soporte</a>.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label class="block text-sm font-medium mb-2 text-[#4a2e85]">Biografía</label>
                    <textarea
                      rows={4}
                      value={state.profile.bio}
                      onInput$={(e: any) => (state.profile.bio = e.target.value)}
                      class="w-full px-4 py-3 rounded-xl bg-[#4a2e85]/5 border border-[#4a2e85]/15 focus:outline-none focus:ring-2 focus:ring-[#ef7c43]"
                    ></textarea>
                  </div>

                  <div class={`grid gap-4 ${containerWidth.value < 550 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    <CheckGroup
                      label="Mascotas que puede cuidar"
                      options={['Perro', 'Gato', 'Conejo', 'Cobayo', 'Hámster', 'Ave', 'Pez']}
                      values={state.profile.accepts}
                      onToggle$={(opt) => {
                        const i = state.profile.accepts.indexOf(opt);
                        if (i >= 0) state.profile.accepts.splice(i, 1);
                        else state.profile.accepts.push(opt);
                      }}
                    />

                    <CheckGroup
                      label="Tamaños de perro aceptados"
                      options={['Pequeño', 'Mediano', 'Grande']}
                      values={state.profile.dogSizes}
                      onToggle$={(opt) => {
                        const i = state.profile.dogSizes.indexOf(opt);
                        if (i >= 0) state.profile.dogSizes.splice(i, 1);
                        else state.profile.dogSizes.push(opt);
                      }}
                    />
                  </div>

                  <div class="space-y-4 pt-2 border-t border-[#4a2e85]/10">
                    <label class="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={state.profile.hasOwnPet}
                        onChange$={(e: any) => {
                          const checked = Boolean(e.target.checked);
                          state.profile.hasOwnPet = checked;
                          if (!checked) {
                            state.editingPetId = null;
                            state.petDraft = {
                              name: '',
                              species: 'perro',
                              breed: '',
                              age: 0,
                              sex: 'macho',
                              weight: 0,
                              size: 'pequeño',
                              behavior: [],
                              medicalConditions: '',
                              allergies: '',
                              photo: '',
                              vaccinated: false,
                              vaccinationCard: '',
                            };
                          }
                        }}
                        class="w-5 h-5 rounded border-[#4a2e85]/30 text-[#ef7c43] focus:ring-[#ef7c43]"
                      />
                      <span class="text-sm font-semibold text-[#4a2e85]">Tengo mascota propia</span>
                    </label>

                    {state.profile.hasOwnPet && (
                      <div class="space-y-6 ml-7 p-4 rounded-2xl bg-[#4a2e85]/5 border border-[#4a2e85]/10">
                        {/* List of existing pets */}
                        {state.profile.pets?.length > 0 && (
                          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {state.profile.pets.map((pet: any) => (
                              <div key={pet.id} class="rounded-xl border border-[#4a2e85]/10 bg-white p-3 flex items-center justify-between shadow-sm">
                                <div class="flex items-center gap-3">
                                  {pet.photo ? (
                                    <ImageWithRetry
                                      src={pet.photo}
                                      width={40}
                                      height={40}
                                      layout="constrained"
                                      class="w-10 h-10 rounded-full object-cover border border-[#4a2e85]/10"
                                      alt={pet.name || 'Mascota'}
                                    />
                                  ) : (
                                    <div class="w-10 h-10 rounded-full bg-[#4a2e85]/5 flex items-center justify-center text-[#4a2e85]">
                                      <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 7h.01" /><path d="M14 7h.01" /><path d="M12 12v1" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /></svg>
                                    </div>
                                  )}
                                  <div>
                                    <p class="font-bold text-sm text-[#4a2e85]">{pet.name}</p>
                                    <div class="flex items-center gap-2">
                                      <p class="text-xs text-[#4a2e85b3]">{pet.species} - {pet.breed}</p>
                                      {pet.vaccinationCard && (
                                        <a
                                          href={pet.vaccinationCard}
                                          target="_blank"
                                          class="text-[10px] bg-[#4a2e85]/5 text-[#4a2e85] px-1.5 py-0.5 rounded border border-[#4a2e85]/10 hover:bg-[#4a2e85]/10 transition-colors flex items-center gap-1"
                                          title="Ver carnet de vacunas"
                                        >
                                          <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                                          Carnet
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div class="flex items-center gap-1">
                                  <button
                                    onClick$={() => {
                                      state.editingPetId = pet.id;
                                      state.petDraft = {
                                        name: pet.name,
                                        species: pet.species,
                                        breed: pet.breed,
                                        age: pet.age,
                                        photo: pet.photo,
                                        sex: pet.sex || 'macho',
                                        weight: pet.weight || 0,
                                        size: pet.size || 'pequeño',
                                        behavior: pet.behavior || [],
                                        medicalConditions: pet.medicalConditions || '',
                                        allergies: pet.allergies || '',
                                        vaccinated: pet.hasIdTag,
                                        vaccinationCard: pet.vaccinationCard,
                                      };
                                    }}
                                    class="text-[#4a2e85] hover:bg-[#4a2e85]/5 p-1.5 rounded-lg"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
                                  </button>
                                  <button
                                    onClick$={() => deletePet(pet.id)}
                                    class="text-red-500 hover:bg-red-50 p-1.5 rounded-lg"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add/Edit form */}
                        <div class="pt-4 border-t border-[#4a2e85]/10 space-y-4">
                          <h4 class="text-sm font-bold text-[#4a2e85] flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                            {state.editingPetId ? 'Editar mascota' : 'Agregar mascota'}
                          </h4>
                          <div class="flex items-center gap-4 mb-2">
                            <div class="h-20 w-20 rounded-2xl bg-white border border-[#4a2e85]/20 overflow-hidden shadow-sm">
                              {state.petDraft.photo ? (
                                <ImageWithRetry src={state.petDraft.photo} alt="mascota" width={80} height={80} layout="constrained" class="h-full w-full object-cover" />
                              ) : (
                                <div class="h-full w-full grid place-items-center text-[10px] text-center text-[#4a2e85b3] p-1">Sin foto</div>
                              )}
                            </div>
                            <label class={ctaGhost + ' px-3 py-1.5 text-xs flex items-center gap-2' + (state.isUploadingPetPhoto ? ' opacity-50 cursor-not-allowed' : '')}>
                              {state.isUploadingPetPhoto ? (
                                <>
                                  <span>Subiendo...</span>
                                </>
                              ) : (
                                'Subir foto'
                              )}
                              <input type="file" class="hidden" disabled={state.isUploadingPetPhoto} accept="image/*" onChange$={async (e: any) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                state.isUploadingPetPhoto = true;
                                try {
                                  const dataUrl = await readFileAsDataUrl(file);
                                  const optimized = await resizeImage(dataUrl);
                                  const uploaded = await uploadImage(optimized);
                                  if (!uploaded.ok) {
                                    toast.value = 'No se pudo subir la foto.';
                                    return;
                                  }
                                  state.petDraft.photo = normalizeImageUrl(uploaded.path || uploaded.url);
                                } finally {
                                  state.isUploadingPetPhoto = false;
                                }
                              }} />
                            </label>
                          </div>
                          <div class="flex items-center gap-4 mb-2">
                            <div class="h-20 w-20 rounded-2xl bg-white border border-[#4a2e85]/20 overflow-hidden shadow-sm">
                              {state.petDraft.vaccinationCard ? (
                                <ImageWithRetry src={state.petDraft.vaccinationCard} alt="vacunas" width={80} height={80} layout="constrained" class="h-full w-full object-cover" />
                              ) : (
                                <div class="h-full w-full grid place-items-center text-[10px] text-center text-[#4a2e85b3] p-1">Sin carnet</div>
                              )}
                            </div>
                            <label class={ctaGhost + ' px-3 py-1.5 text-xs cursor-pointer flex items-center gap-2' + (state.isUploadingVaccine ? ' opacity-50 cursor-not-allowed' : '')}>
                              {state.isUploadingVaccine ? (
                                <>
                                  <span>Subiendo...</span>
                                </>
                              ) : (
                                'Subir carnet de vacunas'
                              )}
                              <input type="file" class="hidden" disabled={state.isUploadingVaccine} accept="image/*" onChange$={async (e: any) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                state.isUploadingVaccine = true;
                                try {
                                  const dataUrl = await readFileAsDataUrl(file);
                                  const optimized = await resizeImage(dataUrl);
                                  const uploaded = await uploadImage(optimized);
                                  if (!uploaded.ok) {
                                    toast.value = 'No se pudo subir el carnet.';
                                    return;
                                  }
                                  state.petDraft.vaccinationCard = normalizeImageUrl(uploaded.path || uploaded.url);
                                } finally {
                                  state.isUploadingVaccine = false;
                                }
                              }} />
                            </label>
                          </div>
                          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Field
                              label="Nombre"
                              value={state.petDraft.name}
                              onInput$={(v) => (state.petDraft.name = v)}
                              placeholder="Bobby"
                            />
                            <div>
                              <label class="block text-sm font-medium mb-2 text-[#4a2e85]">Especie</label>
                              <select
                                value={state.petDraft.species}
                                onChange$={(e: any) => (state.petDraft.species = e.target.value)}
                                class="w-full px-4 py-3 rounded-xl bg-white border border-[#4a2e85]/15 focus:outline-none focus:ring-2 focus:ring-[#ef7c43] text-sm"
                              >
                                <option value="perro">Perro</option>
                                <option value="gato">Gato</option>
                                <option value="ave">Ave</option>
                                <option value="conejo">Conejo</option>
                                <option value="cobayo">Cobayo</option>
                                <option value="hamster">Hámster</option>
                                <option value="otro">Otro</option>
                              </select>
                            </div>
                            <Field
                              label="Raza"
                              value={state.petDraft.breed}
                              onInput$={(v) => (state.petDraft.breed = v)}
                              placeholder="Pastor Alemán"
                            />
                            <Field
                              label="Edad"
                              value={String(state.petDraft.age)}
                              onInput$={(v) => (state.petDraft.age = Number(v || 0))}
                              type="number"
                              min="0"
                            />
                            <div>
                              <label class="block text-sm font-medium mb-2 text-[#4a2e85]">Sexo</label>
                              <select
                                value={state.petDraft.sex}
                                onChange$={(e: any) => (state.petDraft.sex = e.target.value)}
                                class="w-full px-4 py-3 rounded-xl bg-white border border-[#4a2e85]/15 focus:outline-none focus:ring-2 focus:ring-[#ef7c43] text-sm"
                              >
                                <option value="macho">Macho</option>
                                <option value="hembra">Hembra</option>
                              </select>
                            </div>
                            <Field
                              label="Peso (kg)"
                              value={String(state.petDraft.weight)}
                              onInput$={(v) => (state.petDraft.weight = Number(v || 0))}
                              type="number"
                              min="0"
                            />
                            {state.petDraft.species === 'perro' && (
                              <div>
                                <label class="block text-sm font-medium mb-2 text-[#4a2e85]">Tamaño</label>
                                <select
                                  value={state.petDraft.size}
                                  onChange$={(e: any) => (state.petDraft.size = e.target.value)}
                                  class="w-full px-4 py-3 rounded-xl bg-white border border-[#4a2e85]/15 focus:outline-none focus:ring-2 focus:ring-[#ef7c43] text-sm"
                                >
                                  <option value="pequeño">Pequeño</option>
                                  <option value="mediano">Mediano</option>
                                  <option value="grande">Grande</option>
                                </select>
                              </div>
                            )}
                          </div>
                          <div class="space-y-4">
                            <CheckGroup
                              label="Comportamiento"
                              options={['Sociable', 'Juguetón', 'Tranquilo', 'Ansioso', 'Territorial', 'Agresivo con perros', 'Agresivo con gatos', 'Miedoso']}
                              values={state.petDraft.behavior}
                              onToggle$={(opt) => {
                                const i = state.petDraft.behavior.indexOf(opt);
                                if (i >= 0) state.petDraft.behavior.splice(i, 1);
                                else state.petDraft.behavior.push(opt);
                              }}
                            />
                            <div>
                              <label class="block text-sm font-medium mb-1 text-[#4a2e85]">Condiciones Médicas</label>
                              <textarea
                                value={state.petDraft.medicalConditions}
                                onInput$={(e: any) => (state.petDraft.medicalConditions = e.target.value)}
                                placeholder="Ej: Diabetes, requiere medicación cada 12h"
                                class="w-full px-4 py-3 rounded-xl bg-white border border-[#4a2e85]/15 focus:outline-none focus:ring-2 focus:ring-[#ef7c43] text-sm"
                                rows={2}
                              ></textarea>
                            </div>
                            <div>
                              <label class="block text-sm font-medium mb-1 text-[#4a2e85]">Alergias</label>
                              <textarea
                                value={state.petDraft.allergies}
                                onInput$={(e: any) => (state.petDraft.allergies = e.target.value)}
                                placeholder="Ej: Alergia al pollo"
                                class="w-full px-4 py-3 rounded-xl bg-white border border-[#4a2e85]/15 focus:outline-none focus:ring-2 focus:ring-[#ef7c43] text-sm"
                                rows={2}
                              ></textarea>
                            </div>
                          </div>
                          <label class="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={state.petDraft.vaccinated}
                              onChange$={(e: any) => (state.petDraft.vaccinated = e.target.checked)}
                              class="w-5 h-5 rounded border-[#4a2e85]/30 text-[#ef7c43] focus:ring-[#ef7c43]"
                            />
                            <span class="text-sm font-semibold text-[#4a2e85]">Vacunas al día</span>
                          </label>

                          <div class="flex items-center gap-2">
                            <button
                              onClick$={savePet}
                              class="flex-1 py-2 rounded-xl bg-[#4a2e85] text-white font-bold text-sm"
                              data-no-loader="true"
                            >
                              {state.isSavingPet ? 'Guardando...' : state.editingPetId ? 'Guardar cambios' : 'Agregar mascota'}
                            </button>
                            {state.editingPetId && (
                              <button
                                onClick$={() => {
                                  state.editingPetId = null;
                                  state.petDraft = {
                                    name: '',
                                    species: 'perro',
                                    breed: '',
                                    age: 0,
                                    sex: 'macho',
                                    weight: 0,
                                    size: 'pequeño',
                                    behavior: [],
                                    medicalConditions: '',
                                    allergies: '',
                                    photo: '',
                                    vaccinated: false,
                                    vaccinationCard: ''
                                  };
                                }}
                                class="px-4 py-2 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm"
                              >
                                Cancelar
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <label class="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={state.profile.multiPet}
                      onChange$={(e: any) => (state.profile.multiPet = e.target.checked)}
                      class="w-5 h-5 rounded border-[#4a2e85]/30"
                    />
                    <span class="text-sm text-[#4a2e85]">Puedo cuidar más de una mascota a la vez</span>
                  </label>

                  {/* Services Section */}
                  <div class="pt-6 border-t border-[#4a2e85]/10">
                    <h4 class="text-md font-bold text-[#4a2e85] mb-4">Servicios que ofreces</h4>
                    <div class={`grid gap-4 ${containerWidth.value < 450 ? 'grid-cols-1' : containerWidth.value < 900 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                      <ToggleCard title="Alojamiento" checked={state.profile.services.alojamiento} onChange$={(v) => (state.profile.services.alojamiento = v)} />
                      <ToggleCard title="Visita a domicilio" checked={state.profile.services.visita} onChange$={(v) => (state.profile.services.visita = v)} />
                      <ToggleCard title="Paseo" checked={state.profile.services.paseo} onChange$={(v) => (state.profile.services.paseo = v)} />
                    </div>
                  </div>

                  <div class="flex flex-wrap items-center gap-2 pt-4 border-t border-[#4a2e85]/10">
                    <button
                      class={ctaPrimary}
                      data-no-loader="true"
                      disabled={state.isSavingProfile || state.isSavingServices || state.isSavingEmail}
                      onClick$={async () => {
                        await saveProfile();
                        await saveServices();
                        await saveEmail();
                      }}
                    >
                      {state.isSavingProfile || state.isSavingServices || state.isSavingEmail ? (
                        <div class="flex items-center gap-2">
                          <span>Guardando...</span>
                        </div>
                      ) : (
                        'Guardar cambios'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {state.tab === 'disponibilidad' && (
            <Card>
              <div class="p-6">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <h3 class="text-lg font-bold text-[#4a2e85]">Disponibilidad</h3>
                  <div class="flex items-center gap-2 flex-wrap">
                    <button class={ctaGhost} onClick$={() => (state.availability.monthOffset -= 1)}>Mes anterior</button>
                    <button class={ctaGhost} onClick$={() => (state.availability.monthOffset += 1)}>Mes siguiente</button>
                  </div>
                </div>
                <div class="mb-2 font-semibold text-[#4a2e85]">{monthLabel(state.availability.monthOffset)}</div>
                <div class="overflow-x-auto pb-2 -mx-2 px-2 sm:mx-0 sm:px-0">
                  <div class="min-w-[400px]">
                    <div class="grid grid-cols-7 gap-2 text-xs text-[#4a2e85b3]">
                      {['LU', 'MA', 'MI', 'JU', 'VI', 'SÁ', 'DO'].map((d, i) => (
                        <div key={i} class="text-center py-1 font-bold">{d}</div>
                      ))}
                    </div>
                    <div class="grid grid-cols-7 gap-2 mt-1">
                      {daysGrid(state.availability.monthOffset).map((cell, i) => (
                        <button
                          key={i}
                          onClick$={() => toggleAvail(cell.iso)}
                          class={
                            'h-16 rounded-xl border ' +
                            (cell.iso
                              ? (state.availability.map[cell.iso]
                                ? 'bg-gradient-to-br from-[#f6e527] to-[#ef7c43] border-transparent text-[#4a2e85] font-semibold'
                                : 'bg-[#4a2e85]/5 border-[#4a2e85]/15 hover:bg-[#4a2e85]/10')
                              : 'bg-transparent border-transparent')
                          }
                          style={{ color: '#4a2e85' }}
                        >
                          {cell.label}
                        </button>
                      ))}
                    </div>
                    <div class="mt-4 flex items-center gap-2 text-sm text-[#4a2e85b3]">
                      <span class="inline-block h-4 w-4 rounded bg-gradient-to-br from-[#f6e527] to-[#ef7c43] mr-1" /> Disponible
                      <span class="inline-block h-4 w-4 rounded bg-[#4a2e85]/10 border border-[#4a2e85]/20 ml-3 mr-1" /> No disponible
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {state.tab === 'fotos' && (
            <Card>
              <div class="p-6">
                <div class="flex items-center justify-between mb-4">
                  <h3 class="text-lg font-bold text-[#4a2e85]">Fotos del espacio</h3>
                  <div class="text-sm text-[#4a2e85b3]">Sube al menos 3 fotos</div>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {state.photos.map((p, idx) => (
                    <label key={p.id} class={`h-40 rounded-xl bg-[#4a2e85]/5 border border-[#4a2e85]/15 overflow-hidden grid place-items-center cursor-pointer hover:bg-[#4a2e85]/10 relative ${state.isUploadingGallery[idx] ? 'opacity-70' : ''}`}>
                      {p.url ? (
                        <ImageWithRetry src={p.url} alt={'foto-' + idx} width={320} height={160} layout="constrained" class="h-full w-full object-cover" />
                      ) : (
                        <span class="text-sm text-[#4a2e85b3]">Subir foto</span>
                      )}
                      {state.isUploadingGallery[idx] && (
                        <div class="absolute inset-0 bg-white/40 flex items-center justify-center">
                          <div class="w-8 h-8 border-4 border-[#4a2e85] border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                      <input type="file" class="hidden" disabled={state.isUploadingGallery[idx]} accept="image/*" onChange$={(e: any) => onPhotoChange(idx, e.target.files?.[0])} />
                    </label>
                  ))}
                </div>
              </div>
            </Card>
          )}



          {state.tab === 'resenas' && (
            <Card>
              <div class="p-6">
                <h3 class="text-lg font-bold mb-4 text-[#4a2e85]">Reseñas</h3>
                <div class="space-y-3">
                  {state.reviews.map((r, idx) => (
                    <div key={r.user + '-' + idx} class="p-4 rounded-xl bg-[#4a2e85]/5 border border-[#4a2e85]/10">
                      <div class="flex items-center justify-between">
                        <div class="font-semibold text-[#4a2e85]">{r.user}</div>
                        <div class="inline-flex items-center gap-1">{ratingStars(r.rating)}</div>
                      </div>
                      <div class="mt-1 text-sm text-[#4a2e85b3]">{r.comment}</div>
                      <div class="mt-1 text-xs text-[#4a2e8580]">{r.date}</div>
                    </div>
                  ))}
                  {state.reviews.length === 0 && (
                    <div class="text-sm text-[#4a2e85b3]">Aún no tienes reseñas.</div>
                  )}
                </div>
              </div>
            </Card>
          )}

          {state.tab === 'solicitudes' && (
            <Card>
              <div id="bookings-list" class="p-6 space-y-4 scroll-mt-24">
                <div class="flex items-center justify-between">
                  <h3 class="text-lg font-bold text-[#4a2e85]">Solicitudes</h3>
                  <div class="text-xs text-[#4a2e85b3]">{state.bookings.length} total</div>
                </div>
                <div class="space-y-3">
                  {state.bookings.map((b) => {
                    const hasDebt = (b.status === 'payment_confirmed' || b.status === 'completed') && !b.feeReference;
                    const isValidationPending = b.status === 'fee_submitted' && !b.feeValidated;

                    return (
                      <div
                        key={b.id}
                        class={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${hasDebt ? 'border-amber-200 bg-amber-50/50 shadow-sm' : 'border-[#4a2e85]/10 bg-white'
                          }`}
                      >
                        <div class="min-w-0 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                          <div class="flex items-center gap-2 shrink-0">{dateCard('Desde', b.dateFrom)}{dateCard('Hasta', b.dateTo)}</div>
                          <div class="min-w-0">
                            <div class="font-bold text-[#4a2e85] truncate flex items-center gap-2">
                              {b.ownerName || 'Dueño'} · {b.petName || 'Mascota'}
                              {(hasDebt || isValidationPending) && (
                                <span class={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide shrink-0 ${hasDebt ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                                  }`}>
                                  {hasDebt ? 'Pendiente' : 'En revisión'}
                                </span>
                              )}
                            </div>
                            <div class="text-xs text-[#4a2e85b3] font-medium uppercase tracking-tight">{b.type} · ${b.amountUSD}</div>
                            <div class="text-[10px] text-[#4a2e85b3] mt-1">
                              <span>Estado: {statusLabel(b.status)}</span>
                              {b.feeReference && <span class="text-emerald-600 font-medium ml-2">· Ref: {b.feeReference}</span>}
                            </div>
                          </div>
                        </div>
                        <div class="flex flex-wrap items-center gap-2 md:justify-end">
                          <Link
                            href={`/dashboard/chat/${b.id}`}
                            class="px-4 py-2 rounded-xl bg-white border border-[#4a2e85]/20 text-[#4a2e85] text-xs font-bold hover:bg-[#4a2e85]/5 flex items-center gap-2"
                          >
                            Ir al chat
                          </Link>
                          {b.status === 'requested' && (
                            <div class="flex items-center gap-2 w-full sm:w-auto">
                              <button class={bookingPrimary} onClick$={() => acceptRequest(b.id)}>Aceptar</button>
                              <button class={bookingGhost} onClick$={() => rejectRequest(b.id)}>Rechazar</button>
                            </div>
                          )}
                          {b.status === 'paid' && (
                            <button class={bookingPrimary} onClick$={() => confirmPayment(b.id)}>Confirmar pago</button>
                          )}
                          {hasDebt && (
                            <Link
                              href={`/dashboard/chat/${b.id}`}
                              class="px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 shadow-sm"
                            >
                              Pagar comisión
                            </Link>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {state.bookings.length === 0 && (
                    <div class="text-sm text-[#4a2e85b3]">No hay solicitudes por ahora.</div>
                  )}
                </div>
              </div>
            </Card>
          )}

        </div>
      </div>
    </div>
  );
});

const Field = component$<{ label: string; value: string; onInput$: QRL<(val: string) => void>; type?: 'text' | 'number'; min?: string; placeholder?: string; disabled?: boolean }>((p) => {
  const { label, value, onInput$, type, min, placeholder, disabled } = p;
  const handleInput$ = $((e: Event) => onInput$((e.target as HTMLInputElement).value));
  return (
    <div>
      <label class="block text-sm font-medium mb-2 text-[#4a2e85]">{label}</label>
      <input
        type={type ?? 'text'}
        value={value}
        onInput$={handleInput$}
        min={min}
        placeholder={placeholder}
        disabled={disabled}
        class={`w-full px-4 py-3 rounded-xl bg-[#4a2e85]/5 border border-[#4a2e85]/15 focus:outline-none focus:ring-2 focus:ring-[#ef7c43] ${disabled ? 'opacity-70 cursor-not-allowed' : ''}`}
      />
    </div>
  );
});

const ToggleCard = component$<{ title: string; checked: boolean; onChange$: QRL<(v: boolean) => void> }>((p) => {
  const { title, checked, onChange$ } = p;
  const handleChange$ = $((e: Event) => onChange$((e.target as HTMLInputElement).checked));
  return (
    <label class="relative cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange$={handleChange$} class="peer sr-only" />
      <div class="rounded-2xl border border-[#4a2e85]/15 bg-[#4a2e85]/5 p-4 peer-checked:bg-gradient-to-br peer-checked:from-[#f6e527] peer-checked:to-[#ef7c43] peer-checked:border-transparent">
        <div class="font-semibold text-[#4a2e85]">{title}</div>
        <div class="mt-2 text-xs text-[#4a2e85b3]">{checked ? 'Activo' : 'Inactivo'}</div>
      </div>
    </label>
  );
});

const CheckGroup = component$<{ label: string; options: string[]; values: string[]; onToggle$: QRL<(v: string) => void> }>((p) => {
  const { label, options, values, onToggle$ } = p;
  return (
    <div>
      <div class="block text-sm font-medium mb-2 text-[#4a2e85]">{label}</div>
      <div class="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = values.includes(opt);
          return (
            <button
              key={opt}
              onClick$={$(() => onToggle$(opt))}
              class={
                'px-3 py-2 rounded-xl border text-sm ' +
                (active
                  ? 'bg-gradient-to-r from-[#f6e527] to-[#ef7c43] border-transparent'
                  : 'bg-[#4a2e85]/5 border-[#4a2e85]/15 hover:bg-[#4a2e85]/10')
              }
              style={{ color: '#4a2e85' }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
});

const CheckRow = component$((p: { label: string; ok: boolean }) => (
  <div class="flex items-center justify-between p-4 rounded-xl border" style={{ borderColor: p.ok ? '#22c55e55' : '#4a2e8515', background: p.ok ? '#22c55e15' : '#4a2e850a' }}>
    <div class="text-sm text-[#4a2e85]">{p.label}</div>
    <span class={'px-2 py-1 text-xs rounded-lg border ' + (p.ok ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' : 'bg-[#4a2e85]/10 text-[#4a2e85] border-[#4a2e85]/20')}>{p.ok ? 'OK' : 'Pendiente'}</span>
  </div>
));









