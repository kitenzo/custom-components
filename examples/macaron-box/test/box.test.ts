import { createBundleBuilder, createMoneyFormatter, getBundlePrice, getDiscountLadder } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { boxOffers, boxSection, boxSizes, flavourPricing, overflowOf, reconcileOrder, selectionsOf, sizeFor, trayColumns } from '../src/box';
import { toViewModel } from '../src/model';
import type { Fixture } from '../dev/mock/wire';
import { load, withProduct, withRequired } from './support';

async function modelOf(bundleId?: number, change?: (fixture: Fixture) => Fixture, behaviour = {}, countryCode?: string) {
    const { bundle, settings } = await load(change, behaviour, bundleId, countryCode);
    const model = toViewModel(bundle, settings);
    return { ...model, money: createMoneyFormatter(bundle, settings, { locale: 'en-GB' }), pricing: { settings, locale: 'en-GB' } };
}

const sizesOf = (model: Awaited<ReturnType<typeof modelOf>>) => boxSizes(model, model.sections[0]!);

const withRules = (rules: Fixture['bundle']['limitRules']) => (fixture: Fixture): Fixture => ({ ...fixture, bundle: { ...fixture.bundle, limitRules: rules } });
const eq = (value: number, sectionId: number | null = 21) => ({ operation: 'eq' as const, sectionId, type: 'total-number-of-products' as const, value: value.toFixed(2) });

describe('boxSizes', () => {
    it('draws 6, 12 and 24 for bundle 2001: the counts the SDK says are valid, not the 6 to 24 window', async () => {
        const model = await modelOf();
        expect(model.sections[0]!.limits).toMatchObject({ min: 6, max: 24, allowedCounts: [6, 12, 24] });
        expect(sizesOf(model)).toEqual([6, 12, 24]);
    });

    it('draws 4 and 8 for bundle 2002: two sizes, not three', async () => {
        expect(sizesOf(await modelOf(2002))).toEqual([4, 8]);
    });

    it('finds none in a range (bundle 2003), so the widget leaves the size chooser out', async () => {
        const model = await modelOf(2003);
        expect(sizesOf(model)).toEqual([]);
        expect(boxSection(model)?.id).toBe(model.sections[0]!.id);
    });

    it('takes bundle-wide exact counts when the bundle has a single step', async () => {
        expect(sizesOf(await modelOf(undefined, withRules([eq(5, null), eq(10, null)])))).toEqual([5, 10]);
    });

    it('takes what every box includes off a bundle-wide count: "exactly 7 or 13" with one included is a box of 6 or 12', async () => {
        const model = await modelOf(undefined, (fixture) => withRules([eq(7, null), eq(13, null)])(withRequired(fixture, 'english-toffee')));
        expect(sizesOf(model)).toEqual([6, 12]);
        // The SDK agrees that six picks are that box, full.
        const builder = createBundleBuilder(model.bundle);
        expect(builder.addItem(21, model.sections[0]!.products[0]!.variants[0]!.id, 6)).toBe(6);
        expect(builder.getState().isSatisfied).toBe(true);
    });
});

describe('boxOffers', () => {
    it('prices each size with the SDK: the set price, the price before it, and per macaron', async () => {
        const model = await modelOf();
        const offers = boxOffers(model.bundle, model.sections[0]!, sizesOf(model), model.money, model.pricing);
        expect(offers.map((offer) => [offer.size, offer.price, offer.compareAt, Number(offer.perItem.toFixed(3)), offer.exact])).toEqual([
            [6, 6.5, 7.2, 1.083, true],
            [12, 12, 14.4, 1, true],
            [24, 22, 28.8, 0.917, true],
        ]);
    });

    it("prices bundle 2002's two sizes from its own tiers", async () => {
        const model = await modelOf(2002);
        expect(boxOffers(model.bundle, model.sections[0]!, [4, 8], model.money, model.pricing).map((offer) => offer.price)).toEqual([4.5, 8.5]);
    });

    it('prices in the shopper\'s currency in a market, as the total will', async () => {
        const model = await modelOf(undefined, undefined, { market: { countryCode: 'DE', currency: 'EUR', rate: 1.17, decimals: 2 } }, 'DE');
        const offers = boxOffers(model.bundle, model.sections[0]!, [6, 12, 24], model.money, model.pricing);
        // Not 6.50 × 1.17: the market's per-macaron price is Shopify's rounded €1.40, and the SDK
        // scales the discount onto that, so this is the figure the total shows for a full box.
        expect(offers.map((offer) => offer.price.toFixed(2))).toEqual(['7.58', '14.00', '25.67']);
        expect(offers.map((offer) => offer.compareAt?.toFixed(2))).toEqual(['8.40', '16.80', '33.60']);
    });

    it('offers nothing to price when every flavour is sold out', async () => {
        const model = await modelOf(undefined, (fixture) => ({ ...fixture, products: fixture.products.map((product) => ({ ...product, variants: product.variants.map((variant) => ({ ...variant, available: false })) })) }));
        expect(boxOffers(model.bundle, model.sections[0]!, [6, 12, 24], model.money, model.pricing)).toEqual([]);
    });

    it('agrees with the SDK\'s discount ladder where the sizes are its rungs, and adds the price before the discount', async () => {
        const model = await modelOf();
        const rungs = getDiscountLadder(model.bundle);
        expect(rungs.map((rung) => [rung.count, rung.discount, rung.discountType])).toEqual([
            [6, 6.5, 'price'],
            [12, 12, 'price'],
            [24, 22, 'price'],
        ]);
        expect(boxOffers(model.bundle, model.sections[0]!, sizesOf(model), model.money, model.pricing).map((offer) => offer.price)).toEqual(rungs.map((rung) => rung.discount));
        // "Any 6 to 12 at 10% off" has no ladder at all, and its box still has a price.
        expect(getDiscountLadder((await modelOf(2003)).bundle)).toEqual([]);
    });
});

