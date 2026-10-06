/*
 * What this widget takes from the SDK on trust.
 *
 * None of this is the widget's code. Each case is a behaviour the widget has no fallback for, so
 * an SDK upgrade that changes one fails here, by name, rather than as a wrong count on the page.
 */
import { createBundleBuilder, isVariantBuyable } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { load } from './support';

describe('the SDK contract this widget relies on', () => {
    it('counts a required product in a bundle-wide count: "exactly 4" with 1 required is 3 picks, and a 4th is refused', async () => {
        const { bundle } = await load((fixture) => ({
            ...fixture,
            bundle: { ...fixture.bundle, limitRules: [{ operation: 'eq', sectionId: null, type: 'total-number-of-products', value: '4.00' }] },
        }));
        const smoothies = bundle.sections[0]!;
        const builder = createBundleBuilder(bundle);
        expect(builder.getState().progress).toMatchObject({ quantity: 1, requiredQuantity: 1, missing: 3 });

        builder.addItem(smoothies.id, smoothies.products[0]!.variants[0]!.id, 3);
        expect(builder.getState().isSatisfied).toBe(true);
        expect(builder.blockedReason(smoothies.id, smoothies.products[1]!.variants[0]!.id)).toBe('bundle-full');
    });

    it('trims an opening selection (a basket Edit) to what could be picked by hand: nothing sold out, over stock or over a step maximum', async () => {
        const { bundle } = await load();
        const [smoothies, shots] = bundle.sections as [(typeof bundle.sections)[number], (typeof bundle.sections)[number]];
        const variant = (handle: string) => smoothies.products.find((product) => product.handle === handle)!.variants[0]!;
        const sold = shots.products.find((product) => !product.variants.some(isVariantBuyable))!.variants[0]!;
        const builder = createBundleBuilder(bundle, {
            initialSelections: {
                [smoothies.id]: [
                    { variantId: variant('beetroot-berry').id, quantity: 5 }, // stock 3
                    { variantId: variant('strawberries-cream').id, quantity: 9 }, // step max 6
                    { variantId: 'gid-the-bundle-no-longer-offers', quantity: 1 },
                ],
                [shots.id]: [{ variantId: sold.id, quantity: 1 }],
            },
        });
        expect(builder.getState().selections).toEqual({
            [smoothies.id]: [
                { variantId: variant('beetroot-berry').id, quantity: 3 },
                { variantId: variant('strawberries-cream').id, quantity: 3 },
            ],
        });
    });

    it('treats a step with no count rule as optional: nothing owed, and the bundle can be bought without it', async () => {
        const { bundle } = await load((fixture) => ({ ...fixture, bundle: { ...fixture.bundle, limitRules: fixture.bundle.limitRules.filter((rule) => rule.sectionId !== fixture.bundle.sections[1]!.id) } }));
        const [smoothies, shots] = bundle.sections as [(typeof bundle.sections)[number], (typeof bundle.sections)[number]];
        const builder = createBundleBuilder(bundle);
        expect(builder.getState().progress.sections[shots.id]).toEqual({ quantity: 0, missing: 0 });
        builder.addItem(smoothies.id, smoothies.products[0]!.variants[0]!.id, 3);
        expect(builder.getState().isSatisfied).toBe(true);
    });
});
