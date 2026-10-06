/*
 * What this widget takes from the SDK on trust.
 *
 * None of this is the widget's code. Each case is a behaviour the widget has no fallback for, so
 * an SDK upgrade that changes one fails here, by name, rather than as a wrong count on the page.
 */
import { createBundleBuilder } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { countRule, load, withRequired } from './support';

describe('the SDK contract this widget relies on', () => {
    it('counts a required bottle in a bundle-wide count: "exactly 6" with 1 required is 5 picks, and a 6th is refused', async () => {
        const { bundle } = await load((fixture) => {
            const required = withRequired(fixture, 'pinot-gris');
            return { ...required, bundle: { ...required.bundle, limitRules: [countRule('eq', 6, null)] } };
        });
        const wines = bundle.sections[0]!;
        const builder = createBundleBuilder(bundle);
        expect(builder.getState().progress).toMatchObject({ quantity: 1, requiredQuantity: 1, missing: 5 });

        builder.addItem(wines.id, wines.products[0]!.variants[0]!.id, 5);
        expect(builder.getState().isSatisfied).toBe(true);
        expect(builder.blockedReason(wines.id, wines.products[1]!.variants[0]!.id)).toBe('bundle-full');
    });

    it('stops adding a required bottle the shopper picked themselves, which is why the case is measured on every update', async () => {
        const { bundle } = await load((fixture) => {
            const required = withRequired(fixture, 'pinot-gris');
            return { ...required, bundle: { ...required.bundle, sections: fixture.bundle.sections } };
        });
        const wines = bundle.sections[0]!;
        const builder = createBundleBuilder(bundle);
        expect(builder.getState().progress.requiredQuantity).toBe(1);
        builder.addItem(wines.id, wines.products.find((product) => product.handle === 'pinot-gris')!.variants[0]!.id, 1);
        expect(builder.getState().progress).toMatchObject({ quantity: 1, requiredQuantity: 0 });
    });

    it('trims an opening selection (a basket Edit) to what could be picked by hand: nothing sold out, over stock or over the case', async () => {
        const { bundle } = await load();
        const wines = bundle.sections[0]!;
        const variant = (handle: string) => wines.products.find((product) => product.handle === handle)!.variants[0]!;
        const builder = createBundleBuilder(bundle, {
            initialSelections: {
                [wines.id]: [
                    { variantId: variant('californian-verdelho').id, quantity: 5 }, // stock 3
                    { variantId: variant('californian-semillion').id, quantity: 1 }, // sold out
                    { variantId: variant('californian-reisling').id, quantity: 9 }, // the case holds 6
                    { variantId: 'gid-the-bundle-no-longer-offers', quantity: 1 },
                ],
            },
        });
        expect(builder.getState().selections).toEqual({
            [wines.id]: [
                { variantId: variant('californian-verdelho').id, quantity: 3 },
                { variantId: variant('californian-reisling').id, quantity: 3 },
            ],
        });
    });
});