/** The demo box with a surcharge on some flavours, which the bundle applies. */
const withSurcharge = (surcharge: string, handles: string[] | 'all') => (fixture: Fixture): Fixture => ({
    ...fixture,
    bundle: { ...fixture.bundle, applyVariantSurcharges: true },
    products: fixture.products.map((product) => (handles === 'all' || handles.includes(product.handle) ? { ...product, variants: product.variants.map((variant) => ({ ...variant, surcharge })) } : product)),
});

describe('a box whose price depends on what goes in it', () => {
    it('is not exact at a set price when one flavour carries a surcharge, and starts from the box without it', async () => {
        // Vanilla is the first flavour and no cheaper or dearer than the rest before its surcharge.
        const model = await modelOf(undefined, withSurcharge('0.50', ['vanilla-macaron']));
        const box = model.sections[0]!;
        const offers = boxOffers(model.bundle, box, sizesOf(model), model.money, model.pricing);
        expect(offers.map((offer) => [offer.size, offer.price, offer.compareAt, offer.exact])).toEqual([
            [6, 6.5, 7.2, false],
            [12, 12, 14.4, false],
            [24, 22, 28.8, false],
        ]);
        // The SDK does charge more for the box of vanilla: the "from" is not a formality.
        const vanilla = getBundlePrice(model.bundle, { [box.id]: [{ variantId: box.products[0]!.variants[0]!.id, quantity: 6 }] }, model.pricing);
        expect(vanilla.amounts?.discounted).toBe(9.5);
        expect(flavourPricing(model.bundle, sizesOf(model), offers)).toBe('surcharge');
    });

    it('is exact when every flavour carries the same surcharge, which the price then includes', async () => {
        const model = await modelOf(undefined, withSurcharge('0.50', 'all'));
        const offers = boxOffers(model.bundle, model.sections[0]!, sizesOf(model), model.money, model.pricing);
        expect(offers.map((offer) => [offer.price, offer.exact])).toEqual([
            [9.5, true],
            [18, true],
            [34, true],
        ]);
        expect(flavourPricing(model.bundle, sizesOf(model), offers)).toBe('none');
    });

    it('starts from the cheapest flavour when a percentage comes off flavours priced apart', async () => {
        const percentage = (fixture: Fixture): Fixture => ({ ...fixture, bundle: { ...fixture.bundle, discount: { ...fixture.bundle.discount!, type: 'percentage', value: '10.00', flatOrTiered: 'flat', tiers: [] } } });
        const model = await modelOf(undefined, (fixture) => withProduct(percentage(fixture), 'pistachio-macaron', (product) => ({ ...product, variants: product.variants.map((variant) => ({ ...variant, price: '2.00' })) })));
        const offers = boxOffers(model.bundle, model.sections[0]!, [6], model.money, model.pricing);
        expect(offers.map((offer) => [Number(offer.price.toFixed(2)), offer.compareAt, offer.exact])).toEqual([[6.48, 7.2, false]]);
        // Each flavour's own price is what the shopper pays 90% of, so the cards show it.
        expect(flavourPricing(model.bundle, [6], offers)).toBe('price');
    });
});

describe('flavourPricing', () => {
    it('hides a flavour\'s price in a box sold at one price per size, and shows it where there are no sizes', async () => {
        const model = await modelOf();
        const offers = boxOffers(model.bundle, model.sections[0]!, sizesOf(model), model.money, model.pricing);
        expect(flavourPricing(model.bundle, sizesOf(model), offers)).toBe('none');
        expect(flavourPricing(model.bundle, [], [])).toBe('price');
        const loose = await modelOf(2003);
        expect(flavourPricing(loose.bundle, sizesOf(loose), [])).toBe('price');
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

    it('turns an order back into the quantities the builder holds', () => {
        expect(selectionsOf([A, B, A, { sectionId: 2, variantId: 'a' }])).toEqual({
            1: [{ variantId: 'a', quantity: 2 }, { variantId: 'b', quantity: 1 }],
            2: [{ variantId: 'a', quantity: 1 }],
        });
        expect(selectionsOf([])).toEqual({});
    });

    it('takes out the macarons at the end when a box shrinks, newest first', () => {
        const order = [A, B, A, B, B];
        expect(overflowOf(order, 1, 3).map(({ index }) => index)).toEqual([4, 3]);
        expect(overflowOf(order, 1, 6)).toEqual([]);
    });
});
