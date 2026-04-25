import { component$, useStore, useSignal, useTask$, $, Slot, useVisibleTask$, useStyles$ } from '@builder.io/qwik';
import { ImageWithRetry } from '~/components/ui/image-with-retry';
import { Link, routeLoader$, server$ } from '@builder.io/qwik-city';
import { getSessionFromEvent } from '../../../lib/auth';
import type { OwnerPetRecord, OwnerPetPayload, OwnerProfilePayload } from '../../../lib/owner';
import {
  LuMessageSquare,
  LuSearch,
  LuCalendar,
  LuUser,
  LuEye,
  LuCheckCircle2,
  LuXCircle,
  LuFileText,
  LuShieldCheck,
  LuBan,
  LuPhone,
  LuMapPin,
  LuDog,
} from '@qwikest/icons/lucide';
import {
  deleteOwnerPet,
  getOwnerDashboardData,
  listOwnerPets,
  listOwnerServices,
  rateOwnerService,
  saveOwnerPet,
  saveOwnerProfilePhoto,
  saveOwnerProfileByUserId,
} from '../../../lib/owner';
import { VerificationBadge } from '../../../components/VerificationBadge';
import { uploadImage, resolveUploadUrl } from '../../../lib/upload';
import { resizeImage } from '../../../lib/image-utils';
import { normalizeImageUrl } from '../../../lib/upload-utils';
import leafletStyles from 'leaflet/dist/leaflet.css?inline';



/**

 * ACUPATAS - Dashboard de Dueño (Todo en un solo archivo)

 * Flujos incluidos (en una sola pantalla con "rutas" internas):

 * - /auth/register-owner          Registro + verificaciones

 * - /owner/add-pet                Registro de mascota(s)

 * - /owner/edit                   Edición de perfil del dueño

 * - /owner/pet/{id}/edit          Edición de mascota

 * - /owner/profile/{id}           Visualización de perfil del dueño

 * - /owner/reviews                Sistema de calificación

 * - /rules-security               Reglas y seguridad

 * - (Resumen/Dashboard)

 *

 * Nota de negocio: El dueño NO puede iniciar un nuevo servicio hasta calificar al cuidador anterior.

 * Regla: Solo una solicitud activa por mascota.

 */



/* ======================

   Tipos

====================== */

interface Pet {

  id: string;

  name: string;

  species: 'perro' | 'gato' | 'ave' | 'conejo' | 'cobayo' | 'hamster' | 'otro';

  breed: string;

  photo: string;

  age: number;

  sex: 'macho' | 'hembra';

  weight: number;

  size?: 'pequeño' | 'mediano' | 'grande';

  behavior: string[];

  medicalConditions: string;

  allergies: string;

  vaccinationCard: string;

  hasIdTag: boolean;

  active: boolean;

}



interface OwnerProfile {

  id: string;

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

  profilePhoto: string;

  displayName: string;

  bio: string;

  photoWithPet?: string;

  emergencyContact: {

    name: string;

    phone: string;

    relationship: string;
    address?: string;

  };

  personalReferences: Array<{ name: string; phone: string; relationship: string }>;

  familyReferences: Array<{ name: string; phone: string; relationship: string }>;

  phoneVerified: boolean;

  emailVerified: boolean;

  isVerified: boolean;

  rating: number;

  totalReviews: number;

  completeness: number;

}



interface ServiceRequest {

  id: string;

  petId: string;

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



interface Review {

  id: string;

  reviewerId: string;
  reviewerName?: string;

  ownerId: string;

  rating: number;

  comment: string;

  date: string;

