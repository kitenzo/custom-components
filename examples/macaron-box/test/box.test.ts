import { calculatePrice } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { boxOffers, boxSection, boxSizes, overflowOf, reconcileOrder, sizeFor, trayColumns } from '../src/box';
import { toViewModel } from '../src/model';
import type { Fixture } from '../dev/mock/wire';
import { load } from './support';

async function modelOf(bundleId?: number, change?: (fixture: Fixture) => Fixture, behaviour = {}) {
    const { bundle, settings } = await load(change, behaviour, bundleId);
    return toViewModel(bundle, { settings });
}

const withRules = (rules: Fixture['bundle']['limitRules']) => (fixture: Fixture): Fixture => ({ ...fixture, bundle: { ...fixture.bundle, limitRules: rules } });
const eq = (value: number, sectionId: number | null = 21) => ({ operation: 'eq' as const, sectionId, type: 'total-number-of-products' as const, value: value.toFixed(2) });

describe('the tier operator (how the SDK combines "at least N" set-price tiers)', () => {
    // A box of 24 matches all three tiers at once. This pins down which operator prices it right.
    async function priceOf(operator: 'max' | 'cumulative', count: number) {
        const { bundle } = await load((fixture) => ({ ...fixture, bundle: { ...fixture.bundle, discount: { ...fixture.bundle.discount!, operator } } }));
        const section = bundle.sections[0]!;
        return calculatePrice(bundle, { [section.id]: [{ variantId: section.products[0]!.variants[0]!.id, quantity: count }] }).discountedPrice;
    }

    it("'max' charges the tier the box reaches: £6.50, £12.00, £22.00", async () => {
        expect(await priceOf('max', 6)).toBe('6.50');
        expect(await priceOf('max', 12)).toBe('12.00');
        expect(await priceOf('max', 24)).toBe('22.00');
    });

    it("'cumulative' would add every tier the box passes, and overcharge", async () => {
        expect(await priceOf('cumulative', 6)).toBe('6.50');
        expect(await priceOf('cumulative', 12)).toBe('18.50');
        expect(await priceOf('cumulative', 24)).toBe('40.50');
    });
});

describe('boxSizes', () => {
    it('reads 6, 12 and 24 off the eq rules of bundle 2001', async () => {
        const model = await modelOf();
        expect(boxSizes(model.bundle, model.sections[0]!.id)).toEqual([6, 12, 24]);
    });

    it('reads 4 and 8 off bundle 2002: two sizes, not three', async () => {
        const model = await modelOf(2002);
        expect(boxSizes(model.bundle, model.sections[0]!.id)).toEqual([4, 8]);
    });

    it('finds none in a range (bundle 2003), so the widget leaves the size chooser out', async () => {
        const model = await modelOf(2003);
        expect(boxSizes(model.bundle, model.sections[0]!.id)).toEqual([]);
        expect(boxSection(model)?.id).toBe(model.sections[0]!.id);
    });

    it('drops a size the other rules rule out, and duplicates, and sorts', async () => {
        const model = await modelOf(undefined, withRules([eq(24), eq(6), eq(12), eq(6), { operation: 'lte', sectionId: 21, type: 'total-number-of-products', value: '12.00' }]));
        expect(boxSizes(model.bundle, 21)).toEqual([6, 12]);
    });

    it('takes bundle-wide eq rules when the bundle has a single step', async () => {
        const model = await modelOf(undefined, withRules([eq(5, null), eq(10, null)]));
        expect(boxSizes(model.bundle, 21)).toEqual([5, 10]);
    });

    it('ignores eq rules of another type (weight, price)', async () => {
        const model = await modelOf(undefined, withRules([eq(6), { operation: 'eq', sectionId: 21, type: 'amount-of-weight', value: '2.00' }]));
        expect(boxSizes(model.bundle, 21)).toEqual([6]);
    });
});

describe('boxOffers', () => {
    it('prices each size with the SDK: the set price, the price before it, and per macaron', async () => {
        const model = await modelOf();
        const section = model.sections[0]!;
        const offers = boxOffers(model.bundle, section, boxSizes(model.bundle, section.id));
        expect(offers.map((offer) => [offer.size, offer.price, offer.compareAt, Number(offer.perItem.toFixed(3)), offer.exact])).toEqual([
            [6, 6.5, 7.2, 1.083, true],
            [12, 12, 14.4, 1, true],
            [24, 22, 28.8, 0.917, true],
        ]);
    });

    it("prices bundle 2002's two sizes from its own tiers", async () => {
        const model = await modelOf(2002);
        const section = model.sections[0]!;
        expect(boxOffers(model.bundle, section, [4, 8]).map((offer) => offer.price)).toEqual([4.5, 8.5]);
    });

    it('prices in the shopper\'s currency in a market, as the total will', async () => {
        const { bundle, settings } = await load(undefined, { market: { countryCode: 'DE', currency: 'EUR', rate: 1.17, decimals: 2 } }, undefined, 'DE');
        const model = toViewModel(bundle, { settings });
        const offers = boxOffers(model.bundle, model.sections[0]!, [6, 12, 24]);
        // Not 6.50 × 1.17: the market's per-macaron price is Shopify's rounded €1.40, and the SDK
        // scales the discount onto that, so this is the figure the total shows for a full box.
        expect(offers.map((offer) => offer.price.toFixed(2))).toEqual(['7.58', '14.00', '25.67']);
    });

    it('offers nothing to price when every flavour is sold out', async () => {
        const model = await modelOf(undefined, (fixture) => ({ ...fixture, products: fixture.products.map((product) => ({ ...product, variants: product.variants.map((variant) => ({ ...variant, available: false })) })) }));
        expect(boxOffers(model.bundle, model.sections[0]!, [6, 12, 24])).toEqual([]);
    });
});

describe('sizeFor and trayColumns', () => {
    it('picks the smallest box that holds a count', () => {
        expect(sizeFor([6, 12, 24], 1)).toBe(6);
        expect(sizeFor([6, 12, 24], 7)).toBe(12);
        expect(sizeFor([6, 12, 24], 30)).toBe(24);
        expect(sizeFor([], 3)).toBeNull();
    });

    it('lays a tray out in full rows', () => {
        expect([4, 6, 8, 12, 24].map(trayColumns)).toEqual([2, 3, 4, 4, 6]);
        expect(trayColumns(2)).toBe(2);
    });
});

describe('reconcileOrder', () => {
    const A = { sectionId: 1, variantId: 'a' };
    const B = { sectionId: 1, variantId: 'b' };

    it('appends new picks, keeps old ones where they are, and drops the newest of a variant that fell', () => {
        let order = reconcileOrder([], { 1: [{ variantId: 'a', quantity: 1 }] });
        order = reconcileOrder(order, { 1: [{ variantId: 'a', quantity: 1 }, { variantId: 'b', quantity: 1 }] });
        order = reconcileOrder(order, { 1: [{ variantId: 'a', quantity: 2 }, { variantId: 'b', quantity: 1 }] });
        expect(order).toEqual([A, B, A]);
        expect(reconcileOrder(order, { 1: [{ variantId: 'a', quantity: 1 }, { variantId: 'b', quantity: 1 }] })).toEqual([A, B]);
        expect(reconcileOrder(order, {})).toEqual([]);
    });

    it('takes out the macarons at the end when a box shrinks, newest first', () => {
        const order = [A, B, A, B, B];
        expect(overflowOf(order, 1, 3).map(({ index }) => index)).toEqual([4, 3]);
        expect(overflowOf(order, 1, 6)).toEqual([]);
    });
});
