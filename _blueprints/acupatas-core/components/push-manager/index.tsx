import { component$, useSignal, useVisibleTask$, $ } from '@builder.io/qwik';
import { LuBell, LuBellOff } from '@qwikest/icons/lucide';

const PUBLIC_VAPID_KEY = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEcBBFaxOemoYhCr1Vo-JHaYh8st4i2OrGXWRbHFMRwIWJIISNqmUfCXJXIwyLLkqPSbaSOjcwvk9AvJ1YruwlTQ';

const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
};

export const PushManager = component$(() => {
    const isSubscribed = useSignal(false);
    const isSupported = useSignal(false);
    const isLoading = useSignal(true);
    const permission = useSignal<NotificationPermission>('default');

    const updateSubscriptionOnServer = $(async (subscription: PushSubscription | null) => {
        if (!subscription) return;

        const response = await fetch('/api/v1/push/subscribe/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(subscription),
        });

        if (!response.ok) {
            throw new Error('Failed to update subscription on server');
        }
    });

    const subscribeUser = $(async () => {
        try {
            const swReg = await navigator.serviceWorker.ready;
            const subscription = await swReg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
            });

            console.log('User is subscribed:', subscription);
            await updateSubscriptionOnServer(subscription);
            isSubscribed.value = true;
        } catch (err) {
            console.error('Failed to subscribe the user: ', err);
        }
    });

    const unsubscribeUser = $(async () => {
        try {
            const swReg = await navigator.serviceWorker.ready;
            const subscription = await swReg.pushManager.getSubscription();
            if (subscription) {
                await subscription.unsubscribe();
                // Optionally notify server
                isSubscribed.value = false;
            }
        } catch (err) {
            console.error('Error unsubscribing', err);
        }
    });

    const togglePush = $(async () => {
        if (isSubscribed.value) {
            await unsubscribeUser();
        } else {
            const result = await Notification.requestPermission();
            permission.value = result;
            if (result === 'granted') {
                await subscribeUser();
            }
        }
    });

    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(async () => {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            isSupported.value = true;
            permission.value = Notification.permission;

            const swReg = await navigator.serviceWorker.ready;
            const subscription = await swReg.pushManager.getSubscription();
            isSubscribed.value = !!subscription;

            // If already subscribed, ensure server has it (refresh)
            if (subscription) {
                await updateSubscriptionOnServer(subscription);
            }
        }
        isLoading.value = false;
    });

    if (!isSupported.value || isLoading.value) return null;

    return (
        <div class="fixed bottom-24 right-4 z-50">
            <button
                onClick$={togglePush}
                title={isSubscribed.value ? "Desactivar notificaciones" : "Activar notificaciones"}
                class={`w-12 h-12 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 hover:scale-110 active:scale-95 ${isSubscribed.value
                        ? "bg-green-500 text-white"
                        : "bg-white text-gray-600 hover:text-[#ef7c43]"
                    }`}
            >
                {isSubscribed.value ? (
                    <LuBell class="w-6 h-6 animate-pulse" />
                ) : (
                    <LuBellOff class="w-6 h-6" />
                )}

                {/* Status Dot */}
                <div class={`absolute top-0 right-0 w-3 h-3 rounded-full border-2 border-white ${permission.value === 'granted' ? 'bg-green-500' : 'bg-red-400'
                    }`}></div>
            </button>

            {/* Tooltip hint for iOS users if needed */}
            {permission.value === 'default' && !isSubscribed.value && (
                <div class="absolute bottom-14 right-0 bg-white p-3 rounded-xl shadow-xl w-48 text-xs text-center border animate-bounce">
                    ¡Activa las notificaciones para no perderte nada! 🐾
                </div>
            )}
        </div>
    );
});
