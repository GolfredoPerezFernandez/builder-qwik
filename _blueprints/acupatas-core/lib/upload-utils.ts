
/**
 * Resolves a potentially relative upload path to a full URL, 
 * using request headers to determine the origin.
 * 
 * Safe for both server and browser (though browser usage might lack 'event' context).
 */
export const resolveUploadUrl = (event: { request: Request; url: URL }, value: string) => {
    if (!value) return value;
    if (value.startsWith('http://') || value.startsWith('https://')) return value;

    // Si ya empieza con /uploads, asumimos que es relativo a la raíz
    const forwardedProto = event.request?.headers?.get('x-forwarded-proto') || event.request?.headers?.get('fly-forwarded-proto');
    const forwardedHost = event.request?.headers?.get('x-forwarded-host') || event.request?.headers?.get('fly-forwarded-host');
    const hostHeader = forwardedHost || event.request?.headers?.get('host');
    const host = hostHeader ? hostHeader.split(',')[0].trim() : '';
    const proto = forwardedProto || event.url?.protocol?.replace(':', '') || 'https';

    // Fallback logic for BASE_URL / ORIGIN
    // @ts-ignore
    const originEnv = typeof process !== 'undefined' ? process.env.ORIGIN : '';
    const baseUrl = originEnv || (host ? proto + '://' + host : (event.url?.origin || ''));

    const path = value.startsWith('/') ? value : '/uploads/' + value;
    return baseUrl + path;
};

export const normalizeImageUrl = (value?: string | null) => {
    if (!value || typeof value !== 'string') return '';

    const trimmed = value.trim();
    if (!trimmed) return '';

    if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
        return trimmed;
    }

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        try {
            const parsed = new URL(trimmed);
            if (parsed.pathname.startsWith('/uploads/')) {
                return `${parsed.pathname}${parsed.search}`;
            }
        } catch {
            return trimmed;
        }
        return trimmed;
    }

    if (trimmed.startsWith('/')) return trimmed;
    if (trimmed.startsWith('uploads/')) return `/${trimmed}`;

    if (!trimmed.includes('/')) return `/uploads/${trimmed}`;

    return `/${trimmed}`;
};
