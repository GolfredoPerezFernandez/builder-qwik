import { component$ } from '@builder.io/qwik';

interface Props {
    verified: boolean;
    label?: string;
    size?: 'sm' | 'md' | 'lg';
    class?: string;
}

export const VerificationBadge = component$<Props>((props) => {
    const isVerified = props.verified;
    const label = props.label || (isVerified ? 'Verificado' : 'No verificado');
    const size = props.size || 'md';

    const sizeClasses = {
        sm: 'px-1.5 py-0.5 text-[10px] gap-1',
        md: 'px-2.5 py-1 text-xs gap-1.5',
        lg: 'px-4 py-2 text-sm gap-2',
    };

    const iconSizes = {
        sm: 'w-3 h-3',
        md: 'w-3.5 h-3.5',
        lg: 'w-5 h-5',
    };

    const toneClasses = isVerified
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm'
        : 'bg-amber-50 text-amber-700 border-amber-200 shadow-sm';

    return (
        <span
            class={`inline-flex items-center font-bold rounded-full border transition-all ${sizeClasses[size]} ${toneClasses} ${props.class || ''}`}
        >
            {isVerified && (
                <svg class={iconSizes[size]} fill="currentColor" viewBox="0 0 20 20">
                    <path
                        fill-rule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clip-rule="evenodd"
                    />
                </svg>
            )}
            {!isVerified && (
                <svg class={iconSizes[size]} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                </svg>
            )}
            {label}
        </span>
    );
});
