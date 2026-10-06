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
 *   - a number that is not a whole number of zero or more is made one, so a count never reaches
 *     the page negative or fractional;
 *   - the defaults below are the same values as the schema defaults in theme/, and
 *     test/theme.test.ts fails if the two drift.
 *
 * Copy may carry `{count}`, `{step}`, `{amount}` placeholders, filled by `fill`. A discount
 * tier's own `customText` is the merchant's words from Kitenzo, not a theme setting: the SDK
 * fills its `{{ amount }}` placeholders (`getDiscountTierText`).
 */

import type { BundleCartMessages } from '@kitenzo/react';

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
    variantLimit: string;
    productLimit: string;
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
    cartFailed: string;
    retryAdd: string;
    afterAdd: 'cart' | 'stay';
    hidePrices: boolean;
    /** Stock at or below which a product says how many are left. 0 never says it. */
    lowStockAt: number;
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
    variantLimit: 'That is the most of this one a case can hold.',
    productLimit: 'That is the most of this drink a case can hold.',
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
    cartFailed: 'We could not add this to your cart. Please try again.',
    retryAdd: 'Press the button again to finish adding it; you will not be charged twice.',
    afterAdd: 'cart',
    hidePrices: false,
    lowStockAt: 5,
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
        } else if (typeof fallback === 'number') {
            if (typeof value === 'number' && Number.isFinite(value)) (content as unknown as Record<string, unknown>)[key] = Math.max(0, Math.round(value));
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
 * The cart's own sentences, in the merchant's words. The store's reason for refusing a line
 * ("sold out") is shown as the store sent it, in the storefront's language already.
 */
export function cartMessages(content: Content): BundleCartMessages {
    return { 'configure-failed': content.cartFailed, 'cart-error': content.cartFailed };
}
