/**
 * Utility to resize an image (DataURL) on the client side using Canvas.
 * Useful for reducing bandwidth and storage before uploading to the server.
 */
export const resizeImage = (dataUrl: string, maxWidth = 1024, maxHeight = 1024): Promise<string> => {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined') {
            return resolve(dataUrl); // Server-side: return as-is
        }

        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.src = dataUrl;

        img.onload = () => {
            let width = img.width;
            let height = img.height;

            // Calculate new dimensions
            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return reject(new Error('Could not get canvas context'));
            }

            ctx.drawImage(img, 0, 0, width, height);

            // We use JPEG for better compression of photos
            const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
            resolve(resizedDataUrl);
        };

        img.onerror = (err) => {
            reject(err);
        };
    });
};
