import { createBundleBuilder } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { toViewModel } from '../src/model';
import { withRequiredVariantIds } from '../src/sdkFixes';
import { blockedReason, clampSeed, missingPicks } from '../src/selection';
import { load } from './support';

async function setUp() {
    const { bundle, settings } = await load();
    const model = toViewModel(withRequiredVariantIds(bundle), { settings });
    const [boxes, fill, cards] = model.sections as [(typeof model.sections)[number], (typeof model.sections)[number], (typeof model.sections)[number]];
    const variant = (section: typeof fill, handle: string) => section.products.find((product) => product.handle === handle)!.variants[0]!;
    return { model, boxes, fill, cards, variant };
}

describe('blockedReason', () => {
    it('explains why one more cannot go in, sold out first', async () => {
        const { model, fill, cards, variant } = await setUp();
        expect(blockedReason(model, {}, cards, variant(cards, 'get-well-soon-letterpress-card'))).toBe('sold-out');

        const chocolate = variant(fill, 'small-batch-chocolate-bar'); // stock 3 in the catalogue
        expect(blockedReason(model, { [fill.id]: [{ variantId: chocolate.id, quantity: 2 }] }, fill, chocolate)).toBeNull();
        expect(blockedReason(model, { [fill.id]: [{ variantId: chocolate.id, quantity: 3 }] }, fill, chocolate)).toBe('stock');

        const candle = variant(fill, 'hand-poured-soy-candle');
        expect(blockedReason(model, { [fill.id]: [{ variantId: candle.id, quantity: 5 }] }, fill, variant(fill, 'loose-leaf-tea-tin'))).toBe('step-full');
    });
});

describe('missingPicks', () => {
    it('names each step that still needs picks, and ignores the optional card', async () => {
        const { model, boxes, fill, variant } = await setUp();
        expect(missingPicks(model, {})).toEqual([
            { section: boxes, count: 1 },
            { section: fill, count: 2 },
        ]);
        const done = {
            [boxes.id]: [{ variantId: variant(boxes, 'keepsake-gift-box').id, quantity: 1 }],
            [fill.id]: [{ variantId: variant(fill, 'hand-poured-soy-candle').id, quantity: 2 }],
        };
        expect(missingPicks(model, done)).toEqual([]);
    });

    it('agrees with the SDK: no missing picks means the SDK will accept it', async () => {
        const { model, boxes, fill, variant } = await setUp();
        const builder = createBundleBuilder(model.bundle);
        builder.addItem(boxes.id, variant(boxes, 'keepsake-gift-box').id, 1);
        builder.addItem(fill.id, variant(fill, 'loose-leaf-tea-tin').id, 2);
        expect(missingPicks(model, builder.getState().selections)).toEqual([]);
        expect(builder.getState().isSatisfied).toBe(true);
    });
});

describe('required products', () => {
    it('counts the required product, as the SDK does: "exactly 4" with 1 required needs 3 picks', async () => {
        const { bundle, settings } = await load((fixture) => {
            const id = fixture.products.find((product) => product.handle === 'botanical-bath-soak')!.shopifyProductId;
            return {
                ...fixture,
                bundle: {
                    ...fixture.bundle,
                    sections: fixture.bundle.sections.map((section) => ({ ...section, products: section.products.filter((ref) => ref.shopifyProductId !== id) })),
                    requiredProducts: [{ quantity: 1, shopifyProductId: id, variantIds: [] }],
                    limitRules: [...fixture.bundle.limitRules, { operation: 'eq', sectionId: null, type: 'total-number-of-products', value: '4.00' }],
                },
            };
        });
        const model = toViewModel(withRequiredVariantIds(bundle), { settings });
        expect(model.requiredCount).toBe(1);
        const [boxes, fill] = model.sections as [(typeof model.sections)[number], (typeof model.sections)[number]];
        const box = boxes.products[0]!.variants[0]!;
        const candle = fill.products.find((product) => product.handle === 'hand-poured-soy-candle')!.variants[0]!;
        const three = { [boxes.id]: [{ variantId: box.id, quantity: 1 }], [fill.id]: [{ variantId: candle.id, quantity: 2 }] };
        expect(missingPicks(model, three)).toEqual([]);
        expect(blockedReason(model, three, fill, fill.products[1]!.variants[0]!)).toBe('bundle-full');

        const builder = createBundleBuilder(model.bundle);
        builder.addItem(boxes.id, box.id, 1);
        builder.addItem(fill.id, candle.id, 2);
        expect(builder.getState().isSatisfied).toBe(true);
    });
});

describe('clampSeed', () => {
    it('drops what the shopper could not pick by hand: sold out, over stock, over a step maximum', async () => {
        const { model, fill, cards, variant } = await setUp();
        const seed = {
            [fill.id]: [
                { variantId: variant(fill, 'small-batch-chocolate-bar').id, quantity: 5 }, // stock 3
                { variantId: variant(fill, 'hand-poured-soy-candle').id, quantity: 9 }, // step max 5
                { variantId: 'gid-the-bundle-no-longer-offers', quantity: 1 },
            ],
            [cards.id]: [{ variantId: variant(cards, 'get-well-soon-letterpress-card').id, quantity: 1 }],
        };
        expect(clampSeed(model, seed)).toEqual({
            [fill.id]: [
                { variantId: variant(fill, 'small-batch-chocolate-bar').id, quantity: 3 },
                { variantId: variant(fill, 'hand-poured-soy-candle').id, quantity: 2 },
            ],
        });
    });
});
