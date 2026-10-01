import { createBundleBuilder } from '@kitenzo/core';
import { describe, expect, it } from 'vitest';

import { toViewModel } from '../src/model';
import { withRequiredVariantIds } from '../src/sdkFixes';
import { blockedReason, clampSeed, isSingleChoice, isStepFull, isStepMet, missingPicks, swapInStep, withoutStep } from '../src/selection';
import { load, withProduct } from './support';

async function setUp(change?: Parameters<typeof load>[0]) {
    const { bundle, settings } = await load(change);
    const model = toViewModel(withRequiredVariantIds(bundle), { settings });
    const [cleanse, treat, moisturise] = model.sections as [(typeof model.sections)[number], (typeof model.sections)[number], (typeof model.sections)[number]];
    const variant = (section: typeof cleanse, handle: string, title?: string) => {
        const product = section.products.find((entry) => entry.handle === handle)!;
        return title ? product.variants.find((entry) => entry.title === title)! : product.variants.find((entry) => entry.available)!;
    };
    return { model, cleanse, treat, moisturise, variant };
}

describe('blockedReason', () => {
    it('explains why one more cannot go in, sold out first', async () => {
        const { model, cleanse, treat, variant } = await setUp();
        const retinal = treat.products.find((product) => product.soldOut)!.variants[0]!;
        expect(blockedReason(model, {}, treat, retinal)).toBe('sold-out');
        expect(blockedReason(model, {}, cleanse, variant(cleanse, 'ceramide-oat-cream-cleanser', '75ml'))).toBe('sold-out');

        const gel = variant(cleanse, 'amino-acid-gentle-gel-cleanser');
        const one = { [cleanse.id]: [{ variantId: gel.id, quantity: 1 }] };
        expect(blockedReason(model, one, cleanse, variant(cleanse, 'pha-zinc-exfoliating-cleanser'))).toBe('step-full');
        // A swap is checked against the step without its pick, so the full step is no obstacle.
        expect(blockedReason(model, withoutStep(one, cleanse.id), cleanse, variant(cleanse, 'pha-zinc-exfoliating-cleanser'))).toBeNull();
    });

    it('stops at a stock ceiling', async () => {
        const { model, cleanse, variant } = await setUp((fixture) =>
            withProduct(fixture, 'amino-acid-gentle-gel-cleanser', (product) => ({ ...product, variants: product.variants.map((entry) => ({ ...entry, maxOrderableQuantity: 0 })) })),
        );
        expect(blockedReason(model, {}, cleanse, variant(cleanse, 'amino-acid-gentle-gel-cleanser'))).toBe('stock');
    });
});

describe('one-pick steps', () => {
    it('reads every routine step as a choice', async () => {
        const { model } = await setUp();
        expect(model.sections.every(isSingleChoice)).toBe(true);
    });

    it('swaps a pick through the builder, so the step never holds two', async () => {
        const { model, cleanse, variant } = await setUp();
        const builder = createBundleBuilder(model.bundle);
        const gel = variant(cleanse, 'amino-acid-gentle-gel-cleanser');
        const pha = variant(cleanse, 'pha-zinc-exfoliating-cleanser');
        swapInStep(builder, builder.getState().selections, cleanse.id, gel.id);
        swapInStep(builder, builder.getState().selections, cleanse.id, pha.id);
        expect(builder.getState().selections[cleanse.id]).toEqual([{ variantId: pha.id, quantity: 1 }]);
        // Swapping in what is already there changes nothing.
        swapInStep(builder, builder.getState().selections, cleanse.id, pha.id);
        expect(builder.getState().selections[cleanse.id]).toEqual([{ variantId: pha.id, quantity: 1 }]);
    });

    it('a size change is a swap between two variants of one product', async () => {
        const { model, moisturise, variant } = await setUp();
        const builder = createBundleBuilder(model.bundle);
        const small = variant(moisturise, 'hyaluronic-aloe-gel-cream', '30ml');
        const large = variant(moisturise, 'hyaluronic-aloe-gel-cream', '50ml');
        swapInStep(builder, {}, moisturise.id, small.id);
        swapInStep(builder, builder.getState().selections, moisturise.id, large.id);
        expect(builder.getState().selections[moisturise.id]).toEqual([{ variantId: large.id, quantity: 1 }]);
    });

    it('knows when a step is full (auto-advance) and when it is met (Continue)', async () => {
        const { cleanse } = await setUp();
        expect(isStepFull(cleanse, 0)).toBe(false);
        expect(isStepFull(cleanse, 1)).toBe(true);
        expect(isStepMet(cleanse, {})).toBe(false);
        expect(isStepMet(cleanse, { [cleanse.id]: [{ variantId: 'x', quantity: 1 }] })).toBe(true);
        const open = { ...cleanse, limits: { ...cleanse.limits, min: 2, max: Number.POSITIVE_INFINITY } };
        expect(isStepFull(open, 1)).toBe(false);
        expect(isStepFull(open, 2)).toBe(true);
    });
});

describe('missingPicks', () => {
    it('names each step that still needs its pick', async () => {
        const { model, cleanse, treat, moisturise, variant } = await setUp();
        const one = { [cleanse.id]: [{ variantId: variant(cleanse, 'amino-acid-gentle-gel-cleanser').id, quantity: 1 }] };
        expect(missingPicks(model, one)).toEqual([
            { section: treat, count: 1 },
            { section: moisturise, count: 1 },
        ]);
    });

    it('agrees with the SDK: no missing picks means the SDK will accept it', async () => {
        const { model, cleanse, treat, moisturise, variant } = await setUp();
        const builder = createBundleBuilder(model.bundle);
        builder.addItem(cleanse.id, variant(cleanse, 'amino-acid-gentle-gel-cleanser').id, 1);
        builder.addItem(treat.id, variant(treat, 'niacinamide-zinc-blemish-serum').id, 1);
        builder.addItem(moisturise.id, variant(moisturise, 'hyaluronic-aloe-gel-cream').id, 1);
        expect(missingPicks(model, builder.getState().selections)).toEqual([]);
        expect(builder.getState().isSatisfied).toBe(true);
    });
});

describe('clampSeed', () => {
    it('drops what the shopper could not pick by hand: sold out, a sold-out size, over a step maximum', async () => {
        const { model, cleanse, treat, variant } = await setUp();
        const retinal = treat.products.find((product) => product.soldOut)!.variants[0]!;
        const seed = {
            [cleanse.id]: [
                { variantId: variant(cleanse, 'ceramide-oat-cream-cleanser', '75ml').id, quantity: 1 }, // sold-out size
                { variantId: variant(cleanse, 'amino-acid-gentle-gel-cleanser').id, quantity: 3 }, // step max 1
                { variantId: variant(cleanse, 'pha-zinc-exfoliating-cleanser').id, quantity: 1 }, // no room left
                { variantId: 'gid-the-bundle-no-longer-offers', quantity: 1 },
            ],
            [treat.id]: [{ variantId: retinal.id, quantity: 1 }],
        };
        expect(clampSeed(model, seed)).toEqual({
            [cleanse.id]: [{ variantId: variant(cleanse, 'amino-acid-gentle-gel-cleanser').id, quantity: 1 }],
        });
    });
});
