/*
 * What this widget takes from the SDK on trust.
 *
 * None of this is the widget's code. Each case is a behaviour the widget has no fallback for, so
 * an SDK upgrade that changes one fails here, by name, rather than as a wrong count on the page.
 */
import { createBundleBuilder } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { load } from './support';

type Loaded = Awaited<ReturnType<typeof load>>['bundle'];
const steps = (bundle: Loaded) => bundle.sections as [Loaded['sections'][number], Loaded['sections'][number], Loaded['sections'][number]];
const variantOf = (section: Loaded['sections'][number], handle: string, index = 0) => section.products.find((product) => product.handle === handle)!.variants[index]!;

describe('the SDK contract this widget relies on', () => {
    it('counts a required product in a bundle-wide count: "exactly 4" with 1 required is 3 picks, and a 4th is refused', async () => {
        const { bundle } = await load((fixture) => {
            const id = fixture.products.find((product) => product.handle === 'botanical-bath-soak')!.shopifyProductId;
            return {
                ...fixture,
                bundle: {
                    ...fixture.bundle,
                    sections: fixture.bundle.sections.map((section) => ({ ...section, products: section.products.filter((ref) => ref.shopifyProductId !== id) })),
                    requiredProducts: [{ quantity: 1, shopifyProductId: id, variantIds: [] }],
                    limitRules: [...fixture.bundle.limitRules, { operation: 'eq', sectionId: null, type: 'total-number-of-products', value: '4.00' }],
                },
            };
        });
        const [boxes, fill] = steps(bundle);
        const builder = createBundleBuilder(bundle);
        expect(builder.getState().progress).toMatchObject({ quantity: 1, requiredQuantity: 1, missing: 3 });

        builder.addItem(boxes.id, variantOf(boxes, 'keepsake-gift-box').id, 1);
        builder.addItem(fill.id, variantOf(fill, 'hand-poured-soy-candle').id, 2);
        expect(builder.getState().isSatisfied).toBe(true);
        expect(builder.blockedReason(fill.id, variantOf(fill, 'loose-leaf-tea-tin').id)).toBe('bundle-full');
    });

    it('trims an opening selection (a basket Edit) to what could be picked by hand: nothing sold out, over stock or over a step maximum', async () => {
        const { bundle } = await load();
        const [, fill, cards] = steps(bundle);
        const builder = createBundleBuilder(bundle, {
            initialSelections: {
                [fill.id]: [
                    { variantId: variantOf(fill, 'small-batch-chocolate-bar').id, quantity: 5 }, // stock 3
                    { variantId: variantOf(fill, 'hand-poured-soy-candle').id, quantity: 9 }, // step max 5
                    { variantId: 'gid-the-bundle-no-longer-offers', quantity: 1 },
                ],
                [cards.id]: [{ variantId: variantOf(cards, 'get-well-soon-letterpress-card').id, quantity: 1 }],
            },
        });
        expect(builder.getState().selections).toEqual({
            [fill.id]: [
                { variantId: variantOf(fill, 'small-batch-chocolate-bar').id, quantity: 3 },
                { variantId: variantOf(fill, 'hand-poured-soy-candle').id, quantity: 2 },
            ],
        });
    });

    it('replaces the one choice of a full step with a swap, where an add beside it is refused, and says so when the swap is', async () => {
        const { bundle } = await load();
        const [, , cards] = steps(bundle);
        const love = variantOf(cards, 'with-love-letterpress-card');
        const home = variantOf(cards, 'new-home-letterpress-card');
        const sold = variantOf(cards, 'get-well-soon-letterpress-card');
        const builder = createBundleBuilder(bundle);
        builder.addItem(cards.id, love.id, 1);
        expect(builder.addItem(cards.id, home.id, 1)).toBe(0);

        expect(builder.swapItem(cards.id, love.id, sold.id)).toBe(false);
        expect(builder.getState().selections[cards.id]).toEqual([{ variantId: love.id, quantity: 1 }]);
        expect(builder.swapItem(cards.id, love.id, home.id)).toBe(true);
        expect(builder.getState().selections[cards.id]).toEqual([{ variantId: home.id, quantity: 1 }]);
    });
});
