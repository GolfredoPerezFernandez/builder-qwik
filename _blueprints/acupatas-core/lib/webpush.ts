import webpush from 'web-push';
import { getTursoClient } from './turso';

const publicVapidKey = process.env.PUBLIC_VAPID_KEY || '';
const privateVapidKey = process.env.PRIVATE_VAPID_KEY || '';

if (publicVapidKey && privateVapidKey) {
    webpush.setVapidDetails(
        'mailto:soporte@acupatas.com',
        publicVapidKey,
        privateVapidKey
    );
}

export const sendPushNotificationToUser = async (userId: string, payload: { title: string; body: string; data?: any }) => {
    const client = getTursoClient();
    const result = await client.execute({
        sql: `select endpoint, p256dh, auth from push_subscriptions where user_id = ?`,
        args: [userId]
    });

    const subscriptions = result.rows;
    const sendPromises = subscriptions.map(async (sub: any) => {
        const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
                p256dh: sub.p256dh,
                auth: sub.auth
            }
        };

        try {
            await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
            return { success: true };
        } catch (error: any) {
            console.error(`[Push] Error sending to ${sub.endpoint}:`, error);
            if (error.statusCode === 410 || error.statusCode === 404) {
                // Subscription is no longer valid, remove it
                await client.execute({
                    sql: `delete from push_subscriptions where endpoint = ?`,
                    args: [sub.endpoint]
                });
            }
            return { success: false, error };
        }
    });

    return Promise.all(sendPromises);
};
