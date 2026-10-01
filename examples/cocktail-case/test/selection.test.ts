import { createBundleBuilder } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { toViewModel } from '../src/model';
import { withRequiredVariantIds } from '../src/sdkFixes';
import { blockedReason, clampSeed, missingPicks } from '../src/selection';
import { load, withRequired } from './support';

async function setUp() {
    const { bundle, settings } = await load();
    const model = toViewModel(withRequiredVariantIds(bundle), { settings });
    const cans = model.sections[0]!;
    const variant = (handle: string) => cans.products.find((product) => product.handle === handle)!.variants[0]!;
    return { model, cans, variant };
}

describe('blockedReason', () => {
    it('explains why one more cannot go in: sold out first, then stock, then a full case', async () => {
        const { model, cans, variant } = await setUp();
        expect(blockedReason(model, {}, cans, variant('watermelon-basil'))).toBe('sold-out');

        const spicy = variant('spicy-pineapple-marg'); // stock 4 in the catalogue
        expect(blockedReason(model, { [cans.id]: [{ variantId: spicy.id, quantity: 3 }] }, cans, spicy)).toBeNull();
        expect(blockedReason(model, { [cans.id]: [{ variantId: spicy.id, quantity: 4 }] }, cans, spicy)).toBe('stock');

        const full = { [cans.id]: [{ variantId: variant('passionfruit-mojito').id, quantity: 24 }] };
        expect(blockedReason(model, full, cans, variant('pear-cardamom'))).toBe('bundle-full');
    });
});

describe('missingPicks', () => {
    it('counts what the case still needs bundle-wide, not per step', async () => {
        const { model, cans, variant } = await setUp();
        const four = { [cans.id]: [{ variantId: variant('passionfruit-mojito').id, quantity: 4 }] };
        expect(missingPicks(model, four)).toEqual([{ section: null, count: 2 }]);
        const six = { [cans.id]: [{ variantId: variant('passionfruit-mojito').id, quantity: 6 }] };
        expect(missingPicks(model, six)).toEqual([]);
    });

    it('agrees with the SDK: no missing picks means the SDK will accept it', async () => {
        const { model, cans, variant } = await setUp();
        const builder = createBundleBuilder(model.bundle);
        builder.addItem(cans.id, variant('passionfruit-mojito').id, 5);
        expect(builder.getState().isSatisfied).toBe(false);
        builder.addItem(cans.id, variant('pear-cardamom').id, 1);
        expect(missingPicks(model, builder.getState().selections)).toEqual([]);
        expect(builder.getState().isSatisfied).toBe(true);
    });
});

describe('required products', () => {
    it('counts them, as the SDK does: "6 to 24" with 1 required needs 5 picks and holds 23', async () => {
        const { bundle, settings } = await load((fixture) => withRequired(fixture, 'yuzu-elderflower'));
        const model = toViewModel(withRequiredVariantIds(bundle), { settings });
        expect(model.requiredCount).toBe(1);
        const cans = model.sections[0]!;
        const mojito = cans.products.find((product) => product.handle === 'passionfruit-mojito')!.variants[0]!;
        expect(missingPicks(model, { [cans.id]: [{ variantId: mojito.id, quantity: 5 }] })).toEqual([]);
        expect(blockedReason(model, { [cans.id]: [{ variantId: mojito.id, quantity: 23 }] }, cans, cans.products[1]!.variants[0]!)).toBe('bundle-full');

        const builder = createBundleBuilder(model.bundle);
        builder.addItem(cans.id, mojito.id, 5);
        expect(builder.getState().isSatisfied).toBe(true);
    });
});

describe('clampSeed', () => {
    it('drops what the shopper could not pick by hand: sold out, over stock, over the case maximum', async () => {
        const { model, cans, variant } = await setUp();
        const seed = {
            [cans.id]: [
                { variantId: variant('spicy-pineapple-marg').id, quantity: 6 }, // stock 4
                { variantId: variant('watermelon-basil').id, quantity: 2 }, // sold out
                { variantId: variant('passionfruit-mojito').id, quantity: 30 }, // case max 24
                { variantId: 'gid-the-bundle-no-longer-offers', quantity: 1 },
            ],
        };
        expect(clampSeed(model, seed)).toEqual({
            [cans.id]: [
                { variantId: variant('spicy-pineapple-marg').id, quantity: 4 },
                { variantId: variant('passionfruit-mojito').id, quantity: 20 },
            ],
        });
    });
});
