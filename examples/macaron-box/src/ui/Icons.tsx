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

export const ChevronIcon = () => (
    <svg {...common}>
        <path d="M6 4l4 4-4 4" />
    </svg>
);

/** "Fill the rest": a four-point star, the patissier's flourish. */
export const SparkleIcon = () => (
    <svg {...common}>
        <path d="M8 2.5c.4 2.9 1.6 4.1 4.5 4.5-2.9.4-4.1 1.6-4.5 4.5-.4-2.9-1.6-4.1-4.5-4.5 2.9-.4 4.1-1.6 4.5-4.5z" />
        <path d="M12.5 11.5v2M11.5 12.5h2" />
    </svg>
);
