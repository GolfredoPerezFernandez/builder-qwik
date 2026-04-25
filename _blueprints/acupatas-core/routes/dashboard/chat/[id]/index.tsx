import { component$, useStore, useSignal, useTask$, useVisibleTask$, $ } from '@builder.io/qwik';
import { Link, routeLoader$, server$, useNavigate } from '@builder.io/qwik-city';
import { getSessionFromEvent, getUserRoleById, getUserById } from '../../../../lib/auth';
import {
  listCaregiverChats,
  listOwnerChats,
  listAllChats,
  listChatMessages,
  markChatAsSeen,
  sendChatMessage,
  reportChat,
  closeChat,
  createChat,
  getChatById,
  type ChatRecord,
  type ChatMessageRecord,
} from '../../../../lib/chat';
import { listOwnerPets } from '../../../../lib/owner';
import { markMessageNotificationsAsReadForChat } from '../../../../lib/notifications';
import { addCaregiverReview, getCaregiverById } from '../../../../lib/caregiver';
import {
  type OwnerProfileRecord,
  type OwnerPetRecord,
  type OwnerReviewRecord,
  getOwnerProfileByUserId,
  getOwnerPetById,
  addOwnerReview,
  listOwnerReviews,
} from '../../../../lib/owner';
import { VerificationBadge } from '../../../../components/VerificationBadge';
import {
  createServiceRequestFromChat,
  getLatestServiceRequest,
  updateLatestServiceStatus,
  updateServiceStatusByBooking,
  setLatestServiceReview,
  submitOwnerPayment,
  confirmCaregiverPayment,
  submitFeePayment,
  validateFeePayment,
  getPendingCommissionsForChat,
  getBlockedPetsForOwner,
  getCaregiverOccupiedDates,
  getCaregiverRemainingCapacityForDates,
  type ServiceRequestBundle,
} from '../../../../lib/services';
import { uploadImage } from '../../../../lib/upload';
import { getTursoClient } from '../../../../lib/turso';
import { resizeImage } from '../../../../lib/image-utils';
import { normalizeImageUrl } from '../../../../lib/upload-utils';
import { LuCalendarDays, LuMapPin, LuDollarSign, LuCamera, LuDog, LuFlag, LuBan, LuInfo, LuX, LuCheckCircle, LuCheck } from '@qwikest/icons/lucide';
import { LeafletMap } from '../../../../components/leaflet-map';
import type { LocationsProps } from '../../../../models/location';
import { ImageWithRetry } from '../../../../components/ui/image-with-retry';

const getLatestServiceForChat = async (ownerId: string, caregiverId: string, petId?: string) => {
  const latest = await getLatestServiceRequest(ownerId, caregiverId);
  if (!latest) return null;

  const requestPetId = latest.request.petId || '';
  if (!petId || requestPetId === petId || requestPetId.split(',').includes(petId)) {
    return latest;
  }

  return await getLatestServiceRequest(ownerId, caregiverId, petId);
};

const parseBooleanFlag = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'si' || normalized === 'on';
  }
  return false;
};

const normalizePetLimit = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.floor(parsed));
};

const getPetIdsFromValue = (value?: string | null): string[] => {
  if (!value) return [];
  return Array.from(new Set(value.split(',').map((id) => id.trim()).filter(Boolean)));
};

const getPetDisplayText = (petId?: string | null, petName?: string | null): string => {
  const petCount = getPetIdsFromValue(petId).length;
  if (petCount > 1) return `${petCount} mascotas`;
  if (petName && petName.trim()) return petName;
  if (petCount === 1) return '1 mascota';
  return 'Sin mascota';
};

const limitSelectedPetIds = (petIdsValue: string, maxPets: number): string => {
  if (maxPets <= 0) return '';
  return Array.from(new Set((petIdsValue || '').split(',').map((id) => id.trim()).filter(Boolean))).slice(0, maxPets).join(',');
};

const expandDateRange = (dateFrom: string, dateTo: string): string[] => {
  if (!dateFrom || !dateTo) return dateFrom ? [dateFrom] : (dateTo ? [dateTo] : []);
  const startDate = new Date(`${dateFrom.slice(0, 10)}T00:00:00Z`);
  const endDate = new Date(`${dateTo.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return [];

  const expandedDates: string[] = [];
  let current = new Date(startDate.getTime());
  while (current.getTime() <= endDate.getTime()) {
    expandedDates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return expandedDates;
};

const getSelectionDatesForCapacity = (selectedBookingDates: string[], serviceDraft: { dateFrom: string; dateTo: string }) => {
  const selectedDays = Array.from(new Set((selectedBookingDates || []).map((date) => String(date || '').slice(0, 10)).filter(Boolean))).sort();
  if (selectedDays.length > 0) return selectedDays;
  return expandDateRange(serviceDraft.dateFrom, serviceDraft.dateTo);
};

const formatServiceCountdown = (targetMs: number, nowMs: number) => {
  const remainingMs = Math.max(0, targetMs - nowMs);
  const totalMinutes = Math.ceil(remainingMs / 60000);
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (totalHours > 0) {
    return `${totalHours}h ${minutes}m`;
  }
  return `${Math.max(1, totalMinutes)}m`;
};

const VENEZUELAN_BANKS = [
  { code: '0102', name: 'Banco de Venezuela, S.A.' },
  { code: '0105', name: 'Mercantil Banco, C.A.' },
  { code: '0108', name: 'BBVA Provincial, S.A.' },
  { code: '0134', name: 'Banesco Banco Universal, C.A.' },
  { code: '0191', name: 'Banco Nacional de Crédito (BNC)' },
  { code: '0163', name: 'Banco del Tesoro, C.A.' },
  { code: '0172', name: 'Bancamiga Banco Universal, C.A.' },
  { code: '0114', name: 'Bancaribe C.A.' },
  { code: '0175', name: 'Banco Digital de los Trabajadores (Antiguo Bicentenario)' },
  { code: '0115', name: 'Banco Exterior, C.A.' },
  { code: '0104', name: 'Banco Venezolano de Crédito, S.A.' },
  { code: '0151', name: 'BFC Banco Fondo Común, C.A.' },
  { code: '0174', name: 'Banplus Banco Universal, C.A.' },
  { code: '0166', name: 'Banco Agrícola de Venezuela, C.A.' },
  { code: '0177', name: 'BANFANB (Fuerza Armada Nacional Bolivariana)' },
  { code: '0138', name: 'Banco Plaza, Banco Universal' },
  { code: '0128', name: 'Banco Caroní, C.A.' },
  { code: '0137', name: 'Banco Sofitasa' },
  { code: '0156', name: '100% Banco' },
  { code: '0157', name: 'DelSur Banco Universal' },
  { code: '0171', name: 'Banco Activo, C.A.' },
  { code: '0178', name: 'N58 Banco Digital' },
  { code: '0168', name: 'Bancrecer, S.A.' },
  { code: '0169', name: 'R4 Banco Microfinanciero (Antiguo Mi Banco)' },
  { code: '0146', name: 'Bangente, C.A.' },
];

export const useChatData = routeLoader$(async (event) => {
  const legacyDateRaw = event.url.searchParams.get('date') || '';
  const dateFromRaw = event.url.searchParams.get('dateFrom') || legacyDateRaw;
  const dateToRaw = event.url.searchParams.get('dateTo') || legacyDateRaw;
  const datesRaw = event.url.searchParams.get('dates') || '';

  const preferredDates = Array.from(
    new Set(
      datesRaw
        .split(',')
        .map((value) => value.trim())
        .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    )
  ).sort();

  const hasValidDateFrom = /^\d{4}-\d{2}-\d{2}$/.test(dateFromRaw);
  const hasValidDateTo = /^\d{4}-\d{2}-\d{2}$/.test(dateToRaw);

  let preferredDateFrom = hasValidDateFrom ? dateFromRaw : '';
  let preferredDateTo = hasValidDateTo ? dateToRaw : '';

  if (preferredDateFrom && !preferredDateTo) {
    preferredDateTo = preferredDateFrom;
  } else if (!preferredDateFrom && preferredDateTo) {
    preferredDateFrom = preferredDateTo;
  }

  if (preferredDateFrom && preferredDateTo && preferredDateTo < preferredDateFrom) {
    const previousFrom = preferredDateFrom;
    preferredDateFrom = preferredDateTo;
    preferredDateTo = previousFrom;
  }

  if (preferredDates.length > 0) {
    preferredDateFrom = preferredDates[0];
    preferredDateTo = preferredDates[preferredDates.length - 1];
  }

  const session = await getSessionFromEvent(event);
  if (!session) {
    return {
      userId: '',
      chat: null as ChatRecord | null,
      messages: [] as ChatMessageRecord[],
      serviceRequest: null as ServiceRequestBundle | null,
      role: 'owner' as const,
      preferredDateFrom,
      preferredDateTo,
      preferredDates,
      caregiverAvailableDates: [] as string[],
      ownerPets: [] as OwnerPetRecord[],
      pendingCommission: null as 'payment' | 'validation' | null,
    };
  }

  const role = ((await getUserRoleById(session.userId)) || 'owner') as 'owner' | 'caregiver';
  const user = await getUserById(session.userId);
  const isAdmin = (user?.email || '').trim().toLowerCase() === 'admin@gmail.com';

  let chats: ChatRecord[] = [];
  if (isAdmin) {
    chats = await listAllChats();
  } else {
    chats = role === 'caregiver'
      ? await listCaregiverChats(session.userId)
      : await listOwnerChats(session.userId);
  }

  const chat = chats.find((c) => c.id === event.params.id) ?? null;
  if (!chat) {
    throw event.redirect(302, '/dashboard/chat');
  }

  await markChatAsSeen(chat.id);
  await markMessageNotificationsAsReadForChat(session.userId, chat.id);

  const messages = await listChatMessages(chat.id);
  const normalizedChat: ChatRecord = {
    ...chat,
    ownerAvatar: normalizeImageUrl(chat.ownerAvatar),
    caregiverAvatar: normalizeImageUrl(chat.caregiverAvatar),
    petPhoto: normalizeImageUrl(chat.petPhoto),
  };
  const normalizedMessages = messages.map((message) => ({
    ...message,
    mediaUrl: normalizeImageUrl(message.mediaUrl),
  }));
  const serviceRequest = await getLatestServiceForChat(chat.ownerId, chat.caregiverId, chat.petId);
  const caregiverProfile = await getCaregiverById(chat.caregiverId);

  const caregiverPetLimit = caregiverProfile?.multiplePets 
    ? normalizePetLimit(caregiverProfile?.petLimit)
    : 1;
  const caregiverOccupiedSlots = Number(caregiverProfile?.activePets ?? 0);
  const caregiverMultiPet = parseBooleanFlag(caregiverProfile?.multiplePets) || caregiverPetLimit > 1;

  const occupiedDates = await getCaregiverOccupiedDates(chat.caregiverId, caregiverPetLimit);

  const caregiverAvailableDates = Object.entries(caregiverProfile?.availability || {})
    .filter(([date, available]) => Boolean(available) && !occupiedDates.includes(date))
    .map(([date]) => date)
    .sort();

  let ownerPets: OwnerPetRecord[] = [];
  let blockedPets = {
    pendingReviews: [] as string[],
    activeServices: [] as string[],
    pendingPayment: [] as string[],
    pendingValidation: [] as string[],
  };
  if (role === 'owner') {
    const pets = await listOwnerPets(session.userId);
    ownerPets = pets.map((pet) => ({
      ...pet,
      photo: normalizeImageUrl(pet.photo),
      vaccinationCard: normalizeImageUrl(pet.vaccinationCard),
    }));
    blockedPets = await getBlockedPetsForOwner(session.userId, chat.caregiverId);
  }

  const pendingCommission = await getPendingCommissionsForChat(chat.ownerId, chat.caregiverId);
  const caregiverServices = caregiverProfile?.services || { alojamiento: true, visita: false, paseo: false };

  return { userId: session.userId, chat: normalizedChat, messages: normalizedMessages, serviceRequest, role: role as 'owner' | 'caregiver', isAdmin, preferredDateFrom, preferredDateTo, preferredDates, caregiverAvailableDates, ownerPets, blockedPets, caregiverMultiPet, caregiverPetLimit, caregiverOccupiedSlots, pendingCommission, caregiverServices };
});

const loadMessages = server$(async function (chatId: string) {
  try {
    const session = await getSessionFromEvent(this);
    if (!session) return { ok: false, reason: 'no_session', messages: [] as ChatMessageRecord[] } as const;
    const user = await getUserById(session.userId);
    const isAdmin = (user?.email || '').trim().toLowerCase() === 'admin@gmail.com';
    const role = ((await getUserRoleById(session.userId)) || 'owner') as 'owner' | 'caregiver';

    let chats: ChatRecord[] = [];
    if (isAdmin) {
      chats = await listAllChats();
    } else {
      chats = role === 'caregiver'
        ? await listCaregiverChats(session.userId)
        : await listOwnerChats(session.userId);
    }
    if (!chats.find((chat) => chat.id === chatId)) {
      return { ok: false, reason: 'not_found', messages: [] as ChatMessageRecord[] } as const;
    }
    await markChatAsSeen(chatId);
    await markMessageNotificationsAsReadForChat(session.userId, chatId);
    const messages = await listChatMessages(chatId);
    return {
      ok: true,
      messages: messages.map((message) => ({
        ...message,
        mediaUrl: normalizeImageUrl(message.mediaUrl),
      })),
    } as const;
  } catch (e) {
    return { ok: false, reason: 'network_error', messages: [] as ChatMessageRecord[] } as const;
  }
});

const loadService = server$(async function (chatId: string) {
  try {
    const session = await getSessionFromEvent(this);
    if (!session) return { ok: false, reason: 'no_session', service: null, blockedPets: null, caregiverOccupiedSlots: 0, caregiverAvailableDates: [] as string[] } as const;
    const user = await getUserById(session.userId);
    const isAdmin = (user?.email || '').trim().toLowerCase() === 'admin@gmail.com';

    const role = ((await getUserRoleById(session.userId)) || 'owner') as 'owner' | 'caregiver';

    let chats: ChatRecord[] = [];
    if (isAdmin) {
      chats = await listAllChats();
    } else {
      chats = role === 'caregiver'
        ? await listCaregiverChats(session.userId)
        : await listOwnerChats(session.userId);
    }
    const chat = chats.find((c) => c.id === chatId);
    if (!chat) return { ok: false, reason: 'not_found', service: null, blockedPets: null, caregiverOccupiedSlots: 0, caregiverAvailableDates: [] as string[] } as const;
    const [service, caregiverProfile] = await Promise.all([
      getLatestServiceForChat(chat.ownerId, chat.caregiverId, chat.petId),
      getCaregiverById(chat.caregiverId)
    ]);
    const caregiverOccupiedSlots = Number(caregiverProfile?.activePets ?? 0);
    const pendingCommission = await getPendingCommissionsForChat(chat.ownerId, chat.caregiverId);

    // Refresh availability
    const caregiverPetLimit = caregiverProfile?.multiplePets 
      ? normalizePetLimit(caregiverProfile?.petLimit)
      : 1;
    const occupiedDates = await getCaregiverOccupiedDates(chat.caregiverId, caregiverPetLimit);
    const caregiverAvailableDates = Object.entries(caregiverProfile?.availability || {})
      .filter(([date, available]) => Boolean(available) && !occupiedDates.includes(date))
      .map(([date]) => date)
      .sort();

    // Also refresh blockedPets for owners so the UI disables occupied pets in real-time
    let blockedPets = null as { pendingReviews: string[]; activeServices: string[]; pendingPayment: string[]; pendingValidation: string[] } | null;
    if (role === 'owner') {
      blockedPets = await getBlockedPetsForOwner(session.userId, chat.caregiverId);
    }

    return { ok: true, service, pendingCommission, blockedPets, caregiverOccupiedSlots, caregiverAvailableDates } as const;
  } catch (e) {
    return { ok: false, reason: 'network_error', service: null, pendingCommission: null, blockedPets: null, caregiverOccupiedSlots: 0, caregiverAvailableDates: [] as string[] } as const;
  }
});

const loadSelectionCapacity = server$(async function (chatId: string, selectedDates: string[]) {
  const session = await getSessionFromEvent(this);
  if (!session) return { ok: false, reason: 'no_session', remainingCapacity: 0 } as const;

  const user = await getUserById(session.userId);
  const isAdmin = (user?.email || '').trim().toLowerCase() === 'admin@gmail.com';
  const role = ((await getUserRoleById(session.userId)) || 'owner') as 'owner' | 'caregiver';

  let chats: ChatRecord[] = [];
  if (isAdmin) {
    chats = await listAllChats();
  } else {
    chats = role === 'caregiver'
      ? await listCaregiverChats(session.userId)
      : await listOwnerChats(session.userId);
  }

  const chat = chats.find((item) => item.id === chatId);
  if (!chat) return { ok: false, reason: 'not_found', remainingCapacity: 0 } as const;

  const caregiverProfile = await getCaregiverById(chat.caregiverId);
  const caregiverPetLimit = caregiverProfile?.multiplePets 
    ? normalizePetLimit(caregiverProfile?.petLimit)
    : 1;
  const remainingCapacity = await getCaregiverRemainingCapacityForDates(chat.caregiverId, selectedDates, caregiverPetLimit);

  return { ok: true, remainingCapacity } as const;
});

const sendMessageServer = server$(async function (chatId: string, text: string, mediaUrl?: string) {
  const session = await getSessionFromEvent(this);
  if (!session) return { ok: false, reason: 'no_session', messages: [] as ChatMessageRecord[] } as const;
  if (!text.trim() && !mediaUrl) return { ok: false, reason: 'empty', messages: [] as ChatMessageRecord[] } as const;

  const chat = await getChatById(chatId);
  if (!chat || (chat.ownerId !== session.userId && chat.caregiverId !== session.userId)) {
    return { ok: false, reason: 'not_found', messages: [] as ChatMessageRecord[] } as const;
  }
  const senderRole = chat.caregiverId === session.userId ? 'caregiver' : 'owner';
  const normalizedMediaUrl = normalizeImageUrl(mediaUrl);
  await sendChatMessage(chatId, senderRole, text.trim(), normalizedMediaUrl || undefined);
  const messages = await listChatMessages(chatId);
  return {
    ok: true,
    messages: messages.map((message) => ({
      ...message,
      mediaUrl: normalizeImageUrl(message.mediaUrl),
    })),
  } as const;
});

const reportChatServer = server$(async function (chatId: string, reportText: string) {
  const session = await getSessionFromEvent(this);
  if (!session) return { ok: false, reason: 'no_session' } as const;
  if (!reportText.trim()) return { ok: false, reason: 'empty' } as const;

  const chat = await getChatById(chatId);
  if (!chat || (chat.ownerId !== session.userId && chat.caregiverId !== session.userId)) {
    return { ok: false, reason: 'not_found' } as const;
  }
  const reporterRole = chat.caregiverId === session.userId ? 'caregiver' : 'owner';
  await reportChat(chatId, session.userId, reporterRole, reportText.trim());
  return { ok: true } as const;
});

const closeChatServer = server$(async function (chatId: string) {
  const session = await getSessionFromEvent(this);
  if (!session) return { ok: false, reason: 'no_session' } as const;

  const role = ((await getUserRoleById(session.userId)) || 'owner') as 'owner' | 'caregiver';
  const chats = role === 'caregiver'
    ? await listCaregiverChats(session.userId)
    : await listOwnerChats(session.userId);

  if (!chats.find((chat) => chat.id === chatId)) {
    return { ok: false, reason: 'not_found' } as const;
  }

  await closeChat(chatId);
  return { ok: true } as const;
});

const rehireChatServer = server$(async function (chatId: string) {
  const session = await getSessionFromEvent(this);
  if (!session) return { ok: false, reason: 'no_session' } as const;

  const role = ((await getUserRoleById(session.userId)) || 'owner') as 'owner' | 'caregiver';
  if (role !== 'owner') return { ok: false, reason: 'forbidden' } as const;

  const chats = await listOwnerChats(session.userId);
  const chat = chats.find((item) => item.id === chatId);
  if (!chat) return { ok: false, reason: 'not_found' } as const;

  await closeChat(chatId);
  const next = await createChat(session.userId, chat.caregiverId, chat.petId, { forceNew: true });
  if (!next.ok) return next;

  return { ok: true, id: next.id } as const;
});


const createService = server$(async function (chatId: string, service: string, dateFrom: string, dateTo: string, timeFrom: string, timeTo: string, amountUsd?: number, petId?: string, selectedDays?: string[]) {
  const session = await getSessionFromEvent(this);
  if (!session) return { ok: false, reason: 'no_session', service: null } as const;
  if (!service || !dateFrom || !dateTo) return { ok: false, reason: 'missing', service: null } as const;

  // Combine date and time into ISO format
  const startDateTime = `${dateFrom}T${timeFrom || '08:00'}:00`;
  const endDateTime = `${dateTo}T${timeTo || '18:00'}:00`;

  const result = await createServiceRequestFromChat(session.userId, chatId, {
    service,
    dateFrom: startDateTime,
    dateTo: endDateTime,
    amountUsd: typeof amountUsd === 'number' && amountUsd > 0 ? amountUsd : undefined,
    petId,
    selectedDays,
  });
  if (!result.ok) {
    // If the services.ts result has a detail string, we pass it up too
    return { ok: false, reason: result.reason, detail: ('detail' in result) ? result.detail : undefined, service: null } as const;
  }

  const chat = await getChatById(chatId);
  const serviceInfo = chat ? await getLatestServiceForChat(session.userId, chat.caregiverId, chat.petId) : null;
  return { ok: true, service: serviceInfo } as const;
});

const updateServiceStatus = server$(async function (chatId: string, status: string) {
  const session = await getSessionFromEvent(this);
  if (!session) return { ok: false, reason: 'no_session', service: null } as const;
  const chat = await getChatById(chatId);
  if (!chat) return { ok: false, reason: 'not_found', service: null } as const;

  const updateResultByPet = await updateLatestServiceStatus(chat.ownerId, chat.caregiverId, chat.petId, status);
  const updateResult = updateResultByPet.ok
    ? updateResultByPet
    : await updateLatestServiceStatus(chat.ownerId, chat.caregiverId, undefined, status);
  if (!updateResult.ok) return { ok: false, reason: 'not_found', service: null } as const;
  const service = await getLatestServiceForChat(chat.ownerId, chat.caregiverId, chat.petId);
  return { ok: true, service } as const;
});

export const loadOwnerProfile = server$(async (ownerId: string) => {
  const profile = await getOwnerProfileByUserId(ownerId);
  const reviews = await listOwnerReviews(ownerId);
  return {
    profile: profile
      ? {
        ...profile,
        profilePhoto: normalizeImageUrl(profile.profilePhoto),
        photoWithPet: normalizeImageUrl(profile.photoWithPet),
        ownPetPhoto: normalizeImageUrl(profile.ownPetPhoto),
      }
      : profile,
    reviews,
  };
});

export const loadPetProfile = server$(async (petId: string) => {
  const pet = await getOwnerPetById(petId);
  if (!pet) return pet;
  return {
    ...pet,
    photo: normalizeImageUrl(pet.photo),
    vaccinationCard: normalizeImageUrl(pet.vaccinationCard),
  };
});

export const loadPetProfiles = server$(async (petIds: string[]) => {
  const normalizedIds = Array.from(new Set((petIds || []).map((petId) => String(petId || '').trim()).filter(Boolean)));
  if (normalizedIds.length === 0) return [] as OwnerPetRecord[];

  const pets = await Promise.all(normalizedIds.map((petId) => getOwnerPetById(petId)));
  return pets
    .filter((pet): pet is OwnerPetRecord => Boolean(pet))
    .map((pet) => ({
      ...pet,
      photo: normalizeImageUrl(pet.photo),
      vaccinationCard: normalizeImageUrl(pet.vaccinationCard),
    }));
});

const submitReviewServer = server$(async function (chatId: string, rating: number, comment: string) {
  const session = await getSessionFromEvent(this);
  if (!session) return { ok: false, reason: 'no_session' } as const;
  const chat = await getChatById(chatId);
  if (!chat) return { ok: false, reason: 'not_found' } as const;
  if (chat.ownerId !== session.userId && chat.caregiverId !== session.userId) {
    return { ok: false, reason: 'forbidden' } as const;
  }
  const role = ((await getUserRoleById(session.userId)) || 'owner') as 'owner' | 'caregiver';

  const reviewResultByPet = await setLatestServiceReview(chat.ownerId, chat.caregiverId, chat.petId, role, rating, comment);
  if (!reviewResultByPet.ok) {
    const reviewResult = await setLatestServiceReview(chat.ownerId, chat.caregiverId, undefined, role, rating, comment);
    if (!reviewResult.ok) return { ok: false, reason: reviewResult.reason } as const;
  }
  if (role === 'owner') {
    await addCaregiverReview(chat.caregiverId, session.userId, rating, comment);
  } else {
    await addOwnerReview(chat.ownerId, session.userId, rating, comment, chat.petName);
  }
  return { ok: true } as const;
});

const submitPaymentServer = server$(async function (bookingId: string, reference: string, proofDataUrl: string) {
  const session = await getSessionFromEvent(this);
  if (!session) return { ok: false, reason: 'no_session', service: null } as const;

  const uploaded = await uploadImage(proofDataUrl);
  if (!uploaded.ok) return { ok: false, reason: 'upload_failed', service: null } as const;

  const res = await submitOwnerPayment(bookingId, session.userId, reference, uploaded.path || uploaded.url);
  if (!res.ok) return { ok: false, reason: 'update_failed', service: null } as const;

  const chats = await listOwnerChats(session.userId);
  const chat = chats.find(c => c.ownerId === session.userId && c.status !== 'finished');

  if (!chat) return { ok: true, reason: 'not_found', service: null } as const;
  const service = await getLatestServiceForChat(chat.ownerId, chat.caregiverId, chat.petId);

  return { ok: true, service } as const;
});

const confirmPaymentServer = server$(async function (bookingId: string, confirmed: boolean) {
  const session = await getSessionFromEvent(this);
  if (!session) return { ok: false, reason: 'no_session', service: null } as const;

  const paymentResult = await confirmCaregiverPayment(bookingId, session.userId, confirmed);
  if (!paymentResult.ok) return { ok: false, reason: 'update_failed', service: null } as const;

  // We need the chat info to fetch the latest service state
  const chats = await listCaregiverChats(session.userId);
  const chat = chats.find(c => c.caregiverId === session.userId && c.status !== 'finished'); // Basic heuristic, or we can just refresh the page

  if (!chat) return { ok: true, reason: 'not_found', service: null } as const;

  const service = await getLatestServiceForChat(chat.ownerId, chat.caregiverId, chat.petId);

  return { ok: true, service } as const;
});

const submitFeePaymentServer = server$(async function (
  bookingId: string,
  reference: string,
  proofDataUrl: string,
  date: string,
  amount: number,
  payerPhone: string,
  bankOrigin: string,
) {
  const session = await getSessionFromEvent(this);
  if (!session) return { ok: false, reason: 'no_session', service: null } as const;

  const cleanReference = String(reference || '').replace(/\D/g, '');
  if (!/^\d{4,12}$/.test(cleanReference)) {
    return { ok: false, reason: 'invalid_reference', service: null } as const;
  }

  const cleanPayerPhone = String(payerPhone || '').replace(/\D/g, '');
  const cleanBankOrigin = String(bankOrigin || '').replace(/\D/g, '');
  if (!/^04\d{9}$/.test(cleanPayerPhone)) {
    return { ok: false, reason: 'invalid_payer_phone', service: null } as const;
  }
  if (!/^\d{4}$/.test(cleanBankOrigin)) {
    return { ok: false, reason: 'invalid_bank_origin', service: null } as const;
  }

  const uploaded = await uploadImage(proofDataUrl);
  if (!uploaded.ok) return { ok: false, reason: 'upload_failed', service: null } as const;

  const feeResult = await submitFeePayment(
    bookingId,
    session.userId,
    cleanReference,
    uploaded.path || uploaded.url,
    date,
    amount,
    cleanPayerPhone,
    cleanBankOrigin,
  );
  if (!feeResult.ok) return { ok: false, reason: 'update_failed', service: null } as const;

  let autoValidated = false;
  let autoValidationMessage = '';
  try {
    const validationResult = await validateFeePayment(bookingId, 'BDV_SYSTEM', false, {
      bdvApiKey: this.env.get('BDV_KEY') || this.env.get('BDV_API_KEY') || this.env.get('BDV_API_KEY_QA') || '',
      bdvEndpoint: this.env.get('BDV_API_ENDPOINT') || this.env.get('BDV_ENDPOINT') || 'https://bdvconciliacion.banvenez.com/getMovement',
      acupatasRif: this.env.get('ACUPATAS_RIF') || 'J507903559',
      acupatasPhone: this.env.get('ACUPATAS_PHONE') || '04147199496',
    });

    if (validationResult.ok) {
      autoValidated = true;
      autoValidationMessage = 'BDV confirmó el pago y la comisión quedó validada automáticamente.';
    } else {
      autoValidationMessage = `Comisión reportada. BDV aún no confirma esta referencia (${validationResult.reason || 'pendiente'}).`;
    }
  } catch (error) {
    console.error('[Commission] Auto BDV validation failed:', error);
    autoValidationMessage = 'Comisión reportada. No fue posible validar automáticamente con BDV en este momento.';
  }

  const client = getTursoClient();
  const chatRes = await client.execute({
    sql: 'select id, owner_id, caregiver_id, pet_id from chats where caregiver_id = ? and owner_id = (select owner_id from bookings where id = ?) limit 1',
    args: [session.userId, bookingId],
  });
  const chat = chatRes.rows[0] as any;

  if (!chat) {
    return {
      ok: true,
      reason: 'chat_not_found',
      service: null,
      autoValidated,
      autoValidationMessage,
    } as const;
  }
  const service = await getLatestServiceForChat(chat.owner_id, chat.caregiver_id, chat.pet_id);

  return { ok: true, service, autoValidated, autoValidationMessage } as const;
});

export const CalendarDate = component$(({ date }: { date: string }) => {
  if (!date) return null;
  const d = new Date(date);
  const day = d.getDate();
  const month = d.toLocaleDateString('es-VE', { month: 'short' }).toUpperCase().replace('.', '');
  return (
    <div class="flex flex-col items-center justify-center bg-white border border-[#4a2e85]/20 rounded-xl w-14 h-14 shadow-sm">
      <span class="text-[10px] font-bold text-[#4a2e85] uppercase tracking-wide">{month}</span>
      <span class="text-xl font-extrabold text-[#4a2e85] leading-none">{day}</span>
    </div>
  );
});

const isSameLocalDay = (left: number, right: number) => {
  const a = new Date(left);
  const b = new Date(right);
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
};

type ServiceDraftState = {
  dateFrom: string;
  timeFrom: string;
  dateTo: string;
  timeTo: string;
};

type BookingDayTimesState = Record<string, { timeFrom: string; timeTo: string }>;

const computeBillableDays24h = (dateFrom: string, timeFrom: string, dateTo: string, timeTo: string) => {
  if (!dateFrom || !dateTo) return 0;
  const start = new Date(`${dateFrom}T${timeFrom || '08:00'}:00`);
  const end = new Date(`${dateTo}T${timeTo || '18:00'}:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  let durationMs = end.getTime() - start.getTime();

  // If duration is negative on the exact same date strings (time inverted without rollover handled earlier), 
  // assume it crosses midnight.
  if (durationMs < 0 && dateFrom === dateTo) {
    durationMs += 24 * 60 * 60 * 1000;
  } else if (durationMs < 0) {
    durationMs = 0;
  }

  if (durationMs <= 0) return 1;

  // We charge 1 day per 24 hours (or fraction thereof).
  return Math.max(1, Math.ceil((durationMs - 1000) / (1000 * 60 * 60 * 24)));
};

const toUtcEpochDay = (dateValue: string) => {
  const [yearRaw, monthRaw, dayRaw] = dateValue.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!year || !month || !day) return Number.NaN;
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
};

