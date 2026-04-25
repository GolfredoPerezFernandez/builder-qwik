import { component$, useSignal, $, useComputed$, type QRL } from '@builder.io/qwik';
import { Link, routeLoader$, server$ } from '@builder.io/qwik-city';
import { getSessionFromEvent, getUserById } from '~/lib/auth';
import { listAllRegistrations, verifyUserStatus, getAdminUserDetail, type AdminUserRecord, type AdminUserDetail } from '~/lib/admin';
import { ImageWithRetry } from '~/components/ui/image-with-retry';
import { LuCheckCircle2, LuXCircle, LuEye, LuFileText, LuUser, LuShieldCheck, LuBan, LuPhone, LuMapPin, LuDog, LuCalendar } from '@qwikest/icons/lucide';
import { type OwnerProfileRecord } from '~/lib/owner';
import { type CaregiverRecord } from '~/lib/caregiver';

export const useAdminData = routeLoader$(async (event) => {
    const session = await getSessionFromEvent(event);
    if (!session) throw event.redirect(302, '/auth?mode=login');

    const user = await getUserById(session.userId);
    if ((user?.email || '').trim().toLowerCase() !== 'admin@gmail.com') {
        throw event.error(403, 'Acceso denegado. Solo administradores.');
    }

    const registrations = await listAllRegistrations();
    return { registrations };
});

const verifyAction = server$(async function (userId: string, role: string, verified: boolean) {
    const session = await getSessionFromEvent(this);
    if (!session) return { ok: false, reason: 'auth' };

    const user = await getUserById(session.userId);
    if ((user?.email || '').trim().toLowerCase() !== 'admin@gmail.com') return { ok: false, reason: 'forbidden' };

    return await verifyUserStatus(userId, role, verified);
});

const banAction = server$(async function (userId: string, isBan: boolean, reason: string = '') {
    const session = await getSessionFromEvent(this);
    if (!session) return { ok: false, reason: 'auth' };

    const user = await getUserById(session.userId);
    if ((user?.email || '').trim().toLowerCase() !== 'admin@gmail.com') return { ok: false, reason: 'forbidden' };

    const { banUser, unbanUser } = await import('~/lib/admin');
    if (isBan) {
        return await banUser(userId, reason);
    } else {
        return await unbanUser(userId);
    }
});

const loadFullDetail = server$(async function (userId: string, role: string) {
    const session = await getSessionFromEvent(this);
    if (!session) return null;
    const user = await getUserById(session.userId);
    if ((user?.email || '').trim().toLowerCase() !== 'admin@gmail.com') return null;

    return await getAdminUserDetail(userId, role);
});

