import { component$, $, useSignal, useTask$ } from '@builder.io/qwik';
import { Image, type ImageProps } from '@unpic/qwik';

export const ImageWithRetry = component$((props: ImageProps) => {
    const retryCount = useSignal(0);
    const srcSignal = useSignal(props.src);

    useTask$(({ track }) => {
        track(() => props.src);
        srcSignal.value = props.src;
        retryCount.value = 0; // Reset retry count when source changes
    });

    const handleError$ = $(() => {
        if (retryCount.value < 10) {
            setTimeout(() => {
                retryCount.value++;
                try {
                    const url = new URL(srcSignal.value as string, window.location.origin);
                    url.searchParams.set('r', Date.now().toString());
                    srcSignal.value = url.toString();
                } catch (e) {
                    // If it's not a valid URL (like a path), try to append '?' or '&'
                    const separator = srcSignal.value?.toString().includes('?') ? '&' : '?';
                    srcSignal.value = `${srcSignal.value}${separator}r=${Date.now()}`;
                }
            }, 2000);
        } else {
            // Fallback for pet photos
            if (srcSignal.value?.toString().includes('pet') || props.alt?.toLowerCase().includes('mascota')) {
                srcSignal.value = '/images/default-pet.jpg';
            } else {
                srcSignal.value = '/images/default-avatar.jpg';
            }
        }
    });

    return (
        <Image
            {...props}
            src={srcSignal.value}
            onError$={handleError$}
        />
    );
});
