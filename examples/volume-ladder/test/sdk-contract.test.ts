/*
 * What this widget takes from the SDK on trust.
 *
 * None of this is the widget's code. Each case is a behaviour the widget has no fallback for, so
 * an SDK upgrade that changes one fails here, by name, rather than as a wrong row on the ladder.
 */
import { createBundleBuilder, getBundlePrice, getDiscountLadder, getDiscountLadderProgress, isVariantBuyable } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { load, soldOut, withProduct, withRequiredUnflavoured } from './support';

describe('the SDK contract this widget relies on', () => {
    it('counts a product every bundle includes, on the ladder and in the selection alike', async () => {
        const { bundle } = await load(withRequiredUnflavoured);
        expect(getDiscountLadder(bundle).map((rung) => rung.count)).toEqual([2, 3, 4, 6]);
        const flavours = bundle.sections[0]!;
        const builder = createBundleBuilder(bundle);
        expect(builder.getState().progress).toMatchObject({ quantity: 1, requiredQuantity: 1, missing: 1 });
        builder.addItem(flavours.id, flavours.products[0]!.variants[0]!.id, 1);
        // One pick and the included pouch stand on the "2" rung.
        expect(getDiscountLadderProgress(bundle, builder.getState().progress.quantity).current?.count).toBe(2);
        expect(builder.getState().isSatisfied).toBe(true);
    });

    it('says how many more the next rung takes across a gap in the tiers', async () => {
        const { bundle } = await load();
        const at = (count: number) => {
            const progress = getDiscountLadderProgress(bundle, count);
            return [progress.current?.count ?? null, progress.next?.count ?? null, progress.missing];
        };
        expect(at(1)).toEqual([null, 2, 1]);
        // There is no tier at 5, so 4 needs two more and 5 earns nothing new.
        expect(at(4)).toEqual([4, 6, 2]);
        expect(at(5)).toEqual([4, 6, 1]);
        expect(at(9)).toEqual([6, null, 0]);
    });

    it('ends an "exactly 6" tier with a rung that starts no tier, at the discount that applies again', async () => {
        const { bundle } = await load((fixture) => ({
            ...fixture,
            bundle: {
                ...fixture.bundle,
                discount: {
                    ...fixture.bundle.discount!,
                    tiers: [
                        { type: 'total_products', operation: 'gte', value: '2.00', discount: '10.00', customText: null },
                        { type: 'total_products', operation: 'eq', value: '6.00', discount: '25.00', customText: null },
                    ],
                },
            },
        }));
        expect(getDiscountLadder(bundle).map((rung) => [rung.count, rung.discount, rung.exact, rung.tier !== null])).toEqual([
            [2, 10, false, true],
            [6, 25, true, true],
            [7, 10, false, false],
        ]);
        expect(getDiscountLadderProgress(bundle, 7).current).toMatchObject({ count: 7, discount: 10, tier: null });
    });

    it('prices a selection the shopper has not made, in the shopper\'s currency with its decimals', async () => {
        const { bundle, settings } = await load(undefined, { market: { countryCode: 'JP', currency: 'JPY', rate: 190, decimals: 0 } }, 'JP');
        const flavours = bundle.sections[0]!;
        const price = getBundlePrice(bundle, { [flavours.id]: [{ variantId: flavours.products[0]!.variants[0]!.id, quantity: 2 }] }, { settings, locale: 'en' });
        // 9.99 is ¥1898 in this market; two at 10% off, in yen with no decimals.
        expect(price.amounts).toEqual({ original: 3796, discounted: 3416, saved: 380 });
        expect(price.formattedSavedAmount).toBe('¥380');
    });

    it('trims an opening selection (a basket Edit) to what could be picked by hand: nothing sold out, over stock or no longer offered', async () => {
        const { bundle } = await load((fixture) => withProduct(fixture, 'vanilla-whey-protein', soldOut));
        const flavours = bundle.sections[0]!;
        const variant = (handle: string) => flavours.products.find((product) => product.handle === handle)!.variants[0]!;
        expect(isVariantBuyable(variant('vanilla-whey-protein'))).toBe(false);
        const builder = createBundleBuilder(bundle, {
            initialSelections: {
                [flavours.id]: [
                    { variantId: variant('peanut-butter-whey-protein').id, quantity: 5 }, // stock 3
                    { variantId: variant('chocolate-whey-protein').id, quantity: 9 }, // no maximum: all 9 stay
                    { variantId: variant('vanilla-whey-protein').id, quantity: 1 },
                    { variantId: 'gid-the-bundle-no-longer-offers', quantity: 1 },
                ],
            },
        });
        expect(builder.getState().selections).toEqual({
            [flavours.id]: [
                { variantId: variant('peanut-butter-whey-protein').id, quantity: 3 },
                { variantId: variant('chocolate-whey-protein').id, quantity: 9 },
            ],
        });
    });
});
