import { setupServiceWorker } from "@builder.io/qwik-city/service-worker";
import { setupPwa } from "@qwikdev/pwa/sw";

setupServiceWorker();
setupPwa();

const workerSelf = self as unknown as {
	skipWaiting: () => Promise<void>;
	addEventListener: (type: string, listener: (event: MessageEvent) => void) => void;
};

workerSelf.addEventListener("message", (event) => {
	if (event.data?.type === "SKIP_WAITING") {
		void workerSelf.skipWaiting();
	}
});

// Web Push Event Listener
workerSelf.addEventListener("push", (event: any) => {
	if (!event.data) return;

	try {
		const data = event.data.json();
		const options = {
			body: data.body,
			icon: '/favicon-32x32.png',
			badge: '/favicon-32x32.png',
			data: data.data || {},
			vibrate: [100, 50, 100],
		};

		const promise = (self as any).registration.showNotification(data.title, options);
		event.waitUntil(promise);
	} catch (e) {
		console.error("Error showing push notification:", e);
	}
});

// Notification Click Listener
workerSelf.addEventListener("notificationclick", (event: any) => {
	event.notification.close();
	const link = event.notification.data?.link || '/';

	const promise = (self as any).clients.matchAll({ type: 'window', includeUncontrolled: true })
		.then((clientList: any[]) => {
			if (clientList.length > 0) {
				let client = clientList[0];
				for (let i = 0; i < clientList.length; i++) {
					if (clientList[i].focused) {
						client = clientList[i];
					}
				}
				return client.focus().then((c: any) => c.navigate(link));
			}
			return (self as any).clients.openWindow(link);
		});

	event.waitUntil(promise);
});
