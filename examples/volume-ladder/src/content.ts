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
 * Copy may carry `{count}`, `{step}`, `{amount}`, `{discount}` placeholders, filled by `fill`.
 * The unit ("pouches") lives in the copy, not in code: a merchant selling tubs, bars or bottles
 * changes three settings, never the widget.
 */

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
    retryAdd: string;
    afterAdd: 'cart' | 'stay';
    hidePrices: boolean;
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
    retryAdd: 'Press the button again to finish adding it; you will not be charged twice.',
    afterAdd: 'cart',
    hidePrices: false,
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
