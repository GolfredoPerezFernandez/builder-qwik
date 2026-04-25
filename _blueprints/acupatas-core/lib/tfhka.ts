// src/lib/tfhka.ts

interface TfhkaAuthResponse {
    Token: string;
    Expiracion: string;
}

interface TfhkaEmissionResponse {
    Codigo: string;
    Mensaje: string;
    Resultado?: {
        NumeroDocumento: string;
        NumeroControl: string;
        TransaccionId: string;
    };
}

const getEnv = (key: string, defaultValue: string = ''): string => {
    if (typeof process !== 'undefined' && process.env[key]) return process.env[key] as string;
    return defaultValue;
};

const API_URL = getEnv('TFHKA_API_URL', 'https://emisionv2.thefactoryhka.com.ve/');
const USER = getEnv('TFHKA_USER');
const PASSWORD = getEnv('TFHKA_PASSWORD');
const SERIE = getEnv('TFHKA_SERIE', '');
const UNIT = getEnv('TFHKA_UNIT', 'UN');
const TIPO_DOC = getEnv('TFHKA_TIPO_DOCUMENTO', '01');

// Hardcoded for now as per user request
const EXCHANGE_RATE = 400;

/**
 * Authenticates with TFHKA and returns a JWT token.
 * Tokens are typically valid for 12 hours.
 */
export async function authenticateTfhka(): Promise<string | null> {
    if (!USER || !PASSWORD) {
        console.error('[TFHKA] Missing credentials (TFHKA_USER/TFHKA_PASSWORD)');
        return null;
    }

    try {
        const response = await fetch(`${API_URL}api/Autenticacion`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario: USER, clave: PASSWORD }),
        });

        if (!response.ok) {
            console.error('[TFHKA] Auth failed:', response.status, await response.text());
            return null;
        }

        const data = await response.json() as TfhkaAuthResponse;
        return data.Token;
    } catch (error) {
        console.error('[TFHKA] Auth error:', error);
        return null;
    }
}

/**
 * Issues an electronic invoice via TFHKA.
 */
export async function emitInvoice(payload: any, token: string): Promise<TfhkaEmissionResponse | null> {
    try {
        const response = await fetch(`${API_URL}api/Emision`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
        });

        const data = await response.json() as TfhkaEmissionResponse;
        return data;
    } catch (error) {
        console.error('[TFHKA] Emission error:', error);
        return null;
    }
}

/**
 * Helper to build the DocumentoElectronico payload for a commission fee.
 */
export function buildCommissionInvoicePayload(params: {
    bookingId: string,
    owner: {
        fullName: string,
        cedula: string,
        address: string,
        email: string,
        phone: string,
    },
    amountUsd: number,
}) {
    const { bookingId, owner, amountUsd } = params;

    const rate = EXCHANGE_RATE;

    // Split Cedula/RIF
    const tipoIdentificacion = owner.cedula.charAt(0).toUpperCase() || 'V';
    const numeroIdentificacion = owner.cedula.replace(/\D/g, '') || '0';

    const now = new Date();
    // Format DD/MM/YYYY
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const fechaEmision = `${day}/${month}/${year}`;

    // Format HH:MM:SS am/pm
    const hours24 = now.getHours();
    const ampm = hours24 >= 12 ? 'pm' : 'am';
    const hours12 = hours24 % 12 || 12;
    const hh = String(hours12).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const horaEmision = `${hh}:${mm}:${ss} ${ampm}`;

    // Amounts in USD
    const taxRate = 16.0;
    const commissionUsd = Number(amountUsd.toFixed(2));
    const taxUsd = Number((commissionUsd * (taxRate / 100)).toFixed(2));
    const totalUsd = Number((commissionUsd + taxUsd).toFixed(2));

    // Amounts in VES (BSD)
    const commissionVes = Number((commissionUsd * rate).toFixed(2));
    const taxVes = Number((taxUsd * rate).toFixed(2));
    const totalVes = Number((totalUsd * rate).toFixed(2));

    return {
        documentoElectronico: {
            Encabezado: {
                IdentificacionDocumento: {
                    TipoDocumento: TIPO_DOC,
                    NumeroDocumento: '',
                    TipoTransaccion: '01',
                    FechaEmision: fechaEmision,
                    HoraEmision: horaEmision,
                    TipoDePago: 'Inmediato',
                    Serie: SERIE,
                    TipoDeVenta: 'Interna',
                    Moneda: 'BSD',
                    TransaccionId: bookingId,
                },
                Comprador: {
                    TipoIdentificacion: tipoIdentificacion,
                    NumeroIdentificacion: numeroIdentificacion,
                    RazonSocial: owner.fullName,
                    Direccion: owner.address || 'Caracas, Venezuela',
                    Pais: 'VE',
                    Telefono: [owner.phone || '04000000000'],
                    Correo: [owner.email],
                },
                Totales: {
                    NroItems: '1',
                    MontoGravadoTotal: commissionVes.toFixed(2),
                    Subtotal: commissionVes.toFixed(2),
                    TotalIVA: taxVes.toFixed(2),
                    MontoTotalConIVA: totalVes.toFixed(2),
                    TotalAPagar: totalVes.toFixed(2),
                    MontoEnLetras: '', // Optional/Can stay empty
                    ImpuestosSubtotal: [
                        {
                            CodigoTotalImp: 'G',
                            AlicuotaImp: taxRate.toFixed(2),
                            BaseImponibleImp: commissionVes.toFixed(2),
                            ValorTotalImp: taxVes.toFixed(2),
                        }
                    ],
                    FormasPago: [
                        {
                            Descripcion: 'Transferencia/Otro',
                            Fecha: fechaEmision,
                            Forma: '05',
                            Monto: totalVes.toFixed(2),
                            Moneda: 'BSD',
                            TipoCambio: '0.0000'
                        }
                    ]
                },
                TotalesOtraMoneda: {
                    Moneda: 'USD',
                    TipoCambio: rate.toFixed(4),
                    MontoGravadoTotal: commissionUsd.toFixed(2),
                    Subtotal: commissionUsd.toFixed(2),
                    TotalIVA: taxUsd.toFixed(2),
                    MontoTotalConIVA: totalUsd.toFixed(2),
                    TotalAPagar: totalUsd.toFixed(2),
                    ImpuestosSubtotal: [
                        {
                            CodigoTotalImp: 'G',
                            AlicuotaImp: taxRate.toFixed(2),
                            BaseImponibleImp: commissionUsd.toFixed(2),
                            ValorTotalImp: taxUsd.toFixed(2),
                        }
                    ]
                }
            },
            DetallesItems: [
                {
                    NumeroLinea: '1',
                    IndicadorBienoServicio: '2', // Servicio
                    Descripcion: `Comisión de Servicio Acupatas - Reserva #${bookingId}`,
                    Cantidad: '1.00',
                    UnidadMedida: UNIT,
                    PrecioUnitario: commissionVes.toFixed(2),
                    PrecioItem: commissionVes.toFixed(2),
                    CodigoImpuesto: 'G',
                    TasaIVA: taxRate.toFixed(0),
                    ValorIVA: taxVes.toFixed(2),
                    ValorTotalItem: totalVes.toFixed(2),
                }
            ]
        }
    };
}
