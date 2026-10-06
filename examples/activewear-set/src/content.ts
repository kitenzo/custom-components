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
 * Copy may carry `{count}`, `{step}`, `{amount}`, `{value}`, `{option}`, `{choice}` placeholders,
 * filled by `fill`.
 */

import type { BundleCartMessages } from '@kitenzo/react';

export interface Content {
    /** Blank means "use the bundle's own name". */
    heading: string;
    /** Blank means "use the bundle's own description". */
    intro: string;
    addToCart: string;
    adding: string;
    added: string;
    chooseMore: string;
    chooseMoreStep: string;
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
    summaryNotChosen: string;
    setPrice: string;
    total: string;
    saving: string;
    add: string;
    inSet: string;
    inSetAgain: string;
    swapped: string;
    remove: string;
    details: string;
    close: string;
    chooseOption: string;
    optionSoldOut: string;
    optionSoldOutWith: string;
    optionRepaired: string;
    surchargeNote: string;
    surchargeLine: string;
    matchHeading: string;
    matchDone: string;
    matchBlocked: string;
    notMadeIn: string;
    /** Option names drawn as swatches, comma separated. */
    swatchOptions: string;
    /** "Onyx: #1c1c1c", one per line: the colour each swatch is painted. */
    swatchColours: string;
    notAllowed: string;
    cartFailed: string;
    retryAdd: string;
    unavailable: string;
    loadFailed: string;
    editNotice: string;
    editMissing: string;
    afterAdd: 'cart' | 'stay';
    hidePrices: boolean;
    /** Stock at or below which a piece says how many are left. 0 never says it. */
    lowStockAt: number;
}

export const DEFAULT_CONTENT: Content = {
    heading: '',
    intro: '',
    addToCart: 'Add set to cart',
    adding: 'Adding…',
    added: 'Added to your cart',
    chooseMore: 'Add {count} more to continue',
    chooseMoreStep: 'Still to choose: {step}',
    stepOptional: 'Optional',
    stepFull: 'Your set already has a {step}. Remove it to choose this one.',
    bundleFull: 'Your set is full. Remove a piece to choose another.',
    soldOut: 'Sold out',
    onlyLeft: 'Only {count} left',
    stockReached: 'That is all we have of this one.',
    variantLimit: 'That is the most of this one a set can hold.',
    productLimit: 'That is the most of this piece a set can hold.',
    included: 'Included',
    summaryHeading: 'Your set',
    summaryNotChosen: 'Not chosen yet',
    setPrice: 'Set price',
    total: 'Total',
    saving: 'You save {amount} on the set',
    add: 'Add to set',
    inSet: 'In your set',
    inSetAgain: 'This piece is in your set. Change its colour or size to swap it.',
    swapped: 'Swapped in your set: {value}',
    remove: 'Remove',
    details: 'Details',
    close: 'Close',
    chooseOption: 'Choose your {option} first.',
    optionSoldOut: '{value} is sold out.',
    optionSoldOutWith: '{value} is sold out in {choice}.',
    optionRepaired: '{previous} is sold out in {choice}, so {option} is now {value}.',
    surchargeNote: '{value} adds {amount}',
    surchargeLine: '{step} in {value}',
    matchHeading: 'Match colours',
    matchDone: 'Every piece is now {value}.',
    matchBlocked: 'Not available in {value}:',
    notMadeIn: 'Not made in {value}.',
    swatchOptions: 'Colour, Color',
    swatchColours: 'Onyx: #1d1d1f\nBone: #e4dccd\nMoss: #5b6447\nSlate: #5f6872',
    notAllowed: 'This combination cannot be bought as it is. Please change your selection.',
    cartFailed: 'We could not add this to your cart. Please try again.',
    retryAdd: 'Press the button again to finish adding it; you will not be charged twice.',
    unavailable: 'This set is not available right now.',
    loadFailed: 'We could not load this set. Please refresh the page to try again.',
    editNotice: 'You are editing a set from your cart. Adding it again replaces the one in your cart.',
    editMissing: 'Some pieces from your saved set are no longer available, so please choose again.',
    afterAdd: 'cart',
    hidePrices: false,
    lowStockAt: 5,
};

type TextKey = { [K in keyof Content]: Content[K] extends string ? K : never }[keyof Content];

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
