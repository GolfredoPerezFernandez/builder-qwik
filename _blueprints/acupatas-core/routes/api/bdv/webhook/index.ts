import type { RequestHandler } from '@builder.io/qwik-city';
import { guardarPago } from '../../../../lib/services';

export const onPost: RequestHandler = async ({ request, json, env }) => {
    try {
        const apiKey = request.headers.get('x-api-key');
        const envApiKey = String(
            env.get('BDV_KEY') ||
            env.get('BDV_API_KEY') ||
            env.get('BDV_API_KEY_QA') ||
            env.get('PRIVATE_WALLET_BOT_API_KEY') ||
            ''
        ).trim();

        // Validate API KEY
        if (!envApiKey || apiKey !== envApiKey) {
            console.warn('[BDV Webhook] Invalid API Key attempt:', apiKey);
            json(200, {
                status: 200,
                codigo: "99",
                mensajeCliente: "Corrija el API KEY",
                mensajeSistema: "Error en API KEY"
            });
            return;
        }

        const body = await request.json();
        console.log("[BDV Webhook] Payload:", body);

        /**
         * Expected body:
         * {
         *   bancoOrdenante, referenciaBancoOrdenante, idCliente, numeroCliente,
         *   idComercio, numeroComercio, fecha, hora, monto
         * }
         */

        await guardarPago(
            {
                referencia: body.referenciaBancoOrdenante,
                monto: Number(body.monto),
                telefono: body.numeroCliente,
                fecha: body.fecha,
            },
            {
                bdvApiKey: env.get('BDV_KEY') || env.get('BDV_API_KEY') || env.get('BDV_API_KEY_QA') || '',
                bdvEndpoint: env.get('BDV_API_ENDPOINT') || env.get('BDV_ENDPOINT') || 'https://bdvconciliacion.banvenez.com/getMovement',
                acupatasRif: env.get('ACUPATAS_RIF') || 'J507903559',
                acupatasPhone: env.get('ACUPATAS_PHONE') || '04147199496',
            }
        );

        json(200, {
            status: 200,
            codigo: "00",
            mensajeCliente: "Aprobado",
            mensajeSistema: "Notificado"
        });
    } catch (err) {
        console.error('[BDV Webhook] Error processing payment:', err);

        json(200, {
            status: 200,
            codigo: "01",
            mensajeCliente: "Pago previamente recibido o error",
            mensajeSistema: "Renotificado/Error"
        });
    }
};
