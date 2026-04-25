import { useStore, useVisibleTask$ } from '@builder.io/qwik';

/**
 * Hook to track window dimensions (width and height).
 * Returns a store with width and height that updates on resize.
 */
export function useScreenSize() {
  const size = useStore({
    width: 0,
    height: 0,
  });

  useVisibleTask$(() => {
    const updateSize = () => {
      size.width = window.innerWidth;
      size.height = window.innerHeight;
    };

    // Initial size
    updateSize();

    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  });

  return size;
}
