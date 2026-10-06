import { describe, expect, it } from 'vitest';

import { DEFAULT_CONTENT, type Content } from '../src/content';
import type { Blocked } from '../src/selection';
import { blockedText } from '../src/ui/copy';

describe('blockedText', () => {
    it('has a sentence of the merchant\'s for every reason the SDK can give, and for the box\'s own', () => {
        // A record over the SDK's own type plus `box-full`: a reason the SDK adds fails the typecheck here.
        const setting: Record<Blocked, keyof Content> = {
            'not-offered': 'soldOut',
            'sold-out': 'soldOut',
            stock: 'stockReached',
            'variant-limit': 'variantLimit',
            'product-limit': 'productLimit',
            'box-full': 'boxFull',
            'section-full': 'stepFull',
            'bundle-full': 'bundleFull',
        };
        const content = { ...DEFAULT_CONTENT };
        for (const key of new Set(Object.values(setting))) (content as unknown as Record<string, unknown>)[key] = `the merchant's ${key}`;
        for (const [reason, key] of Object.entries(setting)) expect(blockedText(content, reason as Blocked, 12), reason).toBe(`the merchant's ${key}`);
    });

    it('names the box the shopper chose when that box is what is full', () => {
        expect(blockedText(DEFAULT_CONTENT, 'box-full', 12)).toBe('Your box of 12 is full. Choose a bigger box, or take one out.');
    });
});
