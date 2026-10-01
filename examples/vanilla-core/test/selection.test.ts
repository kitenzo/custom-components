import { createBundleBuilder } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { toViewModel } from '../src/model';
import { withRequiredVariantIds } from '../src/sdkFixes';
import { blockedReason, clampSeed, createSelection, missingPicks } from '../src/selection';
import { load, withRequired } from './support';

async function setUp() {
    const { bundle, settings } = await load();
    const model = toViewModel(withRequiredVariantIds(bundle), { settings });
    const wines = model.sections[0]!;
    const variant = (handle: string) => wines.products.find((product) => product.handle === handle)!.variants[0]!;
    return { model, wines, variant };
}

describe('blockedReason', () => {
    it('explains why one more cannot go in, sold out first', async () => {
        const { model, wines, variant } = await setUp();
        expect(blockedReason(model, {}, wines, variant('californian-semillion'))).toBe('sold-out');

        const verdelho = variant('californian-verdelho'); // stock 3 in the catalogue
        expect(blockedReason(model, { [wines.id]: [{ variantId: verdelho.id, quantity: 2 }] }, wines, verdelho)).toBeNull();
        expect(blockedReason(model, { [wines.id]: [{ variantId: verdelho.id, quantity: 3 }] }, wines, verdelho)).toBe('stock');

        const full = { [wines.id]: [{ variantId: variant('californian-reisling').id, quantity: 6 }] };
        expect(blockedReason(model, full, wines, variant('pinot-gris'))).toBe('step-full');
    });
});

describe('missingPicks', () => {
    it('counts what the case still needs', async () => {
        const { model, wines, variant } = await setUp();
        const four = { [wines.id]: [{ variantId: variant('californian-reisling').id, quantity: 4 }] };
        expect(missingPicks(model, four)).toEqual([{ section: wines, count: 2 }]);
        const six = { [wines.id]: [{ variantId: variant('californian-reisling').id, quantity: 6 }] };
        expect(missingPicks(model, six)).toEqual([]);
    });

    it('agrees with the SDK: no missing picks means the SDK will accept it', async () => {
        const { model, wines, variant } = await setUp();
        const builder = createBundleBuilder(model.bundle);
        builder.addItem(wines.id, variant('californian-reisling').id, 5);
        expect(builder.getState().isSatisfied).toBe(false);
        builder.addItem(wines.id, variant('pinot-gris').id, 1);
        expect(missingPicks(model, builder.getState().selections)).toEqual([]);
        expect(builder.getState().isSatisfied).toBe(true);
    });
});

describe('a required bottle', () => {
    it('counts against a bundle-wide case, as the SDK does: "exactly 6" with 1 required needs 5 picks', async () => {
        const { bundle, settings } = await load((fixture) => {
            const required = withRequired(fixture, 'pinot-gris');
            return { ...required, bundle: { ...required.bundle, limitRules: [{ operation: 'eq', sectionId: null, type: 'total-number-of-products', value: '6.00' }] } };
        });
        const model = toViewModel(withRequiredVariantIds(bundle), { settings });
        expect(model.requiredCount).toBe(1);
        const wines = model.sections[0]!;
        const riesling = wines.products.find((product) => product.handle === 'californian-reisling')!.variants[0]!;
        const five = { [wines.id]: [{ variantId: riesling.id, quantity: 5 }] };
        expect(missingPicks(model, five)).toEqual([]);
        expect(blockedReason(model, five, wines, wines.products[0]!.variants[0]!)).toBe('bundle-full');
        const builder = createBundleBuilder(model.bundle);
        builder.addItem(wines.id, riesling.id, 5);
        expect(builder.getState().isSatisfied).toBe(true);
    });
});

describe('clampSeed', () => {
    it('drops what the shopper could not pick by hand: sold out, over stock, over the case', async () => {
        const { model, wines, variant } = await setUp();
        const seed = {
            [wines.id]: [
                { variantId: variant('californian-verdelho').id, quantity: 5 }, // stock 3
                { variantId: variant('californian-semillion').id, quantity: 1 }, // sold out
                { variantId: variant('californian-reisling').id, quantity: 9 }, // the case holds 6
                { variantId: 'gid-the-bundle-no-longer-offers', quantity: 1 },
            ],
        };
        expect(clampSeed(model, seed)).toEqual({
            [wines.id]: [
                { variantId: variant('californian-verdelho').id, quantity: 3 },
                { variantId: variant('californian-reisling').id, quantity: 3 },
            ],
        });
    });
});

describe('createSelection', () => {
    it('is seeded at creation: the first snapshot already holds the restored case', async () => {
        const { model, wines, variant } = await setUp();
        const builder = createSelection(model, { [wines.id]: [{ variantId: variant('pinot-gris').id, quantity: 6 }] });
        expect(builder.getState().selections[wines.id]).toEqual([{ variantId: variant('pinot-gris').id, quantity: 6 }]);
        expect(builder.getState().isSatisfied).toBe(true);
    });
});
