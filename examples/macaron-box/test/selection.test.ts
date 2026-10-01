import { createBundleBuilder } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { toViewModel } from '../src/model';
import { withRequiredVariantIds } from '../src/sdkFixes';
import { blockedReason, clampSeed, fillCandidates, missingPicks } from '../src/selection';
import { load, withRequired } from './support';

async function setUp() {
    const { bundle, settings } = await load();
    const model = toViewModel(withRequiredVariantIds(bundle), { settings });
    const box = model.sections[0]!;
    const variant = (handle: string) => box.products.find((product) => product.handle === handle)!.variants[0]!;
    return { model, box, variant };
}

describe('blockedReason', () => {
    it('explains why one more cannot go in: sold out, then stock, then the chosen box, then the step', async () => {
        const { model, box, variant } = await setUp();
        expect(blockedReason(model, {}, box, variant('lavender-macaron'))).toBe('sold-out');

        const rose = variant('rose-macaron'); // stock 4 in the catalogue
        expect(blockedReason(model, { [box.id]: [{ variantId: rose.id, quantity: 3 }] }, box, rose)).toBeNull();
        expect(blockedReason(model, { [box.id]: [{ variantId: rose.id, quantity: 4 }] }, box, rose)).toBe('stock');

        const six = { [box.id]: [{ variantId: variant('vanilla-macaron').id, quantity: 6 }] };
        // A box of 6 holding 6 is full, though the step would take 24.
        expect(blockedReason(model, six, box, variant('lemon-macaron'), 6)).toBe('box-full');
        expect(blockedReason(model, six, box, variant('lemon-macaron'), 12)).toBeNull();
        expect(blockedReason(model, six, box, variant('lemon-macaron'))).toBeNull();

        const full = { [box.id]: [{ variantId: variant('vanilla-macaron').id, quantity: 24 }] };
        expect(blockedReason(model, full, box, variant('lemon-macaron'))).toBe('step-full');
    });
});

describe('missingPicks', () => {
    it('counts up to the smallest box', async () => {
        const { model, box, variant } = await setUp();
        expect(missingPicks(model, { [box.id]: [{ variantId: variant('vanilla-macaron').id, quantity: 1 }] })).toEqual([{ section: box, count: 5 }]);
    });

    it('is not the authority on alternatives: 7 is inside the window but no box, and only the SDK knows', async () => {
        const { model, box, variant } = await setUp();
        const builder = createBundleBuilder(model.bundle);
        builder.addItem(box.id, variant('vanilla-macaron').id, 6);
        expect(builder.getState().isSatisfied).toBe(true);
        builder.addItem(box.id, variant('lemon-macaron').id, 1);
        // Nothing "missing" by the window...
        expect(missingPicks(model, builder.getState().selections)).toEqual([]);
        // ...and still not a box. This is why the buy button gates on isSatisfied.
        expect(builder.getState().isSatisfied).toBe(false);
        builder.addItem(box.id, variant('lemon-macaron').id, 5);
        expect(builder.getState().isSatisfied).toBe(true);
    });
});

describe('a bundle-wide count with a required product', () => {
    it('counts the required product, as the SDK does: "exactly 7" with 1 required needs 6 picks', async () => {
        const { bundle, settings } = await load((fixture) => {
            const withToffee = withRequired(fixture, 'english-toffee');
            return { ...withToffee, bundle: { ...withToffee.bundle, limitRules: [{ operation: 'eq', sectionId: null, type: 'total-number-of-products', value: '7.00' }] } };
        });
        const model = toViewModel(withRequiredVariantIds(bundle), { settings });
        expect(model.requiredCount).toBe(1);
        const box = model.sections[0]!;
        const vanilla = box.products.find((product) => product.handle === 'vanilla-macaron')!.variants[0]!;
        const six = { [box.id]: [{ variantId: vanilla.id, quantity: 6 }] };
        expect(missingPicks(model, six)).toEqual([]);
        expect(blockedReason(model, six, box, box.products[1]!.variants[0]!)).toBe('bundle-full');

        const builder = createBundleBuilder(model.bundle);
        builder.addItem(box.id, vanilla.id, 6);
        expect(builder.getState().isSatisfied).toBe(true);
    });
});

describe('clampSeed', () => {
    it('drops what the shopper could not pick by hand: sold out, over stock, over the step maximum', async () => {
        const { model, box, variant } = await setUp();
        const seed = {
            [box.id]: [
                { variantId: variant('rose-macaron').id, quantity: 5 }, // stock 4
                { variantId: variant('vanilla-macaron').id, quantity: 30 }, // step max 24
                { variantId: variant('lavender-macaron').id, quantity: 1 }, // sold out
                { variantId: 'gid-the-bundle-no-longer-offers', quantity: 1 },
            ],
        };
        expect(clampSeed(model, seed)).toEqual({
            [box.id]: [
                { variantId: variant('rose-macaron').id, quantity: 4 },
                { variantId: variant('vanilla-macaron').id, quantity: 20 },
            ],
        });
    });
});

describe('fillCandidates', () => {
    it('gives sold-out and capped flavours no room, and counts what is already in the box', async () => {
        const { box, variant } = await setUp();
        const selections = {
            [box.id]: [
                { variantId: variant('rose-macaron').id, quantity: 4 },
                { variantId: variant('vanilla-macaron').id, quantity: 2 },
            ],
        };
        const candidates = fillCandidates(box, selections);
        const of = (handle: string) => candidates.find((candidate) => candidate.variantId === variant(handle).id);
        expect(of('lavender-macaron')).toBeUndefined();
        expect(of('rose-macaron')).toEqual({ variantId: variant('rose-macaron').id, inBox: 4, room: 0 });
        expect(of('vanilla-macaron')).toEqual({ variantId: variant('vanilla-macaron').id, inBox: 2, room: Number.POSITIVE_INFINITY });
        expect(candidates).toHaveLength(9);
    });

    it('leaves out a product the conditions engine hides', async () => {
        const { box } = await setUp();
        const lemon = box.products.find((product) => product.handle === 'lemon-macaron')!;
        expect(fillCandidates(box, {}, [lemon.id]).some((candidate) => candidate.variantId === lemon.variants[0]!.id)).toBe(false);
    });
});
