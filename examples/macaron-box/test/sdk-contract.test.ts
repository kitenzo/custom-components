/*
 * What this widget takes from the SDK on trust.
 *
 * None of this is the widget's code. Each case is a behaviour the widget has no fallback for, so
 * an SDK upgrade that changes one fails here, by name, rather than as a wrong count on the page.
 */
import { calculatePrice, createBundleBuilder } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { load, withRequired } from './support';

describe('the SDK contract this widget relies on', () => {
    it('reads "6, 12 or 24" as alternatives, and takes a seventh: holding the shopper to the box they chose is the widget\'s', async () => {
        const { bundle } = await load();
        const box = bundle.sections[0]!;
        const builder = createBundleBuilder(bundle);
        builder.addItem(box.id, box.products[0]!.variants[0]!.id, 6);
        expect(builder.getState().isSatisfied).toBe(true);
        expect(builder.blockedReason(box.id, box.products[1]!.variants[0]!.id)).toBeNull();
        // `addItem` answers with how many went in: "Fill the rest" plans on that answer.
        expect(builder.addItem(box.id, box.products[1]!.variants[0]!.id, 1)).toBe(1);
        expect(builder.getState().isSatisfied).toBe(false);
        expect(builder.addItem(box.id, box.products[0]!.variants[0]!.id, 30)).toBe(17);
        expect(builder.addItem(box.id, box.products[1]!.variants[0]!.id, 1)).toBe(0);
    });

    it('counts a required product in a bundle-wide count: "exactly 7" with 1 required is 6 picks, and a 7th is refused', async () => {
        const { bundle } = await load((fixture) => {
            const withToffee = withRequired(fixture, 'english-toffee');
            return { ...withToffee, bundle: { ...withToffee.bundle, limitRules: [{ operation: 'eq', sectionId: null, type: 'total-number-of-products', value: '7.00' }] } };
        });
        const box = bundle.sections[0]!;
        const builder = createBundleBuilder(bundle);
        expect(builder.getState().progress).toMatchObject({ quantity: 1, requiredQuantity: 1, missing: 6 });

        builder.addItem(box.id, box.products[0]!.variants[0]!.id, 6);
        expect(builder.getState().isSatisfied).toBe(true);
        expect(builder.blockedReason(box.id, box.products[1]!.variants[0]!.id)).toBe('bundle-full');
    });

    it('trims an opening selection (a basket Edit) to what could be picked by hand: nothing sold out, over stock or over the largest box', async () => {
        const { bundle } = await load();
        const box = bundle.sections[0]!;
        const variant = (handle: string) => box.products.find((product) => product.handle === handle)!.variants[0]!;
        const builder = createBundleBuilder(bundle, {
            initialSelections: {
                [box.id]: [
                    { variantId: variant('rose-macaron').id, quantity: 5 }, // stock 4
                    { variantId: variant('vanilla-macaron').id, quantity: 30 }, // step max 24
                    { variantId: variant('lavender-macaron').id, quantity: 1 }, // sold out
                    { variantId: 'gid-the-bundle-no-longer-offers', quantity: 1 },
                ],
            },
        });
        expect(builder.getState().selections).toEqual({
            [box.id]: [
                { variantId: variant('rose-macaron').id, quantity: 4 },
                { variantId: variant('vanilla-macaron').id, quantity: 20 },
            ],
        });
    });

    // The demo bundle prices its sizes with three "at least N" set-price tiers, and a box of 24
    // matches all three at once. Which operator charges the right one is the catalogue's choice
    // (dev/catalog.ts) and the merchant's (MERCHANT-SETUP.md).
    it("charges the tier a box reaches under 'max' (£6.50, £12.00, £22.00), and every tier it passes under 'cumulative'", async () => {
        const priceOf = async (operator: 'max' | 'cumulative', size: number) => {
            const { bundle } = await load((fixture) => ({ ...fixture, bundle: { ...fixture.bundle, discount: { ...fixture.bundle.discount!, operator } } }));
            const box = bundle.sections[0]!;
            return calculatePrice(bundle, { [box.id]: [{ variantId: box.products[0]!.variants[0]!.id, quantity: size }] }).discountedPrice;
        };
        expect(await Promise.all([6, 12, 24].map((size) => priceOf('max', size)))).toEqual(['6.50', '12.00', '22.00']);
        expect(await Promise.all([6, 12, 24].map((size) => priceOf('cumulative', size)))).toEqual(['6.50', '18.50', '40.50']);
    });
});
