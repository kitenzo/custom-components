/*
 * The sentences that explain a "no", built from the merchant's copy. One place, so the card, the
 * dialog, the summary and "Match colours" give the same reason in the same words.
 */
import { text, type Content } from '../content';
import type { ViewSection } from '../model';
import type { Repair, Unreachable } from '../options';
import type { Blocked } from '../selection';

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

export function blockedText(content: Content, reason: Blocked, section: ViewSection): string {
    switch (reason) {
        case 'sold-out':
            return text(content, 'soldOut');
        case 'stock':
            return text(content, 'stockReached');
        case 'step-full':
            return text(content, 'stepFull', { step: section.name });
        case 'bundle-full':
            return text(content, 'bundleFull');
    }
}
