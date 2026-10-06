/*
 * Icons are inline SVG, never emoji (a theme's font can render an emoji as an empty box) and never
 * an icon font (one more request, one more thing a theme can override). `aria-hidden`, because
 * every control that shows one also has a text label.
 */
const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
};

export const PlusIcon = () => (
    <svg {...common}>
        <path d="M8 3v10M3 8h10" />
    </svg>
);

export const MinusIcon = () => (
    <svg {...common}>
        <path d="M3 8h10" />
    </svg>
);

export const CloseIcon = () => (
    <svg {...common}>
        <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
);

export const CheckIcon = () => (
    <svg {...common}>
        <path d="M3 8.5l3 3 7-7" />
    </svg>
);

export const InfoIcon = () => (
    <svg {...common}>
        <circle cx="8" cy="8" r="6.25" />
        <path d="M8 7.25V11M8 5v.01" />
    </svg>
);

export const PenIcon = () => (
    <svg {...common}>
        <path d="M10.5 2.75l2.75 2.75L6 12.75H3.25V10z" />
        <path d="M9 4.25L11.75 7" />
    </svg>
);
