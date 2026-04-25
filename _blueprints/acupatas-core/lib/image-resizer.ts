
import sharp from 'sharp';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { Request, Response } from 'express';

export const handleImageResize = async (req: Request, res: Response, uploadDir: string) => {
    const { src, w, h, q } = req.query;

    if (!src || typeof src !== 'string') {
        return res.status(400).send('Missing src parameter');
    }

    // Security: Only allow images from /uploads/
    if (!src.startsWith('/uploads/')) {
        return res.status(403).send('Forbidden: Only /uploads/ images allowed');
    }

    const filename = src.replace('/uploads/', '');
    const filePath = join(uploadDir, filename);

    if (!existsSync(filePath)) {
        return res.status(404).send('Image not found');
    }

    try {
        const width = w ? parseInt(w as string) : undefined;
        const height = h ? parseInt(h as string) : undefined;
        const quality = q ? parseInt(q as string) : 80;

        let transform = sharp(filePath);

        if (width || height) {
            transform = transform.resize(width, height, {
                fit: 'cover',
                withoutEnlargement: true
            });
        }

        // Always convert to webp for better performance
        transform = transform.webp({ quality });

        res.setHeader('Content-Type', 'image/webp');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

        const buffer = await transform.toBuffer();
        res.send(buffer);
    } catch (err) {
        console.error('[handleImageResize] Error:', err);
        res.status(500).send('Error processing image');
    }
};