const getEffectiveScheduleForBilling = (
  selectedBookingDates: string[],
  serviceDraft: ServiceDraftState,
  bookingDayTimes: BookingDayTimesState,
) => {
  const selectedDays = Array.from(new Set([...selectedBookingDates])).sort();
  const effectiveDateFrom = selectedDays[0] || serviceDraft.dateFrom;
  const effectiveDateTo = selectedDays[selectedDays.length - 1] || serviceDraft.dateTo;

  if (!effectiveDateFrom || !effectiveDateTo) {
    return null;
  }

  const selectedEpochDays = selectedDays.map((value) => toUtcEpochDay(value));
  let selectedSegments = 0;
  for (let index = 0; index < selectedEpochDays.length; index++) {
    if (index === 0 || selectedEpochDays[index] !== selectedEpochDays[index - 1] + 1) {
      selectedSegments += 1;
    }
  }
  const isMixedSchedule = selectedSegments > 1;

  const effectiveTimeFrom = isMixedSchedule
    ? (bookingDayTimes[effectiveDateFrom]?.timeFrom || serviceDraft.timeFrom || '08:00')
    : (serviceDraft.timeFrom || '08:00');
  const effectiveTimeTo = isMixedSchedule
    ? (bookingDayTimes[effectiveDateTo]?.timeTo || serviceDraft.timeTo || '18:00')
    : (serviceDraft.timeTo || '18:00');

  return {
    selectedDays,
    isMixedSchedule,
    effectiveDateFrom,
    effectiveDateTo,
    effectiveTimeFrom,
    effectiveTimeTo,
  };
};

const getBillableDaysForCurrentSelection = (
  selectedBookingDates: string[],
  serviceDraft: ServiceDraftState,
  bookingDayTimes: BookingDayTimesState,
) => {
  const selectedDays = Array.from(new Set([...selectedBookingDates])).sort();
  if (selectedDays.length === 0) {
    // Falls back to simple range if no days selected
    return computeBillableDays24h(serviceDraft.dateFrom, serviceDraft.timeFrom, serviceDraft.dateTo, serviceDraft.timeTo);
  }

  const selectedEpochDays = selectedDays.map((value) => toUtcEpochDay(value));
  const segments: string[][] = [];

  for (let index = 0; index < selectedEpochDays.length; index++) {
    if (index === 0 || selectedEpochDays[index] !== selectedEpochDays[index - 1] + 1) {
      segments.push([selectedDays[index]]);
    } else {
      segments[segments.length - 1].push(selectedDays[index]);
    }
  }

  const isMixedSchedule = segments.length > 1;
  let totalBillableDays = 0;

  for (const segment of segments) {
    const startDay = segment[0];
    const endDay = segment[segment.length - 1];

    // For single days or ranges, use the specific times for start/end dates
    // If it's a single day, start and end times apply to that same day
    const timeFrom = isMixedSchedule ? (bookingDayTimes[startDay]?.timeFrom || serviceDraft.timeFrom || '08:00') : (serviceDraft.timeFrom || '08:00');
    const timeTo = isMixedSchedule ? (bookingDayTimes[endDay]?.timeTo || serviceDraft.timeTo || '18:00') : (serviceDraft.timeTo || '18:00');

    let effectiveEndDate = endDay;
    if (startDay === endDay && timeTo < timeFrom) {
      const rollover = new Date(`${endDay}T00:00:00`);
      rollover.setDate(rollover.getDate() + 1);
      effectiveEndDate = `${rollover.getFullYear()}-${`${rollover.getMonth() + 1}`.padStart(2, '0')}-${`${rollover.getDate()}`.padStart(2, '0')}`;
    }

    const segmentDays = computeBillableDays24h(
      startDay,
      timeFrom,
      effectiveEndDate,
      timeTo,
    );

    totalBillableDays += segmentDays;
  }

  return totalBillableDays;
};