  petName: string;

}

const EMPTY_REFS = [
  { name: '', phone: '', relationship: '' },
  { name: '', phone: '', relationship: '' },
];

const normalizeRefs = (refs?: Array<{ name: string; phone: string; relationship: string }>) =>
  refs && refs.length ? [...refs, ...EMPTY_REFS].slice(0, 2) : EMPTY_REFS;

const mapPetRowToUi = (pet: any): Pet => ({
  id: pet.id,
  name: pet.name || '',
  species: pet.species as Pet['species'],
  breed: pet.breed || '',
  photo: normalizeImageUrl(pet.photo),
  age: Number(pet.age || 0),
  sex: (pet.sex || 'macho') as Pet['sex'],
  weight: Number(pet.weight || 0),
  size: pet.size as Pet['size'] | undefined,
  behavior: Array.isArray(pet.behavior) ? pet.behavior : [],
  medicalConditions: pet.medicalConditions || '',
  allergies: pet.allergies || '',
  vaccinationCard: normalizeImageUrl(pet.vaccinationCard),
  hasIdTag: Boolean(pet.hasIdTag),
  active: Boolean(pet.active ?? true),
});



/* ======================

   UI atoms

====================== */

const Card = component$<{ class?: string }>((p) => (

  <div class={`bg-white rounded-2xl border border-[#4a2e85]/10 ${p.class || ''}`}>

    <Slot />

  </div>

));



const Badge = component$<{ text: string; tone?: 'green' | 'yellow' | 'red' | 'blue' | 'gray' }>((p) => {
  const colors = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    yellow: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    gray: 'bg-gray-100 text-gray-700 border-gray-200',
  };

  const isVerified = p.text === 'Verificado' || p.tone === 'green';

  return (
    <span class={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shadow-sm ${colors[p.tone || 'gray']}`}>
      {isVerified && (
        <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
        </svg>
      )}
      {p.text}
    </span>
  );
});



const StarRating = component$<{ rating: number }>((p) => (

  <div class="flex items-center gap-1">

    {Array.from({ length: 5 }).map((_, i) => (

      <svg key={i} class={`w-4 h-4 ${i < p.rating ? 'text-yellow-400' : 'text-gray-300'}`} viewBox="0 0 20 20" fill="currentColor">

        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />

      </svg>

    ))}

    <span class="ml-1 text-sm font-medium text-gray-600">{p.rating.toFixed(1)}</span>

  </div>

));





/* ======================

   App

====================== */

type RouteKey =

  | 'dashboard'

  | 'add-pet'

  | 'edit-owner'

  | 'edit-pet'

  | 'owner-profile'

  | 'owner-reviews'

  | 'rules-security';

export const useOwnerDashboard = routeLoader$(async (event) => {
  const session = await getSessionFromEvent(event);
  if (!session) return null;
  return await getOwnerDashboardData(session.userId);
});

const saveOwnerProfile = server$(async function (payload: OwnerProfilePayload) {
  try {
    const session = await getSessionFromEvent(this);
    if (!session) return { ok: false, reason: 'no_session' } as const;
    await saveOwnerProfileByUserId(session.userId, payload);
    return { ok: true } as const;
  } catch (e: any) {
    return { ok: false, reason: e.message || 'Error de conexión (502)' } as const;
  }
});

const saveProfilePhotoServer = server$(async function (photoUrl: string) {
  try {
    const session = await getSessionFromEvent(this);
    if (!session) return { ok: false, reason: 'no_session' } as const;
    if (!photoUrl) return { ok: false, reason: 'empty' } as const;
    const fullUrl = resolveUploadUrl(this, photoUrl);
    await saveOwnerProfilePhoto(session.userId, fullUrl);
    return { ok: true } as const;
  } catch (e: any) {
    return { ok: false, reason: e.message || 'Error de conexión (502)' } as const;
  }
});

const savePetServer = server$(async function (payload: OwnerPetPayload) {
  try {
    const session = await getSessionFromEvent(this);
    if (!session) return { ok: false, reason: 'no_session', pets: [] as OwnerPetRecord[] } as const;
    await saveOwnerPet(session.userId, payload);
    const pets = await listOwnerPets(session.userId);
    return { ok: true, pets } as const;
  } catch (err: any) {
    console.error('[savePetServer]', err);
    return { ok: false, reason: err.message || 'Error de conexión con el servidor (502). Intenta de nuevo.', pets: [] as OwnerPetRecord[] } as const;
  }
});

const deletePetServer = server$(async function (petId: string) {
  try {
    const session = await getSessionFromEvent(this);
    if (!session) return { ok: false, reason: 'no_session', pets: [] as OwnerPetRecord[] } as const;
    await deleteOwnerPet(session.userId, petId);
    const pets = await listOwnerPets(session.userId);
    return { ok: true, pets } as const;
  } catch (e: any) {
    return { ok: false, reason: e.message || 'Error de conexión (502)', pets: [] as OwnerPetRecord[] } as const;
  }
});

const loadOwnerServices = server$(async function () {
  const session = await getSessionFromEvent(this);
  if (!session) return [] as ServiceRequest[];
  return await listOwnerServices(session.userId);
});

const rateServiceServer = server$(async function (stars: number, comment: string) {
  const session = await getSessionFromEvent(this);
  if (!session) return { ok: false, reason: 'no_session' } as const;
  return await rateOwnerService(session.userId, stars, comment);
});



export default component$(() => {
  useStyles$(leafletStyles);

  // Marca / estilos

  const brand = {

    primary: '#4a2e85',

    yellow: '#f6e527',

    orange: '#ef7c43',

    bg: '#f6f6f6',

  };

  const btnPrimary =

    'px-4 py-2 rounded-xl bg-gradient-to-r from-[#f6e527] to-[#ef7c43] text-[#4a2e85] font-semibold hover:from-[#ef7c43] hover:to-[#f6e527] transition-all';

  const btnSecondary = 'px-4 py-2 rounded-xl bg-[#4a2e85]/10 text-[#4a2e85] font-semibold hover:bg-[#4a2e85]/20 transition-all';

  const btnGhost = 'px-3 py-2 rounded-lg text-sm text-[#4a2e85] hover:bg-[#4a2e85]/5';

  const dashboardData = useOwnerDashboard();
  const profileSeed = dashboardData.value?.profile;
  const emergencySeed = profileSeed?.emergencyContact || { name: '', phone: '', relationship: '', address: '' };
  const petsSeed = (dashboardData.value?.pets || []).map(mapPetRowToUi);
  const servicesSeed = dashboardData.value?.services || [];
  const reviewsSeed = dashboardData.value?.reviews || [];

  const petsCarouselRef = useSignal<Element>();

  useVisibleTask$(({ cleanup }) => {
    const el = petsCarouselRef.value as HTMLElement;
    if (!el) return;
    let isHovering = false;

    el.addEventListener('mouseenter', () => isHovering = true);
    el.addEventListener('mouseleave', () => isHovering = false);
    el.addEventListener('touchstart', () => isHovering = true, { passive: true });
    el.addEventListener('touchend', () => { setTimeout(() => isHovering = false, 1000); }, { passive: true });

    const interval = setInterval(() => {
      if (isHovering || !el || el.children.length < 2) return;
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (maxScroll <= 0) return;

      if (el.scrollLeft >= maxScroll - 10) {
        el.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        const itemWidth = (el.children[0] as HTMLElement).offsetWidth || 280;
        const gap = 16;
        el.scrollBy({ left: itemWidth + gap, behavior: 'smooth' });
      }
    }, 3500);
    cleanup(() => clearInterval(interval));
  });




  // Estado global

  const state = useStore({

    activeRoute: 'dashboard' as RouteKey,

    // Perfil inicial (algunos campos vacos para simular flujo)

    profile: {

      id: '',

      fullName: profileSeed?.fullName || '',

      email: profileSeed?.email || '',

      primaryPhone: profileSeed?.primaryPhone || '',

      alternativePhone: profileSeed?.alternativePhone || '',

      cedula: profileSeed?.cedula || '',

      address: profileSeed?.address || '',

      zone: profileSeed?.zone || '',

      biometricSelfie: profileSeed?.biometricSelfie || '',

      locationLat: profileSeed?.locationLat || '',

      locationLng: profileSeed?.locationLng || '',

      addressDetail: profileSeed?.addressDetail || '',

      profilePhoto: normalizeImageUrl(profileSeed?.profilePhoto),

      displayName: profileSeed?.displayName || '',

      bio: profileSeed?.bio || '',

      photoWithPet: normalizeImageUrl(profileSeed?.photoWithPet),

      emergencyContact: {
        name: emergencySeed.name || '',
        phone: emergencySeed.phone || '',
        relationship: emergencySeed.relationship || '',
        address: emergencySeed.address || '',
      },

      personalReferences: normalizeRefs(profileSeed?.personalReferences),

      familyReferences: normalizeRefs(profileSeed?.familyReferences),

      phoneVerified: profileSeed?.phoneVerified || false,

      emailVerified: profileSeed?.emailVerified || false,

      isVerified: profileSeed?.isVerified || false,

      rating: profileSeed?.rating || 0,

      totalReviews: profileSeed?.totalReviews || 0,

      completeness: profileSeed?.completeness || 0,

    } as OwnerProfile,

    pets: petsSeed as Pet[],
    services: servicesSeed as ServiceRequest[],
    reviews: reviewsSeed as Review[],



    // UI/Forms

    editPetId: '' as string,

    // errores de validación por formulario

    errors: {} as Record<string, string>,

    toast: '' as string,

    // Loading states
    isRegisteringOwner: false,
    isSavingProfile: false,
    isSavingPet: false,
    isDeletingPet: false,
    isSubmittingRating: false,
    isUploadingPhoto: false,
    isUploadingVaccine: false,

  });

  useTask$(({ track }) => {
    track(() => dashboardData.value);
    const data = dashboardData.value;
    if (!data) return;

    Object.assign(state.profile, {
      fullName: data.profile.fullName || '',
      email: data.profile.email || '',
      primaryPhone: data.profile.primaryPhone || '',
      alternativePhone: data.profile.alternativePhone || '',
      cedula: data.profile.cedula || '',
      address: data.profile.address || '',
      zone: data.profile.zone || '',
      biometricSelfie: data.profile.biometricSelfie || '',
      locationLat: data.profile.locationLat || '',
      locationLng: data.profile.locationLng || '',
      addressDetail: data.profile.addressDetail || '',
      profilePhoto: normalizeImageUrl(data.profile.profilePhoto),
      displayName: data.profile.displayName || '',
      bio: data.profile.bio || '',
      photoWithPet: normalizeImageUrl(data.profile.photoWithPet),
      emergencyContact: data.profile.emergencyContact || {
        name: '',
        phone: '',
        relationship: '',
        address: '',
      },
      personalReferences: normalizeRefs(data.profile.personalReferences),
      familyReferences: normalizeRefs(data.profile.familyReferences),
      phoneVerified: data.profile.phoneVerified || false,
      emailVerified: data.profile.emailVerified || false,
      isVerified: data.profile.isVerified || false,
      rating: data.profile.rating || 0,
      totalReviews: data.profile.totalReviews || 0,
      completeness: data.profile.completeness || 0,
    });

    state.pets = (data.pets || []).map(mapPetRowToUi);
    state.services = data.services || [];
    state.reviews = data.reviews || [];
  });




  const mapRef = useSignal<HTMLElement>();
  const mapInstance = useSignal<any>();
  const markerInstance = useSignal<any>();

  const getLocation = $(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      state.toast = 'Geolocalización no disponible en este navegador.';
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        state.profile.locationLat = lat;
        state.profile.locationLng = lng;
      },
      () => {
        state.toast = 'No se pudo obtener tu ubicación.';
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    track(() => state.activeRoute);
    track(() => state.profile.locationLat);
    track(() => state.profile.locationLng);

    if (state.activeRoute !== 'edit-owner' || !mapRef.value) return;

    // Fix Leaflet's default icon path issues with webpack/vite
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const leaflet = await import('leaflet');
    const L = (leaflet as any).default || leaflet;

    delete (L.Icon.Default.prototype as any)._getIconUrl;

    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });

    const lat = Number(state.profile.locationLat || '10.488');
    const lng = Number(state.profile.locationLng || '-66.879');

    if (!mapInstance.value) {
      mapInstance.value = L.map(mapRef.value).setView([lat, lng], 12);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(mapInstance.value);
      markerInstance.value = L.marker([lat, lng]).addTo(mapInstance.value);

      // Fix map sizing in container
      setTimeout(() => {
        mapInstance.value.invalidateSize();
      }, 100);
      return;
    }

    mapInstance.value.setView([lat, lng], 12);
    if (markerInstance.value) markerInstance.value.setLatLng([lat, lng]);

    // Fix map sizing in container
    setTimeout(() => {
      mapInstance.value.invalidateSize();
    }, 100);
  });

  /* ------------------------------

     Helpers / Validaciones

  --------------------------------*/

  const setRoute = $((r: RouteKey) => {

    state.activeRoute = r;

    state.toast = '';

    state.errors = {};

    // Pre-fill displayName and zone if they're empty when entering edit-owner mode
    if (r === 'edit-owner') {
      if (!state.profile.displayName && state.profile.fullName) {
        state.profile.displayName = state.profile.fullName;
      }
      if (!state.profile.zone && state.profile.address) {
        state.profile.zone = state.profile.address;
      }
    }

  });






  const petDraft = useStore<Partial<Pet>>({

    id: '',

    name: '',

    species: 'perro',

    breed: '',

    photo: '',

    age: 0,

    sex: 'macho',

    weight: 0,

    size: undefined,

    behavior: [],

    medicalConditions: '',

    allergies: '',

    vaccinationCard: '',

    hasIdTag: false,

    active: true,

  });



  const validatePet = $(() => {

    const e: Record<string, string> = {};

    if (!petDraft.name) e.name = 'Nombre obligatorio';

    if (!petDraft.species) e.species = 'Especie obligatoria';

    if (!petDraft.breed) e.breed = 'Raza obligatoria';

    if (!petDraft.photo) e.photo = 'Foto de la mascota obligatoria';

    if (!petDraft.age || petDraft.age < 0) e.age = 'Edad inválida';

    if (!petDraft.sex) e.sex = 'Sexo obligatorio';

    if (!petDraft.weight || petDraft.weight <= 0) e.weight = 'Peso inválido';

    if (petDraft.species === 'perro' && !petDraft.size) e.size = 'Tamaño obligatorio para perros';

    if (!petDraft.behavior || petDraft.behavior.length === 0) e.behavior = 'Al menos un comportamiento';

    if (!petDraft.vaccinationCard) e.vaccinationCard = 'Tarjeta de vacunación obligatoria';

    if (!petDraft.hasIdTag) e.hasIdTag = 'Debe confirmar que tiene placa/identificación';

    state.errors = e;

    return Object.keys(e).length === 0;

  });



  const canStartNewService = $(() => {

    // Regla: el dueño NO puede iniciar nuevo servicio si existe uno "completed" sin ownerRating.

    const lastCompleted = state.services.find((s) => s.status === 'completed' && typeof s.ownerRating === 'undefined');

    return !lastCompleted;

  });






  /* ------------------------------

     Acciones (simuladas)

  --------------------------------*/


  const actionSaveProfile = $(async () => {
    if (!state.profile.fullName) {
      state.toast = 'El nombre completo es obligatorio.';
      return;
    }

    state.isSavingProfile = true;
    try {
      const payload: OwnerProfilePayload = {
        fullName: state.profile.fullName,
        email: state.profile.email,
        primaryPhone: state.profile.primaryPhone,
        alternativePhone: state.profile.alternativePhone,
        cedula: state.profile.cedula,
        address: state.profile.address,
        zone: state.profile.zone,
        biometricSelfie: state.profile.biometricSelfie,
        locationLat: state.profile.locationLat,
        locationLng: state.profile.locationLng,
        addressDetail: state.profile.addressDetail,
        emergencyContact: {
          ...state.profile.emergencyContact,
          address: state.profile.emergencyContact.address || '',
        },
        personalReferences: state.profile.personalReferences,
        familyReferences: state.profile.familyReferences,
        displayName: state.profile.displayName,
        bio: state.profile.bio,
        hasOwnPet: false,
      };

      const result = await saveOwnerProfile(payload);
      if (!result.ok) {
        state.toast = result.reason === 'no_session' ? 'Debes iniciar sesión.' : (result.reason || 'Error actualizando perfil.');
        return;
      }

      state.profile.completeness = Math.max(60, state.profile.completeness);
      state.toast = 'Perfil actualizado correctamente.';
      await setRoute('dashboard');
    } finally {
      state.isSavingProfile = false;
    }
  });



  const actionSavePet = $(async () => {

    if (!(await validatePet())) {

      state.toast = 'Revisa los campos de la mascota.';

      return;

    }

    state.isSavingPet = true;
    try {
      const payload: OwnerPetPayload = {
        id: petDraft.id || undefined,
        name: petDraft.name || '',
        species: petDraft.species || '',
        breed: petDraft.breed || '',
        photo: petDraft.photo || '',
        age: petDraft.age || 0,
        sex: petDraft.sex || '',
        weight: petDraft.weight || 0,
        size: petDraft.species === 'perro' ? petDraft.size : undefined,
        behavior: (petDraft.behavior as string[]) || [],
        medicalConditions: petDraft.medicalConditions || '',
        allergies: petDraft.allergies || '',
        vaccinationCard: petDraft.vaccinationCard || '',
        hasIdTag: !!petDraft.hasIdTag,
        active: true,
      };

      const result = await savePetServer(payload);
      if (!result.ok) {
        state.toast = result.reason || 'No se pudo guardar la mascota.';
        return;
      }

      state.pets = result.pets.map(mapPetRowToUi);
      state.toast = petDraft.id ? 'Mascota actualizada.' : 'Mascota registrada.';

      // limpiar draft y navegar

      Object.assign(petDraft, {

        id: '',

        name: '',

        species: 'perro',

        photo: '',

        age: 0,

        sex: 'macho',

        weight: 0,

        size: undefined,

        behavior: [],

        medicalConditions: '',

        allergies: '',

        vaccinationCard: '',

        hasIdTag: false,

        active: true,

      });

      await setRoute('dashboard');
    } finally {
      state.isSavingPet = false;
    }

  });

  const deletePet = $(async (petId: string) => {
    state.isDeletingPet = true;
    try {
      const result = await deletePetServer(petId);
      if (!result.ok) {
        state.toast = result.reason || 'No se pudo eliminar la mascota.';
        return;
      }
      state.pets = result.pets.map(mapPetRowToUi);
      if (state.editPetId === petId) state.editPetId = '';
      state.toast = 'Mascota eliminada.';
    } finally {
      state.isDeletingPet = false;
    }
  });

  const openEditPet = $(async (petId: string) => {
    const selectedPet = state.pets.find((pet) => pet.id === petId);
    if (!selectedPet) {
      state.toast = 'No se encontró la mascota seleccionada.';
      return;
    }

    state.editPetId = petId;
    Object.assign(petDraft, {
      ...selectedPet,
      behavior: Array.isArray(selectedPet.behavior) ? [...selectedPet.behavior] : [],
    });

    await setRoute('edit-pet');

    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  useTask$(({ track }) => {
    track(() => state.activeRoute);
    track(() => state.editPetId);
    track(() => state.pets.length);

    if (state.activeRoute !== 'edit-pet' || !state.editPetId) return;

    const selectedPet = state.pets.find((pet) => pet.id === state.editPetId);
    if (!selectedPet) return;

    Object.assign(petDraft, {
      ...selectedPet,
      behavior: Array.isArray(selectedPet.behavior) ? [...selectedPet.behavior] : [],
    });
  });






  const rateLastService = $(async (stars: number, comment: string) => {
    const result = await rateServiceServer(stars, comment);
    if (!result.ok) {
      state.toast = 'No hay servicios por calificar.';
      return;
    }
    state.services = await loadOwnerServices();
    state.toast = 'Gracias por tu calificación.';
  });



  /* ------------------------------

     Render

  --------------------------------*/

  return (

    <div class="min-h-screen" style={{ background: brand.bg }} data-vt="owner-panel-page">

      <div class="py-6 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto" data-vt="owner-panel-shell">

        {/* Header */}

        <header class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6" data-vt="owner-panel-header">

          <div class="flex items-center gap-3">

            <div class="h-12 w-12 rounded-xl bg-gradient-to-br from-[#f6e527] to-[#ef7c43] flex items-center justify-center">

              <svg class="w-6 h-6 text-[#4a2e85]" fill="none" stroke="currentColor" viewBox="0 0 24 24">

                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />

              </svg>

            </div>

            <div>

              <h1 class="text-2xl font-extrabold text-[#4a2e85]">Panel de dueño</h1>

              <p class="text-sm" style={{ color: '#4a2e85b3' }}>Gestiona tu perfil, mascotas, reservas y reseñas.</p>

            </div>

          </div>



          <div class="flex flex-wrap items-center gap-2">
            <VerificationBadge verified={!!state.profile.isVerified} />
          </div>

        </header>



        {/* "Rutas" de navegacin (simuladas) */}

        {/* Navegacin interna */}

        <nav class="flex gap-2 flex-wrap mb-6" data-vt="owner-panel-tabs">

          {[

            { key: 'dashboard', label: 'Resumen' },
            { key: 'add-pet', label: 'Mascotas' },



            { key: 'owner-profile', label: 'Mi perfil' },

            { key: 'owner-reviews', label: 'Reseñas' },

            { key: 'rules-security', label: 'Reglas' },

          ].map((t) => (

            <button

              key={t.key}

              class={`px-3 py-2 rounded-lg text-sm ${state.activeRoute === (t.key as RouteKey) ? 'bg-[#4a2e85]/10' : 'hover:bg-[#4a2e85]/5'

                }`}

              style={{ color: brand.primary }}

              onClick$={() => setRoute(t.key as RouteKey)}

            >

              {t.label}

            </button>

          ))}

        </nav>



        {/* Toast */}

        {state.toast && (

          <div class="mb-4">

            <Card class="p-3 border-amber-200 bg-amber-50 text-amber-800">
              {state.toast.includes('::') ? (
                <div class="flex flex-col gap-2">
                  <span>{state.toast.split('::')[0]}</span>
                  <Link href={`/dashboard/chat/${state.toast.split('::')[1]}`} class="font-bold underline text-amber-900">
                    Ver servicio activo
                  </Link>
                </div>
              ) : (
                state.toast
              )}
            </Card>

          </div>

        )}



        {/* DASHBOARD */}

        {state.activeRoute === 'dashboard' && (

          <div class="space-y-6">

            <Card class="p-6">
              <div class="flex flex-col md:flex-row gap-4 md:items-start md:justify-between">
                <div class="flex items-start gap-4">
                  <div class="space-y-2">
                    <div class="h-20 w-20 rounded-2xl border border-[#4a2e85]/20 overflow-hidden bg-[#4a2e85]/5 relative group">
                      {state.profile.profilePhoto ? (
                        <ImageWithRetry
                          src={state.profile.profilePhoto}
                          alt={state.profile.displayName || state.profile.fullName || 'Dueño'}
                          width={80}
                          height={80}
                          layout="constrained"
                          class="h-full w-full object-cover"
                        />
                      ) : (
                        <div class="h-full w-full grid place-items-center text-xs text-[#4a2e85b3]">Sin foto</div>
                      )}
                      <button
                        onClick$={() => setRoute('edit-owner')}
                        class="absolute inset-0 bg-black/40 text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-1 text-center"
                      >
                        Cambiar foto
                      </button>
                    </div>
                  </div>
                  <div class="space-y-1">
                    <div class="flex items-center gap-2 flex-wrap">
                      <h3 class="text-xl font-extrabold text-[#4a2e85]">{state.profile.displayName || state.profile.fullName || 'Dueño'}</h3>
                      <VerificationBadge verified={!!state.profile.isVerified} size="sm" />
                    </div>
                    <p class="text-sm text-[#4a2e85b3]">{state.profile.zone || 'Ubicación por completar'}</p>
                    <p class="text-sm text-[#4a2e85b3] line-clamp-2">{state.profile.bio || 'Completa tu biografía para mejorar cómo te ven los cuidadores.'}</p>
                  </div>
                </div>
                <div class="text-right">
                  <div class="text-xs text-[#4a2e85b3]">Calificación</div>
                  <div class="text-2xl font-black text-[#4a2e85]">{state.profile.rating.toFixed(1)}</div>
                  <div class="text-xs text-[#4a2e85b3]">{state.profile.totalReviews} reseñas</div>
                </div>
              </div>

              <div class="mt-4 grid sm:grid-cols-3 gap-3">
                <div class="rounded-xl bg-[#4a2e85]/5 border border-[#4a2e85]/10 p-3">
                  <div class="text-xs text-[#4a2e85b3]">Mascotas registradas</div>
                  <div class="text-sm font-semibold text-[#4a2e85]">{state.pets.length}</div>
                </div>
                <div class="rounded-xl bg-[#4a2e85]/5 border border-[#4a2e85]/10 p-3">
                  <div class="text-xs text-[#4a2e85b3]">Completitud de perfil</div>
                  <div class="text-sm font-semibold text-[#4a2e85]">{state.profile.completeness}%</div>
                </div>
                <div class="rounded-xl bg-[#4a2e85]/5 border border-[#4a2e85]/10 p-3">
                  <div class="text-xs text-[#4a2e85b3]">Mascota principal</div>
                  <div class="text-sm font-semibold text-[#4a2e85]">{state.pets[0]?.name || 'Sin mascota'}</div>
                </div>
              </div>
            </Card>

            <div class="grid grid-cols-1 md:grid-cols-4 gap-6">

              <Card class="p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-[#4a2e85]/20">

                <div class="flex items-center">

                  <div class="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center"></div>

                  <div class="ml-3">

                    <p class="text-sm text-gray-500">Mascotas</p>

                    <p class="text-2xl font-semibold">{state.pets.length}</p>

                  </div>

                </div>

              </Card>

              <Card class="p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-[#4a2e85]/20">

                <div class="flex items-center">

                  <div class="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center"></div>

                  <div class="ml-3">

                    <p class="text-sm text-gray-500">Servicios completados</p>

                    <p class="text-2xl font-semibold">{state.services.filter((s) => s.status === 'completed').length}</p>

                  </div>

                </div>

              </Card>

              <Card class="p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-[#4a2e85]/20">

                <div class="flex items-center">

                  <div class="w-8 h-8 rounded-lg bg-yellow-100 flex items-center justify-center"></div>

                  <div class="ml-3">

                    <p class="text-sm text-gray-500">Calificación</p>

                    <p class="text-2xl font-semibold">{state.profile.rating.toFixed(1)}</p>

                  </div>

                </div>

              </Card>

              <Card class="p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-[#4a2e85]/20">

                <div class="flex items-center">

                  <div class="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">%</div>

                  <div class="ml-3">

                    <p class="text-sm text-gray-500">Perfil completado</p>

                    <p class="text-2xl font-semibold">{state.profile.completeness}%</p>

                  </div>

                </div>

              </Card>

            </div>



            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

              <Card class="p-6">

                <h3 class="text-lg font-semibold mb-4">Servicios activos o aceptados</h3>

                <div class="space-y-3">

                  {state.services

                    .filter((s) => s.status === 'in_progress' || s.status === 'accepted')

                    .map((s) => (

                      <div key={s.id} class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">

                        <div>

                          <p class="font-medium">Servicio #{s.id}</p>

                          <p class="text-xs text-gray-600">

                            {s.startDate}  {s.endDate}

                          </p>

                        </div>

                        <Badge text={s.status === 'in_progress' ? 'En progreso' : 'Aceptado'} tone={s.status === 'in_progress' ? 'blue' : 'green'} />

                      </div>

                    ))}

                  {state.services.filter((s) => s.status === 'in_progress' || s.status === 'accepted').length === 0 ? (
                    <div class="py-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                      <LuCalendar class="w-10 h-10 text-gray-300 mx-auto mb-2" />
                      <p class="text-sm text-gray-500 font-medium">No hay servicios activos o aceptados.</p>
                    </div>
                  ) : null}

                </div>

              </Card>



              <Card class="p-6">

                <h3 class="text-lg font-semibold mb-4">Últimas reseñas</h3>

                {state.reviews.map((r) => (

                  <div key={r.id} class="border-l-4 border-yellow-400 pl-4 mb-3">

                    <div class="flex items-center justify-between">

                      <p class="font-medium">{r.reviewerName || r.reviewerId || 'Cuidador'}</p>

                      <StarRating rating={r.rating} />

                    </div>

                    <p class="text-sm text-gray-600">{r.comment}</p>

                    <p class="text-xs text-gray-500">Para {r.petName}  {r.date}</p>

                  </div>

                ))}

                {state.reviews.length === 0 && (
                  <div class="py-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    <LuMessageSquare class="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p class="text-sm text-gray-500 font-medium">Sin reseñas aún.</p>
                  </div>
                )}

              </Card>

            </div>



            {/* Bloqueo por calificación pendiente */}

            {!canStartNewService() && (

              <Card class="p-4 bg-rose-50 border-rose-200 text-rose-800">

                Debes <b>calificar al último cuidador</b> antes de solicitar un nuevo servicio.

                <div class="mt-3 flex gap-2">

                  <button class={btnPrimary} onClick$={() => setRoute('owner-reviews')}>Ir a calificar</button>

                </div>

              </Card>

            )}



            {/* Mascotas y acción para solicitar servicio */}
            <Card class="p-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold">Mis mascotas</h3>
                <button class={btnPrimary} onClick$={() => setRoute('add-pet')}>Agregar Mascota</button>
              </div>
              <style>{`
                .pets-carousel::-webkit-scrollbar { display: none; }
              `}</style>
              <div
                ref={petsCarouselRef}
                class="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-4 pets-carousel"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                {state.pets.map((pet) => (
                  <div key={pet.id} class="p-4 rounded-lg border bg-white snap-center shrink-0 w-[280px]">
                    <ImageWithRetry
                      src={pet.photo || '/images/default-pet.jpg'}
                      class="w-20 h-20 object-cover rounded-full mx-auto"
                      width={80}
                      height={80}
                      layout="constrained"
                      alt={pet.name}
                    />
                    <p class="mt-2 text-center font-medium">{pet.name}</p>
                    <div class="mt-3 flex flex-wrap justify-center gap-2">
                      <button class={btnSecondary} onClick$={() => openEditPet(pet.id)}>Editar</button>
                      <button class={btnGhost} onClick$={() => deletePet(pet.id)}>Eliminar</button>
                      <Link href="/dashboard/caregiver-search" class={btnPrimary + " w-full text-center mt-2"}>Buscar cuidador</Link>
                    </div>
                  </div>
                ))}
                {state.pets.length === 0 ? (
                  <div class="py-10 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200 w-[calc(100vw-80px)] lg:w-[calc(100%-16px)] flex flex-col items-center justify-center pointer-events-none">
                    <LuDog class="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p class="text-gray-500 font-medium">Aún no has registrado mascotas.</p>
                  </div>
                ) : null}
              </div>
            </Card>

          </div>

        )}






        {/* /owner/add-pet */}

        {state.activeRoute === 'add-pet' && (

          <Card class="p-6 shadow-xl border-[#4a2e85]/5">
            <h2 class="text-xl font-bold text-[#4a2e85] mb-6 flex items-center gap-2">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Registro de Mascota
            </h2>

            <div class="space-y-8">
              {/* Photo Section */}
              <section class="flex flex-col sm:flex-row items-center gap-6 p-5 rounded-2xl bg-[#4a2e85]/5 border border-[#4a2e85]/10">
                <div class="h-24 w-24 rounded-full border-2 border-white overflow-hidden bg-white shadow-md">
                  {petDraft.photo ? (
                    <ImageWithRetry
                      src={petDraft.photo}
                      alt="Pet"
                      class="h-full w-full object-cover"
                      width={96}
                      height={96}
                      layout="constrained"
                    />
                  ) : (
                    <div class="h-full w-full grid place-items-center text-gray-200">
                      <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </div>
                  )}
                </div>
                <div class="flex-1 text-center sm:text-left">
                  <h3 class="text-sm font-bold text-[#4a2e85] mb-2">Foto de la mascota</h3>
                  <label class="inline-flex px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#4a2e85] to-[#6b47b8] text-white text-xs font-bold cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all">
                    <input
                      type="file"
                      class="hidden"
                      accept="image/*"
                      onChange$={async (e: any, el: HTMLInputElement) => {
                        const file = el.files?.[0];
                        if (!file) return;
                        state.isUploadingPhoto = true;
                        try {
                          const reader = new FileReader();
                          reader.onload = async () => {
                            const originalDataUrl = String(reader.result || '');
                            const optimizedDataUrl = await resizeImage(originalDataUrl);
                            const res = await uploadImage(optimizedDataUrl);
                            if (res.ok) {
                              petDraft.photo = res.path || res.url;
                              state.toast = 'Foto cargada correctamente';
                            } else {
                              state.toast = 'Error subiendo imagen';
                            }
                            state.isUploadingPhoto = false;
                          };
                          reader.readAsDataURL(file);
                        } catch (err) {
                          console.error(err);
                          state.isUploadingPhoto = false;
                        }
                      }}
                    />
                    {state.isUploadingPhoto ? (
                      <div class="flex items-center gap-2">
                        <span>Subiendo...</span>
                      </div>
                    ) : (
                      'Seleccionar imagen'
                    )}
                  </label>
                  <p class="text-[10px] text-gray-400 mt-2 italic font-medium">PNG, JPG de hasta 5MB.</p>
                </div>
              </section>

              {/* Basic Info */}
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <BoundInput label="Nombre" bindKey="name" store={petDraft} error={state.errors.name} />
                <Select label="Especie" bindKey="species" store={petDraft} options={['perro', 'gato', 'ave', 'conejo', 'cobayo', 'hamster', 'otro']} error={state.errors.species} />
                <BoundInput label="Raza" bindKey="breed" store={petDraft} error={state.errors.breed} />
                <BoundNumber label="Edad (años)" bindKey="age" store={petDraft} error={state.errors.age} />
                <Select label="Sexo" bindKey="sex" store={petDraft} options={['macho', 'hembra']} error={state.errors.sex} />
                <BoundNumber label="Peso (kg)" bindKey="weight" store={petDraft} step="0.1" error={state.errors.weight} />
                {petDraft.species === 'perro' && (
                  <Select label="Tamaño" bindKey="size" store={petDraft} options={['pequeño', 'mediano', 'grande']} error={state.errors.size} />
                )}
              </div>

              {/* Health & Documentation */}
              <div class="space-y-6">
                <h3 class="text-xs font-bold text-[#4a2e85] uppercase tracking-[0.2em] opacity-50">Salud y Comportamiento</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <BoundInput
                    label="Comportamiento (características)"
                    bindKey="behavior"
                    store={petDraft}
                    hint="Ej: amigable, tímido, juguetón"
                    asCSV
                    error={state.errors.behavior}
                  />
                  <BoundInput label="Condiciones médicas" bindKey="medicalConditions" store={petDraft} />
                  <BoundInput label="Alergias" bindKey="allergies" store={petDraft} />

                  <div class="space-y-4">
                    <label class="block text-sm font-semibold text-[#4a2e85]">Documentación Requerida</label>
                    <div class="p-5 rounded-2xl border border-[#4a2e85]/10 bg-white shadow-sm space-y-4">
                      <Checkbox label="Posee placa de identificación" bindKey="hasIdTag" store={petDraft} error={state.errors.hasIdTag} />

                      <div class="pt-4 border-t border-gray-100">
                        <label class="block text-xs font-bold text-[#4a2e85] mb-2 uppercase tracking-tight">Tarjeta de vacunación</label>
                        <div class="flex items-center gap-3">
                          <div class="flex-1 px-4 py-2 bg-gray-50 border border-dashed border-[#4a2e85]/20 rounded-xl flex items-center justify-between">
                            <span class="text-[10px] text-[#4a2e85] font-medium truncate">
                              {petDraft.vaccinationCard ? 'Documento cargado' : 'No se ha subido archivo'}
                            </span>
                            {petDraft.vaccinationCard && (
                              <a href={petDraft.vaccinationCard} target="_blank" class="text-[10px] font-bold text-[#ef7c43] hover:underline uppercase tracking-tighter">Ver</a>
                            )}
                          </div>
                          <label class={`flex-shrink-0 px-4 py-2 rounded-xl border border-[#4a2e85]/10 text-[#4a2e85] text-[10px] font-bold cursor-pointer hover:bg-[#4a2e85]/5 transition-colors uppercase tracking-widest ${state.isUploadingVaccine ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            {state.isUploadingVaccine ? (
                              <div class="flex items-center gap-1">
                                <span>Subiendo...</span>
                              </div>
                            ) : (
                              'Subir'
                            )}
                            <input
                              type="file"
                              class="hidden"
                              disabled={state.isUploadingVaccine}
                              accept="image/*,application/pdf"
                              onChange$={async (e: any, el: HTMLInputElement) => {
                                const file = el.files?.[0];
                                if (!file) return;
                                state.isUploadingVaccine = true;
                                try {
                                  const reader = new FileReader();
                                  reader.onload = async () => {
                                    const dataUrl = String(reader.result || '');
                                    const res = await uploadImage(dataUrl);
                                    if (res.ok) {
                                      petDraft.vaccinationCard = res.path || res.url;
                                      state.toast = 'Tarjeta de vacunación cargada';
                                    } else {
                                      state.toast = 'Error al subir documento';
                                    }
                                    state.isUploadingVaccine = false;
                                  };
                                  reader.readAsDataURL(file);
                                } catch (err) {
                                  console.error(err);
                                  state.isUploadingVaccine = false;
                                }
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="mt-10 flex flex-col-reverse sm:flex-row justify-end gap-3 pt-6 border-t border-[#4a2e85]/10">
              <button class="px-6 py-3 rounded-xl border border-[#4a2e85]/10 text-[#4a2e85] font-bold hover:bg-[#4a2e85]/5 transition-all text-sm uppercase tracking-widest" onClick$={() => setRoute('dashboard')}>
                Cancelar
              </button>
              <button class="px-8 py-3 rounded-xl bg-gradient-to-r from-[#ef7c43] to-[#f6e527] text-white font-black shadow-lg shadow-[#ef7c43]/20 hover:shadow-xl hover:scale-[1.02] active:scale-95 transition-all text-sm uppercase tracking-widest disabled:opacity-70 disabled:scale-100 flex items-center justify-center gap-2" disabled={state.isSavingPet} onClick$={actionSavePet}>
                {state.isSavingPet && <svg class="w-4 h-4 animate-spin text-[#4a2e85]" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>}
                <span class={state.isSavingPet ? "text-[#4a2e85] mix-blend-color-burn" : "text-[#4a2e85]"}>{state.isSavingPet ? 'Guardando...' : 'Guardar Mascota'}</span>
              </button>
            </div>





            <div class="mt-10 pt-8 border-t border-[#4a2e85]/10">
              <h3 class="text-lg font-bold text-[#4a2e85] mb-6 flex items-center gap-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                Tus mascotas registradas
              </h3>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {state.pets.map((pet) => (
                  <div key={pet.id} class="group p-5 rounded-2xl border border-[#4a2e85]/10 bg-white hover:shadow-xl hover:border-[#ef7c43]/30 transition-all duration-300">
                    <div class="relative w-24 h-24 mx-auto mb-4">
                      <div class="absolute inset-0 rounded-full bg-gradient-to-tr from-[#f6e527] to-[#ef7c43] opacity-20 group-hover:opacity-40 transition-opacity" />
                      <ImageWithRetry
                        src={pet.photo || '/images/default-pet.jpg'}
                        class="relative w-full h-full object-cover rounded-full border-2 border-white shadow-sm"
                        width={96}
                        height={96}
                        layout="constrained"
                        alt="Pet"
                      />
                      <div class="absolute -bottom-1 -right-1 bg-white p-1.5 rounded-full shadow-md border border-[#4a2e85]/5">
                        {pet.species === 'perro' ? '🐶' : pet.species === 'gato' ? '🐱' : '🐾'}
                      </div>
                    </div>

                    <h4 class="text-center font-bold text-[#4a2e85] text-lg mb-1">{pet.name}</h4>
                    <p class="text-center text-xs text-gray-500 font-medium uppercase tracking-wide mb-4">
                      {pet.species} • {pet.sex}
                    </p>

                    <div class="flex items-center justify-center gap-2 pt-4 border-t border-gray-50">
                      <button
                        class="flex-1 py-1.5 px-3 rounded-lg border border-[#4a2e85]/10 text-[#4a2e85] text-xs font-bold hover:bg-[#4a2e85]/5 transition-colors"
                        onClick$={() => openEditPet(pet.id)}
                      >
                        Editar
                      </button>
                      <button
                        class="py-1.5 px-3 rounded-lg text-rose-500 text-xs font-bold hover:bg-rose-50 transition-colors"
                        onClick$={() => deletePet(pet.id)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}

                {state.pets.length === 0 && (
                  <div class="col-span-full py-12 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                    <svg class="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <p class="text-gray-500 font-medium">No tienes mascotas registradas. ¿Por qué no agregas una?</p>
                  </div>
                )}
              </div>
            </div>



            <FormErrors errors={state.errors} />

          </Card>

        )}



        {/* /owner/edit */}

        {state.activeRoute === 'edit-owner' && (
          <Card class="p-6">
            <h2 class="text-xl font-bold text-[#4a2e85] mb-2 flex items-center gap-2">
              <LuUser class="w-6 h-6 text-[#ef7c43]" />
              Mi Perfil
            </h2>
            <p class="text-sm text-gray-500 mb-6">Administra tu información pública y datos de verificación.</p>

            <div class="space-y-8">
              {/* Profile Photo Section */}
              <section class="p-5 rounded-2xl bg-[#4a2e85]/5 border border-[#4a2e85]/10">
                <h3 class="text-sm font-bold text-[#4a2e85] mb-4 uppercase tracking-wider">Foto de perfil</h3>
                <div class="flex items-center gap-6">
                  <div class="h-24 w-24 rounded-full border-2 border-white overflow-hidden bg-white shadow-md">
                    {state.profile.profilePhoto ? (
                      <ImageWithRetry
                        src={state.profile.profilePhoto}
                        alt="Profile"
                        class="h-full w-full object-cover"
                        width={96}
                        height={96}
                        layout="constrained"
                      />
                    ) : (
                      <div class="h-full w-full grid place-items-center text-gray-300">
                        <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                      </div>
                    )}
                  </div>
                  <div class="flex-1">
                    <label class={`inline-flex px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#4a2e85] to-[#ef7c43] text-white text-xs font-bold cursor-pointer hover:shadow-lg transition-all ${state.isUploadingPhoto ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      {state.isUploadingPhoto ? (
                        <div class="flex items-center gap-2">
                          <span>Subiendo...</span>
                        </div>
                      ) : (
                        'Cambiar foto'
                      )}
                      <input
                        type="file"
                        class="hidden"
                        disabled={state.isUploadingPhoto}
                        accept="image/*"
                        onChange$={async (e: any, el: HTMLInputElement) => {
                          const file = el.files?.[0];
                          if (!file) return;
                          state.isUploadingPhoto = true;
                          try {
                            const reader = new FileReader();
                            reader.onload = async () => {
                              const originalDataUrl = String(reader.result || '');
                              const optimizedDataUrl = await resizeImage(originalDataUrl);
                              const res = await uploadImage(optimizedDataUrl);
                              if (res.ok) {
                                const uploadedPhoto = res.path || res.url;
                                state.profile.profilePhoto = uploadedPhoto;
                                const saveResult = await saveProfilePhotoServer(uploadedPhoto);
                                if (saveResult.ok) {
                                  state.toast = 'Foto de perfil actualizada correctamente.';
                                } else {
                                  state.toast = saveResult.reason === 'no_session'
                                    ? 'Debes iniciar sesión.'
                                    : 'La foto se subió, pero no se pudo guardar en el perfil.';
                                }
                              } else {
                                state.toast = 'Error subiendo imagen.';
                              }
                              state.isUploadingPhoto = false;
                            };
                            reader.readAsDataURL(file);
                          } catch (err) {
                            console.error(err);
                            state.isUploadingPhoto = false;
                          }
                        }}
                      />
                    </label>
                    <p class="text-[10px] text-gray-500 mt-2 italic">Formatos: PNG, JPG.</p>
                  </div>
                </div>
              </section>

              {/* Public Information */}
              <section class="space-y-4">
                <h3 class="text-sm font-bold text-[#4a2e85] uppercase tracking-wider">Información Pública</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <TextInput label="Nombre visible (Display Name)" model="displayName" stateObj={state.profile} errors={state.errors} />
                  <TextInput label="Zona (Ubicación general)" model="zone" stateObj={state.profile} errors={state.errors} />
                </div>
                <TextInput label="Biografía" model="bio" textarea stateObj={state.profile} errors={state.errors} />
              </section>

              {/* Private / Verification Data */}
              <section class="space-y-6 pt-6 border-t border-gray-100">
                <h3 class="text-sm font-bold text-[#4a2e85] uppercase tracking-wider">Datos de Verificación (Privados)</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <TextInput label="Nombre completo" model="fullName" stateObj={state.profile} errors={state.errors} disabled />
                  <TextInput label="Cédula de identidad" model="cedula" stateObj={state.profile} errors={state.errors} disabled />
                  <TextInput label="Teléfono principal" model="primaryPhone" stateObj={state.profile} errors={state.errors} disabled />
                  <TextInput label="Teléfono alternativo" model="alternativePhone" stateObj={state.profile} errors={state.errors} />
                  <div class="md:col-span-2">
                    <TextInput label="Email" model="email" type="email" stateObj={state.profile} errors={state.errors} disabled />
                  </div>
                </div>
              </section>

              {/* Location Data */}
              <section class="space-y-4 pt-6 border-t border-gray-100">
                <h3 class="text-sm font-bold text-[#4a2e85] uppercase tracking-wider">Ubicación Precisa</h3>
                <TextInput label="Dirección exacta" model="address" stateObj={state.profile} errors={state.errors} />
                <TextInput label="Referencia / Detalle" model="addressDetail" textarea stateObj={state.profile} errors={state.errors} />

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <TextInput label="Latitud" model="locationLat" stateObj={state.profile} errors={state.errors} />
                  <TextInput label="Longitud" model="locationLng" stateObj={state.profile} errors={state.errors} />
                </div>
                <div class="flex items-center gap-3">
                  <button type="button" class={btnSecondary + " text-xs"} onClick$={getLocation}>
                    Obtener mi ubicación actual
                  </button>
                  <p class="text-[10px] text-gray-500 italic">Asegúrate de permitir el acceso a tu ubicación.</p>
                </div>
                <div class="w-full h-64 rounded-2xl border border-[#4a2e85]/15 bg-[#4a2e85]/5 overflow-hidden shadow-inner" ref={mapRef} />
              </section>

              {/* Safety & References */}
              <section class="space-y-8 pt-6 border-t border-gray-100">
                <div>
                  <h4 class="text-sm font-bold text-[#4a2e85] mb-4 flex items-center gap-2">
                    <span class="p-1 rounded bg-rose-100 text-rose-600">🆘</span>
                    Contacto de emergencia
                  </h4>
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <TextInput label="Nombre" model="emergencyContact.name" stateObj={state.profile} errors={state.errors} disabled />
                    <TextInput label="Teléfono" model="emergencyContact.phone" stateObj={state.profile} errors={state.errors} disabled />
                    <TextInput label="Parentesco" model="emergencyContact.relationship" stateObj={state.profile} errors={state.errors} disabled />
                    <TextInput label="Dirección" model="emergencyContact.address" stateObj={state.profile} errors={state.errors} disabled />
                  </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <h4 class="text-sm font-bold text-[#4a2e85] mb-4 flex items-center gap-2">
                      <span class="p-1 rounded bg-blue-100 text-blue-600">👤</span>
                      Referencias Personales
                    </h4>
                    {state.profile.personalReferences.map((_, i) => (
                      <div key={i} class="p-4 rounded-xl bg-gray-50 border border-gray-100 mb-4 space-y-3">
                        <TextInput label={`Nombre (${i + 1})`} model={`personalReferences.${i}.name`} stateObj={state.profile} errors={state.errors} disabled />
                        <TextInput label="Teléfono" model={`personalReferences.${i}.phone`} stateObj={state.profile} errors={state.errors} disabled />
                        <TextInput label="Relación" model={`personalReferences.${i}.relationship`} stateObj={state.profile} errors={state.errors} disabled />
                      </div>
                    ))}
                  </div>
                  <div>
                    <h4 class="text-sm font-bold text-[#4a2e85] mb-4 flex items-center gap-2">
                      <span class="p-1 rounded bg-purple-100 text-purple-600">👨‍👩‍👧</span>
                      Referencias Familiares
                    </h4>
                    {state.profile.familyReferences.map((_, i) => (
                      <div key={i} class="p-4 rounded-xl bg-gray-50 border border-gray-100 mb-4 space-y-3">
                        <TextInput label={`Nombre (${i + 1})`} model={`familyReferences.${i}.name`} stateObj={state.profile} errors={state.errors} disabled />
                        <TextInput label="Teléfono" model={`familyReferences.${i}.phone`} stateObj={state.profile} errors={state.errors} disabled />
                        <TextInput label="Relación" model={`familyReferences.${i}.relationship`} stateObj={state.profile} errors={state.errors} disabled />
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>

            <div class="mt-10 flex flex-col-reverse sm:flex-row gap-3 pt-6 border-t border-gray-100">
              <button class={btnSecondary + " flex-1"} onClick$={() => setRoute('dashboard')}>Cancelar</button>
              <button
                class={btnPrimary + " flex-[2] " + (state.isSavingProfile ? ' opacity-80 cursor-wait' : '')}
                onClick$={actionSaveProfile}
                data-no-loader="true"
                disabled={state.isSavingProfile}
              >
                {state.isSavingProfile ? (
                  <div class="flex items-center justify-center gap-2">
                    <span>Guardando cambios...</span>
                  </div>
                ) : (
                  'Guardar todos los cambios'
                )}
              </button>
            </div>
            <FormErrors errors={state.errors} />
          </Card>
        )}



        {/* /owner/pet/{id}/edit */}

        {state.activeRoute === 'edit-pet' && (
          <Card class="p-6">
            <h2 class="text-xl font-bold text-[#4a2e85] mb-6 flex items-center gap-2">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              Editar Mascota
            </h2>



            {(() => {
              const pet = state.pets.find((p) => p.id === state.editPetId);
              if (!pet) return <p class="text-gray-600">Selecciona una mascota desde el Dashboard</p>;

              return (
                <div class="space-y-8">
                  {/* Photo Section */}
                  <section class="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-2xl bg-[#4a2e85]/5 border border-[#4a2e85]/10">
                    <div class="h-24 w-24 rounded-full border-2 border-[#4a2e85]/20 overflow-hidden bg-white shadow-sm">
                      {petDraft.photo ? (
                        <ImageWithRetry
                          src={petDraft.photo}
                          alt="Pet"
                          class="h-full w-full object-cover"
                          width={96}
                          height={96}
                          layout="constrained"
                        />
                      ) : (
                        <div class="h-full w-full grid place-items-center text-gray-300">
                          <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        </div>
                      )}
                    </div>
                    <div class="flex-1 text-center sm:text-left">
                      <h3 class="text-sm font-semibold text-[#4a2e85] mb-2">Foto de la mascota</h3>
                      <label class={`inline-flex px-4 py-2 rounded-xl bg-white border border-[#4a2e85]/20 text-[#4a2e85] text-sm font-medium cursor-pointer hover:bg-[#4a2e85]/5 transition-colors flex items-center gap-2 ${state.isUploadingPhoto ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        {state.isUploadingPhoto ? (
                          <>
                            <span>Subiendo...</span>
                          </>
                        ) : (
                          'Cambiar foto'
                        )}
                        <input
                          type="file"
                          class="hidden"
                          disabled={state.isUploadingPhoto}
                          accept="image/*"
                          onChange$={async (e: any, el: HTMLInputElement) => {
                            const file = el.files?.[0];
                            if (!file) return;
                            state.isUploadingPhoto = true;
                            try {
                              const reader = new FileReader();
                              reader.onload = async () => {
                                const originalDataUrl = String(reader.result || '');
                                const optimizedDataUrl = await resizeImage(originalDataUrl);
                                const res = await uploadImage(optimizedDataUrl);
                                if (res.ok) {
                                  petDraft.photo = res.path || res.url;
                                  state.toast = 'Foto actualizada';
                                } else {
                                  state.toast = 'Error subiendo imagen';
                                }
                                state.isUploadingPhoto = false;
                              };
                              reader.readAsDataURL(file);
                            } catch (err) {
                              console.error(err);
                              state.isUploadingPhoto = false;
                            }
                          }}
                        />
                      </label>
                      <p class="text-[10px] text-gray-500 mt-2">Formatos aceptados: PNG, JPG.</p>
                    </div>
                  </section>

                  {/* Basic Info */}
                  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <BoundInput label="Nombre" bindKey="name" store={petDraft} error={state.errors.name} />
                    <Select label="Especie" bindKey="species" store={petDraft} options={['perro', 'gato', 'ave', 'conejo', 'cobayo', 'hamster', 'otro']} error={state.errors.species} />
                    <BoundNumber label="Edad (años)" bindKey="age" store={petDraft} error={state.errors.age} />
                    <Select label="Sexo" bindKey="sex" store={petDraft} options={['macho', 'hembra']} error={state.errors.sex} />
                    <BoundNumber label="Peso (kg)" bindKey="weight" store={petDraft} step="0.1" error={state.errors.weight} />
                    {petDraft.species === 'perro' && (
                      <Select label="Tamaño" bindKey="size" store={petDraft} options={['pequeño', 'mediano', 'grande']} error={state.errors.size} />
                    )}
                  </div>

                  {/* Health & Behavior */}
                  <div class="space-y-6">
                    <h3 class="text-sm font-bold text-[#4a2e85] uppercase tracking-wider">Salud y Comportamiento</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <BoundInput label="Comportamiento (separado por comas)" bindKey="behavior" store={petDraft} asCSV hint="Ej: amigable, activo, ansioso" error={state.errors.behavior} />
                      <BoundInput label="Condiciones médicas" bindKey="medicalConditions" store={petDraft} error={state.errors.medicalConditions} />
                      <BoundInput label="Alergias" bindKey="allergies" store={petDraft} error={state.errors.allergies} />
                      <div class="space-y-4">
                        <label class="block text-sm font-medium text-gray-700">Documentación y Seguridad</label>
                        <div class="p-4 rounded-xl border border-[#4a2e85]/10 space-y-3">
                          <Checkbox label="Tiene placa/identificación" bindKey="hasIdTag" store={petDraft} error={state.errors.hasIdTag} />
                          <div class="pt-2 border-t border-[#4a2e85]/5 flex items-center justify-between gap-3">
                            <div>
                              <label class="block text-xs font-semibold text-[#4a2e85] mb-2">Tarjeta de vacunación</label>
                              <label class={`inline-flex px-3 py-1.5 rounded-lg bg-white border border-[#4a2e85]/20 text-[#4a2e85] text-xs font-medium cursor-pointer hover:bg-[#4a2e85]/5 transition-colors flex items-center gap-1 ${state.isUploadingVaccine ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                {state.isUploadingVaccine ? (
                                  <>
                                    <span>Subiendo...</span>
                                  </>
                                ) : (
                                  'Subir carnet'
                                )}
                                <input
                                  type="file"
                                  class="hidden"
                                  disabled={state.isUploadingVaccine}
                                  accept="image/*"
                                  onChange$={async (e: any, el: HTMLInputElement) => {
                                    const file = el.files?.[0];
                                    if (!file) return;
                                    state.isUploadingVaccine = true;
                                    try {
                                      const reader = new FileReader();
                                      reader.onload = async () => {
                                        const originalDataUrl = String(reader.result || '');
                                        const optimizedDataUrl = await resizeImage(originalDataUrl);
                                        const res = await uploadImage(optimizedDataUrl);
                                        if (res.ok) {
                                          petDraft.vaccinationCard = res.path || res.url;
                                          state.toast = 'Carnet actualizado';
                                        } else {
                                          state.toast = 'Error subiendo carnet';
                                        }
                                        state.isUploadingVaccine = false;
                                      };
                                      reader.readAsDataURL(file);
                                    } catch (err) {
                                      console.error(err);
                                      state.isUploadingVaccine = false;
                                    }
                                  }}
                                />
                              </label>
                              {state.errors.vaccinationCard && <p class="text-[10px] text-rose-600 mt-1">{state.errors.vaccinationCard}</p>}
                            </div>
                            <div class="h-12 w-16 bg-gray-50 border border-[#4a2e85]/10 rounded shadow-sm overflow-hidden flex items-center justify-center shrink-0">
                              {petDraft.vaccinationCard ? (
                                <a href={petDraft.vaccinationCard} target="_blank" rel="noopener noreferrer">
                                  <ImageWithRetry
                                    src={petDraft.vaccinationCard}
                                    alt="Vacunas"
                                    width={64}
                                    height={48}
                                    layout="constrained"
                                    class="h-full w-full object-cover"
                                  />
                                </a>
                              ) : (
                                <span class="text-[10px] text-gray-400">Ninguna</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div class="mt-8 flex flex-col-reverse sm:flex-row justify-end gap-3 pt-6 border-t border-[#4a2e85]/10">
              <button class="px-6 py-2.5 rounded-xl border border-[#4a2e85]/20 text-[#4a2e85] font-semibold hover:bg-[#4a2e85]/5 transition-all text-sm"
                onClick$={() => {
                  Object.assign(petDraft, { id: '', name: '', species: 'perro', photo: '', age: 0, sex: 'macho', weight: 0, size: undefined, behavior: [], medicalConditions: '', allergies: '', vaccinationCard: '', hasIdTag: false, active: true, });
                  setRoute('dashboard');
                }}>
                Cancelar
              </button>
              <button class="px-8 py-2.5 rounded-xl bg-gradient-to-r from-[#f6e527] to-[#ef7c43] text-[#4a2e85] font-bold shadow-md hover:shadow-lg transition-all text-sm"
                onClick$={actionSavePet}>
                Guardar cambios
              </button>
            </div>

          </Card>

        )}



        {/* /owner/profile/{id} */}

        {state.activeRoute === 'owner-profile' && (

          <div class="space-y-6">

            <Card class="p-6">

              <div class="flex items-center gap-4">

                <div class="h-24 w-24 rounded-full border border-[#4a2e85]/20 overflow-hidden bg-gray-100 flex-shrink-0">
                  {state.profile.profilePhoto ? (
                    <ImageWithRetry
                      src={state.profile.profilePhoto}
                      alt="Profile"
                      class="h-full w-full object-cover"
                      width={96}
                      height={96}
                      layout="constrained"
                    />
                  ) : (
                    <div class="h-full w-full grid place-items-center text-gray-400">
                      <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                    </div>
                  )}
                </div>

                <div>

                  <div class="flex items-center gap-3 flex-wrap">
                    <h2 class="text-xl font-semibold">{state.profile.displayName || state.profile.fullName || 'Dueño'}</h2>
                    {state.profile.isVerified && (
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold shadow-sm">
                        <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                        </svg>
                        Verificado
                      </span>
                    )}
                    <button class={btnSecondary + ' py-1 px-3 text-xs'} onClick$={() => setRoute('edit-owner')}>Editar perfil</button>
                  </div>

                  <p class="text-gray-600">{state.profile.bio || 'Sin biografía.'}</p>

                  <div class="mt-1"><StarRating rating={state.profile.rating} /></div>

                </div>

              </div>

              <div class="mt-4 text-sm text-gray-600">Zona: {state.profile.zone || 'No especificada'}</div>

            </Card>



            <Card class="p-6">

              <h3 class="text-lg font-semibold mb-3">Mascotas</h3>

              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">

                {state.pets.map((p) => (

                  <div key={p.id} class="p-3 rounded-lg border">

                    <ImageWithRetry src={p.photo || '/images/default-pet.jpg'} class="w-20 h-20 object-cover rounded-full mx-auto" width={80} height={80} layout="constrained" alt={p.name} />

                    <p class="mt-2 text-center font-medium">{p.name}</p>

                    <p class="text-center text-xs text-gray-600 capitalize">{p.species}  {p.sex}</p>

                  </div>

                ))}

                {state.pets.length === 0 ? <p class="text-sm text-gray-600">Aún no tiene mascotas registradas.</p> : null}

              </div>

            </Card>



            <Card class="p-6">

              <h3 class="text-lg font-semibold mb-3">Historial de reservas</h3>

              <div class="space-y-2">

                {state.services.map((s) => (

                  <div key={s.id} class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">

                    <div>

                      <p class="font-medium">Servicio #{s.id}</p>

                      <p class="text-xs text-gray-600">{s.startDate}  {s.endDate}</p>

                    </div>

                    <Badge

                      text={s.status === 'completed' ? 'Completado' : s.status === 'cancelled' ? 'Cancelado' : s.status === 'in_progress' ? 'En progreso' : s.status === 'accepted' ? 'Aceptado' : 'Pendiente'}

                      tone={s.status === 'completed' ? 'green' : s.status === 'cancelled' ? 'red' : 'blue'}

                    />

                  </div>

                ))}

                {state.services.length === 0 ? <p class="text-sm text-gray-600">Sin reservas todavía.</p> : null}

              </div>

            </Card>

          </div>

        )}



        {/* /owner/reviews */}

        {state.activeRoute === 'owner-reviews' && (

          <div class="space-y-6">

            <Card class="p-6">

              <h2 class="text-xl font-semibold">Sistema de Calificación</h2>

              <p class="text-sm text-gray-600">Mira el resumen de tus calificaciones.</p>

              <div class="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-6">

                <Card class="p-6 text-center">

                  <div class="text-3xl font-bold">{state.profile.rating.toFixed(1)}</div>

                  <StarRating rating={state.profile.rating} />

                  <p class="text-sm text-gray-600 mt-1">Basado en {state.profile.totalReviews} reseñas</p>

                </Card>

                <Card class="lg:col-span-2 p-6">

                  <h3 class="text-lg font-semibold mb-4">Reseñas recibidas</h3>

                  <div class="space-y-3 max-h-64 overflow-auto">

                    {state.reviews.map((r) => (

                      <div key={r.id} class="p-3 bg-gray-50 rounded-lg">

                        <div class="flex items-center justify-between">

                          <p class="font-medium">{r.reviewerName || r.reviewerId || 'Cuidador'}</p>

                          <StarRating rating={r.rating} />

                        </div>

                        <p class="text-sm text-gray-700 mt-1">{r.comment}</p>

                        <p class="text-xs text-gray-500">Para {r.petName}  {r.date}</p>

                      </div>

                    ))}

                  </div>

                </Card>

              </div>

            </Card>



            {/* Calificar servicio pendiente */}

            <Card class="p-6">

              <h3 class="text-lg font-semibold mb-2">Calificar servicio pendiente</h3>

              <p class="text-sm text-gray-600 mb-4">

                El dueño debe calificar al cuidador al finalizar el servicio. Sin calificación no puede solicitar nuevo servicio.

              </p>

              <CalificationForm onRate$={$((stars: number, comment: string) => rateLastService(stars, comment))} btnPrimary={btnPrimary} />

            </Card>

          </div>

        )}



        {/* /rules-security */}

        {state.activeRoute === 'rules-security' && (

          <Card class="p-6">

            <h2 class="text-xl font-semibold mb-1">Reglas y Seguridad</h2>

            <p class="text-sm text-gray-600 mb-4">Información importante sobre el servicio.</p>



            <ul class="list-disc pl-6 space-y-2 text-gray-700">

              <li>Solo una solicitud activa por mascota.</li>

              <li>Todos los mensajes por chat interno.</li>

              <li>Reporte de incidentes disponible.</li>

              <li>Incumplimientos graves  suspensión.</li>

              <li>Sistema anti-spoofing en registros biométricos.</li>

              <li>Datos sensibles cifrados.</li>

            </ul>



            <div class="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">

              <b>Nota:</b> El dueño <b>no puede iniciar</b> un nuevo servicio hasta <b>calificar al cuidador anterior</b>.

            </div>

          </Card>

        )}

      </div>

    </div>

  );

});



/* ======================

   Controles reutilizables

====================== */

const TextInput = component$<{

  label: string;

  model: string; // path: "a.b.c"

  stateObj: any;

  errors?: Record<string, string>;

  type?: string;

  textarea?: boolean;

  disabled?: boolean;

}>((p) => {

  const getSync = (path: string) => path.split('.').reduce((acc: any, k) => (acc ? acc[k] : undefined), p.stateObj);

  const set = $((path: string, value: any) => {

    const parts = path.split('.');

    const last = parts.pop()!;

    const target = parts.reduce((acc: any, k) => {
      if (!acc[k]) acc[k] = {};
      return acc[k];
    }, p.stateObj);

    target[last] = value;

  });

  return (

    <div>

      <label class="block text-sm font-medium text-gray-700 mb-1">{p.label}</label>

      {p.textarea ? (

        <textarea

          rows={3}

          class={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#ef7c43] ${p.disabled ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}

          value={getSync(p.model) || ''}

          disabled={p.disabled}

          onInput$={(e, el) => set(p.model, (el as HTMLTextAreaElement).value)}

        />

      ) : (

        <input

          class={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#ef7c43] ${p.disabled ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}

          type={p.type || 'text'}

          value={getSync(p.model) || ''}

          disabled={p.disabled}

          onInput$={(e, el) => set(p.model, (el as HTMLInputElement).value)}

        />

      )}

    </div>

  );

});



const TextSub = component$<{ title: string }>((p) => (

  <div>

    <h4 class="font-semibold text-gray-800 mb-2">{p.title}</h4>

    <Slot />

  </div>

));



const FormErrors = component$<{ errors: Record<string, string> }>(({ errors }) => {

  const keys = Object.keys(errors || {});

  if (keys.length === 0) return null;

  return (

    <div class="mt-4 p-3 bg-rose-50 text-rose-800 border border-rose-200 rounded-lg text-sm">

      <b>Errores:</b>

      <ul class="list-disc pl-6">

        {keys.map((k) => (

          <li key={k}>

            <code class="bg-rose-100 rounded px-1">{k}</code>: {errors[k]}

          </li>

        ))}

      </ul>

    </div>

  );

});



const BoundInput = component$<{
  label: string;
  bindKey: keyof Pet | string;
  store: any;
  asCSV?: boolean;
  hint?: string;
  error?: string;
}>((p) => (
  <div>
    <label class="block text-sm font-semibold text-[#4a2e85] mb-2">{p.label}</label>
    <input
      class={`w-full px-4 py-2.5 rounded-xl bg-white border ${p.error ? 'border-rose-500 ring-1 ring-rose-500' : 'border-[#4a2e85]/20'} focus:outline-none focus:ring-2 focus:ring-[#ef7c43] transition-all text-sm`}
      value={p.asCSV ? (Array.isArray(p.store[p.bindKey]) ? (p.store[p.bindKey] as string[]).join(',') : p.store[p.bindKey] || '') : p.store[p.bindKey] || ''}
      onInput$={(e, el) => {
        const v = (el as HTMLInputElement).value;
        p.store[p.bindKey] = p.asCSV ? v.split(',').map((s) => s.trim()).filter(Boolean) : v;
      }}
    />
    {p.hint && <p class="text-[10px] text-[#4a2e85b3] mt-1 italic">{p.hint}</p>}
    {p.error && <p class="text-[10px] text-rose-600 font-medium mt-1">{p.error}</p>}
  </div>
));



const BoundNumber = component$<{
  label: string;
  bindKey: keyof Pet | string;
  store: any;
  step?: string;
  error?: string;
}>((p) => (
  <div>
    <label class="block text-sm font-semibold text-[#4a2e85] mb-2">{p.label}</label>
    <input
      type="number"
      step={p.step || '1'}
      class={`w-full px-4 py-2.5 rounded-xl bg-white border ${p.error ? 'border-rose-500 ring-1 ring-rose-500' : 'border-[#4a2e85]/20'} focus:outline-none focus:ring-2 focus:ring-[#ef7c43] transition-all text-sm`}
      value={p.store[p.bindKey] ?? ''}
      onInput$={(e, el) => (p.store[p.bindKey] = parseFloat((el as HTMLInputElement).value))}
    />
    {p.error && <p class="text-[10px] text-rose-600 font-medium mt-1">{p.error}</p>}
  </div>
));



const Select = component$<{
  label: string;
  bindKey: keyof Pet | string;
  store: any;
  options: string[];
  error?: string;
}>((p) => (
  <div>
    <label class="block text-sm font-semibold text-[#4a2e85] mb-2">{p.label}</label>
    <select
      class={`w-full px-4 py-2.5 rounded-xl bg-white border ${p.error ? 'border-rose-500 ring-1 ring-rose-500' : 'border-[#4a2e85]/20'} focus:outline-none focus:ring-2 focus:ring-[#ef7c43] transition-all text-sm appearance-none`}
      value={p.store[p.bindKey] || ''}
      onInput$={(e, el) => (p.store[p.bindKey] = (el as HTMLSelectElement).value)}
    >
      <option value="">Seleccione</option>
      {p.options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
    {p.error && <p class="text-[10px] text-rose-600 font-medium mt-1">{p.error}</p>}
  </div>
));



const Checkbox = component$<{
  label: string;
  bindKey: keyof Pet | string;
  store: any;
  error?: string;
}>((p) => (
  <div class="flex items-center gap-3">
    <input
      type="checkbox"
      checked={!!p.store[p.bindKey]}
      onInput$={(e, el) => (p.store[p.bindKey] = (el as HTMLInputElement).checked)}
      class="h-5 w-5 rounded-lg border-[#4a2e85]/20 text-[#ef7c43] focus:ring-[#ef7c43] transition-all cursor-pointer"
    />
    <label class="text-sm font-medium text-[#4a2e85] cursor-pointer selection:bg-none">{p.label}</label>
    {p.error && <p class="text-[10px] text-rose-600 font-medium mt-1">{p.error}</p>}
  </div>
));



import type { QRL } from '@builder.io/qwik';

const CalificationForm = component$<{ onRate$: QRL<(stars: number, comment: string) => void>; btnPrimary: string }>((p) => {

  const stars = useSignal(5);

  const comment = useSignal('');

  return (

    <div class="flex flex-col md:flex-row md:items-end gap-3">

      <div>

        <label class="block text-sm font-medium text-gray-700 mb-1">Calificación (1 a 5)</label>

        <input

          type="number"

          min={1}

          max={5}

          class="w-32 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#ef7c43]"

          value={stars.value}

          onInput$={(e, el) => (stars.value = Math.max(1, Math.min(5, parseInt((el as HTMLInputElement).value || '5'))))}

        />

      </div>

      <div class="flex-1">

        <label class="block text-sm font-medium text-gray-700 mb-1">Comentario</label>

        <input

          class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#ef7c43]"

          placeholder="Cómo fue el servicio"

          value={comment.value}

          onInput$={(e, el) => (comment.value = (el as HTMLInputElement).value)}

        />

      </div>

      <button class={p.btnPrimary} onClick$={$(() => p.onRate$(stars.value, comment.value))}>

        Enviar calificación

      </button>

    </div>

  );

});





