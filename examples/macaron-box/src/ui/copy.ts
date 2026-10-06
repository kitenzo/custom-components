/*
 * Sentences built from the SDK's answers and the merchant's words.
 */
import { text, type Content } from '../content';
import type { Blocked } from '../selection';

/**
 * Why one more will not go in, as a sentence of the merchant's. Every reason the SDK can give has
 * one, and so does the box's own: `size` is the box the shopper chose, which that sentence names.
 */
export function blockedText(content: Content, reason: Blocked, size: number | null): string {
    switch (reason) {
        // A card only ever shows variants its step offers, so the two read the same to a shopper.
        case 'not-offered':
        case 'sold-out':
            return text(content, 'soldOut');
        case 'stock':
            return text(content, 'stockReached');
        case 'variant-limit':
            return text(content, 'variantLimit');
        case 'product-limit':
            return text(content, 'productLimit');
        case 'box-full':
            return text(content, 'boxFull', { size: size ?? '' });
        case 'section-full':
            return text(content, 'stepFull');
        case 'bundle-full':
            return text(content, 'bundleFull');
    }
}