export default component$(() => {
  const data = useChatData();
  const nav = useNavigate();
  const toast = useSignal('');
  const reviewInlineSuccess = useSignal('');
  const feeInlineFeedback = useSignal<{ type: 'error' | 'success' | 'warning' | 'info'; message: string } | null>(null);
  const paymentProofPreview = useSignal<string>('');
  const feeProofPreview = useSignal<string>('');
  const showReport = useSignal(false);
  const videoRef = useSignal<HTMLVideoElement>();
  const canvasRef = useSignal<HTMLCanvasElement>();
  const nativeCameraInputRef = useSignal<HTMLInputElement>();
  const streamSig = useSignal<MediaStream | null>(null);
  const ownerModalLocation = useSignal<LocationsProps>({
    point: [0, 0],
    zoom: 16,
    marker: true,
  });
  const currentTime = useSignal(Date.now());
  const loading = useStore({
    refreshing: false,
    sending: false,
    reporting: false,
    requesting: false,
    reviewing: false,
    feeSubmitting: false,
    closing: false,
    rehiring: false,
    creating: false,
  });

  const state = useStore({
    chat: data.value.chat as ChatRecord | null,
    messages: data.value.messages,
    serviceRequest: data.value.serviceRequest as ServiceRequestBundle | null,
    messageDraft: '',
    reportDraft: '',
    role: data.value.role as 'owner' | 'caregiver',
    isAdmin: data.value.isAdmin,
    preferredDateFrom: data.value.preferredDateFrom || '',
    preferredDateTo: data.value.preferredDateTo || '',
    preferredDates: (data.value.preferredDates || []) as string[],
    caregiverAvailableDates: (data.value.caregiverAvailableDates || []) as string[],
    caregiverMultiPet: data.value.caregiverMultiPet || false,
    caregiverPetLimit: data.value.caregiverPetLimit || 1,
    caregiverOccupiedSlots: data.value.caregiverOccupiedSlots || 0,
    selectionRemainingCapacity: data.value.caregiverPetLimit || 1,
    ownerPets: (data.value.ownerPets || []) as OwnerPetRecord[],
    selectedBookingDates: [] as string[],
    bookingSelectionMode: 'intercalados' as 'intercalados' | 'rango',
    bookingViewMode: 'calendario' as 'calendario' | 'lista',
    bookingRangeAnchor: '',
    bookingMonthCursor: `${new Date().getFullYear()}-${`${new Date().getMonth() + 1}`.padStart(2, '0')}`,
    bookingDateInput: '',
    bookingDayTimes: {} as Record<string, { timeFrom: string; timeTo: string }>,
    reviewDraft: {
      rating: 5,
      comment: '',
    },
    serviceDraft: {
      service: (data.value.caregiverServices?.alojamiento ? 'alojamiento'
        : data.value.caregiverServices?.visita ? 'visita'
          : data.value.caregiverServices?.paseo ? 'paseo'
            : Object.keys(data.value.caregiverServices || {}).find(k => (data.value.caregiverServices as any)[k]) || 'alojamiento'),
      dateFrom: '',
      timeFrom: '08:00',
      dateTo: '',
      timeTo: '18:00',
      amountUsd: '',
      petId: (() => {
        // Inicializar omitiendo mascotas bloqueadas
        const initialIds = (data.value.chat?.petId || '').split(',').filter(Boolean);
        const blockedPets = data.value.blockedPets || { pendingReviews: [], pendingPayment: [], pendingValidation: [], activeServices: [] };

        const validIds = initialIds.filter(id =>
          !blockedPets.pendingPayment.includes(id) &&
          !blockedPets.pendingValidation.includes(id)
        );
        const initialRemainingCapacity = Math.max(1, data.value.caregiverPetLimit || 1);

        // Si es multi-pet, dejar vacío o con los válidos
        if (data.value.caregiverMultiPet) {
          return limitSelectedPetIds(validIds.join(','), initialRemainingCapacity);
        }

        // Si es single-pet y tenemos un válido del chat actual, usarlo
        if (validIds.length > 0 && initialRemainingCapacity > 0) {
          return validIds[0];
        }

        // Si es single-pet y el del chat actual está bloqueado (o no hay), seleccionar el primer pet válido
        const ownerPets = data.value.ownerPets || [];
        const firstValidPet = ownerPets.find(op =>
          !blockedPets.pendingPayment.includes(op.id) &&
          !blockedPets.pendingValidation.includes(op.id)
        );

        return firstValidPet ? firstValidPet.id : '';
      })(),
    },
    paymentDraft: {
      reference: '',
      proof: null as File | null,
    },
    viewOwner: null as OwnerProfileRecord | null,
    viewOwnerReviews: [] as OwnerReviewRecord[],
    viewPet: null as OwnerPetRecord | null,
    viewPets: [] as OwnerPetRecord[],
    loadingProfile: false,
    cameraOpen: false,
    capturedImage: null as string | null,
    capturedImageMeta: null as null | { source: 'live' | 'native'; capturedAtMs: number },
    feeDraft: {
      amount: '',
      date: '',
      reference: '',
      payerPhone: '',
      bankOrigin: '',
      proof: null as File | null,
    },
    copyLoading: {
      company: false,
      rif: false,
      phone: false,
      amountBs: false,
    },
    termsAccepted: false,
    pendingCommission: data.value.pendingCommission,
    caregiverServices: data.value.caregiverServices,
    blockedPets: data.value.blockedPets || { pendingReviews: [] as string[], pendingPayment: [] as string[], pendingValidation: [] as string[], activeServices: [] as string[] },
    showOwnerModal: false,
    showPetModal: false,
  });

  const getStatusConfig = (status: string | undefined, isOpen: boolean) => {
    const s = (status || (isOpen ? 'open' : 'closed')).toLowerCase();
    switch (s) {
      case 'open':
      case 'abierto':
        return { label: 'Abierto', classes: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 shadow-sm' };
      case 'closed':
      case 'cerrado':
        return { label: 'Cerrado', classes: 'bg-gray-500/10 text-gray-500 border border-gray-500/20 shadow-sm' };
      case 'requested':
      case 'solicitado':
        return { label: 'Solicitado', classes: 'bg-amber-500/10 text-amber-600 border border-amber-500/20 shadow-sm' };
      case 'accepted':
      case 'aceptado':
        return { label: 'Aceptado', classes: 'bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 shadow-sm' };
      case 'paid':
      case 'payment_sent':
        return { label: 'Pago enviado', classes: 'bg-blue-500/10 text-blue-600 border border-blue-500/20 shadow-sm' };
      case 'completed':
      case 'payment_confirmed':
        return { label: 'Pago verificado', classes: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 shadow-sm' };
      case 'fee_submitted':
        return { label: 'Comisión enviada', classes: 'bg-purple-500/10 text-purple-600 border border-purple-500/20 shadow-sm' };
      case 'active':
        return { label: 'En servicio', classes: 'bg-rose-500/10 text-rose-600 border border-rose-500/20 shadow-sm' };
      case 'finished':
      case 'terminado':
        return { label: 'Terminado', classes: 'bg-gray-500/10 text-gray-500 border border-gray-500/20 shadow-sm' };
      default:
        return { label: s, classes: 'bg-gray-500/10 text-gray-500 border border-gray-500/20 shadow-sm' };
    }
  };

  const openNativeCapture = $(() => {
    const input = nativeCameraInputRef.value;
    if (!input) {
      toast.value = 'No se pudo abrir la cámara del dispositivo.';
      return;
    }
    input.value = '';
    input.click();
  });

  const handleNativeCapture = $(async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0] || null;
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.value = 'Selecciona una imagen válida.';
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    if (!dataUrl) {
      toast.value = 'No se pudo procesar la foto.';
      return;
    }

    state.capturedImage = dataUrl;
    state.capturedImageMeta = {
      source: 'native',
      capturedAtMs: file.lastModified || Date.now(),
    };
    state.cameraOpen = true;
  });

  const startCamera = $(async () => {
    toast.value = '';

    if (streamSig.value) {
      streamSig.value.getTracks().forEach((track) => track.stop());
      streamSig.value = null;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      openNativeCapture();
      return;
    }

    const candidates: MediaStreamConstraints[] = [
      { video: { facingMode: { ideal: 'environment' } } },
      { video: { facingMode: { ideal: 'user' } } },
      { video: true },
    ];

    for (const constraints of candidates) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamSig.value = stream;
        state.capturedImage = null;
        state.cameraOpen = true;
        return;
      } catch {
      }
    }

    toast.value = 'No se pudo abrir la cámara en vivo. Abriendo captura del dispositivo…';
    openNativeCapture();
  });

  const cameraMounted = $(async () => {
    if (videoRef.value && streamSig.value) {
      videoRef.value.srcObject = streamSig.value;
      try {
        await videoRef.value.play();
      } catch {
      }
    }
  });

  useVisibleTask$(({ track }) => {
    const stream = track(() => streamSig.value);
    if (!stream) return;

    // Delay slightly to ensure ref is attached
    setTimeout(() => {
      void cameraMounted();
    }, 50);
  });

  const stopCamera = $(() => {
    if (streamSig.value) {
      streamSig.value.getTracks().forEach(t => t.stop());
      streamSig.value = null;
    }
    state.cameraOpen = false;
    state.capturedImage = null;
    state.capturedImageMeta = null;
  });

  const capturePhoto = $(() => {
    if (!videoRef.value || !canvasRef.value) return;
    const video = videoRef.value;
    const canvas = canvasRef.value;

    // 1. Instant feedback: Pause video to "freeze" the moment
    video.pause();

    // 2. Add Flash Effect
    const flash = document.createElement('div');
    flash.style.position = 'absolute';
    flash.style.inset = '0';
    flash.style.backgroundColor = 'white';
    flash.style.zIndex = '50';
    flash.style.transition = 'opacity 150ms ease-out';
    video.parentElement?.appendChild(flash);

    // Animate flash
    requestAnimationFrame(() => {
      flash.style.opacity = '0';
      setTimeout(() => flash.remove(), 150);
    });

    // 3. Process Capture & Resize
    const maxWidth = 1024;
    const maxHeight = 1024;
    let width = video.videoWidth;
    let height = video.videoHeight;

    if (width > height) {
      if (width > maxWidth) {
        height *= maxWidth / width;
        width = maxWidth;
      }
    } else {
      if (height > maxHeight) {
        width *= maxHeight / height;
        height = maxHeight;
      }
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, width, height);
      // Directly capture at optimized resolution and quality
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      state.capturedImage = dataUrl;
      state.capturedImageMeta = {
        source: 'live',
        capturedAtMs: Date.now(),
      };

      // Stop stream after capture to save battery/resources
      if (streamSig.value) {
        streamSig.value.getTracks().forEach(t => t.stop());
        streamSig.value = null;
      }
    }
  });

  const sendPhoto = $(async () => {
    if (!state.capturedImage || !state.chat?.id) return;

    const now = Date.now();
    const metadata = state.capturedImageMeta;
    if (!metadata) {
      toast.value = 'No se pudo validar la fecha de la foto. Tómala nuevamente.';
      return;
    }

    if (metadata.source === 'live') {
      const maxAgeMs = 10 * 60 * 1000;
      if (now - metadata.capturedAtMs > maxAgeMs) {
        toast.value = 'La foto en vivo venció. Tómala otra vez antes de enviarla.';
        return;
      }
    } else if (!isSameLocalDay(metadata.capturedAtMs, now)) {
      toast.value = 'La foto debe ser del día de hoy. Tómala nuevamente desde la cámara del dispositivo.';
      return;
    }

    loading.sending = true;
    // 0. Image is already optimized during capture
    const optimizedImage = state.capturedImage;

    // 1. Upload
    const res = await uploadImage(optimizedImage);
    if (!res.ok) {
      toast.value = 'Error subiendo foto.';
      loading.sending = false;
      return;
    }
    const url = res.path || res.url;

    // 2. Send Message (media link separate from text)
    // "Foto en vivo del día" text added to message
    const textDesc = `📸 **Foto en vivo**`;

    const result = await sendMessageServer(state.chat.id, textDesc, url);
    if (!result.ok) {
      toast.value = 'Error enviando foto.';
    } else {
      state.messages = result.messages;
      toast.value = 'Foto enviada.';
    }

    // Cleanup
    loading.sending = false;
    stopCamera();
  });


  const copyToClipboard = $(async (
    key: 'company' | 'rif' | 'phone' | 'amountBs',
    value: string,
    successMessage: string,
  ) => {
    state.copyLoading[key] = true;
    try {
      await navigator.clipboard.writeText(value);
      toast.value = successMessage;
    } catch {
      toast.value = 'No se pudo copiar al portapapeles.';
    } finally {
      state.copyLoading[key] = false;
    }
  });

  useVisibleTask$(({ cleanup }) => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const scheduleTick = () => {
      currentTime.value = Date.now();
      const serviceEndRaw = state.serviceRequest?.request.endDate || state.serviceRequest?.booking?.dateTo || '';
      const serviceEnd = serviceEndRaw ? new Date(serviceEndRaw) : null;
      const remainingMs = serviceEnd && !Number.isNaN(serviceEnd.getTime())
        ? Math.max(0, serviceEnd.getTime() - Date.now())
        : Number.POSITIVE_INFINITY;

      const nextDelay = remainingMs <= 5 * 60 * 1000
        ? 1000
        : remainingMs <= 60 * 60 * 1000
          ? 10000
          : 30000;

      timer = setTimeout(scheduleTick, nextDelay);
    };

    scheduleTick();

    cleanup(() => {
      if (timer) clearTimeout(timer);
      if (streamSig.value) {
        streamSig.value.getTracks().forEach((track) => track.stop());
        streamSig.value = null;
      }
    });
  });

  const loadOwner = $(async () => {
    if (!state.chat?.ownerId) return;
    state.loadingProfile = true;
    const result = await loadOwnerProfile(state.chat.ownerId);
    state.viewOwner = result.profile;
    state.viewOwnerReviews = result.reviews || [];
    state.showOwnerModal = true;
    state.loadingProfile = false;
  });

  const loadPet = $(async () => {
    if (!state.chat?.petId) return;
    state.loadingProfile = true;
    const result = await loadPetProfile(state.chat.petId);
    state.viewPet = result;
    state.showPetModal = true;
    state.loadingProfile = false;
  });

  const goToCaregiverProfile = $(async () => {
    if (!state.chat?.caregiverId) return;
    await nav(`/dashboard/caregiver/${state.chat.caregiverId}`);
  });

  useTask$(({ track }) => {
    track(() => state.chat?.id);
    if (!state.chat?.id) return;

    // Use available dates from loader to pre-filter search dates
    const availableDatesSet = new Set(state.caregiverAvailableDates || []);
    const preferredDates = (state.preferredDates || []).slice().sort();
    const preferredDatesFiltered = preferredDates.filter((date) => availableDatesSet.size === 0 || availableDatesSet.has(date));

    // Initialization logic: only run if we don't have a selection yet or if chat ID changed
    // (Qwik useTask$ will already run on mount/id change, so this is mostly to avoid double-triggers)
    const prefilledDateFrom = preferredDatesFiltered[0] || state.preferredDateFrom;
    const prefilledDateTo = preferredDatesFiltered[preferredDatesFiltered.length - 1] || state.preferredDateTo || state.preferredDateFrom;

    state.selectedBookingDates = preferredDatesFiltered;
    state.bookingSelectionMode = 'intercalados';
    state.bookingViewMode = 'calendario';
    state.bookingRangeAnchor = '';
    state.bookingDateInput = '';
    state.bookingDayTimes = preferredDatesFiltered.reduce<Record<string, { timeFrom: string; timeTo: string }>>((acc, day) => {
      acc[day] = { timeFrom: '08:00', timeTo: '18:00' };
      return acc;
    }, {});

    const monthSeed = prefilledDateFrom || `${new Date().getFullYear()}-${`${new Date().getMonth() + 1}`.padStart(2, '0')}-01`;
    state.bookingMonthCursor = monthSeed.slice(0, 7);

    state.serviceDraft.service = 'alojamiento';
    state.serviceDraft.dateFrom = prefilledDateFrom;
    state.serviceDraft.timeFrom = '08:00';
    state.serviceDraft.dateTo = prefilledDateTo;
    state.serviceDraft.timeTo = '18:00';
    state.serviceDraft.amountUsd = '';
    const initialIds = (data.value.chat?.petId || '').split(',').filter(Boolean);
    const blockedPets = data.value.blockedPets || { pendingReviews: [], pendingPayment: [], pendingValidation: [], activeServices: [] };
    const validIds = initialIds.filter(id =>
      !blockedPets.pendingPayment.includes(id) &&
      !blockedPets.pendingValidation.includes(id)
    );

    if (data.value.caregiverMultiPet) {
      state.serviceDraft.petId = validIds.join(',');
    } else if (validIds.length > 0) {
      state.serviceDraft.petId = validIds[0];
    } else {
      const firstValidPet = state.ownerPets.find(op =>
        !blockedPets.pendingPayment.includes(op.id) &&
        !blockedPets.pendingValidation.includes(op.id)
      );
      state.serviceDraft.petId = firstValidPet ? firstValidPet.id : '';
    }
  });

  useTask$(({ track }) => {
    track(() => state.selectedBookingDates.join('|'));
    track(() => state.serviceDraft.timeFrom);
    track(() => state.serviceDraft.timeTo);
    const sorted = state.selectedBookingDates.slice().sort();
    if (sorted.length > 0) {
      state.serviceDraft.dateFrom = sorted[0];
      state.serviceDraft.dateTo = sorted[sorted.length - 1];
    }

    const nextTimes: Record<string, { timeFrom: string; timeTo: string }> = {};
    for (const day of sorted) {
      const previous = state.bookingDayTimes[day];
      nextTimes[day] = {
        timeFrom: previous?.timeFrom || state.serviceDraft.timeFrom || '08:00',
        timeTo: previous?.timeTo || state.serviceDraft.timeTo || '18:00',
      };
    }
    state.bookingDayTimes = nextTimes;
  });

  useTask$(({ track }) => {
    track(() => state.selectedBookingDates.join('|'));
    track(() => state.serviceDraft.dateFrom);
    track(() => state.serviceDraft.dateTo);
    track(() => state.serviceDraft.timeFrom);
    track(() => state.serviceDraft.timeTo);
    track(() => state.serviceDraft.petId);
    track(() => JSON.stringify(state.bookingDayTimes));

    if (!state.chat) return;

    const billableDays = getBillableDaysForCurrentSelection(
      state.selectedBookingDates,
      state.serviceDraft,
      state.bookingDayTimes,
    );

    const price = Math.max(state.chat.caregiverPricePerDay || 0, 10);
    const petCount = state.serviceDraft.petId.split(',').filter(Boolean).length || 1;
    const total = Math.max(0, billableDays) * price * petCount;
    state.serviceDraft.amountUsd = total.toFixed(2);
  });

  useTask$(({ track }) => {
    track(() => state.viewOwner?.locationLat);
    track(() => state.viewOwner?.locationLng);

    const latitude = Number(state.viewOwner?.locationLat || 0);
    const longitude = Number(state.viewOwner?.locationLng || 0);
    const hasValidPoint = Number.isFinite(latitude)
      && Number.isFinite(longitude)
      && Math.abs(latitude) <= 90
      && Math.abs(longitude) <= 180
      && !(latitude === 0 && longitude === 0);

    if (!hasValidPoint) return;

    ownerModalLocation.value = {
      point: [latitude, longitude],
      zoom: 16,
      marker: true,
    };
  });

  useTask$(({ track }) => {
    track(() => state.serviceRequest?.request.price);
    if (state.serviceRequest?.request.price) {
      const fee = state.serviceRequest.request.price * 0.20;
      state.feeDraft.amount = fee.toFixed(2);
    }
  });

  useTask$(async ({ track }) => {
    const sreq = track(() => state.serviceRequest);
    const petId = sreq?.request.petId;
    const petIds = getPetIdsFromValue(petId);

    if (petIds.length === 0) {
      state.viewPet = null;
      state.viewPets = [];
      return;
    }

    if (!state.loadingProfile) {
      state.loadingProfile = true;
      try {
        if (petIds.length === 1) {
          const singlePetId = petIds[0];
          if (!state.viewPet || state.viewPet.id !== singlePetId) {
            const result = await loadPetProfile(singlePetId);
            state.viewPet = result;
            state.viewPets = result ? [result] : [];
          } else {
            state.viewPets = state.viewPet ? [state.viewPet] : [];
          }
        } else {
          const multiPets = await loadPetProfiles(petIds);
          state.viewPets = multiPets;
          state.viewPet = null;
        }
      } finally {
        state.loadingProfile = false;
      }
    }
  });

  useVisibleTask$(({ track, cleanup }) => {
    track(() => state.chat?.id);
    if (!state.chat?.id) return;
    let cancelled = false;

    const poll = async () => {
      if (cancelled || !state.chat?.id) return;

      const [messagesSettled, serviceSettled] = await Promise.allSettled([
        loadMessages(state.chat.id),
        loadService(state.chat.id),
      ]);

      const messagesResult = messagesSettled.status === 'fulfilled' ? messagesSettled.value : null;
      const serviceResult = serviceSettled.status === 'fulfilled' ? serviceSettled.value : null;

      if (messagesResult?.ok) {
        if (messagesResult.messages.length !== state.messages.length ||
          messagesResult.messages[messagesResult.messages.length - 1]?.id !== state.messages[state.messages.length - 1]?.id) {
          state.messages = messagesResult.messages;
        }
      }

      if (serviceResult?.ok) {
        if (JSON.stringify(serviceResult.service) !== JSON.stringify(state.serviceRequest)) {
          state.serviceRequest = serviceResult.service;
        }
        if (serviceResult.pendingCommission !== state.pendingCommission) {
          state.pendingCommission = serviceResult.pendingCommission;
        }
        if (serviceResult.caregiverOccupiedSlots !== undefined) {
          state.caregiverOccupiedSlots = serviceResult.caregiverOccupiedSlots;
        }
        if (serviceResult.caregiverAvailableDates) {
          state.caregiverAvailableDates = serviceResult.caregiverAvailableDates;
        }
        // Refresh blocked pets so the UI disables occupied pets in real-time
        if (serviceResult.blockedPets) {
          state.blockedPets = {
            activeServices: serviceResult.blockedPets.activeServices || [],
            pendingPayment: serviceResult.blockedPets.pendingPayment || [],
            pendingValidation: serviceResult.blockedPets.pendingValidation || [],
            pendingReviews: serviceResult.blockedPets.pendingReviews || [],
          };
        }
      }
    };
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectDelayMs = 2000;
    let pollDebounce: ReturnType<typeof setTimeout> | undefined;

    const connectWs = () => {
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
      }

      void poll(); // Initial load

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        reconnectDelayMs = 2000;
        void poll();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'SYNC_COUNTS' || (data.type === 'CAREGIVER_CAPACITY_CHANGED' && data.caregiverId === state.chat?.caregiverId)) {
            // Debounce: coalesce rapid-fire SYNC_COUNTS into a single poll
            if (pollDebounce) clearTimeout(pollDebounce);
            pollDebounce = setTimeout(() => {
              void poll();
            }, 2000);
          }
        } catch (err) {
          console.error('[WS-Chat] Message parse error:', err);
        }
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

    // Fallback: poll every 10s so the UI never goes stale even if WS misses a message
    const pollInterval = setInterval(() => {
      void poll();
    }, 10_000);

    cleanup(() => {
      cancelled = true;
      clearInterval(pollInterval);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      window.removeEventListener('online', onOnline);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    });
  });

  const remainingPetCapacity = Math.max(0, state.caregiverPetLimit - state.caregiverOccupiedSlots);
  const currentOccupancyFull = remainingPetCapacity <= 0;
  const selectionCapacityDates = getSelectionDatesForCapacity(state.selectedBookingDates, state.serviceDraft);
  const hasSelectionCapacityDates = selectionCapacityDates.length > 0;
  const effectiveSelectionRemainingCapacity = hasSelectionCapacityDates
    ? Math.max(0, state.selectionRemainingCapacity)
    : state.caregiverPetLimit;

  useTask$(({ track }) => {
    track(() => state.role);
    track(() => state.caregiverMultiPet);
    track(() => state.caregiverPetLimit);
    track(() => state.selectionRemainingCapacity);
    track(() => state.selectedBookingDates.join('|'));
    track(() => state.serviceDraft.dateFrom);
    track(() => state.serviceDraft.dateTo);
    track(() => state.serviceDraft.petId);

    if (state.role !== 'owner') return;

    const allowedCount = state.caregiverMultiPet ? effectiveSelectionRemainingCapacity : Math.min(1, effectiveSelectionRemainingCapacity);
    const nextValue = state.caregiverMultiPet
      ? limitSelectedPetIds(state.serviceDraft.petId, allowedCount)
      : (allowedCount > 0 ? (getPetIdsFromValue(state.serviceDraft.petId)[0] || '') : '');

    if (nextValue !== state.serviceDraft.petId) {
      state.serviceDraft.petId = nextValue;
      toast.value = allowedCount > 0
        ? `El cupo del cuidador cambió. Solo puedes reservar ${allowedCount} ${allowedCount === 1 ? 'mascota' : 'mascotas'} por ahora.`
        : 'El cuidador quedó sin cupo disponible en este momento.';
    }
  });

  useVisibleTask$(({ track, cleanup }) => {
    track(() => state.chat?.id);
    track(() => state.caregiverPetLimit);
    track(() => state.selectedBookingDates.join('|'));
    track(() => state.serviceDraft.dateFrom);
    track(() => state.serviceDraft.dateTo);

    if (!state.chat?.id || state.role !== 'owner') return;

    const selectedDates = getSelectionDatesForCapacity(state.selectedBookingDates, state.serviceDraft);
    if (selectedDates.length === 0) {
      state.selectionRemainingCapacity = state.caregiverPetLimit;
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await loadSelectionCapacity(state.chat!.id, selectedDates);
      if (cancelled || !result.ok) return;
      state.selectionRemainingCapacity = result.remainingCapacity;
    }, 180);

    cleanup(() => {
      cancelled = true;
      clearTimeout(timer);
    });
  });

  useVisibleTask$(({ track }) => {
    const file = track(() => state.paymentDraft.proof);
    if (file) {
      const url = URL.createObjectURL(file);
      paymentProofPreview.value = url;
      return () => URL.revokeObjectURL(url);
    } else {
      paymentProofPreview.value = '';
    }
  });

  useVisibleTask$(({ track }) => {
    const file = track(() => state.feeDraft.proof);
    if (file) {
      const url = URL.createObjectURL(file);
      feeProofPreview.value = url;
      return () => URL.revokeObjectURL(url);
    } else {
      feeProofPreview.value = '';
    }
  });

  const refreshChat = $(async () => {
    if (!state.chat?.id) return;
    loading.refreshing = true;
    const [messagesSettled, serviceSettled] = await Promise.allSettled([
      loadMessages(state.chat.id),
      loadService(state.chat.id),
    ]);
    const messagesResult = messagesSettled.status === 'fulfilled' ? messagesSettled.value : null;
    const serviceResult = serviceSettled.status === 'fulfilled' ? serviceSettled.value : null;
    state.messages = messagesResult?.ok ? messagesResult.messages : [];
    state.serviceRequest = serviceResult?.ok ? serviceResult.service : null;
    loading.refreshing = false;
  });

  const sendMessage = $(async () => {
    if (!state.chat?.id) return;
    if (!state.messageDraft.trim()) {
      toast.value = 'Escribe un mensaje antes de enviar.';
      return;
    }
    loading.sending = true;
    const result = await sendMessageServer(state.chat.id, state.messageDraft);
    if (!result.ok) {
      toast.value = result.reason === 'empty' ? 'Escribe un mensaje antes de enviar.' : 'No se pudo enviar el mensaje.';
      loading.sending = false;
      return;
    }
    state.messages = result.messages;
    state.messageDraft = '';
    loading.sending = false;
  });

  const submitReport = $(async () => {
    if (!state.chat?.id) return;
    if (!state.reportDraft.trim()) {
      toast.value = 'Describe el problema para reportar.';
      return;
    }
    loading.reporting = true;
    const result = await reportChatServer(state.chat.id, state.reportDraft);
    if (!result.ok) {
      toast.value = result.reason === 'empty' ? 'Describe el problema para reportar.' : 'No se pudo enviar el reporte.';
      loading.reporting = false;
      return;
    }
    state.reportDraft = '';
    showReport.value = false;
    loading.reporting = false;
  });

  const handleCloseChat = $(async () => {
    if (!state.chat?.id) return;

    if (state.serviceRequest && !state.isAdmin) {
      const { request, booking } = state.serviceRequest;
      const requestStatus = request.status;
      const activeStatuses = ['requested', 'accepted', 'paid', 'payment_sent', 'payment_confirmed', 'fee_submitted', 'active', 'in_progress', 'completed'];

      if (activeStatuses.includes(requestStatus)) {
        const requestEndDateRaw = request.endDate || booking?.dateTo || '';
        const requestEndDate = requestEndDateRaw ? new Date(requestEndDateRaw) : null;
        const hasServiceEnded = Boolean(requestEndDate && !Number.isNaN(requestEndDate.getTime()) && requestEndDate.getTime() <= Date.now());

        if (!hasServiceEnded) {
          toast.value = 'No puedes cerrar el chat: el servicio aún está en curso.';
          return;
        }

        if (booking && !booking.feeValidated) {
          toast.value = 'No puedes cerrar el chat: falta el pago o validación de la comisión.';
          return;
        }
      }
    }

    if (!confirm('¿Estás seguro de que quieres cerrar este chat? Una vez cerrado no podrá ser reabierto y no se podrán enviar más mensajes.')) return;

    loading.closing = true;
    const result = await closeChatServer(state.chat.id);
    if (!result.ok) {
      toast.value = 'No se pudo cerrar el chat.';
      loading.closing = false;
      return;
    }

    toast.value = 'Chat cerrado correctamente.';
    loading.closing = false;
    await refreshChat();
  });

  const handleRehireChat = $(async () => {
    if (!state.chat?.id || state.role !== 'owner') return;

    loading.rehiring = true;
    const result = await rehireChatServer(state.chat.id);
    if (!result.ok) {
      toast.value = 'No se pudo recontratar por chat en este momento.';
      loading.rehiring = false;
      return;
    }

    loading.rehiring = false;
    await nav(`/dashboard/chat/${result.id}`);
  });


  const submitService = $(async () => {
    if (state.role !== 'owner') return;
    if (!state.chat?.id) return;

    if (!state.serviceDraft.petId) {
      toast.value = 'Debes seleccionar una mascota para reservar.';
      return;
    }

    const selectedPets = getPetIdsFromValue(state.serviceDraft.petId);
    const allowedSelectionCount = state.caregiverMultiPet ? effectiveSelectionRemainingCapacity : Math.min(1, effectiveSelectionRemainingCapacity);
    if (selectedPets.length > allowedSelectionCount) {
      toast.value = allowedSelectionCount > 0
        ? `Solo quedan ${allowedSelectionCount} ${allowedSelectionCount === 1 ? 'cupo disponible' : 'cupos disponibles'} con este cuidador.`
        : 'El cuidador está sin cupo disponible en este momento.';
      return;
    }
    if (!state.termsAccepted) {
      toast.value = 'Debes aceptar los términos y condiciones para reservar.';
      return;
    }

    const selectedDays = Array.from(new Set(state.selectedBookingDates)).sort();
    const effectiveDateFrom = selectedDays[0] || state.serviceDraft.dateFrom;
    const effectiveDateTo = selectedDays[selectedDays.length - 1] || state.serviceDraft.dateTo;
    const selectedEpochDays = selectedDays.map((value) => toUtcEpochDay(value));
    let selectedSegments = 0;
    for (let index = 0; index < selectedEpochDays.length; index++) {
      if (index === 0 || selectedEpochDays[index] !== selectedEpochDays[index - 1] + 1) {
        selectedSegments += 1;
      }
    }
    const isMixedSchedule = selectedSegments > 1;

    if (allowedSelectionCount <= 0) {
      toast.value = hasSelectionCapacityDates
        ? 'El cuidador no tiene cupo disponible para las fechas seleccionadas.'
        : 'El cuidador está sin cupo disponible en este momento.';
      return;
    }

    loading.creating = true;

    if (!effectiveDateFrom || !effectiveDateTo) {
      toast.value = 'Selecciona al menos un día para reservar.';
      return;
    }

    const effectiveTimeFrom = isMixedSchedule
      ? (state.bookingDayTimes[effectiveDateFrom]?.timeFrom || state.serviceDraft.timeFrom || '08:00')
      : state.serviceDraft.timeFrom;
    const effectiveTimeTo = isMixedSchedule
      ? (state.bookingDayTimes[effectiveDateTo]?.timeTo || state.serviceDraft.timeTo || '18:00')
      : state.serviceDraft.timeTo;

    loading.requesting = true;
    const amount = Number(state.serviceDraft.amountUsd);
    const result = await createService(
      state.chat.id,
      state.serviceDraft.service,
      effectiveDateFrom,
      effectiveDateTo,
      effectiveTimeFrom,
      effectiveTimeTo,
      Number.isNaN(amount) ? undefined : amount,
      state.serviceDraft.petId,
      selectedDays
    );
    if (!result.ok) {
      if (result.reason === 'missing') {
        toast.value = 'Completa el servicio y las fechas.';
      } else if (result.reason === 'active_service_other') {
        toast.value = 'Esta mascota ya tiene un servicio activo con otro cuidador. Espera a que termine antes de contratar otro.';
      } else if (result.reason === 'active_service_same') {
        toast.value = result.detail || 'La mascota ya tiene un servicio activo con este cuidador.';
      } else if (result.reason === 'pending_fee_payment') {
        toast.value = 'No puedes crear una nueva solicitud: hay una comisión pendiente por pagar del servicio anterior.';
      } else if (result.reason === 'pending_fee_validation') {
        toast.value = 'No puedes crear una nueva solicitud: la comisión anterior está en validación por el administrador.';
      } else if (result.reason === 'limit_exceeded') {
        toast.value = result.detail ? `Cupo lleno: ${result.detail}` : 'El cuidador excedió su límite de mascotas para esas fechas.';
      } else if (result.reason === 'availability_conflict') {
        toast.value = 'El cuidador tiene días bloqueados (no disponibles) durante el rango que seleccionaste. Revisa su calendario.';
      } else if (result.reason === 'species_not_accepted') {
        toast.value = `El cuidador no acepta la especie de la mascota seleccionada (${result.detail || 'desconocida'}).`;
      } else if (result.reason === 'size_not_accepted') {
        toast.value = `El cuidador no acepta el tamaño de la mascota seleccionada (${result.detail || 'desconocida'}).`;
      } else if (result.reason === 'no_pets_selected') {
        toast.value = 'Debe seleccionar al menos una mascota.';
      } else if ((result as any).reason === 'limit_exceeded') {
        toast.value = (result as any).detail || 'El cuidador ya no tiene cupos disponibles para estas fechas.';
        void (async () => {
          if (state.chat?.id) {
            const serviceResult = await loadService(state.chat.id);
            if (serviceResult.ok && typeof serviceResult.caregiverOccupiedSlots === 'number') {
              state.caregiverOccupiedSlots = serviceResult.caregiverOccupiedSlots;
            }
          }
        })();
      } else {
        toast.value = `No se pudo crear la solicitud. (${result.reason})`;
      }
      loading.creating = false;
      return;
    }
    state.serviceRequest = result.service;
    if (selectedDays.length > 0) {
      if (isMixedSchedule) {
        const detailLines = selectedDays.slice(0, 20).map((day) => {
          const dayTimes = state.bookingDayTimes[day];
          return `- ${day}: ${dayTimes?.timeFrom || '08:00'} → ${dayTimes?.timeTo || '18:00'}`;
        });
        const suffix = selectedDays.length > 20 ? `\n- ... (+${selectedDays.length - 20} días)` : '';
        await sendMessageServer(
          state.chat.id,
          `📅 **Horario mixto solicitado (${selectedDays.length} días)**\n${detailLines.join('\n')}${suffix}`
        );
      } else {
        await sendMessageServer(
          state.chat.id,
          `📅 **Rango solicitado**: ${effectiveDateFrom} ${effectiveTimeFrom} → ${effectiveDateTo} ${effectiveTimeTo}`
        );
      }
    }
    toast.value = 'Solicitud enviada. Espera la confirmación del cuidador.';
    loading.requesting = false;
  });

  const acceptService = $(async () => {
    if (!state.chat?.id) return;
    loading.requesting = true;
    const result = await updateServiceStatus(state.chat.id, 'accepted');
    if (!result.ok) {
      toast.value = 'No se pudo aceptar la solicitud.';
      loading.requesting = false;
      return;
    }
    state.serviceRequest = result.service;
    toast.value = 'Solicitud aceptada.';
    loading.requesting = false;
  });

  const rejectService = $(async () => {
    if (!state.chat?.id) return;
    loading.requesting = true;
    const result = await updateServiceStatus(state.chat.id, 'rejected');
    if (!result.ok) {
      toast.value = 'No se pudo rechazar la solicitud.';
      loading.requesting = false;
      return;
    }
    state.serviceRequest = result.service;
    toast.value = 'Solicitud rechazada.';
    loading.requesting = false;
  });

  const cancelService = $(async () => {
    if (!state.chat?.id) return;
    if (!confirm('¿Estás seguro de que deseas cancelar esta solicitud?')) return;
    loading.requesting = true;
    const result = await updateServiceStatus(state.chat.id, 'cancelled');
    if (!result.ok) {
      toast.value = 'No se pudo cancelar la solicitud.';
      loading.requesting = false;
      return;
    }
    state.serviceRequest = result.service;

    // Clear state for re-hire ("fresco")
    state.selectedBookingDates = [];
    state.bookingDayTimes = {};
    state.serviceDraft.dateFrom = '';
    state.serviceDraft.dateTo = '';
    state.serviceDraft.amountUsd = '';

    toast.value = 'Solicitud cancelada correctamente.';
    loading.requesting = false;
  });

  const markPaid = $(async () => {
    if (!state.chat?.id) return;
    loading.requesting = true;
    const result = await updateServiceStatus(state.chat.id, 'paid');
    if (!result.ok) {
      toast.value = 'No se pudo marcar el pago.';
      loading.requesting = false;
      return;
    }
    state.serviceRequest = result.service;
    toast.value = 'Pago marcado como enviado.';
    loading.requesting = false;
  });

  const confirmPaid = $(async () => {
    if (!state.chat?.id) return;
    loading.requesting = true;
    const result = await updateServiceStatus(state.chat.id, 'completed');
    if (!result.ok) {
      toast.value = 'No se pudo confirmar el pago.';
      loading.requesting = false;
      return;
    }
    state.serviceRequest = result.service;
    toast.value = 'Pago confirmado.';
    loading.requesting = false;
  });


  const submitReview = $(async () => {
    if (loading.reviewing) return;
    if (!state.chat?.id) {
      toast.value = 'No se encontró el chat para enviar la reseña.';
      return;
    }

    loading.reviewing = true;
    try {
      const result = await submitReviewServer(state.chat.id, state.reviewDraft.rating, state.reviewDraft.comment);
      if (!result.ok) {
        if (result.reason === 'service_not_ended') {
          toast.value = 'La reseña se habilita cuando termine el período de cuidado.';
        } else if (result.reason === 'service_not_ready') {
          toast.value = 'La reseña aún no está disponible porque el servicio no ha sido validado por completo.';
        } else if (result.reason === 'forbidden') {
          toast.value = 'No tienes permiso para reseñar este servicio.';
        } else {
          toast.value = 'No se pudo enviar la reseña.';
        }
        loading.reviewing = false;
        return;
      }

      state.reviewDraft.comment = '';
      toast.value = 'Reseña enviada.';
      reviewInlineSuccess.value = 'Gracias por tu reseña ⭐';
      loading.reviewing = false; // Reset here to show success immediately

      void refreshChat();
      setTimeout(() => {
        reviewInlineSuccess.value = '';
      }, 4500);
    } catch (error) {
      toast.value = 'Error inesperado al enviar la reseña.';
      console.error('[Review] Fatal error during submission:', error);
      loading.reviewing = false;
    }
  });

  const readFileAsDataUrl = $((file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    })
  );

  const submitPayment = $(async () => {
    if (!state.paymentDraft.reference.trim()) {
      toast.value = 'Ingresa la referencia del pago.';
      return;
    }
    if (!state.paymentDraft.proof) {
      toast.value = 'Debes subir el comprobante (capture).';
      return;
    }
    if (!state.serviceRequest?.booking?.id) return;

    loading.requesting = true;
    const originalDataUrl = await readFileAsDataUrl(state.paymentDraft.proof);
    const optimizedDataUrl = await resizeImage(originalDataUrl);
    const result = await submitPaymentServer(state.serviceRequest.booking.id, state.paymentDraft.reference, optimizedDataUrl);

    if (!result.ok) {
      toast.value = 'No se pudo enviar el pago.';
      loading.requesting = false;
      return;
    }

    if (result.service) {
      state.serviceRequest = result.service;
    }

    toast.value = 'Pago enviado. Esperando confirmación.';
    state.paymentDraft.reference = '';
    state.paymentDraft.proof = null;
    loading.requesting = false;
    await refreshChat();
  });



  const submitFee = $(async () => {
    if (loading.feeSubmitting) return;

    const amount = Number(state.feeDraft.amount);
    if (!state.feeDraft.amount || Number.isNaN(amount) || amount <= 0) {
      const message = 'El monto de la comisión es inválido.';
      feeInlineFeedback.value = { type: 'error', message };
      toast.value = message;
      return;
    }
    if (!state.feeDraft.date) {
      const message = 'Debes indicar la fecha del pago.';
      feeInlineFeedback.value = { type: 'error', message };
      toast.value = message;
      return;
    }
    if (!state.feeDraft.reference.trim()) {
      const message = 'Debes ingresar la referencia del pago.';
      feeInlineFeedback.value = { type: 'error', message };
      toast.value = message;
      return;
    }
    if (!/^\d{4,12}$/.test((state.feeDraft.reference || '').replace(/\D/g, ''))) {
      const message = 'La referencia debe tener entre 4 y 12 dígitos numéricos.';
      feeInlineFeedback.value = { type: 'error', message };
      toast.value = message;
      return;
    }
    if (!/^04\d{9}$/.test((state.feeDraft.payerPhone || '').replace(/\D/g, ''))) {
      const message = 'El teléfono pagador debe empezar por 04 y tener 11 dígitos (ej: 04241234567).';
      feeInlineFeedback.value = { type: 'error', message };
      toast.value = message;
      return;
    }
    if (!/^\d{4}$/.test((state.feeDraft.bankOrigin || '').replace(/\D/g, ''))) {
      const message = 'Debes ingresar el banco emisor en formato de 4 dígitos (ej: 0102).';
      feeInlineFeedback.value = { type: 'error', message };
      toast.value = message;
      return;
    }
    if (!state.feeDraft.proof) {
      const message = 'Debes adjuntar el comprobante (capture) antes de reportar la comisión.';
      feeInlineFeedback.value = { type: 'error', message };
      toast.value = message;
      return;
    }
    if (!state.serviceRequest?.booking?.id) {
      const message = 'No se encontró una reserva activa para reportar la comisión.';
      feeInlineFeedback.value = { type: 'error', message };
      toast.value = message;
      console.error('[Commission] Missing booking ID in state.serviceRequest');
      return;
    }

    loading.feeSubmitting = true;
    feeInlineFeedback.value = null;

    console.log('[Commission] Starting fee submission...', { reference: state.feeDraft.reference, amount });
    const originalDataUrl = await readFileAsDataUrl(state.feeDraft.proof);
    console.log('[Commission] File read, optimizing image...');
    const optimizedDataUrl = await resizeImage(originalDataUrl);
    console.log('[Commission] Image optimized, sending to server...');

    try {
      const result = await submitFeePaymentServer(
        state.serviceRequest.booking.id,
        state.feeDraft.reference,
        optimizedDataUrl,
        state.feeDraft.date,
        Number.isNaN(amount) ? 0 : amount,
        state.feeDraft.payerPhone,
        state.feeDraft.bankOrigin,
      );

      console.log('[Commission] Server response:', result);

      if (!result.ok) {
        toast.value = 'Error enviando el pago de comisión.';
        const reasonLabel = result.reason === 'invalid_reference'
          ? 'referencia inválida (4-12 dígitos)'
          : result.reason === 'invalid_payer_phone'
            ? 'teléfono pagador inválido'
            : result.reason === 'invalid_bank_origin'
              ? 'banco emisor inválido'
              : (result.reason || 'error desconocido');
        feeInlineFeedback.value = { type: 'error', message: `No se pudo enviar el reporte (${reasonLabel}). Verifica los datos e intenta nuevamente.` };
        return;
      }

      if (result.service) {
        state.serviceRequest = result.service;
        console.log('[Commission] Service status updated locally:', state.serviceRequest.booking?.status);
      }

      const successMessage = result.autoValidationMessage || (result.autoValidated
        ? 'BDV confirmó el pago y la comisión quedó validada automáticamente.'
        : 'Comisión reportada. Esperando validación.');

      toast.value = successMessage;
      feeInlineFeedback.value = {
        type: result.autoValidated ? 'success' : 'warning',
        message: result.autoValidated
          ? '¡Pago confirmado con BDV! ✅ La comisión quedó validada automáticamente.'
          : 'Reporte recibido. BDV aún no confirmó esta referencia; quedará en revisión.',
      };
      state.feeDraft.reference = '';
      state.feeDraft.payerPhone = '';
      state.feeDraft.bankOrigin = '';
      state.feeDraft.proof = null;
      await refreshChat();
    } catch (err) {
      console.error('[Commission] Fatal error during submission:', err);
      toast.value = 'Error crítico al reportar la comisión.';
      feeInlineFeedback.value = { type: 'error', message: 'Ocurrió un error inesperado. Por favor intenta más tarde.' };
    } finally {
      loading.feeSubmitting = false;
    }
  });

  const confirmPayment = $(async (confirmed: boolean) => {
    if (!state.serviceRequest?.booking?.id) return;
    loading.requesting = true;
    const result = await confirmPaymentServer(state.serviceRequest.booking.id, confirmed);

    if (!result.ok) {
      toast.value = 'Error procesando la confirmación.';
      loading.requesting = false;
      return;
    }

    if (result.service) {
      state.serviceRequest = result.service;
    }

    toast.value = confirmed ? 'Pago confirmado.' : 'Pago rechazado.';
    loading.requesting = false;
    await refreshChat();
  });





  if (!state.chat) {
    return (
      <div class="min-h-screen bg-[#f6f6f6]">
        <div class="max-w-3xl mx-auto px-4 py-10">
          <p class="text-sm text-gray-600">Chat no encontrado.</p>
          <Link class="text-sm text-[#4a2e85]" href="/dashboard/chat">Volver a chats</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {(() => {
        const chat = state.chat!;
        const requestStatus = state.serviceRequest?.request.status || '';
        const bank = state.serviceRequest?.bank;
        let showContracted = ['accepted', 'paid', 'completed', 'payment_sent', 'payment_confirmed', 'fee_submitted', 'active'].includes(requestStatus);
        const requestEndDateRaw = state.serviceRequest?.request.endDate || state.serviceRequest?.booking?.dateTo || '';
        const requestEndDate = requestEndDateRaw ? new Date(requestEndDateRaw) : null;
        const hasServiceEnded = Boolean(requestEndDate && !Number.isNaN(requestEndDate.getTime()) && requestEndDate.getTime() <= currentTime.value);

        const requestStartDateRaw = state.serviceRequest?.request.startDate || state.serviceRequest?.booking?.dateFrom || '';
        const requestStartDate = requestStartDateRaw ? new Date(requestStartDateRaw) : null;
        const hasCareStarted = Boolean(requestStartDate && !Number.isNaN(requestStartDate.getTime()) && currentTime.value >= requestStartDate.getTime());

        const todayStart = new Date(currentTime.value);
        todayStart.setHours(0, 0, 0, 0);
        const hasSentPhotoToday = state.messages.some(msg => msg.sender === 'caregiver' && (msg.text || '').includes('📸 **Foto en vivo**') && msg.ts && new Date(msg.ts).getTime() >= todayStart.getTime());

        const reviewEligibleStatuses = ['payment_confirmed', 'fee_submitted', 'active', 'completed', 'finished'];
        const commissionPaid = state.pendingCommission === null;
        let canReviewNow = reviewEligibleStatuses.includes(requestStatus) && commissionPaid;

        // Reviews are only allowed once the agreed care window has actually ended.
        canReviewNow = canReviewNow && (hasServiceEnded || requestStatus === 'finished');
        const ownerReviewPending = state.role === 'owner' && canReviewNow && !state.serviceRequest?.request.ownerRating;
        const caregiverReviewPending = state.role === 'caregiver' && canReviewNow && !state.serviceRequest?.request.caregiverRating;
        const reviewWindowPending = reviewEligibleStatuses.includes(requestStatus) && commissionPaid && !canReviewNow;
        const reviewUnlockLabel = requestEndDate && !Number.isNaN(requestEndDate.getTime())
          ? new Intl.DateTimeFormat('es-VE', {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(requestEndDate)
          : '';
        const reviewCountdownLabel = requestEndDate && !Number.isNaN(requestEndDate.getTime()) && requestEndDate.getTime() > currentTime.value
          ? formatServiceCountdown(requestEndDate.getTime(), currentTime.value)
          : '';
        const reviewCountdownMs = requestEndDate && !Number.isNaN(requestEndDate.getTime())
          ? Math.max(0, requestEndDate.getTime() - currentTime.value)
          : 0;
        const reviewCountdownTone = reviewCountdownMs <= 60 * 60 * 1000
          ? 'critical'
          : reviewCountdownMs <= 6 * 60 * 60 * 1000
            ? 'warning'
            : 'normal';
        const reviewCardClasses = reviewCountdownTone === 'critical'
          ? 'border-rose-200 bg-gradient-to-br from-rose-50 to-orange-50'
          : reviewCountdownTone === 'warning'
            ? 'border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50'
            : 'border-[#4a2e85]/12 bg-gradient-to-br from-[#f7f3ff] via-white to-[#fff7f2]';
        const reviewIconClasses = reviewCountdownTone === 'critical'
          ? 'bg-rose-100 text-rose-700'
          : reviewCountdownTone === 'warning'
            ? 'bg-amber-100 text-amber-700'
            : 'bg-[#4a2e85]/10 text-[#4a2e85]';
        const reviewTitleClasses = reviewCountdownTone === 'critical'
          ? 'text-rose-900'
          : reviewCountdownTone === 'warning'
            ? 'text-amber-900'
            : 'text-[#4a2e85]';
        const reviewTextClasses = reviewCountdownTone === 'critical'
          ? 'text-rose-800/80'
          : reviewCountdownTone === 'warning'
            ? 'text-amber-800/80'
            : 'text-[#4a2e85b3]';
        const reviewCountdownBadgeClasses = reviewCountdownTone === 'critical'
          ? 'bg-rose-100 border border-rose-200 text-rose-900'
          : reviewCountdownTone === 'warning'
            ? 'bg-amber-100/80 border border-amber-200 text-amber-900'
            : 'bg-white border border-[#4a2e85]/15 text-[#4a2e85]';
        const reviewPendingTitle = hasCareStarted ? 'Cuidado en curso' : 'El cuidado aún no comienza';
        const reviewPendingDescription = 'Las reseñas se habilitan solo cuando termine el período de cuidado acordado.';
        const reviewPendingUnlockText = reviewUnlockLabel
          ? `Podrás dejar tu reseña cuando finalice el servicio, a partir de ${reviewUnlockLabel}.`
          : 'Podrás dejar tu reseña cuando finalice el período de cuidado acordado.';
        const sectionCardClasses = 'bg-white p-4 rounded-2xl border border-[#4a2e85]/10';
        const gradientSectionCardClasses = 'rounded-2xl border border-[#4a2e85]/15 bg-gradient-to-br from-[#f7f3ff] via-white to-[#fff7f2] p-4 sm:p-5 shadow-sm';
        const formInputClasses = 'mt-1 w-full border border-[#4a2e85]/20 rounded-xl px-3 py-2 text-sm';
        const fileInputClasses = 'mt-1 w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[#4a2e85]/10 file:text-[#4a2e85] hover:file:bg-[#4a2e85]/20';
        const primaryActionButtonClasses = 'w-full py-3 rounded-xl bg-[#4a2e85] text-white text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2';
        const subtlePillClasses = 'px-2 py-1 rounded-full text-[10px] font-bold bg-[#4a2e85]/10 text-[#4a2e85]';
        const blockedPetsState = state.blockedPets || {
          pendingReviews: [] as string[],
          pendingPayment: [] as string[],
          pendingValidation: [] as string[],
          activeServices: [] as string[],
        };
        const selectedPetIds = getPetIdsFromValue(state.serviceDraft.petId);
        const selectedPetCount = selectedPetIds.filter((id) =>
          !blockedPetsState.pendingPayment.includes(id) && !blockedPetsState.pendingValidation.includes(id)
        ).length;
        const petSelectionHelpText = state.caregiverMultiPet
          ? `${hasSelectionCapacityDates ? `Cupo para las fechas seleccionadas: ${effectiveSelectionRemainingCapacity}.` : `Máximo por reserva: ${state.caregiverPetLimit}.`} Selecciona las que participarán (${selectedPetCount} seleccionadas).`
          : `${hasSelectionCapacityDates ? `Cupo para las fechas seleccionadas: ${effectiveSelectionRemainingCapacity}.` : 'El cuidador acepta una sola mascota por reserva.'} Marca solo 1 (${state.serviceDraft.petId ? 1 : 0} seleccionada).`;
        const maxSelectablePets = state.caregiverMultiPet
          ? effectiveSelectionRemainingCapacity
          : Math.min(1, effectiveSelectionRemainingCapacity);
        const ownerPetOptions = state.ownerPets.map((pet) => {
          const isBlockedByPayment = blockedPetsState.pendingPayment.includes(pet.id);
          const isBlockedByValidation = blockedPetsState.pendingValidation.includes(pet.id);
          const isBlocked = isBlockedByPayment || isBlockedByValidation;
          const isSelected = !isBlocked && (state.caregiverMultiPet
            ? selectedPetIds.includes(pet.id)
            : state.serviceDraft.petId === pet.id);
          const capacityReached = !isSelected && selectedPetIds.length >= maxSelectablePets;
          const isDisabled = isBlocked || maxSelectablePets <= 0 || capacityReached;

          let blockReason = '';
          if (isBlockedByPayment) blockReason = '(Comisión pendiente)';
          else if (isBlockedByValidation) blockReason = '(Validando pago)';
          else if (maxSelectablePets <= 0) blockReason = '(Sin cupo)';
          else if (capacityReached) blockReason = '(Cupo completo)';

          return {
            pet,
            isBlocked,
            isSelected,
            isDisabled,
            blockReason,
          };
        });
        const handleOwnerPetSelectionChange = $((petId: string, checked: boolean) => {
          if (!state.caregiverMultiPet) {
            if (checked) {
              state.serviceDraft.petId = petId;
            } else if (state.serviceDraft.petId === petId) {
              state.serviceDraft.petId = '';
            }
            return;
          }

          const currentIds = getPetIdsFromValue(state.serviceDraft.petId);
          if (checked) {
            if (!currentIds.includes(petId)) {
              if (currentIds.length < effectiveSelectionRemainingCapacity) {
                currentIds.push(petId);
              } else {
                toast.value = effectiveSelectionRemainingCapacity > 0
                  ? `Solo quedan ${effectiveSelectionRemainingCapacity} ${effectiveSelectionRemainingCapacity === 1 ? 'cupo disponible' : 'cupos disponibles'} para las fechas seleccionadas.`
                  : 'El cuidador quedó sin cupo disponible para las fechas seleccionadas.';
                return;
              }
            }
          } else {
            const idx = currentIds.indexOf(petId);
            if (idx > -1) currentIds.splice(idx, 1);
          }
          state.serviceDraft.petId = currentIds.join(',');
        });
        const bookingSelectedDatesSorted = [...state.selectedBookingDates].sort();
        const [cursorYearRaw, cursorMonthRaw] = state.bookingMonthCursor.split('-');
        const bookingYear = Number(cursorYearRaw) || new Date().getFullYear();
        const bookingMonthIndex = Math.max(0, (Number(cursorMonthRaw) || 1) - 1);
        const bookingMonthBase = new Date(bookingYear, bookingMonthIndex, 1);
        const bookingWeekStartsOnMondayOffset = (bookingMonthBase.getDay() + 6) % 7;
        const bookingGridStart = new Date(bookingYear, bookingMonthIndex, 1 - bookingWeekStartsOnMondayOffset);
        const bookingCalendarDays = Array.from({ length: 42 }, (_, index) => {
          const day = new Date(bookingGridStart);
          day.setDate(bookingGridStart.getDate() + index);
          return day;
        });
        const bookingMonthLabel = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(bookingMonthBase);
        const bookingToday = new Date(currentTime.value);
        const bookingTodayKey = `${bookingToday.getFullYear()}-${`${bookingToday.getMonth() + 1}`.padStart(2, '0')}-${`${bookingToday.getDate()}`.padStart(2, '0')}`;
        const caregiverAvailableSet = new Set(state.caregiverAvailableDates || []);
        const bookingEpochDays = bookingSelectedDatesSorted.map((dateValue) => toUtcEpochDay(dateValue));
        const bookingDateSegments: string[][] = [];
        for (let index = 0; index < bookingEpochDays.length; index++) {
          if (index === 0 || bookingEpochDays[index] !== bookingEpochDays[index - 1] + 1) {
            bookingDateSegments.push([bookingSelectedDatesSorted[index]]);
          } else {
            bookingDateSegments[bookingDateSegments.length - 1].push(bookingSelectedDatesSorted[index]);
          }
        }
        const bookingSegments = bookingDateSegments.map((segment) => segment.length);
        const bookingSelectionPattern = bookingSegments.length === 0
          ? 'Sin selección'
          : bookingSegments.length === 1 && bookingSegments[0] === 1
            ? 'Día único'
            : bookingSegments.length === 1
              ? `Rango continuo (${bookingSegments[0]} días)`
              : bookingSegments.length === 2 && bookingSegments.some((segment) => segment === 1) && bookingSegments.some((segment) => segment > 1)
                ? 'Mixto: 1 día + 1 rango'
                : `Intercalados/Mixto (${bookingSegments.length} bloques)`;
        const bookingRangeStart = bookingSelectedDatesSorted[0] || '';
        const bookingRangeEnd = bookingSelectedDatesSorted[bookingSelectedDatesSorted.length - 1] || '';
        const bookingBillingSchedule = getEffectiveScheduleForBilling(
          state.selectedBookingDates,
          state.serviceDraft,
          state.bookingDayTimes,
        );
        const bookingBillableDays = getBillableDaysForCurrentSelection(
          state.selectedBookingDates,
          state.serviceDraft,
          state.bookingDayTimes,
        );
        const feeAmountUsd = Number(state.feeDraft.amount || 0);
        const feeAmountBs = Number.isFinite(feeAmountUsd) ? feeAmountUsd * 400 : 0;
        const feeAmountBsText = new Intl.NumberFormat('es-VE', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(Math.max(0, feeAmountBs));
        const bookingFeeAmount = Number(state.serviceRequest?.booking?.feeAmount ?? Number.NaN);
        const requestBasedFeeAmount = Number(state.serviceRequest?.request?.price ?? Number.NaN) * 0.2;
        const fallbackDraftFeeAmount = Number(state.feeDraft.amount || 0);
        const reportedFeeAmount = Number.isFinite(bookingFeeAmount) && bookingFeeAmount > 0
          ? bookingFeeAmount
          : Number.isFinite(requestBasedFeeAmount) && requestBasedFeeAmount > 0
            ? requestBasedFeeAmount
            : Math.max(0, fallbackDraftFeeAmount);
        const reportedFeeAmountText = reportedFeeAmount.toFixed(2);
        const reportedFeeBsText = new Intl.NumberFormat('es-VE', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(Math.max(0, reportedFeeAmount * 400));
        const reportedFeeReference = (state.serviceRequest?.booking?.feeReference || state.feeDraft.reference || '').trim() || 'Pendiente';
        const servicePetIds = getPetIdsFromValue(state.serviceRequest?.request.petId || chat.petId);
        const ownerPetsById = new Map(state.ownerPets.map((pet) => [pet.id, pet]));
        const viewPetsById = new Map(state.viewPets.map((pet) => [pet.id, pet]));
        const servicePets = servicePetIds
          .map((petId) => viewPetsById.get(petId) || ownerPetsById.get(petId))
          .filter((pet): pet is OwnerPetRecord => Boolean(pet));
        const isMultiServicePet = servicePetIds.length > 1;

        // UI Flow Logic: Show Booking Form vs Service Details
        const isRejected = requestStatus === 'rejected';
        const isCancelled = requestStatus === 'cancelled';
        const isStrictlyCompleted = requestStatus === 'completed';
        const ownerHasReviewed = !!state.serviceRequest?.request?.ownerRating;
        const caregiverHasReviewed = !!state.serviceRequest?.request?.caregiverRating;
        const hasReview = state.role === 'owner' ? ownerHasReviewed : caregiverHasReviewed;

        // A service is practically finished for rehire if it's strictly 'completed' 
        // OR if it has ended in time, is in a review eligible status, and the user HAS reviewed it.
        const isFinishedForRehire = (isStrictlyCompleted || (hasServiceEnded && reviewEligibleStatuses.includes(requestStatus))) && hasReview;

        // Show details IF: exists AND not rejected AND not cancelled AND not finished-for-rehire
        const showServiceDetails = state.serviceRequest && !isRejected && !isCancelled && !isFinishedForRehire;
        showContracted = showContracted && !isFinishedForRehire;


        return (
          <div class="min-h-screen bg-[#f6f6f6]" data-vt="chat-detail-page">
            <input
              ref={nativeCameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              class="hidden"
              onChange$={handleNativeCapture}
            />
            <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6" data-vt="chat-detail-shell">
              <header class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" data-vt="chat-detail-header">
                <div class="flex items-center gap-3">
                  <div class="h-12 w-12 rounded-full border border-[#4a2e85]/10 overflow-hidden bg-gray-100">
                    {state.role === 'caregiver' ? (
                      chat.ownerAvatar ? (
                        <ImageWithRetry
                          src={chat.ownerAvatar}
                          alt="Avatar"
                          class="h-full w-full object-cover"
                          width={48}
                          height={48}
                          layout="constrained"
                        />
                      ) : (
                        <div class="h-full w-full grid place-items-center text-gray-400">
                          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                          </svg>
                        </div>
                      )
                    ) : (
                      chat.caregiverAvatar ? (
                        <ImageWithRetry
                          src={chat.caregiverAvatar}
                          alt="Avatar"
                          class="h-full w-full object-cover"
                          width={48}
                          height={48}
                          layout="constrained"
                        />
                      ) : (
                        <div class="h-full w-full grid place-items-center text-gray-400">
                          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                          </svg>
                        </div>
                      )
                    )}
                  </div>
                  <div>
                    <h1 class="text-2xl font-extrabold text-[#4a2e85] flex items-center flex-wrap gap-2">
                      <span>{state.isAdmin
                        ? `${chat.ownerName} ↔ ${chat.caregiverName}`
                        : (state.role === 'caregiver' ? (chat.ownerName || 'Dueño') : chat.caregiverName)}
                      </span>
                      <VerificationBadge verified={!!chat.verified} size="sm" />
                      {chat.hasPet && (
                        <span class="px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-700 text-[9px] font-bold uppercase tracking-tighter">Tiene mascota</span>
                      )}
                    </h1>
                    <div class="flex gap-2 text-xs">
                      <span class="text-[#4a2e85b3]">{`Mascota: ${state.viewPet?.name || getPetDisplayText(state.serviceRequest?.request.petId || chat.petId, chat.petName)}`}</span>
                      {state.role === 'caregiver' && (
                        <button
                          class={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#4a2e85]/5 text-[#4a2e85] text-[10px] font-bold uppercase tracking-wider hover:bg-[#4a2e85]/10 transition-colors border border-[#4a2e85]/10 ${state.loadingProfile ? 'opacity-70 cursor-not-allowed' : ''}`}
                          onClick$={loadOwner}
                          data-no-loader="true"
                          disabled={state.loadingProfile}
                        >
                          {state.loadingProfile ? 'Cargando...' : (
                            <>
                              <LuInfo class="w-3 h-3" />
                              Ver dueño
                            </>
                          )}
                        </button>
                      )}
                      {state.role === 'owner' && (
                        <button
                          class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#ef7c43]/5 text-[#ef7c43] text-[10px] font-bold uppercase tracking-wider hover:bg-[#ef7c43]/10 transition-colors border border-[#ef7c43]/10"
                          onClick$={goToCaregiverProfile}
                        >
                          <LuInfo class="w-3 h-3" />
                          Ver cuidador
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div class="flex gap-2">

                  <Link href="/dashboard/chat" class="px-4 py-2 rounded-lg border border-[#4a2e85]/20 text-[#4a2e85]">Volver</Link>
                </div>
              </header>

              {toast.value && (
                <div class="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 text-sm">
                  {toast.value}
                </div>
              )}

              <div class="bg-white rounded-2xl border border-[#4a2e85]/10 p-4 sm:p-6 space-y-6">
                <div class="flex flex-wrap items-center justify-between gap-4 bg-gray-50/50 p-4 rounded-2xl border border-[#4a2e85]/5">
                  <div class="flex flex-wrap items-center gap-3">
                    <div class="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-[#4a2e85]/10 shadow-sm">
                      <LuDog class="w-3.5 h-3.5 text-[#4a2e85]" />
                      <span class="text-xs font-semibold text-[#4a2e85]">{state.viewPet?.name || getPetDisplayText(state.serviceRequest?.request.petId || chat.petId, chat.petName)}</span>
                    </div>
                    <div class="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-[#4a2e85]/10 shadow-sm">
                      <div class={`w-1.5 h-1.5 rounded-full ${chat.open ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`}></div>
                      <span class={`text-[10px] font-bold uppercase tracking-wider ${getStatusConfig(chat.status, chat.open).classes.split(' ')[1]}`}>
                        {getStatusConfig(chat.status, chat.open).label}
                      </span>
                    </div>
                    {state.role === 'owner' && (
                      <div class="flex items-center gap-2 px-3 py-1.5 bg-[#4a2e85]/5 rounded-full border border-[#4a2e85]/10 shadow-sm">
                        <span class="text-[9px] font-bold text-[#4a2e85]/40 uppercase tracking-widest">Capacidad</span>
                        <span class="text-[10px] font-bold text-[#4a2e85]">{(chat.activePets ?? 0)} de {chat.petLimit ?? state.caregiverPetLimit} ocupados</span>
                      </div>
                    )}
                  </div>

                  <div class="flex items-center gap-4">
                    {chat.open && state.role === 'owner' && (
                      <button
                        class="flex items-center gap-1.5 text-xs font-bold text-[#ef7c43] hover:opacity-80 transition-all"
                        onClick$={handleRehireChat}
                        disabled={loading.rehiring}
                      >
                        <span>{loading.rehiring ? 'Recontratando...' : 'Recontratar'}</span>
                      </button>
                    )}
                    {chat.open && (
                      <button
                        class="flex items-center gap-1.5 text-xs font-bold text-[#4a2e85] hover:opacity-80 transition-all"
                        onClick$={handleCloseChat}
                        disabled={loading.closing}
                      >
                        <LuBan class="w-3.5 h-3.5" />
                        <span>{loading.closing ? 'Cerrando...' : 'Cerrar Chat'}</span>
                      </button>
                    )}
                  </div>
                </div>


                {showContracted && (
                  <div class="rounded-xl border border-[#4a2e85]/10 bg-[#f7f3ff] px-4 py-3 text-sm text-[#4a2e85]">
                    El cuidador está contratado. Continúa coordinando los detalles por este chat.
                  </div>
                )}

                <div class="border border-[#4a2e85]/10 rounded-2xl p-4 h-64 overflow-y-auto bg-[#faf9ff] space-y-3">
                  {state.messages.length === 0 ? (
                    <p class="text-sm text-gray-500">Aún no hay mensajes.</p>
                  ) : (
                    state.messages.map((msg) => {
                      const isOwnerMessage = msg.sender === 'owner';
                      const senderName = msg.sender === 'owner'
                        ? (chat.ownerName || 'Dueño')
                        : chat.caregiverName;
                      return (
                        <div
                          key={msg.id}
                          class={[
                            'max-w-[75%] rounded-2xl px-3 py-2 text-sm',
                            isOwnerMessage
                              ? 'bg-[#4a2e85] text-white ml-auto'
                              : 'bg-white border border-[#4a2e85]/10 text-gray-700',
                          ]}
                        >
                          <div class={[
                            'text-[11px] font-semibold mb-1',
                            isOwnerMessage ? 'text-white/80' : 'text-[#4a2e85]/80',
                          ]}>{senderName}</div>

                          {!!msg.text && (() => {
                            const markdownImgRegex = /!\[.*?\]\((.*?)\)/;
                            const match = msg.text.match(markdownImgRegex);
                            const textWithoutImg = msg.text.replace(markdownImgRegex, '').trim();
                            const legacyImgUrl = match ? match[1] : null;

                            return (
                              <>
                                {!!textWithoutImg && (
                                  <p class={[
                                    'whitespace-pre-wrap break-words leading-relaxed',
                                    isOwnerMessage ? 'text-white' : 'text-gray-700',
                                  ]}>{textWithoutImg}</p>
                                )}
                                {!!legacyImgUrl && !msg.mediaUrl && (
                                  <a href={legacyImgUrl} target="_blank" rel="noopener noreferrer" class="block mt-2">
                                    <ImageWithRetry
                                      src={legacyImgUrl}
                                      alt="Adjunto"
                                      class="max-h-60 w-auto rounded-xl border border-white/20"
                                      width={400}
                                      height={300}
                                      layout="constrained"
                                    />
                                  </a>
                                )}
                              </>
                            );
                          })()}

                          {!!msg.mediaUrl && (
                            <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" class="block mt-2">
                              <ImageWithRetry
                                src={msg.mediaUrl}
                                alt="Adjunto"
                                class="max-h-60 w-auto rounded-xl border border-white/20"
                                width={400}
                                height={300}
                                layout="constrained"
                              />
                            </a>
                          )}

                          {!msg.text && !msg.mediaUrl && (
                            <p class={[
                              'italic',
                              isOwnerMessage ? 'text-white/80' : 'text-gray-500',
                            ]}>Mensaje sin contenido</p>
                          )}

                          <div class={[
                            'text-[10px] mt-1',
                            isOwnerMessage ? 'text-white/70' : 'text-gray-500',
                          ]}>
                            {msg.ts ? new Date(msg.ts).toLocaleString() : ''}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div class="flex flex-col gap-3">
                  <textarea
                    rows={2}
                    class="w-full border border-[#4a2e85]/20 rounded-2xl px-3 py-2 text-sm"
                    placeholder="Escribe tu mensaje"
                    value={state.messageDraft}
                    onInput$={(e) => (state.messageDraft = (e.target as HTMLTextAreaElement).value)}
                  />
                  <div class="flex items-center justify-between">
                    {state.role === 'caregiver' && showContracted && hasCareStarted && !hasSentPhotoToday ? (
                      <button
                        class="p-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors flex items-center gap-2 text-sm"
                        onClick$={startCamera}
                        disabled={loading.sending}
                      >
                        <LuCamera class="w-5 h-5" />
                        <span class="hidden sm:inline">Foto en vivo</span>
                      </button>
                    ) : <div></div>}

                    <button
                      class={`px-4 py-2 rounded-xl bg-[#4a2e85] text-white text-sm flex items-center gap-2 ${loading.sending || !chat?.open ? 'opacity-50 cursor-not-allowed' : ''}`}
                      onClick$={sendMessage}
                      data-no-loader="true"
                      disabled={loading.sending || !chat?.open}
                    >
                      {loading.sending ? (
                        <>
                          <span>Enviando...</span>
                        </>
                      ) : chat?.open ? 'Enviar mensaje' : 'Chat cerrado'}
                    </button>
                  </div>
                </div>

                {showServiceDetails && (
                  <div class="border-t border-[#4a2e85]/10 pt-4 space-y-3">
                    <div class="flex items-center justify-between">
                      <h3 class="text-base font-semibold text-[#4a2e85] flex items-center gap-2">
                        <LuDog class="w-4 h-4" /> Información de {isMultiServicePet ? 'las Mascotas' : 'la Mascota'}
                      </h3>
                    </div>

                    <div class="bg-gradient-to-br from-[#4a2e85]/5 to-white rounded-2xl p-4 border border-[#4a2e85]/10 shadow-sm transition-all hover:shadow-md">
                      {isMultiServicePet ? (
                        <div class="space-y-3">
                          <p class="text-xs text-[#4a2e85]/70">Esta solicitud incluye {servicePetIds.length} mascotas. Se muestran todas las mascotas seleccionadas para el servicio.</p>
                          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {servicePets.map((pet) => (
                              <article key={pet.id} class="bg-white rounded-xl border border-[#4a2e85]/10 p-3 space-y-2">
                                <div class="aspect-square bg-gray-100 rounded-lg overflow-hidden border border-[#4a2e85]/10">
                                  {pet.photo ? (
                                    <ImageWithRetry
                                      src={pet.photo}
                                      class="w-full h-full object-cover"
                                      alt={pet.name || 'Mascota'}
                                      width={200}
                                      height={200}
                                      layout="constrained"
                                      placeholder="🐾"
                                    />
                                  ) : (
                                    <div class="w-full h-full grid place-items-center text-gray-300">
                                      <LuDog class="w-10 h-10 opacity-20" />
                                    </div>
                                  )}
                                </div>
                                <h4 class="text-sm font-bold text-[#4a2e85] truncate">{pet.name || 'Mascota'}</h4>
                                <div class="text-[11px] text-[#4a2e85]/70 space-y-1">
                                  <p><span class="font-semibold">Especie:</span> {pet.species || 'N/A'}</p>
                                  <p><span class="font-semibold">Peso:</span> {pet.weight ? `${pet.weight} kg` : 'N/A'}</p>
                                  <p><span class="font-semibold">Edad:</span> {pet.age ? `${pet.age} años` : 'N/A'}</p>
                                </div>
                                <div class="pt-1">
                                  <span class="text-[10px] uppercase font-bold text-[#4a2e85]/50 block mb-1">Carnet de vacunación</span>
                                  {pet.vaccinationCard ? (
                                    <a
                                      href={pet.vaccinationCard}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      class="text-[11px] font-semibold text-[#4a2e85] underline"
                                    >
                                      Ver carnet
                                    </a>
                                  ) : (
                                    <span class="text-[11px] text-gray-400 italic">No adjunto</span>
                                  )}
                                </div>
                              </article>
                            ))}
                          </div>
                          {state.loadingProfile && servicePets.length === 0 && (
                            <div class="flex items-center gap-2 justify-center py-4 bg-white/50 rounded-xl">
                              <span class="text-xs text-[#4a2e85] font-medium italic">Cargando mascotas seleccionadas...</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div class="flex flex-col md:flex-row gap-4">
                          <div class="w-full md:w-1/3 space-y-3">
                            <div class="aspect-square bg-gray-100 rounded-xl overflow-hidden border border-[#4a2e85]/10 shadow-inner group relative">
                              {(state.viewPet?.photo || chat.petPhoto) ? (
                                <ImageWithRetry
                                  src={state.viewPet?.photo || chat.petPhoto}
                                  class="w-full h-full object-cover transition-transform group-hover:scale-110"
                                  alt={state.viewPet?.name || getPetDisplayText(state.serviceRequest?.request.petId || chat.petId, chat.petName)}
                                  width={200}
                                  height={200}
                                  layout="constrained"
                                  placeholder="🐾"
                                />
                              ) : (
                                <div class="w-full h-full grid place-items-center text-gray-300">
                                  <LuDog class="w-12 h-12 opacity-20" />
                                </div>
                              )}
                              <div class="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none"></div>
                            </div>
                            <div class="text-center md:text-left">
                              <h4 class="text-lg font-bold text-[#4a2e85]">{state.viewPet?.name || getPetDisplayText(state.serviceRequest?.request.petId || chat.petId, chat.petName)}</h4>
                              <p class="text-xs text-gray-400 font-medium uppercase tracking-wider">{state.viewPet?.species || chat.petSpecies || 'Especie'} • {chat.petId ? 'Registrada' : 'Temporal'}</p>
                            </div>
                          </div>

                          <div class="flex-1 space-y-4">
                            <div class="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
                              <div class="p-2.5 bg-white rounded-xl border border-[#4a2e85]/5 shadow-sm">
                                <span class="text-[10px] uppercase font-bold text-[#4a2e85]/40 block mb-0.5">Especie</span>
                                <span class="text-sm font-semibold text-[#4a2e85]">{state.viewPet?.species || chat.petSpecies || 'N/A'}</span>
                              </div>
                              <div class="p-2.5 bg-white rounded-xl border border-[#4a2e85]/5 shadow-sm">
                                <span class="text-[10px] uppercase font-bold text-[#4a2e85]/40 block mb-0.5">Peso</span>
                                <span class="text-sm font-semibold text-[#4a2e85]">{state.viewPet?.weight ? `${state.viewPet.weight} kg` : 'N/A'}</span>
                              </div>
                              <div class="p-2.5 bg-white rounded-xl border border-[#4a2e85]/5 shadow-sm">
                                <span class="text-[10px] uppercase font-bold text-[#4a2e85]/40 block mb-0.5">Edad</span>
                                <span class="text-sm font-semibold text-[#4a2e85]">{state.viewPet?.age ? `${state.viewPet.age} años` : 'N/A'}</span>
                              </div>
                            </div>

                            <div class="space-y-3">
                              {state.viewPet?.behavior?.length ? (
                                <div class="p-3 bg-[#f6e527]/5 rounded-xl border border-[#f6e527]/20">
                                  <span class="text-[10px] uppercase font-bold text-[#ef7c43] block mb-1.5">Comportamiento</span>
                                  <div class="flex flex-wrap gap-1.5">
                                    {state.viewPet.behavior.map(b => (
                                      <span key={b} class="px-2 py-0.5 rounded-md bg-white border border-[#f6e527]/30 text-[10px] font-bold text-[#4a2e85]">{b}</span>
                                    ))}
                                  </div>
                                </div>
                              ) : null}

                              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div class="p-3 bg-red-50 rounded-xl border border-red-100/50">
                                  <span class="text-[10px] uppercase font-bold text-red-500 block mb-1">Alergias</span>
                                  <p class="text-[11px] text-red-800 leading-tight italic">{state.viewPet?.allergies || 'Ninguna reportada'}</p>
                                </div>
                                <div class="p-3 bg-blue-50 rounded-xl border border-blue-100/50">
                                  <span class="text-[10px] uppercase font-bold text-blue-500 block mb-1">Cond. Médicas</span>
                                  <p class="text-[11px] text-blue-800 leading-tight italic">{state.viewPet?.medicalConditions || 'Ninguna reportada'}</p>
                                </div>
                                <div class="p-3 bg-emerald-50 rounded-xl border border-emerald-100/60 md:col-span-2">
                                  <span class="text-[10px] uppercase font-bold text-emerald-600 block mb-1">Carnet de vacunación</span>
                                  {state.viewPet?.vaccinationCard ? (
                                    <a
                                      href={state.viewPet.vaccinationCard}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      class="text-[12px] font-semibold text-[#4a2e85] underline"
                                    >
                                      Ver carnet de vacunación
                                    </a>
                                  ) : (
                                    <p class="text-[11px] text-emerald-900/70 italic">No adjunto</p>
                                  )}
                                </div>
                              </div>
                            </div>

                            {state.loadingProfile && !state.viewPet && (
                              <div class="flex items-center gap-2 justify-center py-4 bg-white/50 rounded-xl">
                                <span class="text-xs text-[#4a2e85] font-medium italic">Cargando perfil completo...</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}


                <div class="border-t border-[#4a2e85]/10 pt-4 space-y-3">
                  <h3 class="text-base font-semibold text-[#4a2e85]">Solicitud de servicio</h3>
                  {showServiceDetails ? (
                    <div class="space-y-4">
                      <div class="bg-white rounded-2xl p-4 border border-[#4a2e85]/10 shadow-sm space-y-3">
                        <div class="flex items-center justify-between">
                          <div class="flex items-center gap-2">
                            <div class={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider ${getStatusConfig(state.serviceRequest!.request.status, true).classes}`}>
                              {getStatusConfig(state.serviceRequest!.request.status, true).label}
                            </div>
                            <span class="text-sm font-semibold text-[#4a2e85]">${state.serviceRequest!.request.price.toFixed(2)} USD (Tasa BCV)</span>
                          </div>
                          <div class="text-xs text-gray-500 uppercase tracking-widest">{state.serviceRequest!.request.id.slice(0, 8)}</div>
                        </div>

                        <div class="bg-gray-50 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 border border-dashed border-gray-300 relative overflow-hidden">
                          <div class="absolute left-0 top-0 bottom-0 w-1 bg-[#4a2e85]"></div>

                          {/* From */}
                          <div class="flex items-center gap-3">
                            <CalendarDate date={state.serviceRequest!.request.startDate} />
                            <div class="text-left">
                              <div class="text-[10px] uppercase text-gray-500 font-bold tracking-wider">Entrada</div>
                              <div class="text-sm font-medium text-gray-900">{new Date(state.serviceRequest!.request.startDate).toLocaleDateString()}</div>
                              <div class="text-xs text-gray-400">{new Date(state.serviceRequest!.request.startDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                          </div>

                          {/* Arrow / Duration */}
                          <div class="flex flex-col items-center flex-1">
                            <div class="w-full h-px bg-gray-300 relative max-w-[100px]">
                              <div class="absolute -top-1.5 right-0 w-3 h-3 border-t border-r border-gray-300 transform rotate-45"></div>
                            </div>
                            <span class="text-[10px] text-[#4a2e85] font-bold bg-[#f3edff] px-2 py-0.5 rounded-full mt-2">
                              {Math.max(1, Math.ceil((new Date(state.serviceRequest!.request.endDate).getTime() - new Date(state.serviceRequest!.request.startDate).getTime()) / (1000 * 60 * 60 * 24)))} Noches
                            </span>
                          </div>

                          {/* To */}
                          <div class="flex items-center gap-3 flex-row-reverse sm:flex-row">
                            <div class="text-right sm:text-left">
                              <div class="text-[10px] uppercase text-gray-500 font-bold tracking-wider">Salida</div>
                              <div class="text-sm font-medium text-gray-900">{new Date(state.serviceRequest!.request.endDate).toLocaleDateString()}</div>
                              <div class="text-xs text-gray-400">{new Date(state.serviceRequest!.request.endDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                            <CalendarDate date={state.serviceRequest!.request.endDate} />
                          </div>
                        </div>
                      </div>

                      {/* Timeline / Stepper UI */}
                      {requestStatus && requestStatus !== 'closed' && requestStatus !== 'rejected' && requestStatus !== 'cancelled' && (
                        <div class="mt-8 bg-gradient-to-br from-white to-[#4a2e85]/[0.02] border border-[#4a2e85]/10 rounded-3xl p-6 sm:p-8 shadow-sm">
                          <h4 class="text-sm font-bold text-[#4a2e85] mb-8 flex items-center gap-2">
                            <LuCheckCircle class="w-5 h-5 text-[#ef7c43]" />
                            Progreso del Servicio
                          </h4>

                          {/* Desktop Stepper */}
                          <div class="relative hidden sm:flex justify-between w-full max-w-4xl mx-auto">
                            {/* Track Background */}
                            <div class="absolute top-[21px] left-[10%] right-[10%] h-1 bg-gray-100 z-0 rounded-full"></div>

                            {[
                              { id: 1, label: 'Solicitud', states: ['requested'] },
                              { id: 2, label: 'Aprobación', states: ['accepted'] },
                              { id: 3, label: 'Pago Seguro', states: ['paid', 'payment_sent', 'payment_confirmed'] },
                              { id: 4, label: 'En Cuidado', states: ['fee_submitted', 'active'] },
                              { id: 5, label: 'Completado', states: ['completed', 'finished'] }
                            ].map((step, idx, arr) => {
                              const getStepIndex = (st: string) => arr.findIndex(s => s.states.includes(st)) + 1;
                              const currentIdx = getStepIndex(requestStatus);
                              const isCompleted = currentIdx > step.id || requestStatus === 'completed' || requestStatus === 'finished';
                              const isCurrent = currentIdx === step.id;

                              return (
                                <div key={step.id} class="relative z-10 flex flex-col items-center gap-3 w-1/5">
                                  {idx !== 0 && (
                                    <div class={`absolute right-[50%] top-[21px] h-1 w-full -z-10 transition-all duration-700 ease-in-out ${isCompleted || isCurrent ? 'bg-[#ef7c43]' : 'bg-transparent'}`}></div>
                                  )}

                                  <div class={`h-11 w-11 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-all duration-300 shadow-sm bg-white ${isCompleted
                                      ? 'border-[#ef7c43] bg-[#ef7c43] text-white'
                                      : isCurrent
                                        ? 'border-[#ef7c43] text-[#ef7c43] ring-4 ring-[#ef7c43]/20 scale-110'
                                        : 'border-gray-200 text-gray-300'
                                    }`}>
                                    {isCompleted ? <LuCheck class="w-6 h-6" /> : step.id}
                                  </div>
                                  <div class="text-center">
                                    <p class={`text-[12px] font-extrabold tracking-tight ${isCurrent ? 'text-[#ef7c43]' : isCompleted ? 'text-[#4a2e85]' : 'text-gray-400'}`}>
                                      {step.label}
                                    </p>
                                    {step.id === 5 && <span class="block text-[9px] font-medium text-gray-400 mt-0.5">(& Reseña)</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Mobile Stepper Vertical */}
                          <div class="sm:hidden space-y-4">
                            {[
                              { id: 1, label: 'Solicitud', states: ['requested'], desc: 'Petición enviada al cuidador.' },
                              { id: 2, label: 'Aprobación', states: ['accepted'], desc: 'El cuidador acepta tu solicitud.' },
                              { id: 3, label: 'Pago Seguro', states: ['paid', 'payment_sent', 'payment_confirmed'], desc: 'Efectúa el pago para asegurar la reserva.' },
                              { id: 4, label: 'En Cuidado', states: ['fee_submitted', 'active'], desc: 'La mascota está siendo cuidada.' },
                              { id: 5, label: 'Completado', states: ['completed', 'finished'], desc: 'Servicio finalizado y calificado.' }
                            ].map((step, idx, arr) => {
                              const getStepIndex = (st: string) => arr.findIndex(s => s.states.includes(st)) + 1;
                              const currentIdx = getStepIndex(requestStatus);
                              const isCompleted = currentIdx > step.id || requestStatus === 'completed' || requestStatus === 'finished';
                              const isCurrent = currentIdx === step.id;

                              return (
                                <div key={step.id} class="flex gap-4">
                                  <div class="flex flex-col items-center">
                                    <div class={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center font-bold text-xs border-2 transition-all duration-300 bg-white ${isCompleted
                                        ? 'border-[#ef7c43] bg-[#ef7c43] text-white'
                                        : isCurrent
                                          ? 'border-[#ef7c43] text-[#ef7c43] ring-2 ring-[#ef7c43]/20'
                                          : 'border-gray-200 text-gray-300'
                                      }`}>
                                      {isCompleted ? <LuCheck class="w-4 h-4" /> : step.id}
                                    </div>
                                    {idx !== arr.length - 1 && (
                                      <div class={`w-0.5 h-full my-1 transition-all ${isCompleted || isCurrent ? 'bg-[#ef7c43]' : 'bg-gray-100'}`}></div>
                                    )}
                                  </div>
                                  <div class={`pb-4 pt-1 ${isCurrent ? 'opacity-100' : isCompleted ? 'opacity-80' : 'opacity-40'}`}>
                                    <p class={`text-sm font-extrabold ${isCurrent ? 'text-[#ef7c43]' : isCompleted ? 'text-[#4a2e85]' : 'text-gray-400'}`}>
                                      {step.label}
                                    </p>
                                    <p class="text-[11px] text-gray-500 mt-0.5">{step.desc}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {state.role === 'owner' && requestStatus === 'requested' && (
                        <div class="space-y-3">
                          <div class="text-sm text-gray-500 italic">Solicitud enviada. Esperando respuesta del cuidador.</div>
                          <button
                            class={`px-4 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-bold hover:bg-rose-100 transition-colors ${loading.requesting ? 'opacity-70 cursor-not-allowed' : ''}`}
                            onClick$={cancelService}
                            disabled={loading.requesting}
                          >
                            {loading.requesting ? 'Cancelando...' : 'Cancelar solicitud'}
                          </button>
                        </div>
                      )}

                      {state.role === 'caregiver' && requestStatus === 'requested' && (
                        <div class="flex gap-2">
                          <button
                            class={`px-4 py-2 rounded-xl bg-[#4a2e85] text-white text-sm font-semibold ${loading.requesting ? 'opacity-70 cursor-not-allowed' : ''}`}
                            onClick$={acceptService}
                            data-no-loader="true"
                            disabled={loading.requesting}
                          >
                            {loading.requesting ? 'Procesando...' : 'Aceptar solicitud'}
                          </button>
                          <button
                            class={`px-4 py-2 rounded-xl bg-[#4a2e85]/10 text-[#4a2e85] text-sm font-semibold ${loading.requesting ? 'opacity-70 cursor-not-allowed' : ''}`}
                            onClick$={rejectService}
                            data-no-loader="true"
                            disabled={loading.requesting}
                          >
                            {loading.requesting ? 'Procesando...' : 'Rechazar'}
                          </button>
                        </div>
                      )}

                      {requestStatus === 'rejected' && (
                        <div class="text-sm text-gray-500">Solicitud rechazada.</div>
                      )}

                      {state.role === 'caregiver' && requestStatus === 'accepted' && (
                        <div class="text-sm text-gray-500">Esperando pago del Dueño.</div>
                      )}

                      {state.role === 'owner' && requestStatus === 'accepted' && (
                        <div class={`${sectionCardClasses} space-y-3`}>
                          <h4 class="font-semibold text-[#4a2e85] text-sm">Realizar Pago</h4>
                          {bank ? (
                            <div class="text-xs text-gray-600 bg-gray-50 p-3 rounded-xl border border-dashed border-gray-300 space-y-1">
                              <div class="font-semibold text-[#4a2e85] mb-1">Datos bancarios del cuidador:</div>
                              <div>Banco: {bank.name}</div>
                              <div>CI/RIF: {bank.rif} • Telf: {bank.paymobile}</div>
                            </div>
                          ) : (
                            <div class="text-xs text-rose-600">El cuidador no ha configurado sus datos de pago.</div>
                          )}

                          <div class="space-y-3 mt-3">
                            <label class="block text-sm">
                              <span class="text-gray-600 text-xs">Referencia Bancaria</span>
                              <input
                                type="text"
                                class={formInputClasses}
                                value={state.paymentDraft.reference}
                                onInput$={(e) => (state.paymentDraft.reference = (e.target as HTMLInputElement).value)}
                                placeholder="Ej: 123456"
                              />
                            </label>
                            <label class="block text-sm">
                              <span class="text-gray-600 text-xs">Comprobante (Capture)</span>
                              <input
                                type="file"
                                class={fileInputClasses}
                                accept="image/*"
                                onChange$={(e) => (state.paymentDraft.proof = (e.target as HTMLInputElement).files?.[0] || null)}
                              />
                            </label>
                            {paymentProofPreview.value && (
                              <div class="mt-2 relative inline-block p-1 rounded-xl border border-[#4a2e85]/10 bg-white">
                                <ImageWithRetry
                                  src={paymentProofPreview.value}
                                  alt="Vista previa del comprobante"
                                  class="h-20 w-auto rounded-lg object-cover"
                                  width={160}
                                  height={80}
                                  layout="constrained"
                                />
                                <button
                                  type="button"
                                  class="absolute -top-2 -right-2 bg-white rounded-full shadow-md p-1 border border-gray-100 text-gray-500 hover:text-red-500"
                                  onClick$={() => (state.paymentDraft.proof = null)}
                                >
                                  <LuX class="w-3 h-3" />
                                </button>
                              </div>
                            )}
                            <button
                              class={`${primaryActionButtonClasses} ${loading.requesting ? 'opacity-70 cursor-not-allowed' : ''}`}
                              onClick$={submitPayment}
                              data-no-loader="true"
                              disabled={loading.requesting}
                            >
                              {loading.requesting ? (
                                <>
                                  <span>Procesando...</span>
                                </>
                              ) : 'Reportar Pago Realizado'}
                            </button>

                            <div class="pt-2 border-t border-gray-100">
                              <button
                                type="button"
                                class={`w-full py-2 text-rose-600 text-[11px] font-bold hover:text-rose-700 hover:underline transition-all ${loading.requesting ? 'opacity-50 cursor-not-allowed' : ''}`}
                                onClick$={cancelService}
                                disabled={loading.requesting}
                              >
                                Si te arrepentiste o hay un error, puedes <span class="uppercase">Cancelar la solicitud</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {['payment_sent', 'payment_confirmed', 'fee_submitted', 'active'].includes(requestStatus) && state.serviceRequest?.booking?.ownerPaymentProof && (
                        <div class={`${sectionCardClasses} space-y-2`}>
                          <p class="text-xs font-semibold text-gray-500 uppercase tracking-widest">Comprobante de Pago</p>
                          <a href={state.serviceRequest.booking.ownerPaymentProof} target="_blank" rel="noopener noreferrer" class="block rounded-xl overflow-hidden border border-gray-200">
                            <ImageWithRetry
                              src={state.serviceRequest.booking.ownerPaymentProof}
                              alt="Comprobante"
                              class="w-full h-32 object-cover"
                              width={400}
                              height={128}
                              layout="constrained"
                            />
                          </a>
                          <p class="text-xs text-gray-500 flex items-center justify-between">
                            <span>Ref: <span class="font-mono text-gray-800">{state.serviceRequest.booking.ownerPaymentReference}</span></span>
                            {state.role === 'owner' && requestStatus === 'payment_sent' && (
                              <button
                                class="text-rose-600 hover:text-rose-700 font-bold transition-colors"
                                onClick$={cancelService}
                                disabled={loading.requesting}
                              >
                                Cancelar
                              </button>
                            )}
                          </p>
                        </div>
                      )}

                      {state.role === 'caregiver' && requestStatus === 'payment_sent' && (
                        <div class="flex gap-2">
                          <button
                            class={`flex-1 py-3 rounded-xl bg-green-600 text-white text-sm font-bold shadow hover:bg-green-700 transition-colors flex items-center justify-center gap-2 ${loading.requesting ? 'opacity-70 cursor-not-allowed' : ''}`}
                            onClick$={() => confirmPayment(true)}
                            data-no-loader="true"
                            disabled={loading.requesting}
                          >
                            {loading.requesting ? (
                              <>
                                <span>Procesando...</span>
                              </>
                            ) : 'Confirmar Pago'}
                          </button>
                          <button
                            class={`px-4 py-3 rounded-xl bg-rose-100 text-rose-700 text-sm font-bold hover:bg-rose-200 transition-colors flex items-center justify-center gap-2 ${loading.requesting ? 'opacity-70 cursor-not-allowed' : ''}`}
                            onClick$={() => confirmPayment(false)}
                            data-no-loader="true"
                            disabled={loading.requesting}
                          >
                            {loading.requesting ? (
                              <>
                                <span>Procesando...</span>
                              </>
                            ) : 'Rechazar'}
                          </button>
                        </div>
                      )}

                      {state.role === 'caregiver' && ['payment_confirmed', 'fee_submitted', 'active'].includes(requestStatus) && (
                        <div class="bg-gradient-to-br from-violet-50 to-white p-4 rounded-2xl border border-violet-100 shadow-sm space-y-3">
                          <h4 class="font-bold text-[#4a2e85] text-sm flex items-center gap-2">
                            <LuCamera class="w-5 h-5 text-violet-600" /> Reporte Diario de Mascota
                          </h4>
                          {hasCareStarted ? (
                            !hasSentPhotoToday ? (
                              <>
                                <p class="text-xs text-gray-600 leading-relaxed">
                                  Sube una foto diaria de la mascota para mantener informado al dueño. Es obligatorio para liberar el pago.
                                </p>
                                <button
                                  onClick$={startCamera}
                                  class="w-full py-3 rounded-xl bg-white border border-violet-200 text-violet-700 font-bold text-sm shadow-sm hover:bg-violet-50 hover:border-violet-300 transition-all flex items-center justify-center gap-2"
                                >
                                  <LuCamera class="w-4 h-4" />
                                  Tomar Foto Ahora
                                </button>
                              </>
                            ) : (
                              <p class="text-xs text-emerald-600 font-semibold bg-emerald-50 p-2 rounded-lg border border-emerald-100">
                                ✅ Ya enviaste la foto de hoy. ¡Buen trabajo!
                              </p>
                            )
                          ) : (
                            <p class="text-xs text-gray-500 bg-gray-50 p-2 rounded-lg border border-gray-200">
                              El cuidado aún no ha comenzado. Podrás enviar fotos a partir de la fecha de inicio.
                            </p>
                          )}
                        </div>
                      )}

                      {state.role === 'caregiver' && (requestStatus === 'payment_confirmed' || requestStatus === 'fee_submitted' || (requestStatus === 'completed' && state.pendingCommission)) && (
                        <div class={`${sectionCardClasses} space-y-3`}>
                          <h4 class="font-semibold text-[#4a2e85] text-sm flex items-center gap-2">
                            <LuDollarSign class="w-4 h-4" /> Pagar Comisión
                          </h4>

                          {requestStatus === 'fee_submitted' || (requestStatus === 'completed' && state.pendingCommission === 'validation') ? (
                            <div class="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white p-4 shadow-sm space-y-2">
                              <div class="flex items-start gap-2">
                                <div class="mt-0.5 h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center text-xs font-black">✓</div>
                                <div>
                                  <p class="font-extrabold text-emerald-700 text-sm">¡Comisión reportada con éxito!</p>
                                  <p class="text-xs text-emerald-700/90">Tu comprobante fue enviado. ACUPATAS validará el pago en breve.</p>
                                </div>
                              </div>
                              <div class="text-sm text-[#4a2e85] bg-white/80 p-3 rounded-xl border border-emerald-100">
                                <p><span class="font-semibold">Monto:</span> ${reportedFeeAmountText}</p>
                                <p><span class="font-semibold">Monto (Bs):</span> Bs {reportedFeeBsText}</p>
                                <p><span class="font-semibold">Referencia:</span> {reportedFeeReference}</p>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div class="rounded-2xl border border-[#4a2e85]/10 bg-gradient-to-r from-[#f7f3ff] to-white p-4 space-y-3">
                                <div class="flex items-center justify-between gap-2">
                                  <div>
                                    <p class="text-xs font-bold text-[#4a2e85] uppercase tracking-wider">Pago móvil ACUPATAS</p>
                                    <p class="text-[11px] text-[#4a2e85]/70">Usa estos datos para transferir y luego reporta el comprobante.</p>
                                  </div>
                                  <span class={subtlePillClasses}>VENEZUELA</span>
                                </div>

                                <div class="grid gap-2">
                                  <div class="flex items-center justify-between gap-2 rounded-xl border border-[#4a2e85]/10 bg-white px-3 py-2">
                                    <div>
                                      <p class="text-[10px] text-gray-500 uppercase">Razón social</p>
                                      <p class="text-sm font-semibold text-[#4a2e85]">ACUPATAS C.A.</p>
                                    </div>
                                    <button
                                      type="button"
                                      class={`px-2 py-1 rounded-lg border border-[#4a2e85]/20 text-[11px] font-semibold text-[#4a2e85] hover:bg-[#4a2e85]/5 ${state.copyLoading.company ? 'opacity-70 cursor-not-allowed' : ''}`}
                                      onClick$={$(async () => {
                                        await copyToClipboard('company', 'ACUPATAS C.A.', 'Razón social copiada.');
                                      })}
                                      disabled={state.copyLoading.company}
                                    >
                                      {state.copyLoading.company ? 'Copiando...' : 'Copiar'}
                                    </button>
                                  </div>

                                  <div class="flex items-center justify-between gap-2 rounded-xl border border-[#4a2e85]/10 bg-white px-3 py-2">
                                    <div>
                                      <p class="text-[10px] text-gray-500 uppercase">RIF</p>
                                      <p class="text-sm font-semibold text-[#4a2e85]">J507903559</p>
                                    </div>
                                    <button
                                      type="button"
                                      class={`px-2 py-1 rounded-lg border border-[#4a2e85]/20 text-[11px] font-semibold text-[#4a2e85] hover:bg-[#4a2e85]/5 ${state.copyLoading.rif ? 'opacity-70 cursor-not-allowed' : ''}`}
                                      onClick$={$(async () => {
                                        await copyToClipboard('rif', 'J507903559', 'RIF copiado.');
                                      })}
                                      disabled={state.copyLoading.rif}
                                    >
                                      {state.copyLoading.rif ? 'Copiando...' : 'Copiar'}
                                    </button>
                                  </div>

                                  <div class="flex items-center justify-between gap-2 rounded-xl border border-[#4a2e85]/10 bg-white px-3 py-2">
                                    <div>
                                      <p class="text-[10px] text-gray-500 uppercase">Teléfono</p>
                                      <p class="text-sm font-semibold text-[#4a2e85]">04147199496</p>
                                    </div>
                                    <button
                                      type="button"
                                      class={`px-2 py-1 rounded-lg border border-[#4a2e85]/20 text-[11px] font-semibold text-[#4a2e85] hover:bg-[#4a2e85]/5 ${state.copyLoading.phone ? 'opacity-70 cursor-not-allowed' : ''}`}
                                      onClick$={$(async () => {
                                        await copyToClipboard('phone', '04147199496', 'Teléfono copiado.');
                                      })}
                                      disabled={state.copyLoading.phone}
                                    >
                                      {state.copyLoading.phone ? 'Copiando...' : 'Copiar'}
                                    </button>
                                  </div>

                                  <div class="flex items-center justify-between gap-2 rounded-xl border border-[#4a2e85]/10 bg-[#fff8ef] px-3 py-2">
                                    <div>
                                      <p class="text-[10px] text-gray-500 uppercase">Monto equivalente (Bs)</p>
                                      <p class="text-sm font-bold text-[#ef7c43]">Bs {feeAmountBsText}</p>
                                      <p class="text-[10px] text-[#4a2e85]/60">Tasa fija usada: 1 USD = Bs 400</p>
                                    </div>
                                    <button
                                      type="button"
                                      class={`px-2 py-1 rounded-lg border border-[#ef7c43]/30 text-[11px] font-semibold text-[#ef7c43] hover:bg-[#ef7c43]/5 ${state.copyLoading.amountBs ? 'opacity-70 cursor-not-allowed' : ''}`}
                                      onClick$={$(async () => {
                                        await copyToClipboard('amountBs', feeAmountBsText, 'Monto en Bs copiado.');
                                      })}
                                      disabled={state.copyLoading.amountBs}
                                    >
                                      {state.copyLoading.amountBs ? 'Copiando...' : 'Copiar'}
                                    </button>
                                  </div>
                                </div>
                              </div>

                              <p class="text-xs text-gray-500">
                                Debes pagar la comisión del servicio para activar las garantías y desbloquear otros chats.
                              </p>
                              <div class="grid gap-3 sm:grid-cols-2">
                                <label class="block text-sm">
                                  <span class="text-gray-600 text-xs">Monto Pagado ($)</span>
                                  <input
                                    type="number"
                                    class={`${formInputClasses} bg-gray-50 text-gray-500 cursor-not-allowed font-semibold`}
                                    value={state.feeDraft.amount}
                                    readOnly
                                  />
                                </label>
                                <label class="block text-sm">
                                  <span class="text-gray-600 text-xs">Fecha del Pago</span>
                                  <input
                                    type="date"
                                    class={formInputClasses}
                                    value={state.feeDraft.date}
                                    onInput$={(e) => (state.feeDraft.date = (e.target as HTMLInputElement).value)}
                                  />
                                </label>
                                <label class="block text-sm sm:col-span-2">
                                  <span class="text-gray-600 text-xs">Referencia</span>
                                  <input
                                    type="text"
                                    class={formInputClasses}
                                    value={state.feeDraft.reference}
                                    inputMode="numeric"
                                    maxLength={12}
                                    onInput$={(e) => {
                                      state.feeDraft.reference = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 12);
                                    }}
                                    placeholder="4 a 12 dígitos"
                                  />
                                </label>
                                <label class="block text-sm">
                                  <span class="text-gray-600 text-xs">Banco Emisor</span>
                                  <select
                                    class={`${formInputClasses} bg-white`}
                                    value={state.feeDraft.bankOrigin}
                                    onChange$={(e) => (state.feeDraft.bankOrigin = (e.target as HTMLSelectElement).value)}
                                  >
                                    <option value="">Selecciona un banco</option>
                                    {VENEZUELAN_BANKS.map((bank) => (
                                      <option key={bank.code} value={bank.code}>
                                        {`(${bank.code}) ${bank.name}`}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label class="block text-sm">
                                  <span class="text-gray-600 text-xs">Teléfono Pagador</span>
                                  <input
                                    type="text"
                                    class={formInputClasses}
                                    value={state.feeDraft.payerPhone}
                                    onInput$={(e) => {
                                      const val = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 11);
                                      state.feeDraft.payerPhone = val;
                                    }}
                                    placeholder="04247414130"
                                    maxLength={11}
                                  />
                                </label>
                                <label class="block text-sm sm:col-span-2">
                                  <span class="text-gray-600 text-xs">Comprobante (Capture)</span>
                                  <input
                                    type="file"
                                    class={fileInputClasses}
                                    accept="image/*"
                                    onChange$={(e) => (state.feeDraft.proof = (e.target as HTMLInputElement).files?.[0] || null)}
                                  />
                                  <p class="mt-1 text-[11px] text-gray-500">
                                    {state.feeDraft.proof ? `Archivo seleccionado: ${state.feeDraft.proof.name}` : 'Debes seleccionar una imagen del comprobante para poder reportar.'}
                                  </p>
                                </label>
                                {feeProofPreview.value && (
                                  <div class="mt-2 relative inline-block p-1 rounded-xl border border-[#4a2e85]/10 bg-white">
                                    <ImageWithRetry
                                      src={feeProofPreview.value}
                                      alt="Vista previa del feed"
                                      class="h-20 w-auto rounded-lg object-cover"
                                      width={160}
                                      height={80}
                                      layout="constrained"
                                    />
                                    <button
                                      type="button"
                                      class="absolute -top-2 -right-2 bg-white rounded-full shadow-md p-1 border border-gray-100 text-gray-500 hover:text-red-500"
                                      onClick$={() => (state.feeDraft.proof = null)}
                                    >
                                      <LuX class="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                              <button
                                class={`${primaryActionButtonClasses} ${loading.feeSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
                                onClick$={submitFee}
                                data-no-loader="true"
                                disabled={loading.feeSubmitting}
                              >
                                {loading.feeSubmitting ? (
                                  <>
                                    <span>Enviando...</span>
                                  </>
                                ) : 'Reportar Comisión'}
                              </button>
                              {feeInlineFeedback.value && (
                                <div
                                  class={`rounded-xl border px-3 py-2 text-sm font-semibold ${feeInlineFeedback.value.type === 'success'
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : 'border-rose-200 bg-rose-50 text-rose-700'}`}
                                >
                                  {feeInlineFeedback.value.message}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {requestStatus === 'paid' && state.role === 'owner' && (
                        <div class="text-sm text-gray-500">Pago enviado. Esperando confirmación del cuidador.</div>
                      )}

                      {requestStatus === 'completed' && (
                        <div class="text-sm text-gray-600">Servicio completado.</div>
                      )}

                      {/* Occupancy Info */}
                      <div class="mt-4 pt-4 border-t border-[#4a2e85]/10">
                        <div class="flex items-center justify-between gap-4 mb-3">
                          <div class="flex items-center gap-2">
                            <div class={`h-2 w-2 rounded-full ${currentOccupancyFull ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                            <span class="text-[11px] font-bold text-[#4a2e85]/60 uppercase tracking-tight">Ocupación del cuidador</span>
                          </div>
                          <div class={`px-2 py-0.5 rounded-md text-[10px] font-black shadow-sm border ${currentOccupancyFull
                            ? 'bg-amber-50/50 text-amber-600 border-amber-200/50'
                            : 'bg-[#4a2e85]/5 text-[#4a2e85] border-[#4a2e85]/10'
                            }`}>
                            {state.caregiverOccupiedSlots} / {state.caregiverPetLimit} {state.caregiverPetLimit === 1 ? 'Mascota' : 'Mascotas'}
                          </div>
                        </div>

                        {currentOccupancyFull && (
                          <div class="mb-4 p-3 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/50 shadow-sm">
                            <div class="flex gap-2">
                              <LuInfo class="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                              <div>
                                <p class="text-[11px] font-bold text-amber-800 leading-tight">Ocupación actual al máximo</p>
                                <p class="text-[10px] text-amber-700/80 mt-1 leading-snug">
                                  El cuidador está cuidando {state.caregiverOccupiedSlots} {state.caregiverOccupiedSlots === 1 ? 'mascota' : 'mascotas'} en este momento. Aún puedes consultar disponibilidad para otras fechas en el calendario.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>


                      {reviewInlineSuccess.value && (
                        <div class="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                          {reviewInlineSuccess.value}
                        </div>
                      )}

                      {reviewWindowPending && (
                        <div class={`rounded-2xl p-4 sm:p-5 space-y-3 shadow-sm border ${reviewCardClasses}`}>
                          <div class="flex items-start gap-3">
                            <div class={`mt-0.5 h-8 w-8 rounded-full grid place-items-center flex-shrink-0 font-bold text-sm ${reviewIconClasses}`}>
                              <LuInfo class="w-4 h-4" />
                            </div>
                            <div>
                              <h4 class={`text-sm font-extrabold ${reviewTitleClasses}`}>{reviewPendingTitle}</h4>
                              <p class={`text-xs mt-1 ${reviewTextClasses}`}>{reviewPendingDescription}</p>
                              {reviewCountdownLabel && (
                                <div class={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 ${reviewCountdownBadgeClasses}`}>
                                  <span class="text-[10px] font-black uppercase tracking-wider">Finaliza en</span>
                                  <span class="text-sm font-black tabular-nums">{reviewCountdownLabel}</span>
                                </div>
                              )}
                              <p class={`text-xs mt-2 ${reviewTextClasses}`}>{reviewPendingUnlockText}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {(ownerReviewPending || caregiverReviewPending) && (
                        <div class={`${gradientSectionCardClasses} space-y-4`}>
                          <div class="flex items-start justify-between gap-3">
                            <div>
                              <h4 class="text-base font-extrabold text-[#4a2e85]">
                                {ownerReviewPending ? 'Califica al cuidador' : 'Califica al dueño'}
                              </h4>
                              <p class="text-xs text-[#4a2e85b3] mt-1">
                                Tu reseña ayuda a mejorar la confianza de la comunidad.
                              </p>
                            </div>
                            <span class={subtlePillClasses}>
                              {state.reviewDraft.rating}/5
                            </span>
                          </div>

                          <div class="flex flex-wrap items-center gap-2">
                            {Array.from({ length: 5 }, (_, index) => index + 1).map((star) => {
                              const active = star <= state.reviewDraft.rating;
                              return (
                                <button
                                  key={star}
                                  type="button"
                                  class={`h-10 w-10 rounded-xl border transition-all ${active
                                    ? 'bg-[#ef7c43]/15 border-[#ef7c43]/40 text-[#ef7c43]'
                                    : 'bg-white border-[#4a2e85]/15 text-[#4a2e85]/45 hover:border-[#4a2e85]/30'}`}
                                  onClick$={() => (state.reviewDraft.rating = star)}
                                  aria-label={`Calificar con ${star} estrella${star > 1 ? 's' : ''}`}
                                >
                                  ★
                                </button>
                              );
                            })}
                          </div>

                          <div>
                            <label class="block text-xs font-semibold text-[#4a2e85] mb-1.5">Comentario</label>
                            <textarea
                              rows={3}
                              class="w-full border border-[#4a2e85]/20 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#ef7c43]/40"
                              placeholder={ownerReviewPending ? '¿Cómo fue tu experiencia con el cuidador?' : '¿Cómo fue tu experiencia con el dueño?'}
                              value={state.reviewDraft.comment}
                              onInput$={(e) => (state.reviewDraft.comment = (e.target as HTMLTextAreaElement).value)}
                            />
                          </div>

                          <div class="flex items-center justify-end">
                            <button
                              class={`px-5 py-2.5 rounded-xl bg-[#4a2e85] text-white text-sm font-bold shadow-sm hover:bg-[#3a2369] transition-colors flex items-center gap-2 ${loading.reviewing ? 'opacity-70 cursor-not-allowed' : ''}`}
                              onClick$={submitReview}
                              data-no-loader="true"
                              disabled={loading.reviewing}
                            >
                              {loading.reviewing ? (
                                <>
                                  <span>Enviando reseña...</span>
                                </>
                              ) : 'Enviar reseña'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : state.role === 'owner' ? (
                    <div class="bg-gradient-to-br from-[#4a2e85]/5 to-white rounded-3xl p-6 border border-[#4a2e85]/10 shadow-sm">
                      <div class="max-w-4xl mx-auto">
                        <div class="space-y-4">
                          {(isCancelled || isRejected) && (
                            <div class="p-4 rounded-2xl bg-white border border-dashed border-[#4a2e85]/20 flex items-start gap-3 mb-4">
                              <div class="mt-0.5 h-6 w-6 rounded-full bg-[#4a2e85]/5 text-gray-400 grid place-items-center flex-shrink-0 font-bold text-xs hover:text-[#4a2e85]">!</div>
                              <div>
                                <p class="text-sm font-bold text-[#4a2e85]">
                                  {isCancelled ? 'Cancelaste la solicitud anterior.' : 'El cuidador rechazó la solicitud anterior.'}
                                </p>
                                <p class="text-xs text-gray-500 mt-1">
                                  Puedes completar nuevamente el formulario a continuación para realizar una nueva propuesta de servicio.
                                </p>
                              </div>
                            </div>
                          )}
                          {state.preferredDateFrom && (
                            <div class="inline-flex items-center gap-2 rounded-full border border-[#ef7c43]/25 bg-[#fff5ef] px-3 py-1 text-[11px] font-semibold text-[#4a2e85]">
                              <span>🐾 Rango sugerido desde disponibilidad:</span>
                              <span>
                                {state.preferredDateFrom}
                                {state.preferredDateTo && state.preferredDateTo !== state.preferredDateFrom
                                  ? ` → ${state.preferredDateTo}`
                                  : ''}
                              </span>
                            </div>
                          )}

                          <div class="space-y-1.5">
                            <label class="text-xs font-bold text-[#4a2e85] uppercase tracking-wider flex items-center gap-2">
                              <LuInfo class="w-4 h-4" /> Tipo de servicio
                            </label>
                            <div class="relative">
                              <select
                                disabled={!state.caregiverServices}
                                class="w-full bg-white border border-[#4a2e85]/20 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#4a2e85]/20 focus:border-[#4a2e85]/40 outline-none transition-all shadow-sm appearance-none cursor-pointer hover:border-[#4a2e85]/40 disabled:opacity-50 disabled:cursor-not-allowed"
                                value={state.serviceDraft.service}
                                onInput$={(e) => (state.serviceDraft.service = (e.target as HTMLSelectElement).value)}
                              >
                                {(!state.caregiverServices || state.caregiverServices.alojamiento) && (
                                  <option value="alojamiento">Alojamiento (en casa del cuidador)</option>
                                )}
                                {state.caregiverServices?.visita && (
                                  <option value="visita">Visita a domicilio (en tu casa)</option>
                                )}
                                {state.caregiverServices?.paseo && (
                                  <option value="paseo">Paseo (caminata recreativa)</option>
                                )}
                              </select>
                              <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[#4a2e85]">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                              </div>
                            </div>
                          </div>

                          <div class="space-y-1.5">
                            <label class="text-xs font-bold text-[#4a2e85] uppercase tracking-wider flex items-center gap-2">
                              <LuDog class="w-4 h-4" /> Mascota
                            </label>
                            <div class="space-y-2 border border-[#4a2e85]/20 rounded-xl p-3 bg-white">
                              <p class="text-[10px] text-[#4a2e85]/60 mb-2 font-semibold uppercase tracking-wider">{petSelectionHelpText}</p>

                              {state.ownerPets.length > 0 ? (
                                ownerPetOptions.map(({ pet: p, isBlocked, isSelected, isDisabled, blockReason }) => {
                                  return (
                                    <label key={p.id} class={`flex items-center gap-3 p-2 rounded-lg transition-colors border border-transparent ${isDisabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'hover:bg-[#4a2e85]/5 cursor-pointer hover:border-[#4a2e85]/10'}`}>
                                      <input
                                        type="checkbox"
                                        class="w-4 h-4 rounded border-gray-300 text-[#4a2e85] focus:ring-[#ef7c43]"
                                        checked={isSelected}
                                        disabled={isDisabled}
                                        onChange$={(e, el) => {
                                          if (isDisabled) return;
                                          handleOwnerPetSelectionChange(p.id, el.checked);
                                        }}
                                      />
                                      <div class="flex items-center gap-2">
                                        {p.photo ? (
                                          <ImageWithRetry src={p.photo} alt={p.name} class="w-8 h-8 rounded-full object-cover border border-[#4a2e85]/10" width={32} height={32} layout="constrained" />
                                        ) : (
                                          <div class="w-8 h-8 rounded-full bg-[#4a2e85]/10 grid place-items-center text-[10px]">🐾</div>
                                        )}
                                        <div class="text-sm text-[#4a2e85] font-medium flex-1">
                                          {p.name} <span class="text-[10px] opacity-60">({p.species})</span>
                                        </div>
                                        {isBlocked && (
                                          <div class="text-[10px] text-red-500 font-bold ml-auto bg-red-50 px-2 py-0.5 rounded border border-red-100">
                                            {blockReason}
                                          </div>
                                        )}
                                      </div>
                                    </label>
                                  );
                                })
                              ) : (
                                <div class="text-xs text-gray-500 italic p-2">No tienes mascotas registradas.</div>
                              )}
                            </div>
                          </div>

                          <div class="rounded-2xl border border-[#4a2e85]/10 bg-white p-4 space-y-3">
                            <div>
                              <p class="text-sm font-extrabold text-[#4a2e85]">Selecciona las fechas</p>
                              <p class="text-[11px] text-[#4a2e85]/70">Toca los días en el calendario para seleccionarlos. Solo se habilitan días disponibles del cuidador.</p>
                            </div>

                            <div class="text-[11px] text-[#4a2e85]/65 bg-[#f7f3ff] border border-[#4a2e85]/10 rounded-lg px-2 py-1 inline-flex items-center gap-2">
                              <span>🐾</span>
                              <span>El calendario solo habilita días disponibles del cuidador y desde hoy en adelante.</span>
                            </div>


                            <div class="rounded-xl border border-[#4a2e85]/10 overflow-hidden">
                              <div class="flex items-center justify-between px-3 py-2 bg-[#4a2e85]/5 border-b border-[#4a2e85]/10">
                                <button
                                  type="button"
                                  class="h-8 w-8 rounded-full border border-[#4a2e85]/20 text-[#4a2e85]"
                                  onClick$={() => {
                                    const [yearText, monthText] = state.bookingMonthCursor.split('-');
                                    const current = new Date(Number(yearText), Number(monthText) - 1, 1);
                                    const previous = new Date(current.getFullYear(), current.getMonth() - 1, 1);
                                    state.bookingMonthCursor = `${previous.getFullYear()}-${`${previous.getMonth() + 1}`.padStart(2, '0')}`;
                                  }}
                                >
                                  ‹
                                </button>
                                <div class="text-sm font-bold text-[#4a2e85] capitalize">{bookingMonthLabel}</div>
                                <button
                                  type="button"
                                  class="h-8 w-8 rounded-full border border-[#4a2e85]/20 text-[#4a2e85]"
                                  onClick$={() => {
                                    const [yearText, monthText] = state.bookingMonthCursor.split('-');
                                    const current = new Date(Number(yearText), Number(monthText) - 1, 1);
                                    const next = new Date(current.getFullYear(), current.getMonth() + 1, 1);
                                    state.bookingMonthCursor = `${next.getFullYear()}-${`${next.getMonth() + 1}`.padStart(2, '0')}`;
                                  }}
                                >
                                  ›
                                </button>
                              </div>

                              <div class="grid grid-cols-7 gap-1 p-3 bg-gradient-to-br from-[#f7f3ff] via-white to-[#fff5ef]">
                                {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((dayName) => (
                                  <div key={dayName} class="text-[11px] font-semibold text-[#4a2e85b3] text-center py-1">{dayName}</div>
                                ))}

                                {bookingCalendarDays.map((day) => {
                                  const selectedDatesList = state.selectedBookingDates;
                                  const year = day.getFullYear();
                                  const month = `${day.getMonth() + 1}`.padStart(2, '0');
                                  const date = `${day.getDate()}`.padStart(2, '0');
                                  const dayKey = `${year}-${month}-${date}`;
                                  const isCurrentMonth = day.getMonth() === bookingMonthBase.getMonth();
                                  const isPast = dayKey < bookingTodayKey;
                                  const isAvailableByCaregiver = caregiverAvailableSet.has(dayKey);
                                  const isSelectable = !isPast && isAvailableByCaregiver;
                                  const isSelected = selectedDatesList.includes(dayKey);
                                  const isRangeAnchor = state.bookingRangeAnchor === dayKey;

                                  if (!isSelectable) {
                                    return (
                                      <div key={dayKey} class={`h-10 rounded-lg border text-xs flex items-center justify-center ${isPast ? (isCurrentMonth ? 'border-[#4a2e85]/10 text-[#4a2e85]/30 bg-[#f8f8fa]' : 'border-transparent text-[#4a2e85]/20 bg-[#ffffff90]') : (isCurrentMonth ? 'border-[#4a2e85]/10 text-[#4a2e85]/40 bg-[#f7f7f9]' : 'border-[#4a2e85]/10 text-[#4a2e85]/30 bg-[#f8f8fa]')}`}>
                                        {day.getDate()}
                                      </div>
                                    );
                                  }

                                  return (
                                    <button
                                      key={dayKey}
                                      type="button"
                                      class={`relative h-10 rounded-lg border text-xs font-semibold flex items-center justify-center ${isRangeAnchor ? 'border-[#4a2e85] bg-[#ede8ff] text-[#4a2e85]' : isSelected ? 'border-[#ef7c43] bg-[#fff0e8] text-[#4a2e85]' : isCurrentMonth ? 'border-[#4a2e85]/20 bg-white text-[#4a2e85]' : 'border-[#4a2e85]/10 bg-[#ffffff90] text-[#4a2e85]/60'}`}
                                      onClick$={() => {
                                        console.log('[CALENDAR CLICK]', { dayKey, mode: state.bookingSelectionMode, anchor: state.bookingRangeAnchor, selected: [...state.selectedBookingDates] });
                                        if (state.bookingSelectionMode === 'intercalados') {
                                          const exists = state.selectedBookingDates.includes(dayKey);
                                          if (exists) {
                                            state.selectedBookingDates = [...state.selectedBookingDates.filter((value) => value !== dayKey)];
                                          } else {
                                            state.selectedBookingDates = [...state.selectedBookingDates, dayKey].sort();
                                          }
                                          state.bookingRangeAnchor = '';
                                          return;
                                        }

                                        if (!state.bookingRangeAnchor) {
                                          state.bookingRangeAnchor = dayKey;
                                          if (!state.selectedBookingDates.includes(dayKey)) {
                                            state.selectedBookingDates = [...state.selectedBookingDates, dayKey].sort();
                                          }
                                          return;
                                        }

                                        const start = dayKey < state.bookingRangeAnchor ? dayKey : state.bookingRangeAnchor;
                                        const end = dayKey < state.bookingRangeAnchor ? state.bookingRangeAnchor : dayKey;
                                        let cursor = new Date(`${start}T00:00:00`);
                                        const finalDate = new Date(`${end}T00:00:00`);
                                        const rangeDays: string[] = [];

                                        while (cursor <= finalDate) {
                                          const rangeYear = cursor.getFullYear();
                                          const rangeMonth = `${cursor.getMonth() + 1}`.padStart(2, '0');
                                          const rangeDay = `${cursor.getDate()}`.padStart(2, '0');
                                          const rangeKey = `${rangeYear}-${rangeMonth}-${rangeDay}`;
                                          if (rangeKey >= bookingTodayKey && caregiverAvailableSet.has(rangeKey)) {
                                            rangeDays.push(rangeKey);
                                          }
                                          cursor.setDate(cursor.getDate() + 1);
                                        }

                                        const newDates = new Set([...state.selectedBookingDates, ...rangeDays]);
                                        state.selectedBookingDates = [...Array.from(newDates)].sort();
                                        state.bookingRangeAnchor = '';
                                      }}
                                    >
                                      {day.getDate()}
                                      {isSelected && <span class="absolute right-1 bottom-0 text-[10px] opacity-70">🐾</span>}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>


                            <div class="flex flex-wrap items-center gap-2 text-[11px] text-[#4a2e85]/70">
                              <span class="font-semibold">Seleccionados: {bookingSelectedDatesSorted.length}</span>
                              <span class="font-semibold">Disponibles: {state.caregiverAvailableDates.length}</span>
                              {state.bookingRangeAnchor && <span>Inicio de rango: {state.bookingRangeAnchor}</span>}
                              {bookingSelectedDatesSorted.length > 0 && (
                                <span>Desde {bookingSelectedDatesSorted[0]} hasta {bookingSelectedDatesSorted[bookingSelectedDatesSorted.length - 1]}</span>
                              )}
                              {bookingSelectedDatesSorted.length > 0 && (
                                <button
                                  type="button"
                                  class="ml-auto px-2 py-1 rounded-md border border-[#4a2e85]/20 bg-white font-semibold"
                                  onClick$={() => {
                                    state.selectedBookingDates = [];
                                    state.bookingRangeAnchor = '';
                                    state.bookingDateInput = '';
                                  }}
                                >
                                  Limpiar selección
                                </button>
                              )}
                            </div>
                          </div>

                          {bookingSelectedDatesSorted.length > 0 ? (
                            <div class="space-y-3 rounded-2xl border border-[#4a2e85]/10 bg-[#faf9ff] p-4">
                              <div class="flex flex-wrap items-center gap-2 text-[11px]">
                                <span class="px-2 py-1 rounded-full bg-[#4a2e85] text-white font-bold">{bookingSelectionPattern}</span>
                                <span class="text-[#4a2e85]/70">Se autocompleta según tu selección de calendario/lista.</span>
                              </div>

                              {bookingSegments.length > 1 ? (
                                <div class="space-y-2">
                                  <div class="text-[11px] font-semibold text-[#4a2e85]/80">
                                    Horario por bloque (rango + días sueltos)
                                  </div>
                                  <div class="space-y-2 max-h-56 overflow-y-auto pr-1">
                                    {bookingDateSegments.map((segment, segmentIndex) => {
                                      const segmentStart = segment[0];
                                      const segmentEnd = segment[segment.length - 1];
                                      const isRangeSegment = segment.length > 1;

                                      const timeFromSegment = state.bookingDayTimes[segmentStart]?.timeFrom || state.serviceDraft.timeFrom || '08:00';
                                      const timeToSegment = state.bookingDayTimes[segmentEnd]?.timeTo || state.serviceDraft.timeTo || '18:00';

                                      let effectiveEndDate = segmentEnd;
                                      if (segmentStart === segmentEnd && timeToSegment <= timeFromSegment) {
                                        const rollover = new Date(`${segmentEnd}T00:00:00`);
                                        rollover.setDate(rollover.getDate() + 1);
                                        effectiveEndDate = `${rollover.getFullYear()}-${`${rollover.getMonth() + 1}`.padStart(2, '0')}-${`${rollover.getDate()}`.padStart(2, '0')}`;
                                      }

                                      const segmentDays = computeBillableDays24h(
                                        segmentStart,
                                        timeFromSegment,
                                        effectiveEndDate,
                                        timeToSegment,
                                      );

                                      return (
                                        <div key={`${segmentStart}-${segmentEnd}`} class="bg-white border border-[#4a2e85]/10 rounded-xl px-3 py-2 space-y-2">
                                          <div class="text-[11px] font-bold text-[#4a2e85]/75">
                                            Bloque {segmentIndex + 1}: {isRangeSegment ? `Rango (${segmentDays} ${segmentDays === 1 ? 'día' : 'días'})` : `Día suelto (${segmentDays} ${segmentDays === 1 ? 'día' : 'días'})`}
                                          </div>

                                          {isRangeSegment ? (
                                            <div class="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_10.5rem_10.5rem] gap-2 items-center">
                                              <div class="text-sm font-semibold text-[#4a2e85]">
                                                Desde {segmentStart} hasta {segmentEnd}
                                              </div>
                                              <input
                                                type="time"
                                                class="w-full bg-white border border-[#4a2e85]/20 rounded-lg px-2 py-1.5 text-sm text-center"
                                                value={state.bookingDayTimes[segmentStart]?.timeFrom || '08:00'}
                                                onInput$={(event) => {
                                                  const value = (event.target as HTMLInputElement).value;
                                                  state.bookingDayTimes = {
                                                    ...state.bookingDayTimes,
                                                    [segmentStart]: {
                                                      timeFrom: value,
                                                      timeTo: state.bookingDayTimes[segmentStart]?.timeTo || '18:00',
                                                    },
                                                  };
                                                }}
                                              />
                                              <input
                                                type="time"
                                                class="w-full bg-white border border-[#4a2e85]/20 rounded-lg px-2 py-1.5 text-sm text-center"
                                                value={state.bookingDayTimes[segmentEnd]?.timeTo || '18:00'}
                                                onInput$={(event) => {
                                                  const value = (event.target as HTMLInputElement).value;
                                                  state.bookingDayTimes = {
                                                    ...state.bookingDayTimes,
                                                    [segmentEnd]: {
                                                      timeFrom: state.bookingDayTimes[segmentEnd]?.timeFrom || '08:00',
                                                      timeTo: value,
                                                    },
                                                  };
                                                }}
                                              />
                                            </div>
                                          ) : (
                                            <div class="grid grid-cols-[minmax(0,1fr)_10.5rem_10.5rem] gap-2 items-center">
                                              <div class="text-sm font-semibold text-[#4a2e85]">Fecha: {segmentStart}</div>
                                              <input
                                                type="time"
                                                class="w-full bg-white border border-[#4a2e85]/20 rounded-lg px-2 py-1.5 text-sm text-center"
                                                value={state.bookingDayTimes[segmentStart]?.timeFrom || '08:00'}
                                                onInput$={(event) => {
                                                  const value = (event.target as HTMLInputElement).value;
                                                  state.bookingDayTimes = {
                                                    ...state.bookingDayTimes,
                                                    [segmentStart]: {
                                                      timeFrom: value,
                                                      timeTo: state.bookingDayTimes[segmentStart]?.timeTo || '18:00',
                                                    },
                                                  };
                                                }}
                                              />
                                              <input
                                                type="time"
                                                class="w-full bg-white border border-[#4a2e85]/20 rounded-lg px-2 py-1.5 text-sm text-center"
                                                value={state.bookingDayTimes[segmentStart]?.timeTo || '18:00'}
                                                onInput$={(event) => {
                                                  const value = (event.target as HTMLInputElement).value;
                                                  state.bookingDayTimes = {
                                                    ...state.bookingDayTimes,
                                                    [segmentStart]: {
                                                      timeFrom: state.bookingDayTimes[segmentStart]?.timeFrom || '08:00',
                                                      timeTo: value,
                                                    },
                                                  };
                                                }}
                                              />
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                  <div class="text-[11px] text-[#4a2e85]/65">Bloques continuos muestran Desde/Hasta. Días sueltos muestran Fecha.</div>
                                </div>
                              ) : (
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div class="space-y-1.5">
                                    <label class="text-xs font-bold text-[#4a2e85] uppercase tracking-wider flex items-center gap-2">
                                      <LuCalendarDays class="w-4 h-4" /> Desde (automático)
                                    </label>
                                    <div class="grid grid-cols-[minmax(0,0.9fr)_10.5rem] gap-2">
                                      <input
                                        type="date"
                                        class="flex-1 min-w-0 bg-gray-100 border border-[#4a2e85]/15 rounded-xl px-3 py-2.5 text-sm text-[#4a2e85]"
                                        value={bookingRangeStart}
                                        readOnly
                                      />
                                      <input
                                        type="time"
                                        class="w-full bg-white border border-[#4a2e85]/20 rounded-xl px-2 py-2.5 text-sm focus:ring-2 focus:ring-[#4a2e85]/20 focus:border-[#4a2e85]/40 outline-none transition-all shadow-sm text-center"
                                        value={state.serviceDraft.timeFrom}
                                        onInput$={(e) => (state.serviceDraft.timeFrom = (e.target as HTMLInputElement).value)}
                                      />
                                    </div>
                                  </div>

                                  <div class="space-y-1.5">
                                    <label class="text-xs font-bold text-[#4a2e85] uppercase tracking-wider flex items-center gap-2">
                                      <LuCalendarDays class="w-4 h-4" /> Hasta (automático)
                                    </label>
                                    <div class="grid grid-cols-[minmax(0,0.9fr)_10.5rem] gap-2">
                                      <input
                                        type="date"
                                        class="flex-1 min-w-0 bg-gray-100 border border-[#4a2e85]/15 rounded-xl px-3 py-2.5 text-sm text-[#4a2e85]"
                                        value={bookingRangeEnd}
                                        readOnly
                                      />
                                      <input
                                        type="time"
                                        class="w-full bg-white border border-[#4a2e85]/20 rounded-xl px-2 py-2.5 text-sm focus:ring-2 focus:ring-[#4a2e85]/20 focus:border-[#4a2e85]/40 outline-none transition-all shadow-sm text-center"
                                        value={state.serviceDraft.timeTo}
                                        onInput$={(e) => (state.serviceDraft.timeTo = (e.target as HTMLInputElement).value)}
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div class="space-y-1.5">
                                <label class="text-xs font-bold text-[#4a2e85] uppercase tracking-wider flex items-center gap-2">
                                  <LuCalendarDays class="w-4 h-4" /> Desde
                                </label>
                                <div class="grid grid-cols-[minmax(0,0.9fr)_8.75rem] gap-2">
                                  <input
                                    type="date"
                                    class="flex-1 min-w-0 bg-white border border-[#4a2e85]/20 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#4a2e85]/20 focus:border-[#4a2e85]/40 outline-none transition-all shadow-sm"
                                    value={state.serviceDraft.dateFrom}
                                    onInput$={(e) => (state.serviceDraft.dateFrom = (e.target as HTMLInputElement).value)}
                                  />
                                  <input
                                    type="time"
                                    class="w-full bg-white border border-[#4a2e85]/20 rounded-xl px-2 py-2.5 text-sm focus:ring-2 focus:ring-[#4a2e85]/20 focus:border-[#4a2e85]/40 outline-none transition-all shadow-sm text-center"
                                    value={state.serviceDraft.timeFrom}
                                    onInput$={(e) => (state.serviceDraft.timeFrom = (e.target as HTMLInputElement).value)}
                                  />
                                </div>
                              </div>

                              <div class="space-y-1.5">
                                <label class="text-xs font-bold text-[#4a2e85] uppercase tracking-wider flex items-center gap-2">
                                  <LuCalendarDays class="w-4 h-4" /> Hasta
                                </label>
                                <div class="grid grid-cols-[minmax(0,0.9fr)_8.75rem] gap-2">
                                  <input
                                    type="date"
                                    class="flex-1 min-w-0 bg-white border border-[#4a2e85]/20 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#4a2e85]/20 focus:border-[#4a2e85]/40 outline-none transition-all shadow-sm"
                                    value={state.serviceDraft.dateTo}
                                    onInput$={(e) => (state.serviceDraft.dateTo = (e.target as HTMLInputElement).value)}
                                  />
                                  <input
                                    type="time"
                                    class="w-full bg-white border border-[#4a2e85]/20 rounded-xl px-2 py-2.5 text-sm focus:ring-2 focus:ring-[#4a2e85]/20 focus:border-[#4a2e85]/40 outline-none transition-all shadow-sm text-center"
                                    value={state.serviceDraft.timeTo}
                                    onInput$={(e) => (state.serviceDraft.timeTo = (e.target as HTMLInputElement).value)}
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          <div class="pt-2">
                            <div class="bg-gradient-to-r from-[#f6e527]/10 to-[#ef7c43]/10 rounded-xl p-4 border border-[#4a2e85]/10 flex items-center justify-between">
                              <div>
                                <p class="text-xs font-bold text-[#4a2e85] uppercase tracking-wider mb-1">Total Estimado</p>
                                <p class="text-[10px] text-gray-500">
                                  Base: <span class="font-medium text-[#4a2e85]">${Math.max(chat.caregiverPricePerDay || 0, 10)}/día</span>
                                  <span> • {bookingBillableDays} días facturables</span>
                                </p>
                                <p class="mt-1 text-[10px] text-[#4a2e85]/65">
                                  Se cobra por bloques de 24h. Ejemplo: 7:00 → 7:00 del día siguiente = 1 día. Si supera las 24h se cobra el día completo adicional.
                                </p>
                              </div>
                              <div class="text-right">
                                <p class="text-2xl font-black text-[#4a2e85]">
                                  ${state.serviceDraft.amountUsd || '0.00'}
                                </p>
                                <p class="text-[10px] font-bold text-[#ef7c43]">USD (Tasa BCV)</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div class="mt-8 border-t border-[#4a2e85]/5 pt-8">
                        <div class="bg-gradient-to-br from-[#4a2e85]/5 via-white to-orange-50/20 border border-[#4a2e85]/10 rounded-3xl p-5 sm:p-6 flex flex-col lg:flex-row items-center justify-between gap-6 shadow-sm">
                          <div class="space-y-4 flex-1 max-w-2xl">
                            <div class="flex gap-4">
                              <div class="h-12 w-12 rounded-2xl bg-blue-100 flex items-center justify-center shrink-0 shadow-inner">
                                <LuInfo class="w-6 h-6 text-blue-600" />
                              </div>
                              <div class="space-y-1">
                                <p class="text-xs font-black text-[#4a2e85] uppercase tracking-widest flex items-center gap-1.5">
                                  <span>ℹ️</span> Importante
                                </p>
                                <p class="text-xs sm:text-sm text-[#4a2e85b3] leading-relaxed font-medium">
                                  Al solicitar el servicio, el cuidador recibirá una notificación inmediata. Una vez que acepte la propuesta, podrás proceder con el pago a través de nuestra plataforma segura.
                                </p>
                              </div>
                            </div>

                            <label class="group flex items-center gap-4 p-4 rounded-2xl border-2 border-transparent bg-white shadow-sm ring-1 ring-[#4a2e85]/5 cursor-pointer transition-all hover:ring-[#ef7c43]/30 has-[:checked]:border-[#ef7c43] has-[:checked]:bg-[#fff5ef] has-[:checked]:shadow-md">
                              <div class="relative flex items-center justify-center">
                                <input
                                  type="checkbox"
                                  class="peer h-6 w-6 rounded-lg border-2 border-[#4a2e85]/20 text-[#ef7c43] focus:ring-[#ef7c43]/30 transition-all checked:border-[#ef7c43]"
                                  checked={state.termsAccepted}
                                  onInput$={(e) => (state.termsAccepted = (e.target as HTMLInputElement).checked)}
                                />
                                <div class="absolute pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity">
                                  <svg class="w-4 h-4 text-[#ef7c43]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="4" d="M5 13l4 4L19 7"></path></svg>
                                </div>
                              </div>
                              <span class="text-xs sm:text-sm font-bold text-[#4a2e85] select-none leading-snug group-hover:text-[#ef7c43] transition-colors">
                                Acepto los términos y condiciones del servicio de cuidado y la política de pagos de ACUPATAS.
                              </span>
                            </label>
                          </div>

                          <div class="shrink-0 w-full lg:w-auto">
                            <button
                              class={`w-full lg:w-auto min-w-[200px] px-10 py-5 rounded-2xl bg-gradient-to-r from-[#f6e527] to-[#ef7c43] text-[#4a2e85] font-black text-sm uppercase tracking-[0.2em] shadow-xl hover:shadow-[#f6e527]/30 hover:scale-[1.02] active:scale-95 transition-all flex flex-col items-center justify-center gap-1 ${loading.requesting || !state.termsAccepted ? 'opacity-70 cursor-not-allowed grayscale' : ''}`}
                              onClick$={submitService}
                              data-no-loader="true"
                              disabled={loading.requesting || !state.termsAccepted}
                            >
                              {loading.requesting ? (
                                <span>Enviando...</span>
                              ) : (
                                <>
                                  <span class="text-xs opacity-70 font-bold mb-0.5">🐾 PROCESAR</span>
                                  <span>
                                    {bookingSelectedDatesSorted.length > 0
                                      ? `Reservar (${bookingBillableDays} ${bookingBillableDays === 1 ? 'día' : 'días'})`
                                      : 'Reservar ahora'}
                                  </span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div class="bg-gradient-to-br from-[#4a2e85]/5 to-white rounded-3xl p-6 border border-[#4a2e85]/10 shadow-sm text-center">
                      <div class="h-16 w-16 mx-auto rounded-full bg-[#4a2e85]/10 flex items-center justify-center text-[#4a2e85] mb-4">
                        <LuCalendarDays class="w-8 h-8" />
                      </div>
                      <h3 class="text-lg font-bold text-[#4a2e85]">Esperando solicitud</h3>
                      <p class="text-sm text-gray-500 mt-1 max-w-xs mx-auto">
                        El dueño de la mascota debe enviar la solicitud de servicio para comenzar.
                      </p>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {
              showReport.value && (
                <div class="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
                  <div class="bg-white rounded-2xl p-6 w-full max-w-md space-y-4">
                    <h3 class="text-lg font-semibold text-[#4a2e85]">Reportar conversación</h3>
                    <p class="text-sm text-gray-600">Describe el motivo del reporte y el equipo lo revisará.</p>
                    <textarea
                      rows={4}
                      class="w-full border border-[#4a2e85]/20 rounded-2xl px-3 py-2 text-sm"
                      value={state.reportDraft}
                      onInput$={(e) => (state.reportDraft = (e.target as HTMLTextAreaElement).value)}
                    />
                    <div class="flex justify-end gap-2">
                      <button class="px-4 py-2 rounded-xl text-sm" onClick$={() => (showReport.value = false)}>
                        Cancelar
                      </button>
                      <button
                        class={`px-4 py-2 rounded-xl bg-rose-600 text-white text-sm flex items-center gap-2 ${loading.reporting ? 'opacity-70 cursor-not-allowed' : ''}`}
                        onClick$={submitReport}
                        data-no-loader="true"
                        disabled={loading.reporting}
                      >
                        {loading.reporting ? (
                          <>
                            <span>Enviando...</span>
                          </>
                        ) : 'Enviar reporte'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            }

            {
              state.showOwnerModal && state.viewOwner && (
                <div class="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 overflow-y-auto">
                  <div class="bg-white rounded-2xl p-6 w-full max-w-lg space-y-4 max-h-[80vh] overflow-y-auto">
                    <div class="flex items-center gap-4 mb-4">
                      <div class="h-20 w-20 rounded-full border border-[#4a2e85]/20 overflow-hidden bg-gray-100 flex-shrink-0">
                        {state.viewOwner!.profilePhoto ? (
                          <ImageWithRetry
                            src={state.viewOwner!.profilePhoto}
                            class="h-full w-full object-cover"
                            width={80}
                            height={80}
                            layout="constrained"
                          />
                        ) : (
                          <div class="h-full w-full grid place-items-center text-gray-400">
                            <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                          </div>
                        )}
                      </div>
                      <div class="flex-1">
                        <div class="flex items-start justify-between">
                          <div>
                            <h3 class="text-xl font-bold text-[#4a2e85]">{state.viewOwner!.displayName || state.viewOwner!.fullName}</h3>
                            <div class="flex gap-2 mt-1">
                              <VerificationBadge verified={!!state.viewOwner!.isVerified} size="sm" />
                              <span class="bg-[#4a2e85]/10 text-[#4a2e85] text-xs px-2 py-0.5 rounded-full">★ {state.viewOwner!.rating?.toFixed(1)}</span>
                            </div>
                          </div>
                          <button onClick$={() => state.showOwnerModal = false} class="text-gray-400 hover:text-gray-600">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div class="space-y-3 text-sm text-gray-700">
                      {state.viewOwner!.bio && (
                        <div>
                          <h4 class="font-semibold text-[#4a2e85]">Biografía</h4>
                          <p class="whitespace-pre-wrap">{state.viewOwner!.bio}</p>
                        </div>
                      )}
                      {state.viewOwner!.zone && (
                        <div>
                          <h4 class="font-semibold text-[#4a2e85]">Ubicación</h4>
                          <p>{state.viewOwner!.zone}</p>
                        </div>
                      )}
                      {!!state.viewOwner!.locationLat && !!state.viewOwner!.locationLng && (
                        <div>
                          <h4 class="font-semibold text-[#4a2e85] mb-2">Mapa de ubicación</h4>
                          <div class="h-56 w-full rounded-xl overflow-hidden border border-[#4a2e85]/10">
                            <LeafletMap location={ownerModalLocation} />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Reviews Section */}
                    <div class="border-t border-[#4a2e85]/10 pt-4">
                      <h4 class="font-semibold text-[#4a2e85] flex items-center gap-2 mb-3">
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                        Reseñas ({state.viewOwnerReviews.length})
                      </h4>
                      {state.viewOwnerReviews.length === 0 ? (
                        <p class="text-xs text-gray-400 italic">Este dueño aún no tiene reseñas.</p>
                      ) : (
                        <div class="space-y-3 max-h-48 overflow-y-auto pr-1">
                          {state.viewOwnerReviews.slice(0, 5).map((review) => (
                            <div key={review.id} class="bg-[#f7f3ff] rounded-xl p-3 border border-[#4a2e85]/5">
                              <div class="flex items-center gap-2 mb-1">
                                <span class="flex items-center gap-0.5">
                                  {Array.from({ length: 5 }).map((_, i) => (
                                    <svg
                                      key={i}
                                      class={`w-3 h-3 ${i < review.rating ? 'text-amber-400' : 'text-gray-200'}`}
                                      fill="currentColor"
                                      viewBox="0 0 20 20"
                                    >
                                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                    </svg>
                                  ))}
                                </span>
                                <span class="text-[10px] font-bold text-[#4a2e85]">{review.rating}/5</span>
                              </div>
                              <p class="text-xs text-gray-700">{review.comment}</p>
                              <div class="flex items-center justify-between mt-2 text-[10px] text-gray-400">
                                <span>{review.reviewerName || 'Cuidador'}{review.petName ? ` · ${review.petName}` : ''}</span>
                                <span>{review.date ? new Date(review.date).toLocaleDateString() : ''}</span>
                              </div>
                            </div>
                          ))}
                          {state.viewOwnerReviews.length > 5 && (
                            <p class="text-xs text-center text-[#4a2e85]/60">
                              y {state.viewOwnerReviews.length - 5} reseña(s) más...
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <button class="w-full py-2 bg-[#4a2e85]/10 text-[#4a2e85] rounded-xl font-semibold" onClick$={() => state.showOwnerModal = false}>Cerrar</button>
                  </div>
                </div>
              )
            }

            {
              state.showPetModal && state.viewPet && (
                <div class="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 overflow-y-auto">
                  <div class="bg-white rounded-2xl p-6 w-full max-w-lg space-y-4 max-h-[80vh] overflow-y-auto">
                    <div class="flex items-start justify-between">
                      <div>
                        <h3 class="text-xl font-bold text-[#4a2e85]">{state.viewPet!.name}</h3>
                        <p class="text-sm text-gray-500">{state.viewPet!.species} • {state.viewPet!.age} años</p>
                      </div>
                      <button onClick$={() => state.showPetModal = false} class="text-gray-400 hover:text-gray-600">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                      </button>
                    </div>

                    <div class="aspect-video bg-gray-100 rounded-xl overflow-hidden border border-[#4a2e85]/10">
                      {state.viewPet!.photo ? (
                        <ImageWithRetry
                          src={state.viewPet!.photo}
                          class="w-full h-full object-cover"
                          width={400}
                          height={400}
                          layout="constrained"
                        />
                      ) : (
                        <div class="w-full h-full grid place-items-center text-gray-300 bg-gray-50">
                          <svg class="w-16 h-16 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          <span class="text-xs font-medium text-gray-400 mt-2">Sin foto</span>
                        </div>
                      )}
                    </div>

                    <div class="space-y-3 text-sm text-gray-700 grid grid-cols-2 gap-2">
                      <div><span class="font-semibold block">Raza/Tipo:</span> {state.viewPet!.species}</div>
                      <div><span class="font-semibold block">Peso:</span> {state.viewPet!.weight} kg</div>
                      <div><span class="font-semibold block">Sexo:</span> {state.viewPet!.sex}</div>
                      <div class="col-span-2"><span class="font-semibold block">Comportamiento:</span> {state.viewPet?.behavior?.join(', ') || 'N/A'}</div>
                      <div class="col-span-2"><span class="font-semibold block">Cond. Médicas:</span> {state.viewPet!.medicalConditions || 'Ninguna'}</div>
                      <div class="col-span-2"><span class="font-semibold block">Alergias:</span> {state.viewPet!.allergies || 'Ninguna'}</div>
                      <div class="col-span-2">
                        <span class="font-semibold block">Carnet de vacunación:</span>
                        {state.viewPet!.vaccinationCard ? (
                          <a
                            href={state.viewPet!.vaccinationCard}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-[#4a2e85] underline font-medium"
                          >
                            Ver carnet
                          </a>
                        ) : (
                          <span>No adjunto</span>
                        )}
                      </div>
                    </div>
                    <button class="w-full py-2 bg-[#4a2e85]/10 text-[#4a2e85] rounded-xl font-semibold" onClick$={() => state.showPetModal = false}>Cerrar</button>
                  </div>
                </div>
              )
            }

            {
              state.cameraOpen && (
                <div class="fixed inset-0 bg-black flex flex-col z-[60]">
                  <div class="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
                    {!state.capturedImage ? (
                      <video ref={videoRef} class="w-full h-full object-cover" autoplay playsInline muted></video>
                    ) : (
                      <ImageWithRetry
                        src={state.capturedImage || ''}
                        class="w-full h-full object-contain"
                        width={640}
                        height={480}
                        layout="constrained"
                      />
                    )}
                    <canvas ref={canvasRef} class="hidden"></canvas>

                    {/* Overlay Controls */}
                    <button class="absolute top-4 right-4 text-white p-2 bg-black/20 rounded-full" onClick$={stopCamera}>
                      <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                  </div>

                  <div class="h-32 bg-black text-white p-4 flex items-center justify-center gap-6">
                    {!state.capturedImage ? (
                      <button onClick$={capturePhoto} class="w-16 h-16 rounded-full bg-white border-4 border-gray-300 shadow-lg active:scale-95 transition-transform"></button>
                    ) : (
                      <>
                        <button onClick$={() => { state.capturedImage = null; startCamera(); }} class="px-6 py-2 rounded-full bg-gray-800 text-white font-semibold">Repetir</button>
                        <button onClick$={sendPhoto} data-no-loader="true" class="px-6 py-2 rounded-full bg-[#4a2e85] text-white font-bold text-lg shadow-lg flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed" disabled={loading.sending}>
                          {loading.sending ? (
                            <span>Enviando...</span>
                          ) : 'Enviar Foto'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            }
          </div >
        );
      })()}
    </>
  );
});
