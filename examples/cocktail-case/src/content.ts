/*
 * Every word the shopper sees, and the merchant's say over each one.
 *
 * The Liquid section writes the merchant's theme-editor settings into the mount element's
 * `data-content` as one JSON blob. This file is the only reader of it, and it reads defensively:
 *
 *   - anything that is not the type it should be is ignored, so one malformed field never costs
 *     the merchant every other string;
 *   - blank or whitespace-only text falls back to the default (a cleared field means "use the
 *     default", not "show nothing"), except where the setting says blank means "hide";
 *   - the defaults below are the same strings as the schema defaults in theme/, and
 *     test/theme.test.ts fails if the two drift.
 *
 * Copy may carry `{count}`, `{step}`, `{amount}` placeholders, filled by `fill`. A discount
 * tier's own `customText` is the merchant's words from Kitenzo, not a theme setting, and uses the
 * SDK's `{{ amount }}` placeholders instead: `fillTierText` fills those.
 */

export interface Content {
    /** Blank means "use the bundle's own name". */
    heading: string;
    /** Blank means "use the bundle's own description". */
    intro: string;
    eyebrow: string;
    addToCart: string;
    addToCartSubscribe: string;
    addToCartReorder: string;
    adding: string;
    added: string;
    chooseMore: string;
    chooseMoreStep: string;
    stepCount: string;
    stepCountRange: string;
    stepOptional: string;
    stepFull: string;
    bundleFull: string;
    soldOut: string;
    onlyLeft: string;
    stockReached: string;
    included: string;
    summaryHeading: string;
    summaryEmpty: string;
    caseCount: string;
    caseCountRange: string;
    total: string;
    saving: string;
    add: string;
    remove: string;
    details: string;
    close: string;
    // Filters
    showFacets: boolean;
    /** One facet per line, `Prefix_ = Label`. Parsed by `parseFacetDefs`. */
    facets: string;
    filterLabel: string;
    clearFilters: string;
    inCase: string;
    noMatches: string;
    // The discount ladder
    tierNext: string;
    tierNextOne: string;
    tierMax: string;
    tierNow: string;
    tierRung: string;
    discountPercent: string;
    discountAmount: string;
    discountPrice: string;
    // Surprise me
    surprise: string;
    surpriseTo: string;
    surpriseFull: string;
    surpriseEmpty: string;
    surpriseDone: string;
    surpriseShort: string;
    // Subscribe and save (Kitenzo Recurring bundles)
    planHeading: string;
    planOneTime: string;
    planOneTimeNote: string;
    planSave: string;
    planSaveLater: string;
    planPromise: string;
    planFrequency: string;
    emailLabel: string;
    emailPlaceholder: string;
    emailMissing: string;
    emailInvalid: string;
    frequencyMissing: string;
    planGone: string;
    reorderNotice: string;
    reorderExpired: string;
    frequencyDay: string;
    frequencyDays: string;
    frequencyWeek: string;
    frequencyWeeks: string;
    frequencyMonth: string;
    frequencyMonths: string;
    propertyFrequency: string;
    propertyEmail: string;
    // Messages
    unavailable: string;
    loadFailed: string;
    editNotice: string;
    editMissing: string;
    notAllowed: string;
    retryAdd: string;
    afterAdd: 'cart' | 'stay';
    hidePrices: boolean;
}

