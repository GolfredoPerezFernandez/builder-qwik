import { server$ } from '@builder.io/qwik-city';
import { getSessionFromEvent } from './auth';
import { resolveUploadUrl as resolveUploadUrlInternal } from './upload-utils';

export const resolveUploadUrl = resolveUploadUrlInternal;

export const deleteFile = async (url: string | undefined) => {
    if (!url || typeof url !== 'string') return;
    if (!url.startsWith('/uploads/')) return;

    try {
        const { unlinkSync, existsSync } = await import('node:fs');
        const { join } = await import('node:path');

        const filename = url.replace('/uploads/', '');
        const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), 'public', 'uploads');
        const filePath = join(uploadDir, filename);

        if (existsSync(filePath)) {
            unlinkSync(filePath);
            console.log(`[Cleanup] Deleted file: ${filePath}`);
        }
    } catch (err) {
        console.error(`[Cleanup] Error deleting file ${url}:`, err);
    }
};

export const uploadImage = server$(async function (dataUrl: string) {
    try {
        const { mkdirSync, writeFileSync } = await import('node:fs');
        const { join } = await import('node:path');

        const session = await getSessionFromEvent(this);
        if (!session) return { ok: false, reason: 'no_session' } as const;

        // Basic validation for data URL
        const match = dataUrl.match(/^data:(.+);base64,(.*)$/);
        if (!match) return { ok: false, reason: 'invalid_format' } as const;

        const mime = match[1];
        const base64 = match[2];
        const extMap: Record<string, string> = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp',
            'image/gif': 'gif',
            'application/pdf': 'pdf',
        };
        const ext = extMap[mime] ?? 'bin';

        const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), 'public', 'uploads');
        try {
            mkdirSync(uploadDir, { recursive: true });
        } catch (e) {
            // ignore if exists
        }

        const filename = Date.now() + '_' + crypto.randomUUID() + '.' + ext;
        const filePath = join(uploadDir, filename);

        const buffer = Buffer.from(base64, 'base64');
        writeFileSync(filePath, buffer);

        const url = `/uploads/${filename}`;
        return { ok: true, url, path: url, size: buffer.length } as const;
    } catch (err: any) {
        console.error('[uploadImage] Error:', err);
        return { ok: false, reason: err.message || 'Error interno del servidor (posible caída de conexión BD)' } as const;
    }
});
