import { createBundleBuilder } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { toViewModel } from '../src/model';
import { withRequiredVariantIds } from '../src/sdkFixes';
import { blockedReason, clampSeed, missingPicks } from '../src/selection';
import { load, soldOut, withProduct, withRequiredUnflavoured } from './support';

async function setUp(change?: Parameters<typeof load>[0]) {
    const { bundle, settings } = await load(change);
    const model = toViewModel(withRequiredVariantIds(bundle), { settings });
    const flavours = model.sections[0]!;
    const variant = (handle: string) => flavours.products.find((product) => product.handle === handle)!.variants[0]!;
    return { model, flavours, variant };
}

describe('blockedReason', () => {
    it('explains why one more cannot go in, sold out first', async () => {
        const { model, flavours, variant } = await setUp((fixture) => withProduct(fixture, 'vanilla-whey-protein', soldOut));
        expect(blockedReason(model, {}, flavours, variant('vanilla-whey-protein'))).toBe('sold-out');

        const peanut = variant('peanut-butter-whey-protein'); // stock 3 in the catalogue
        expect(blockedReason(model, { [flavours.id]: [{ variantId: peanut.id, quantity: 2 }] }, flavours, peanut)).toBeNull();
        expect(blockedReason(model, { [flavours.id]: [{ variantId: peanut.id, quantity: 3 }] }, flavours, peanut)).toBe('stock');
    });

    it('never calls the bundle full: it has no maximum, so the ladder can always be climbed', async () => {
        const { model, flavours, variant } = await setUp();
        const choc = variant('chocolate-whey-protein');
        expect(blockedReason(model, { [flavours.id]: [{ variantId: choc.id, quantity: 40 }] }, flavours, variant('vanilla-whey-protein'))).toBeNull();
    });

    it('calls it full at a maximum the merchant adds', async () => {
        const { model, flavours, variant } = await setUp((fixture) => ({
            ...fixture,
            bundle: { ...fixture.bundle, limitRules: [...fixture.bundle.limitRules, { operation: 'lte', sectionId: null, type: 'total-number-of-products', value: '4.00' }] },
        }));
        const choc = variant('chocolate-whey-protein');
        expect(blockedReason(model, { [flavours.id]: [{ variantId: choc.id, quantity: 4 }] }, flavours, variant('vanilla-whey-protein'))).toBe('bundle-full');
    });
});

describe('missingPicks', () => {
    it('counts the bundle-wide minimum: one pouch is one short', async () => {
        const { model, flavours, variant } = await setUp();
        const one = { [flavours.id]: [{ variantId: variant('chocolate-whey-protein').id, quantity: 1 }] };
        expect(missingPicks(model, one)).toEqual([{ section: null, count: 1 }]);
        const two = { [flavours.id]: [{ variantId: variant('chocolate-whey-protein').id, quantity: 2 }] };
        expect(missingPicks(model, two)).toEqual([]);
    });

    it('agrees with the SDK: no missing picks means the SDK will accept it', async () => {
        const { model, flavours, variant } = await setUp();
        const builder = createBundleBuilder(model.bundle);
        builder.addItem(flavours.id, variant('chocolate-whey-protein').id, 1);
        builder.addItem(flavours.id, variant('vanilla-whey-protein').id, 1);
        expect(missingPicks(model, builder.getState().selections)).toEqual([]);
        expect(builder.getState().isSatisfied).toBe(true);
    });
});

describe('clampSeed', () => {
    it('drops what the shopper could not pick by hand: sold out, over stock, no longer offered', async () => {
        const { model, flavours, variant } = await setUp((fixture) => withProduct(fixture, 'vanilla-whey-protein', soldOut));
        const seed = {
            [flavours.id]: [
                { variantId: variant('peanut-butter-whey-protein').id, quantity: 5 }, // stock 3
                { variantId: variant('chocolate-whey-protein').id, quantity: 9 }, // no maximum: all 9 stay
                { variantId: variant('vanilla-whey-protein').id, quantity: 1 }, // sold out
                { variantId: 'gid-the-bundle-no-longer-offers', quantity: 1 },
            ],
        };
        expect(clampSeed(model, seed)).toEqual({
            [flavours.id]: [
                { variantId: variant('peanut-butter-whey-protein').id, quantity: 3 },
                { variantId: variant('chocolate-whey-protein').id, quantity: 9 },
            ],
        });
    });
});

describe('a bundle-wide count with a required product', () => {
    it('counts the required product, as the SDK does: "at least 2" with 1 included needs 1 pick, "at most 4" fills at 3', async () => {
        const { model, flavours, variant } = await setUp((fixture) => {
            const changed = withRequiredUnflavoured(fixture);
            return {
                ...changed,
                bundle: { ...changed.bundle, limitRules: [...changed.bundle.limitRules, { operation: 'lte', sectionId: null, type: 'total-number-of-products', value: '4.00' }] },
            };
        });
        expect(model.requiredCount).toBe(1);
        const one = { [flavours.id]: [{ variantId: variant('chocolate-whey-protein').id, quantity: 1 }] };
        expect(missingPicks(model, one)).toEqual([]);
        const three = { [flavours.id]: [{ variantId: variant('chocolate-whey-protein').id, quantity: 3 }] };
        expect(blockedReason(model, three, flavours, variant('vanilla-whey-protein'))).toBe('bundle-full');

        const builder = createBundleBuilder(model.bundle);
        builder.addItem(flavours.id, variant('chocolate-whey-protein').id, 1);
        expect(builder.getState().isSatisfied).toBe(true);
    });
});
