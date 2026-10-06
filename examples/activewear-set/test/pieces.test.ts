import { createBundleBuilder } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { toViewModel, type ViewSection } from '../src/model';
import { resolve } from '../src/options';
import { changePiece, pickedVariant, shownValues, shownVariant } from '../src/pieces';
import { load } from './support';

const SWATCHES = ['colour', 'color'];

async function setUp() {
    const { bundle, settings } = await load();
    const model = toViewModel(bundle, settings);
    const [top, bra, leggings] = model.sections as [ViewSection, ViewSection, ViewSection];
    const builder = createBundleBuilder(bundle);
    const variant = (section: ViewSection, title: string) => section.products[0]!.variants.find((candidate) => candidate.title === title)!;
    const picked = (section: ViewSection) => pickedVariant(builder.getState().selections, section, section.products[0]!);
    /** What the card shows, given what was last pressed on it. */
    const shown = (section: ViewSection, pressed?: Record<string, string>) => shownValues(section.products[0]!.product, SWATCHES, picked(section), pressed);
    /** Press option values on a piece, as its card does: resolve them, then change the piece. */
    const press = (section: ViewSection, values: Record<string, string>) => changePiece(builder, section.id, picked(section), resolve(section.products[0]!.product, values).variant);
    return { builder, top, bra, leggings, variant, picked, shown, press };
}

describe('a piece that is not in the set', () => {
    it('shows what the shopper last chose on its card, and opens on a colour with no size', async () => {
        const { leggings, picked, shown, press } = await setUp();
        expect(picked(leggings)).toBeNull();
        expect(shown(leggings)).toEqual({ Colour: 'Onyx' });
        expect(press(leggings, { Size: 'M', Colour: 'Moss' })).toEqual({ kind: 'none' });
        expect(shown(leggings, { Size: 'M', Colour: 'Moss' })).toEqual({ Size: 'M', Colour: 'Moss' });
    });
});

describe('a piece in the set', () => {
    it('follows its choice: the set is swapped, and the card shows the variant the set holds', async () => {
        const { builder, leggings, variant, picked, shown, press } = await setUp();
        builder.addItem(leggings.id, variant(leggings, 'XS / Onyx').id, 1);
        expect(press(leggings, { Size: 'XS', Colour: 'Slate' })).toEqual({ kind: 'swapped', title: 'XS / Slate' });
        expect(picked(leggings)?.title).toBe('XS / Slate');
        expect(shown(leggings, { Size: 'XS', Colour: 'Slate' })).toEqual({ Size: 'XS', Colour: 'Slate' });
    });

    it('still shows what the set holds after a refused swap, whatever was pressed, and reports the reason', async () => {
        const { builder, leggings, variant, picked, shown, press } = await setUp();
        builder.addItem(leggings.id, variant(leggings, 'XS / Onyx').id, 1);

        // XS / Moss is sold out: the builder refuses it.
        expect(press(leggings, { Size: 'XS', Colour: 'Moss' })).toEqual({ kind: 'blocked', reason: 'sold-out' });
        expect(builder.getState().selections[leggings.id]).toEqual([{ variantId: variant(leggings, 'XS / Onyx').id, quantity: 1 }]);
        expect(picked(leggings)?.title).toBe('XS / Onyx');
        expect(shown(leggings, { Size: 'XS', Colour: 'Moss' })).toEqual({ Size: 'XS', Colour: 'Onyx' });
    });

    it('does the same for a product with no option data, whose choice is a variant', async () => {
        const { builder, leggings, variant, picked } = await setUp();
        const product = leggings.products[0]!.product;
        const held = variant(leggings, 'XS / Onyx');
        const soldOut = variant(leggings, 'XS / Moss');
        expect(shownVariant(product, null, undefined).id).toBe(product.variants[0]!.id);
        expect(shownVariant(product, null, soldOut.id)).toBe(soldOut);

        builder.addItem(leggings.id, held.id, 1);
        expect(changePiece(builder, leggings.id, picked(leggings), soldOut)).toEqual({ kind: 'blocked', reason: 'sold-out' });
        expect(shownVariant(product, picked(leggings), soldOut.id)).toBe(held);
    });

    it('changes nothing when the choice is the variant it already is, or is not complete', async () => {
        const { builder, leggings, variant, press } = await setUp();
        builder.addItem(leggings.id, variant(leggings, 'M / Onyx').id, 1);
        const before = builder.getState().selections;
        expect(press(leggings, { Size: 'M', Colour: 'Onyx' })).toEqual({ kind: 'none' });
        expect(press(leggings, { Colour: 'Bone' })).toEqual({ kind: 'none' });
        expect(builder.getState().selections).toEqual(before);
    });

    it('"Match colours" swaps every piece in one go, each found by the pick it held before the first swap', async () => {
        const { builder, top, bra, leggings, variant } = await setUp();
        for (const section of [top, bra, leggings]) builder.addItem(section.id, variant(section, 'M / Onyx').id, 1);

        // One handler, one selection read before any swap.
        const before = builder.getState().selections;
        for (const section of [top, bra, leggings]) {
            const held = pickedVariant(before, section, section.products[0]!);
            expect(changePiece(builder, section.id, held, variant(section, 'M / Bone'))).toEqual({ kind: 'swapped', title: 'M / Bone' });
        }
        expect([top, bra, leggings].map((section) => pickedVariant(builder.getState().selections, section, section.products[0]!)?.title)).toEqual(['M / Bone', 'M / Bone', 'M / Bone']);
    });
});
