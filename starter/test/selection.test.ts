import { createBundleBuilder } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { toViewModel } from '../src/model';
import { withRequiredVariantIds } from '../src/sdkFixes';
import { blockedReason, clampSeed, missingPicks } from '../src/selection';
import { load } from './support';

async function setUp() {
    const { bundle, settings } = await load();
    const model = toViewModel(withRequiredVariantIds(bundle), { settings });
    const smoothies = model.sections[0]!;
    const shots = model.sections[1]!;
    const variant = (section: typeof smoothies, handle: string) => section.products.find((product) => product.handle === handle)!.variants[0]!;
    return { model, smoothies, shots, variant };
}

describe('blockedReason', () => {
    it('explains why one more cannot go in, sold out first', async () => {
        const { model, smoothies, shots, variant } = await setUp();
        const sold = shots.products.find((product) => product.soldOut)!.variants[0]!;
        expect(blockedReason(model, {}, shots, sold)).toBe('sold-out');

        const beet = variant(smoothies, 'beetroot-berry'); // stock 3 in the catalogue
        expect(blockedReason(model, { [smoothies.id]: [{ variantId: beet.id, quantity: 2 }] }, smoothies, beet)).toBeNull();
        expect(blockedReason(model, { [smoothies.id]: [{ variantId: beet.id, quantity: 3 }] }, smoothies, beet)).toBe('stock');

        const straw = variant(smoothies, 'strawberries-cream');
        expect(blockedReason(model, { [smoothies.id]: [{ variantId: straw.id, quantity: 6 }] }, smoothies, variant(smoothies, 'pineapple-mango'))).toBe('step-full');
    });
});

describe('missingPicks', () => {
    it('names the step that still needs picks, and ignores an optional step', async () => {
        const { model, smoothies, variant } = await setUp();
        const one = { [smoothies.id]: [{ variantId: variant(smoothies, 'strawberries-cream').id, quantity: 1 }] };
        expect(missingPicks(model, one)).toEqual([{ section: smoothies, count: 2 }]);
        const three = { [smoothies.id]: [{ variantId: variant(smoothies, 'strawberries-cream').id, quantity: 3 }] };
        expect(missingPicks(model, three)).toEqual([]);
    });

    it('agrees with the SDK: no missing picks means the SDK will accept it', async () => {
        const { model, smoothies, variant } = await setUp();
        const builder = createBundleBuilder(model.bundle);
        builder.addItem(smoothies.id, variant(smoothies, 'strawberries-cream').id, 3);
        expect(missingPicks(model, builder.getState().selections)).toEqual([]);
        expect(builder.getState().isSatisfied).toBe(true);
    });
});

describe('a bundle-wide count with a required product', () => {
    it('counts the required product, as the SDK does: "exactly 4" with 1 required needs 3 picks', async () => {
        const { bundle, settings } = await load((fixture) => ({
            ...fixture,
            bundle: { ...fixture.bundle, limitRules: [{ operation: 'eq', sectionId: null, type: 'total-number-of-products', value: '4.00' }] },
        }));
        const model = toViewModel(withRequiredVariantIds(bundle), { settings });
        expect(model.requiredCount).toBe(1);
        const smoothies = model.sections[0]!;
        const straw = smoothies.products.find((product) => product.handle === 'strawberries-cream')!.variants[0]!;
        const three = { [smoothies.id]: [{ variantId: straw.id, quantity: 3 }] };
        expect(missingPicks(model, three)).toEqual([]);
        expect(blockedReason(model, three, smoothies, smoothies.products[1]!.variants[0]!)).toBe('bundle-full');

        const builder = createBundleBuilder(model.bundle);
        builder.addItem(smoothies.id, straw.id, 3);
        expect(builder.getState().isSatisfied).toBe(true);
    });
});

describe('clampSeed', () => {
    it('drops what the shopper could not pick by hand: sold out, over stock, over a step maximum', async () => {
        const { model, smoothies, shots, variant } = await setUp();
        const sold = shots.products.find((product) => product.soldOut)!.variants[0]!;
        const seed = {
            [smoothies.id]: [
                { variantId: variant(smoothies, 'beetroot-berry').id, quantity: 5 }, // stock 3
                { variantId: variant(smoothies, 'strawberries-cream').id, quantity: 9 }, // step max 6
                { variantId: 'gid-the-bundle-no-longer-offers', quantity: 1 },
            ],
            [shots.id]: [{ variantId: sold.id, quantity: 1 }],
        };
        expect(clampSeed(model, seed)).toEqual({
            [smoothies.id]: [
                { variantId: variant(smoothies, 'beetroot-berry').id, quantity: 3 },
                { variantId: variant(smoothies, 'strawberries-cream').id, quantity: 3 },
            ],
        });
    });
});
