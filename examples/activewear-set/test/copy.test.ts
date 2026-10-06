import type { AddBlockedReason } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { DEFAULT_CONTENT, type Content } from '../src/content';
import { toViewModel } from '../src/model';
import { blockedText } from '../src/ui/copy';
import { load } from './support';

describe('blockedText', () => {
    it('has a sentence of the merchant\'s for every reason the SDK can give, and names the step that is full', async () => {
        const { bundle, settings } = await load();
        const top = toViewModel(bundle, settings).sections[0]!;
        // A record over the SDK's own type: a reason the SDK adds fails the typecheck here.
        const setting: Record<AddBlockedReason, keyof Content> = {
            'not-offered': 'soldOut',
            'sold-out': 'soldOut',
            stock: 'stockReached',
            'variant-limit': 'variantLimit',
            'product-limit': 'productLimit',
            'section-full': 'stepFull',
            'bundle-full': 'bundleFull',
        };
        const content = { ...DEFAULT_CONTENT };
        for (const key of new Set(Object.values(setting))) (content as unknown as Record<string, unknown>)[key] = `the merchant's ${key} {step}`;
        for (const [reason, key] of Object.entries(setting)) {
            const step = key === 'stepFull' ? top.name : '{step}';
            expect(blockedText(content, reason as AddBlockedReason, top), reason).toBe(`the merchant's ${key} ${step}`);
        }
    });
});
