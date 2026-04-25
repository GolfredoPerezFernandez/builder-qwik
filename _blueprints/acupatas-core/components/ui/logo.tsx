import { component$ } from '@builder.io/qwik';

export interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  mode?: 'light' | 'dark' | 'auto';
  class?: string;
}

export interface LogoResponsiveProps {
  size?: 'sm' | 'md' | 'lg' | 'xs';
  mode?: 'light' | 'dark' | 'auto';
  class?: string;
  responsive?: boolean; // Nueva propiedad para tamaños responsive
}

export const Logo = component$<LogoResponsiveProps>(({
  size = 'md',
  class: className = '',
  responsive = false
}) => {
  // Dimensiones optimizadas para móvil con un tamaño extra pequeño
  const dimensions = {
    xs: { width: 24, height: 24, text: 'text-sm', subtext: 'text-xs' },
    sm: { width: 32, height: 32, text: 'text-lg', subtext: 'text-xs' },
    md: { width: 40, height: 40, text: 'text-xl', subtext: 'text-sm' },
    lg: { width: 56, height: 56, text: 'text-2xl', subtext: 'text-base' },
  };

  // Classes responsive para diferentes tamaños de pantalla
  const responsiveClasses = responsive
    ? {
        width: 'w-6 sm:w-8 md:w-10',
        height: 'h-6 sm:h-8 md:h-10',
        text: 'text-sm sm:text-lg md:text-xl',
        subtext: 'text-xs sm:text-xs md:text-sm'
      }
    : null;

  const { width, height, text, subtext } = responsive
    ? responsiveClasses!
    : dimensions[size];

  return (
    <div class={`flex items-center ${className}`}>
      <div class="relative">
        {/* SVG Logo */}
        <svg
          width={responsive ? '100%' : width}
          height={responsive ? '100%' : height}
          viewBox="0 0 120 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          class={`flex-shrink-0 ${responsive ? responsiveClasses!.width + ' ' + responsiveClasses!.height : ''}`}
        >
          {/* Círculo de fondo */}
          <circle cx="60" cy="60" r="60" fill="#086870" />
          
          {/* Montañas */}
          <path d="M15 85L40 50L55 70L75 40L105 85H15Z" fill="#1A808E" />
          <path d="M30 85L50 55L65 70L80 50L100 85H30Z" fill="#C41248" />
          <path d="M45 85L60 65L75 85H45Z" fill="#D5DC5B" />
          
          {/* Bandera en el pico */}
          <circle cx="75" cy="40" r="5" fill="#F8AF3C" />
          <path d="M75 35L77 40L82 40L78 43L80 48L75 45L70 48L72 43L68 40L73 40L75 35Z" fill="#FFEB88" />
          
          {/* Detalles adicionales - elementos del expedición */}
          <circle cx="95" cy="75" r="3" fill="#D5DC5B" /> {/* Punto de interés */}
          <circle cx="35" cy="65" r="3" fill="#C41248" /> {/* Otro punto */}
          <path d="M55 85L65 75L75 85H55Z" fill="#F8AF3C" opacity="0.8" /> {/* Más vegetación */}
        </svg>
      </div>
      
      <div class={`ml-1.5 sm:ml-2 font-bold ${responsive ? responsiveClasses!.text : text} flex flex-col`}>
        <span class="text-[#086870] dark:text-[#086870] leading-tight">MOA</span>
        <span class={`text-[#D5DC5B] dark:text-[#D5DC5B] ${responsive ? responsiveClasses!.subtext : subtext} leading-tight`}>Expedition</span>
      </div>
    </div>
  );
});