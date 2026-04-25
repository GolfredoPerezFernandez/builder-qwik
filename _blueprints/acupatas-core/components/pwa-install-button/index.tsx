import { component$, useSignal, useVisibleTask$, $ } from '@builder.io/qwik';
import { LuDownload } from '@qwikest/icons/lucide';

// Reusable hook to detect if the app is already installed
export const useIsStandalone = () => {
    const isStandalone = useSignal(true); // Default to true to prevent flash of banner
    useVisibleTask$(() => {
        isStandalone.value = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in window.navigator && (window.navigator as any).standalone);
    });
    return isStandalone;
};

export const PWAInstallButton = component$(() => {
    const showButton = useSignal(false);
    const deferredPrompt = useSignal<any>(null);
    const isIOS = useSignal(false);
    const isStandalone = useSignal(false);
    const showIOSGuide = useSignal(false);

    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(({ cleanup }) => {
        // Check if we are on iOS
        const ua = window.navigator.userAgent.toLowerCase();
        const iosDevice = /iphone|ipad|ipod/.test(ua);
        isIOS.value = iosDevice;

        // Check if already installed (standalone mode)
        const standalone = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in window.navigator && (window.navigator as any).standalone);
        isStandalone.value = !!standalone;

        // If it's iOS and NOT installed, show the button to trigger the guide
        if (iosDevice && !standalone) {
            showButton.value = true;
        }

        const handler = (e: any) => {
            // Prevent the mini-infobar from appearing on mobile
            e.preventDefault();
            // Stash the event so it can be triggered later.
            deferredPrompt.value = e;
            // Update UI notify the user they can install the PWA (Android/Chrome)
            showButton.value = true;
            // Make prompt universally available
            (window as any).deferredPWAInstallPrompt = e;
        };

        window.addEventListener('beforeinstallprompt', handler);

        cleanup(() => {
            window.removeEventListener('beforeinstallprompt', handler);
        });
    });

    const handleInstallClick = $(async () => {
        if (isIOS.value && !isStandalone.value) {
            // Show iOS specific instruction guide
            showIOSGuide.value = true;
            return;
        }

        const promptEvent = deferredPrompt.value || (window as any).deferredPWAInstallPrompt;

        if (!promptEvent) {
            alert('Tu navegador ya instaló la app o no soporta instalación automática. Intenta buscar la opción "Instalar App" en el menú de tu navegador.');
            return;
        }

        // Show the install prompt
        promptEvent.prompt();

        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.value.userChoice;

        console.log(`User response to the install prompt: ${outcome}`);

        // We've used the prompt, so verify it can't be used again
        deferredPrompt.value = null;
        showButton.value = false;
    });

    if (!showButton.value || isStandalone.value) return null;

    return (
        <>
            <button
                id="pwa-install-button-trigger"
                onClick$={handleInstallClick}
                class="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-5 py-3 rounded-full bg-[#4a2e85] text-white font-bold shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all animate-bounce-in"
            >
                <LuDownload class="w-5 h-5" />
                <span>Instalar App</span>
            </button>

            {/* iOS Installation Guide Modal */}
            {showIOSGuide.value && (
                <div class="fixed inset-0 z-[60] flex items-end justify-center sm:items-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div class="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl relative animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300">
                        <button
                            onClick$={() => showIOSGuide.value = false}
                            class="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 bg-gray-50 rounded-full"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>

                        <div class="text-center mb-6">
                            <div class="w-16 h-16 bg-[#f7f3ff] rounded-2xl mx-auto flex items-center justify-center mb-4">
                                <LuDownload class="w-8 h-8 text-[#4a2e85]" />
                            </div>
                            <h3 class="text-xl font-bold text-[#4a2e85] mb-2">Instalar ACUPATAS</h3>
                            <p class="text-sm text-gray-600">Instala nuestra App en tu iPhone para una experiencia más rápida y pantalla completa.</p>
                        </div>

                        <div class="space-y-4 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                            <div class="flex items-center gap-4">
                                <div class="w-8 h-8 bg-white shadow-sm rounded-full flex items-center justify-center text-[#4a2e85] shrink-0 font-bold">1</div>
                                <p class="text-sm text-gray-700">Toca el ícono <b>Compartir</b> en la barra inferior de Safari.</p>
                                <svg class="w-6 h-6 text-blue-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
                            </div>
                            <div class="flex items-center gap-4">
                                <div class="w-8 h-8 bg-white shadow-sm rounded-full flex items-center justify-center text-[#4a2e85] shrink-0 font-bold">2</div>
                                <p class="text-sm text-gray-700">Desliza hacia abajo y selecciona <b>"Agregar a Inicio"</b>.</p>
                                <svg class="w-6 h-6 text-gray-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
                            </div>
                        </div>

                        <button
                            onClick$={() => showIOSGuide.value = false}
                            class="w-full mt-6 py-3 bg-[#4a2e85] text-white font-bold rounded-xl hover:bg-[#382266] transition-colors"
                        >
                            Entendido
                        </button>
                    </div>
                </div>
            )}
        </>
    );
});