export const DEFAULT_CONTENT: Content = {
    heading: '',
    intro: '',
    eyebrow: 'Mix a case',
    addToCart: 'Add case to cart',
    addToCartSubscribe: 'Join the club and add to cart',
    addToCartReorder: 'Reorder this case',
    adding: 'Adding…',
    added: 'Added to your cart',
    chooseMore: 'Add {count} more to complete your case',
    chooseMoreStep: 'Add {count} more to “{step}”',
    stepCount: '{count} chosen',
    stepCountRange: '{count} of {range} chosen',
    stepOptional: 'Optional',
    stepFull: 'This step is full. Remove one to choose another.',
    bundleFull: 'Your case is full. Take one out to swap it.',
    soldOut: 'Sold out',
    onlyLeft: 'Only {count} left',
    stockReached: 'That is all we have of this one.',
    included: 'Included',
    summaryHeading: 'Your case',
    summaryEmpty: 'Your case is empty. Pick a can, or let us surprise you.',
    caseCount: '{count} cans',
    caseCountRange: '{count} of {max} cans',
    total: 'Total',
    saving: 'You save {amount}',
    add: 'Add',
    remove: 'Remove',
    details: 'Details',
    close: 'Close',
    showFacets: true,
    facets: 'Flavor_ = Flavour\nStrength_ = Strength',
    filterLabel: 'Filter',
    clearFilters: 'Clear all',
    inCase: 'In your case',
    noMatches: 'Nothing matches all of those. Try fewer filters.',
    tierNext: 'Add {count} more to unlock {discount}',
    tierNextOne: 'Add 1 more to unlock {discount}',
    tierMax: 'Top tier unlocked: {discount} the whole case',
    tierNow: '{discount} unlocked',
    tierRung: '{count} cans',
    discountPercent: '{value}% off',
    discountAmount: '{amount} off',
    discountPrice: '{amount} a case',
    surprise: 'Surprise me',
    surpriseTo: 'Fill to {count}',
    surpriseFull: 'Your case is full. Take one out to make room.',
    surpriseEmpty: 'Nothing left in stock to add.',
    surpriseDone: 'Added {count}. Swap any you like.',
    surpriseShort: 'Added {count}. That is all we have in stock right now.',
    planHeading: 'Buy once, or join the club',
    planOneTime: 'One-time case',
    planOneTimeNote: 'Just this case.',
    planSave: 'An extra {discount}',
    planSaveLater: '{discount} from your second case',
    planPromise: 'We email a reminder when it is time, with a one-tap reorder link. Nothing is charged until you reorder.',
    planFrequency: 'Remind me',
    emailLabel: 'Email for your reminders',
    emailPlaceholder: 'you@example.com',
    emailMissing: 'Enter your email so we can send your reminders.',
    emailInvalid: 'That email does not look right. Check it and try again.',
    frequencyMissing: 'Choose how often you would like a reminder.',
    planGone: 'That plan is no longer available. Choose another, or buy a one-time case.',
    reorderNotice: 'Welcome back. Your member price is on this reorder. Reminders: {frequency}.',
    reorderExpired: 'That reorder link has expired, so this is a one-time case. You can join the club again below.',
    frequencyDay: 'Every day',
    frequencyDays: 'Every {count} days',
    frequencyWeek: 'Every week',
    frequencyWeeks: 'Every {count} weeks',
    frequencyMonth: 'Every month',
    frequencyMonths: 'Every {count} months',
    propertyFrequency: 'Frequency',
    propertyEmail: 'Email',
    unavailable: 'This bundle is not available right now.',
    loadFailed: 'We could not load this bundle. Please refresh the page to try again.',
    editNotice: 'You are editing a case from your cart. Adding it again replaces the one in your cart.',
    editMissing: 'Some cans from your saved case are no longer available, so please choose again.',
    notAllowed: 'This combination cannot be bought as it is. Please change your selection.',
    retryAdd: 'Press the button again to finish adding it; you will not be charged twice.',
    afterAdd: 'cart',
    hidePrices: false,
};

export type TextKey = { [K in keyof Content]: Content[K] extends string ? K : never }[keyof Content];

function asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Parse a mount element's `data-content`. A malformed blob is the defaults, never a crash. */
export function parseContent(raw: string | undefined): Content {
    let parsed: unknown = {};
    if (raw) {
        try {
            parsed = JSON.parse(raw);
        } catch {
            parsed = {};
        }
    }
    const input = asRecord(parsed);
    const content: Content = { ...DEFAULT_CONTENT };
    for (const key of Object.keys(DEFAULT_CONTENT) as (keyof Content)[]) {
        const value = input[key];
        const fallback = DEFAULT_CONTENT[key];
        if (typeof fallback === 'string' && key !== 'afterAdd') {
            // Liquid hands a cleared text setting over as '' (or, without `default: ''`, as an
            // empty object). Either way: the default.
            if (typeof value === 'string' && value.trim() !== '') (content as unknown as Record<string, unknown>)[key] = value.trim();
        } else if (typeof fallback === 'boolean') {
            if (typeof value === 'boolean') (content as unknown as Record<string, unknown>)[key] = value;
        }
    }
    content.afterAdd = input.afterAdd === 'stay' ? 'stay' : 'cart';
    return content;
}

/** Fill `{name}` placeholders. Unknown placeholders are left as written, so a typo is visible. */
export function fill(template: string, values: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}

/** One string, filled. The one way a component reads copy. */
export function text(content: Content, key: TextKey, values: Record<string, string | number> = {}): string {
    return fill(content[key], values);
}

/**
 * Fill a discount tier's `customText` the way Kitenzo's own widget does: `{{ name }}` with any
 * spacing inside the braces, and an unknown name left visible as `{{ name }}` so the merchant can
 * see the typo on their own storefront. The text is the merchant's, rendered verbatim otherwise
 * (and as text, never as markup).
 */
export function fillTierText(template: string, values: Record<string, string | number>): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (_match, raw: string) => {
        const name = raw.trim();
        return name in values ? String(values[name]) : `{{ ${name} }}`;
    });
}
