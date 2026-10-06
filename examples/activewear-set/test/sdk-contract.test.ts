/*
 * What this widget takes from the SDK on trust.
 *
 * None of this is the widget's code. Each case is a behaviour the widget has no fallback for, so
 * an SDK upgrade that changes one fails here, by name, rather than as a wrong set on the page.
 */
import { createBundleBuilder } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { load } from './support';

async function setUp() {
    const { bundle } = await load();
    const [top, bra, leggings] = bundle.sections as [(typeof bundle.sections)[number], (typeof bundle.sections)[number], (typeof bundle.sections)[number]];
    const variant = (section: typeof top, title: string) => section.products[0]!.variants.find((candidate) => candidate.title === title)!;
    return { bundle, top, bra, leggings, variant };
}

describe('the SDK contract this widget relies on', () => {
    it('swaps a piece in a step that is full of it, where an add beside it is refused', async () => {
        const { bundle, leggings, variant } = await setUp();
        const builder = createBundleBuilder(bundle);
        builder.addItem(leggings.id, variant(leggings, 'XS / Onyx').id, 1);
        expect(builder.blockedReason(leggings.id, variant(leggings, 'XS / Slate').id)).toBe('section-full');
        expect(builder.addItem(leggings.id, variant(leggings, 'XS / Slate').id, 1)).toBe(0);

        expect(builder.swapBlockedReason(leggings.id, variant(leggings, 'XS / Onyx').id, variant(leggings, 'XS / Slate').id)).toBeNull();
        expect(builder.swapItem(leggings.id, variant(leggings, 'XS / Onyx').id, variant(leggings, 'XS / Slate').id)).toBe(true);
        expect(builder.getState().selections[leggings.id]).toEqual([{ variantId: variant(leggings, 'XS / Slate').id, quantity: 1 }]);
    });

    it('leaves a refused swap where it was, so the reason asked afterwards is the one that refused it', async () => {
        const { bundle, leggings, variant } = await setUp();
        const builder = createBundleBuilder(bundle);
        builder.addItem(leggings.id, variant(leggings, 'XS / Onyx').id, 1);
        expect(builder.swapItem(leggings.id, variant(leggings, 'XS / Onyx').id, variant(leggings, 'XS / Moss').id)).toBe(false);
        expect(builder.swapBlockedReason(leggings.id, variant(leggings, 'XS / Onyx').id, variant(leggings, 'XS / Moss').id)).toBe('sold-out');
        expect(builder.getState().selections[leggings.id]).toEqual([{ variantId: variant(leggings, 'XS / Onyx').id, quantity: 1 }]);
    });

    it('trims an opening selection (a basket Edit) to what could be picked by hand: nothing sold out, over a step maximum or not offered', async () => {
        const { bundle, top, bra, leggings, variant } = await setUp();
        const builder = createBundleBuilder(bundle, {
            initialSelections: {
                [top.id]: [
                    { variantId: variant(top, 'M / Onyx').id, quantity: 3 }, // one per step
                    { variantId: variant(top, 'S / Onyx').id, quantity: 1 }, // the step is already full
                ],
                [bra.id]: [{ variantId: variant(bra, 'L / Bone').id, quantity: 1 }], // sold out
                [leggings.id]: [{ variantId: 'gid-the-bundle-no-longer-offers', quantity: 1 }],
            },
        });
        const held = Object.fromEntries(Object.entries(builder.getState().selections).filter(([, picks]) => picks.length > 0));
        expect(held).toEqual({ [top.id]: [{ variantId: variant(top, 'M / Onyx').id, quantity: 1 }] });
    });
});
