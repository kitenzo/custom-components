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
 * Copy may carry `{count}`, `{step}`, `{amount}`, `{discount}` placeholders, filled by `fill`.
 * The unit ("pouches") lives in the copy, not in code: a merchant selling tubs, bars or bottles
 * changes three settings, never the widget.
 */

import type { BundleCartMessages } from '@kitenzo/react';

export interface Content {
    /** Blank means "use the bundle's own name". */
    heading: string;
    /** Blank means "use the bundle's own description". */
    intro: string;
    ladderHeading: string;
    tierRow: string;
    tierRowOne: string;
    tierSave: string;
    tierEach: string;
    tierBest: string;
    progressStart: string;
    progressNext: string;
    progressTop: string;
    productsHeading: string;
    chosenCount: string;
    addToCart: string;
    adding: string;
    added: string;
    chooseMore: string;
    chooseMoreStep: string;
    stepFull: string;
    bundleFull: string;
    soldOut: string;
    onlyLeft: string;
    stockReached: string;
    variantLimit: string;
    productLimit: string;
    included: string;
    total: string;
    saving: string;
    add: string;
    remove: string;
    details: string;
    close: string;
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
    ladderHeading: 'Buy more, save more',
    tierRow: '{count} pouches',
    tierRowOne: '{count} pouch',
    tierSave: 'Save {discount}',
    tierEach: '{amount} each',
    tierBest: 'Best value',
    progressStart: 'Choose {count} to save {discount}',
    progressNext: 'Add {count} more to save {discount}',
    progressTop: 'Best price unlocked: you save {discount}',
    productsHeading: 'Choose your flavours',
    chosenCount: '{count} chosen',
    addToCart: 'Add to cart',
    adding: 'Adding…',
    added: 'Added to your cart',
    chooseMore: 'Add {count} more to continue',
    chooseMoreStep: 'Add {count} more to “{step}”',
    stepFull: 'This step is full. Remove one to choose another.',
    bundleFull: 'Your bundle is full. Remove one to choose another.',
    soldOut: 'Sold out',
    onlyLeft: 'Only {count} left',
    stockReached: 'That is all we have of this one.',
    variantLimit: 'That is the most of this one a bundle can hold.',
    productLimit: 'That is the most of this product a bundle can hold.',
    included: 'Included',
    total: 'Total',
    saving: 'You save {amount}',
    add: 'Add',
    remove: 'Remove',
    details: 'Details',
    close: 'Close',
    unavailable: 'This bundle is not available right now.',
    loadFailed: 'We could not load this bundle. Please refresh the page to try again.',
    editNotice: 'You are editing a bundle from your cart. Adding it again replaces the one in your cart.',
    editMissing: 'Some items from your saved bundle are no longer available, so please choose again.',
    notAllowed: 'This combination cannot be bought as it is. Please change your selection.',
    cartFailed: 'We could not add this to your cart. Please try again.',
    retryAdd: 'Press the button again to finish adding it; you will not be charged twice.',
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
