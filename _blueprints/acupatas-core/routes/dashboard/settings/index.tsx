import { component$, useSignal, $ } from '@builder.io/qwik';
import { routeLoader$, server$, useNavigate, type DocumentHead } from '@builder.io/qwik-city';
import { getSessionFromEvent, getUserRoleById, switchUserRole } from '../../../lib/auth';
import { LuSettings, LuBell, LuUser, LuLogOut, LuMoon, LuArrowRightLeft } from '@qwikest/icons/lucide';

export const useSettingsData = routeLoader$(async (event) => {
    const session = await getSessionFromEvent(event);
    if (!session) throw event.redirect(302, '/auth?mode=login');

    const role = await getUserRoleById(session.userId);
    return {
        userId: session.userId,
        role: role || 'owner'
    };
});

const logoutServer = server$(async function () {
    const event = this;
    event.cookie.delete('session_id', { path: '/' });
    return { ok: true };
});

const switchRoleServer = server$(async function (target: 'owner' | 'caregiver') {
    const session = await getSessionFromEvent(this);
    if (!session) return { ok: false };
    await switchUserRole(session.userId, target);
    return { ok: true };
});

export default component$(() => {
    const data = useSettingsData();
    const nav = useNavigate();
    const loading = useSignal(false);

    const handleLogout = $(async () => {
        loading.value = true;
        await logoutServer();
        await nav('/');
        loading.value = false;

    });

    const handleSwitchRole = $(async () => {
        const target = data.value.role === 'owner' ? 'caregiver' : 'owner';
        loading.value = true;
        await switchRoleServer(target);
        window.location.href = target === 'caregiver' ? '/dashboard/caregiver' : '/dashboard/owner';
    });

    return (
        <div class="min-h-screen bg-[#f6f6f6]">
            <div class="max-w-4xl mx-auto px-4 py-8 space-y-8">
                <header>
                    <h1 class="text-2xl font-bold text-[#4a2e85]">Configuración</h1>
                    <p class="text-sm text-gray-600">Administra tus preferencias y cuenta</p>
                </header>

                <div class="grid gap-6">
                    {/* Perfil */}
                    <section class="bg-white rounded-2xl p-6 border border-[#4a2e85]/10 shadow-sm">
                        <div class="flex items-center gap-3 mb-6">
                            <div class="p-2 bg-[#e0e7ff] text-[#4338ca] rounded-lg">
                                <LuUser class="w-5 h-5" />
                            </div>
                            <h2 class="text-lg font-semibold text-gray-800">Cuenta</h2>
                        </div>

                        <div class="space-y-4">
                            <div class="flex items-center justify-between py-3 border-b border-gray-100">
                                <div>
                                    <div class="font-medium text-gray-700">Editar Perfil</div>
                                    <div class="text-sm text-gray-500">Actualiza tu foto y biografía</div>
                                </div>
                                <button
                                    class="px-4 py-2 text-sm text-[#4a2e85] bg-[#f5f3ff] rounded-lg hover:bg-[#ede9fe]"
                                    onClick$={() => nav(data.value.role === 'caregiver' ? `/dashboard/caregiver` : `/dashboard/owner`)}
                                >
                                    Editar
                                </button>
                            </div>

                            <div class="flex items-center justify-between py-3 border-b border-gray-100">
                                <div>
                                    <div class="font-medium text-gray-700">Cambiar Contraseña</div>
                                    <div class="text-sm text-gray-500">Mantén tu cuenta segura</div>
                                </div>
                                <button class="px-4 py-2 text-sm text-[#4a2e85] bg-[#f5f3ff] rounded-lg hover:bg-[#ede9fe]">
                                    Actualizar
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* Notificaciones */}
                    <section class="bg-white rounded-2xl p-6 border border-[#4a2e85]/10 shadow-sm">
                        <div class="flex items-center gap-3 mb-6">
                            <div class="p-2 bg-[#fee2e2] text-[#b91c1c] rounded-lg">
                                <LuBell class="w-5 h-5" />
                            </div>
                            <h2 class="text-lg font-semibold text-gray-800">Notificaciones</h2>
                        </div>

                        <div class="space-y-4">
                            <label class="flex items-center justify-between cursor-pointer">
                                <div class="flex-1">
                                    <div class="font-medium text-gray-700">Nuevos mensajes</div>
                                    <div class="text-sm text-gray-500">Recibe alertas cuando te escriban</div>
                                </div>
                                <div class="relative">
                                    <input type="checkbox" class="sr-only peer" checked />
                                    <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#4a2e85]"></div>
                                </div>
                            </label>

                            <label class="flex items-center justify-between cursor-pointer">
                                <div class="flex-1">
                                    <div class="font-medium text-gray-700">Estado de reservas</div>
                                    <div class="text-sm text-gray-500">Alertas sobre cambios en tus servicios</div>
                                </div>
                                <div class="relative">
                                    <input type="checkbox" class="sr-only peer" checked />
                                    <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#4a2e85]"></div>
                                </div>
                            </label>
                        </div>
                    </section>



                    {/* Cambio de Rol */}
                    <section class="bg-white rounded-2xl p-6 border border-[#4a2e85]/10 shadow-sm">
                        <div class="flex items-center gap-3 mb-6">
                            <div class="p-2 bg-[#dcfce7] text-[#15803d] rounded-lg">
                                <LuArrowRightLeft class="w-5 h-5" />
                            </div>
                            <h2 class="text-lg font-semibold text-gray-800">Tipo de Cuenta</h2>
                        </div>

                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <div class="font-medium text-gray-700">
                                    Estás actuando como: <span class="uppercase font-bold text-[#4a2e85]">{data.value.role === 'owner' ? 'Dueño' : 'Cuidador'}</span>
                                </div>
                                <div class="text-sm text-gray-500">
                                    {data.value.role === 'owner'
                                        ? 'Cambia a modo Cuidador para ofrecer servicios.'
                                        : 'Cambia a modo Dueño para buscar cuidadores.'}
                                </div>
                            </div>
                            <button
                                class="px-6 py-3 bg-[#4a2e85] text-white rounded-xl font-medium hover:bg-[#37235f] transition-colors shadow-lg shadow-[#4a2e85]/20 disabled:opacity-50"
                                onClick$={handleSwitchRole}
                                disabled={loading.value}
                            >
                                {loading.value ? 'Cambiando...' : `Cambiar a ${data.value.role === 'owner' ? 'Cuidador' : 'Dueño'}`}
                            </button>
                        </div>
                    </section>

                    {/* Preferencias */}
                    <section class="bg-white rounded-2xl p-6 border border-[#4a2e85]/10 shadow-sm">
                        <div class="flex items-center gap-3 mb-6">
                            <div class="p-2 bg-[#fef3c7] text-[#b45309] rounded-lg">
                                <LuSettings class="w-5 h-5" />
                            </div>
                            <h2 class="text-lg font-semibold text-gray-800">Aplicación</h2>
                        </div>

                        <div class="space-y-4">
                            <div class="flex items-center justify-between py-3">
                                <div class="flex items-center gap-3">
                                    <LuMoon class="w-5 h-5 text-gray-500" />
                                    <div>
                                        <div class="font-medium text-gray-700">Modo Oscuro</div>
                                        <div class="text-sm text-gray-500">Próximamente disponible</div>
                                    </div>
                                </div>
                                <div class="relative">
                                    <input type="checkbox" class="sr-only peer" disabled />
                                    <div class="w-11 h-6 bg-gray-100 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Zona de Peligro */}
                    <section class="bg-white rounded-2xl p-6 border border-red-100 shadow-sm">
                        <div class="flex items-center gap-3 mb-6">
                            <div class="p-2 bg-red-50 text-red-600 rounded-lg">
                                <LuLogOut class="w-5 h-5" />
                            </div>
                            <h2 class="text-lg font-semibold text-gray-800">Sesión</h2>
                        </div>

                        <button
                            class="w-full sm:w-auto px-6 py-3 bg-red-50 text-red-600 rounded-xl font-medium hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
                            onClick$={handleLogout}
                            disabled={loading.value}
                        >
                            {loading.value ? 'Cerrando...' : 'Cerrar Sesión'}
                        </button>
                    </section>
                </div>
            </div>
        </div>
    );
});

export const head: DocumentHead = {
    title: 'Configuración - ACUPATAS',
};
