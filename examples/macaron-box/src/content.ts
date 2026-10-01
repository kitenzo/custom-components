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
 *     test/content.test.ts fails if the two drift.
 *
 * Copy may carry `{count}`, `{size}`, `{step}`, `{amount}`, `{remove}` and `{current}` placeholders,
 * filled by `fill`.
 */

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
    sizeHeading: string;
    sizeOption: string;
    sizeEach: string;
    sizeFrom: string;
    trayCount: string;
    emptySlot: string;
    chooseSize: string;
    chooseMoreBox: string;
    boxFull: string;
    fillRest: string;
    fillShort: string;
    switchTitle: string;
    switchBody: string;
    switchConfirm: string;
    switchCancel: string;
    afterAdd: 'cart' | 'stay';
    hidePrices: boolean;
}

export const DEFAULT_CONTENT: Content = {
    heading: '',
    intro: '',
    addToCart: 'Add to cart',
    adding: 'Adding…',
    added: 'Added to your cart',
    chooseMore: 'Add {count} more to continue',
    chooseMoreStep: 'Add {count} more to “{step}”',
    stepCount: '{count} chosen',
    stepCountRange: '{count} of {range} chosen',
    stepOptional: 'Optional',
    stepFull: 'This step is full. Remove one to choose another.',
    bundleFull: 'Your bundle is full. Remove one to choose another.',
    soldOut: 'Sold out',
    onlyLeft: 'Only {count} left',
    stockReached: 'That is all we have of this one.',
    included: 'Included',
    summaryHeading: 'Your box',
    summaryEmpty: 'Tap a flavour to place it in your box.',
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
    sizeHeading: 'Choose your box',
    sizeOption: 'Box of {count}',
    sizeEach: '{amount} each',
    sizeFrom: 'From {amount}',
    trayCount: '{count} of {size}',
    emptySlot: 'Empty slot {count}',
    chooseSize: 'Choose a box size to begin.',
    chooseMoreBox: 'Add {count} more to fill your box of {size}',
    boxFull: 'Your box of {size} is full. Choose a bigger box, or take one out.',
    fillRest: 'Fill the rest for me',
    fillShort: 'We only have enough in stock to add {count}.',
    switchTitle: 'Switch to a box of {size}?',
    switchBody: 'Your box holds {count} macarons and a box of {size} holds {size}. Switching takes out the last {remove} you added.',
    switchConfirm: 'Take out {remove} and switch',
    switchCancel: 'Keep my box of {current}',
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
