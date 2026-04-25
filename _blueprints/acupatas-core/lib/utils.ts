export const formatMoney = (amount: number) =>
    new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount) + ' (Tasa BCV)';

export const diffDays = (start: string, end: string) =>
    Math.max(1, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24)));

export const getCaracasTime = () => {
    const options = {
        timeZone: 'America/Caracas',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    } as const;
    const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(new Date());
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
};
export const getCaracasDate = () => {
    const options = {
        timeZone: 'America/Caracas',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    } as const;
    const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(new Date());
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
};