const DetailModal = component$(({ user, onClose, onVerify, onBan, isRefreshing }: {
    user: AdminUserDetail,
    onClose: QRL<() => void>,
    onVerify: QRL<(verified: boolean) => void>,
    onBan: QRL<(isBan: boolean) => void>,
    isRefreshing: boolean
}) => {
    const isOwner = user.role === 'owner';
    // Cast to specific types for easier access
    const ownerProfile = isOwner ? (user.fullProfile as OwnerProfileRecord) : null;
    const caregiverProfile = !isOwner ? (user.fullProfile as CaregiverRecord) : null;

    return (
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div class="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                <div class="sticky top-0 bg-white/95 backdrop-blur z-10 px-8 py-5 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h2 class="text-2xl font-bold text-[#4a2e85] flex items-center gap-2">
                            {user.name}
                            {user.isVerified && <LuCheckCircle2 class="w-6 h-6 text-emerald-500" />}
                        </h2>
                        <p class="text-sm text-gray-500 uppercase tracking-wider font-semibold">{user.role === 'owner' ? 'Dueño de Mascota' : 'Cuidador Certificado'}</p>
                    </div>
                    <button onClick$={onClose} class="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <LuXCircle class="w-8 h-8 text-gray-400" />
                    </button>
                </div>

                <div class="p-8 space-y-8">
                    {/* INFO BASICA */}
                    <section class="grid md:grid-cols-2 gap-8">
                        <div class="space-y-4">
                            <h3 class="text-lg font-bold text-[#4a2e85] flex items-center gap-2">
                                <LuUser class="w-5 h-5 text-[#ef7c43]" /> Información Personal
                            </h3>
                            <div class="bg-gray-50 rounded-2xl p-5 space-y-3 text-sm">
                                <div class="grid grid-cols-[120px,1fr] gap-2">
                                    <span class="text-gray-500">Email:</span>
                                    <span class="font-medium text-gray-900 break-all">{user.email}</span>
                                </div>
                                <div class="grid grid-cols-[120px,1fr] gap-2">
                                    <span class="text-gray-500">Registrado:</span>
                                    <span class="font-medium text-gray-900">{new Date(user.createdAt).toLocaleDateString()}</span>
                                </div>
                                {isOwner && ownerProfile && (
                                    <>
                                        <div class="grid grid-cols-[120px,1fr] gap-2">
                                            <span class="text-gray-500">Cédula:</span>
                                            <span class="font-medium text-gray-900">{ownerProfile.cedula}</span>
                                        </div>
                                        <div class="grid grid-cols-[120px,1fr] gap-2">
                                            <span class="text-gray-500">Teléfono:</span>
                                            <span class="font-medium text-gray-900">{ownerProfile.primaryPhone}</span>
                                        </div>
                                        <div class="grid grid-cols-[120px,1fr] gap-2">
                                            <span class="text-gray-500">Tel. Alt:</span>
                                            <span class="font-medium text-gray-900">{ownerProfile.alternativePhone || '-'}</span>
                                        </div>
                                    </>
                                )}
                                {!isOwner && caregiverProfile && (
                                    <>
                                        <div class="grid grid-cols-[120px,1fr] gap-2">
                                            <span class="text-gray-500">Nombre:</span>
                                            <span class="font-medium text-gray-900">{caregiverProfile.name}</span>
                                        </div>
                                        <div class="grid grid-cols-[120px,1fr] gap-2">
                                            <span class="text-gray-500">Precio/Día:</span>
                                            <span class="font-medium text-[#ef7c43] font-bold">${caregiverProfile.pricePerDay}</span>
                                        </div>
                                        <div class="grid grid-cols-[120px,1fr] gap-2">
                                            <span class="text-gray-500">Zona:</span>
                                            <span class="font-medium text-gray-900">{caregiverProfile.zone}</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div class="space-y-4">
                            <h3 class="text-lg font-bold text-[#4a2e85] flex items-center gap-2">
                                <LuMapPin class="w-5 h-5 text-[#ef7c43]" /> Ubicación y Datos
                            </h3>
                            <div class="bg-gray-50 rounded-2xl p-5 space-y-3 text-sm">
                                {isOwner && ownerProfile && (
                                    <>
                                        <div>
                                            <span class="block text-gray-500 text-xs uppercase mb-1">Dirección:</span>
                                            <p class="font-medium text-gray-900">{ownerProfile.address}</p>
                                        </div>
                                        <div>
                                            <span class="block text-gray-500 text-xs uppercase mb-1">Detalle:</span>
                                            <p class="font-medium text-gray-900">{ownerProfile.addressDetail || '-'}</p>
                                        </div>
                                        <div>
                                            <span class="block text-gray-500 text-xs uppercase mb-1">Zona:</span>
                                            <p class="font-medium text-gray-900">{ownerProfile.zone}</p>
                                        </div>
                                    </>
                                )}
                                {!isOwner && caregiverProfile && (
                                    <>
                                        <div>
                                            <span class="block text-gray-500 text-xs uppercase mb-1">Biografía:</span>
                                            <p class="font-medium text-gray-900 italic">"{caregiverProfile.bio}"</p>
                                        </div>
                                        <div>
                                            <span class="block text-gray-500 text-xs uppercase mb-1">Coordenadas:</span>
                                            <p class="font-medium text-gray-900 text-xs">{caregiverProfile.lat}, {caregiverProfile.lng}</p>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* SECCION ESPECIFICA DE ROL */}
                    {/* SECCION COMPARTIDA (Mascotas, Emergencia, Referencias) */}
                    {((user.pets?.length ?? 0) > 0 || user.emergency || (user.references?.length ?? 0) > 0) && (
                        <section class="space-y-4">
                            {user.pets && user.pets.length > 0 && (
                                <>
                                    <h3 class="text-lg font-bold text-[#4a2e85] flex items-center gap-2">
                                        <LuDog class="w-5 h-5 text-[#ef7c43]" /> Mascotas ({user.pets?.length || 0})
                                    </h3>
                                    <div class="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                                        {user.pets.map(pet => (
                                            <div key={pet.id} class="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex items-start gap-4">
                                                {pet.photo ? (
                                                    <ImageWithRetry src={pet.photo} class="w-16 h-16 rounded-xl object-cover bg-gray-100" width={64} height={64} layout="constrained" />
                                                ) : (
                                                    <div class="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center text-2xl">🐶</div>
                                                )}
                                                <div>
                                                    <h4 class="font-bold text-[#4a2e85]">{pet.name}</h4>
                                                    <p class="text-xs text-gray-500">{pet.species} • {pet.age} años</p>
                                                    <div class="flex gap-1 mt-1">
                                                        <span class="px-2 py-0.5 bg-violet-50 text-violet-700 rounded-md text-[10px] uppercase font-bold">{pet.sex}</span>
                                                    </div>
                                                    {pet.vaccinationCard && (
                                                        <a href={pet.vaccinationCard} target="_blank" class="text-[10px] text-blue-600 underline mt-2 block">Ver Carnet</a>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}

                            <div class="grid md:grid-cols-2 gap-8 mt-6">
                                {user.emergency && (
                                    <div>
                                        <h4 class="font-bold text-[#4a2e85] mb-3">Contacto de Emergencia</h4>
                                        <div class="bg-rose-50 rounded-xl p-4 border border-rose-100 text-sm space-y-1">
                                            <p><span class="font-semibold">Nombre:</span> {user.emergency.name}</p>
                                            <p><span class="font-semibold">Tel:</span> {user.emergency.phone}</p>
                                            <p><span class="font-semibold">Relación:</span> {user.emergency.relation}</p>
                                            <p><span class="font-semibold">Dirección:</span> {user.emergency.address}</p>
                                        </div>
                                    </div>
                                )}
                                {user.references && user.references.length > 0 && (
                                    <div>
                                        <h4 class="font-bold text-[#4a2e85] mb-3">Referencias</h4>
                                        <div class="bg-blue-50 rounded-xl p-4 border border-blue-100 text-sm space-y-2">
                                            {user.references.map((ref, i) => (
                                                <p key={i}>
                                                    <span class="font-bold">{ref.type === 'familiar' ? '👨‍👩‍👧' : '👤'} {ref.name}</span>
                                                    <span class="text-gray-500 text-xs ml-1">({ref.relation})</span>
                                                    <br />
                                                    <span class="text-gray-600 pl-5">📞 {ref.phone}</span>
                                                </p>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>
                    )}

                    {!isOwner && caregiverProfile && (
                        <section class="space-y-4">
                            <h3 class="text-lg font-bold text-[#4a2e85] flex items-center gap-2">
                                <LuCalendar class="w-5 h-5 text-[#ef7c43]" /> Servicios y Preferencias
                            </h3>
                            <div class="grid md:grid-cols-3 gap-4">
                                <div class="bg-white border border-gray-200 rounded-xl p-4">
                                    <h4 class="text-xs uppercase font-bold text-gray-500 mb-2">Servicios</h4>
                                    <div class="flex flex-wrap gap-2">
                                        {Object.entries(caregiverProfile.services || {}).filter(([, v]) => v).map(([k]) => (
                                            <span key={k} class="px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-bold capitalize">{k}</span>
                                        ))}
                                    </div>
                                </div>
                                <div class="bg-white border border-gray-200 rounded-xl p-4">
                                    <h4 class="text-xs uppercase font-bold text-gray-500 mb-2">Tamaños Aceptados</h4>
                                    <div class="flex flex-wrap gap-2">
                                        {caregiverProfile.sizes?.map(s => (
                                            <span key={s} class="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold capitalize">{s}</span>
                                        ))}
                                    </div>
                                </div>
                                <div class="bg-white border border-gray-200 rounded-xl p-4">
                                    <h4 class="text-xs uppercase font-bold text-gray-500 mb-2">Preferencias</h4>
                                    <div class="space-y-1 text-sm">
                                        <p>Multi-mascota: {caregiverProfile.multiplePets ? 'Sí' : 'No'}</p>
                                        <p>Tiene mascota: {caregiverProfile.hasOwnPet ? 'Sí' : 'No'}</p>
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* DOCUMENTOS */}
                    <section>
                        <h3 class="text-lg font-bold text-[#4a2e85] flex items-center gap-2 mb-4">
                            <LuFileText class="w-5 h-5 text-[#ef7c43]" /> Documentos e Imágenes
                        </h3>
                        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                            {Object.entries(user.documents || {}).map(([key, val]) => {
                                if (!val) return null;
                                const labels: Record<string, string> = {
                                    cedulaFront: 'Cédula (Anverso)',
                                    cedulaBack: 'Cédula (Reverso)',
                                    rifDoc: 'RIF',
                                    bankSupport: 'Soporte Bancario',
                                    petVaccine: 'Carnet de Vacunas',
                                };
                                const label = labels[key] || key;
                                return (
                                    <a
                                        key={key}
                                        href={val}
                                        target="_blank"
                                        class="group block bg-gray-50 border border-gray-200 rounded-xl overflow-hidden hover:border-[#4a2e85]/30 hover:shadow-lg transition-all"
                                    >
                                        <div class="aspect-[4/3] overflow-hidden bg-gray-100">
                                            <ImageWithRetry
                                                src={val}
                                                alt={label}
                                                class="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                                width={200}
                                                height={150}
                                                layout="constrained"
                                            />
                                        </div>
                                        <div class="p-2 text-center">
                                            <span class="text-xs font-bold text-gray-600 block truncate">{label}</span>
                                        </div>
                                    </a>
                                );
                            })}
                        </div>
                        {Object.values(user.documents).every(v => !v) && (
                            <p class="text-sm text-gray-400 italic">No hay documentos cargados.</p>
                        )}
                    </section>

                    {/* DATOS BANCARIOS */}
                    {user.bank && (
                        <section>
                            <h3 class="text-lg font-bold text-[#4a2e85] flex items-center gap-2 mb-4">
                                <LuFileText class="w-5 h-5 text-[#ef7c43]" /> Datos Bancarios
                            </h3>
                            <div class="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-6 border border-emerald-200">
                                <div class="grid md:grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span class="block text-gray-600 text-xs uppercase mb-1 font-semibold">Banco:</span>
                                        <p class="font-bold text-gray-900 text-lg">{user.bank.bankName}</p>
                                    </div>
                                    <div>
                                        <span class="block text-gray-600 text-xs uppercase mb-1 font-semibold">Titular:</span>
                                        <p class="font-bold text-gray-900 text-lg">{user.bank.titular}</p>
                                    </div>
                                    <div>
                                        <span class="block text-gray-600 text-xs uppercase mb-1 font-semibold">RIF/Cédula:</span>
                                        <p class="font-medium text-gray-900">{user.bank.rif}</p>
                                    </div>
                                    <div>
                                        <span class="block text-gray-600 text-xs uppercase mb-1 font-semibold">Pago Móvil:</span>
                                        <p class="font-medium text-gray-900">{user.bank.paymobile}</p>
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* BOTONES DE VERIFICACIÓN */}
                    <section class="sticky bottom-0 bg-white/95 backdrop-blur pt-6 pb-2 border-t border-gray-200">
                        <div class="flex gap-3">
                            {!user.isVerified ? (
                                <button
                                    onClick$={() => onVerify(true)}
                                    data-no-loader="true"
                                    class="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                                    disabled={isRefreshing}
                                >
                                    {isRefreshing ? 'Verificando...' : (
                                        <>
                                            <LuCheckCircle2 class="w-6 h-6" />
                                            Verificar perfil
                                        </>
                                    )}
                                </button>
                            ) : (
                                <button
                                    onClick$={() => onVerify(false)}
                                    data-no-loader="true"
                                    class="flex-1 bg-white border-2 border-red-500 text-red-500 font-bold py-4 rounded-xl hover:bg-red-50 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                                    disabled={isRefreshing}
                                >
                                    {isRefreshing ? 'Quitando...' : (
                                        <>
                                            <LuBan class="w-6 h-6" />
                                            Quitar verificado
                                        </>
                                    )}
                                </button>
                            )}

                            {!user.isBanned ? (
                                <button
                                    onClick$={() => {
                                        const reason = window.prompt('Motivo del bloqueo:');
                                        if (reason !== null) onBan(true);
                                    }}
                                    data-no-loader="true"
                                    class="flex-1 bg-red-600 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-red-700 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed text-xs sm:text-base whitespace-nowrap"
                                    disabled={isRefreshing}
                                >
                                    {isRefreshing ? 'Bloqueando...' : (
                                        <>
                                            <LuBan class="w-6 h-6" />
                                            Bloquear
                                        </>
                                    )}
                                </button>
                            ) : (
                                <button
                                    onClick$={() => onBan(false)}
                                    data-no-loader="true"
                                    class="flex-1 bg-white border-2 border-[#4a2e85] text-[#4a2e85] font-bold py-4 rounded-xl hover:bg-violet-50 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed text-xs sm:text-base whitespace-nowrap"
                                    disabled={isRefreshing}
                                >
                                    {isRefreshing ? 'Desbloqueando...' : (
                                        <>
                                            <LuShieldCheck class="w-6 h-6" />
                                            Desbloquear
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
});

export default component$(() => {
    const data = useAdminData();
    const filter = useSignal<'all' | 'owner' | 'caregiver'>('all');
    const verifyFilter = useSignal<'all' | 'verified' | 'unverified'>('all');
    const search = useSignal('');
    const dateFrom = useSignal('');
    const dateTo = useSignal('');
    const sortBy = useSignal<'date-desc' | 'date-asc' | 'name-asc' | 'name-desc'>('date-desc');
    const bankFilter = useSignal<'all' | 'with-bank' | 'without-bank'>('all');

    const selectedUser = useSignal<AdminUserRecord | null>(null);
    const detailedUser = useSignal<AdminUserDetail | null>(null);
    const isRefreshing = useSignal(false);
    const isLoadingDetail = useSignal(false);

    const handleUserClick = $(async (user: AdminUserRecord) => {
        selectedUser.value = user;
        isLoadingDetail.value = true;
        const detail = await loadFullDetail(user.userId, user.role);
        detailedUser.value = detail;
        isLoadingDetail.value = false;
    });

    const filtered = useComputed$(() => {
        let list = data.value.registrations;

        // Role filter
        if (filter.value !== 'all') {
            list = list.filter(u => u.role === filter.value);
        }

        // Verification filter
        if (verifyFilter.value !== 'all') {
            const isV = verifyFilter.value === 'verified';
            list = list.filter(u => u.isVerified === isV);
        }

        // Bank filter
        if (bankFilter.value !== 'all') {
            if (bankFilter.value === 'with-bank') {
                list = list.filter(u => u.bank !== undefined && u.bank !== null);
            } else {
                list = list.filter(u => !u.bank);
            }
        }

        // Date range filter
        if (dateFrom.value) {
            const fromDate = new Date(dateFrom.value);
            list = list.filter(u => new Date(u.createdAt) >= fromDate);
        }
        if (dateTo.value) {
            const toDate = new Date(dateTo.value);
            toDate.setHours(23, 59, 59, 999); // Include entire day
            list = list.filter(u => new Date(u.createdAt) <= toDate);
        }

        // Search filter
        if (search.value) {
            const s = search.value.toLowerCase();
            list = list.filter(u =>
                u.name.toLowerCase().includes(s) ||
                u.email.toLowerCase().includes(s) ||
                u.userId.toLowerCase().includes(s)
            );
        }

        // Sort
        list = [...list].sort((a, b) => {
            switch (sortBy.value) {
                case 'date-desc':
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                case 'date-asc':
                    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                case 'name-asc':
                    return a.name.localeCompare(b.name);
                case 'name-desc':
                    return b.name.localeCompare(a.name);
                default:
                    return 0;
            }
        });

        return list;
    });

    const handleExport = $(() => {
        // Export only filtered results
        const csvContent = "data:text/csv;charset=utf-8,"
            + "User ID,Name,Email,Role,Status,Date\n"
            + filtered.value.map(u => {
                return `${u.userId},"${u.name}",${u.email},${u.role},${u.verifiedLabel},${new Date(u.createdAt).toLocaleDateString()}`;
            }).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `acupatas_users_filtered_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    const handleVerify = $(async (user: AdminUserRecord, verified: boolean) => {
        isRefreshing.value = true;
        const res = await verifyAction(user.userId, user.role, verified);
        if (res.ok) {
            window.location.reload();
        } else {
            isRefreshing.value = false;
            alert('Error al verificar: ' + ((res as any).reason || 'desconocido'));
        }
    });

    const handleBan = $(async (user: AdminUserRecord, isBan: boolean) => {
        isRefreshing.value = true;
        const res = await banAction(user.userId, isBan);
        if (res.ok) {
            window.location.reload();
        } else {
            isRefreshing.value = false;
            alert('Error al gestionar baneo: ' + ((res as any).reason || 'desconocido'));
        }
    });

    return (
        <div class="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8" data-vt="admin-panel-page">
            <header class="flex flex-col sm:flex-row sm:items-center justify-between gap-4" data-vt="admin-panel-header">
                <div>
                    <h1 class="text-3xl font-extrabold text-[#4a2e85] flex items-center gap-2">
                        <LuShieldCheck class="w-8 h-8 text-[#ef7c43]" />
                        Panel de Verificación Admin
                    </h1>
                    <p class="text-[#4a2e85b3]">Gestiona y verifica la autenticidad de los usuarios y cuidadores.</p>
                </div>
                <Link
                    href="/dashboard/admin/comisiones"
                    class="px-4 py-2.5 rounded-xl bg-[#4a2e85] text-white font-semibold hover:bg-[#3a2369] transition-colors"
                >
                    Ver comisiones
                </Link>
            </header>

            {/* Filtros */}
            <div class="bg-white/80 backdrop-blur rounded-2xl border border-[#4a2e85]/10 shadow-xl p-6 space-y-4" data-vt="admin-panel-filters">
                {/* Primera fila: Búsqueda y filtros principales */}
                <div class="grid md:grid-cols-[1fr,auto,auto] gap-4 items-center">
                    <input
                        type="text"
                        placeholder="Buscar por nombre, email o ID..."
                        class="w-full px-4 py-2.5 rounded-xl border border-[#4a2e85]/20 focus:outline-none focus:ring-2 focus:ring-[#ef7c43]"
                        onInput$={(e) => (search.value = (e.target as HTMLInputElement).value)}
                    />

                    <div class="flex gap-2">
                        {(['all', 'owner', 'caregiver'] as const).map((f) => (
                            <button
                                key={f}
                                onClick$={() => (filter.value = f)}
                                class={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${filter.value === f
                                    ? 'bg-[#4a2e85] text-white shadow-md'
                                    : 'bg-[#4a2e85]/5 text-[#4a2e85] hover:bg-[#4a2e85]/10'
                                    }`}
                            >
                                {f === 'all' ? 'Todos' : f === 'owner' ? 'Dueños' : 'Cuidadores'}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick$={handleExport}
                        class="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl shadow-lg hover:shadow-emerald-500/20 transition-all flex items-center gap-2"
                    >
                        <LuFileText class="w-5 h-5" />
                        Exportar
                    </button>
                </div>

                {/* Segunda fila: Filtros avanzados */}
                <div class="grid md:grid-cols-5 gap-3">
                    <select
                        class="px-4 py-2.5 rounded-xl border border-[#4a2e85]/20 focus:outline-none focus:ring-2 focus:ring-[#ef7c43] bg-white text-[#4a2e85] text-sm"
                        onChange$={(e) => (verifyFilter.value = (e.target as HTMLInputElement).value as any)}
                    >
                        <option value="all">✓ Todos los estados</option>
                        <option value="verified">✓ Verificados</option>
                        <option value="unverified">✗ No Verificados</option>
                    </select>

                    <select
                        class="px-4 py-2.5 rounded-xl border border-[#4a2e85]/20 focus:outline-none focus:ring-2 focus:ring-[#ef7c43] bg-white text-[#4a2e85] text-sm"
                        onChange$={(e) => (bankFilter.value = (e.target as HTMLInputElement).value as any)}
                    >
                        <option value="all">💳 Datos bancarios</option>
                        <option value="with-bank">💳 Con datos</option>
                        <option value="without-bank">💳 Sin datos</option>
                    </select>

                    <div class="space-y-1">
                        <label class="text-xs font-semibold text-[#4a2e85] px-1">Desde:</label>
                        <input
                            type="date"
                            class="w-full px-4 py-2.5 rounded-xl border border-[#4a2e85]/20 focus:outline-none focus:ring-2 focus:ring-[#ef7c43] text-sm"
                            onInput$={(e) => (dateFrom.value = (e.target as HTMLInputElement).value)}
                        />
                    </div>

                    <div class="space-y-1">
                        <label class="text-xs font-semibold text-[#4a2e85] px-1">Hasta:</label>
                        <input
                            type="date"
                            class="w-full px-4 py-2.5 rounded-xl border border-[#4a2e85]/20 focus:outline-none focus:ring-2 focus:ring-[#ef7c43] text-sm"
                            onInput$={(e) => (dateTo.value = (e.target as HTMLInputElement).value)}
                        />
                    </div>

                    <select
                        class="px-4 py-2.5 rounded-xl border border-[#4a2e85]/20 focus:outline-none focus:ring-2 focus:ring-[#ef7c43] bg-white text-[#4a2e85] text-sm"
                        onChange$={(e) => (sortBy.value = (e.target as HTMLInputElement).value as any)}
                    >
                        <option value="date-desc">📅 Más recientes</option>
                        <option value="date-asc">📅 Más antiguos</option>
                        <option value="name-asc">🔤 Nombre A-Z</option>
                        <option value="name-desc">🔤 Nombre Z-A</option>
                    </select>
                </div>

                {/* Contador de resultados */}
                <div class="flex items-center justify-between pt-2 border-t border-[#4a2e85]/10">
                    <p class="text-sm text-[#4a2e85b3]">
                        Mostrando <span class="font-bold text-[#4a2e85]">{filtered.value.length}</span> de <span class="font-bold text-[#4a2e85]">{data.value.registrations.length}</span> usuarios
                    </p>
                    {(search.value || filter.value !== 'all' || verifyFilter.value !== 'all' || bankFilter.value !== 'all' || dateFrom.value || dateTo.value) && (
                        <button
                            onClick$={() => {
                                search.value = '';
                                filter.value = 'all';
                                verifyFilter.value = 'all';
                                bankFilter.value = 'all';
                                dateFrom.value = '';
                                dateTo.value = '';
                                sortBy.value = 'date-desc';
                            }}
                            class="text-sm text-[#ef7c43] hover:text-[#4a2e85] font-semibold transition-colors"
                        >
                            Limpiar filtros
                        </button>
                    )}
                </div>
            </div>

            <div class="space-y-8">
                {/* Tabla / Lista */}
                <div class="bg-white/80 backdrop-blur rounded-2xl border border-[#4a2e85]/10 shadow-xl overflow-hidden" data-vt="admin-panel-table">
                    <div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="bg-[#4a2e85]/5 border-b border-[#4a2e85]/10">
                                    <th class="px-6 py-4 text-sm font-bold text-[#4a2e85]">Usuario</th>
                                    <th class="px-6 py-4 text-sm font-bold text-[#4a2e85]">Rol</th>
                                    <th class="px-6 py-4 text-sm font-bold text-[#4a2e85]">Estado</th>
                                    <th class="px-6 py-4 text-sm font-bold text-[#4a2e85]">Fecha</th>
                                    <th class="px-6 py-4 text-sm font-bold text-[#4a2e85] text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-[#4a2e85]/5">
                                {filtered.value.map((u) => (
                                    <tr
                                        key={u.userId}
                                        class={`hover:bg-[#4a2e85]/5 transition-colors cursor-pointer ${selectedUser.value?.userId === u.userId ? 'bg-[#ef7c43]/10' : ''}`}
                                        onClick$={() => handleUserClick(u)}
                                    >
                                        <td class="px-6 py-4">
                                            <div class="flex items-center gap-3">
                                                <div class="w-10 h-10 rounded-full bg-gradient-to-br from-[#f6e527] to-[#ef7c43] flex items-center justify-center text-white font-bold">
                                                    {u.name[0]}
                                                </div>
                                                <div>
                                                    <p class="font-bold text-[#4a2e85]">{u.name}</p>
                                                    <p class="text-xs text-[#4a2e85b3]">{u.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="px-6 py-4">
                                            <span class={`text-xs px-2 py-1 rounded-full font-bold uppercase tracking-wider ${u.role === 'caregiver' ? 'bg-[#4a2e85]/10 text-[#4a2e85]' : 'bg-[#ef7c43]/10 text-[#ef7c43]'
                                                }`}>
                                                {u.role === 'caregiver' ? 'Cuidador' : 'Dueño'}
                                            </span>
                                        </td>
                                        <td class="px-6 py-4">
                                            <div class="flex items-center gap-2">
                                                {u.isBanned ? (
                                                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 text-xs font-bold shadow-sm">
                                                        <LuBan class="w-3.5 h-3.5" />
                                                        Baneado
                                                    </span>
                                                ) : u.isVerified ? (
                                                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold shadow-sm">
                                                        <LuCheckCircle2 class="w-3.5 h-3.5" />
                                                        {u.verifiedLabel}
                                                    </span>
                                                ) : (
                                                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold shadow-sm">
                                                        <LuBan class="w-3.5 h-3.5" />
                                                        {u.verifiedLabel}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td class="px-6 py-4 text-sm text-[#4a2e85b3]">
                                            {new Date(u.createdAt).toLocaleDateString()}
                                        </td>
                                        <td class="px-6 py-4 text-right">
                                            <button class="p-2 hover:bg-[#4a2e85]/10 rounded-lg text-[#4a2e85] transition-all">
                                                <LuEye class="w-5 h-5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Loader mientras se carga el modal */}
            {isLoadingDetail.value && (
                <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div class="bg-white rounded-3xl p-12 flex flex-col items-center justify-center space-y-4 shadow-2xl">
                        <p class="text-[#4a2e85] font-bold text-lg">Cargando expediente completo...</p>
                    </div>
                </div>
            )}

            {/* Modal de detalles completos */}
            {detailedUser.value && selectedUser.value && (
                <DetailModal
                    user={detailedUser.value}
                    onClose={$(() => {
                        detailedUser.value = null;
                        selectedUser.value = null;
                    })}
                    onVerify={$((verified: boolean) => handleVerify(selectedUser.value!, verified))}
                    onBan={$((isBan: boolean) => handleBan(selectedUser.value!, isBan))}
                    isRefreshing={isRefreshing.value}
                />
            )}
        </div>
    );
});
