import { createBundleBuilder } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { toViewModel, type ViewSection } from '../src/model';
import { withRequiredVariantIds } from '../src/sdkFixes';
import { blockedReason, clampSeed, missingPicks, pickOf, swapBlocked } from '../src/selection';
import { CATALOG_DEFS } from '../dev/catalog';
import { defineCatalog, type StoreProduct } from '../dev/mock/catalog';
import snapshot from '../dev/mock/demo-store.json' with { type: 'json' };
import { load } from './support';

async function setUp() {
    const { bundle, settings } = await load();
    const model = toViewModel(withRequiredVariantIds(bundle), { settings });
    const [top, bra, leggings] = model.sections as [ViewSection, ViewSection, ViewSection];
    const variant = (section: ViewSection, title: string) => section.products[0]!.variants.find((candidate) => candidate.title === title)!;
    return { model, top, bra, leggings, variant };
}

describe('blockedReason', () => {
    it('explains why a piece cannot go in, sold out first', async () => {
        const { model, top, leggings, variant } = await setUp();
        expect(blockedReason(model, {}, leggings, variant(leggings, 'XS / Moss'))).toBe('sold-out');
        expect(blockedReason(model, {}, leggings, variant(leggings, 'XS / Onyx'))).toBeNull();
        // One per step: the step is full once it has its piece.
        const chosen = { [top.id]: [{ variantId: variant(top, 'M / Onyx').id, quantity: 1 }] };
        expect(blockedReason(model, chosen, top, variant(top, 'M / Moss'))).toBe('step-full');
    });
});

describe('swapBlocked', () => {
    it('lets the piece in a full step be swapped for another colour or size, but never for a sold-out one', async () => {
        const { model, leggings, variant } = await setUp();
        const from = variant(leggings, 'XS / Onyx');
        const chosen = { [leggings.id]: [{ variantId: from.id, quantity: 1 }] };
        expect(swapBlocked(model, chosen, leggings, from.id, variant(leggings, 'XS / Slate'))).toBeNull();
        expect(swapBlocked(model, chosen, leggings, from.id, variant(leggings, 'XS / Moss'))).toBe('sold-out');
    });
});

describe('pickOf', () => {
    it('finds the piece a step holds, in whichever variant', async () => {
        const { top, bra, variant } = await setUp();
        const chosen = { [top.id]: [{ variantId: variant(top, 'L / Bone').id, quantity: 1 }] };
        expect(pickOf(chosen, top.id, top.products[0]!)?.variantId).toBe(variant(top, 'L / Bone').id);
        expect(pickOf(chosen, bra.id, bra.products[0]!)).toBeNull();
    });
});

describe('missingPicks', () => {
    it('names every step still without its piece', async () => {
        const { model, top, bra, leggings, variant } = await setUp();
        const one = { [top.id]: [{ variantId: variant(top, 'M / Onyx').id, quantity: 1 }] };
        expect(missingPicks(model, one).map((entry) => entry.section?.name)).toEqual([bra.name, leggings.name]);
    });

    it('agrees with the SDK: no missing picks means the SDK will accept it', async () => {
        const { model, top, bra, leggings, variant } = await setUp();
        const builder = createBundleBuilder(model.bundle);
        builder.addItem(top.id, variant(top, 'M / Onyx').id, 1);
        builder.addItem(bra.id, variant(bra, 'M / Onyx').id, 1);
        expect(builder.getState().isSatisfied).toBe(false);
        builder.addItem(leggings.id, variant(leggings, 'M / Slate').id, 1);
        expect(missingPicks(model, builder.getState().selections)).toEqual([]);
        expect(builder.getState().isSatisfied).toBe(true);
    });
});

describe('clampSeed', () => {
    it('drops what the shopper could not pick by hand: sold out, over a step maximum, no longer offered', async () => {
        const { model, top, bra, leggings, variant } = await setUp();
        const seed = {
            [top.id]: [
                { variantId: variant(top, 'M / Onyx').id, quantity: 3 }, // one per step
                { variantId: variant(top, 'S / Onyx').id, quantity: 1 }, // the step is already full
            ],
            [bra.id]: [{ variantId: variant(bra, 'L / Bone').id, quantity: 1 }], // sold out
            [leggings.id]: [{ variantId: 'gid-the-bundle-no-longer-offers', quantity: 1 }],
        };
        expect(clampSeed(model, seed)).toEqual({ [top.id]: [{ variantId: variant(top, 'M / Onyx').id, quantity: 1 }] });
    });
});

describe('a bundle-wide count with a required product', () => {
    it('counts the required product, as the SDK does: "exactly 3" with the leggings required needs 2 picks', async () => {
        const { bundle, settings } = await load(() =>
            defineCatalog(
                {
                    ...CATALOG_DEFS[0]!,
                    sections: CATALOG_DEFS[0]!.sections.slice(0, 2).map((section) => ({ ...section, rules: [] })),
                    rules: [{ operation: 'eq', value: 3 }],
                    required: [{ handle: 'power-leggings' }],
                },
                snapshot as unknown as StoreProduct[],
            ),
        );
        const model = toViewModel(withRequiredVariantIds(bundle), { settings });
        expect(model.requiredCount).toBe(1);
        const [top, bra] = model.sections as [ViewSection, ViewSection];
        const two = {
            [top.id]: [{ variantId: top.products[0]!.variants[0]!.id, quantity: 1 }],
            [bra.id]: [{ variantId: bra.products[0]!.variants[0]!.id, quantity: 1 }],
        };
        expect(missingPicks(model, two)).toEqual([]);
        expect(blockedReason(model, two, top, top.products[0]!.variants[1]!)).toBe('bundle-full');

        const builder = createBundleBuilder(model.bundle);
        builder.addItem(top.id, top.products[0]!.variants[0]!.id, 1);
        builder.addItem(bra.id, bra.products[0]!.variants[0]!.id, 1);
        expect(builder.getState().isSatisfied).toBe(true);
    });
});
