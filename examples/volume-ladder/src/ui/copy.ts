/*
 * Sentences built from the SDK's answers and the merchant's words.
 */
import type { AddBlockedReason } from '@kitenzo/react';

import { text, type Content } from '../content';

/** Why one more will not go in, as a sentence of the merchant's. Every reason the SDK can give has one. */
export function blockedText(content: Content, reason: AddBlockedReason): string {
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
        case 'section-full':
            return text(content, 'stepFull');
        case 'bundle-full':
            return text(content, 'bundleFull');
    }
}
