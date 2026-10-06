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

/** "Surprise me": two four-point sparkles. */
export const SparkleIcon = () => (
    <svg {...common} width={18} height={18} viewBox="0 0 18 18">
        <path d="M7 2.5l1.3 3.7L12 7.5l-3.7 1.3L7 12.5l-1.3-3.7L2 7.5l3.7-1.3z" />
        <path d="M13.5 11l.6 1.6 1.6.6-1.6.6-.6 1.7-.6-1.7-1.6-.6 1.6-.6z" />
    </svg>
);

/** A reminder: a bell. Says "we will email you", not "we will charge you". */
export const BellIcon = () => (
    <svg {...common}>
        <path d="M4 11.5V7.25a4 4 0 018 0v4.25l1.25 1.25H2.75z" />
        <path d="M6.75 14.25a1.4 1.4 0 002.5 0" />
    </svg>
);

/** One can, for an empty slot in the case. */
export const CanIcon = () => (
    <svg {...common} strokeWidth={1.4}>
        <path d="M5 2.75h6M4.5 4.5h7v8.25a.75.75 0 01-.75.75h-5.5a.75.75 0 01-.75-.75z" />
    </svg>
);
