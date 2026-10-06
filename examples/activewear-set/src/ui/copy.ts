/*
 * The sentences that explain a "no", built from the merchant's copy. One place, so the card, the
 * dialog, the summary and "Match colours" give the same reason in the same words.
 */
import type { AddBlockedReason } from '@kitenzo/react';

import { text, type Content } from '../content';
import type { ViewSection } from '../model';
import type { Repair, Unreachable } from '../options';

export function unreachableText(content: Content, value: string, why: Unreachable): string {
    switch (why.kind) {
        case 'sold-out':
            return text(content, 'optionSoldOut', { value });
        case 'sold-out-with':
            return text(content, 'optionSoldOutWith', { value, choice: why.choice });
        case 'not-made':
            return text(content, 'notMadeIn', { value });
    }
}

/** "Moss is sold out in XS, so Colour is now Onyx." `choice` is the value that forced it. */
export function repairText(content: Content, repair: Repair, choice: string): string {
    return text(content, 'optionRepaired', { previous: repair.previous, choice, option: repair.option, value: repair.value });
}

/** Why a piece will not go in, as a sentence of the merchant's. Every reason the SDK can give has one. */
export function blockedText(content: Content, reason: AddBlockedReason, section: ViewSection): string {
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
            return text(content, 'stepFull', { step: section.name });
        case 'bundle-full':
            return text(content, 'bundleFull');
    }
}
