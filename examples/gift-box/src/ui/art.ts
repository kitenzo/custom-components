/*
 * What a product looks like when it has no photograph.
 *
 * A new shop often launches before its photography is done, and Wrenwood's demo catalogue has
 * none at all. A grey square with a broken-image icon makes a gift shop look closed. Instead each
 * product gets a drawn tile, decided from data the product already has:
 *
 *   - a line drawing for what it is (a candle, a tea tin, a card), recognised from its title and
 *     tags, or a typeset initial when nothing matches;
 *   - a paper tone picked by a stable hash of its handle, so the same product is the same colour on
 *     every visit and two neighbours rarely match;
 *   - the colour the shopper chose, when the product has a Colour option (the box, the socks), so
 *     choosing Terracotta visibly changes the box.
 *
 * Nothing here is configuration. A product with a photograph shows the photograph.
 */
import type { BundleProduct, BundleVariant } from '@kitenzo/react';

export type ArtKind = 'matchbox' | 'card' | 'candle' | 'tea' | 'chocolate' | 'socks' | 'bath' | 'box' | 'initial';

// Most specific first: a "matchbox" is not a gift box, a "gift card box" is a card.
const KINDS: [ArtKind, RegExp][] = [
    ['matchbox', /\bmatch(box|es)?\b/],
    ['card', /\b(card|cards|notecard)\b/],
    ['candle', /\bcandles?\b/],
    ['tea', /\b(tea|teas|infusion)\b/],
    ['chocolate', /\b(chocolate|cacao|cocoa|truffles?)\b/],
    ['socks', /\b(socks?|stockings?)\b/],
    ['bath', /\b(bath|soak|salts?)\b/],
    ['box', /\b(box|boxes|packaging|hamper)\b/],
];

export function artKind(product: Pick<BundleProduct, 'title'> & { tags?: string[] }): ArtKind {
    // Title first: a product's name says what it is more reliably than a merchant's tags.
    for (const source of [product.title, (product.tags ?? []).join(' ')]) {
        const text = source.toLowerCase();
        for (const [kind, pattern] of KINDS) if (pattern.test(text)) return kind;
    }
    return 'initial';
}

/** FNV-1a: small, stable across engines, and spreads similar handles apart. */
export function hash(value: string): number {
    let result = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        result ^= value.charCodeAt(index);
        result = Math.imul(result, 0x01000193);
    }
    return result >>> 0;
}

/** Paper tones: warm, quiet, and all dark enough text-on-them to pass contrast. */
export const PAPERS = ['#efe6d6', '#ecdcd2', '#e1e6d8', '#dfe4e6', '#eadfca', '#e9d9d9', '#e4ddd0', '#dde3dc'];

export function paperFor(handle: string): string {
    return PAPERS[hash(handle) % PAPERS.length]!;
}

/*
 * Colour names a shop is likely to use, as paint. A name outside the list still gets a stable
 * colour from its hash, so a new colourway never renders as nothing.
 */
const NAMED: Record<string, string> = {
    oat: '#d9c7a7',
    oatmeal: '#d9c7a7',
    cream: '#efe4cc',
    ivory: '#f1e9d6',
    sand: '#d8c19a',
    stone: '#b9b0a2',
    kraft: '#c4a57a',
    terracotta: '#c0694b',
    clay: '#b77a5f',
    rust: '#a6512f',
    blush: '#e2b9ab',
    rose: '#d69a9a',
    forest: '#4e6a4f',
    sage: '#9cad8f',
    olive: '#7d7c4a',
    navy: '#2f3c58',
    blue: '#5878a3',
    grey: '#9a9894',
    gray: '#9a9894',
    charcoal: '#4a4744',
    black: '#2b2a29',
    'matte black': '#2b2a29',
    white: '#f6f4ef',
    brass: '#b8964f',
    gold: '#c8a457',
    silver: '#b9bcbf',
};

const SWATCH_FALLBACK = ['#c9b79c', '#a98f7a', '#8e9c86', '#8d9aa6', '#b59a6d', '#a77f7f'];

export function swatchFor(name: string): string {
    return NAMED[name.trim().toLowerCase()] ?? SWATCH_FALLBACK[hash(name.trim().toLowerCase()) % SWATCH_FALLBACK.length]!;
}

/** Options whose values are colours, and so render as swatches and tint the drawing. */
export function isColourOption(name: string): boolean {
    return /^(colou?r|finish|shade)$/i.test(name.trim());
}

/** The paint for this variant, from its colour option, or null when it has none. */
export function tintFor(product: BundleProduct, variant: BundleVariant | undefined): string | null {
    if (!variant) return null;
    const index = (product.options ?? []).findIndex((option) => isColourOption(option.name));
    const value = index >= 0 ? variant.optionValues?.[index] : undefined;
    return value ? swatchFor(value) : null;
}

/**
 * The words on a card's front: "With Love Letterpress Card" is a "With Love" card. Only a trailing
 * "card" phrase is removed, so a title that is not about a card is shown whole.
 */
export function cardFront(title: string): string {
    const front = title.replace(/\s+(letterpress\s+|greeting\s+|gift\s+)?(card|notecard)s?\s*$/i, '').trim();
    return front || title;
}

/** One letter for the typeset tile: the first letter or digit, skipping quotes and markup. */
export function initialOf(title: string): string {
    const match = /[\p{L}\p{N}]/u.exec(title);
    return match ? match[0].toUpperCase() : '·';
}
