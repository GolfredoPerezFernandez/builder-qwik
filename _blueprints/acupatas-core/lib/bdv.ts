export interface BdvReconciliationRequest {
    cedulaPagador: string;
    telefonoPagador: string;
    telefonoDestino: string;
    referencia: string;
    fechaPago: string;
    importe: string;
    bancoOrigen: string;
    reqCed: boolean;
}

export interface BdvReconciliationResponse {
    code: number;
    message: string;
    data: {
        status: string;
        amount: string;
        reason: string;
        referencia: string;
    } | null;
    status: number;
}

export interface BdvRuntimeConfig {
    apiKey: string;
    endpoint?: string;
}

const BANK_CODES: Record<string, string> = {
    'BANCO DE VENEZUELA': '0102',
    'BANCO MERCANTIL': '0105',
    'BANCO PROVINCIAL': '0108',
    'BANESCO': '0134',
    'BNC': '0128',
    'BANCAMIGA': '0172',
    'BANCO DEL TESORO': '0163',
    'BANCO BICENTENARIO': '0175',
    'BFC': '0151',
    'BANPLUS': '0174',
    'BANCO EXTERIOR': '0115',
    'BANCO CARONI': '0128', // Mapping name variants if needed
};

export const getBankCode = (bankName: string): string => {
    const normalized = (bankName || '').toUpperCase().trim();

    // Try exact match
    if (BANK_CODES[normalized]) return BANK_CODES[normalized];

    // Try partial match for common names
    if (normalized.includes('VENEZUELA')) return '0102';
    if (normalized.includes('MERCANTIL')) return '0105';
    if (normalized.includes('PROVINCIAL')) return '0108';
    if (normalized.includes('BANESCO')) return '0134';
    if (normalized.includes('BNC') || normalized.includes('NACIONAL DE CREDITO')) return '0128';
    if (normalized.includes('BANCAMIGA')) return '0172';

    // Default to 0102 if it looks like BDV, otherwise first 4 digits if provided in name
    const match = normalized.match(/^\d{4}/);
    if (match) return match[0];

    return '0102'; // Fallback to BDV as common case
};

export const verifyBdvMovement = async (
    payload: BdvReconciliationRequest,
    config: BdvRuntimeConfig,
): Promise<BdvReconciliationResponse> => {
    const apiKey = String(config.apiKey || '').trim();
    const endpoint = String(config.endpoint || 'https://bdvconciliacion.banvenez.com/getMovement').trim();

    if (!apiKey) {
        return {
            code: 1010,
            message: 'BDV API key no configurada en el servidor',
            data: null,
            status: 500,
        };
    }

    console.log('[BDV API] Requesting verification:', {
        ...payload,
        apiKey: apiKey.slice(0, 4) + '...' + apiKey.slice(-4),
    });

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey,
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[BDV API] Error response:', response.status, errorText);
            return {
                code: 1010,
                message: `HTTP Error ${response.status}: ${errorText}`,
                data: null,
                status: response.status,
            };
        }

        const result = (await response.json()) as BdvReconciliationResponse;
        console.log('[BDV API] Result:', result);
        return result;
    } catch (error) {
        console.error('[BDV API] Fetch error:', error);
        return {
            code: 1010,
            message: error instanceof Error ? error.message : 'Unknown network error',
            data: null,
            status: 500,
        };
    }
};
