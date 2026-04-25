import type { RequestHandler } from '@builder.io/qwik-city';
import { buscarPago } from '../../../../../lib/services';
import { ensureAuthSchema, getSessionFromEvent, getUserById } from '../../../../../lib/auth';

export const onGet: RequestHandler = async (event) => {
    const { params, json, request, env } = event;
    await ensureAuthSchema();

    const session = await getSessionFromEvent(event);
    const user = session ? await getUserById(session.userId) : null;
    const isAdmin = (user?.email || '').trim().toLowerCase() === 'admin@gmail.com';

    const botApiKey = request.headers.get('x-api-key') || '';
    const walletBotKey = String(
        env.get('BDV_KEY') ||
        env.get('BDV_API_KEY') ||
        env.get('PRIVATE_WALLET_BOT_API_KEY') ||
        env.get('BDV_API_KEY_QA') ||
        ''
    ).trim();
    const botAllowed = Boolean(walletBotKey) && botApiKey === walletBotKey;

    if (!isAdmin && !botAllowed) {
        json(401, { status: 'error', message: 'Unauthorized' });
        return;
    }

    const referencia = params.ref;

    if (!referencia) {
        json(400, { status: "error", message: "Missing reference" });
        return;
    }

    const pago = await buscarPago(referencia);

    if (!pago) {
        json(404, {
            status: "no_encontrado"
        });
        return;
    }

    json(200, {
        status: "pagado",
        monto: pago.amount,
        fecha: pago.date,
        id: pago.id
    });
};
